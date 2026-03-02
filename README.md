# renderer-api

API simples para renderizar HTML em PNG usando Puppeteer.

## Rotas

- GET /health -> { ok: true }
- POST /render -> retorna image/png

Body (JSON):

- html (string, obrigatório)
- width (number, default 720)
- height (number, default 1280)
- selector (string, default "#rg-card")
- baseUrl (string, opcional, ex.: "https://meu-site.com/")
- waitUntil (string, opcional: "domcontentloaded" | "load" | "networkidle0" | "networkidle2", default "networkidle0")
- timeoutMs (number, opcional, default 45000)
- forceFontSynthesis (boolean, opcional, default `true`)
- fontWeights (number[], opcional, default `[400, 500, 600, 700]`)

## Variáveis de ambiente

- PORT: porta do servidor
- PUPPETEER_EXECUTABLE_PATH (ou CHROME_PATH): caminho do Chromium/Chrome
- JSON_LIMIT: limite do body JSON (ex.: 30mb)
- BLOCK_REMOTE_FONTS: se "true", bloqueia Google Fonts (default: false)

## Fontes e compatibilidade de HTML

- A API agora permite fontes externas por padrão (Google Fonts/CDN).
- Fontes embutidas no HTML (`@font-face` com URL remota ou `data:`) são suportadas.
- Para HTML com assets relativos (CSS, fontes, imagens), envie `baseUrl` para resolver caminhos relativos.
- Se uma família não tiver arquivo bold real, a API pode sintetizar negrito (`forceFontSynthesis`) para evitar texto "sem engrossar".

## Rodando local

- npm install
- npm start

## Deploy no Render (Docker)

A pasta já inclui Dockerfile. No Render, crie um Web Service do tipo Docker apontando para este diretório.

Depois, no bot, configure RG_RENDER_API_URL com a URL pública do Render (ex.: https://seu-servico.onrender.com).
