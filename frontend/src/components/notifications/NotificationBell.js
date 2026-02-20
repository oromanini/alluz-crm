import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { notificationsAPI } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await notificationsAPI.list();
      setNotifications(response.data);
      setUnreadCount(response.data.filter(n => !n.lida).length);
    } catch (error) {
      console.error('Error fetching notifications', error);
    }
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.lida) {
      await notificationsAPI.markRead(notification.id);
      fetchNotifications();
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-white/70 hover:text-white"
          data-testid="notifications-bell"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-brand-yellow text-black text-xs font-bold rounded-full flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 bg-brand-gray border-white/10">
        <div className="p-3 border-b border-white/5">
          <h3 className="font-bold text-white">Notificações</h3>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-white/50 text-sm">
              Nenhuma notificação
            </div>
          ) : (
            notifications.map((notif) => (
              <DropdownMenuItem
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`p-4 cursor-pointer border-b border-white/5 ${!notif.lida ? 'bg-brand-yellow/5' : ''}`}
              >
                <div className="flex-1">
                  <p className={`text-sm ${!notif.lida ? 'font-medium text-white' : 'text-white/70'}`}>
                    {notif.mensagem}
                  </p>
                  <p className="text-xs text-white/40 mt-1">
                    {new Date(notif.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
