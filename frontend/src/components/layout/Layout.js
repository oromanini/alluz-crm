import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import {
  LayoutDashboard,
  Users,
  Layers,
  Calendar,
  FileText,
  BarChart3,
  GraduationCap,
  Settings,
  ScrollText,
  LogOut,
  Bell,
  Menu,
  X
} from 'lucide-react';
import NotificationBell from '../notifications/NotificationBell';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/pipeline', icon: Layers, label: 'Pipeline' },
    { to: '/leads', icon: Users, label: 'Leads' },
    { to: '/agenda', icon: Calendar, label: 'Agenda' },
    { to: '/propostas', icon: FileText, label: 'Propostas' },
    { to: '/relatorios', icon: BarChart3, label: 'Relatórios' },
    { to: '/aprendizado', icon: GraduationCap, label: 'Aprendizado' },
    { to: '/configuracoes', icon: Settings, label: 'Configurações', adminOnly: true },
    { to: '/logs', icon: ScrollText, label: 'Logs', adminOnly: true },
  ];

  const filteredNavItems = navItems.filter(item => {
    if (item.adminOnly && user?.role !== 'admin') return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-brand-dark flex" data-testid="layout">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-brand-dark/95 backdrop-blur-md border-r border-white/10 transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        data-testid="sidebar"
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-white/5">
            <div className="flex items-center gap-3">
              <img
                src="/images/logo-alluz.svg"
                alt="Alluz Energia"
                className="w-10 h-10 object-contain"
              />
              <div>
                <h1 className="text-xl font-bold text-white">Alluz Energia</h1>
                <p className="text-xs text-white/50">CRM Solar</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {filteredNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isActive
                    ? 'bg-brand-yellow/10 text-brand-yellow border border-brand-yellow/20'
                    : 'text-white/70 hover:text-white hover:bg-white/5 border border-transparent'
                  }`
                }
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-white/5">
            <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-lg mb-2">
              <div className="w-8 h-8 bg-brand-yellow/20 rounded-full flex items-center justify-center text-brand-yellow font-bold text-sm">
                {user?.nome?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.nome}</p>
                <p className="text-xs text-white/50 uppercase">{user?.role}</p>
              </div>
            </div>
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="w-full justify-start text-white/70 hover:text-white hover:bg-white/5"
              data-testid="logout-button"
            >
              <LogOut className="w-5 h-5 mr-3" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 lg:ml-64">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-brand-gray/95 backdrop-blur-md border-b border-white/5 px-6 py-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden text-white"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </Button>
            <div className="flex items-center gap-4 ml-auto">
              <NotificationBell />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6 md:p-8" data-testid="main-content">
          <Outlet />
        </main>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
