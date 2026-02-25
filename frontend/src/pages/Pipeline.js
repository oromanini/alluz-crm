import React, { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { dealsAPI, leadsAPI } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Phone, MessageCircle, Calendar, AlertCircle, Pencil } from 'lucide-react';
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

export default function Pipeline() {
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

  const onDragEnd = async (result) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;
    const movedToSamePosition = source.droppableId === destination.droppableId && source.index === destination.index;
    if (movedToSamePosition) return;

    const deal = deals.find((d) => d.id === draggableId);
    if (!deal) return;

    const newEtapa = destination.droppableId;

    if (deal.etapa === 'Lead Novo' && newEtapa === 'Contato Realizado') {
      openChecklistModal(deal, newEtapa, 'drag');
      return;
    }

    if ((newEtapa === 'Proposta Enviada' || newEtapa === 'Negociação') && !deal.proxima_acao) {
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

  const openEditModal = (deal, forcedEtapa = null) => {
    setDealInEdition(deal);
    setDealFormData({
      etapa: forcedEtapa || deal.etapa,
      valor_estimado: deal.valor_estimado || '',
      proxima_acao_tipo: deal.proxima_acao?.tipo || '',
      proxima_acao_descricao: deal.proxima_acao?.descricao || '',
      proxima_acao_data_hora: toDateTimeLocalValue(deal.proxima_acao?.data_hora),
    });
    setIsEditModalOpen(true);
  };

  const handleEditFieldChange = (event) => {
    const { name, value } = event.target;
    setDealFormData((prev) => ({
      ...prev,
      [name]: value,
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

  const handleUpdateDeal = async (event) => {
    event.preventDefault();

    if (!dealInEdition) return;

    if (dealInEdition.etapa === 'Lead Novo' && dealFormData.etapa === 'Contato Realizado') {
      openChecklistModal(dealInEdition, 'Contato Realizado', 'edit');
      return;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-white/50">Carregando pipeline...</div>
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
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 px-2 text-xs hover:bg-brand-yellow/10 hover:text-brand-yellow"
                                      onClick={() => openEditModal(deal)}
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="flex-1 h-8 text-xs hover:bg-green-500/10 hover:text-green-400"
                                      onClick={() => window.open(`https://wa.me/55${lead.telefone.replace(/\D/g, '')}`, '_blank')}
                                      data-testid={`whatsapp-button-${deal.id}`}
                                    >
                                      <MessageCircle className="w-3 h-3 mr-1" />
                                      WhatsApp
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="flex-1 h-8 text-xs hover:bg-blue-500/10 hover:text-blue-400"
                                      onClick={() => { window.location.href = `/lead/${lead.id}`; }}
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
              Preencha o checklist para mover de Lead Novo para Contato Realizado e classificar automaticamente o lead.
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
                {isSavingChecklist ? 'Salvando...' : 'Salvar checklist'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="bg-brand-gray border-white/10 text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-white">Editar deal</DialogTitle>
            <DialogDescription className="text-white/60">
              Atualize a etapa e configure a próxima ação para não quebrar o fluxo comercial.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateDeal} className="space-y-4">
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

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="text-white hover:bg-white/10"
                onClick={() => setIsEditModalOpen(false)}
                disabled={isSavingDeal}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-brand-yellow text-black hover:bg-brand-yellow/90 font-bold"
                disabled={isSavingDeal}
              >
                {isSavingDeal ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
