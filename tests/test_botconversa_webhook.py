import importlib
import sys
from collections import defaultdict
from pathlib import Path

import pytest
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
