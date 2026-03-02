# ✅ Checklist de Deploy no Render

Use esta checklist antes de fazer deploy para garantir que tudo funcionará corretamente.

## Pré-requisitos

- [ ] Repositório no GitHub com código atualizado
- [ ] Conta no [Render](https://render.com) (gratuita)
- [ ] Git instalado localmente

## Validação Local (Recomendado)

Teste localmente antes de fazer deploy:

### 1. Instalar dependências
```bash
npm install
```

### 2. Iniciar servidor
```bash
npm start
```

### 3. Testar health check
Em outro terminal:
```bash
curl http://localhost:3000/health
# Esperado: {"ok":true}
```

### 4. Testar render de fontes bold
```bash
./test-bold-render.sh
```

Se todos os testes passarem, você está pronto para deploy! ✨

## Deploy no Render

### Opção A: Blueprint (Automático) ⚡

1. **Push para GitHub**
   ```bash
   git add .
   git commit -m "API pronta para deploy com suporte a fontes"
   git push origin main
   ```

2. **Criar serviço no Render**
   - Acesse: https://dashboard.render.com/blueprints
   - Clique em "New Blueprint Instance"
   - Conecte seu repositório
   - Render detectará `render.yaml` automaticamente
   - Clique em "Apply"

3. **Aguardar deploy** (~5-10 minutos)
   - Render irá:
     - Baixar código
     - Build da imagem Docker
     - Instalar Chrome + fontes
     - Iniciar serviço

### Opção B: Manual

1. **Push para GitHub** (mesmo comando acima)

2. **Criar Web Service**
   - Dashboard Render → "New +" → "Web Service"
   - Conecte repositório GitHub
   - Configure:
     - **Name**: `htmltoimg-api` (ou outro)
     - **Region**: Oregon (ou mais próxima)
     - **Branch**: `main`
     - **Runtime**: Docker
     - **Instance Type**: Free (para testes) ou Starter (produção)

3. **Configurar Health Check**
   - Path: `/health`
   - Garanta que está habilitado

4. **Deploy**
   - Clique em "Create Web Service"
   - Aguarde build completar

## Pós-Deploy

### Testar API em produção

Substitua `SEU_APP` pela URL do Render (ex: `htmltoimg-api-abc123.onrender.com`):

```bash
# 1. Health check
curl https://SEU_APP.onrender.com/health

# 2. Render básico
curl -X POST https://SEU_APP.onrender.com/render \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<!DOCTYPE html><html><head><style>#rg-card{background:#667eea;padding:40px;color:white;font-size:32px;font-weight:700;}</style></head><body><div id=\"rg-card\">Deploy Funcionando!</div></body></html>",
    "width": 800,
    "height": 400
  }' \
  -o deploy-test.png

# 3. Verificar imagem gerada
file deploy-test.png
# Esperado: PNG image data
```

### Configurar no seu Bot/App

Após deploy bem-sucedido, configure a URL no seu aplicativo:

```bash
# Exemplo: variável de ambiente no bot
export RG_RENDER_API_URL=https://SEU_APP.onrender.com
```

## Solução de Problemas

### ❌ Build falha: "Chrome not found"
**Causa**: Dockerfile não instalou Chrome corretamente  
**Solução**: Verifique se está usando o `Dockerfile` atualizado com `google-chrome-stable`

### ❌ Timeout ao renderizar
**Causa**: Plano gratuito tem cold start lento  
**Solução**: 
- Primeira requisição pode demorar ~60s (hibernação)
- Aumente `timeoutMs` no request: `"timeoutMs": 90000`
- Considere upgrade para plano Starter

### ❌ Fontes bold não aparecem
**Causa**: Timeout muito curto ou fonte sem peso bold  
**Solução**:
- Use `"waitUntil": "networkidle0"`
- Adicione `"fontWeights": [400, 700, 900]`
- Force síntese: `"forceFontSynthesis": true`

### ❌ Erro 413 (Payload Too Large)
**Causa**: HTML muito grande  
**Solução**: Aumentar `JSON_LIMIT` nas variáveis de ambiente do Render:
- Dashboard → Service → Environment
- Adicionar: `JSON_LIMIT=50mb` (ou mais)

### ❌ Memory exceeded
**Causa**: Plano Free tem limite de memória  
**Solução**: Upgrade para Starter ($7/mês) com 512MB RAM

## Monitoramento

### Ver logs em tempo real
```bash
# Instale CLI do Render (opcional)
npm install -g render

# Login e visualize logs
render login
render logs <service-name>
```

Ou pelo Dashboard: Service → Logs

### Métricas
Dashboard → Service → Metrics mostra:
- CPU usage
- Memory usage
- Request count
- Response times

## Checklist Final

Antes de considerar deploy completo:

- [ ] Health check retorna `{"ok":true}`
- [ ] Render de HTML básico funciona
- [ ] Fontes bold renderizam corretamente
- [ ] Fontes externas (Google Fonts) carregam
- [ ] Tempo de resposta aceitável (<30s após warm-up)
- [ ] URL configurada no aplicativo cliente
- [ ] Logs não mostram erros críticos

## Otimizações Futuras

Para produção séria, considere:

1. **Caching de imagens** (Redis/S3)
2. **Rate limiting** (evitar abuso)
3. **Autenticação** (API key/JWT)
4. **Fila de jobs** (Bull/RabbitMQ para requisições pesadas)
5. **CDN** (CloudFlare para distribuição global)
6. **Auto-scaling** (planos Professional+)

---

**Dúvidas?** Consulte a [documentação do Render](https://render.com/docs) ou veja [EXAMPLES.md](EXAMPLES.md) para mais casos de uso.
