import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowRight, CheckCircle2, TrendingUp } from 'lucide-react';
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
        { backgroundPosition: '10% 30%' },
        {
          backgroundPosition: '90% 70%',
          duration: 12,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        }
      );

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
    <main ref={heroRef} className="relative min-h-screen overflow-hidden bg-brand-dark text-white">
      <div className="sun-gradient absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,0.23),rgba(30,64,175,0.07)_38%,rgba(15,23,42,0.95)_72%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(59,130,246,0.12)_0%,rgba(14,116,144,0.07)_35%,rgba(245,158,11,0.14)_100%)]" />

      <section className="relative mx-auto grid min-h-screen max-w-7xl grid-cols-1 items-center gap-10 px-6 py-14 lg:grid-cols-2 lg:px-10">
        <div className="hero-copy space-y-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-sm text-amber-200">
            <TrendingUp className="h-4 w-4" /> Engenharia financeira aplicada à energia
          </div>

          <h1 className="max-w-xl text-4xl font-semibold leading-tight text-white md:text-5xl">
            Pare de investir em equipamentos. Comece a investir no seu lucro.
          </h1>
          <p className="max-w-xl text-lg text-slate-200/90">
            Na Alluz Energia, nós não vendemos painéis solares. Nós vendemos a redução real da sua conta de luz.
            Tenha uma economia de até 95% sem se preocupar com a sopa de letrinhas técnica.
          </p>

          <div className="grid max-w-xl gap-3 text-sm md:grid-cols-2">
            <div className="rounded-xl border border-rose-200/20 bg-rose-200/10 p-3">
              <p className="font-semibold text-rose-100">O Jeito Antigo (ficar parado)</p>
              <ul className="mt-2 space-y-2 text-rose-50/90">
                <li>Refém dos aumentos anuais da concessionária.</li>
                <li>Dinheiro jogado fora todo mês.</li>
                <li>Preocupação com bandeiras tarifárias.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-emerald-200/30 bg-emerald-200/10 p-3">
              <p className="font-semibold text-emerald-100">O Jeito Alluz (redução real)</p>
              <ul className="mt-2 space-y-2 text-emerald-50/90">
                <li>Imunidade contra a inflação energética.</li>
                <li>Capital que vira investimento no seu imóvel ou negócio.</li>
                <li>Previsibilidade total do seu fluxo de caixa.</li>
              </ul>
            </div>
          </div>

          <div className="space-y-2 text-slate-100/95">
            <p className="font-semibold text-white">Por que a Alluz é diferente?</p>
            <p className="max-w-xl text-sm leading-relaxed text-slate-200/90">
              O mercado quer te empurrar marcas de inversores e especificações de placas. Para você, isso é irrelevante.
              O que importa é quanto você paga hoje e quanto vai pagar amanhã. Se não trouxer máxima redução no menor
              tempo possível, não serve para nós — e nem para você.
            </p>
          </div>

          <div className="space-y-2 text-sm text-slate-200/95">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-amber-300" /> Análise de Perfil: consumo dos últimos 12 meses.
            </p>
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-amber-300" /> Engenharia de Redução: projeto focado no ROI.
            </p>
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-amber-300" /> Instalação e Sorriso: menos burocracia, mais economia.
            </p>
          </div>
          <div className="hidden lg:block">
            <a
              href="https://simulador.alluzenergia.com.br/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-amber-200 transition hover:text-amber-100"
            >
              Ver simulador oficial da Alluz
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="relative">
          <form
            ref={formCardRef}
            onSubmit={handleSubmit}
            className="relative rounded-3xl border border-white/25 bg-white/10 p-6 shadow-2xl shadow-blue-900/40 backdrop-blur-xl"
          >
            <h2 className="mb-1 text-2xl font-semibold">[QUERO MINHA PROPOSTA DE ECONOMIA]</h2>
            <p className="mb-5 text-sm text-slate-200">Preencha em menos de 1 minuto e receba seu plano de redução real.</p>

            <div className="space-y-4">
              <div>
                <input
                  name="nome"
                  value={formData.nome}
                  onChange={handleChange}
                  placeholder="Nome completo"
                  className="w-full rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-white outline-none transition focus:border-amber-300 focus:bg-white/15"
                />
                {errors.nome ? <p className="mt-1 text-xs text-rose-300">{errors.nome}</p> : null}
              </div>

              <div>
                <input
                  name="telefone"
                  value={formData.telefone}
                  onChange={handleChange}
                  placeholder="Telefone / WhatsApp"
                  className="w-full rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-white outline-none transition focus:border-amber-300 focus:bg-white/15"
                />
                {errors.telefone ? <p className="mt-1 text-xs text-rose-300">{errors.telefone}</p> : null}
              </div>

              <div>
                <input
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="E-mail (opcional)"
                  className="w-full rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-white outline-none transition focus:border-amber-300 focus:bg-white/15"
                />
                {errors.email ? <p className="mt-1 text-xs text-rose-300">{errors.email}</p> : null}
              </div>

              <div>
                <input
                  type="number"
                  name="conta_media"
                  value={formData.conta_media}
                  onChange={handleChange}
                  placeholder="Conta média mensal (R$)"
                  className="w-full rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-white outline-none transition focus:border-amber-300 focus:bg-white/15"
                />
                {errors.conta_media ? <p className="mt-1 text-xs text-rose-300">{errors.conta_media}</p> : null}
              </div>

              <div>
                <select
                  name="urgencia"
                  value={formData.urgencia}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-white/25 bg-slate-900/80 px-4 py-3 text-white outline-none transition focus:border-amber-300"
                >
                  <option value="">Quando você pretende decidir?</option>
                  {urgenciaOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {errors.urgencia ? <p className="mt-1 text-xs text-rose-300">{errors.urgencia}</p> : null}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-300 px-4 py-3 font-semibold text-slate-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? 'Enviando...' : 'QUERO MINHA PROPOSTA DE ECONOMIA'}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </button>

              <p className="text-center text-xs text-slate-200/80">
                Sem compromisso. Um especialista Alluz entra em contato para apresentar a projeção de economia.
              </p>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
