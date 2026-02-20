import React, { useState, useEffect } from 'react';
import { leadsAPI } from '../../lib/api';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Phone, Mail, MapPin, Calendar } from 'lucide-react';
import { toast } from 'sonner';

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const response = await leadsAPI.list();
      setLeads(response.data);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-white/50">Carregando leads...</div>
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
        <Button className="bg-brand-yellow text-black hover:bg-brand-yellow/90 font-bold shadow-[0_0_15px_rgba(245,158,11,0.3)]">
          + Novo Lead
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {leads.map((lead) => (
          <Card key={lead.id} className="bg-brand-gray border-white/5 hover:border-white/10 transition-colors" data-testid={`lead-card-${lead.id}`}>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-white">{lead.nome}</h3>
                  <Badge className={`text-xs font-bold border ${getClassificationBadge(lead.classificacao)}`}>
                    {lead.classificacao}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm text-white/60">
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
                    onClick={() => window.open(`https://wa.me/55${lead.telefone.replace(/\D/g, '')}`, '_blank')}
                  >
                    WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 hover:bg-blue-500/10 hover:text-blue-400"
                    onClick={() => window.location.href = `/lead/${lead.id}`}
                  >
                    Ver Detalhes
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
