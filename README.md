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

### Método 1: Usando Blueprint (Recomendado)

1. Faça push deste repositório para o GitHub
2. Acesse [Render Dashboard](https://dashboard.render.com/)
3. Clique em "New +" → "Blueprint"
4. Conecte seu repositório GitHub
5. O Render detectará automaticamente o `render.yaml` e configurará tudo

### Método 2: Manual

1. Faça push deste repositório para o GitHub
2. No Render, crie um **Web Service**
3. Conecte seu repositório
4. Configure:
   - **Environment**: Docker
   - **Region**: Escolha a mais próxima
   - **Plan**: Free (ou superior)
   - **Health Check Path**: `/health`

**Variáveis de ambiente (opcional)**:
```
JSON_LIMIT=50mb
BLOCK_REMOTE_FONTS=false
```

### Testando o Deploy

Após o deploy, teste com:
```bash
curl https://seu-app.onrender.com/health
# Resposta esperada: {"ok":true}
```

Para testar render:
```bash
curl -X POST https://seu-app.onrender.com/render \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<!DOCTYPE html><html><head><style>#rg-card{background:#667eea;padding:40px;color:white;font-size:32px;font-weight:700;}</style></head><body><div id=\"rg-card\">Teste Bold</div></body></html>",
    "width": 800,
    "height": 400
  }' \
  --output test.png
```

### Observações Importantes

- ⏱️ **Cold Start**: No plano gratuito, o serviço "hiberna" após inatividade. A primeira requisição pode demorar ~1 minuto
- 💾 **Memória**: Puppeteer + Chrome consomem ~512MB. Recomenda-se plano Starter ($7/mês) ou superior para produção
- 🔒 **HTTPS**: Render provê HTTPS automaticamente
