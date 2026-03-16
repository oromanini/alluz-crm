import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { logsAPI } from '../lib/api';

export default function LogsIntegracao() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await logsAPI.list500Errors({ limit: 200 });
      setLogs(response.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao carregar logs de integração');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchLogs();
    }
  }, [user?.role]);

  if (user?.role !== 'admin') {
    return (
      <div className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold text-white">Logs</h1>
        <p className="text-white/60">Apenas administradores podem visualizar os logs de integração.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="logs-page">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Logs</h1>
          <p className="text-white/60">Erros 500 com requisição e body recebidos</p>
        </div>
        <Button onClick={fetchLogs} disabled={loading}>
          {loading ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </div>

      <Card className="bg-brand-gray border-white/5">
        <CardHeader>
          <CardTitle className="text-white">Erros 500 recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-white/60">Carregando logs...</p>
          ) : logs.length === 0 ? (
            <p className="text-white/60">Nenhum erro 500 registrado até o momento.</p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border border-white/10 bg-brand-dark p-4 space-y-2">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="text-red-300 font-semibold">HTTP {log.status_code}</span>
                    <span className="text-white/70">{log.method}</span>
                    <span className="text-brand-yellow break-all">{log.path}</span>
                    <span className="text-white/50">{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                  </div>

                  {log.error ? (
                    <p className="text-red-200 text-sm break-all">Erro: {log.error}</p>
                  ) : null}

                  {log.query_params && Object.keys(log.query_params).length > 0 ? (
                    <p className="text-white/70 text-sm break-all">
                      <strong className="text-white">Query:</strong> {JSON.stringify(log.query_params)}
                    </p>
                  ) : null}

                  <div>
                    <p className="text-xs uppercase text-white/50 mb-1">Body recebido</p>
                    <pre className="text-xs text-white/80 whitespace-pre-wrap break-words bg-black/30 border border-white/10 rounded p-3">
                      {log.body || '(sem body)'}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
