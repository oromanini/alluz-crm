import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { activitiesAPI, dealsAPI, leadsAPI } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Phone, MessageCircle, Calendar, Pencil, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

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

const formatSlaStatus = (minutes) => {
  if (minutes === null || minutes === undefined) {
    return {
      title: 'Aguardando primeiro contato',
      tone: 'text-white/70',
      detail: 'Mova para Contato Realizado para medir o objetivo de 10 minutos.',
    };
  }

  if (minutes <= 10) {
    return {
      title: 'Objetivo cumprido',
      tone: 'text-emerald-400',
      detail: `Lead avançou em ${minutes} min (meta: até 10 min).`,
    };
  }

  return {
    title: 'Objetivo fora da meta',
    tone: 'text-amber-400',
    detail: `Lead avançou em ${minutes} min (meta: até 10 min).`,
  };
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
  const { user } = useAuth();
  const [deals, setDeals] = useState([]);
  const [leadsMap, setLeadsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingDeal, setIsSavingDeal] = useState(false);
  const [dealInEdition, setDealInEdition] = useState(null);
  const [dealFormData, setDealFormData] = useState({
    etapa: '',
    valor_estimado: '',
    registro_atividade: '',
  });
  const [isChecklistModalOpen, setIsChecklistModalOpen] = useState(false);
  const [isMoveBlockedModalOpen, setIsMoveBlockedModalOpen] = useState(false);
  const [isSavingChecklist, setIsSavingChecklist] = useState(false);
  const [checklistFormData, setChecklistFormData] = useState(initialChecklistState);
  const [pendingStageChange, setPendingStageChange] = useState(null);
  const [pendingMoveAction, setPendingMoveAction] = useState(null);
  const [isMoveActionModalOpen, setIsMoveActionModalOpen] = useState(false);
  const [isSavingMoveAction, setIsSavingMoveAction] = useState(false);
  const [moveActionFormData, setMoveActionFormData] = useState({
    tipo: '',
    data_hora: '',
    responsavel: '',
    canal: 'WhatsApp',
    descricao: '',
  });
  const [leadFormData, setLeadFormData] = useState(buildLeadFormData({}));
  const [isSavingLead, setIsSavingLead] = useState(false);
  const [isArchivingLead, setIsArchivingLead] = useState(false);

  const showChecklistRequiredModal = () => {
    setIsMoveBlockedModalOpen(true);
  };

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

  const STAGES_WITH_OPTIONAL_NEXT_ACTION = ['Fechado - Ganho', 'Fechado - Perdido', 'Nutrição (Lead C)'];

  const stageRequiresNextAction = (stage) => !STAGES_WITH_OPTIONAL_NEXT_ACTION.includes(stage);

  const openMoveActionModal = (deal, toStage) => {
    setPendingMoveAction({ deal, toStage });
    setMoveActionFormData({
      tipo: deal?.proxima_acao?.tipo || '',
      data_hora: toDateTimeLocalValue(deal?.proxima_acao?.data_hora),
      responsavel: deal?.proxima_acao?.responsavel || '',
      canal: deal?.proxima_acao?.canal || 'WhatsApp',
      descricao: deal?.proxima_acao?.descricao || '',
    });
    setIsMoveActionModalOpen(true);
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;
    const movedToSamePosition = source.droppableId === destination.droppableId && source.index === destination.index;
    if (movedToSamePosition) return;

    const deal = deals.find((d) => d.id === draggableId);
    if (!deal) return;

    const newEtapa = destination.droppableId;

    if (source.droppableId === destination.droppableId) {
      setDeals(reorderDeals(deals, source, destination, draggableId, newEtapa));
      return;
    }

    if (deal.etapa === 'Contato Realizado' && newEtapa === 'Qualificado') {
      const lead = leadsMap[deal.lead_id];
      if (!hasChecklistCompleted(lead)) {
        showChecklistRequiredModal();
        return;
      }
    }

    if (stageRequiresNextAction(newEtapa)) {
      openMoveActionModal(deal, newEtapa);
      return;
    }

    try {
      await dealsAPI.update(deal.id, { ...deal, etapa: newEtapa });
      await fetchData();
      toast.success('Deal movido com sucesso!');
    } catch (error) {
      console.error('Error updating deal', error);
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


  const openEditModal = async (deal, forcedEtapa = null) => {
    const lead = leadsMap[deal.lead_id];
    if (!lead) {
      toast.error('Lead não encontrado');
      return;
    }

    setDealInEdition(deal);
    setDealFormData({
      etapa: forcedEtapa || deal.etapa,
      valor_estimado: deal.valor_estimado
        ? Number(deal.valor_estimado).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
        : '',
      registro_atividade: '',
    });
    setLeadFormData(buildLeadFormData(lead));
    setIsEditModalOpen(true);
  };

  const handleEditFieldChange = (event) => {
    const { name, value } = event.target;
    const normalizedValue = name === 'valor_estimado' ? formatCurrencyMask(value) : value;
    setDealFormData((prev) => ({
      ...prev,
      [name]: normalizedValue,
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

      if (stageRequiresNextAction(pendingStageChange.toStage)) {
        setIsChecklistModalOpen(false);
        openMoveActionModal(pendingStageChange.deal, pendingStageChange.toStage);
        setPendingStageChange(null);
        toast.success('Checklist salvo! Defina a próxima ação para concluir a movimentação.');
        return;
      }

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

  const handleMoveActionFieldChange = (event) => {
    const { name, value } = event.target;
    setMoveActionFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleMoveWithNextAction = async (event) => {
    event.preventDefault();
    if (!pendingMoveAction) return;

    if (!moveActionFormData.tipo.trim() || !moveActionFormData.data_hora || !moveActionFormData.responsavel.trim() || !moveActionFormData.canal.trim()) {
      toast.error('Preencha tipo, data/hora, responsável e canal para mover o card.');
      return;
    }

    try {
      setIsSavingMoveAction(true);
      await dealsAPI.update(pendingMoveAction.deal.id, {
        ...pendingMoveAction.deal,
        etapa: pendingMoveAction.toStage,
        proxima_acao: {
          tipo: moveActionFormData.tipo.trim(),
          data_hora: moveActionFormData.data_hora,
          responsavel: moveActionFormData.responsavel.trim(),
          canal: moveActionFormData.canal,
          descricao: moveActionFormData.descricao.trim() || null,
        },
      });

      await fetchData();
      setIsMoveActionModalOpen(false);
      setPendingMoveAction(null);
      toast.success('Card movido com próxima ação registrada.');
    } catch (error) {
      console.error('Error moving deal with next action', error);
      toast.error('Erro ao salvar próxima ação e mover card.');
    } finally {
      setIsSavingMoveAction(false);
    }
  };

  const handleUpdateDeal = async (event) => {
    event.preventDefault();

    if (!dealInEdition) return;

    if (dealInEdition.etapa === 'Contato Realizado' && dealFormData.etapa === 'Qualificado') {
      const lead = leadsMap[dealInEdition.lead_id];
      if (!hasChecklistCompleted(lead)) {
        showChecklistRequiredModal();
        return;
      }
    }

    const isStageChanging = dealFormData.etapa !== dealInEdition.etapa;
    if (isStageChanging && stageRequiresNextAction(dealFormData.etapa)) {
      toast.error('Mova o card para alterar esta etapa e definir a próxima ação.');
      return;
    }

    const payload = {
      ...dealInEdition,
      etapa: dealFormData.etapa,
      valor_estimado: parseCurrencyMaskToNumber(dealFormData.valor_estimado),
    };

    const activityDescription = dealFormData.registro_atividade.trim();
    if (activityDescription && !user?.id) {
      toast.error('Não foi possível identificar o usuário para registrar a atividade.');
      return;
    }

    try {
      setIsSavingDeal(true);
      await dealsAPI.update(dealInEdition.id, payload);

      if (activityDescription) {
        await activitiesAPI.create({
          lead_id: dealInEdition.lead_id,
          deal_id: dealInEdition.id,
          tipo: 'Follow-up',
          data_hora: new Date().toISOString(),
          notas: activityDescription,
          responsavel_id: user.id,
        });
      }

      await fetchData();
      setIsEditModalOpen(false);
      setDealInEdition(null);
      toast.success(activityDescription ? 'Deal atualizado e atividade registrada!' : 'Deal atualizado com sucesso!');
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

  const leadInEdition = dealInEdition ? leadsMap[dealInEdition.lead_id] : null;
  const slaInfo = formatSlaStatus(leadInEdition?.status_sla_minutos);

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

                                  <TooltipProvider delayDuration={200}>
                                    <div className="flex items-center gap-1 pt-2 border-t border-white/5">
                                      {deal.etapa === 'Contato Realizado' && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              aria-label="Abrir checklist"
                                              className="h-8 w-8 p-0 hover:bg-brand-yellow/10 hover:text-brand-yellow"
                                              onClick={(event) => { event.stopPropagation(); openChecklistModal(deal, deal.etapa, 'manual'); }}
                                            >
                                              <Check className="w-3 h-3" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent>Abrir checklist</TooltipContent>
                                        </Tooltip>
                                      )}

                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            aria-label="Editar lead"
                                            className="h-8 w-8 p-0 hover:bg-brand-yellow/10 hover:text-brand-yellow"
                                            onClick={(event) => { event.stopPropagation(); openEditModal(deal); }}
                                          >
                                            <Pencil className="w-3 h-3" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Editar lead</TooltipContent>
                                      </Tooltip>

                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            aria-label="Abrir conversa no WhatsApp"
                                            className="h-8 w-8 p-0 hover:bg-green-500/10 hover:text-green-400"
                                            onClick={(event) => { event.stopPropagation(); window.open(`https://wa.me/55${lead.telefone.replace(/\D/g, '')}`, '_blank'); }}
                                            data-testid={`whatsapp-button-${deal.id}`}
                                          >
                                            <MessageCircle className="w-3 h-3" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Abrir WhatsApp</TooltipContent>
                                      </Tooltip>

                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            aria-label="Ver detalhes do lead"
                                            className="h-8 w-8 p-0 hover:bg-blue-500/10 hover:text-blue-400"
                                            onClick={(event) => { event.stopPropagation(); navigate(`/lead/${lead.id}`); }}
                                          >
                                            <Calendar className="w-3 h-3" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Ver detalhes</TooltipContent>
                                      </Tooltip>
                                    </div>
                                  </TooltipProvider>
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


      <Dialog
        open={isMoveActionModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPendingMoveAction(null);
          }
          setIsMoveActionModalOpen(open);
        }}
      >
        <DialogContent className="bg-brand-gray border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Defina a próxima ação para mover o card</DialogTitle>
            <DialogDescription className="text-white/60">
              Para concluir a movimentação, informe tipo, data/hora, responsável e canal.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleMoveWithNextAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="move_tipo" className="text-white">Próxima ação</Label>
              <Input id="move_tipo" name="tipo" value={moveActionFormData.tipo} onChange={handleMoveActionFieldChange} className="bg-black/30 border-white/10 text-white" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="move_data_hora" className="text-white">Data e hora</Label>
              <Input id="move_data_hora" name="data_hora" type="datetime-local" value={moveActionFormData.data_hora} onChange={handleMoveActionFieldChange} className="bg-black/30 border-white/10 text-white" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="move_responsavel" className="text-white">Responsável</Label>
              <Input id="move_responsavel" name="responsavel" value={moveActionFormData.responsavel} onChange={handleMoveActionFieldChange} className="bg-black/30 border-white/10 text-white" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="move_canal" className="text-white">Canal</Label>
              <select id="move_canal" name="canal" value={moveActionFormData.canal} onChange={handleMoveActionFieldChange} className="w-full h-10 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-white" required>
                {['WhatsApp', 'Ligação', 'Meet', 'Visita', 'Interno'].map((canal) => (
                  <option key={canal} value={canal} className="bg-brand-gray text-white">{canal}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="move_descricao" className="text-white">Observação (opcional)</Label>
              <Textarea id="move_descricao" name="descricao" value={moveActionFormData.descricao} onChange={handleMoveActionFieldChange} rows={3} className="bg-black/30 border-white/10 text-white" />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => { setIsMoveActionModalOpen(false); setPendingMoveAction(null); }} disabled={isSavingMoveAction}>Cancelar</Button>
              <Button type="submit" className="bg-brand-yellow text-black hover:bg-brand-yellow/90 font-bold" disabled={isSavingMoveAction}>
                {isSavingMoveAction ? 'Salvando...' : 'Salvar e mover'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isChecklistModalOpen} onOpenChange={setIsChecklistModalOpen}>
        <DialogContent className="bg-brand-gray border-white/10 text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-white">Checklist de qualificação</DialogTitle>
            <DialogDescription className="text-white/60">
              Preencha o checklist para liberar a movimentação de Contato Realizado para Qualificado e classificar automaticamente o lead.
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

      <Dialog open={isMoveBlockedModalOpen} onOpenChange={setIsMoveBlockedModalOpen}>
        <DialogContent className="bg-brand-gray border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Movimentação bloqueada</DialogTitle>
            <DialogDescription className="text-white/70">
              Preencha o checklist de qualificação antes de mover o lead de Contato Realizado para Qualificado.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              className="bg-brand-yellow text-black hover:bg-brand-yellow/90 font-bold"
              onClick={() => setIsMoveBlockedModalOpen(false)}
            >
              Entendi
            </Button>
          </DialogFooter>
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
                value={dealFormData.valor_estimado}
                onChange={handleEditFieldChange}
                className="bg-black/30 border-white/10 text-white"
                placeholder="0,00"
              />
            </div>

            <div className="border border-white/10 rounded-lg p-3 space-y-3 bg-black/20">
              <h4 className="text-sm font-semibold text-brand-yellow">Registro de atividades</h4>
              <p className="text-xs text-white/70">Adicione uma observação de histórico para este card (opcional).</p>
              <div className="space-y-2">
                <Label htmlFor="registro_atividade" className="text-white">Atividade</Label>
                <Textarea
                  id="registro_atividade"
                  name="registro_atividade"
                  value={dealFormData.registro_atividade}
                  onChange={handleEditFieldChange}
                  placeholder="Ex.: Liguei para o cliente e ele pediu retorno amanhã às 10h."
                  className="bg-black/30 border-white/10 text-white"
                  rows={4}
                />
              </div>
            </div>

            <div className="border border-white/10 rounded-lg p-3 space-y-1 bg-black/20">
              <h4 className="text-sm font-semibold text-brand-yellow">Cadência por movimentação de coluna</h4>
              <p className={`text-sm font-semibold ${slaInfo.tone}`}>{slaInfo.title}</p>
              <p className="text-xs text-white/70">{slaInfo.detail}</p>
            </div>

            {stageRequiresNextAction(dealFormData.etapa) && (
              <div className="border border-white/10 rounded-lg p-3 space-y-3 bg-black/20">
                <h4 className="text-sm font-semibold text-brand-yellow">Regra de movimentação</h4>
                <p className="text-xs text-white/70">
                  A próxima ação é definida apenas na movimentação do card, exceto em Fechado e Nutrição.
                </p>
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
