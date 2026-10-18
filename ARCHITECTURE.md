# Arquitetura

## Visão geral

```
pages/features ─ hooks ─> TanStack Query ─> api/endpoints (Axios) ─> MSW handlers ─> mocks/db
                               ^                                          |
                               └── setQueryData/invalidate <── RealtimeClient <── Socket.IO (MSW ws)
```

- `src/api/types.ts` tem os contratos, usados pelo cliente e pelos mocks. Se um lado muda, o outro não compila.
- Toda chamada REST passa por `src/api/http.ts`. Os interceptors:
  - adicionam `Authorization` ou `X-Cart-Id`;
  - normalizam o erro em `ApiError` (`status`, `code`, `fieldErrors`, `details`);
  - encerram a sessão em 401.
- Cada domínio tem seus hooks de Query em `src/features/*/hooks.ts`. Componente não chama Axios.
- Busca, filtros, aba, ordenação, página e "favoritos" ficam na URL, validados com Zod, então refresh e voltar funcionam.
- O app renderiza antes do MSW subir. Requisições e o socket esperam `mocksReady` (`src/lib/mocks-ready.ts`), então nada escapa dos mocks.
- Nenhum componente, hook ou cliente tem dado fake: tudo vem de `src/mocks`, na camada de rede.

## Contratos REST

Base `/api`. Os erros vêm sempre como `{ error: { code, message, fieldErrors?, details? } }`.

| Rota | Auth | Retorno | Erros |
| --- | --- | --- | --- |
| `POST /auth/register` | – | `Session` | 422, 409 `EMAIL_TAKEN`/`USERNAME_TAKEN` |
| `POST /auth/login` | – | `Session` | 422, 401 `INVALID_CREDENTIALS` |
| `GET /auth/session` · `POST /auth/logout` | sim | sessão atual / 204 | 401 `SESSION_EXPIRED`/`UNAUTHENTICATED` |
| `GET /nfts` | – | lista paginada + facetas + faixa de preço (`q, categories, networks, priceMin, priceMax, tab, sort, page, pageSize, favorites`) | 401 com `favorites=1` sem login |
| `GET /nfts/featured` · `GET /nfts/:id` | – | destaques / NFT com edições | 404 |
| `GET /me/favorites` · `PUT/DELETE /me/favorites/:id` | sim | `{ nftIds }` | 404 |
| `GET /cart` | sim ou `X-Cart-Id` | carrinho com preço atual, avisos e resumo | 403 (carrinho de outro dono) |
| `POST /cart/items` · `PATCH/DELETE /cart/items/:id` | idem | carrinho | 409 `EDITION_UNAVAILABLE`/`INSUFFICIENT_AVAILABILITY` |
| `PUT/DELETE /cart/coupon` · `POST /cart/ack` · `POST /cart/merge` | idem | carrinho | 422 `COUPON_INVALID`/`COUPON_EXPIRED` |
| `POST /checkout/quote` | sim | cotação: linhas, cupom, subtotal, desconto, taxa, total; vale 10 min | 422 |
| `POST /orders` | sim + `Idempotency-Key` | pedido (201 novo, 200 repetido) | 409 `QUOTE_STALE` (com nova cotação), 409 `IDEMPOTENCY_CONFLICT`, 422 |
| `GET /orders?status=` · `GET /orders/:id` | sim | estado e recibo | 403, 404 |
| `GET/PATCH /me/profile` · `PUT/DELETE /me/avatar` · `POST /me/password` | sim | perfil | 422 com `fieldErrors` |
| `GET/POST /me/wallets` · `PUT /me/wallets/:id` · `POST .../connect` | sim | carteiras | 409 `CONFLICT`, 422, 403 `WALLET_REJECTED` |

Falha transitória (rede, timeout, 5xx/503) vem dos cenários. Valores em ETH trafegam como string e são calculados com `big.js`, sem float. O total exibido é sempre o da API.

As rotas `/api/__mock/*` (cenário, reset, faults, alterar NFT, repetir evento, evento antigo, derrubar socket, expirar sessão, resolver pedido) são usadas pelo painel e pelos testes e passam pelo MSW como qualquer outra.

## Eventos (Socket.IO)

O `socket.io-client` conecta em `VITE_REALTIME_URL` só por websocket e manda o token no CONNECT. No ambiente de mocks, o `ws.link` do MSW intercepta a conexão e o `@mswjs/socket.io-binding` cuida do protocolo.

Todo evento tem `{ eventId, type, resource: { type, id }, version, occurredAt, data }`.

| Evento | Para quem | Efeito |
| --- | --- | --- |
| `nft.updated` | todos | atualiza detalhe e listas no cache, refaz o carrinho, avisa por toast/aria-live e invalida a cotação aberta |
| `order.updated` | dono do pedido | atualiza o pedido e busca o recibo; se confirmado, refaz o carrinho |

- **Duplicados e antigos:** o cliente guarda os `eventId` já vistos e a última versão de cada recurso (também a que veio do REST). Evento repetido ou com versão menor ou igual é ignorado.
- **Reconexão:** aparece o aviso "Reconectando…". Ao voltar, as queries ativas são refeitas via REST. Pedido pendente também faz polling a cada 5 s, por segurança.
- **Troca de usuário:** o socket reconecta com o novo token e as versões de pedidos são descartadas. O servidor só manda `order.updated` para o dono, e o cliente confere o usuário de novo.
- **Limitações do mock:** sem namespaces, rooms ou ack; o handshake é fixo e o servidor manda ping a cada 20 s. Cada aba tem seu próprio MSW, então eventos não cruzam abas. O `socket.io-client` precisa ser importado depois do MSW, porque o engine.io guarda o `WebSocket` global no import.

## Sessão

- Login e cadastro devolvem um token opaco e `expiresAt` (30 min, ou 20 s no cenário `session-expired`). O token fica no `localStorage`; a senha nunca é guardada.
- O `localStorage` foi escolhido porque não há backend real que emita cookie. Num backend de verdade, o certo seria um cookie `httpOnly` + `Secure` + `SameSite`, que o JS não lê e fica protegido de XSS; o Axios passaria a usar `withCredentials` e o `Authorization` sairia do interceptor. Hoje a exposição é limitada: o token é opaco, expira em 30 min e o logout o revoga.
- O app revalida a sessão ao abrir e na hora em que ela expira.
- Um 401 encerra a sessão. Em rota privada, o app vai para `/entrar?redirect=...&reason=expired` e volta depois do login. O rascunho do checkout fica no `sessionStorage`.
- Logout e troca de usuário apagam do cache tudo que tem o id do usuário anterior e reconectam o socket.
- `/checkout`, `/pedidos/:id` e `/conta/*` são protegidas por `beforeLoad`.

## Carrinho

- O carrinho sempre fica no servidor. O visitante usa um carrinho anônimo (`X-Cart-Id`), e no login ele é mesclado ao do usuário antes de a sessão aparecer na UI.
- A taxa exibida no carrinho é estimada pela rede da carteira principal (visitante: Ethereum). A taxa final é a da rede escolhida no checkout, que vem na cotação.
- O limite de quantidade é o menor entre disponível e máximo por pedido. Se o estoque cai, a API ajusta a quantidade e marca o item (preço mudou, quantidade reduzida, esgotado) até o usuário clicar "Entendi". Item esgotado bloqueia o checkout.
- Mudar a quantidade e favoritar são otimistas, com rollback.
- Depois da confirmação, a API remove só o que foi comprado. Se o pedido falha ou é recusado, nada sai do carrinho.

## Checkout e pedido

1. O formulário vem preenchido pela carteira e é validado no cliente e na API.
2. "Conectar" simula a aprovação da carteira; ela pode recusar, e dá para desconectar.
3. "Revisar" pede uma cotação. Se chegar um `nft.updated` que a afete, o botão vira "Atualizar cotação" e o usuário precisa confirmar de novo.
4. `POST /orders` revalida tudo. Se algo mudou, responde `409 QUOTE_STALE` com a nova cotação.
5. A `Idempotency-Key` é a mesma para a mesma tentativa (cotação + carteira + rede) e fica no `sessionStorage`. Clique duplo, timeout e refresh recuperam o mesmo pedido; a mesma chave com dados diferentes dá 409.
6. O pedido nasce `pending` e o mock o resolve como `confirmed` ou `declined`. O recibo só aparece quando confirmado e é um snapshot da cotação, então mudanças posteriores no catálogo não o alteram.

## Cache

| Dado | Key | staleTime |
| --- | --- | --- |
| catálogo | `['catalog','list', params]` | 30 s |
| detalhe | `['nft', id]` | 15 s |
| carrinho | `['user', id, 'cart']` ou `['cart', guestId]` | 0 |
| favoritos, perfil, carteiras, pedidos | `['user', id, ...]` | 30 s |

- Cada busca tem sua própria key e o `AbortSignal` cancela a anterior, então resposta fora de ordem não sobrescreve a atual.
- Refetch com dados na tela mostra "Atualizando…" sem esconder o conteúdo.
- Queries repetem até 2 vezes, só em falha transitória; 4xx nunca é repetido.
- Mutations não repetem sozinhas; o pedido só repete manualmente, com a mesma chave.

## Mocks

- `mocks/db.ts` guarda catálogo, usuários, sessões, carrinhos, cotações, pedidos e chaves de idempotência num estado só, salvo no `localStorage`.
- `mocks/fixtures.ts` tem:
  - 60 NFTs gerados com seed fixo (os 8 primeiros são os do Figma), em 9 categorias e 3 redes, com 4 edições cada, algumas esgotadas;
  - 2 usuários e cupons.
- Toda mudança de dado (preço, estoque, liquidação) é salva e emite o evento correspondente, então REST e socket nunca divergem.

## Acessibilidade

- Link para pular ao conteúdo, foco visível e tudo operável por teclado.
- Diálogos e drawers prendem o foco e o devolvem ao fechar.
- Os campos têm label, erro ligado por `aria-describedby`, e o foco vai para o primeiro campo inválido.
- Mutations e eventos em tempo real são anunciados por toast e `aria-live`.
- Nenhum estado depende só de cor: edição esgotada aparece riscada e com texto.
- `prefers-reduced-motion` desliga o shimmer e as animações.
- Não há overflow horizontal de 320 a 1440 px, checado em `e2e/requirements.spec.ts`. O axe roda em todas as telas.

## Decisões de UX e desvios do Figma

- **Imagens:** o Figma tem 4 ilustrações. Os PNGs originais estão em `assets/figma/`, convertidos para AVIF/WebP, e os 60 NFTs reaproveitam essas artes.
- **Fonte:** Roboto Mono, servida localmente.
- **Edições:** o Figma mostra `1/10 1/10 1/50 ABERTA`; usei `1/10 · 1/25 · 1/50 · ABERTA` para não repetir rótulo.
- **Checkout:**
  - entrou o diálogo de revisão, que o enunciado pede;
  - o painel de conexão da carteira mostra os estados conectando, recusado e conectado;
  - no mobile ("Pagamento com carteira") os dados do colecionador ficam recolhidos em "Revisar dados" e abrem sozinhos se houver erro.
- **Mobile:** segue os frames, sem cabeçalho com logo. Detalhe, carrinho, pagamento e conta têm barra de voltar, e a navegação inferior tem um botão central. Perfil, carteiras e recibo não têm frame mobile e seguem o mesmo padrão.
- **Fora do escopo:** Criadores, Aprenda, ajuda, login social, recuperação de senha, newsletter e "Ler mais" aparecem desabilitados com "Em breve".
- **Botão "Mocks":** não está no Figma. Serve para a demonstração e pode ser escondido com `localStorage['kurio.mock.hidePanel'] = '1'`.
- **Recibo:** o botão "Ver no Etherscan", "Polygonscan" ou "Solscan" segue a rede do pedido; o hash é simulado.

## Performance (Lighthouse)

Mediana de 3 medições, build de produção com os mocks ligados (Lighthouse 13.5, Node 24, macOS, i9-9880H). Os relatórios estão em `lighthouse/reports/`.

| Página | Perfil | Perf. | A11y | BP | SEO | LCP | CLS | TBT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| início | mobile | 79* | 97 | 100 | 100 | 4160 ms | 0 | 265 ms |
| início | desktop | 99 | 97 | 100 | 100 | 857 ms | 0 | 10 ms |
| detalhe | mobile | 80* | 100 | 100 | 100 | 3931 ms | 0 | 259 ms |
| detalhe | desktop | 100 | 100 | 100 | 100 | 815 ms | 0.003 | 0 ms |

\* abaixo da meta de 90.

Só a Performance mobile fica abaixo da meta. O LCP é a arte do hero/detalhe, e no perfil mobile (CPU 4x mais lenta, 4G) ela depende de três passos em sequência:
1. baixar e executar o JS (~150 kB gzip);
2. subir o service worker do MSW;
3. buscar os dados na API.

A imagem em si é pequena (~16 kB em AVIF, com preload). Com backend real, o passo 2 some. Não fiz atalho só para a auditoria: os mocks continuam ligados e o hero continua vindo da API.

O que já foi feito:
- code-splitting por rota;
- socket carregado sob demanda;
- MSW avaliado depois da primeira pintura;
- shim do `tldts`, que reduziu o chunk de mocks de 164 para 52 kB gzip;
- app shell no `index.html`;
- imagens responsivas com dimensões fixas, o que deixa o CLS em ~0.

O próximo passo para chegar a 90 no mobile seria pré-renderizar as rotas públicas (SSG/SSR).

## Limitações

- Carteiras, conexão e transações são simuladas; não há backend nem blockchain.
- O token de sessão fica no `localStorage`, o que é aceitável para o mock. Em produção, ele iria para um cookie `httpOnly` (ver Sessão).
- Eventos em tempo real não são compartilhados entre abas.
- Avaliações, atividade, ofertas, downloads, suporte e conteúdo editorial estão fora do escopo.
- A Performance mobile do Lighthouse fica em ~80 (ver acima).
