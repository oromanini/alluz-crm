import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

export default function Propostas() {
  return (
    <div className="space-y-6" data-testid="propostas-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Propostas</h1>
        <p className="text-white/60">Gerencie as propostas comerciais</p>
      </div>

      <Card className="bg-brand-gray border-white/5">
        <CardHeader>
          <CardTitle className="text-white">Propostas Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-white/50 py-8">
            Módulo de propostas em desenvolvimento
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
