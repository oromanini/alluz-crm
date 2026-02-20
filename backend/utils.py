from datetime import datetime, timezone
from models import LeadClassification, Lead


def calcular_classificacao_lead(lead_data: dict) -> LeadClassification:
    """Calcula classificação A/B/C automaticamente"""
    conta_media = lead_data.get('conta_media', 0) or 0
    tipo_imovel = lead_data.get('tipo_imovel')
    urgencia = lead_data.get('urgencia')
    tem_sombra = lead_data.get('tem_sombra')
    tipo_telhado = lead_data.get('tipo_telhado', '').lower()
    
    # Lead A: conta >= R$ 450 OU (>= R$ 350 + telhado ideal + decisão <= 30 dias)
    telhado_ideal = tipo_telhado in ['ceramica', 'fibrocimento', 'metalico'] and not tem_sombra
    decisao_rapida = urgencia in ['<= 7 dias', '30 dias']
    
    if conta_media >= 450:
        return LeadClassification.A
    
    if conta_media >= 350 and telhado_ideal and decisao_rapida and tipo_imovel == 'Próprio':
        return LeadClassification.A
    
    # Lead B: conta 350-449 e/ou "pesquisando"
    if (350 <= conta_media < 450) or urgencia == 'Pesquisando':
        return LeadClassification.B
    
    # Lead C: resto (aluguel, sem telhado, ano que vem, conta baixa)
    if tipo_imovel == 'Alugado' or conta_media < 350 or urgencia == '60+ dias':
        return LeadClassification.C
    
    return LeadClassification.C


def calcular_sla_minutos(created_at: datetime, primeiro_contato_em: datetime = None) -> int:
    """Calcula tempo em minutos até primeiro contato"""
    if primeiro_contato_em is None:
        agora = datetime.now(timezone.utc)
        delta = agora - created_at
        return int(delta.total_seconds() / 60)
    
    delta = primeiro_contato_em - created_at
    return int(delta.total_seconds() / 60)


def criar_tarefas_cadencia():
    """Cria tarefas padrão de cadencia de follow-up"""
    return [
        {
            'dia': 0,
            'tipo': 'whatsapp',
            'mensagem': 'Proposta enviada + agendar call 10 min',
            'status': 'pendente',
            'tentativas': 0,
            'completada_em': None
        },
        {
            'dia': 1,
            'tipo': 'ligacao',
            'mensagem': 'Ligação curta (30-60s) + pergunta de prioridade',
            'status': 'pendente',
            'tentativas': 0,
            'completada_em': None
        },
        {
            'dia': 3,
            'tipo': 'whatsapp',
            'mensagem': 'Prova social (caso real) + print do app',
            'status': 'pendente',
            'tentativas': 0,
            'completada_em': None
        },
        {
            'dia': 5,
            'tipo': 'whatsapp',
            'mensagem': 'Comparativo técnico (marca inversor/painéis, ART, padrão)',
            'status': 'pendente',
            'tentativas': 0,
            'completada_em': None
        },
        {
            'dia': 7,
            'tipo': 'whatsapp',
            'mensagem': 'Posso arquivar?',
            'status': 'pendente',
            'tentativas': 0,
            'completada_em': None
        },
        {
            'dia': 10,
            'tipo': 'whatsapp',
            'mensagem': 'Reativação: mudança de cenário (tarifa/agenda/condição)',
            'status': 'pendente',
            'tentativas': 0,
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
