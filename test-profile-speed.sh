#!/bin/bash

# Script para testar a velocidade da rota otimizada /render-profile

echo "🚀 Testando performance da rota /render-profile"
echo "================================================"
echo ""

# URL da API (mude se necessário)
API_URL="http://localhost:3000/render-profile"

# Dados de teste
JSON_DATA='{
  "displayName": "Test User",
  "rankTag": "Speedster",
  "roles": "Admin",
  "description": "Testing speed",
  "groupCount": "10",
  "messageCount": "500",
  "charisma": "85",
  "prestige": "90",
  "collection": "200",
  "academyCash": "5000"
}'

echo "📊 Requisição 1 (inicializa página + carrega fontes):"
time curl -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d "$JSON_DATA" \
  -o test1.png -s

echo ""
echo "📊 Requisição 2 (apenas atualiza dados):"
time curl -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d "$JSON_DATA" \
  -o test2.png -s

echo ""
echo "📊 Requisição 3 (apenas atualiza dados):"
time curl -X POST $API_URL \
  -H "Content-Type: application/json" \
  -d "$JSON_DATA" \
  -o test3.png -s

echo ""
echo "✅ Imagens geradas: test1.png, test2.png, test3.png"
echo "💡 Note: requisição 1 é mais lenta (inicialização), as demais são rápidas!"
