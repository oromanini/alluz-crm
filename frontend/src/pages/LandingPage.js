import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowRight, CheckCircle2, Mail, Phone, SunMedium, TrendingUp, User } from 'lucide-react';
import { toast } from 'sonner';

const urgenciaOptions = ['<= 7 dias', '30 dias', '60+ dias', 'Pesquisando'];

const initialForm = {
  nome: '',
  telefone: '',
  email: '',
  conta_media: '',
  urgencia: '',
};

const API_BASE_URL = `${process.env.REACT_APP_BACKEND_URL}/api`;

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function LandingPage() {
  const heroRef = useRef(null);
  const formCardRef = useRef(null);

  const [formData, setFormData] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const utmData = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || null,
      utm_medium: params.get('utm_medium') || null,
      utm_campaign: params.get('utm_campaign') || null,
    };
  }, []);

  useEffect(() => {
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;

    if (!gsap || !ScrollTrigger) return undefined;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.sun-gradient',
        { backgroundPosition: '16% 24%' },
        {
          backgroundPosition: '76% 72%',
          duration: 11,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        }
      );

      gsap.to('.floating-glow', {
        y: -15,
        x: 6,
        duration: 3,
        stagger: 0.3,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      gsap.fromTo(
        '.hero-copy > *',
        { y: 24, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          stagger: 0.08,
          duration: 0.7,
          ease: 'power2.out',
        }
      );

      gsap.fromTo(
        formCardRef.current,
        { x: 50, opacity: 0, scale: 0.98 },
        { x: 0, opacity: 1, scale: 1, duration: 0.8, delay: 0.35, ease: 'power3.out' }
      );

      gsap.fromTo(
        '.benefit-chip',
        { y: 16, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.5,
          stagger: 0.08,
          delay: 0.45,
          ease: 'power2.out',
        }
      );
    }, heroRef);

    return () => ctx.revert();
  }, []);

  const validateField = (name, value) => {
    if (name === 'nome' && value.trim().length < 3) return 'Informe seu nome completo';
    if (name === 'telefone' && value.replace(/\D/g, '').length < 10) return 'Telefone inválido';
    if (name === 'email' && value && !/^\S+@\S+\.\S+$/.test(value)) return 'E-mail inválido';
    if (name === 'conta_media' && value && Number(value) <= 0) return 'Informe um valor maior que zero';
    if (name === 'urgencia' && !value) return 'Selecione a urgência';
    return '';
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    const parsedValue = name === 'telefone' ? formatPhone(value) : value;
    setFormData((previous) => ({ ...previous, [name]: parsedValue }));
    setErrors((previous) => ({ ...previous, [name]: validateField(name, parsedValue) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = Object.entries(formData).reduce((accumulator, [field, value]) => {
      const message = validateField(field, value);
      if (message && field !== 'email' && field !== 'conta_media') {
        accumulator[field] = message;
      }
      if ((field === 'email' || field === 'conta_media') && message) {
        accumulator[field] = message;
      }
      return accumulator;
    }, {});

    if (!formData.nome || !formData.telefone || !formData.urgencia) {
      if (!formData.nome) nextErrors.nome = 'Nome é obrigatório';
      if (!formData.telefone) nextErrors.telefone = 'Telefone é obrigatório';
      if (!formData.urgencia) nextErrors.urgencia = 'Selecione a urgência';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      setIsSubmitting(true);
      await axios.post(`${API_BASE_URL}/webhooks/lead-capture`, {
        nome: formData.nome.trim(),
        telefone: formData.telefone,
        email: formData.email || null,
        origem: 'Site Alluz - Landing Page',
        conta_media: formData.conta_media ? Number(formData.conta_media) : null,
        urgencia: formData.urgencia,
        ...utmData,
      });

      toast.success('Recebemos seu cadastro! Nosso time comercial entrará em contato.');
      setFormData(initialForm);
      setErrors({});
    } catch (error) {
      toast.error('Não foi possível enviar agora. Tente novamente em alguns instantes.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main ref={heroRef} className="relative min-h-screen overflow-hidden bg-[#fffbeb] text-slate-900">
      <div className="sun-gradient absolute inset-0 bg-[radial-gradient(circle_at_16%_26%,rgba(251,191,36,0.42),rgba(245,158,11,0.24)_30%,rgba(248,250,252,0.92)_65%,rgba(248,250,252,1)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(104deg,rgba(245,158,11,0.20)_0%,rgba(255,255,255,0.32)_44%,rgba(249,115,22,0.14)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_68%_90%,rgba(251,146,60,0.20),transparent_55%)]" />
      <div className="floating-glow pointer-events-none absolute -left-20 top-14 h-56 w-56 rounded-full bg-amber-200/50 blur-3xl" />
      <div className="floating-glow pointer-events-none absolute right-5 top-5 h-64 w-64 rounded-full bg-orange-200/50 blur-3xl" />
      <div className="floating-glow pointer-events-none absolute bottom-8 right-24 h-56 w-56 rounded-full bg-yellow-200/45 blur-3xl" />

      <section className="relative mx-auto grid min-h-screen max-w-7xl grid-cols-1 items-center gap-10 px-6 py-10 lg:grid-cols-2 lg:px-10">
        <div className="hero-copy space-y-6">
          <div className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-white p-2 shadow-lg shadow-amber-400/20">
            <img src="/images/logo-alluz.svg" alt="Logo Alluz" className="h-12 w-12 rounded-full" />
          </div>

          <h1 className="max-w-xl text-4xl font-semibold leading-tight md:text-6xl">
            A Luz do Futuro É <span className="text-amber-500">Solar</span>
          </h1>
          <p className="max-w-xl text-base text-slate-700 md:text-lg md:leading-relaxed">
            Reduza sua conta de luz em até <span className="font-semibold text-amber-600">95%</span>. Engenharia
            financeira aplicada à energia para transformar economia em liberdade.
          </p>

          <div className="flex flex-wrap gap-3 text-sm text-slate-700">
            <p className="benefit-chip flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-2">
              <CheckCircle2 className="h-4 w-4 text-orange-600" /> Garantia de 25 anos
            </p>
            <p className="benefit-chip flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2">
              <TrendingUp className="h-4 w-4 text-amber-600" /> Instalação rápida
            </p>
          </div>

          <div className="grid max-w-xl gap-2 text-sm text-slate-600 md:grid-cols-2">
            <p className="benefit-chip rounded-lg border border-slate-200 bg-white/80 px-3 py-2 shadow-sm">
              Análise de consumo real dos últimos 12 meses.
            </p>
            <p className="benefit-chip rounded-lg border border-slate-200 bg-white/80 px-3 py-2 shadow-sm">
              Projeto focado em retorno e previsibilidade.
            </p>
          </div>
        </div>

        <div className="relative">
          <form
            ref={formCardRef}
            onSubmit={handleSubmit}
            className="relative rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl shadow-slate-200/80 backdrop-blur"
          >
            <div className="relative">
              <h2 className="mb-1 text-3xl font-semibold text-slate-900">Receba sua proposta de redução</h2>
              <p className="mb-5 text-sm text-slate-600">Preencha em 30 segundos e descubra quanto pode economizar.</p>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Nome *</label>
                  <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-amber-400">
                    <User className="h-4 w-4 text-slate-400" />
                    <input
                      name="nome"
                      value={formData.nome}
                      onChange={handleChange}
                      placeholder="Seu nome completo"
                      className="w-full bg-transparent px-2 py-3 text-slate-900 outline-none"
                    />
                  </div>
                  {errors.nome ? <p className="mt-1 text-xs text-rose-500">{errors.nome}</p> : null}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Telefone *</label>
                  <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-amber-400">
                    <Phone className="h-4 w-4 text-slate-400" />
                    <input
                      name="telefone"
                      value={formData.telefone}
                      onChange={handleChange}
                      placeholder="(00) 00000-0000"
                      className="w-full bg-transparent px-2 py-3 text-slate-900 outline-none"
                    />
                  </div>
                  {errors.telefone ? <p className="mt-1 text-xs text-rose-500">{errors.telefone}</p> : null}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    E-mail (opcional)
                  </label>
                  <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-amber-400">
                    <Mail className="h-4 w-4 text-slate-400" />
                    <input
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="seu@email.com"
                      className="w-full bg-transparent px-2 py-3 text-slate-900 outline-none"
                    />
                  </div>
                  {errors.email ? <p className="mt-1 text-xs text-rose-500">{errors.email}</p> : null}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Conta média mensal
                  </label>
                  <input
                    type="number"
                    name="conta_media"
                    value={formData.conta_media}
                    onChange={handleChange}
                    placeholder="R$ 0,00"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-amber-400"
                  />
                  {errors.conta_media ? <p className="mt-1 text-xs text-rose-500">{errors.conta_media}</p> : null}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Urgência *</label>
                  <select
                    name="urgencia"
                    value={formData.urgencia}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-amber-400"
                  >
                    <option value="">Quando você pretende decidir?</option>
                    {urgenciaOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {errors.urgencia ? <p className="mt-1 text-xs text-rose-500">{errors.urgencia}</p> : null}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? 'Enviando...' : 'QUERO MINHA PROPOSTA'}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </button>

                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
                  <SunMedium className="h-3.5 w-3.5 text-amber-500" /> Sem compromisso. Resposta em até 24h.
                </p>
              </div>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
