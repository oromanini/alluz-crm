import React, { useState, useEffect, useMemo, useRef } from 'react';
import { leadsAPI, dealsAPI, appointmentsAPI } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Phone, Mail, MapPin, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const SLA_TARGETS = {
  speedToLeadMinutes: 10,
  timeToMeetHours: 24,
  timeToVisitHours: 48,
};

const initialLeadForm = {
  nome: '',
  telefone: '',
  email: '',
  cidade: '',
  bairro: '',
  conta_media: '',
  origem: 'outro',
  ignorar_speed_to_lead: false,
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

const formatLeadValue = (value) => {
  if (value === null || value === undefined || value === '') return 'Não informado';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return String(value);
};

const getDiffInMinutes = (startDate, endDate) => {
  if (!startDate || !endDate) return null;
  const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
  if (Number.isNaN(diffMs)) return null;
  return Math.max(Math.round(diffMs / 60000), 0);
};

const formatDuration = (minutes) => {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!remainingMinutes) return `${hours}h`;
  return `${hours}h ${remainingMinutes}min`;
};

const getSlaBadgeStyle = (status) => {
  if (status === 'dentro') return 'bg-green-500/10 text-green-400 border-green-500/20';
  if (status === 'fora') return 'bg-red-500/10 text-red-400 border-red-500/20';
  if (status === 'nao_aplica') return 'bg-slate-500/10 text-slate-300 border-slate-500/20';
  return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
};

const getSlaLabel = (status) => {
  if (status === 'dentro') return 'Dentro do SLA';
  if (status === 'fora') return 'Fora do SLA';
  if (status === 'nao_aplica') return 'Não se aplica';
  return 'Pendente';
};

export default function Leads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingLead, setIsCreatingLead] = useState(false);
  const [leadFormData, setLeadFormData] = useState(initialLeadForm);
  const [selectedLead, setSelectedLead] = useState(null);
  const [deals, setDeals] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const notifiedOverdueLeadsRef = useRef(new Set());
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const getLiveSpeedToLeadMinutes = (lead) => {
    if (!lead || lead.ignorar_speed_to_lead) return null;

    if (lead.primeiro_contato_em) {
      return lead.status_sla_minutos ?? getDiffInMinutes(lead.created_at, lead.primeiro_contato_em);
    }

    return getDiffInMinutes(lead.created_at, new Date(nowTick).toISOString());
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const [leadsResponse, dealsResponse, appointmentsResponse] = await Promise.all([
        leadsAPI.list(),
        dealsAPI.list(),
        appointmentsAPI.list(),
      ]);

      setLeads(leadsResponse.data);
      setDeals(dealsResponse.data);
      setAppointments(appointmentsResponse.data);
    } catch (error) {
      console.error('Error fetching leads', error);
      toast.error('Erro ao carregar leads');
    } finally {
      setLoading(false);
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

  const slaByLeadId = useMemo(() => leads.reduce((acc, lead) => {
    const leadAppointments = appointments.filter((apt) => apt.lead_id === lead.id);
    const leadDeal = deals.find((deal) => deal.lead_id === lead.id);

    const firstMeet = leadAppointments
      .filter((apt) => apt.tipo === 'meet')
      .sort((a, b) => new Date(a.created_at || a.data_hora).getTime() - new Date(b.created_at || b.data_hora).getTime())[0];

    const firstVisit = leadAppointments
      .filter((apt) => apt.tipo === 'visita')
      .sort((a, b) => new Date(a.created_at || a.data_hora).getTime() - new Date(b.created_at || b.data_hora).getTime())[0];

    const speedToLeadMinutes = getLiveSpeedToLeadMinutes(lead);
    const speedStatus = lead.ignorar_speed_to_lead
      ? 'nao_aplica'
      : speedToLeadMinutes === null
        ? 'pendente'
        : speedToLeadMinutes <= SLA_TARGETS.speedToLeadMinutes ? 'dentro' : 'fora';

    const isMeetApplicable = lead.classificacao === 'A' || lead.classificacao === 'B';
    const meetMinutes = firstMeet ? getDiffInMinutes(lead.created_at, firstMeet.created_at || firstMeet.data_hora) : null;
    const meetStatus = !isMeetApplicable
      ? 'nao_aplica'
      : meetMinutes === null
        ? 'pendente'
        : meetMinutes <= SLA_TARGETS.timeToMeetHours * 60 ? 'dentro' : 'fora';

    const isVisitApplicable = lead.classificacao === 'A';
    const visitStartAt = leadDeal?.etapa === 'Visita Agendada' || leadDeal?.etapa === 'Visita Realizada'
      ? leadDeal.updated_at
      : null;
    const visitMinutes = firstVisit && visitStartAt ? getDiffInMinutes(visitStartAt, firstVisit.created_at || firstVisit.data_hora) : null;
    const visitStatus = !isVisitApplicable
      ? 'nao_aplica'
      : !visitStartAt
        ? 'pendente'
        : visitMinutes === null
          ? 'pendente'
          : visitMinutes <= SLA_TARGETS.timeToVisitHours * 60 ? 'dentro' : 'fora';

    acc[lead.id] = {
      speed: {
        status: speedStatus,
        elapsed: speedToLeadMinutes,
        meta: `${SLA_TARGETS.speedToLeadMinutes} min`,
        title: 'SLA #1 • Speed-to-lead',
        isOverdue: speedStatus === 'fora' && !lead.primeiro_contato_em,
      },
      meet: {
        status: meetStatus,
        elapsed: meetMinutes,
        meta: `${SLA_TARGETS.timeToMeetHours}h`,
        title: 'SLA #2 • Time-to-meet',
      },
      visit: {
        status: visitStatus,
        elapsed: visitMinutes,
        meta: `${SLA_TARGETS.timeToVisitHours}h`,
        title: 'SLA #3 • Time-to-visit',
      },
    };

    return acc;
  }, {}), [appointments, deals, leads, nowTick]);

  useEffect(() => {
    if (!['admin', 'sdr'].includes(user?.role)) return;

    const overdueLeads = leads
      .filter((lead) => {
        const speed = slaByLeadId[lead.id]?.speed;
        return speed?.isOverdue && !notifiedOverdueLeadsRef.current.has(lead.id);
      })
      .slice(0, 3);

    overdueLeads.forEach((lead) => {
      notifiedOverdueLeadsRef.current.add(lead.id);
    });

    if (overdueLeads.length > 0) {
      toast.warning(`SLA de 10min atrasado para: ${overdueLeads.map((lead) => lead.nome).join(', ')}`);
    }
  }, [leads, slaByLeadId, user?.role]);

  const handleFieldChange = (event) => {
    const { name, value, type, checked } = event.target;

    if (type === 'checkbox') {
      setLeadFormData((prev) => ({
        ...prev,
        [name]: checked,
      }));
      return;
    }

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

  const handleCreateLead = async (event) => {
    event.preventDefault();

    if (!leadFormData.nome.trim() || !leadFormData.telefone.trim()) {
      toast.error('Nome e telefone são obrigatórios');
      return;
    }

    try {
      setIsCreatingLead(true);

      const payload = {
        ...leadFormData,
        nome: leadFormData.nome.trim(),
        telefone: leadFormData.telefone.replace(/\D/g, ''),
        email: leadFormData.email.trim() || null,
        cidade: leadFormData.cidade.trim() || null,
        bairro: leadFormData.bairro.trim() || null,
        conta_media: parseCurrencyMaskToNumber(leadFormData.conta_media),
        ignorar_speed_to_lead: leadFormData.ignorar_speed_to_lead,
      };

      const response = await leadsAPI.create(payload);
      setLeads((prev) => [response.data, ...prev]);
      setLeadFormData(initialLeadForm);
      setIsCreateModalOpen(false);
      toast.success('Lead criado com sucesso');
    } catch (error) {
      console.error('Error creating lead', error);
      toast.error('Não foi possível criar o lead');
    } finally {
      setIsCreatingLead(false);
    }
  };

  const handleArchiveLead = async (lead) => {
    const confirmed = window.confirm(`Deseja arquivar o lead ${lead.nome}?`);
    if (!confirmed) return;

    try {
      await leadsAPI.archive(lead.id);
      setLeads((prev) => prev.filter((item) => item.id !== lead.id));
      if (selectedLead?.id === lead.id) {
        setSelectedLead(null);
      }
      toast.success('Lead arquivado com sucesso');
    } catch (error) {
      console.error('Error archiving lead', error);
      const message = error?.response?.data?.detail || 'Não foi possível arquivar o lead';
      toast.error(message);
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
    <div className="space-y-6" data-testid="leads-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Leads</h1>
          <p className="text-white/60">Gerencie todos os seus leads</p>
        </div>
        <Button
          className="bg-brand-yellow text-black hover:bg-brand-yellow/90 font-bold shadow-[0_0_15px_rgba(245,158,11,0.3)]"
          onClick={() => setIsCreateModalOpen(true)}
        >
          + Novo Lead
        </Button>
      </div>

      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="bg-brand-gray border-white/10 text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-white">Cadastrar novo lead</DialogTitle>
            <DialogDescription className="text-white/60">
              Preencha os dados essenciais para iniciar o atendimento.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateLead} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="nome" className="text-white">Nome *</Label>
                <Input
                  id="nome"
                  name="nome"
                  value={leadFormData.nome}
                  onChange={handleFieldChange}
                  placeholder="Nome completo"
                  className="bg-black/30 border-white/10 text-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefone" className="text-white">Telefone *</Label>
                <Input
                  id="telefone"
                  name="telefone"
                  value={leadFormData.telefone}
                  onChange={handleFieldChange}
                  placeholder="(11) 99999-9999"
                  className="bg-black/30 border-white/10 text-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-white">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={leadFormData.email}
                  onChange={handleFieldChange}
                  placeholder="cliente@email.com"
                  className="bg-black/30 border-white/10 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cidade" className="text-white">Cidade</Label>
                <Input
                  id="cidade"
                  name="cidade"
                  value={leadFormData.cidade}
                  onChange={handleFieldChange}
                  placeholder="São Paulo"
                  className="bg-black/30 border-white/10 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bairro" className="text-white">Bairro</Label>
                <Input
                  id="bairro"
                  name="bairro"
                  value={leadFormData.bairro}
                  onChange={handleFieldChange}
                  placeholder="Centro"
                  className="bg-black/30 border-white/10 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="conta_media" className="text-white">Conta média (R$)</Label>
                <Input
                  id="conta_media"
                  name="conta_media"
                  type="text"
                  inputMode="decimal"
                  value={leadFormData.conta_media}
                  onChange={handleFieldChange}
                  placeholder="350,00"
                  className="bg-black/30 border-white/10 text-white"
                />
              </div>

              <label className="md:col-span-2 flex items-center gap-2 text-sm text-white/80">
                <input
                  id="ignorar_speed_to_lead"
                  name="ignorar_speed_to_lead"
                  type="checkbox"
                  checked={leadFormData.ignorar_speed_to_lead}
                  onChange={handleFieldChange}
                  className="rounded border-white/20 bg-black/30"
                />
                Lead de teste (não contabilizar no Speed-to-Lead)
              </label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="text-white hover:bg-white/10"
                onClick={() => setIsCreateModalOpen(false)}
                disabled={isCreatingLead}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-brand-yellow text-black hover:bg-brand-yellow/90 font-bold"
                disabled={isCreatingLead}
              >
                {isCreatingLead ? <span className="inline-flex rounded-full bg-black/70 p-1"><LoadingSpinner className="text-brand-yellow" size={14} /></span> : 'Salvar lead'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedLead)} onOpenChange={(isOpen) => { if (!isOpen) setSelectedLead(null); }}>
        <DialogContent className="bg-brand-gray border-white/10 text-white sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-white">Detalhes do lead</DialogTitle>
            <DialogDescription className="text-white/60">
              Visualize todas as informações registradas deste lead.
            </DialogDescription>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-5">
              <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-2">
                <h3 className="font-semibold text-white">Painel de SLA do lead</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                  {Object.values(slaByLeadId[selectedLead.id] || {}).map((slaItem) => (
                    <div key={slaItem.title} className="rounded-md border border-white/10 p-3 bg-black/20">
                      <p className="text-white/70 mb-1">{slaItem.title}</p>
                      <Badge className={`border text-[10px] font-semibold mb-1 ${getSlaBadgeStyle(slaItem.status)}`}>
                        {getSlaLabel(slaItem.status)}
                      </Badge>
                      <p className="text-white/80">Tempo: {formatDuration(slaItem.elapsed)}</p>
                      <p className="text-white/50">Meta: {slaItem.meta}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-white/50">
                  SLA #3 considera exceção de disponibilidade do cliente e deve ser tratado operacionalmente quando necessário.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div><span className="text-white/60">Nome:</span> <span className="text-white font-medium">{formatLeadValue(selectedLead.nome)}</span></div>
                <div><span className="text-white/60">Telefone:</span> <span className="text-white font-medium">{formatLeadValue(selectedLead.telefone)}</span></div>
                <div><span className="text-white/60">Email:</span> <span className="text-white font-medium">{formatLeadValue(selectedLead.email)}</span></div>
                <div><span className="text-white/60">Cidade:</span> <span className="text-white font-medium">{formatLeadValue(selectedLead.cidade)}</span></div>
                <div><span className="text-white/60">Bairro:</span> <span className="text-white font-medium">{formatLeadValue(selectedLead.bairro)}</span></div>
                <div><span className="text-white/60">Origem:</span> <span className="text-white font-medium">{formatLeadValue(selectedLead.origem)}</span></div>
                <div><span className="text-white/60">Classificação:</span> <span className="text-white font-medium">{formatLeadValue(selectedLead.classificacao)}</span></div>
                <div><span className="text-white/60">Conta média:</span> <span className="text-white font-medium">{selectedLead.conta_media ? `R$ ${selectedLead.conta_media}` : 'Não informado'}</span></div>
                <div><span className="text-white/60">Ignorar Speed-to-Lead:</span> <span className="text-white font-medium">{formatLeadValue(selectedLead.ignorar_speed_to_lead)}</span></div>
                <div><span className="text-white/60">Criado em:</span> <span className="text-white font-medium">{selectedLead.created_at ? new Date(selectedLead.created_at).toLocaleString('pt-BR') : 'Não informado'}</span></div>
                <div><span className="text-white/60">Atualizado em:</span> <span className="text-white font-medium">{selectedLead.updated_at ? new Date(selectedLead.updated_at).toLocaleString('pt-BR') : 'Não informado'}</span></div>
                <div><span className="text-white/60">Decisão em até 30 dias:</span> <span className="text-white font-medium">{formatLeadValue(selectedLead.decisao_em_ate_30_dias)}</span></div>
                <div><span className="text-white/60">Enviou foto da fatura:</span> <span className="text-white font-medium">{formatLeadValue(selectedLead.enviou_foto_fatura)}</span></div>
                <div><span className="text-white/60">Enviou foto do telhado:</span> <span className="text-white font-medium">{formatLeadValue(selectedLead.enviou_foto_telhado)}</span></div>
                <div><span className="text-white/60">Apenas pesquisando:</span> <span className="text-white font-medium">{formatLeadValue(selectedLead.apenas_pesquisando)}</span></div>
                <div><span className="text-white/60">Imóvel próprio:</span> <span className="text-white font-medium">{formatLeadValue(selectedLead.imovel_proprio)}</span></div>
                <div><span className="text-white/60">Possui área útil necessária:</span> <span className="text-white font-medium">{formatLeadValue(selectedLead.possui_area_util_necessaria)}</span></div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="text-white hover:bg-white/10"
              onClick={() => setSelectedLead(null)}
            >
              Fechar
            </Button>
            {selectedLead && (
              <Button
                type="button"
                variant="ghost"
                className="hover:bg-red-500/10 hover:text-red-400"
                onClick={() => handleArchiveLead(selectedLead)}
              >
                Arquivar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {leads.map((lead) => (
          <Card key={lead.id} className="bg-brand-gray border-white/5 hover:border-white/10 transition-colors cursor-pointer" data-testid={`lead-card-${lead.id}`} onClick={() => setSelectedLead(lead)}>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-white">{lead.nome}</h3>
                  <div className="flex items-center gap-1">
                    {lead.ignorar_speed_to_lead && (
                      <Badge className="text-[10px] font-bold border bg-purple-500/10 text-purple-300 border-purple-400/20">
                        Teste
                      </Badge>
                    )}
                    <Badge className={`text-xs font-bold border ${getClassificationBadge(lead.classificacao)}`}>
                      {lead.classificacao}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-white/60">
                  <div className="space-y-1 rounded-md border border-white/5 bg-black/20 p-2">
                    {Object.values(slaByLeadId[lead.id] || {}).map((slaItem) => (
                      <div key={slaItem.title} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-white/60">{slaItem.title}</span>
                        <Badge className={`border text-[10px] font-semibold ${getSlaBadgeStyle(slaItem.status)}`}>
                          {getSlaLabel(slaItem.status)} · {formatDuration(slaItem.elapsed)} / {slaItem.meta}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    <span className="font-mono">{lead.telefone}</span>
                  </div>

                  {lead.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      <span className="truncate">{lead.email}</span>
                    </div>
                  )}

                  {lead.cidade && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>{lead.cidade}</span>
                    </div>
                  )}

                  {lead.conta_media && (
                    <div className="text-white">
                      Conta média: <span className="font-mono font-bold text-brand-yellow">R$ {lead.conta_media}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs">
                    <Calendar className="w-3 h-3" />
                    <span>Criado em {new Date(lead.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-white/5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 hover:bg-green-500/10 hover:text-green-400"
                    onClick={(event) => {
                      event.stopPropagation();
                      window.open(`https://wa.me/55${lead.telefone.replace(/\D/g, '')}`, '_blank');
                    }}
                  >
                    WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 hover:bg-blue-500/10 hover:text-blue-400"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedLead(lead);
                    }}
                  >
                    Ver Detalhes
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="hover:bg-red-500/10 hover:text-red-400"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleArchiveLead(lead);
                    }}
                  >
                    Arquivar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
