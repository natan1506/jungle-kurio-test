# Arquitetura — Kurio v1

## Visão geral

```
UI (pages, features)  ──hooks──▶  TanStack Query  ──▶  api/endpoints (Axios)  ──HTTP──▶  MSW handlers ──▶ mocks/db
        ▲                              ▲                                                       │
        │                              └──── setQueryData / invalidate ◀── RealtimeClient ◀────┘ Socket.IO (MSW ws + binding)
        └── TanStack Router (rotas, search params validados com Zod, guards de autenticação)
```

- **Contratos tipados** em `src/api/types.ts`, compartilhados entre cliente, UI e mocks (os mocks importam os mesmos tipos, então um contrato quebrado não compila).
- **Transporte**: toda chamada REST passa por `src/api/http.ts` (Axios). Interceptors anexam `Authorization` ou `X-Cart-Id`, normalizam erros em `ApiError` (`status`, `code`, `fieldErrors`, `details`) e encerram a sessão em 401.
- **Estado remoto**: TanStack Query em hooks por domínio (`src/features/*/hooks.ts`). Componentes não chamam Axios diretamente.
- **Estado de URL**: busca, filtros, aba, ordenação, paginação e "favoritos" ficam na URL (`validateSearch` + Zod em `features/catalog/search.ts`). Refresh e histórico restauram a tela.
- **Inicialização**: o React renderiza imediatamente (app shell → skeletons). Toda requisição Axios e a conexão do socket aguardam a barreira `mocksReady` (`src/lib/mocks-ready.ts`), liberada quando o service worker do MSW está ativo. Assim nada escapa dos mocks e a primeira pintura não espera o MSW.
- **Mocks** (`src/mocks`): MSW intercepta REST e WebSocket. Nenhum componente, hook ou cliente Axios tem resposta fictícia ou caminho alternativo de negócio.

## Contratos REST

Base `VITE_API_URL` (padrão `/api`). Erros sempre como `{ error: { code, message, fieldErrors?, details? } }`.

| Método e rota | Auth | Descrição | Erros relevantes |
| --- | --- | --- | --- |
| `POST /auth/register` | — | `{ username, email, password }` → `Session` (201) | 422 `VALIDATION_ERROR`, 409 `EMAIL_TAKEN` / `USERNAME_TAKEN` |
| `POST /auth/login` | — | `{ email, password }` → `Session` | 422, 401 `INVALID_CREDENTIALS` |
| `GET /auth/session` | ✓ | Sessão atual | 401 `SESSION_EXPIRED` / `UNAUTHENTICATED` |
| `POST /auth/logout` | ✓ | Revoga o token (204) | — |
| `GET /nfts` | — | `q, categories, networks, priceMin, priceMax, tab, sort, page, pageSize, favorites` → `NftListResponse` (itens, paginação, facetas, faixa de preço) | 401 se `favorites=1` sem sessão |
| `GET /nfts/featured` | — | Destaques do hero e "NFT em destaque" | — |
| `GET /nfts/:id` | — | `Nft` com edições | 404 `NOT_FOUND` |
| `GET /me/favorites` · `PUT/DELETE /me/favorites/:id` | ✓ | `{ nftIds }` | 404 |
| `GET /cart` | ✓ ou `X-Cart-Id` | `Cart` com preços atuais, avisos e resumo | 403 `FORBIDDEN` (carrinho de outro dono) |
| `POST /cart/items` | ✓ ou guest | `{ nftId, editionId, quantity }` | 409 `EDITION_UNAVAILABLE` / `INSUFFICIENT_AVAILABILITY` |
| `PATCH /cart/items/:id` · `DELETE /cart/items/:id` | ✓ ou guest | Altera quantidade / remove | 409, 404 |
| `POST /cart/ack` | ✓ ou guest | Reconhece avisos de preço/quantidade | — |
| `PUT /cart/coupon` · `DELETE /cart/coupon` | ✓ ou guest | Aplica/remove cupom | 422 `COUPON_INVALID` / `COUPON_EXPIRED` |
| `POST /cart/merge` | ✓ | `{ guestCartId }` mescla o carrinho do visitante | — |
| `POST /checkout/quote` | ✓ | `{ network }` → `Quote` (linhas, cupom, subtotal, desconto, taxa, total, expiração 10 min) | 422 |
| `POST /orders` | ✓ + `Idempotency-Key` | `{ quoteId, walletId, network, buyer }` → `Order` (201 novo, 200 repetido) | 400 sem chave, 409 `IDEMPOTENCY_CONFLICT`, 409 `QUOTE_STALE` (`details: { quote, changes }`), 422 |
| `GET /orders?status=` · `GET /orders/:id` | ✓ | Estado e recibo (snapshot) | 403 de outro usuário, 404 |
| `GET/PATCH /me/profile` | ✓ | Dados do perfil | 422 com `fieldErrors` (inclui conflito de usuário/e-mail) |
| `PUT/DELETE /me/avatar` | ✓ | `{ dataUrl }` PNG/JPG/WEBP/GIF ≤ 1 MB | 422 |
| `POST /me/password` | ✓ | `{ currentPassword, newPassword }` (204) | 422 |
| `GET/POST /me/wallets` · `PUT /me/wallets/:id` | ✓ | Carteiras principal e secundária | 409 `CONFLICT` (slot ou endereço duplicado), 422 |
| `POST /me/wallets/:id/connect` | ✓ | Simula a aprovação na extensão da carteira | 403 `WALLET_REJECTED` |

Falhas transitórias (rede, timeout, 5xx/503 `SERVICE_UNAVAILABLE`) são simuladas pelos cenários e pela fila de faults.

**Valores**: ETH trafega como string decimal; os cálculos usam `big.js` (cliente e mocks) com arredondamento half-even em 6 casas. Quantidades são inteiras. O total final vem sempre da API (`summary`), nunca é recalculado pela UI.

### Controle da simulação (`/api/__mock/*`)

`GET state`, `POST scenario`, `POST reset`, `POST faults` (`{ method, path, status, code, times, networkError, delayMs }`; `status < 400` apenas atrasa), `POST nfts/:id` (preço/disponibilidade + evento), `POST events/replay`, `POST events/stale/:id`, `POST socket/drop` (`{ offlineMs }`), `POST session/expire`, `POST orders/:id/resolve`. São usados pelo painel de mocks e pelos testes e passam pela mesma camada MSW.

## Eventos em tempo real

Transporte: `socket.io-client` conectando em `VITE_REALTIME_URL` com `transports: ['websocket']`. No ambiente de mocks, `ws.link` do MSW intercepta o WebSocket e o `@mswjs/socket.io-binding` codifica/decodifica o protocolo Engine.IO/Socket.IO. O cliente envia o token no pacote CONNECT (`auth`); o servidor simulado associa a conexão ao usuário.

Envelope comum:

```ts
{ eventId: string, type, resource: { type, id }, version: number, occurredAt: string, data }
```

| Evento | Escopo | `data` | Efeito no cliente |
| --- | --- | --- | --- |
| `nft.updated` | broadcast | `priceEth`, `previousPriceEth`, `available`, `editions[]` | Atualiza detalhe e listas no cache; invalida o carrinho (resumo recalculado pela API); anuncia via toast/aria-live; marca a cotação aberta como desatualizada |
| `order.updated` | só o dono | `status`, `txHash`, `declineReason` | Atualiza o pedido em cache, refaz o GET do recibo, invalida pendências e carrinho |

**Ordenação e duplicatas** (`src/realtime/realtime.ts`): o cliente guarda os `eventId` já vistos (LRU de 500) e a última versão conhecida por recurso (inclusive versões vindas do REST). Eventos repetidos ou com `version ≤ conhecida` são descartados, então um evento antigo não regride preço nem reaplica efeitos.

**Reconexão**: o banner "Reconectando…" aparece enquanto o socket está fora; ao reconectar, todas as queries ativas são invalidadas (reconciliação REST). Pedidos pendentes também fazem polling a cada 5 s enquanto pendentes, como fallback.

**Sessão**: ao trocar de usuário ou sair, o socket é desconectado e reconectado com o novo token, as versões de pedidos são descartadas e eventos `order.updated` de outra sessão são ignorados (o servidor só entrega ao dono e o cliente confere o usuário atual). Listeners são removidos no `stop()` do provider.

**Limitações do transporte simulado**: o binding não implementa namespaces, rooms nem ack; o handshake é sintético (`sid: "test"`), e o servidor simulado envia pings a cada 20 s para manter o Engine.IO vivo. Os eventos existem só na aba que gerou a mudança: duas abas têm instâncias separadas do MSW (o estado é compartilhado via localStorage após refresh, mas não há broadcast entre abas). O `socket.io-client` precisa ser importado depois do `worker.start()`, porque o engine.io captura o construtor global de `WebSocket` no import. Por isso o `RealtimeClient` só importa o socket depois da barreira `mocksReady`.

## Política de sessão

- `POST /auth/login|register` devolve token opaco + `expiresAt` (30 min; 20 s no cenário `session-expired`). Persistido em `localStorage` (`kurio.session`) com dados públicos do usuário. Nenhuma senha é guardada no cliente; no mock só existe o hash SHA-256 com salt.
- Ao carregar, e no instante de expiração, o app revalida com `GET /auth/session`.
- Qualquer 401 encerra a sessão local. Em rota privada, o app redireciona para `/entrar?redirect=<rota>&reason=expired`; após o login volta ao mesmo ponto. O formulário do checkout é salvo em `sessionStorage` (por usuário) e restaurado.
- Logout e troca de usuário removem do cache **todas** as queries cujo key contém o id anterior (`['user', id, …]`, inclusive a lista de favoritos), reconectam o socket e limpam versões de pedidos. O logout é imediato no cliente, e a revogação na API é best-effort.
- Rotas privadas (`/checkout`, `/pedidos/:id`, `/conta/*`) usam `beforeLoad` do TanStack Router.

## Estado do carrinho

- O carrinho é **sempre** do servidor. O visitante tem um carrinho anônimo identificado por `X-Cart-Id` (`guest_<uuid>` no localStorage), o que mantém um só caminho de código e sobrevive a refresh.
- No login/cadastro, `POST /cart/merge` mescla os itens do visitante **antes** de publicar a sessão (sem estado intermediário na UI). O id de visitante é rotacionado depois.
- A API aplica a disponibilidade: limite = `min(disponível, máximo por pedido)`. Se a disponibilidade cair, a quantidade é ajustada e o item recebe avisos (`price_changed`, `quantity_reduced`, `sold_out`) até o usuário clicar "Entendi" (`POST /cart/ack`). Itens esgotados bloqueiam o checkout.
- A alteração de quantidade é **otimista com rollback**. O favoritar também é otimista.
- Após um pedido confirmado, a API remove do carrinho apenas as quantidades compradas. Em falha ou recusa nada é removido.

## Checkout, cotação e idempotência

1. O formulário é pré-preenchido pela carteira escolhida e validado no cliente; a API valida de novo.
2. "Conectar" simula a aprovação na carteira (recusa no cenário `wallet-reject`, desconexão manual).
3. "Revisar" gera uma **cotação** (`POST /checkout/quote`). O diálogo de revisão mostra linhas, cupom, taxa da rede escolhida e total.
4. Um `nft.updated` que afete a cotação a marca como desatualizada: "Confirmar" vira "Atualizar cotação" e a diferença é exibida. O usuário precisa confirmar de novo.
5. `POST /orders` revalida preço, disponibilidade, cupom e taxas contra uma cotação nova; se algo mudou, responde `409 QUOTE_STALE` com a nova cotação e a lista de mudanças.
6. A **chave de idempotência** é gerada por tentativa (cotação + carteira + rede) e salva em `sessionStorage`. Clique repetido (botão desabilitado + mesma chave), timeout e refresh reutilizam a mesma chave; a API devolve o mesmo pedido. A mesma chave com conteúdo diferente gera `409 IDEMPOTENCY_CONFLICT`.
7. O pedido nasce `pending`; o servidor simulado o resolve (`confirmed`/`declined`) e emite `order.updated`. A tela do pedido mostra pendente, recusado ou o recibo, que só aparece para `confirmed`. Estados terminais não mudam mais. O recibo é um **snapshot** das linhas e do resumo da cotação; alterações posteriores no catálogo não o afetam.

## Estratégia de cache

| Dado | Key | staleTime | Observações |
| --- | --- | --- | --- |
| Catálogo | `['catalog','list', params]` | 30 s | `keepPreviousData`; `AbortSignal` cancela requisições obsoletas, e cada resposta vai para a key dos seus parâmetros (respostas fora de ordem não sobrescrevem a atual) |
| Destaques | `['catalog','featured']` | 60 s | |
| Detalhe | `['nft', id]` | 15 s | Atualizado in-place por `nft.updated` |
| Carrinho | `['user', id, 'cart']` / `['cart', guestId]` | 0 | Mutations gravam a resposta da API no cache |
| Favoritos, perfil, carteiras, pedidos | `['user', id, …]` | 30 s | Removidos no logout/troca |

Retries: queries repetem até 2× apenas falhas transitórias (rede, timeout, 5xx, 429) com backoff exponencial; 4xx nunca. Mutations não repetem automaticamente; a criação de pedido tem retry manual com a mesma chave de idempotência. `refetchOnWindowFocus` ativo.

## Mocks (MSW)

- `mocks/db.ts`: estado único e consistente (catálogo, usuários, sessões, carrinhos, cotações, pedidos, idempotência), persistido em `localStorage` (`kurio.mock.db`) para sustentar refresh. `reset` restaura o seed integral.
- `mocks/fixtures.ts`: 60 NFTs determinísticos (PRNG com seed fixo; os 8 primeiros reproduzem o Figma), 9 categorias, 3 redes, 4 edições por NFT (algumas esgotadas), 2 usuários, carteiras e cupons.
- `mocks/http.ts`: aplica o cenário (latência fixa/variável determinística, offline, 500, 503 transitório) e a fila de faults injetadas pelos testes.
- Mudanças nos dados (`updateNft`, liquidação de pedidos) persistem **e** emitem o evento correspondente, então REST e Socket.IO ficam coerentes.
- Os mocks são ativados por configuração (`VITE_ENABLE_MOCKS`) e entram no build de demonstração como chunk separado, carregado antes do app.

## Acessibilidade

- Link "Pular para o conteúdo", foco visível global, navegação por teclado em todos os controles.
- Diálogos e drawers (Radix) prendem o foco e o devolvem ao gatilho. Escape fecha.
- `FormField` associa label, dica e erro (`aria-invalid`, `aria-describedby`, `role="alert"`); obrigatoriedade via `aria-required` (o `*` é decorativo).
- Feedback de mutations e de eventos em tempo real via toasts (Sonner, `aria-live`) e regiões `aria-live` próprias (contagem de resultados, total do carrinho, preço do detalhe, status do pedido e da conexão da carteira).
- Estados não dependem só de cor: edição esgotada é riscada e tem o texto "(esgotada)", páginas têm `aria-current`, favoritos usam `aria-pressed`.
- Itens fora do escopo (Criadores, Aprenda, Ajuda, login social, recuperação de senha, newsletter, Ler mais) aparecem como no Figma, mas com `aria-disabled` e aviso "Em breve", sem aparentar sucesso.
- `prefers-reduced-motion` desliga shimmer, animações e scroll suave.

## Decisões de UX e desvios do Figma

- **Assets**: o arquivo do Figma tem 4 ilustrações (Emerald Ape, Sage Nomad, Ivory Baron, Golden Beat). Os originais (1254×1254 PNG) estão em `assets/figma/` e foram convertidos para AVIF/WebP em 320/640/960 px. Os 60 NFTs reutilizam essas 4 artes. A galeria do detalhe mostra recortes da mesma arte, como o Figma (que repete a imagem nas miniaturas).
- **Fonte**: Roboto Mono (a mesma do Figma), self-hosted via `@fontsource-variable`.
- **Login/Cadastro**: modal sobre a home (desktop, como no Figma) e tela cheia no mobile.
- **Edições**: o Figma mostra `1/10 1/10 1/50 ABERTA`; usamos `1/10 · 1/25 · 1/50 · ABERTA` para distinguir as edições. Cada edição tem preço, estoque e limite por pedido.
- **Checkout**: adicionamos o diálogo "Revise seu pedido" (exigido pelo enunciado) e o painel de conexão da carteira; as carteiras cadastradas aparecem como opções em "Carteira e rede" (combinação dos frames desktop e mobile).
- **Mobile** (frames do Figma): sem cabeçalho com logo. A home abre com busca + botão de filtros (drawer) e hero em card compacto ("Seja dono da cultura digital"). Detalhe, carrinho, pagamento e conta têm barra superior com voltar + título. A barra inferior flutuante tem Início, Favoritos, botão central elevado "Explorar", Carrinho e Perfil. O pagamento mobile é centrado na carteira ("Carteira conectada", "Trocar carteira", "Carteira e rede"). Os dados do colecionador vêm pré-preenchidos da carteira e ficam recolhidos em "Revisar dados"; abrem sozinhos se houver erro de validação.
- **Selo dos cards**: "Raro", como no frame mobile.
- **Botão "Mocks"**: ferramenta de demonstração que não está no Figma. No mobile vira um ícone discreto na borda direita, para não cobrir ações. Pode ser ocultado com `localStorage["kurio.mock.hidePanel"] = "1"`, como fazem os testes.
- **Etherscan**: o link usa o hash simulado (não existe na rede real); está identificado como referência simulada.

## Performance e Lighthouse

Última execução (`npm run build && npm run lighthouse`): mediana de 3 medições por página e perfil, com Chrome novo a cada medição, build de produção servido por `vite preview` e mocks no cenário `default`. Lighthouse 13.5.0, Node v24.22.0, Darwin 25.6.0 x64, Intel(R) Core(TM) i9-9880H CPU @ 2.30GHz. Detalhes em `lighthouse/reports/`.

| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| inicio | mobile | 77 ⚠️ | 97 | 100 | 100 | 4174 ms | 0 | 295 ms |
| inicio | desktop | 99 | 97 | 100 | 100 | 862 ms | 0 | 11 ms |
| detalhe | mobile | 81 ⚠️ | 100 | 100 | 100 | 3785 ms | 0.007 | 277 ms |
| detalhe | desktop | 100 | 100 | 100 | 100 | 817 ms | 0.003 | 0 ms |

Metas: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90. Todas são atingidas, **exceto Performance no perfil mobile** (≈ 77–81). O desktop fica em 99–100.

### Evolução das otimizações (mobile)

| Etapa | Início | Detalhe |
| --- | ---: | ---: |
| v1 (MSW no caminho crítico, sem code-splitting) | 77 | 79 |
| Code-splitting por rota, socket.io sob demanda, preload do hero, `main` com altura mínima (CLS do detalhe 0,158 → ~0) | 77 | 79 |
| Shim de `tldts`: chunk de mocks de 164 kB → 52 kB gzip | 79 | 84 |
| Render antes do MSW (rede bloqueada até `mocksReady`) + app shell estático no HTML: FCP 3,2 s → 2.3 s | 78 | 79 |

As medições variam ±3 pontos entre execuções no mesmo ambiente.

### Por que o mobile fica abaixo de 90

O perfil mobile simula CPU 4× mais lenta e 4G lento. O LCP (~3,9–4,2 s) é a arte do hero/detalhe, e ela só existe depois desta cadeia:
1. Baixar e avaliar React, roteador e app (~150 kB gzip; a avaliação de script é o maior item do main thread, junto com o TBT de ~200–300 ms).
2. Carregar o chunk do MSW e registrar o service worker. Nenhuma requisição pode escapar dos mocks.
3. `GET /nfts/featured` (ou `/nfts/:id`), render e decodificação da imagem.

A imagem em si é leve (AVIF ~16 kB, com preload no HTML); o gargalo é a renderização exclusivamente no cliente, com o conteúdo do LCP dependente de dados. Com backend real (`VITE_ENABLE_MOCKS=false`) o passo 2 some. Não aplicamos atalhos só para a auditoria: o hero continua vindo da API e os mocks seguem ativos, como pede o enunciado.

### O que já está aplicado

- Code-splitting por rota (`lazyRouteComponent`).
- `socket.io-client` carregado sob demanda, depois do MSW.
- Chunk de mocks avaliado após a primeira pintura, com a rede bloqueada por `mocksReady`.
- Shim de `tldts` (`src/mocks/shims/tldts.ts`). O `tough-cookie` do MSW só usa `getDomain`, e o app não usa cookies.
- App shell estático no `index.html`.
- Preload da arte do hero; imagens AVIF/WebP responsivas com `width/height` e `fetchpriority=high` no LCP.
- Fonte variável self-hosted.
- Skeletons com as dimensões finais; cache imutável de assets no deploy.

### Próximo passo para chegar a ≥ 90 no mobile

Pré-renderizar (SSG/SSR) o HTML das rotas públicas com os dados do hero/detalhe, por exemplo com TanStack Start ou prerender no build. Assim o LCP deixa de depender da execução do JS e da inicialização dos mocks.

## Limitações conhecidas (v1)

- Sem backend real nem blockchain: carteiras, conexão e transações são simuladas.
- Eventos em tempo real não são compartilhados entre abas (instâncias MSW independentes).
- Avaliações de colecionadores, atividade, ofertas, downloads, suporte e conteúdo editorial estão fora do escopo (apenas visuais, com aviso "Em breve").
- Performance mobile (~77–81) abaixo da meta por ser renderização só no cliente com LCP dependente de dados (ver Performance).
