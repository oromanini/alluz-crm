import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowRight, BadgeDollarSign, Leaf, ShieldCheck, Sun, Zap } from 'lucide-react';
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
  const crmCardRef = useRef(null);
  const solarPlatesRef = useRef([]);
  const photonsRef = useRef([]);

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
        solarPlatesRef.current,
        { y: 80, opacity: 0, rotateX: -20 },
        {
          y: 0,
          opacity: 1,
          rotateX: 0,
          stagger: 0.2,
          duration: 1,
          ease: 'power2.out',
        }
      );

      gsap.fromTo(
        formCardRef.current,
        { x: 50, opacity: 0, scale: 0.98 },
        { x: 0, opacity: 1, scale: 1, duration: 0.8, delay: 0.35, ease: 'power3.out' }
      );

      gsap.fromTo(
        crmCardRef.current,
        { y: 20, rotationY: -10, opacity: 0 },
        {
          y: 0,
          rotationY: 0,
          opacity: 1,
          duration: 1.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: crmCardRef.current,
            start: 'top 85%',
          },
        }
      );

      photonsRef.current.forEach((photon, index) => {
        if (!photon) return;
        gsap.fromTo(
          photon,
          {
            x: -220,
            y: index * 16,
            opacity: 0,
          },
          {
            x: 440,
            y: index * 16 + (index % 2 ? -18 : 12),
            opacity: 1,
            duration: 2.4,
            repeat: -1,
            repeatDelay: 0.2,
            delay: index * 0.22,
            ease: 'power1.inOut',
            yoyo: false,
          }
        );
      });

      const move3dCard = (event) => {
        if (!crmCardRef.current) return;
        const { left, top, width, height } = crmCardRef.current.getBoundingClientRect();
        const px = (event.clientX - left) / width - 0.5;
        const py = (event.clientY - top) / height - 0.5;
        gsap.to(crmCardRef.current, {
          rotateY: px * 16,
          rotateX: -py * 14,
          transformPerspective: 900,
          duration: 0.5,
          ease: 'power2.out',
        });
      };

      heroRef.current?.addEventListener('mousemove', move3dCard);
      heroRef.current?.addEventListener('mouseleave', () => {
        gsap.to(crmCardRef.current, { rotateY: 0, rotateX: 0, duration: 0.6, ease: 'power2.out' });
      });

      return () => {
        heroRef.current?.removeEventListener('mousemove', move3dCard);
      };
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
        <div className="space-y-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-sm text-amber-200">
            <Sun className="h-4 w-4" /> Tecnologia solar + CRM inteligente
          </div>

          <h1 className="max-w-xl text-4xl font-semibold leading-tight text-white md:text-5xl">
            Transforme sua conta de luz em economia real com o CRM da Alluz Energia Solar.
          </h1>
          <p className="max-w-lg text-lg text-slate-200/90">
            Cadastre-se para receber um diagnóstico rápido e descubra como nosso time usa dados, automação e energia limpa
            para acelerar seu projeto.
          </p>

          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <BadgeDollarSign className="h-4 w-4 text-amber-300" /> Economia desde a primeira proposta
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <ShieldCheck className="h-4 w-4 text-sky-300" /> Processo consultivo e seguro
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <Leaf className="h-4 w-4 text-emerald-300" /> Sustentável e escalável
            </div>
          </div>

          <div className="relative max-w-md rounded-3xl border border-white/20 bg-white/10 p-5 backdrop-blur-md" ref={crmCardRef}>
            <p className="mb-4 text-xs uppercase tracking-[0.24em] text-slate-200">Preview CRM Alluz</p>
            <div className="space-y-3">
              <div className="h-9 rounded-lg bg-gradient-to-r from-sky-500/60 to-cyan-400/60" />
              <div className="grid grid-cols-3 gap-2">
                <div className="h-20 rounded-lg bg-white/20" />
                <div className="h-20 rounded-lg bg-white/10" />
                <div className="h-20 rounded-lg bg-amber-300/30" />
              </div>
              <div className="h-16 rounded-lg bg-white/10" />
            </div>
            <div className="absolute -right-3 -top-3 flex items-center gap-1 rounded-full bg-emerald-400/90 px-3 py-1 text-xs font-medium text-emerald-950">
              <Zap className="h-3.5 w-3.5" /> Automação ativa
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute left-0 top-10 hidden h-56 w-full lg:block">
            {Array.from({ length: 8 }).map((_, index) => (
              <span
                key={`photon-${index}`}
                ref={(element) => {
                  photonsRef.current[index] = element;
                }}
                className="absolute inline-block h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.9)]"
                style={{ top: `${index * 18}px` }}
              />
            ))}
          </div>

          <div className="mb-6 grid grid-cols-3 gap-3 perspective-[700px]">
            {[0, 1, 2].map((plateIndex) => (
              <div
                key={plateIndex}
                ref={(element) => {
                  solarPlatesRef.current[plateIndex] = element;
                }}
                className="h-20 rounded-xl border border-sky-300/30 bg-gradient-to-br from-sky-400/25 via-blue-500/20 to-indigo-500/25 shadow-lg shadow-blue-900/30"
              />
            ))}
          </div>

          <form
            ref={formCardRef}
            onSubmit={handleSubmit}
            className="relative rounded-3xl border border-white/25 bg-white/10 p-6 shadow-2xl shadow-blue-900/40 backdrop-blur-xl"
          >
            <h2 className="mb-1 text-2xl font-semibold">Solicite seu diagnóstico solar</h2>
            <p className="mb-5 text-sm text-slate-200">Preencha em menos de 1 minuto e fale com um especialista Alluz.</p>

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
                {isSubmitting ? 'Enviando...' : 'Quero economizar agora'}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
