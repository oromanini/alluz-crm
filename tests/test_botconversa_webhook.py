import importlib
import sys
from collections import defaultdict
from pathlib import Path

import pytest
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient


class InsertOneResult:
    def __init__(self, inserted_id=None):
        self.inserted_id = inserted_id


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, _):
        return list(self.docs)


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        return InsertOneResult(doc.get("id"))

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                if projection:
                    return {
                        key: value
                        for key, value in doc.items()
                        if projection.get(key) == 1
                    }
                return dict(doc)
        return None

    async def update_one(self, query, payload):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                doc.update(payload.get("$set", {}))
                return

    def find(self, query=None, projection=None):
        query = query or {}
        result = []
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                if projection:
                    result.append(
                        {
                            key: value
                            for key, value in doc.items()
                            if projection.get(key) == 1
                        }
                    )
                else:
                    result.append(dict(doc))
        return FakeCursor(result)


class FakeDB:
    def __init__(self):
        self._collections = defaultdict(FakeCollection)

    def __getattr__(self, item):
        return self._collections[item]


@pytest.fixture
def app_module(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    monkeypatch.setenv("DB_NAME", "testdb")
    monkeypatch.setenv("WEBHOOK_SECRET", "segredo-teste")

    backend_path = Path(__file__).resolve().parents[1] / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))

    server = importlib.import_module("server")
    importlib.reload(server)
    return server


@pytest.fixture
def client(app_module):
    fake_db = FakeDB()

    async def override_get_db():
        return fake_db

    app_module.app.dependency_overrides[app_module.get_db] = override_get_db
    test_client = TestClient(app_module.app)
    test_client.fake_db = fake_db

    yield test_client

    app_module.app.dependency_overrides.clear()


def test_webhook_botconversa_payload_valido_cria_lead(client):
    payload = {
        "crm_nome_cliente": "  Oscar  ",
        "crm_whatsapp": "5511999998888",
        "crm_tipo_imovel": "proprio",
        "crm_telhado": "colonial",
        "crm_valor_conta": "601-1000",
        "crm_decisao": "30dias",
    }

    response = client.post(
        "/api/webhooks/lead-capture",
        headers={"X-WEBHOOK-SECRET": "segredo-teste"},
        json=payload,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["mensagem"] == "lead criado com sucesso"
    assert body["classificacao"] in {"A", "B", "C"}
    assert body["lead_id"]

    saved_leads = client.fake_db.leads.docs
    assert len(saved_leads) == 1
    saved = saved_leads[0]
    assert saved["nome"] == "Oscar"
    assert saved["origem"] == "BotConversa WhatsApp"
    assert saved["nome_cliente"] == "Oscar"
    assert saved["telefone"] == "5511999998888"
    assert saved["tipo_imovel"] == "Próprio"
    assert saved["telhado"] == "colonial"
    assert saved["decisao"] == "30dias"
    assert saved["status"] == "qualificado"
    assert saved["media_consumo"] is None
    assert saved.get("conta_media") is None
    assert saved["detalhes"] == {
        "crm_nome_cliente": "Oscar",
        "crm_whatsapp": "5511999998888",
        "crm_tipo_imovel": "proprio",
        "crm_telhado": "colonial",
        "crm_valor_conta": "601-1000",
        "crm_decisao": "30dias",
    }


def test_webhook_botconversa_enum_invalido_retorna_422(client):
    payload = {
        "crm_nome_cliente": "Oscar",
        "crm_whatsapp": "5511988887777",
        "crm_tipo_imovel": "hotel",
        "crm_telhado": "colonial",
        "crm_valor_conta": "601-1000",
        "crm_decisao": "30dias",
    }

    response = client.post(
        "/api/webhooks/lead-capture",
        headers={"X-WEBHOOK-SECRET": "segredo-teste"},
        json=payload,
    )

    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any("crm_tipo_imovel inválido" in err.get("msg", "") for err in errors)


def test_webhook_botconversa_secret_invalido_retorna_401(client):
    payload = {
        "crm_nome_cliente": "Oscar",
        "crm_whatsapp": "5511977776666",
        "crm_tipo_imovel": "proprio",
        "crm_telhado": "colonial",
        "crm_valor_conta": "601-1000",
        "crm_decisao": "30dias",
    }

    response = client.post(
        "/api/webhooks/lead-capture",
        headers={"X-WEBHOOK-SECRET": "invalido"},
        json=payload,
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Secret do webhook inválido"


def test_webhook_botconversa_payload_antigo_sem_whatsapp_e_sem_valor_conta(client):
    payload = {
        "crm_nome_cliente": "Maria",
        "crm_tipo_imovel": "alugado",
        "crm_telhado": "laje",
        "crm_decisao": "90dias",
    }

    response = client.post(
        "/api/webhooks/lead-capture",
        headers={"X-WEBHOOK-SECRET": "segredo-teste"},
        json=payload,
    )

    assert response.status_code == 201
    saved = client.fake_db.leads.docs[0]
    assert saved["telefone"] == "Não informado"
    assert saved["detalhes"] == {
        "crm_nome_cliente": "Maria",
        "crm_whatsapp": None,
        "crm_tipo_imovel": "alugado",
        "crm_telhado": "laje",
        "crm_valor_conta": None,
        "crm_decisao": "90dias",
    }


@pytest.mark.asyncio
async def test_registrar_erro_integracao_quando_stream_ja_consumido_salva_mensagem(app_module):
    class RequestComStreamConsumido:
        method = "POST"
        query_params = {"origem": "teste"}

        class URL:
            path = "/api/webhooks/lead-capture"

        url = URL()

        async def body(self):
            raise RuntimeError("Stream consumed")

    fake_db = FakeDB()

    await app_module.registrar_erro_integracao(
        RequestComStreamConsumido(),
        response_status_code=500,
        erro="falha simulada",
        db_conn=fake_db,
    )

    assert len(fake_db.integration_error_logs.docs) == 1
    log = fake_db.integration_error_logs.docs[0]
    assert log["body"] == "request body já consumido"
    assert log["status_code"] == 500
    assert log["error"] == "falha simulada"


@pytest.mark.asyncio
async def test_registrar_tentativa_webhook_salva_headers_e_body(app_module):
    class Client:
        host = "203.0.113.10"

    class RequestComBody:
        method = "POST"
        query_params = {"utm": "origem"}
        headers = {"x-webhook-secret": "segredo-teste", "content-type": "application/json"}
        client = Client()

        class URL:
            path = "/api/webhooks/lead-capture"

        url = URL()

        async def body(self):
            return b'{"crm_nome_cliente":"Oscar"}'

    fake_db = FakeDB()

    await app_module.registrar_tentativa_webhook(
        RequestComBody(),
        response_status_code=401,
        erro="Secret do webhook inválido",
        db_conn=fake_db,
    )

    assert len(fake_db.webhook_attempt_logs.docs) == 1
    log = fake_db.webhook_attempt_logs.docs[0]
    assert log["path"] == "/api/webhooks/lead-capture"
    assert log["headers"]["x-webhook-secret"] == "segredo-teste"
    assert log["body"] == '{"crm_nome_cliente": "Oscar"}'
    assert log["status_code"] == 401
    assert log["error"] == "Secret do webhook inválido"
    assert log["client_host"] == "203.0.113.10"


@pytest.mark.asyncio
async def test_validation_exception_handler_serializa_valueerror_no_ctx(app_module):
    class RequestFalso:
        class URL:
            path = "/api/webhooks/lead-capture"

        url = URL()

    exc = RequestValidationError([
        {
            "type": "value_error",
            "loc": ("body", "crm_tipo_imovel"),
            "msg": "Value error",
            "input": "hotel",
            "ctx": {"error": ValueError("crm_tipo_imovel inválido")},
        }
    ])

    response = await app_module.validation_exception_handler(RequestFalso(), exc)

    assert response.status_code == 422
    response_text = response.body.decode("utf-8")
    assert "crm_tipo_imovel inválido" in response_text
