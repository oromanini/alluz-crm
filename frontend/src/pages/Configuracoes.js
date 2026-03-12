import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { usersAPI } from '../lib/api';

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'sdr', label: 'SDR' },
  { value: 'closer', label: 'Closer' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'instalacao', label: 'Instalação' },
];

const initialForm = {
  nome: '',
  email: '',
  role: 'sdr',
  password: '',
};

export default function Configuracoes() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newUser, setNewUser] = useState(initialForm);
  const [creatingUser, setCreatingUser] = useState(false);
  const [resetPasswordByUserId, setResetPasswordByUserId] = useState({});

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [users],
  );

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchUsers();
    }
  }, [user?.role]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await usersAPI.list();
      setUsers(response.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao carregar usuários');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();

    if (!newUser.nome || !newUser.email || !newUser.password) {
      toast.error('Preencha nome, email e senha');
      return;
    }

    setCreatingUser(true);
    try {
      await usersAPI.create(newUser);
      toast.success('Usuário criado com sucesso');
      setNewUser(initialForm);
      await fetchUsers();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao criar usuário');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleRoleChange = async (selectedUser, role) => {
    try {
      await usersAPI.update(selectedUser.id, { role });
      toast.success('Perfil atualizado');
      await fetchUsers();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao atualizar perfil');
    }
  };

  const handleResetPassword = async (selectedUser) => {
    const password = (resetPasswordByUserId[selectedUser.id] || '').trim();

    if (!password) {
      toast.error('Informe a nova senha');
      return;
    }

    try {
      await usersAPI.resetPassword(selectedUser.id, { password });
      toast.success(`Senha de ${selectedUser.nome} atualizada`);
      setResetPasswordByUserId((prev) => ({ ...prev, [selectedUser.id]: '' }));
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao resetar senha');
    }
  };

  const handleDeleteUser = async (selectedUser) => {
    if (!window.confirm(`Remover o usuário ${selectedUser.nome}?`)) return;

    try {
      await usersAPI.remove(selectedUser.id);
      toast.success('Usuário removido');
      await fetchUsers();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Erro ao remover usuário');
    }
  };

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
        <CardContent className="space-y-6">
          {user?.role !== 'admin' ? (
            <p className="text-white/60">Apenas administradores podem gerenciar usuários.</p>
          ) : (
            <>
              <form className="grid grid-cols-1 md:grid-cols-4 gap-3" onSubmit={handleCreateUser}>
                <div className="space-y-2">
                  <Label htmlFor="nome" className="text-white">Nome</Label>
                  <Input
                    id="nome"
                    value={newUser.nome}
                    onChange={(event) => setNewUser((prev) => ({ ...prev, nome: event.target.value }))}
                    placeholder="Nome completo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newUser.email}
                    onChange={(event) => setNewUser((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="email@alluz.com.br"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-white">Senha inicial</Label>
                  <Input
                    id="password"
                    type="password"
                    value={newUser.password}
                    onChange={(event) => setNewUser((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="Senha temporária"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white">Perfil</Label>
                  <Select value={newUser.role} onValueChange={(value) => setNewUser((prev) => ({ ...prev, role: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((role) => (
                        <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-4">
                  <Button type="submit" disabled={creatingUser}>
                    {creatingUser ? 'Criando...' : 'Criar usuário'}
                  </Button>
                </div>
              </form>

              {loadingUsers ? (
                <p className="text-white/60">Carregando usuários...</p>
              ) : (
                <div className="space-y-4">
                  {sortedUsers.map((listedUser) => (
                    <div key={listedUser.id} className="border border-white/10 rounded-md p-4 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <p className="text-white font-semibold">{listedUser.nome}</p>
                          <p className="text-white/60 text-sm">{listedUser.email}</p>
                        </div>
                        <div className="w-full md:w-64">
                          <Select
                            value={listedUser.role}
                            onValueChange={(value) => handleRoleChange(listedUser, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Perfil" />
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((role) => (
                                <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
                        <Input
                          type="password"
                          placeholder="Nova senha"
                          value={resetPasswordByUserId[listedUser.id] || ''}
                          onChange={(event) => setResetPasswordByUserId((prev) => ({
                            ...prev,
                            [listedUser.id]: event.target.value,
                          }))}
                        />
                        <Button variant="secondary" onClick={() => handleResetPassword(listedUser)}>
                          Resetar senha
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => handleDeleteUser(listedUser)}
                          disabled={listedUser.id === user?.id}
                        >
                          Excluir
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
