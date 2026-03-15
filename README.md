# Alluz CRM

## Integração nativa com Facebook Lead Ads (sem Zapier)

O backend possui endpoints próprios para integração direta com a Meta:

- `GET /api/webhooks/meta-leads`: validação inicial do webhook (`hub.challenge`).
- `POST /api/webhooks/meta-leads`: recebimento dos eventos `leadgen` do Facebook.
- `POST /api/webhooks/internal/lead-capture`: endpoint interno para payload já normalizado.

### Variáveis de ambiente

Configure no backend:

- `META_VERIFY_TOKEN`: token de verificação configurado também no app da Meta.
- `META_PAGE_ACCESS_TOKEN`: token de acesso da página para buscar dados do lead via Graph API.
- `META_APP_SECRET` (opcional, recomendado): habilita validação de assinatura `X-Hub-Signature-256`.
- `META_GRAPH_API_VERSION` (opcional): padrão `v20.0`.

### Configuração na Meta

1. Crie o app no Meta for Developers.
2. Em **Webhooks**, assine o objeto **Page** e o campo **leadgen**.
3. Informe como callback:
   - `https://SEU_DOMINIO/api/webhooks/meta-leads`
4. Informe o mesmo `META_VERIFY_TOKEN` do backend.
5. Garanta que o app tenha permissões para ler lead ads e que a página esteja conectada.

### Como testar

#### 1) Teste de verificação do webhook

```bash
curl "https://SEU_DOMINIO/api/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=12345"
```

Retorno esperado: `12345`.

#### 2) Teste funcional via evento simulado

```bash
curl -X POST "https://SEU_DOMINIO/api/webhooks/meta-leads" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "page",
    "entry": [{
      "id": "PAGE_ID",
      "time": 1733500000,
      "changes": [{
        "field": "leadgen",
        "value": {
          "leadgen_id": "LEADGEN_ID"
        }
      }]
    }]
  }'
```

> O backend usa o `LEADGEN_ID` para consultar o Graph API e criar automaticamente lead + deal + notificações de SDR.

#### 3) Validação no CRM

Após o teste, confirme no sistema:

- lead criado,
- deal na etapa `LEAD_NOVO`,
- notificações para usuários SDR.

### Troubleshooting: erro 500 no Cloud Run (`/api/webhooks/lead-capture`)

Se o endpoint estiver retornando 500 e o `logging read` voltar sem detalhes, normalmente você está vendo apenas o log de request (`run.googleapis.com/requests`).

1. **Liste serviços e região corretos**

```bash
gcloud run services list --platform=managed --project=SEU_PROJECT_ID
```

2. **Busque requests 5xx no endpoint**

```bash
gcloud logging read '
resource.type="cloud_run_revision"
resource.labels.service_name="SEU_SERVICE_NAME"
resource.labels.location="SUA_REGION"
logName="projects/SEU_PROJECT_ID/logs/run.googleapis.com%2Frequests"
httpRequest.requestMethod="POST"
httpRequest.requestUrl=~"/api/webhooks/lead-capture"
httpRequest.status>=500
' \
--project=SEU_PROJECT_ID \
--freshness=7d \
--limit=50 \
--order=desc \
--format="table(timestamp,httpRequest.status,httpRequest.requestUrl,trace)"
```

3. **Use o `trace` para achar o erro real da aplicação**

```bash
gcloud logging read '
resource.type="cloud_run_revision"
resource.labels.service_name="SEU_SERVICE_NAME"
trace="projects/SEU_PROJECT_ID/traces/TRACE_ID"
' \
--project=SEU_PROJECT_ID \
--limit=100 \
--order=asc \
--format="table(timestamp,severity,logName,textPayload,jsonPayload.message)"
```

4. **Se vier só request log sem stack**, filtre stderr/stdout:

```bash
gcloud logging read '
resource.type="cloud_run_revision"
resource.labels.service_name="SEU_SERVICE_NAME"
logName=("projects/SEU_PROJECT_ID/logs/run.googleapis.com%2Fstderr" OR "projects/SEU_PROJECT_ID/logs/run.googleapis.com%2Fstdout")
severity>=ERROR
' \
--project=SEU_PROJECT_ID \
--freshness=7d \
--limit=100 \
--order=desc
```

> Dica: no endpoint `POST /api/webhooks/lead-capture`, qualquer exceção interna durante criação do lead/deal/notificações vira 500 se não houver tratamento explícito.

### Troubleshooting: erro 404 do Google no endpoint (`/api/webhooks/lead-capture`)

Se a resposta vier com página HTML do Google (`Error 404 (Not Found)`) em vez de JSON do FastAPI, o request **não está chegando no backend**. Nesse cenário o problema costuma ser de roteamento (domínio/LB), não da rota Python.

1. **Valide a rota diretamente no serviço do backend (URL nativa do Cloud Run)**

```bash
curl -i -X POST "https://SEU_BACKEND_RUN_URL/api/webhooks/lead-capture" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Teste","telefone":"(44) 99999-9999"}'
```

2. **Teste também a rota sem prefixo `/api` (o backend aceita as duas)**

```bash
curl -i -X POST "https://SEU_BACKEND_RUN_URL/webhooks/lead-capture" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Teste","telefone":"(44) 99999-9999"}'
```

3. **Se funcionar na URL nativa e falhar no domínio customizado (`crm.alluzenergia.com.br`)**
   - revise o path matcher do Load Balancer para encaminhar `/api/*` ao serviço backend correto;
   - confirme o domain mapping apontando para o serviço certo;
   - caso use frontend com Nginx, confira se `BACKEND_UPSTREAM` foi definido no build da imagem.

4. **Verificação rápida de endpoint publicado no backend**

```bash
curl -i "https://SEU_BACKEND_RUN_URL/openapi.json" | head
```

O JSON deve listar `"/api/webhooks/lead-capture"` e `"/webhooks/lead-capture"`.


## Webhook BotConversa (captura e qualificação automática)

> **Importante:** o BotConversa deve enviar o POST para o **backend** (`https://<BACKEND_URL>/api/...`) e não para o frontend.

### Endpoint

- `POST /api/webhooks/lead-capture`

### Headers obrigatórios

- `Content-Type: application/json`
- `X-WEBHOOK-SECRET: <SECRET>`

### Payload esperado

```json
{
  "crm_nome_cliente": "Oscar",
  "crm_tipo_imovel": "proprio",
  "crm_telhado": "colonial",
  "crm_valor_conta": "601-1000",
  "crm_decisao": "30dias"
}
```

### Exemplo curl

```bash
curl -i 'https://<BACKEND_URL>/api/webhooks/lead-capture' \
  -H 'content-type: application/json' \
  -H 'X-WEBHOOK-SECRET: <SECRET>' \
  --data-raw '{
    "crm_nome_cliente":"Oscar",
    "crm_tipo_imovel":"proprio",
    "crm_telhado":"colonial",
    "crm_valor_conta":"601-1000",
    "crm_decisao":"30dias"
  }'
```

### Respostas

- `201`: lead criado com sucesso (`lead_id`, `classificacao`, `mensagem`).
- `401`: secret inválido.
- `422`: payload inválido (enum/campo fora do formato esperado).

### Configuração de segurança (Cloud Run + Secret Manager)

1. Crie/atualize o secret no Secret Manager com o valor compartilhado com o BotConversa.
2. No serviço Cloud Run do backend, adicione variável de ambiente `WEBHOOK_SECRET` apontando para esse secret.
3. Faça deploy de nova revisão e valide o endpoint com `curl`.

