import React, { useState, useEffect } from 'react';
import { leadsAPI } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
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

const initialLeadForm = {
  nome: '',
  telefone: '',
  email: '',
  cidade: '',
  bairro: '',
  conta_media: '',
  origem: 'outro',
};

export default function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatingLead, setIsCreatingLead] = useState(false);
  const [leadFormData, setLeadFormData] = useState(initialLeadForm);

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

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setLeadFormData((prev) => ({
      ...prev,
      [name]: value,
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
        telefone: leadFormData.telefone.trim(),
        email: leadFormData.email.trim() || null,
        cidade: leadFormData.cidade.trim() || null,
        bairro: leadFormData.bairro.trim() || null,
        conta_media: leadFormData.conta_media ? Number(leadFormData.conta_media) : null,
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
                  type="number"
                  min="0"
                  step="0.01"
                  value={leadFormData.conta_media}
                  onChange={handleFieldChange}
                  placeholder="350"
                  className="bg-black/30 border-white/10 text-white"
                />
              </div>
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
                {isCreatingLead ? 'Salvando...' : 'Salvar lead'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
