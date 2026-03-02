#!/bin/bash
# Script de teste para validar render de fontes bold na API

echo "🧪 Testando render de fontes com diferentes pesos (bold)..."
echo ""

# Teste 1: Google Fonts com pesos 400, 700, 900
echo "📋 Teste 1: Google Fonts (Roboto) com pesos 400, 700, 900"
curl -s -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><link href=\"https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;900&display=swap\" rel=\"stylesheet\"><style>body{margin:0;padding:40px;background:#f5f5f5;font-family:\"Roboto\",sans-serif;}#rg-card{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:50px;border-radius:20px;color:white;}.title{font-size:48px;font-weight:900;margin-bottom:30px;}.normal{font-weight:400;font-size:28px;margin-bottom:15px;}.bold{font-weight:700;font-size:28px;margin-bottom:15px;}.bolder{font-weight:900;font-size:28px;}</style></head><body><div id=\"rg-card\"><div class=\"title\">Teste de Bold</div><div class=\"normal\">✓ Peso 400 (Normal)</div><div class=\"bold\">✓ Peso 700 (Bold)</div><div class=\"bolder\">✓ Peso 900 (Black)</div></div></body></html>",
    "width": 800,
    "height": 600,
    "selector": "#rg-card",
    "forceFontSynthesis": true,
    "fontWeights": [400, 700, 900]
  }' \
  -o /tmp/test1-google-fonts.png

[ -f /tmp/test1-google-fonts.png ] && echo "✅ Gerado: /tmp/test1-google-fonts.png ($(du -h /tmp/test1-google-fonts.png | cut -f1))" || echo "❌ Falhou"
echo ""

# Teste 2: Fonte sem bold real (força síntese)
echo "📋 Teste 2: Arial (fonte do sistema) com síntese de bold forçada"
curl -s -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><style>body{margin:0;padding:40px;background:#ffffff;font-family:Arial,sans-serif;}#rg-card{background:#2c3e50;padding:50px;border-radius:20px;color:#ecf0f1;}.normal{font-weight:normal;font-size:32px;margin-bottom:15px;}.bold{font-weight:bold;font-size:32px;margin-bottom:15px;}.bolder{font-weight:900;font-size:32px;}</style></head><body><div id=\"rg-card\"><div class=\"normal\">Normal</div><div class=\"bold\">Bold</div><div class=\"bolder\">Extra Bold (900)</div></div></body></html>",
    "width": 800,
    "height": 500,
    "selector": "#rg-card",
    "forceFontSynthesis": true
  }' \
  -o /tmp/test2-system-font.png

[ -f /tmp/test2-system-font.png ] && echo "✅ Gerado: /tmp/test2-system-font.png ($(du -h /tmp/test2-system-font.png | cut -f1))" || echo "❌ Falhou"
echo ""

# Teste 3: Múltiplas fontes com @font-face
echo "📋 Teste 3: Mix de fontes (Google Fonts + sistema)"
curl -s -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><link href=\"https://fonts.googleapis.com/css2?family=Poppins:wght@300;700&family=Roboto+Mono:wght@400;700&display=swap\" rel=\"stylesheet\"><style>body{margin:0;padding:40px;background:#fff;}.card{background:linear-gradient(45deg,#f093fb 0%,#f5576c 100%);padding:40px;border-radius:16px;color:white;}.f1{font-family:\"Poppins\",sans-serif;font-weight:300;font-size:24px;margin:10px 0;}.f2{font-family:\"Poppins\",sans-serif;font-weight:700;font-size:24px;margin:10px 0;}.f3{font-family:\"Roboto Mono\",monospace;font-weight:400;font-size:20px;margin:10px 0;}.f4{font-family:\"Roboto Mono\",monospace;font-weight:700;font-size:20px;margin:10px 0;}</style></head><body><div class=\"card\" id=\"rg-card\"><div class=\"f1\">Poppins Light (300)</div><div class=\"f2\">Poppins Bold (700)</div><div class=\"f3\">Roboto Mono Normal (400)</div><div class=\"f4\">Roboto Mono Bold (700)</div></div></body></html>",
    "width": 900,
    "height": 500,
    "fontWeights": [300, 400, 700]
  }' \
  -o /tmp/test3-mixed-fonts.png

[ -f /tmp/test3-mixed-fonts.png ] && echo "✅ Gerado: /tmp/test3-mixed-fonts.png ($(du -h /tmp/test3-mixed-fonts.png | cut -f1))" || echo "❌ Falhou"
echo ""

echo "🎉 Testes concluídos!"
echo ""
echo "Para visualizar as imagens:"
echo "  - /tmp/test1-google-fonts.png"
echo "  - /tmp/test2-system-font.png"
echo "  - /tmp/test3-mixed-fonts.png"
echo ""
echo "Dica: use 'code /tmp/test1-google-fonts.png' para abrir no VS Code"
