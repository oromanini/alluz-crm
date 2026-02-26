from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from models import LeadClassification


TIMEZONE_BR = ZoneInfo("America/Sao_Paulo")
BUSINESS_START_HOUR = 8
BUSINESS_END_HOUR = 18


def _normalize_text(value) -> str:
    """Normaliza valores opcionais para comparação segura."""
    if value is None:
        return ''

    if hasattr(value, 'value'):
        value = value.value

    return str(value).strip()


def calcular_classificacao_lead(lead_data: dict) -> LeadClassification:
    """Calcula classificação A/B/C automaticamente com base no checklist de contato."""
    conta_media = lead_data.get('conta_media', 0) or 0
    tipo_imovel = _normalize_text(lead_data.get('tipo_imovel'))
    urgencia = _normalize_text(lead_data.get('urgencia'))
    tem_sombra = lead_data.get('tem_sombra')
    tipo_telhado = _normalize_text(lead_data.get('tipo_telhado')).lower()

    decisao_em_ate_30_dias = lead_data.get('decisao_em_ate_30_dias')
    enviou_foto_fatura = lead_data.get('enviou_foto_fatura')
    enviou_foto_telhado = lead_data.get('enviou_foto_telhado')
    apenas_pesquisando = lead_data.get('apenas_pesquisando')
    imovel_proprio_checklist = lead_data.get('imovel_proprio')
    possui_area_util = lead_data.get('possui_area_util_necessaria')

    # Compatibilidade com os campos legados para quem ainda não preencheu checklist
    telhado_ideal = tipo_telhado in ['ceramica', 'fibrocimento', 'metalico'] and not tem_sombra
    if decisao_em_ate_30_dias is None:
        decisao_em_ate_30_dias = urgencia in ['<= 7 dias', '30 dias']
    if apenas_pesquisando is None:
        apenas_pesquisando = urgencia == 'Pesquisando'
    if imovel_proprio_checklist is None:
        imovel_proprio_checklist = tipo_imovel == 'Próprio'
    if possui_area_util is None:
        possui_area_util = bool(telhado_ideal)

    # Lead C: abaixo do perfil, aluguel, sem área/telhado ou decisão para depois
    if (
        imovel_proprio_checklist is False
        or possui_area_util is False
        or enviou_foto_telhado is False
        or decisao_em_ate_30_dias is False
    ):
        return LeadClassification.C

    # Lead A: conta >= 500 + decisão <= 30 dias + fotos da conta e telhado
    if (
        conta_media >= 500
        and decisao_em_ate_30_dias
        and enviou_foto_fatura
        and enviou_foto_telhado
        and imovel_proprio_checklist
        and possui_area_util
    ):
        return LeadClassification.A

    # Lead B: conta < 500 e/ou pesquisando
    if conta_media < 500 or apenas_pesquisando:
        return LeadClassification.B

    return LeadClassification.B


def checklist_qualificacao_preenchido(lead_data: dict) -> bool:
    checklist_fields = [
        'decisao_em_ate_30_dias',
        'enviou_foto_fatura',
        'enviou_foto_telhado',
        'apenas_pesquisando',
        'imovel_proprio',
        'possui_area_util_necessaria',
    ]
    return all(lead_data.get(field) is not None for field in checklist_fields)


def _to_br_timezone(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TIMEZONE_BR)


def _business_window_for_day(reference: datetime) -> tuple[datetime, datetime]:
    start = reference.replace(
        hour=BUSINESS_START_HOUR,
        minute=0,
        second=0,
        microsecond=0,
    )
    end = reference.replace(
        hour=BUSINESS_END_HOUR,
        minute=0,
        second=0,
        microsecond=0,
    )
    return start, end


def is_business_time(reference: datetime | None = None) -> bool:
    dt = _to_br_timezone(reference or datetime.now(timezone.utc))
    if dt.weekday() >= 5:
        return False

    start, end = _business_window_for_day(dt)
    return start <= dt < end


def calcular_minutos_horario_comercial(inicio: datetime, fim: datetime) -> int:
    """Calcula minutos transcorridos apenas no horário comercial (seg-sex, 08h-18h)."""
    if fim <= inicio:
        return 0

    cursor = _to_br_timezone(inicio)
    fim_local = _to_br_timezone(fim)
    total = timedelta()

    while cursor < fim_local:
        if cursor.weekday() >= 5:
            # Pula para o próximo dia útil
            cursor = (cursor + timedelta(days=1)).replace(hour=BUSINESS_START_HOUR, minute=0, second=0, microsecond=0)
            continue

        start_day, end_day = _business_window_for_day(cursor)

        if cursor < start_day:
            cursor = start_day
            continue

        if cursor >= end_day:
            cursor = (cursor + timedelta(days=1)).replace(hour=BUSINESS_START_HOUR, minute=0, second=0, microsecond=0)
            continue

        upper_bound = min(end_day, fim_local)
        total += upper_bound - cursor
        cursor = upper_bound

    return max(int(total.total_seconds() / 60), 0)


def calcular_sla_minutos(created_at: datetime, primeiro_contato_em: datetime = None) -> int:
    """Calcula tempo em minutos até primeiro contato, considerando apenas horário comercial."""
    fim = primeiro_contato_em or datetime.now(timezone.utc)
    return calcular_minutos_horario_comercial(created_at, fim)


def criar_tarefas_cadencia():
    """Cria tarefas padrão de cadencia de follow-up"""
    return [
        {
            'dia': 0,
            'tipo': 'whatsapp',
            'mensagem': 'Proposta enviada + agendar call 10 min',
            'status': 'pendente',
            'tentativas': 0,
            'historico_tentativas': [],
            'completada_em': None
        },
        {
            'dia': 1,
            'tipo': 'ligacao',
            'mensagem': 'Ligação curta (30-60s) + pergunta de prioridade',
            'status': 'pendente',
            'tentativas': 0,
            'historico_tentativas': [],
            'completada_em': None
        },
        {
            'dia': 3,
            'tipo': 'whatsapp',
            'mensagem': 'Prova social (caso real) + print do app',
            'status': 'pendente',
            'tentativas': 0,
            'historico_tentativas': [],
            'completada_em': None
        },
        {
            'dia': 5,
            'tipo': 'whatsapp',
            'mensagem': 'Comparativo técnico (marca inversor/painéis, ART, padrão)',
            'status': 'pendente',
            'tentativas': 0,
            'historico_tentativas': [],
            'completada_em': None
        },
        {
            'dia': 7,
            'tipo': 'whatsapp',
            'mensagem': 'Posso arquivar?',
            'status': 'pendente',
            'tentativas': 0,
            'historico_tentativas': [],
            'completada_em': None
        },
        {
            'dia': 10,
            'tipo': 'whatsapp',
            'mensagem': 'Reativação: mudança de cenário (tarifa/agenda/condição)',
            'status': 'pendente',
            'tentativas': 0,
            'historico_tentativas': [],
            'completada_em': None
        }
    ]


def gerar_link_whatsapp(telefone: str, mensagem: str = '') -> str:
    """Gera link wa.me para WhatsApp"""
    # Remove caracteres especiais do telefone
    telefone_limpo = ''.join(filter(str.isdigit, telefone))
    
    # Adiciona código do Brasil se necessário
    if not telefone_limpo.startswith('55'):
        telefone_limpo = '55' + telefone_limpo
    
    if mensagem:
        import urllib.parse
        mensagem_encoded = urllib.parse.quote(mensagem)
        return f'https://wa.me/{telefone_limpo}?text={mensagem_encoded}'
    
    return f'https://wa.me/{telefone_limpo}'


def validar_proxima_acao(etapa: str, proxima_acao: dict = None) -> bool:
    """Valida se próxima ação é obrigatória para a etapa"""
    etapas_requerem_proxima_acao = ['Proposta Enviada', 'Negociação']
    
    if etapa in etapas_requerem_proxima_acao:
        if not proxima_acao:
            return False
        if not proxima_acao.get('data_hora') or not proxima_acao.get('tipo'):
            return False
    
    return True
