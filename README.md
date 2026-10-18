# Kurio — Marketplace de NFTs (v1)

Implementação do [desafio frontend]x a partir do [layout no Figma](https://www.figma.com/design/Ff0SksUi7UFtPWUO8kyNtw/Frontend-Challenge?node-id=0-1).
Fluxos de descoberta, compra e conta do colecionador, em desktop e mobile, com API REST e tempo real (Socket.IO) totalmente simulados por MSW.


## Stack

React 19 · TypeScript 6 · Vite 8 · TanStack Router · TanStack Query · Axios · Socket.IO client · Tailwind CSS 4 · shadcn/ui (Radix) · MSW 2 + `@mswjs/socket.io-binding` · Playwright · Lighthouse · Zod · big.js

## Setup

Requisitos: Node ≥ 20.19 (testado com 24.22) e npm.

```bash
npm install
```

```bash
npx playwright install chromium
```

```bash
npm run dev
```

Abra http://127.0.0.1:5173. Os mocks (REST + Socket.IO) sobem junto com o app.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Desenvolvimento com mocks |
| `npm run dev:no-mocks` | Desenvolvimento sem MSW (exige backend real em `VITE_API_URL`) |
| `npm run build` | Verificação de tipos + build otimizado (mocks incluídos no build de demonstração) |
| `npm run preview` | Serve o build em http://127.0.0.1:4173 |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | oxlint |
| `npm test` | Playwright (builda, sobe o preview e roda desktop + mobile) |
| `npm run test:e2e:ui` | Playwright em modo UI |
| `npm run test:visual:update` | Regera as baselines de regressão visual |
| `npm run test:report` | Abre o relatório HTML (`playwright-report/`) |
| `npm run lighthouse` | Auditoria Lighthouse (rode `npm run build` antes) |
| `npm run images:optimize` | Regera AVIF/WebP a partir dos PNGs originais do Figma |

## Variáveis de ambiente

Copie `.env.example` para `.env` se quiser alterar algo. Todas são opcionais.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `VITE_ENABLE_MOCKS` | `true` | `false` desliga o MSW |
| `VITE_API_URL` | `/api` | Base REST usada pelo Axios |
| `VITE_REALTIME_URL` | `wss://realtime.kurio.mock` | Endpoint Socket.IO (interceptado pelo MSW) |
| `VITE_ORDER_TIMEOUT_MS` | `8000` | Timeout do cliente na criação do pedido |

## Credenciais fictícias

| Usuário | E-mail | Senha | Observação |
| --- | --- | --- | --- |
| Ana Souza | `ana@kurio.dev` | `Kurio@123` | 2 carteiras cadastradas, 1 favorito |
| Bruno Lima | `bruno@kurio.dev` | `Kurio@123` | Sem carteiras (exercita o cadastro) |

Cupons: `KURIO10` (10%), `GENESIS5` (5%), `VERAO2025` (expirado). Qualquer outro código é inválido.

As senhas são guardadas apenas como hash SHA-256 com salt no banco simulado.

## Cenários e reset

Selecione um cenário de três formas:

1. Botão **Mocks** (canto inferior direito no desktop; ícone na borda direita no mobile) → "Cenário".
2. Query string: `http://127.0.0.1:5173/?scenario=slow` (fica salvo no localStorage).
3. `POST /api/__mock/scenario` com `{ "scenario": "slow" }`.

| Cenário | Efeito |
| --- | --- |
| `default` | Sucesso, latência ~180 ms |
| `empty` | Catálogo sem resultados |
| `slow` | Toda requisição leva 2,5 s (skeletons) |
| `variable` | Latência determinística de 150–1800 ms no catálogo/detalhe (respostas fora de ordem) |
| `offline` | Falha de rede em todas as chamadas REST |
| `server-error` | HTTP 500 no catálogo e no detalhe |
| `flaky` | HTTP 503 na 1ª tentativa de cada consulta do catálogo/detalhe, depois sucesso |
| `session-expired` | Sessões criadas no login expiram em 20 s |
| `favorite-fail` | Favoritar/desfavoritar retorna 500 (rollback do otimismo) |
| `price-change` | Preço do 1º item muda 1,5 s depois de gerar a cotação |
| `sold-out` | Edição do 1º item esgota 1,5 s depois de gerar a cotação |
| `order-timeout` | O pedido é criado, mas a resposta só chega após o timeout do cliente |
| `payment-declined` | Pedidos são recusados |
| `wallet-reject` | A carteira recusa a conexão no checkout |

**Reset:** painel Mocks → "Resetar dados e cenário" (ou `POST /api/__mock/reset`). Restaura o seed completo (catálogo, usuários, carteiras, favoritos, carrinhos, pedidos) e o cenário `default`.

O painel também dispara eventos pelo Socket.IO: alterar preço, esgotar edição, duplicar o último evento, enviar evento antigo, derrubar o socket por 4 s e expirar sessões.

## Como reproduzir os fluxos de falha

| Fluxo | Passos |
| --- | --- |
| Preço muda no checkout | Ana com item no carrinho → cenário `price-change` → Pagamento → Conectar → Revisar. Em 1,5 s o diálogo marca a cotação como desatualizada e troca "Confirmar" por "Atualizar cotação". |
| Edição esgota no checkout | Igual ao anterior com `sold-out`. |
| Cotação obsoleta no servidor | Painel → "Derrubar socket" e "Esgotar 1/50" com o diálogo de revisão aberto → Confirmar: a API responde `409 QUOTE_STALE` e a nova cotação é exibida. |
| Timeout + idempotência | Cenário `order-timeout` → Confirmar compra → após 8 s aparece "Não recebemos a confirmação…" → "Tentar novamente" reenvia com a mesma `Idempotency-Key` e recupera o mesmo pedido. Recarregar a página oferece "Retomar pedido". |
| Pagamento recusado | Cenário `payment-declined` → compra → tela "Pagamento recusado"; itens continuam no carrinho. |
| Pedido pendente + refresh | Compra no cenário `default` e recarregue a página do pedido antes de confirmar (2,5 s): o estado é recuperado via REST, sem nova compra. |
| Sessão expirada | Painel → "Expirar sessão" e faça qualquer ação privada (ou cenário `session-expired`): login com aviso e retorno ao ponto anterior; o rascunho do checkout é preservado. |
| Favorito com falha | Cenário `favorite-fail` → favoritar: muda na hora, volta ao estado anterior e mostra erro. |
| Carteira recusa | Cenário `wallet-reject` → Pagamento → Conectar. |
| Lentidão / erro / retry | Cenários `slow`, `server-error`, `flaky`, `offline`. |

## Testes (Playwright)

```bash
npm test
```

- As 12 áreas exigidas em `e2e/*.spec.ts`: catálogo, detalhe, conta/sessão, favoritos, carrinho, compra, falhas de pagamento/idempotência, perfil/carteiras, tempo real, acessibilidade e skeletons/retry, além de `clock.spec.ts`.
- Relógio controlado com `page.clock` nos cenários sensíveis a tempo: expiração de sessão, liquidação do pedido e debounce da busca. Como o MSW roda na página, os timers do app e dos mocks avançam juntos.
- Projetos `desktop` (1440×900, todos os testes) e `mobile` (390×844, fluxos marcados `@main`), em Chromium.
- Regressão visual de início, detalhe, carrinho e pagamento com baselines versionadas em `e2e/__screenshots__/`.
- Cada teste roda em contexto novo (seed limpo). Latência, tempo de resolução de pedidos e disparo de eventos são controlados pelo teste via `/api/__mock/*`, que passa pelo MSW; eventos chegam pelo `socket.io-client`.
- Relatório HTML em `playwright-report/`; traces, vídeo e screenshot das falhas em `test-results/`.

Para rodar contra um servidor já aberto: `E2E_BASE_URL=http://127.0.0.1:5173 npx playwright test`.

## Lighthouse

```bash
npm run build && npm run lighthouse
```

Três medições por página (início e detalhe) e perfil (mobile e desktop), com mediana. Saída em `lighthouse/reports/`: `summary.md`, `summary.json` (com ambiente e versões) e os relatórios HTML/JSON da execução mediana. Configuração versionada em `lighthouse/config.mjs`. Resultados e análise em [ARCHITECTURE.md](ARCHITECTURE.md#performance-e-lighthouse).

## Deploy

O build de demonstração inclui os mocks. `vercel.json` (Vercel) e `public/_redirects` (Netlify/Cloudflare Pages) fazem o fallback de SPA para acesso direto e refresh de qualquer rota.

```bash
npx vercel --prod
```

## Estrutura

```
src/
  api/          contratos (types.ts), cliente Axios (http.ts), endpoints e chaves de cache
  features/     hooks de domínio (catálogo, carrinho, checkout, conta, auth) e componentes
  pages/        telas roteadas
  realtime/     cliente Socket.IO, deduplicação/versionamento e reconciliação
  mocks/        MSW: banco simulado, fixtures, cenários, handlers REST, servidor Socket.IO
  components/   layout, shadcn/ui e componentes compartilhados
e2e/            Playwright (specs, fixtures, baselines visuais)
lighthouse/     configuração, runner e relatórios
assets/figma/   PNGs originais exportados do Figma
```
# jungle-kurio-test
