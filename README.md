# Kurio — Marketplace de NFTs

Solução do [desafio frontend](https://github.com/junglegaming/frontend-challenge) com base no [Figma](https://www.figma.com/design/Ff0SksUi7UFtPWUO8kyNtw/Frontend-Challenge?node-id=0-1). REST e Socket.IO rodam simulados com MSW, inclusive no deploy.

- **App publicado:** https://jungle-kurio-test.vercel.app
- **Repositório:** https://github.com/natan1506/jungle-kurio-test

Decisões, contratos e limitações estão em [ARCHITECTURE.md](ARCHITECTURE.md).

**Stack:** React 19, TypeScript, Vite, TanStack Router, TanStack Query, Axios, socket.io-client, Tailwind 4, shadcn/ui, MSW 2 (+ `@mswjs/socket.io-binding`), Playwright e Lighthouse.

## Rodando

Node 20.19+.

```bash
npm install
```

```bash
npm run dev
```

O app abre em http://127.0.0.1:5173, já com os mocks. Para os testes E2E, instale o Chromium uma vez:

```bash
npx playwright install chromium
```

| Comando | |
| --- | --- |
| `npm run dev` | dev com mocks |
| `npm run dev:no-mocks` | dev sem MSW (aponta para `VITE_API_URL`) |
| `npm run build` / `npm run preview` | build de produção (com mocks) e preview em :4173 |
| `npm run typecheck` / `npm run lint` | tsc e oxlint |
| `npm test` | Playwright: builda, sobe o preview e roda desktop + mobile |
| `npm run test:visual:update` | regera as baselines visuais |
| `npm run test:report` | abre o relatório HTML |
| `npm run lighthouse` | auditoria Lighthouse (rode o build antes) |

## Variáveis de ambiente

Todas são opcionais; veja `.env.example`.

| Variável | Padrão | |
| --- | --- | --- |
| `VITE_ENABLE_MOCKS` | `true` | `false` desliga o MSW |
| `VITE_API_URL` | `/api` | base do Axios |
| `VITE_REALTIME_URL` | `wss://realtime.kurio.mock` | endpoint Socket.IO |
| `VITE_ORDER_TIMEOUT_MS` | `8000` | timeout da criação de pedido |

## Usuários e cupons de teste

| E-mail | Senha | |
| --- | --- | --- |
| `ana@kurio.dev` | `Kurio@123` | duas carteiras e um favorito |
| `bruno@kurio.dev` | `Kurio@123` | sem carteiras |

Cupons: `KURIO10` (10%), `GENESIS5` (5%) e `VERAO2025` (expirado). No mock as senhas ficam só como hash SHA-256 com salt.

## Cenários e reset

Há três formas de trocar o cenário:
- botão **Mocks** no canto da tela;
- `?scenario=<nome>` na URL;
- `POST /api/__mock/scenario`.

O reset fica no mesmo painel ou em `POST /api/__mock/reset`, e volta todos os dados ao seed e o cenário para `default`.

| Cenário | Efeito |
| --- | --- |
| `default` | sucesso, ~180 ms de latência |
| `empty` | catálogo vazio |
| `slow` | 2,5 s em toda requisição |
| `variable` | latência de 150–1800 ms no catálogo (respostas fora de ordem) |
| `offline` | erro de rede |
| `server-error` | 500 no catálogo e no detalhe |
| `flaky` | 503 na primeira tentativa, depois sucesso |
| `session-expired` | sessão dura 20 s |
| `favorite-fail` | favoritar retorna 500 |
| `price-change` / `sold-out` | o 1º item muda de preço / esgota logo após a cotação |
| `order-timeout` | pedido criado, mas a resposta passa do timeout |
| `payment-declined` | pagamento recusado |
| `wallet-reject` | a carteira recusa a conexão |

O painel também dispara eventos pelo socket: mudar preço, esgotar edição, repetir o último evento, mandar evento antigo, derrubar a conexão e expirar sessões.

## Reproduzindo as falhas

Os fluxos abaixo partem do login com a Ana e de um item no carrinho.

- **Preço muda no checkout:** cenário `price-change` → Pagamento → Conectar → Revisar. A cotação fica desatualizada e só dá para seguir depois de "Atualizar cotação".
- **Edição esgota:** igual, com `sold-out`. A revisão fecha e o carrinho pede para remover o item.
- **Cotação velha no servidor:** com a revisão aberta, use "Derrubar socket" e "Esgotar 1/50" no painel e confirme. A API responde `409 QUOTE_STALE` com a nova cotação.
- **Timeout e idempotência:** cenário `order-timeout` → confirmar. Após 8 s aparece "Tentar novamente", que reenvia com a mesma `Idempotency-Key` e recupera o mesmo pedido. Recarregar a página oferece "Retomar pedido".
- **Pagamento recusado:** cenário `payment-declined`. Os itens continuam no carrinho.
- **Pedido pendente:** recarregue a página do pedido antes da confirmação (2,5 s). O estado volta via REST, sem gerar outra compra.
- **Sessão expirada:** "Expirar sessão" no painel e qualquer ação privada. O app pede login e volta para onde estava, com o rascunho do checkout preservado.
- **Favorito falhando:** cenário `favorite-fail`. O coração muda na hora e volta com mensagem de erro.
- **Carteira recusando:** cenário `wallet-reject` e "Conectar".
- **Lentidão, erro e retry:** `slow`, `server-error`, `flaky` e `offline`.

## Testes

`npm test` roda as specs em `e2e/` no Chromium, em desktop (1440) e mobile (390, specs marcadas com `@main`):
- cobrem os 12 itens pedidos;
- incluem regressão visual de início, detalhe, carrinho e pagamento (baselines em `e2e/__screenshots__`);
- incluem varredura axe e checagem de overflow de 320 a 1440 px.

Cada teste começa com dados limpos. Latência, liquidação de pedidos e eventos são controlados via `/api/__mock/*`, ou seja, pelo próprio MSW e pelo socket.io-client. Os cenários sensíveis a tempo usam `page.clock`. O relatório HTML fica em `playwright-report/`, e traces e vídeos das falhas em `test-results/`.

## Lighthouse

```bash
npm run build && npm run lighthouse
```

Mede início e detalhe em mobile e desktop, três vezes cada, e salva a mediana. A config fica em `lighthouse/config.mjs`; relatórios HTML/JSON, versões e ambiente vão para `lighthouse/reports/`. A análise dos números está no ARCHITECTURE.

## Deploy

Publicado na Vercel em https://jungle-kurio-test.vercel.app, a partir da `main`. O build de produção já inclui os mocks. O `vercel.json` e o `public/_redirects` (Netlify/Cloudflare) fazem o fallback de SPA para acesso direto e refresh de qualquer rota.

```bash
npx vercel --prod
```
