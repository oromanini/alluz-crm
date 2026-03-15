from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from enum import Enum
import uuid


class Role(str, Enum):
    ADMIN = "admin"
    SDR = "sdr"
    CLOSER = "closer"
    TECNICO = "tecnico"
    MARKETING = "marketing"
    INSTALACAO = "instalacao"


class PipelineStage(str, Enum):
    LEAD_NOVO = "Lead Novo"
    CONTATO_REALIZADO = "Contato Realizado"
    QUALIFICADO = "Qualificado"
    MEET_AGENDADO = "Meet Agendado"
    MEET_REALIZADO = "Meet Realizado"
    VISITA_AGENDADA = "Visita Agendada"
    VISITA_REALIZADA = "Visita Realizada"
    PROPOSTA_ENVIADA = "Proposta Enviada"
    NEGOCIACAO = "Negociação"
    FECHADO_GANHO = "Fechado - Ganho"
    FECHADO_PERDIDO = "Fechado - Perdido"
    NUTRICAO = "Nutrição (Lead C)"


class LeadClassification(str, Enum):
    A = "A"
    B = "B"
    C = "C"


class Origem(str, Enum):
    META = "Meta"
    FACEBOOK = "Facebook Ads"
    GOOGLE = "Google"
    INDICACAO = "Indicação"
    ORGANICO = "Orgânico"
    BOTCONVERSA = "BotConversa WhatsApp"
    OUTRO = "Outro"


class TipoImovel(str, Enum):
    PROPRIO = "Próprio"
    ALUGADO = "Alugado"


class Urgencia(str, Enum):
    SETE_DIAS = "<= 7 dias"
    TRINTA_DIAS = "30 dias"
    SESSENTA_MAIS = "60+ dias"
    PESQUISANDO = "Pesquisando"


class ActivityType(str, Enum):
    LIGACAO = "Ligação"
    WHATSAPP = "WhatsApp"
    EMAIL = "Email"
    MEET = "Meet"
    VISITA = "Visita"
    FOLLOWUP = "Follow-up"
    TAREFA = "Tarefa Interna"


class NextAction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    data_hora: datetime
    tipo: str
    descricao: Optional[str] = None
    responsavel: Optional[str] = None
    canal: Optional[str] = None


class UserBase(BaseModel):
    email: str
    nome: str
    role: Role


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    nome: Optional[str] = None
    role: Optional[Role] = None


class UserPasswordReset(BaseModel):
    password: str


class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None


class LeadBase(BaseModel):
    nome: str
    telefone: str
    email: Optional[str] = None
    cidade: Optional[str] = None
    bairro: Optional[str] = None
    origem: Origem = Origem.OUTRO
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    utm_adset: Optional[str] = None
    utm_ad: Optional[str] = None
    conta_media: Optional[float] = None
    consumo_kwh: Optional[float] = None
    tipo_imovel: Optional[TipoImovel] = None
    tipo_telhado: Optional[str] = None
    tem_sombra: Optional[bool] = None
    fase_eletrica: Optional[str] = None
    urgencia: Optional[Urgencia] = None
    decisao_em_ate_30_dias: Optional[bool] = None
    enviou_foto_fatura: Optional[bool] = None
    enviou_foto_telhado: Optional[bool] = None
    apenas_pesquisando: Optional[bool] = None
    imovel_proprio: Optional[bool] = None
    possui_area_util_necessaria: Optional[bool] = None
    ignorar_speed_to_lead: bool = False

    @field_validator("origem", mode="before")
    @classmethod
    def normalize_origem(cls, value):
        if not isinstance(value, str):
            return value

        normalized = value.strip().casefold()
        if not normalized:
            return value

        for origem in Origem:
            if origem.value.casefold() == normalized:
                return origem

        return value


class LeadCreate(LeadBase):
    pass


class Lead(LeadBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    classificacao: LeadClassification = LeadClassification.C
    status_sla_minutos: Optional[int] = None
    primeiro_contato_em: Optional[datetime] = None
    sla_alertado_em: Optional[datetime] = None
    responsavel_id: Optional[str] = None
    arquivado: bool = False
    arquivado_em: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DealBase(BaseModel):
    lead_id: str
    etapa: PipelineStage
    valor_estimado: Optional[float] = None
    margem_estimada: Optional[float] = None
    forma_pagamento: Optional[str] = None
    proxima_acao: Optional[NextAction] = None
    objecao_principal: Optional[str] = None
    motivo_perda: Optional[str] = None
    motivo_perda_texto: Optional[str] = None


class DealCreate(DealBase):
    pass


class Deal(DealBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ciclo_dias: int = 0
    responsavel_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    closed_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ActivityBase(BaseModel):
    deal_id: Optional[str] = None
    lead_id: str
    tipo: ActivityType
    data_hora: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    notas: Optional[str] = None
    resultado: Optional[str] = None


class ActivityCreate(ActivityBase):
    responsavel_id: str


class Activity(ActivityBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    responsavel_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProposalBase(BaseModel):
    deal_id: str
    lead_id: str
    numero: str
    valor: float
    anexos: List[str] = Field(default_factory=list)
    link_externo: Optional[str] = None
    status: str = "enviada"
    comparacao_concorrente: Optional[Dict[str, Any]] = None


class ProposalCreate(ProposalBase):
    pass


class Proposal(ProposalBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    data: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DocumentBase(BaseModel):
    lead_id: str
    deal_id: Optional[str] = None
    tipo: str
    nome_arquivo: str
    url: str
    tamanho: int


class DocumentCreate(DocumentBase):
    uploaded_by: str


class Document(DocumentBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uploaded_by: str
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AppointmentBase(BaseModel):
    deal_id: str
    lead_id: str
    tipo: str
    data_hora: datetime
    duracao_minutos: int = 60
    notas: Optional[str] = None


class AppointmentCreate(AppointmentBase):
    responsavel_id: str


class Appointment(AppointmentBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    responsavel_id: str
    origem: str = "manual"
    confirmado: bool = False
    concluido: bool = False
    concluido_em: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AppointmentUpdate(BaseModel):
    data_hora: Optional[datetime] = None
    duracao_minutos: Optional[int] = None
    notas: Optional[str] = None
    confirmado: Optional[bool] = None
    concluido: Optional[bool] = None

class FollowUpTask(BaseModel):
    dia: int
    tipo: str
    mensagem: str
    status: str = "pendente"
    tentativas: int = 0
    historico_tentativas: List[Dict[str, Any]] = Field(default_factory=list)
    completada_em: Optional[datetime] = None


class FollowUpCadenceBase(BaseModel):
    deal_id: str
    status: str = "ativa"
    tarefas: List[FollowUpTask] = Field(default_factory=list)


class FollowUpCadenceCreate(FollowUpCadenceBase):
    pass


class FollowUpCadence(FollowUpCadenceBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class NotificationBase(BaseModel):
    user_id: str
    tipo: str
    mensagem: str
    link: Optional[str] = None


class NotificationCreate(NotificationBase):
    pass


class Notification(NotificationBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lida: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WhatsAppTemplateBase(BaseModel):
    nome: str
    categoria: str
    mensagem: str
    ativo: bool = True


class WhatsAppTemplateCreate(WhatsAppTemplateBase):
    pass


class WhatsAppTemplate(WhatsAppTemplateBase):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: str
    password: str


class WebhookLeadCapture(BaseModel):
    nome: str
    telefone: str
    email: Optional[str] = None
    origem: str = "Meta"
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    conta_media: Optional[float] = None
    urgencia: Optional[str] = None
    tipo_imovel: Optional[str] = None
    tipo_telhado: Optional[str] = None
    decisao_em_ate_30_dias: Optional[bool] = None
    enviou_foto_fatura: Optional[bool] = None
    enviou_foto_telhado: Optional[bool] = None
    apenas_pesquisando: Optional[bool] = None
    imovel_proprio: Optional[bool] = None
    possui_area_util_necessaria: Optional[bool] = None


class BotConversaWebhookLeadCapture(BaseModel):
    crm_nome_cliente: str
    crm_tipo_imovel: str
    crm_telhado: str
    crm_valor_conta: str
    crm_decisao: str

    @field_validator("crm_nome_cliente")
    @classmethod
    def normalize_nome_cliente(cls, value: str) -> str:
        nome = value.strip()
        if not nome:
            raise ValueError("crm_nome_cliente é obrigatório")
        return nome

    @field_validator("crm_tipo_imovel")
    @classmethod
    def validate_tipo_imovel(cls, value: str) -> str:
        normalized = value.strip().lower()
        allowed = {"proprio", "alugado"}
        if normalized not in allowed:
            raise ValueError("crm_tipo_imovel inválido. Use: proprio | alugado")
        return normalized

    @field_validator("crm_telhado")
    @classmethod
    def validate_telhado(cls, value: str) -> str:
        normalized = value.strip().lower()
        allowed = {"colonial", "laje", "metalico", "fibromadeira"}
        if normalized not in allowed:
            raise ValueError("crm_telhado inválido. Use: colonial | laje | metalico | fibromadeira")
        return normalized

    @field_validator("crm_valor_conta")
    @classmethod
    def validate_valor_conta(cls, value: str) -> str:
        normalized = value.strip().lower()
        allowed = {"300-600", "601-1000", "1000-2000", ">2000"}
        if normalized not in allowed:
            raise ValueError("crm_valor_conta inválido. Use: 300-600 | 601-1000 | 1000-2000 | >2000")
        return normalized

    @field_validator("crm_decisao")
    @classmethod
    def validate_decisao(cls, value: str) -> str:
        normalized = value.strip().lower()
        allowed = {"30dias", "90dias", ">90dias"}
        if normalized not in allowed:
            raise ValueError("crm_decisao inválido. Use: 30dias | 90dias | >90dias")
        return normalized
