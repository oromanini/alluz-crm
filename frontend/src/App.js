import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from './components/ui/sonner';
import Login from './pages/Login';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import Leads from './pages/Leads';
import Agenda from './pages/Agenda';
import Propostas from './pages/Propostas';
import Relatorios from './pages/Relatorios';
import Configuracoes from './pages/Configuracoes';
import Aprendizado from './pages/Aprendizado';
import LandingPage from './pages/LandingPage';
import LandingThankYouPage from './pages/LandingThankYouPage';
import LogsIntegracao from './pages/LogsIntegracao';
import { LoadingSpinner } from './components/ui/loading-spinner';
import './index.css';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-dark flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return user ? children : <Navigate to="/login" />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
      <Route path="/landingpage" element={<LandingPage />} />
      <Route path="/landingpage/obrigado" element={<LandingThankYouPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="leads" element={<Leads />} />
        <Route path="lead/:leadId" element={<Leads />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="propostas" element={<Propostas />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="aprendizado" element={<Aprendizado />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="logs" element={<LogsIntegracao />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#18181B',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
