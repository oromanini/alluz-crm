import React, { useEffect, useState } from 'react';
import { dashboardAPI } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Users, TrendingUp, Clock, CheckCircle, XCircle, DollarSign, AlertTriangle } from 'lucide-react';

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await dashboardAPI.getMetrics();
      setMetrics(response.data);
    } catch (error) {
      console.error('Error fetching metrics', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-white/50">Carregando...</div>
      </div>
    );
  }

  const cards = [
    {
      title: 'Total de Leads',
      value: metrics?.total_leads || 0,
      icon: Users,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10'
    },
    {
      title: 'Leads Classe A',
      value: metrics?.leads_a || 0,
      icon: TrendingUp,
      color: 'text-brand-gold',
      bgColor: 'bg-yellow-500/10'
    },
    {
      title: 'SLA Médio',
      value: `${metrics?.sla_medio_minutos || 0} min`,
      subtitle: `${metrics?.sla_percent_dentro || 0}% dentro do SLA · limite ${metrics?.sla_limite_minutos || 10} min úteis`,
      icon: Clock,
      color: metrics?.sla_medio_minutos > 10 ? 'text-red-400' : 'text-green-400',
      bgColor: metrics?.sla_medio_minutos > 10 ? 'bg-red-500/10' : 'bg-green-500/10'
    },
    {
      title: 'Speed-to-Lead em risco',
      value: metrics?.leads_sla_em_risco || 0,
      subtitle: `${metrics?.leads_sem_contato || 0} leads sem 1º contato`,
      icon: AlertTriangle,
      color: metrics?.leads_sla_em_risco > 0 ? 'text-red-400' : 'text-green-400',
      bgColor: metrics?.leads_sla_em_risco > 0 ? 'bg-red-500/10' : 'bg-green-500/10'
    },
    {
      title: 'Fechados (Ganhos)',
      value: metrics?.fechados_ganhos || 0,
      icon: CheckCircle,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10'
    },
    {
      title: 'Fechados (Perdidos)',
      value: metrics?.fechados_perdidos || 0,
      icon: XCircle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10'
    },
    {
      title: 'Ticket Médio',
      value: `R$ ${(metrics?.ticket_medio || 0).toLocaleString('pt-BR')}`,
      icon: DollarSign,
      color: 'text-brand-yellow',
      bgColor: 'bg-yellow-500/10'
    },
    {
      title: 'Valor Total Pipeline',
      value: `R$ ${(metrics?.valor_total_pipeline || 0).toLocaleString('pt-BR')}`,
      icon: DollarSign,
      color: 'text-brand-gold',
      bgColor: 'bg-yellow-500/10'
    },
    {
      title: 'Propostas Paradas',
      value: metrics?.propostas_paradas || 0,
      subtitle: 'Sem atividade 3+ dias',
      icon: AlertTriangle,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10'
    },
  ];

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Dashboard Executivo</h1>
        <p className="text-white/60">Visão geral das métricas do CRM</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="metrics-grid">
        {cards.map((card, index) => (
          <Card key={index} className="bg-brand-gray border-white/5 hover:border-white/10 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-white/70">
                {card.title}
              </CardTitle>
              <div className={`w-10 h-10 ${card.bgColor} rounded-lg flex items-center justify-center`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white font-mono">{card.value}</div>
              {card.subtitle && (
                <p className="text-xs text-white/40 mt-1">{card.subtitle}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline Overview */}
      <Card className="bg-brand-gray border-white/5">
        <CardHeader>
          <CardTitle className="text-white">Distribuição do Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {metrics?.pipeline_counts && Object.entries(metrics.pipeline_counts).map(([etapa, count]) => (
              <div key={etapa} className="bg-white/5 rounded-lg p-4 border border-white/5">
                <p className="text-xs text-white/50 uppercase tracking-wide">{etapa}</p>
                <p className="text-2xl font-bold text-white font-mono mt-1">{count}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Leads por Classificação */}
      <Card className="bg-brand-gray border-white/5">
        <CardHeader>
          <CardTitle className="text-white">Leads por Classificação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <p className="text-xs text-yellow-500 uppercase tracking-wide font-bold">Lead A</p>
              <p className="text-3xl font-bold text-yellow-500 font-mono mt-2">{metrics?.leads_a || 0}</p>
              <p className="text-xs text-white/40 mt-1">Alta prioridade</p>
            </div>
            <div className="bg-slate-500/10 border border-slate-500/20 rounded-lg p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wide font-bold">Lead B</p>
              <p className="text-3xl font-bold text-slate-400 font-mono mt-2">{metrics?.leads_b || 0}</p>
              <p className="text-xs text-white/40 mt-1">Média prioridade</p>
            </div>
            <div className="bg-orange-900/10 border border-orange-900/20 rounded-lg p-4">
              <p className="text-xs text-orange-700 uppercase tracking-wide font-bold">Lead C</p>
              <p className="text-3xl font-bold text-orange-700 font-mono mt-2">{metrics?.leads_c || 0}</p>
              <p className="text-xs text-white/40 mt-1">Nutrição</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
