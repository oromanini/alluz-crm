import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { LoadingSpinner } from '../components/ui/loading-spinner';
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Login realizado com sucesso!');
      navigate('/dashboard');
    } catch (error) {
      toast.error('Email ou senha incorretos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark p-4">
      <Card className="w-full max-w-md bg-brand-gray border-white/5" data-testid="login-card">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-16 h-16 flex items-center justify-center">
            <img
              src="/images/logo-alluz.svg"
              alt="Alluz Energia"
              className="w-10 h-10 object-contain"
            />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold text-white">Alluz Energia</CardTitle>
            <CardDescription className="text-white/60 mt-2">CRM Solar - Faça login para continuar</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/80">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-brand-dark border-white/10 text-white placeholder:text-white/20 focus:border-brand-yellow/50 focus:ring-brand-yellow/50"
                data-testid="email-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/80">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-brand-dark border-white/10 text-white placeholder:text-white/20 focus:border-brand-yellow/50 focus:ring-brand-yellow/50"
                data-testid="password-input"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-brand-yellow text-black hover:bg-brand-yellow/90 font-bold shadow-[0_0_15px_rgba(245,158,11,0.3)] h-11"
              disabled={loading}
              data-testid="login-submit-button"
            >
              {loading ? (
                <span className="inline-flex rounded-full bg-black/70 p-1"><LoadingSpinner className="text-brand-yellow" size={14} /></span>
              ) : (
                'Entrar'
              )}
            </Button>
          </form>
          <div className="mt-6 pt-6 border-t border-white/5 text-center text-sm text-white/40">
            <p>Demo - Admin: admin@alluz.com.br / admin123</p>
            <p className="mt-1">SDR: sdr@alluz.com.br / sdr123</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
