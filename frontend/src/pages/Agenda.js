import React, { useState, useEffect } from 'react';
import { appointmentsAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Calendar, Clock, MapPin, Video } from 'lucide-react';

export default function Agenda() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    try {
      const response = await appointmentsAPI.list();
      setAppointments(response.data);
    } catch (error) {
      console.error('Error fetching appointments', error);
    } finally {
      setLoading(false);
    }
  };

  const groupByDate = (appointments) => {
    const grouped = {};
    appointments.forEach(apt => {
      const date = new Date(apt.data_hora).toLocaleDateString('pt-BR');
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(apt);
    });
    return grouped;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-white/50">Carregando agenda...</div>
      </div>
    );
  }

  const groupedAppointments = groupByDate(appointments);

  return (
    <div className="space-y-6" data-testid="agenda-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Agenda</h1>
        <p className="text-white/60">Seus compromissos e visitas agendadas</p>
      </div>

      <div className="space-y-6">
        {Object.keys(groupedAppointments).length === 0 ? (
          <Card className="bg-brand-gray border-white/5">
            <CardContent className="p-8 text-center text-white/50">
              Nenhum compromisso agendado
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedAppointments).map(([date, apts]) => (
            <div key={date}>
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-brand-yellow" />
                {date}
              </h2>
              <div className="space-y-3">
                {apts.map((apt) => (
                  <Card key={apt.id} className="bg-brand-gray border-white/5 hover:border-white/10 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            {apt.tipo === 'meet' ? (
                              <Video className="w-4 h-4 text-blue-400" />
                            ) : (
                              <MapPin className="w-4 h-4 text-green-400" />
                            )}
                            <Badge className={`text-xs font-bold ${apt.tipo === 'meet' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`}>
                              {apt.tipo === 'meet' ? 'Meet Online' : 'Visita Técnica'}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2 text-white/60">
                            <Clock className="w-4 h-4" />
                            <span className="font-mono">
                              {new Date(apt.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-white/40">•</span>
                            <span>{apt.duracao_minutos} minutos</span>
                          </div>

                          {apt.notas && (
                            <p className="text-sm text-white/60">{apt.notas}</p>
                          )}
                        </div>

                        <Badge className={`${apt.confirmado ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                          {apt.confirmado ? 'Confirmado' : 'Pendente'}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
