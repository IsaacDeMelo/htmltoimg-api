# Exemplos de Uso - API de Render HTML

Este arquivo contém exemplos práticos de como usar a API para renderizar HTML com diferentes tipos de fontes.

## Exemplo 1: Google Fonts com Bold

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><link href=\"https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap\" rel=\"stylesheet\"><style>body{font-family:\"Roboto\",sans-serif;padding:40px;background:#f5f5f5;}#rg-card{background:#667eea;padding:50px;border-radius:20px;color:white;}.normal{font-weight:400;font-size:28px;}.bold{font-weight:700;font-size:28px;}.extra{font-weight:900;font-size:28px;}</style></head><body><div id=\"rg-card\"><div class=\"normal\">Normal (400)</div><div class=\"bold\">Bold (700)</div><div class=\"extra\">Black (900)</div></div></body></html>",
    "width": 800,
    "height": 600,
    "fontWeights": [400, 700, 900]
  }' \
  -o output.png
```

## Exemplo 2: Fontes do Sistema com Síntese de Bold

Para fontes que não têm arquivo bold dedicado:

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;padding:40px;}#rg-card{background:#2c3e50;padding:40px;color:white;}.normal{font-weight:normal;font-size:24px;}.bold{font-weight:bold;font-size:24px;}</style></head><body><div id=\"rg-card\"><div class=\"normal\">Normal</div><div class=\"bold\">Bold</div></div></body></html>",
    "width": 600,
    "height": 400,
    "forceFontSynthesis": true
  }' \
  -o system-font.png
```

## Exemplo 3: @font-face com URLs Remotas

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<!DOCTYPE html><html><head><style>@font-face{font-family:\"CustomFont\";src:url(\"https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2\") format(\"woff2\");font-weight:400;}@font-face{font-family:\"CustomFont\";src:url(\"https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc4.woff2\") format(\"woff2\");font-weight:700;}body{font-family:\"CustomFont\",sans-serif;padding:40px;}#rg-card{background:#764ba2;padding:40px;color:white;}.normal{font-weight:400;font-size:24px;}.bold{font-weight:700;font-size:24px;}</style></head><body><div id=\"rg-card\"><div class=\"normal\">Normal</div><div class=\"bold\">Bold</div></div></body></html>",
    "width": 600,
    "height": 400,
    "fontWeights": [400, 700]
  }' \
  -o custom-font.png
```

## Exemplo 4: HTML com Assets Relativos (usando baseUrl)

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<!DOCTYPE html><html><head><link rel=\"stylesheet\" href=\"/styles/main.css\"><script src=\"/js/app.js\"></script></head><body><div id=\"rg-card\"><h1>Título</h1></div></body></html>",
    "baseUrl": "https://meu-site.com",
    "width": 800,
    "height": 600
  }' \
  -o relative-assets.png
```

## Exemplo 5: Controle de Tempo de Carregamento

Para páginas mais complexas que precisam de mais tempo:

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<!DOCTYPE html><html><head><link href=\"https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;700&display=swap\" rel=\"stylesheet\"><style>body{font-family:\"Poppins\",sans-serif;padding:40px;}#rg-card{background:#f093fb;padding:40px;color:white;font-size:24px;font-weight:700;}</style></head><body><div id=\"rg-card\">Texto com tempo extra de carregamento</div></body></html>",
    "width": 800,
    "height": 400,
    "waitUntil": "networkidle0",
    "timeoutMs": 60000,
    "fontWeights": [300, 400, 700]
  }' \
  -o slow-page.png
```

## Exemplo 6: Desabilitar Síntese de Bold

Se você quiser ver exatamente como a fonte renderiza sem síntese:

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<!DOCTYPE html><html><head><style>body{font-family:Arial;padding:40px;}#rg-card{font-weight:bold;font-size:32px;}</style></head><body><div id=\"rg-card\">Bold sem síntese</div></body></html>",
    "width": 600,
    "height": 300,
    "forceFontSynthesis": false
  }' \
  -o no-synthesis.png
```

---

# Exemplos de Uso - Rota Otimizada /render-profile

## Exemplo 7: Card de Perfil Simples

Renderiza um card de perfil Academy com dados básicos:

```bash
curl -X POST http://localhost:3000/render-profile \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Isaac",
    "rankTag": "Lendário",
    "width": 420,
    "height": 720,
    "roles": "Admin • Desenvolvedor",
    "description": "Criador da API",
    "groupCount": "15",
    "messageCount": "1250",
    "charisma": "99",
    "prestige": "100",
    "collection": "500",
    "academyCash": "9999"
  }' \
  -o profile.png
```

## Exemplo 8: Card de Perfil com Avatar, Background e Cores

```bash
curl -X POST http://localhost:3000/render-profile \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "João Silva",
    "rankTag": "Mestre",
    "avatarUrl": "https://res.cloudinary.com/dhdkifjdt/image/upload/v1772638834/avatar.jpg",
    "backgroundUrl": "https://res.cloudinary.com/dhdkifjdt/image/upload/v1772716794/background.jpg",
    "backgroundColor": "#667eea",
    "isCanonized": true,
    "roles": "Moderador • Curador",
    "description": "Apaixonado por RPG",
    "groupCount": "8",
    "messageCount": "856",
    "charisma": "85",
    "prestige": "75",
    "collection": "350",
    "academyCash": "5500"
  }' \
  -o profile-custom.png
```

## Exemplo 9: Card de Perfil com Badge BOT

```bash
curl -X POST http://localhost:3000/render-profile \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "RG Bot",
    "rankTag": "Sistema",
    "isBot": true,
    "roles": "Bot • Automação",
    "description": "Sistema de automação da Academy",
    "groupCount": "999",
    "messageCount": "999999",
    "charisma": "0",
    "prestige": "0",
    "collection": "0",
    "academyCash": "0"
  }' \
  -o bot-profile.png
```

## Exemplo 10: Card de Perfil com Inventário

```bash
curl -X POST http://localhost:3000/render-profile \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Colecionador",
    "rankTag": "Raro",
    "roles": "Coletor",
    "description": "Amante de raridades",
    "groupCount": "12",
    "messageCount": "2100",
    "charisma": "70",
    "prestige": "65",
    "collection": "1200",
    "academyCash": "15000",
    "inventory": [
      "https://res.cloudinary.com/dhdkifjdt/image/upload/v1771599125/item1.png",
      "https://res.cloudinary.com/dhdkifjdt/image/upload/v1771599125/item2.png",
      "https://res.cloudinary.com/dhdkifjdt/image/upload/v1771599125/item3.png"
    ]
  }' \
  -o inventory-profile.png
```

## Exemplo 11: Card de Perfil com todas as opções

```bash
curl -X POST http://localhost:3000/render-profile \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Lendário Pro",
    "rankTag": "Supremo",
    "width": 420,
    "height": 720,
    "avatarUrl": "https://res.cloudinary.com/dhdkifjdt/image/upload/avatar.jpg",
    "backgroundUrl": "https://res.cloudinary.com/dhdkifjdt/image/upload/background.jpg",
    "backgroundColor": "#764ba2",
    "isBot": false,
    "isDev": true,
    "isCanonized": true,
    "roles": "Admin • Dev • Moderador • Curador",
    "description": "Líder máximo da comunidade",
    "groupCount": "50",
    "messageCount": "10000",
    "charisma": "100",
    "prestige": "100",
    "collection": "2000",
    "academyCash": "999999",
    "inventory": [
      "https://res.cloudinary.com/dhdkifjdt/image/upload/item1.png",
      "https://res.cloudinary.com/dhdkifjdt/image/upload/item2.png"
    ]
  }' \
  -o full-profile.png
```

## Parâmetros Disponíveis

| Parâmetro | Tipo | Default | Descrição |
|-----------|------|---------|-----------|
| `html` | string | obrigatório | HTML completo a ser renderizado |
| `width` | number | 720 | Largura em pixels (1-4000) |
| `height` | number | 1280 | Altura em pixels (1-4000) |
| `selector` | string | "#rg-card" | Seletor CSS do elemento a capturar |
| `baseUrl` | string | null | URL base para resolver paths relativos |
| `waitUntil` | string | "networkidle0" | Espera: domcontentloaded, load, networkidle0, networkidle2 |
| `timeoutMs` | number | 45000 | Timeout de carregamento (1000-120000) |
| `forceFontSynthesis` | boolean | true | Permite síntese de bold/italic pelo navegador |
| `fontWeights` | number[] | [400,500,600,700] | Pesos de fonte para pré-carregar |

## Resolvendo Problemas Comuns

### Bold não aparece

1. Verifique se a fonte tem o peso específico disponível
2. Garanta que `forceFontSynthesis: true` (default)
3. Adicione os pesos necessários em `fontWeights: [400, 700, 900]`

### Fontes não carregam

1. Use `waitUntil: "networkidle0"` para esperar carregamento completo
2. Aumente `timeoutMs` se necessário
3. Para assets relativos, defina `baseUrl`

### Imagem cortada

1. Ajuste `width` e `height`
2. Verifique se o `selector` está correto
3. Remova `selector` para capturar página inteira

## Variáveis de Ambiente

```bash
PORT=3000                                      # Porta do servidor
JSON_LIMIT=50mb                                # Limite do body JSON
BLOCK_REMOTE_FONTS=false                       # Bloquear Google Fonts (default: false)
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chrome      # Caminho do navegador
```
