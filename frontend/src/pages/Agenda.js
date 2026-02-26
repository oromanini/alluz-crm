import React, { useState, useEffect, useMemo } from 'react';
import { appointmentsAPI } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Calendar } from '../components/ui/calendar';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import { CalendarDays, Clock, MapPin, Video } from 'lucide-react';

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function Agenda() {
  const [appointments, setAppointments] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
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

  const groupedAppointments = useMemo(() => {
    const grouped = {};
    appointments.forEach((apt) => {
      const date = new Date(apt.data_hora);
      const key = formatDateKey(date);
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(apt);
    });

    return Object.fromEntries(
      Object.entries(grouped).map(([key, items]) => [
        key,
        items.sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora)),
      ]),
    );
  }, [appointments]);

  const selectedDateKey = useMemo(() => formatDateKey(selectedDate), [selectedDate]);
  const selectedAppointments = groupedAppointments[selectedDateKey] || [];

  const appointmentDates = useMemo(
    () => Object.keys(groupedAppointments).map((key) => new Date(`${key}T00:00:00`)),
    [groupedAppointments],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="agenda-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Agenda</h1>
        <p className="text-white/60">Visualize seus compromissos por dia e mantenha o time no prazo.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card className="bg-brand-gray border-white/5">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-brand-yellow" />
              Calendário
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              modifiers={{ hasAppointment: appointmentDates }}
              modifiersClassNames={{
                hasAppointment: 'bg-brand-yellow/10 text-brand-yellow font-semibold',
              }}
              className="rounded-md border border-white/10 bg-black/20 text-white"
              classNames={{
                day_selected:
                  'bg-brand-yellow text-black hover:bg-brand-yellow/90 hover:text-black focus:bg-brand-yellow focus:text-black',
                day_today: 'bg-white/10 text-white',
                head_cell: 'text-white/40 rounded-md w-8 font-normal text-[0.8rem]',
                caption_label: 'text-sm font-medium text-white',
                nav_button: 'h-7 w-7 bg-transparent p-0 opacity-60 hover:opacity-100 text-white border border-white/10',
              }}
            />
          </CardContent>
        </Card>

        <Card className="bg-brand-gray border-white/5">
          <CardHeader>
            <CardTitle className="text-white">
              Compromissos em {selectedDate.toLocaleDateString('pt-BR')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedAppointments.length === 0 ? (
              <div className="p-8 text-center text-white/50 border border-dashed border-white/10 rounded-lg">
                Nenhum compromisso nesta data
              </div>
            ) : (
              selectedAppointments.map((apt) => (
                <Card key={apt.id} className="bg-black/30 border-white/10 hover:border-white/20 transition-colors">
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
                            {new Date(apt.data_hora).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span className="text-white/40">•</span>
                          <span>{apt.duracao_minutos} minutos</span>
                        </div>

                        {apt.notas && <p className="text-sm text-white/60">{apt.notas}</p>}
                      </div>

                      <Badge className={`${apt.confirmado ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                        {apt.confirmado ? 'Confirmado' : 'Pendente'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
