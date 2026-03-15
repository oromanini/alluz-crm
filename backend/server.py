from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, File, UploadFile, Body, Query, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import hashlib
import hmac
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional
import uuid
import httpx

from models import (
    User, UserCreate, UserUpdate, UserPasswordReset, Lead, LeadCreate, Deal, DealCreate,
    Activity, ActivityCreate, Proposal, ProposalCreate,
    Document, DocumentCreate, Appointment, AppointmentCreate, AppointmentUpdate,
    FollowUpCadence, FollowUpCadenceCreate, Notification, NotificationCreate,
    WhatsAppTemplate, WhatsAppTemplateCreate, Token, LoginRequest,
    WebhookLeadCapture, BotConversaWebhookLeadCapture, PipelineStage, Role, Origem, Urgencia
)
from auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user_dependency, require_role_dependency
)
from utils import (
    calcular_classificacao_lead, calcular_sla_minutos, is_business_time,
    checklist_qualificacao_preenchido, criar_tarefas_cadencia,
    gerar_link_whatsapp, validar_proxima_acao
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="Alluz Energia CRM API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    if request.url.path.endswith('/webhooks/lead-capture'):
        logger.warning('Validação inválida no webhook BotConversa')
    return JSONResponse(status_code=422, content={'detail': exc.errors()})

SLA_SPEED_TO_LEAD_MINUTOS = 10
META_GRAPH_API_VERSION = os.getenv("META_GRAPH_API_VERSION", "v20.0")


ACTIVITY_TYPE_BY_CHANNEL = {
    "whatsapp": "WhatsApp",
    "ligacao": "Ligação",
    "email": "Email"
}


def _tipo_appointment_por_acao(tipo_acao: Optional[str], canal: Optional[str]) -> str:
    base = (tipo_acao or '').strip().casefold()
    canal_norm = (canal or '').strip().casefold()
    if 'visita' in base or canal_norm == 'visita':
        return 'visita'
    if 'meet' in base or canal_norm in ['meet', 'google meet', 'video']:
        return 'meet'
    return 'tarefa'


async def sincronizar_compromisso_proxima_acao(db, deal_doc: dict, responsavel_padrao: Optional[str] = None):
    proxima_acao = deal_doc.get('proxima_acao')
    if not proxima_acao:
        await db.appointments.delete_many({"deal_id": deal_doc['id'], "origem": "proxima_acao", "concluido": {"$ne": True}})
        return

    data_hora = proxima_acao.get('data_hora')
    if isinstance(data_hora, datetime):
        data_hora_iso = data_hora.isoformat()
    else:
        data_hora_iso = data_hora

    if not data_hora_iso:
        return

    responsavel = responsavel_padrao or deal_doc.get('responsavel_id') or proxima_acao.get('responsavel')
    if not responsavel:
        return

    query = {"deal_id": deal_doc['id'], "origem": "proxima_acao", "concluido": {"$ne": True}}
    existing = await db.appointments.find_one(query, {"_id": 0})
    now_iso = datetime.now(timezone.utc).isoformat()

    payload = {
        "deal_id": deal_doc['id'],
        "lead_id": deal_doc['lead_id'],
        "tipo": _tipo_appointment_por_acao(proxima_acao.get('tipo'), proxima_acao.get('canal')),
        "data_hora": data_hora_iso,
        "duracao_minutos": 60,
        "notas": proxima_acao.get('descricao'),
        "responsavel_id": responsavel,
        "confirmado": False,
        "updated_at": now_iso,
        "origem": "proxima_acao",
    }

    if existing:
        await db.appointments.update_one({"id": existing['id']}, {"$set": payload})
    else:
        appointment = Appointment(**payload)
        doc = appointment.model_dump()
        doc['data_hora'] = doc['data_hora'].isoformat()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['updated_at'] = doc['updated_at'].isoformat()
        if doc.get('concluido_em'):
            doc['concluido_em'] = doc['concluido_em'].isoformat()
        await db.appointments.insert_one(doc)


def normalizar_origem_webhook(origem: Optional[str]) -> Origem:
    """Normaliza origem recebida no webhook para enum aceito pelo domínio."""
    if isinstance(origem, Origem):
        return origem

    if isinstance(origem, str):
        normalized = origem.strip().casefold()
        for origem_enum in Origem:
            if origem_enum.value.casefold() == normalized:
                return origem_enum

    return Origem.OUTRO


def normalizar_urgencia_webhook(urgencia: Optional[str]) -> Optional[Urgencia]:
    """Converte urgência textual do webhook para enum; desconhecidos viram None."""
    if isinstance(urgencia, Urgencia):
        return urgencia

    if isinstance(urgencia, str):
        normalized = urgencia.strip().casefold()
        if not normalized:
            return None

        for urgencia_enum in Urgencia:
            if urgencia_enum.value.casefold() == normalized:
                return urgencia_enum

    return None




def _extrair_conta_media_botconversa(valor_conta: str) -> float:
    """Converte faixa textual de conta para valor médio usado na classificação."""
    mapping = {
        "300-600": 450.0,
        "601-1000": 800.0,
        "1000-2000": 1500.0,
        ">2000": 2200.0
    }
    return mapping[valor_conta]


def _construir_payload_webhook_botconversa(payload: BotConversaWebhookLeadCapture) -> WebhookLeadCapture:
    """Mapeia payload do BotConversa para estrutura de lead usada pelo CRM."""
    tipo_imovel_legivel = "Próprio" if payload.crm_tipo_imovel == "proprio" else "Alugado"
    tipo_telhado_map = {
        "colonial": "ceramica",
        "laje": "laje",
        "metalico": "metalico",
        "fibromadeira": "fibromadeira",
    }

    return WebhookLeadCapture(
        nome=payload.crm_nome_cliente,
        telefone="Não informado",
        origem=Origem.BOTCONVERSA.value,
        conta_media=_extrair_conta_media_botconversa(payload.crm_valor_conta),
        urgencia="30 dias" if payload.crm_decisao == "30dias" else "60+ dias",
        tipo_imovel=tipo_imovel_legivel,
        tipo_telhado=tipo_telhado_map[payload.crm_telhado],
        decisao_em_ate_30_dias=payload.crm_decisao == "30dias",
        imovel_proprio=payload.crm_tipo_imovel == "proprio",
        possui_area_util_necessaria=payload.crm_telhado in {"colonial", "metalico"},
        enviou_foto_fatura=True,
        enviou_foto_telhado=True,
        apenas_pesquisando=payload.crm_decisao == ">90dias",
    )


def _validar_secret_webhook(request: Request):
    """Valida header de secret para endpoints webhook protegidos."""
    configured_secret = os.getenv("WEBHOOK_SECRET")
    provided_secret = (request.headers.get("X-WEBHOOK-SECRET") or "").strip()

    if not configured_secret:
        logger.error("WEBHOOK_SECRET não configurado no ambiente")
        raise HTTPException(status_code=500, detail="WEBHOOK_SECRET não configurado")

    if not hmac.compare_digest(provided_secret, configured_secret):
        logger.warning("Falha na autenticação do webhook")
        raise HTTPException(status_code=401, detail="Secret do webhook inválido")

def validar_assinatura_meta(body: bytes, assinatura: Optional[str]) -> bool:
    """Valida assinatura do webhook da Meta quando META_APP_SECRET estiver configurado."""
    app_secret = os.getenv("META_APP_SECRET")
    if not app_secret:
        return True

    if not assinatura or not assinatura.startswith("sha256="):
        return False

    recebido = assinatura.split("sha256=", 1)[1]
    calculado = hmac.new(app_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(recebido, calculado)


async def buscar_lead_meta(leadgen_id: str) -> dict:
    """Busca detalhes do lead no Graph API a partir do leadgen_id."""
    page_access_token = os.getenv("META_PAGE_ACCESS_TOKEN")
    if not page_access_token:
        raise HTTPException(
            status_code=500,
            detail="META_PAGE_ACCESS_TOKEN não configurado no backend"
        )

    fields = "full_name,first_name,last_name,phone_number,email,campaign_id,form_id"
    url = f"https://graph.facebook.com/{META_GRAPH_API_VERSION}/{leadgen_id}"

    async with httpx.AsyncClient(timeout=20.0) as client_http:
        response = await client_http.get(
            url,
            params={
                "access_token": page_access_token,
                "fields": fields
            }
        )

    if response.status_code >= 400:
        logger.error("Erro Graph API (%s): %s", response.status_code, response.text)
        raise HTTPException(status_code=502, detail="Falha ao buscar lead no Graph API")

    return response.json()


async def criar_lead_via_webhook(db, lead_data: WebhookLeadCapture, descricao_origem: str = "webhook") -> str:
    """Cria lead/deal/notificações com base no payload de webhook e retorna o lead_id."""
    lead = Lead(
        nome=lead_data.nome,
        telefone=lead_data.telefone,
        email=lead_data.email,
        origem=normalizar_origem_webhook(lead_data.origem),
        utm_source=lead_data.utm_source,
        utm_medium=lead_data.utm_medium,
        utm_campaign=lead_data.utm_campaign,
        conta_media=lead_data.conta_media,
        urgencia=normalizar_urgencia_webhook(lead_data.urgencia)
    )

    lead.classificacao = calcular_classificacao_lead(lead_data.model_dump())

    doc = lead.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()

    await db.leads.insert_one(doc)

    deal = Deal(
        lead_id=lead.id,
        etapa=PipelineStage.LEAD_NOVO
    )
    deal_doc = deal.model_dump()
    deal_doc['created_at'] = deal_doc['created_at'].isoformat()
    deal_doc['updated_at'] = deal_doc['updated_at'].isoformat()
    await db.deals.insert_one(deal_doc)

    sdrs = await db.users.find({"role": "sdr"}, {"_id": 0}).to_list(100)
    for sdr in sdrs:
        notif = Notification(
            user_id=sdr['id'],
            tipo="lead_novo",
            mensagem=f"Novo lead via {descricao_origem}: {lead.nome} - {lead.classificacao}",
            link=f"/lead/{lead.id}"
        )
        notif_doc = notif.model_dump()
        notif_doc['created_at'] = notif_doc['created_at'].isoformat()
        await db.notifications.insert_one(notif_doc)

    return lead.id


async def obter_ou_criar_cadencia_followup(db, deal_id: str, force_reset: bool = False):
    """Busca cadência do deal; cria automaticamente se não existir."""
    cadencia = await db.follow_up_cadences.find_one({"deal_id": deal_id}, {"_id": 0})

    if cadencia and not force_reset:
        return cadencia

    cadencia_obj = FollowUpCadence(
        deal_id=deal_id,
        tarefas=criar_tarefas_cadencia()
    )
    cadencia_doc = cadencia_obj.model_dump()
    cadencia_doc['created_at'] = cadencia_doc['created_at'].isoformat()
    cadencia_doc['updated_at'] = cadencia_doc['updated_at'].isoformat()

    if cadencia and force_reset:
        await db.follow_up_cadences.replace_one({"id": cadencia["id"]}, cadencia_doc)
    elif not cadencia:
        await db.follow_up_cadences.insert_one(cadencia_doc)

    return cadencia_doc


async def atualizar_tarefa_cadencia(
    db,
    deal_id: str,
    dia: int,
    *,
    concluir: bool = False,
    canal: Optional[str] = None,
    notas: Optional[str] = None,
    responsavel_id: Optional[str] = None,
):
    cadencia = await obter_ou_criar_cadencia_followup(db, deal_id)

    tarefas = cadencia.get('tarefas', [])
    tarefa_atualizada = None

    for tarefa in tarefas:
        if int(tarefa.get('dia', -1)) == int(dia):
            historico = tarefa.get('historico_tentativas') or []
            tentativa = {
                "canal": canal or tarefa.get('tipo', 'whatsapp'),
                "notas": notas,
                "data_hora": datetime.now(timezone.utc).isoformat()
            }
            historico.append(tentativa)
            tarefa['historico_tentativas'] = historico
            tarefa['tentativas'] = int(tarefa.get('tentativas', 0)) + 1

            if concluir:
                tarefa['status'] = 'concluida'
                tarefa['completada_em'] = datetime.now(timezone.utc).isoformat()

            tarefa_atualizada = tarefa
            break

    if not tarefa_atualizada:
        raise HTTPException(status_code=404, detail='Tarefa da cadência não encontrada para este dia')

    await db.follow_up_cadences.update_one(
        {"id": cadencia['id']},
        {"$set": {"tarefas": tarefas, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    deal = await db.deals.find_one({"id": deal_id}, {"_id": 0, "lead_id": 1})
    if not deal:
        raise HTTPException(status_code=404, detail='Deal não encontrado')

    canal_chave = (canal or tarefa_atualizada.get('tipo', 'whatsapp')).lower()
    tipo_atividade = ACTIVITY_TYPE_BY_CHANNEL.get(canal_chave, "Follow-up")

    atividade = Activity(
        deal_id=deal_id,
        lead_id=deal['lead_id'],
        tipo=tipo_atividade,
        notas=notas or tarefa_atualizada.get('mensagem'),
        resultado='concluída' if concluir else 'tentativa',
        responsavel_id=responsavel_id or ''
    )

    atividade_doc = atividade.model_dump()
    atividade_doc['data_hora'] = atividade_doc['data_hora'].isoformat()
    atividade_doc['created_at'] = atividade_doc['created_at'].isoformat()
    await db.activities.insert_one(atividade_doc)

    return tarefa_atualizada


async def atualizar_alertas_sla_speed_to_lead(db):
    """Atualiza SLA pendente de leads sem contato e dispara alertas únicos para estouro."""
    leads_pendentes = await db.leads.find(
        {
            "primeiro_contato_em": None,
            "ignorar_speed_to_lead": {"$ne": True},
            "arquivado": {"$ne": True}
        },
        {"_id": 0}
    ).to_list(1000)

    if not leads_pendentes:
        return

    deve_alertar_agora = is_business_time()
    destinatarios = []
    if deve_alertar_agora:
        destinatarios = await db.users.find(
            {"role": {"$in": ["admin", "sdr"]}},
            {"_id": 0, "id": 1}
        ).to_list(200)

    for lead in leads_pendentes:
        created_at = lead.get("created_at")
        if not created_at:
            continue

        created_at_dt = datetime.fromisoformat(created_at) if isinstance(created_at, str) else created_at
        sla_atual = calcular_sla_minutos(created_at_dt)

        await db.leads.update_one(
            {"id": lead["id"]},
            {"$set": {"status_sla_minutos": sla_atual, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )

        if not deve_alertar_agora:
            continue

        if sla_atual <= SLA_SPEED_TO_LEAD_MINUTOS or lead.get("sla_alertado_em"):
            continue

        alerta_em = datetime.now(timezone.utc).isoformat()
        await db.leads.update_one(
            {"id": lead["id"]},
            {"$set": {"sla_alertado_em": alerta_em}}
        )

        for user in destinatarios:
            notif = Notification(
                user_id=user['id'],
                tipo="sla_speed_to_lead_estourado",
                mensagem=(
                    f"Speed-to-Lead estourado: {lead['nome']} sem contato há "
                    f"{sla_atual} min úteis"
                ),
                link=f"/lead/{lead['id']}"
            )
            notif_doc = notif.model_dump()
            notif_doc['created_at'] = notif_doc['created_at'].isoformat()
            await db.notifications.insert_one(notif_doc)


# Dependency to get db in routes
async def get_db():
    return db

# Auth dependency
get_current_user = get_current_user_dependency(db)


# AUTH ENDPOINTS
@api_router.post("/auth/register", response_model=User)
async def register(
    user_data: UserCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Registrar novo usuário (apenas Admin)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")

    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    user = User(
        email=user_data.email,
        nome=user_data.nome,
        role=user_data.role
    )

    doc = user.model_dump()
    doc['password_hash'] = get_password_hash(user_data.password)
    doc['created_at'] = doc['created_at'].isoformat()

    await db.users.insert_one(doc)
    return user


@api_router.post("/auth/login", response_model=Token)
async def login(login_data: LoginRequest, db=Depends(get_db)):
    """Login com email e senha"""
    user = await db.users.find_one({"email": login_data.email}, {"_id": 0})
    if not user or not verify_password(login_data.password, user['password_hash']):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos"
        )
    
    # Atualizar last_login
    await db.users.update_one(
        {"email": login_data.email},
        {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}}
    )
    
    access_token = create_access_token(data={"sub": user['email']})
    return Token(access_token=access_token)


@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Retorna dados do usu\u00e1rio atual"""
    return current_user


# LEADS ENDPOINTS
@api_router.post("/leads", response_model=Lead)
async def create_lead(lead_data: LeadCreate, current_user: dict = Depends(get_current_user), db=Depends(get_db)):
    """Criar novo lead"""
    lead = Lead(**lead_data.model_dump())
    
    # Calcular classifica\u00e7\u00e3o A/B/C
    lead.classificacao = calcular_classificacao_lead(lead_data.model_dump())
    lead.responsavel_id = current_user['id']
    
    doc = lead.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.leads.insert_one(doc)
    
    # Criar deal automaticamente
    deal = Deal(
        lead_id=lead.id,
        etapa=PipelineStage.LEAD_NOVO,
        responsavel_id=current_user['id']
    )
    deal_doc = deal.model_dump()
    deal_doc['created_at'] = deal_doc['created_at'].isoformat()
    deal_doc['updated_at'] = deal_doc['updated_at'].isoformat()
    await db.deals.insert_one(deal_doc)
    
    # Criar notifica\u00e7\u00e3o para SDRs
    sdrs = await db.users.find({"role": "sdr"}, {"_id": 0}).to_list(100)
    for sdr in sdrs:
        notif = Notification(
            user_id=sdr['id'],
            tipo="lead_novo",
            mensagem=f"Novo lead: {lead.nome} - Classifica\u00e7\u00e3o {lead.classificacao}",
            link=f"/lead/{lead.id}"
        )
        notif_doc = notif.model_dump()
        notif_doc['created_at'] = notif_doc['created_at'].isoformat()
        await db.notifications.insert_one(notif_doc)
    
    return lead


@api_router.get("/leads", response_model=List[Lead])
async def list_leads(
    classificacao: Optional[str] = None,
    responsavel_id: Optional[str] = None,
    origem: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    incluir_arquivados: bool = False,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Listar leads com filtros"""
    await atualizar_alertas_sla_speed_to_lead(db)

    query = {}

    if not incluir_arquivados:
        query['arquivado'] = {"$ne": True}
    
    if classificacao:
        query['classificacao'] = classificacao
    if responsavel_id:
        query['responsavel_id'] = responsavel_id
    if origem:
        query['origem'] = origem
    
    # SDRs e Closers veem apenas seus leads
    if current_user['role'] in ['sdr', 'closer']:
        query['responsavel_id'] = current_user['id']
    
    leads = await db.leads.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    
    # Converter timestamps
    for lead in leads:
        if isinstance(lead.get('created_at'), str):
            lead['created_at'] = datetime.fromisoformat(lead['created_at'])
        if isinstance(lead.get('updated_at'), str):
            lead['updated_at'] = datetime.fromisoformat(lead['updated_at'])
        if isinstance(lead.get('primeiro_contato_em'), str):
            lead['primeiro_contato_em'] = datetime.fromisoformat(lead['primeiro_contato_em'])
        if isinstance(lead.get('sla_alertado_em'), str):
            lead['sla_alertado_em'] = datetime.fromisoformat(lead['sla_alertado_em'])
    
    return leads


@api_router.get("/leads/{lead_id}", response_model=Lead)
async def get_lead(lead_id: str, current_user: dict = Depends(get_current_user), db=Depends(get_db)):
    """Buscar lead por ID"""
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead n\u00e3o encontrado")
    
    # Converter timestamps
    if isinstance(lead.get('created_at'), str):
        lead['created_at'] = datetime.fromisoformat(lead['created_at'])
    if isinstance(lead.get('updated_at'), str):
        lead['updated_at'] = datetime.fromisoformat(lead['updated_at'])
    if isinstance(lead.get('primeiro_contato_em'), str):
        lead['primeiro_contato_em'] = datetime.fromisoformat(lead['primeiro_contato_em'])
    if isinstance(lead.get('sla_alertado_em'), str):
        lead['sla_alertado_em'] = datetime.fromisoformat(lead['sla_alertado_em'])
    
    return lead


@api_router.put("/leads/{lead_id}", response_model=Lead)
async def update_lead(
    lead_id: str,
    lead_data: LeadCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Atualizar lead"""
    existing = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Lead n\u00e3o encontrado")
    
    # Recalcular classifica\u00e7\u00e3o
    nova_classificacao = calcular_classificacao_lead(lead_data.model_dump())
    
    update_data = lead_data.model_dump()
    update_data['classificacao'] = nova_classificacao
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    await db.leads.update_one({"id": lead_id}, {"$set": update_data})
    
    updated = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    if isinstance(updated.get('updated_at'), str):
        updated['updated_at'] = datetime.fromisoformat(updated['updated_at'])
    
    return updated


# DEALS ENDPOINTS
@api_router.get("/deals", response_model=List[Deal])
async def list_deals(
    etapa: Optional[str] = None,
    responsavel_id: Optional[str] = None,
    incluir_arquivados: bool = False,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Listar oportunidades"""
    query = {}
    
    if etapa:
        query['etapa'] = etapa
    if responsavel_id:
        query['responsavel_id'] = responsavel_id

    if not incluir_arquivados:
        active_lead_ids = await db.leads.distinct('id', {"arquivado": {"$ne": True}})
        query['lead_id'] = {"$in": active_lead_ids}
    
    # SDRs e Closers veem apenas seus deals
    if current_user['role'] in ['sdr', 'closer']:
        query['responsavel_id'] = current_user['id']
    
    deals = await db.deals.find(query, {"_id": 0}).to_list(1000)
    
    # Converter timestamps e calcular SLA
    for deal in deals:
        if isinstance(deal.get('created_at'), str):
            deal['created_at'] = datetime.fromisoformat(deal['created_at'])
        if isinstance(deal.get('updated_at'), str):
            deal['updated_at'] = datetime.fromisoformat(deal['updated_at'])
        if isinstance(deal.get('closed_at'), str):
            deal['closed_at'] = datetime.fromisoformat(deal['closed_at'])
        
        # Calcular ciclo_dias
        if deal.get('closed_at'):
            ciclo = deal['closed_at'] - deal['created_at']
            deal['ciclo_dias'] = ciclo.days
        else:
            ciclo = datetime.now(timezone.utc) - deal['created_at']
            deal['ciclo_dias'] = ciclo.days
        
        # Converter proxima_acao se existir
        if deal.get('proxima_acao') and isinstance(deal['proxima_acao'].get('data_hora'), str):
            deal['proxima_acao']['data_hora'] = datetime.fromisoformat(deal['proxima_acao']['data_hora'])
    
    return deals


@api_router.get("/deals/{deal_id}", response_model=Deal)
async def get_deal(deal_id: str, current_user: dict = Depends(get_current_user), db=Depends(get_db)):
    """Buscar deal por ID"""
    deal = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    if not deal:
        raise HTTPException(status_code=404, detail="Deal n\u00e3o encontrado")
    
    # Converter timestamps
    if isinstance(deal.get('created_at'), str):
        deal['created_at'] = datetime.fromisoformat(deal['created_at'])
    if isinstance(deal.get('updated_at'), str):
        deal['updated_at'] = datetime.fromisoformat(deal['updated_at'])
    if isinstance(deal.get('closed_at'), str):
        deal['closed_at'] = datetime.fromisoformat(deal['closed_at'])
    if deal.get('proxima_acao') and isinstance(deal['proxima_acao'].get('data_hora'), str):
        deal['proxima_acao']['data_hora'] = datetime.fromisoformat(deal['proxima_acao']['data_hora'])
    
    return deal


@api_router.put("/deals/{deal_id}", response_model=Deal)
async def update_deal(
    deal_id: str,
    deal_data: DealCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Atualizar deal - valida próxima ação"""
    existing = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deal não encontrado")

    stage_changed = existing.get('etapa') != deal_data.etapa

    # Validar próxima ação apenas quando houver mudança de etapa
    proxima_acao_dict = deal_data.proxima_acao.model_dump() if deal_data.proxima_acao else None
    if stage_changed and not validar_proxima_acao(deal_data.etapa, proxima_acao_dict):
        raise HTTPException(
            status_code=400,
            detail="Próxima ação é obrigatória para mudança de etapa (exceto Fechado/Nutrição)"
        )

    if (
        existing.get('etapa') == PipelineStage.CONTATO_REALIZADO
        and deal_data.etapa == PipelineStage.QUALIFICADO
    ):
        lead = await db.leads.find_one({"id": existing.get('lead_id')}, {"_id": 0})
        if not lead or not checklist_qualificacao_preenchido(lead):
            raise HTTPException(
                status_code=400,
                detail="Preencha o checklist de qualificação antes de mover o lead para Qualificado"
            )

    update_data = deal_data.model_dump()
    now_utc = datetime.now(timezone.utc)
    update_data['updated_at'] = now_utc.isoformat()

    if stage_changed and deal_data.etapa == PipelineStage.CONTATO_REALIZADO:
        lead = await db.leads.find_one({"id": existing.get('lead_id')}, {"_id": 0})
        if lead and not lead.get('primeiro_contato_em'):
            created_at = lead.get('created_at')
            if isinstance(created_at, str):
                created_at = datetime.fromisoformat(created_at)
            sla_minutos = None if lead.get('ignorar_speed_to_lead') else calcular_sla_minutos(created_at, now_utc)

            await db.leads.update_one(
                {"id": lead['id']},
                {
                    "$set": {
                        "primeiro_contato_em": now_utc.isoformat(),
                        "status_sla_minutos": sla_minutos,
                        "updated_at": now_utc.isoformat(),
                    }
                },
            )

    # Se moveu para Proposta Enviada/Negociação, criar cadência automática (se ainda não existir)
    if (
        deal_data.etapa in [PipelineStage.PROPOSTA_ENVIADA, PipelineStage.NEGOCIACAO]
        and existing.get('etapa') not in [PipelineStage.PROPOSTA_ENVIADA, PipelineStage.NEGOCIACAO]
    ):
        await obter_ou_criar_cadencia_followup(db, deal_id)

    # Se fechou, marcar closed_at
    if deal_data.etapa in [PipelineStage.FECHADO_GANHO, PipelineStage.FECHADO_PERDIDO]:
        update_data['closed_at'] = datetime.now(timezone.utc).isoformat()

    # Serializar proxima_acao
    if update_data.get('proxima_acao'):
        update_data['proxima_acao']['data_hora'] = update_data['proxima_acao']['data_hora'].isoformat()

    await db.deals.update_one({"id": deal_id}, {"$set": update_data})

    deal_for_sync = {**existing, **update_data, "id": deal_id}
    await sincronizar_compromisso_proxima_acao(db, deal_for_sync, responsavel_padrao=current_user.get('id'))

    updated = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    if isinstance(updated.get('updated_at'), str):
        updated['updated_at'] = datetime.fromisoformat(updated['updated_at'])
    if isinstance(updated.get('closed_at'), str):
        updated['closed_at'] = datetime.fromisoformat(updated['closed_at'])
    if updated.get('proxima_acao') and isinstance(updated['proxima_acao'].get('data_hora'), str):
        updated['proxima_acao']['data_hora'] = datetime.fromisoformat(updated['proxima_acao']['data_hora'])

    return updated


# ACTIVITIES ENDPOINTS
@api_router.post("/activities", response_model=Activity)
async def create_activity(
    activity_data: ActivityCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Criar atividade - registra contato com lead"""
    activity = Activity(**activity_data.model_dump())
    
    doc = activity.model_dump()
    doc['data_hora'] = doc['data_hora'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.activities.insert_one(doc)
    
    # Atualizar primeiro_contato_em do lead se for o primeiro
    lead = await db.leads.find_one({"id": activity.lead_id}, {"_id": 0})
    if lead and not lead.get('primeiro_contato_em'):
        primeiro_contato = datetime.now(timezone.utc)
        sla_minutos = None
        if not lead.get('ignorar_speed_to_lead'):
            sla_minutos = calcular_sla_minutos(
                datetime.fromisoformat(lead['created_at']),
                primeiro_contato
            )
        
        await db.leads.update_one(
            {"id": activity.lead_id},
            {
                "$set": {
                    "primeiro_contato_em": primeiro_contato.isoformat(),
                    "status_sla_minutos": sla_minutos,
                    "sla_alertado_em": lead.get("sla_alertado_em")
                }
            }
        )
        
        # Notificar se SLA estourou (>10 min úteis)
        if sla_minutos and sla_minutos > SLA_SPEED_TO_LEAD_MINUTOS:
            admins = await db.users.find({"role": "admin"}, {"_id": 0}).to_list(100)
            for admin in admins:
                notif = Notification(
                    user_id=admin['id'],
                    tipo="sla_estourado",
                    mensagem=f"SLA estourado: {lead['nome']} - {sla_minutos} minutos",
                    link=f"/lead/{activity.lead_id}"
                )
                notif_doc = notif.model_dump()
                notif_doc['created_at'] = notif_doc['created_at'].isoformat()
                await db.notifications.insert_one(notif_doc)
    
    return activity


@api_router.put("/leads/{lead_id}/archive", response_model=Lead)
async def archive_lead(
    lead_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Arquivar lead apenas se estiver em Lead Novo ou Fechado - Perdido."""
    lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")

    deal = await db.deals.find_one({"lead_id": lead_id}, {"_id": 0, "etapa": 1})
    if not deal:
        raise HTTPException(status_code=400, detail="Lead sem deal vinculado")

    etapas_permitidas = [PipelineStage.LEAD_NOVO.value, PipelineStage.FECHADO_PERDIDO.value]
    if deal.get('etapa') not in etapas_permitidas:
        raise HTTPException(
            status_code=400,
            detail="Lead só pode ser arquivado quando estiver como novo ou desistente"
        )

    now = datetime.now(timezone.utc)
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"arquivado": True, "arquivado_em": now.isoformat(), "updated_at": now.isoformat()}}
    )

    updated = await db.leads.find_one({"id": lead_id}, {"_id": 0})
    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    if isinstance(updated.get('updated_at'), str):
        updated['updated_at'] = datetime.fromisoformat(updated['updated_at'])
    if isinstance(updated.get('primeiro_contato_em'), str):
        updated['primeiro_contato_em'] = datetime.fromisoformat(updated['primeiro_contato_em'])
    if isinstance(updated.get('sla_alertado_em'), str):
        updated['sla_alertado_em'] = datetime.fromisoformat(updated['sla_alertado_em'])
    if isinstance(updated.get('arquivado_em'), str):
        updated['arquivado_em'] = datetime.fromisoformat(updated['arquivado_em'])

    return updated


@api_router.get("/activities", response_model=List[Activity])
async def list_activities(
    lead_id: Optional[str] = None,
    deal_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Listar atividades (timeline)"""
    query = {}
    
    if lead_id:
        query['lead_id'] = lead_id
    if deal_id:
        query['deal_id'] = deal_id
    
    activities = await db.activities.find(query, {"_id": 0}).sort("data_hora", -1).to_list(1000)
    
    for activity in activities:
        if isinstance(activity.get('data_hora'), str):
            activity['data_hora'] = datetime.fromisoformat(activity['data_hora'])
        if isinstance(activity.get('created_at'), str):
            activity['created_at'] = datetime.fromisoformat(activity['created_at'])
    
    return activities


# FOLLOW-UP CADENCE ENDPOINTS
@api_router.get("/follow-up-cadences/{deal_id}", response_model=FollowUpCadence)
async def get_followup_cadence(
    deal_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Obter cadência de follow-up de um deal."""
    cadencia = await obter_ou_criar_cadencia_followup(db, deal_id)

    if isinstance(cadencia.get('created_at'), str):
        cadencia['created_at'] = datetime.fromisoformat(cadencia['created_at'])
    if isinstance(cadencia.get('updated_at'), str):
        cadencia['updated_at'] = datetime.fromisoformat(cadencia['updated_at'])

    for tarefa in cadencia.get('tarefas', []):
        if isinstance(tarefa.get('completada_em'), str):
            tarefa['completada_em'] = datetime.fromisoformat(tarefa['completada_em'])

    return cadencia


@api_router.put("/follow-up-cadences/{deal_id}/pause")
async def pause_followup_cadence(
    deal_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Pausar cadência de follow-up do deal."""
    cadencia = await obter_ou_criar_cadencia_followup(db, deal_id)
    await db.follow_up_cadences.update_one(
        {"id": cadencia['id']},
        {"$set": {"status": "pausada", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "ok", "cadencia_status": "pausada"}


@api_router.put("/follow-up-cadences/{deal_id}/resume")
async def resume_followup_cadence(
    deal_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Retomar cadência de follow-up do deal."""
    cadencia = await obter_ou_criar_cadencia_followup(db, deal_id)
    await db.follow_up_cadences.update_one(
        {"id": cadencia['id']},
        {"$set": {"status": "ativa", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "ok", "cadencia_status": "ativa"}


@api_router.post("/follow-up-cadences/{deal_id}/tasks/{dia}/attempt")
async def register_followup_attempt(
    deal_id: str,
    dia: int,
    payload: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Registrar tentativa de contato da tarefa da cadência."""
    canal = (payload.get('canal') or '').lower()
    if canal and canal not in ACTIVITY_TYPE_BY_CHANNEL:
        raise HTTPException(status_code=400, detail='Canal inválido. Use: whatsapp, ligacao ou email')

    tarefa = await atualizar_tarefa_cadencia(
        db,
        deal_id,
        dia,
        concluir=False,
        canal=canal or None,
        notas=payload.get('notas'),
        responsavel_id=current_user.get('id')
    )
    return {"status": "ok", "tarefa": tarefa}


@api_router.post("/follow-up-cadences/{deal_id}/tasks/{dia}/complete")
async def complete_followup_task(
    deal_id: str,
    dia: int,
    payload: dict = Body(default={}),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Concluir tarefa da cadência, registrando tentativa e atividade."""
    canal = (payload.get('canal') or '').lower()
    if canal and canal not in ACTIVITY_TYPE_BY_CHANNEL:
        raise HTTPException(status_code=400, detail='Canal inválido. Use: whatsapp, ligacao ou email')

    tarefa = await atualizar_tarefa_cadencia(
        db,
        deal_id,
        dia,
        concluir=True,
        canal=canal or None,
        notas=payload.get('notas'),
        responsavel_id=current_user.get('id')
    )
    return {"status": "ok", "tarefa": tarefa}


# PROPOSALS ENDPOINTS
@api_router.post("/proposals", response_model=Proposal)
async def create_proposal(
    proposal_data: ProposalCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Criar proposta"""
    proposal = Proposal(**proposal_data.model_dump())
    
    doc = proposal.model_dump()
    doc['data'] = doc['data'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.proposals.insert_one(doc)
    return proposal


@api_router.get("/proposals", response_model=List[Proposal])
async def list_proposals(
    deal_id: Optional[str] = None,
    lead_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Listar propostas"""
    query = {}
    
    if deal_id:
        query['deal_id'] = deal_id
    if lead_id:
        query['lead_id'] = lead_id
    
    proposals = await db.proposals.find(query, {"_id": 0}).to_list(1000)
    
    for proposal in proposals:
        if isinstance(proposal.get('data'), str):
            proposal['data'] = datetime.fromisoformat(proposal['data'])
        if isinstance(proposal.get('created_at'), str):
            proposal['created_at'] = datetime.fromisoformat(proposal['created_at'])
        if isinstance(proposal.get('updated_at'), str):
            proposal['updated_at'] = datetime.fromisoformat(proposal['updated_at'])
    
    return proposals


# APPOINTMENTS ENDPOINTS
@api_router.post("/appointments", response_model=Appointment)
async def create_appointment(
    appointment_data: AppointmentCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Criar compromisso (meet/visita)"""
    appointment = Appointment(**appointment_data.model_dump())
    
    doc = appointment.model_dump()
    doc['data_hora'] = doc['data_hora'].isoformat()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.appointments.insert_one(doc)
    return appointment


@api_router.get("/appointments", response_model=List[Appointment])
async def list_appointments(
    responsavel_id: Optional[str] = None,
    tipo: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Listar compromissos da agenda"""
    query = {}
    
    if responsavel_id:
        query['responsavel_id'] = responsavel_id
    elif current_user['role'] in ['sdr', 'closer']:
        query['responsavel_id'] = current_user['id']
    
    if tipo:
        query['tipo'] = tipo
    
    appointments = await db.appointments.find(query, {"_id": 0}).sort("data_hora", 1).to_list(1000)
    
    for appointment in appointments:
        if isinstance(appointment.get('data_hora'), str):
            appointment['data_hora'] = datetime.fromisoformat(appointment['data_hora'])
        if isinstance(appointment.get('created_at'), str):
            appointment['created_at'] = datetime.fromisoformat(appointment['created_at'])
        if isinstance(appointment.get('updated_at'), str):
            appointment['updated_at'] = datetime.fromisoformat(appointment['updated_at'])
        if isinstance(appointment.get('concluido_em'), str):
            appointment['concluido_em'] = datetime.fromisoformat(appointment['concluido_em'])
    
    return appointments


@api_router.put("/appointments/{appointment_id}", response_model=Appointment)
async def update_appointment(
    appointment_id: str,
    appointment_data: AppointmentUpdate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    existing = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Compromisso não encontrado")

    if current_user['role'] in ['sdr', 'closer'] and existing.get('responsavel_id') != current_user['id']:
        raise HTTPException(status_code=403, detail="Sem permissão para atualizar este compromisso")

    update_data = {k: v for k, v in appointment_data.model_dump(exclude_none=True).items()}
    if 'data_hora' in update_data:
        update_data['data_hora'] = update_data['data_hora'].isoformat()

    if 'concluido' in update_data:
        update_data['concluido_em'] = datetime.now(timezone.utc).isoformat() if update_data['concluido'] else None

    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()

    await db.appointments.update_one({"id": appointment_id}, {"$set": update_data})

    updated = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    for field in ['data_hora', 'created_at', 'updated_at', 'concluido_em']:
        if isinstance(updated.get(field), str):
            updated[field] = datetime.fromisoformat(updated[field])

    return updated


# NOTIFICATIONS ENDPOINTS
@api_router.get("/notifications", response_model=List[Notification])
async def list_notifications(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Listar notifica\u00e7\u00f5es do usu\u00e1rio"""
    notifications = await db.notifications.find(
        {"user_id": current_user['id']},
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    for notif in notifications:
        if isinstance(notif.get('created_at'), str):
            notif['created_at'] = datetime.fromisoformat(notif['created_at'])
    
    return notifications


@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Marcar notifica\u00e7\u00e3o como lida"""
    await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user['id']},
        {"$set": {"lida": True}}
    )
    return {"status": "ok"}


# WHATSAPP ENDPOINTS
@api_router.get("/whatsapp/templates", response_model=List[WhatsAppTemplate])
async def list_whatsapp_templates(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Listar templates de WhatsApp"""
    templates = await db.whatsapp_templates.find({"ativo": True}, {"_id": 0}).to_list(100)
    
    for template in templates:
        if isinstance(template.get('created_at'), str):
            template['created_at'] = datetime.fromisoformat(template['created_at'])
        if isinstance(template.get('updated_at'), str):
            template['updated_at'] = datetime.fromisoformat(template['updated_at'])
    
    return templates


@api_router.post("/whatsapp/link")
async def generate_whatsapp_link(
    telefone: str,
    template_id: Optional[str] = None,
    mensagem_custom: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Gerar link wa.me"""
    mensagem = mensagem_custom or ""
    
    if template_id:
        template = await db.whatsapp_templates.find_one({"id": template_id}, {"_id": 0})
        if template:
            mensagem = template['mensagem']
    
    link = gerar_link_whatsapp(telefone, mensagem)
    
    # Registrar atividade
    return {"link": link}


# DASHBOARD ENDPOINTS
@api_router.get("/dashboard/metrics")
async def get_dashboard_metrics(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """M\u00e9tricas do dashboard executivo"""
    await atualizar_alertas_sla_speed_to_lead(db)

    # Leads ativos (não arquivados) e arquivados
    total_leads = await db.leads.count_documents({"arquivado": {"$ne": True}})
    leads_arquivados = await db.leads.count_documents({"arquivado": True})

    # Leads por classifica\u00e7\u00e3o
    leads_a = await db.leads.count_documents({"classificacao": "A"})
    leads_b = await db.leads.count_documents({"classificacao": "B"})
    leads_c = await db.leads.count_documents({"classificacao": "C"})
    
    # Deals por etapa
    pipeline_counts = {}
    for etapa in PipelineStage:
        count = await db.deals.count_documents({"etapa": etapa.value})
        pipeline_counts[etapa.value] = count
    
    # SLA m\u00e9dio
    speed_to_lead_filter = {
        "ignorar_speed_to_lead": {"$ne": True},
        "arquivado": {"$ne": True}
    }

    leads_com_sla = await db.leads.find(
        {**speed_to_lead_filter, "status_sla_minutos": {"$ne": None}},
        {"_id": 0, "status_sla_minutos": 1}
    ).to_list(1000)
    
    sla_medio = 0
    sla_dentro_10min = 0
    if leads_com_sla:
        sla_medio = sum(l['status_sla_minutos'] for l in leads_com_sla) / len(leads_com_sla)
        sla_dentro_10min = len([l for l in leads_com_sla if l['status_sla_minutos'] <= SLA_SPEED_TO_LEAD_MINUTOS])
    
    leads_sem_contato = await db.leads.count_documents({**speed_to_lead_filter, "primeiro_contato_em": None})
    leads_sla_em_risco = await db.leads.count_documents({
        **speed_to_lead_filter,
        "primeiro_contato_em": None,
        "status_sla_minutos": {"$gt": SLA_SPEED_TO_LEAD_MINUTOS}
    })

    # Deals fechados
    fechados_ganhos = await db.deals.count_documents({"etapa": PipelineStage.FECHADO_GANHO.value})
    fechados_perdidos = await db.deals.count_documents({"etapa": PipelineStage.FECHADO_PERDIDO.value})
    
    # Valor total de propostas
    deals_com_valor = await db.deals.find(
        {"valor_estimado": {"$ne": None}},
        {"_id": 0, "valor_estimado": 1}
    ).to_list(1000)
    
    valor_total = sum(d.get('valor_estimado', 0) for d in deals_com_valor)
    ticket_medio = valor_total / len(deals_com_valor) if deals_com_valor else 0
    
    # Propostas paradas (sem atividade em 3+ dias)
    tres_dias_atras = datetime.now(timezone.utc) - timedelta(days=3)
    deals_em_followup = await db.deals.find(
        {"etapa": {"$in": [PipelineStage.PROPOSTA_ENVIADA.value, PipelineStage.NEGOCIACAO.value]}},
        {"_id": 0, "id": 1, "updated_at": 1}
    ).to_list(5000)

    propostas_paradas = 0
    for deal in deals_em_followup:
        ultima_atividade = await db.activities.find(
            {"deal_id": deal['id']},
            {"_id": 0, "data_hora": 1}
        ).sort("data_hora", -1).limit(1).to_list(1)

        referencia = deal.get('updated_at')
        if ultima_atividade:
            referencia = ultima_atividade[0].get('data_hora')

        if not referencia:
            continue

        referencia_dt = datetime.fromisoformat(referencia) if isinstance(referencia, str) else referencia
        if referencia_dt < tres_dias_atras:
            propostas_paradas += 1

    return {
        "total_leads": total_leads,
        "leads_arquivados": leads_arquivados,
        "leads_a": leads_a,
        "leads_b": leads_b,
        "leads_c": leads_c,
        "pipeline_counts": pipeline_counts,
        "sla_medio_minutos": round(sla_medio, 1),
        "sla_dentro_10min": sla_dentro_10min,
        "sla_percent_dentro": round((sla_dentro_10min / len(leads_com_sla) * 100) if leads_com_sla else 0, 1),
        "sla_limite_minutos": SLA_SPEED_TO_LEAD_MINUTOS,
        "leads_sem_contato": leads_sem_contato,
        "leads_sla_em_risco": leads_sla_em_risco,
        "fechados_ganhos": fechados_ganhos,
        "fechados_perdidos": fechados_perdidos,
        "valor_total_pipeline": round(valor_total, 2),
        "ticket_medio": round(ticket_medio, 2),
        "propostas_paradas": propostas_paradas
    }


# WEBHOOK ENDPOINTS
# Compat: some edge proxies strip the /api prefix before forwarding.
# Expose webhook endpoints with and without /api so landing submissions don't 404.
@app.post("/webhooks/internal/lead-capture")
@api_router.post("/webhooks/internal/lead-capture")
async def webhook_lead_capture(lead_data: WebhookLeadCapture, db=Depends(get_db)):
    """Webhook interno para capturar leads já normalizados."""
    lead_id = await criar_lead_via_webhook(db, lead_data, descricao_origem="webhook")
    return {"status": "ok", "lead_id": lead_id}


@app.post("/webhooks/lead-capture", status_code=status.HTTP_201_CREATED)
@api_router.post("/webhooks/lead-capture", status_code=status.HTTP_201_CREATED)
async def webhook_botconversa_lead_capture(
    request: Request,
    payload: BotConversaWebhookLeadCapture,
    db=Depends(get_db)
):
    """Recebe lead qualificado do BotConversa e cria lead classificado no CRM."""
    logger.info("Webhook BotConversa recebido")
    _validar_secret_webhook(request)

    lead_payload = _construir_payload_webhook_botconversa(payload)
    lead_id = await criar_lead_via_webhook(db, lead_payload, descricao_origem=Origem.BOTCONVERSA.value)

    lead_doc = await db.leads.find_one({"id": lead_id}, {"_id": 0, "classificacao": 1})
    classificacao = lead_doc.get("classificacao") if lead_doc else "B"

    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {
            "status": "qualificado",
            "nome_cliente": payload.crm_nome_cliente,
            "tipo_imovel": payload.crm_tipo_imovel,
            "telhado": payload.crm_telhado,
            "valor_conta": payload.crm_valor_conta,
            "decisao": payload.crm_decisao,
            "origem": Origem.BOTCONVERSA.value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )

    logger.info("Lead criado via BotConversa: id=%s classificacao=%s", lead_id, classificacao)

    return {
        "lead_id": lead_id,
        "classificacao": classificacao,
        "mensagem": "lead criado com sucesso"
    }


@app.get("/webhooks/meta-leads")
@api_router.get("/webhooks/meta-leads")
async def webhook_meta_verify(
    hub_mode: Optional[str] = Query(default=None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(default=None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(default=None, alias="hub.challenge")
):
    """Validação inicial do webhook da Meta."""
    verify_token = os.getenv("META_VERIFY_TOKEN")

    if hub_mode == "subscribe" and verify_token and hub_verify_token == verify_token:
        return int(hub_challenge) if hub_challenge and hub_challenge.isdigit() else (hub_challenge or "")

    raise HTTPException(status_code=403, detail="Falha na verificação do webhook Meta")


@app.post("/webhooks/meta-leads")
@api_router.post("/webhooks/meta-leads")
async def webhook_meta_leads(request: Request, db=Depends(get_db)):
    """Recebe notificações do Facebook Lead Ads e cria leads automaticamente."""
    body = await request.body()
    assinatura = request.headers.get("x-hub-signature-256")
    if not validar_assinatura_meta(body, assinatura):
        raise HTTPException(status_code=401, detail="Assinatura inválida")

    try:
        payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Payload inválido") from exc

    created_leads = []
    ignored_events = 0

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "leadgen":
                ignored_events += 1
                continue

            value = change.get("value", {})
            leadgen_id = value.get("leadgen_id")
            if not leadgen_id:
                ignored_events += 1
                continue

            lead_meta = await buscar_lead_meta(leadgen_id)
            nome = lead_meta.get("full_name") or " ".join(
                [
                    lead_meta.get("first_name", "").strip(),
                    lead_meta.get("last_name", "").strip()
                ]
            ).strip() or f"Lead Meta {leadgen_id}"
            telefone = lead_meta.get("phone_number")

            if not telefone:
                logger.warning("Lead %s ignorado: phone_number ausente", leadgen_id)
                ignored_events += 1
                continue

            lead_payload = WebhookLeadCapture(
                nome=nome,
                telefone=telefone,
                email=lead_meta.get("email"),
                origem="Facebook Ads",
                utm_source="facebook",
                utm_medium="lead_ads",
                utm_campaign=lead_meta.get("campaign_id")
            )

            lead_id = await criar_lead_via_webhook(db, lead_payload, descricao_origem="Meta Lead Ads")
            created_leads.append({"lead_id": lead_id, "leadgen_id": leadgen_id})

    return {
        "status": "ok",
        "created": len(created_leads),
        "ignored": ignored_events,
        "leads": created_leads
    }


# USERS MANAGEMENT (Admin only)
@api_router.get("/users", response_model=List[User])
async def list_users(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Listar usu\u00e1rios (Admin)"""
    # Check role
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    
    for user in users:
        if isinstance(user.get('created_at'), str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
        if isinstance(user.get('last_login'), str):
            user['last_login'] = datetime.fromisoformat(user['last_login'])
    
    return users


@api_router.post("/users", response_model=User)
async def create_user(
    user_data: UserCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Criar novo usuário (Admin)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")

    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")

    user = User(email=user_data.email, nome=user_data.nome, role=user_data.role)
    doc = user.model_dump()
    doc['password_hash'] = get_password_hash(user_data.password)
    doc['created_at'] = doc['created_at'].isoformat()

    await db.users.insert_one(doc)
    return user


@api_router.put("/users/{user_id}", response_model=User)
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Atualizar dados do usuário (Admin)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")

    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    payload = user_data.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    await db.users.update_one({"id": user_id}, {"$set": payload})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})

    if isinstance(updated.get('created_at'), str):
        updated['created_at'] = datetime.fromisoformat(updated['created_at'])
    if isinstance(updated.get('last_login'), str):
        updated['last_login'] = datetime.fromisoformat(updated['last_login'])

    return updated


@api_router.put("/users/{user_id}/password")
async def reset_user_password(
    user_id: str,
    payload: UserPasswordReset,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Resetar senha de usuário (Admin)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")

    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    await db.users.update_one(
        {"id": user_id},
        {"$set": {"password_hash": get_password_hash(payload.password)}}
    )

    return {"status": "ok"}


@api_router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Excluir usuário (Admin)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if current_user.get("id") == user_id:
        raise HTTPException(status_code=400, detail="Não é permitido excluir o próprio usuário")

    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    return {"status": "ok"}


# Health check
@api_router.get("/")
async def root():
    return {"status": "ok", "app": "Alluz Energia CRM"}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
