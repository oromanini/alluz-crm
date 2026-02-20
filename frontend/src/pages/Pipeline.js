import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { dealsAPI, leadsAPI } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Phone, MessageCircle, Calendar, AlertCircle } from 'lucide-react';
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

export default function Pipeline() {
  const [deals, setDeals] = useState([]);
  const [leadsMap, setLeadsMap] = useState({});
  const [loading, setLoading] = useState(true);

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
      leadsResponse.data.forEach(lead => {
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

  const onDragEnd = async (result) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;
    
    if (source.droppableId === destination.droppableId) return;

    const deal = deals.find(d => d.id === draggableId);
    const newEtapa = destination.droppableId;

    // Validar próxima ação para Proposta Enviada/Negociação
    if ((newEtapa === 'Proposta Enviada' || newEtapa === 'Negociação') && !deal.proxima_acao) {
      toast.error('Próxima ação é obrigatória para esta etapa');
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

  const getClassificationBadge = (classificacao) => {
    const styles = {
      A: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      B: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      C: 'bg-orange-900/10 text-orange-700 border-orange-900/20'
    };
    return styles[classificacao] || '';
  };

  const getDealsByStage = (stage) => {
    return deals.filter(deal => deal.etapa === stage);
  };

  const isProximaAcaoVencida = (proxima_acao) => {
    if (!proxima_acao || !proxima_acao.data_hora) return false;
    return new Date(proxima_acao.data_hora) < new Date();
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
                  className="min-w-[320px] max-w-[320px] bg-brand-gray/50 rounded-xl border border-white/5 flex flex-col snap-start"
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
                          {(provided, snapshot) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`bg-brand-dark border border-white/10 cursor-grab active:cursor-grabbing group relative ${snapshot.isDragging ? 'shadow-lg border-brand-yellow/30' : 'hover:border-brand-yellow/30'}`}
                              data-testid={`deal-card-${deal.id}`}
                            >
                              <CardContent className="p-3">
                                <div className="space-y-2">
                                  {/* Nome e classificação */}
                                  <div className="flex items-start justify-between gap-2">
                                    <h4 className="font-bold text-white text-sm line-clamp-2">
                                      {lead.nome}
                                    </h4>
                                    <Badge className={`text-xs font-bold border ${getClassificationBadge(lead.classificacao)}`}>
                                      {lead.classificacao}
                                    </Badge>
                                  </div>

                                  {/* Telefone */}
                                  <div className="flex items-center gap-2 text-xs text-white/60">
                                    <Phone className="w-3 h-3" />
                                    <span className="font-mono">{lead.telefone}</span>
                                  </div>

                                  {/* Conta média */}
                                  {lead.conta_media && (
                                    <div className="text-xs text-white/60">
                                      Conta: <span className="font-mono font-bold text-brand-yellow">R$ {lead.conta_media}</span>
                                    </div>
                                  )}

                                  {/* Valor estimado */}
                                  {deal.valor_estimado && (
                                    <div className="text-xs text-white/60">
                                      Valor: <span className="font-mono font-bold text-brand-gold">R$ {deal.valor_estimado.toLocaleString('pt-BR')}</span>
                                    </div>
                                  )}

                                  {/* Próxima ação */}
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

                                  {/* Actions */}
                                  <div className="flex gap-1 pt-2 border-t border-white/5">
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
                                      onClick={() => window.location.href = `/lead/${lead.id}`}
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
    </div>
  );
}
