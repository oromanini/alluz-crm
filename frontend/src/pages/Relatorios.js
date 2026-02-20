import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export default function Relatorios() {
  return (
    <div className="space-y-6" data-testid="relatorios-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Relatórios</h1>
        <p className="text-white/60">Análises e relatórios de performance</p>
      </div>

      <Card className="bg-brand-gray border-white/5">
        <CardHeader>
          <CardTitle className="text-white">Relatórios Disponíveis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-white/50 py-8">
            Módulo de relatórios em desenvolvimento
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
