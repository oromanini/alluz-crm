import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { useAuth } from '../context/AuthContext';

export default function Configuracoes() {
  const { user } = useAuth();

  return (
    <div className="space-y-6" data-testid="configuracoes-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Configurações</h1>
        <p className="text-white/60">Gerencie usuários, integrações e webhooks</p>
      </div>

      <Card className="bg-brand-gray border-white/5">
        <CardHeader>
          <CardTitle className="text-white">Webhook - Captura de Leads</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-white/60 mb-2">Endpoint para Meta Lead Ads:</p>
              <code className="block p-3 bg-brand-dark border border-white/10 rounded text-brand-yellow font-mono text-sm">
                {process.env.REACT_APP_BACKEND_URL}/api/webhooks/lead-capture
              </code>
            </div>
            <p className="text-xs text-white/40">
              Configure este endpoint no Meta Business Suite para captura automática de leads
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-brand-gray border-white/5">
        <CardHeader>
          <CardTitle className="text-white">Gerenciamento de Usuários</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-white/50 py-4">
            Módulo de gerenciamento de usuários em desenvolvimento
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
