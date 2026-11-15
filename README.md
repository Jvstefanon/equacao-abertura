# Equação da Abertura

Leitura do viés de abertura da B3 a partir dos mercados externos e das ADRs.

## Estrutura

| Pasta         | O que é                                                                 |
|---------------|-------------------------------------------------------------------------|
| `site/`       | Página principal e tela de login (HTML, CSS e JS, sem build).           |
| `backoffice/` | Servidor Node.js: login, API de registros, painel AdminJS e PostgreSQL. Serve os arquivos de `site/`. |
| `worker/`     | Cloudflare Worker que busca as cotações (TradingView, com Yahoo de reserva). |

## Como rodar

Veja [backoffice/README.md](backoffice/README.md). Com o servidor no ar, acesse
`http://localhost:3000/entrar`.
