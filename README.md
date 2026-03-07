# renderer-api

API simples para renderizar HTML em PNG usando Puppeteer.

## Rotas

- GET /health -> { ok: true }
- POST /render -> retorna image/png (renderização genérica de HTML)
- POST /render-profile -> retorna image/png (renderização otimizada de card de perfil)

### POST /render (Renderização Genérica)

- html (string, obrigatório)
- width (number, default 720)
- height (number, default 1280)
- selector (string, default "#rg-card")
- baseUrl (string, opcional, ex.: "https://meu-site.com/")
- waitUntil (string, opcional: "domcontentloaded" | "load" | "networkidle0" | "networkidle2", default "networkidle0")
- timeoutMs (number, opcional, default 45000)
- forceFontSynthesis (boolean, opcional, default `true`)
- fontWeights (number[], opcional, default `[400, 500, 600, 700]`)

### POST /render-profile (Renderização Otimizada - Perfil Academy)

**Rota otimizada para renderizar card de perfil com HTML pré-definido.**

Body (JSON):

- displayName (string, obrigatório) - Nome do personagem
- rankTag (string, obrigatório) - Título/rank (ex: "Lendário", "Mestre")
- width (number, optional, default 420)
- height (number, optional, default 720)
- avatarUrl (string, opcional) - URL da imagem de avatar
- realAvatarUrl (string, opcional) - Alias para avatarUrl
- backgroundUrl (string, opcional) - URL da imagem de fundo
- backgroundColor (string, opcional) - Cor de fundo em hex (ex: "#667eea")
- isBot (boolean, opcional) - Exibe badge "BOT"
- isDev (boolean, opcional) - Exibe badge "DEVS+"
- isCanonized (boolean, opcional) - Adiciona borda dourada ao avatar
- roles (string, opcional) - Papéis/funções (ex: "Admin • Moderador")
- description (string, opcional) - Descrição do personagem
- groupCount (string|number, opcional) - Número de grupos
- messageCount (string|number, opcional) - Número de mensagens
- charisma (string|number, opcional) - Valor de carisma
- prestige (string|number, opcional) - Valor de prestígio
- collection (string|number, opcional) - Valor de coleção
- academyCash (string|number, opcional) - Dinheiro/moeda
- inventory (string[], opcional) - Array com URLs de 18 itens do inventário

**Vantagens:**
- ✅ Sem necessidade de enviar HTML completo
- ✅ Renderização mais rápida
- ✅ HTML já otimizado e testado
- ✅ Suporte completo a fontes Google Fonts
- ✅ Síntese de bold automática



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
