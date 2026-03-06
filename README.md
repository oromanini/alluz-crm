# Alluz CRM

## Integração nativa com Facebook Lead Ads (sem Zapier)

O backend possui endpoints próprios para integração direta com a Meta:

- `GET /api/webhooks/meta-leads`: validação inicial do webhook (`hub.challenge`).
- `POST /api/webhooks/meta-leads`: recebimento dos eventos `leadgen` do Facebook.
- `POST /api/webhooks/lead-capture`: endpoint interno para payload já normalizado.

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
