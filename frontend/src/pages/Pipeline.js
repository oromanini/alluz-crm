import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { dealsAPI, leadsAPI, followUpCadenceAPI } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Phone, MessageCircle, Calendar, AlertCircle, Pencil, Pause, Play, Check } from 'lucide-react';
import { toast } from 'sonner';

const PIPELINE_STAGES = [
  'Lead Novo',
  'Contato Realizado',
  'Qualificado',
  'Meet Agendado',
  'Meet Realizado',
  'Visita Agendada',
  'Visita Realizada',
  'Proposta Enviada',
  'Negociação',
  'Fechado - Ganho',
  'Fechado - Perdido',
  'Nutrição (Lead C)'
];

const CHECKLIST_FIELDS = [
  { key: 'decisao_em_ate_30_dias', label: 'Provável decisão em até 30 dias?' },
  { key: 'enviou_foto_fatura', label: 'Enviou foto da fatura?' },
  { key: 'enviou_foto_telhado', label: 'Enviou foto do telhado?' },
  { key: 'apenas_pesquisando', label: 'Está apenas pesquisando?' },
  { key: 'imovel_proprio', label: 'Imóvel próprio?' },
  { key: 'possui_area_util_necessaria', label: 'Possui área útil necessária?' },
];

const initialChecklistState = CHECKLIST_FIELDS.reduce((acc, field) => ({ ...acc, [field.key]: '' }), {});

const getClassificationBadge = (classificacao) => {
  const styles = {
    A: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    B: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    C: 'bg-orange-900/10 text-orange-700 border-orange-900/20'
  };
  return styles[classificacao] || '';
};

const getClassificationGuidance = (classificacao) => {
  if (classificacao === 'A') return 'Prioridade alta • Meta visita em 48h';
  if (classificacao === 'B') return 'Meet e fechamento remoto';
  if (classificacao === 'C') return 'Nutrição (não consome agenda)';
  return '';
};

const serializeChecklistValue = (value) => {
  if (value === 'sim') return true;
  if (value === 'nao') return false;
  return null;
};

const hasChecklistCompleted = (lead) => CHECKLIST_FIELDS.every((field) => lead?.[field.key] !== null && lead?.[field.key] !== undefined);

const toDateTimeLocalValue = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';

  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
};

const buildLeadUpdatePayload = (lead, checklistPayload) => {
  const {
    id,
    classificacao,
    status_sla_minutos,
    primeiro_contato_em,
    sla_alertado_em,
    responsavel_id,
    created_at,
    updated_at,
    ...baseLeadData
  } = lead;

  return {
    ...baseLeadData,
    ...checklistPayload,
  };
};

const formatPhoneMask = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const formatCurrencyMask = (value) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';

  const number = Number(digits) / 100;
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const parseCurrencyMaskToNumber = (value) => {
  if (!value) return null;

  const normalized = value.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const buildLeadFormData = (lead) => ({
  nome: lead.nome || '',
  telefone: formatPhoneMask(lead.telefone || ''),
  email: lead.email || '',
  cidade: lead.cidade || '',
  bairro: lead.bairro || '',
  conta_media: lead.conta_media ? Number(lead.conta_media).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) : '',
  origem: lead.origem || 'Outro',
});

export default function Pipeline() {
  const navigate = useNavigate();
  const [deals, setDeals] = useState([]);
  const [leadsMap, setLeadsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingDeal, setIsSavingDeal] = useState(false);
  const [dealInEdition, setDealInEdition] = useState(null);
  const [dealFormData, setDealFormData] = useState({
    etapa: '',
    valor_estimado: '',
    proxima_acao_tipo: '',
    proxima_acao_descricao: '',
    proxima_acao_data_hora: '',
  });
  const [isChecklistModalOpen, setIsChecklistModalOpen] = useState(false);
  const [isSavingChecklist, setIsSavingChecklist] = useState(false);
  const [checklistFormData, setChecklistFormData] = useState(initialChecklistState);
  const [pendingStageChange, setPendingStageChange] = useState(null);
  const [cadence, setCadence] = useState(null);
  const [cadenceLoading, setCadenceLoading] = useState(false);
  const [cadenceNote, setCadenceNote] = useState('');
  const [cadenceChannel, setCadenceChannel] = useState('whatsapp');
  const [leadFormData, setLeadFormData] = useState(buildLeadFormData({}));
  const [isSavingLead, setIsSavingLead] = useState(false);
  const [isArchivingLead, setIsArchivingLead] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [dealsResponse, leadsResponse] = await Promise.all([
        dealsAPI.list(),
        leadsAPI.list()
      ]);
      setDeals(dealsResponse.data);

      const leadsById = {};
      leadsResponse.data.forEach((lead) => {
        leadsById[lead.id] = lead;
      });
      setLeadsMap(leadsById);
    } catch (error) {
      console.error('Error fetching data', error);
      toast.error('Erro ao carregar pipeline');
    } finally {
      setLoading(false);
    }
  };

  const reorderDeals = (allDeals, source, destination, draggableId, nextStage) => {
    const sourceList = allDeals.filter((deal) => deal.etapa === source.droppableId);
    const destinationList = source.droppableId === destination.droppableId
      ? sourceList
      : allDeals.filter((deal) => deal.etapa === destination.droppableId);

    const movingIndex = sourceList.findIndex((deal) => deal.id === draggableId);
    if (movingIndex === -1) {
      return allDeals;
    }

    const [movedDeal] = sourceList.splice(movingIndex, 1);
    destinationList.splice(destination.index, 0, { ...movedDeal, etapa: nextStage });

    return PIPELINE_STAGES.flatMap((stage) => {
      if (stage === source.droppableId && source.droppableId === destination.droppableId) {
        return destinationList;
      }
      if (stage === source.droppableId) {
        return sourceList;
      }
      if (stage === destination.droppableId) {
        return destinationList;
      }
      return allDeals.filter((deal) => deal.etapa === stage);
    });
  };

  const openChecklistModal = (deal, toStage, mode = 'drag') => {
    const lead = leadsMap[deal.lead_id];
    if (!lead) {
      toast.error('Lead não encontrado para classificação');
      return;
    }

    setPendingStageChange({ deal, toStage, mode });
    setChecklistFormData({
      decisao_em_ate_30_dias: lead.decisao_em_ate_30_dias === true ? 'sim' : lead.decisao_em_ate_30_dias === false ? 'nao' : '',
      enviou_foto_fatura: lead.enviou_foto_fatura === true ? 'sim' : lead.enviou_foto_fatura === false ? 'nao' : '',
      enviou_foto_telhado: lead.enviou_foto_telhado === true ? 'sim' : lead.enviou_foto_telhado === false ? 'nao' : '',
      apenas_pesquisando: lead.apenas_pesquisando === true ? 'sim' : lead.apenas_pesquisando === false ? 'nao' : '',
      imovel_proprio: lead.imovel_proprio === true ? 'sim' : lead.imovel_proprio === false ? 'nao' : '',
      possui_area_util_necessaria: lead.possui_area_util_necessaria === true ? 'sim' : lead.possui_area_util_necessaria === false ? 'nao' : '',
    });
    setIsChecklistModalOpen(true);
  };

  const hasScheduledNextAction = (deal) => {
    const tipo = deal?.proxima_acao?.tipo?.trim();
    const dataHora = deal?.proxima_acao?.data_hora;
    return Boolean(tipo && dataHora);
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;
    const movedToSamePosition = source.droppableId === destination.droppableId && source.index === destination.index;
    if (movedToSamePosition) return;

    const deal = deals.find((d) => d.id === draggableId);
    if (!deal) return;

    const newEtapa = destination.droppableId;

    if (deal.etapa === 'Lead Novo' && newEtapa !== 'Lead Novo') {
      const lead = leadsMap[deal.lead_id];
      if (!hasChecklistCompleted(lead)) {
        openChecklistModal(deal, newEtapa, 'drag');
        toast.error('Preencha o checklist antes de mover o lead de Lead Novo.');
        return;
      }
    }

    if ((newEtapa === 'Proposta Enviada' || newEtapa === 'Negociação') && !hasScheduledNextAction(deal)) {
      openEditModal(deal, newEtapa);
      toast.error('Próxima ação é obrigatória para esta etapa. Complete no modal.');
      return;
    }

    const previousDeals = deals;
    const reorderedDeals = reorderDeals(deals, source, destination, draggableId, newEtapa);
    setDeals(reorderedDeals);

    try {
      if (deal.etapa !== newEtapa) {
        await dealsAPI.update(deal.id, { ...deal, etapa: newEtapa });
        toast.success('Deal movido com sucesso!');
      }
    } catch (error) {
      console.error('Error updating deal', error);
      setDeals(previousDeals);
      toast.error('Erro ao mover deal');
    }
  };

  const dealsByStage = useMemo(() => {
    return deals.reduce((acc, deal) => {
      if (!acc[deal.etapa]) {
        acc[deal.etapa] = [];
      }
      acc[deal.etapa].push(deal);
      return acc;
    }, {});
  }, [deals]);

  const getDealsByStage = (stage) => dealsByStage[stage] || [];

  const isProximaAcaoVencida = (proxima_acao) => {
    if (!proxima_acao || !proxima_acao.data_hora) return false;
    return new Date(proxima_acao.data_hora) < new Date();
  };

  const openEditModal = async (deal, forcedEtapa = null) => {
    const lead = leadsMap[deal.lead_id];
    if (!lead) {
      toast.error('Lead não encontrado');
      return;
    }

    setDealInEdition(deal);
    setDealFormData({
      etapa: forcedEtapa || deal.etapa,
      valor_estimado: deal.valor_estimado || '',
      proxima_acao_tipo: deal.proxima_acao?.tipo || '',
      proxima_acao_descricao: deal.proxima_acao?.descricao || '',
      proxima_acao_data_hora: toDateTimeLocalValue(deal.proxima_acao?.data_hora),
    });
    setCadence(null);
    setCadenceNote('');
    setCadenceChannel('whatsapp');
    setLeadFormData(buildLeadFormData(lead));
    setIsEditModalOpen(true);

    try {
      setCadenceLoading(true);
      const response = await followUpCadenceAPI.get(deal.id);
      setCadence(response.data);
    } catch (error) {
      console.error('Error loading follow-up cadence', error);
    } finally {
      setCadenceLoading(false);
    }
  };

  const handleEditFieldChange = (event) => {
    const { name, value } = event.target;
    setDealFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleLeadFieldChange = (event) => {
    const { name, value } = event.target;

    let normalizedValue = value;
    if (name === 'telefone') {
      normalizedValue = formatPhoneMask(value);
    }
    if (name === 'conta_media') {
      normalizedValue = formatCurrencyMask(value);
    }

    setLeadFormData((prev) => ({
      ...prev,
      [name]: normalizedValue,
    }));
  };

  const handleChecklistFieldChange = (event) => {
    const { name, value } = event.target;
    setChecklistFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleChecklistSubmit = async (event) => {
    event.preventDefault();

    if (!pendingStageChange) return;

    const hasMissingField = CHECKLIST_FIELDS.some((field) => !checklistFormData[field.key]);
    if (hasMissingField) {
      toast.error('Preencha todo o checklist para classificar o lead.');
      return;
    }

    const lead = leadsMap[pendingStageChange.deal.lead_id];
    if (!lead) {
      toast.error('Lead não encontrado para atualizar classificação');
      return;
    }

    const checklistPayload = CHECKLIST_FIELDS.reduce((acc, field) => {
      acc[field.key] = serializeChecklistValue(checklistFormData[field.key]);
      return acc;
    }, {});

    try {
      setIsSavingChecklist(true);
      await leadsAPI.update(lead.id, buildLeadUpdatePayload(lead, checklistPayload));
      await dealsAPI.update(pendingStageChange.deal.id, {
        ...pendingStageChange.deal,
        etapa: pendingStageChange.toStage,
      });

      await fetchData();
      setIsChecklistModalOpen(false);
      setPendingStageChange(null);

      if (pendingStageChange.mode === 'edit') {
        setIsEditModalOpen(false);
        setDealInEdition(null);
      }

      toast.success('Checklist salvo e lead classificado com sucesso!');
    } catch (error) {
      console.error('Error applying checklist', error);
      toast.error('Erro ao salvar checklist e mover deal');
    } finally {
      setIsSavingChecklist(false);
    }
  };

  const refreshCadence = async () => {
    if (!dealInEdition) return;
    const response = await followUpCadenceAPI.get(dealInEdition.id);
    setCadence(response.data);
  };

  const toggleCadenceStatus = async () => {
    if (!dealInEdition || !cadence) return;
    try {
      if (cadence.status === 'ativa') {
        await followUpCadenceAPI.pause(dealInEdition.id);
        toast.success('Cadência pausada');
      } else {
        await followUpCadenceAPI.resume(dealInEdition.id);
        toast.success('Cadência retomada');
      }
      await refreshCadence();
    } catch (error) {
      console.error('Error toggling cadence status', error);
      toast.error('Erro ao atualizar status da cadência');
    }
  };

  const registerCadenceAttempt = async (dia, complete = false) => {
    if (!dealInEdition) return;
    try {
      if (complete) {
        await followUpCadenceAPI.complete(dealInEdition.id, dia, { canal: cadenceChannel, notas: cadenceNote });
        toast.success(`Tarefa D${dia} concluída`);
      } else {
        await followUpCadenceAPI.attempt(dealInEdition.id, dia, { canal: cadenceChannel, notas: cadenceNote });
        toast.success(`Tentativa registrada na tarefa D${dia}`);
      }
      setCadenceNote('');
      await refreshCadence();
    } catch (error) {
      console.error('Error updating cadence task', error);
      toast.error('Erro ao atualizar tarefa da cadência');
    }
  };

  const handleUpdateDeal = async (event) => {
    event.preventDefault();

    if (!dealInEdition) return;

    if (dealInEdition.etapa === 'Lead Novo' && dealFormData.etapa === 'Contato Realizado') {
      const lead = leadsMap[dealInEdition.lead_id];
      if (!hasChecklistCompleted(lead)) {
        openChecklistModal(dealInEdition, 'Contato Realizado', 'edit');
        return;
      }
    }

    if (dealInEdition.etapa === 'Lead Novo' && dealFormData.etapa !== 'Lead Novo') {
      const lead = leadsMap[dealInEdition.lead_id];
      if (!hasChecklistCompleted(lead)) {
        openChecklistModal(dealInEdition, dealFormData.etapa, 'edit');
        toast.error('Preencha o checklist antes de mover o lead de Lead Novo.');
        return;
      }
    }

    const isNextActionRequired = dealFormData.etapa === 'Proposta Enviada' || dealFormData.etapa === 'Negociação';
    const hasAnyNextActionField =
      dealFormData.proxima_acao_tipo.trim()
      || dealFormData.proxima_acao_descricao.trim()
      || dealFormData.proxima_acao_data_hora;

    if (isNextActionRequired && !hasAnyNextActionField) {
      toast.error('Próxima ação é obrigatória para esta etapa');
      return;
    }

    if (hasAnyNextActionField && (!dealFormData.proxima_acao_tipo.trim() || !dealFormData.proxima_acao_descricao.trim() || !dealFormData.proxima_acao_data_hora)) {
      toast.error('Preencha tipo, descrição e data da próxima ação');
      return;
    }

    const payload = {
      ...dealInEdition,
      etapa: dealFormData.etapa,
      valor_estimado: dealFormData.valor_estimado ? Number(dealFormData.valor_estimado) : null,
      proxima_acao: hasAnyNextActionField
        ? {
          tipo: dealFormData.proxima_acao_tipo.trim(),
          descricao: dealFormData.proxima_acao_descricao.trim(),
          data_hora: dealFormData.proxima_acao_data_hora,
        }
        : null,
    };

    try {
      setIsSavingDeal(true);
      await dealsAPI.update(dealInEdition.id, payload);
      await fetchData();
      setIsEditModalOpen(false);
      setDealInEdition(null);
      toast.success('Deal atualizado com sucesso!');
    } catch (error) {
      console.error('Error updating deal', error);
      toast.error('Erro ao atualizar deal');
    } finally {
      setIsSavingDeal(false);
    }
  };

  const handleUpdateLead = async (event) => {
    event.preventDefault();

    if (!dealInEdition) return;

    if (!leadFormData.nome.trim() || !leadFormData.telefone.trim()) {
      toast.error('Nome e telefone são obrigatórios');
      return;
    }

    const lead = leadsMap[dealInEdition.lead_id];
    if (!lead) {
      toast.error('Lead não encontrado');
      return;
    }

    const payload = buildLeadUpdatePayload(lead, {
      nome: leadFormData.nome.trim(),
      telefone: leadFormData.telefone.replace(/\D/g, ''),
      email: leadFormData.email.trim() || null,
      cidade: leadFormData.cidade.trim() || null,
      bairro: leadFormData.bairro.trim() || null,
      conta_media: parseCurrencyMaskToNumber(leadFormData.conta_media),
      origem: leadFormData.origem,
    });

    try {
      setIsSavingLead(true);
      await leadsAPI.update(lead.id, payload);
      await fetchData();
      toast.success('Lead atualizado com sucesso!');
    } catch (error) {
      console.error('Error updating lead', error);
      toast.error('Erro ao atualizar lead');
    } finally {
      setIsSavingLead(false);
    }
  };

  const handleArchiveLead = async () => {
    if (!dealInEdition) return;
    const lead = leadsMap[dealInEdition.lead_id];
    if (!lead) {
      toast.error('Lead não encontrado');
      return;
    }

    const confirmed = window.confirm(`Deseja arquivar o lead ${lead.nome}?`);
    if (!confirmed) return;

    try {
      setIsArchivingLead(true);
      await leadsAPI.archive(lead.id);
      await fetchData();
      setIsEditModalOpen(false);
      setDealInEdition(null);
      toast.success('Lead arquivado com sucesso!');
    } catch (error) {
      console.error('Error archiving lead', error);
      const message = error?.response?.data?.detail || 'Não foi possível arquivar o lead';
      toast.error(message);
    } finally {
      setIsArchivingLead(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="pipeline-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Pipeline Kanban</h1>
        <p className="text-white/60">Arraste os cards para mover entre etapas</p>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x" style={{ height: 'calc(100vh - 200px)' }}>
          {PIPELINE_STAGES.map((stage) => (
            <Droppable key={stage} droppableId={stage}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`min-w-[320px] max-w-[320px] rounded-xl border flex flex-col snap-start transition-colors ${snapshot.isDraggingOver ? 'bg-brand-yellow/5 border-brand-yellow/30' : 'bg-brand-gray/50 border-white/5'}`}
                  data-testid={`pipeline-column-${stage}`}
                >
                  <div className="p-3 border-b border-white/5 sticky top-0 bg-brand-gray/95 backdrop-blur z-10 rounded-t-xl">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm tracking-wide uppercase text-white/80">
                        {stage}
                      </h3>
                      <span className="text-xs font-mono font-bold text-white/60 bg-white/5 px-2 py-1 rounded">
                        {getDealsByStage(stage).length}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {getDealsByStage(stage).map((deal, index) => {
                      const lead = leadsMap[deal.lead_id];
                      if (!lead) return null;

                      return (
                        <Draggable key={deal.id} draggableId={deal.id} index={index}>
                          {(dragProvided, snapshot) => (
                            <Card
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              className={`bg-brand-dark border border-white/10 cursor-grab active:cursor-grabbing group relative transition-shadow ${snapshot.isDragging ? 'shadow-2xl border-brand-yellow/40 rotate-[0.4deg]' : 'hover:border-brand-yellow/30'}`}
                              style={{
                                ...dragProvided.draggableProps.style,
                                transition: snapshot.isDragging ? 'transform 120ms ease' : dragProvided.draggableProps.style?.transition,
                              }}
                              data-testid={`deal-card-${deal.id}`}
                              role="button"
                              tabIndex={0}
                              onClick={(event) => { event.stopPropagation(); openEditModal(deal); }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  openEditModal(deal);
                                }
                              }}
                            >
                              <CardContent className="p-3">
                                <div className="space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <h4 className="font-bold text-white text-sm line-clamp-2">
                                      {lead.nome}
                                    </h4>
                                    <Badge className={`text-xs font-bold border ${getClassificationBadge(lead.classificacao)}`}>
                                      Lead {lead.classificacao}
                                    </Badge>
                                  </div>

                                  <p className="text-[11px] text-white/50">
                                    {getClassificationGuidance(lead.classificacao)}
                                  </p>

                                  <div className="flex items-center gap-2 text-xs text-white/60">
                                    <Phone className="w-3 h-3" />
                                    <span className="font-mono">{lead.telefone}</span>
                                  </div>

                                  {lead.conta_media && (
                                    <div className="text-xs text-white/60">
                                      Conta: <span className="font-mono font-bold text-brand-yellow">R$ {lead.conta_media}</span>
                                    </div>
                                  )}

                                  {deal.valor_estimado && (
                                    <div className="text-xs text-white/60">
                                      Valor: <span className="font-mono font-bold text-brand-gold">R$ {deal.valor_estimado.toLocaleString('pt-BR')}</span>
                                    </div>
                                  )}

                                  {deal.proxima_acao && (
                                    <div className={`text-xs p-2 rounded-md border ${isProximaAcaoVencida(deal.proxima_acao) ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-brand-yellow/10 border-brand-yellow/20 text-brand-yellow'}`}>
                                      <div className="flex items-center gap-1 font-bold">
                                        {isProximaAcaoVencida(deal.proxima_acao) && <AlertCircle className="w-3 h-3" />}
                                        <span>Próxima ação:</span>
                                      </div>
                                      <div className="mt-1">{deal.proxima_acao.tipo}</div>
                                      <div className="font-mono text-xs opacity-80">
                                        {new Date(deal.proxima_acao.data_hora).toLocaleString('pt-BR')}
                                      </div>
                                    </div>
                                  )}

                                  <div className="flex gap-1 pt-2 border-t border-white/5">
                                    {deal.etapa === 'Lead Novo' && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 px-2 text-xs hover:bg-brand-yellow/10 hover:text-brand-yellow"
                                        onClick={(event) => { event.stopPropagation(); openChecklistModal(deal, deal.etapa, 'manual'); }}
                                      >
                                        <Check className="w-3 h-3 mr-1" /> Checklist
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 px-2 text-xs hover:bg-brand-yellow/10 hover:text-brand-yellow"
                                      onClick={(event) => { event.stopPropagation(); openEditModal(deal); }}
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="flex-1 h-8 text-xs hover:bg-green-500/10 hover:text-green-400"
                                      onClick={(event) => { event.stopPropagation(); window.open(`https://wa.me/55${lead.telefone.replace(/\D/g, '')}`, '_blank'); }}
                                      data-testid={`whatsapp-button-${deal.id}`}
                                    >
                                      <MessageCircle className="w-3 h-3 mr-1" />
                                      WhatsApp
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="flex-1 h-8 text-xs hover:bg-blue-500/10 hover:text-blue-400"
                                      onClick={(event) => { event.stopPropagation(); navigate(`/lead/${lead.id}`); }}
                                    >
                                      <Calendar className="w-3 h-3 mr-1" />
                                      Ver
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      <Dialog open={isChecklistModalOpen} onOpenChange={setIsChecklistModalOpen}>
        <DialogContent className="bg-brand-gray border-white/10 text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-white">Checklist de qualificação</DialogTitle>
            <DialogDescription className="text-white/60">
              Preencha o checklist para liberar a movimentação do lead a partir de Lead Novo e classificar automaticamente o lead.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleChecklistSubmit} className="space-y-4">
            <div className="grid gap-3">
              {CHECKLIST_FIELDS.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key} className="text-white">{field.label}</Label>
                  <select
                    id={field.key}
                    name={field.key}
                    value={checklistFormData[field.key]}
                    onChange={handleChecklistFieldChange}
                    className="w-full h-10 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white"
                    required
                  >
                    <option value="" className="bg-brand-gray text-white">Selecione</option>
                    <option value="sim" className="bg-brand-gray text-white">Sim</option>
                    <option value="nao" className="bg-brand-gray text-white">Não</option>
                  </select>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="text-white hover:bg-white/10"
                onClick={() => setIsChecklistModalOpen(false)}
                disabled={isSavingChecklist}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-brand-yellow text-black hover:bg-brand-yellow/90 font-bold"
                disabled={isSavingChecklist}
              >
                {isSavingChecklist ? <span className="inline-flex rounded-full bg-black/70 p-1"><LoadingSpinner className="text-brand-yellow" size={14} /></span> : 'Salvar checklist'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="bg-brand-gray border-white/10 text-white sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Detalhes do lead e deal</DialogTitle>
            <DialogDescription className="text-white/60">
              Atualize os dados do lead, arquive quando necessário e mantenha o deal com a etapa correta.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateLead} className="space-y-4 border border-white/10 rounded-lg p-4 bg-black/20">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-brand-yellow">Dados do lead</h4>
              <Button
                type="button"
                variant="destructive"
                className="bg-red-600 hover:bg-red-700"
                onClick={handleArchiveLead}
                disabled={isArchivingLead || isSavingLead}
              >
                {isArchivingLead ? <span className="inline-flex rounded-full bg-black/70 p-1"><LoadingSpinner className="text-white" size={14} /></span> : 'Arquivar lead'}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="lead_nome" className="text-white">Nome *</Label>
                <Input id="lead_nome" name="nome" value={leadFormData.nome} onChange={handleLeadFieldChange} className="bg-black/30 border-white/10 text-white" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lead_telefone" className="text-white">Telefone *</Label>
                <Input id="lead_telefone" name="telefone" value={leadFormData.telefone} onChange={handleLeadFieldChange} className="bg-black/30 border-white/10 text-white" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lead_email" className="text-white">Email</Label>
                <Input id="lead_email" name="email" type="email" value={leadFormData.email} onChange={handleLeadFieldChange} className="bg-black/30 border-white/10 text-white" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lead_cidade" className="text-white">Cidade</Label>
                <Input id="lead_cidade" name="cidade" value={leadFormData.cidade} onChange={handleLeadFieldChange} className="bg-black/30 border-white/10 text-white" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lead_bairro" className="text-white">Bairro</Label>
                <Input id="lead_bairro" name="bairro" value={leadFormData.bairro} onChange={handleLeadFieldChange} className="bg-black/30 border-white/10 text-white" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lead_conta_media" className="text-white">Conta média (R$)</Label>
                <Input id="lead_conta_media" name="conta_media" value={leadFormData.conta_media} onChange={handleLeadFieldChange} className="bg-black/30 border-white/10 text-white" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lead_origem" className="text-white">Origem</Label>
                <select
                  id="lead_origem"
                  name="origem"
                  value={leadFormData.origem}
                  onChange={handleLeadFieldChange}
                  className="w-full h-10 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white"
                >
                  {['Meta', 'Facebook Ads', 'Google', 'Indicação', 'Orgânico', 'Outro'].map((origem) => (
                    <option key={origem} value={origem} className="bg-brand-gray text-white">{origem}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" className="bg-brand-yellow text-black hover:bg-brand-yellow/90 font-bold" disabled={isSavingLead || isArchivingLead}>
                {isSavingLead ? <span className="inline-flex rounded-full bg-black/70 p-1"><LoadingSpinner className="text-brand-yellow" size={14} /></span> : 'Salvar lead'}
              </Button>
            </div>
          </form>

          <form onSubmit={handleUpdateDeal} className="space-y-4 border border-white/10 rounded-lg p-4 bg-black/20">
            <h4 className="text-sm font-semibold text-brand-yellow">Dados do deal</h4>
            <div className="space-y-2">
              <Label htmlFor="etapa" className="text-white">Etapa</Label>
              <select
                id="etapa"
                name="etapa"
                value={dealFormData.etapa}
                onChange={handleEditFieldChange}
                className="w-full h-10 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white"
                required
              >
                {PIPELINE_STAGES.map((stage) => (
                  <option key={stage} value={stage} className="bg-brand-gray text-white">
                    {stage}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="valor_estimado" className="text-white">Valor estimado (R$)</Label>
              <Input
                id="valor_estimado"
                name="valor_estimado"
                type="number"
                min="0"
                step="0.01"
                value={dealFormData.valor_estimado}
                onChange={handleEditFieldChange}
                className="bg-black/30 border-white/10 text-white"
              />
            </div>

            <div className="border border-white/10 rounded-lg p-3 space-y-3 bg-black/20">
              <h4 className="text-sm font-semibold text-brand-yellow">Próxima ação</h4>

              <div className="space-y-2">
                <Label htmlFor="proxima_acao_tipo" className="text-white">Tipo</Label>
                <Input
                  id="proxima_acao_tipo"
                  name="proxima_acao_tipo"
                  value={dealFormData.proxima_acao_tipo}
                  onChange={handleEditFieldChange}
                  placeholder="Ex.: Follow-up WhatsApp"
                  className="bg-black/30 border-white/10 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="proxima_acao_descricao" className="text-white">Descrição</Label>
                <Textarea
                  id="proxima_acao_descricao"
                  name="proxima_acao_descricao"
                  value={dealFormData.proxima_acao_descricao}
                  onChange={handleEditFieldChange}
                  placeholder="Descreva o próximo passo"
                  className="bg-black/30 border-white/10 text-white"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="proxima_acao_data_hora" className="text-white">Data e hora</Label>
                <Input
                  id="proxima_acao_data_hora"
                  name="proxima_acao_data_hora"
                  type="datetime-local"
                  value={dealFormData.proxima_acao_data_hora}
                  onChange={handleEditFieldChange}
                  className="bg-black/30 border-white/10 text-white"
                />
              </div>
            </div>

            {(dealInEdition?.etapa === 'Proposta Enviada' || dealInEdition?.etapa === 'Negociação' || dealFormData.etapa === 'Proposta Enviada' || dealFormData.etapa === 'Negociação') && (
              <div className="border border-white/10 rounded-lg p-3 space-y-3 bg-black/20">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-brand-yellow">Cadência de Follow-up</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-white hover:bg-white/10"
                    onClick={toggleCadenceStatus}
                    disabled={!cadence || cadenceLoading}
                  >
                    {cadence?.status === 'ativa' ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                    {cadence?.status === 'ativa' ? 'Pausar' : 'Retomar'}
                  </Button>
                </div>

                {cadenceLoading ? (
                  <div className="flex justify-center py-2"><LoadingSpinner size={16} /></div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label className="text-white">Canal da tentativa</Label>
                        <select
                          value={cadenceChannel}
                          onChange={(e) => setCadenceChannel(e.target.value)}
                          className="w-full h-10 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white"
                        >
                          <option value="whatsapp" className="bg-brand-gray text-white">WhatsApp</option>
                          <option value="ligacao" className="bg-brand-gray text-white">Ligação</option>
                          <option value="email" className="bg-brand-gray text-white">Email</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-white">Notas da tentativa</Label>
                        <Input
                          value={cadenceNote}
                          onChange={(e) => setCadenceNote(e.target.value)}
                          className="bg-black/30 border-white/10 text-white"
                          placeholder="Ex.: cliente pediu retorno amanhã"
                        />
                      </div>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-auto pr-1">
                      {(cadence?.tarefas || []).map((task) => (
                        <div key={task.dia} className="border border-white/10 rounded-md p-2 bg-black/30">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs text-white/70">D{task.dia} • {task.tipo}</p>
                              <p className="text-sm text-white">{task.mensagem}</p>
                              <p className="text-xs text-white/60">Status: {task.status} • Tentativas: {task.tentativas || 0}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" size="sm" variant="outline" className="border-white/10 text-white" onClick={() => registerCadenceAttempt(task.dia, false)}>
                                Registrar
                              </Button>
                              <Button type="button" size="sm" className="bg-brand-yellow text-black hover:bg-brand-yellow/90" onClick={() => registerCadenceAttempt(task.dia, true)}>
                                <Check className="h-3 w-3 mr-1" /> Concluir
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="text-white hover:bg-white/10"
                onClick={() => setIsEditModalOpen(false)}
                disabled={isSavingDeal}
              >
                Fechar
              </Button>
              <Button
                type="submit"
                className="bg-brand-yellow text-black hover:bg-brand-yellow/90 font-bold"
                disabled={isSavingDeal}
              >
                {isSavingDeal ? <span className="inline-flex rounded-full bg-black/70 p-1"><LoadingSpinner className="text-brand-yellow" size={14} /></span> : 'Salvar deal'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
