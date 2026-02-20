from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, File, UploadFile
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional
import uuid

from models import (
    User, UserCreate, Lead, LeadCreate, Deal, DealCreate,
    Activity, ActivityCreate, Proposal, ProposalCreate,
    Document, DocumentCreate, Appointment, AppointmentCreate,
    FollowUpCadence, FollowUpCadenceCreate, Notification, NotificationCreate,
    WhatsAppTemplate, WhatsAppTemplateCreate, Token, LoginRequest,
    WebhookLeadCapture, PipelineStage, Role
)
from auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user_dependency, require_role_dependency
)
from utils import (
    calcular_classificacao_lead, calcular_sla_minutos,
    criar_tarefas_cadencia, gerar_link_whatsapp, validar_proxima_acao
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


# Dependency to get db in routes
async def get_db():
    return db

# Auth dependency
get_current_user = get_current_user_dependency(db)


# AUTH ENDPOINTS
@api_router.post("/auth/register", response_model=User)
async def register(user_data: UserCreate, db=Depends(get_db)):
    """Registrar novo usu\u00e1rio (apenas Admin)"""
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email j\u00e1 cadastrado")
    
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
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Listar leads com filtros"""
    query = {}
    
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
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db)
):
    """Listar oportunidades"""
    query = {}
    
    if etapa:
        query['etapa'] = etapa
    if responsavel_id:
        query['responsavel_id'] = responsavel_id
    
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
    """Atualizar deal - valida pr\u00f3xima a\u00e7\u00e3o"""
    existing = await db.deals.find_one({"id": deal_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deal n\u00e3o encontrado")
    
    # Validar pr\u00f3xima a\u00e7\u00e3o
    proxima_acao_dict = deal_data.proxima_acao.model_dump() if deal_data.proxima_acao else None
    if not validar_proxima_acao(deal_data.etapa, proxima_acao_dict):
        raise HTTPException(
            status_code=400,
            detail="Pr\u00f3xima a\u00e7\u00e3o \u00e9 obrigat\u00f3ria para esta etapa (Proposta Enviada/Negocia\u00e7\u00e3o)"
        )
    
    update_data = deal_data.model_dump()
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Se moveu para "Proposta Enviada", criar cad\u00eancia autom\u00e1tica
    if deal_data.etapa == PipelineStage.PROPOSTA_ENVIADA and existing.get('etapa') != PipelineStage.PROPOSTA_ENVIADA:
        cadencia = FollowUpCadence(
            deal_id=deal_id,
            tarefas=criar_tarefas_cadencia()
        )
        cadencia_doc = cadencia.model_dump()
        cadencia_doc['created_at'] = cadencia_doc['created_at'].isoformat()
        cadencia_doc['updated_at'] = cadencia_doc['updated_at'].isoformat()
        await db.follow_up_cadences.insert_one(cadencia_doc)
    
    # Se fechou, marcar closed_at
    if deal_data.etapa in [PipelineStage.FECHADO_GANHO, PipelineStage.FECHADO_PERDIDO]:
        update_data['closed_at'] = datetime.now(timezone.utc).isoformat()
    
    # Serializar proxima_acao
    if update_data.get('proxima_acao'):
        update_data['proxima_acao']['data_hora'] = update_data['proxima_acao']['data_hora'].isoformat()
    
    await db.deals.update_one({"id": deal_id}, {"$set": update_data})
    
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
        sla_minutos = calcular_sla_minutos(
            datetime.fromisoformat(lead['created_at']),
            primeiro_contato
        )
        
        await db.leads.update_one(
            {"id": activity.lead_id},
            {
                "$set": {
                    "primeiro_contato_em": primeiro_contato.isoformat(),
                    "status_sla_minutos": sla_minutos
                }
            }
        )
        
        # Notificar se SLA estourou (>10 min)
        if sla_minutos > 10:
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
    
    return appointments


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
    # Leads totais
    total_leads = await db.leads.count_documents({})
    
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
    leads_com_sla = await db.leads.find(
        {"status_sla_minutos": {"$ne": None}},
        {"_id": 0, "status_sla_minutos": 1}
    ).to_list(1000)
    
    sla_medio = 0
    sla_dentro_10min = 0
    if leads_com_sla:
        sla_medio = sum(l['status_sla_minutos'] for l in leads_com_sla) / len(leads_com_sla)
        sla_dentro_10min = len([l for l in leads_com_sla if l['status_sla_minutos'] <= 10])
    
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
    propostas_paradas = await db.deals.count_documents({
        "etapa": {"$in": [PipelineStage.PROPOSTA_ENVIADA.value, PipelineStage.NEGOCIACAO.value]},
        "updated_at": {"$lt": tres_dias_atras.isoformat()}
    })
    
    return {
        "total_leads": total_leads,
        "leads_a": leads_a,
        "leads_b": leads_b,
        "leads_c": leads_c,
        "pipeline_counts": pipeline_counts,
        "sla_medio_minutos": round(sla_medio, 1),
        "sla_dentro_10min": sla_dentro_10min,
        "sla_percent_dentro": round((sla_dentro_10min / len(leads_com_sla) * 100) if leads_com_sla else 0, 1),
        "fechados_ganhos": fechados_ganhos,
        "fechados_perdidos": fechados_perdidos,
        "valor_total_pipeline": round(valor_total, 2),
        "ticket_medio": round(ticket_medio, 2),
        "propostas_paradas": propostas_paradas
    }


# WEBHOOK ENDPOINTS
@api_router.post("/webhooks/lead-capture")
async def webhook_lead_capture(lead_data: WebhookLeadCapture, db=Depends(get_db)):
    """Webhook para capturar leads do Meta Lead Ads"""
    # Criar lead
    lead = Lead(
        nome=lead_data.nome,
        telefone=lead_data.telefone,
        email=lead_data.email,
        origem=lead_data.origem,
        utm_source=lead_data.utm_source,
        utm_medium=lead_data.utm_medium,
        utm_campaign=lead_data.utm_campaign,
        conta_media=lead_data.conta_media,
        urgencia=lead_data.urgencia
    )
    
    # Calcular classifica\u00e7\u00e3o
    lead.classificacao = calcular_classificacao_lead(lead_data.model_dump())
    
    doc = lead.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.leads.insert_one(doc)
    
    # Criar deal
    deal = Deal(
        lead_id=lead.id,
        etapa=PipelineStage.LEAD_NOVO
    )
    deal_doc = deal.model_dump()
    deal_doc['created_at'] = deal_doc['created_at'].isoformat()
    deal_doc['updated_at'] = deal_doc['updated_at'].isoformat()
    await db.deals.insert_one(deal_doc)
    
    # Notificar SDRs
    sdrs = await db.users.find({"role": "sdr"}, {"_id": 0}).to_list(100)
    for sdr in sdrs:
        notif = Notification(
            user_id=sdr['id'],
            tipo="lead_novo",
            mensagem=f"Novo lead via webhook: {lead.nome} - {lead.classificacao}",
            link=f"/lead/{lead.id}"
        )
        notif_doc = notif.model_dump()
        notif_doc['created_at'] = notif_doc['created_at'].isoformat()
        await db.notifications.insert_one(notif_doc)
    
    return {"status": "ok", "lead_id": lead.id}


# USERS MANAGEMENT (Admin only)
@api_router.get("/users", response_model=List[User])
async def list_users(
    current_user: dict = Depends(require_role(Role.ADMIN)),
    db=Depends(get_db)
):
    """Listar usu\u00e1rios (Admin)"""
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    
    for user in users:
        if isinstance(user.get('created_at'), str):
            user['created_at'] = datetime.fromisoformat(user['created_at'])
        if isinstance(user.get('last_login'), str):
            user['last_login'] = datetime.fromisoformat(user['last_login'])
    
    return users


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
