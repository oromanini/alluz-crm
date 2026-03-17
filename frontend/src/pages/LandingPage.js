import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '../config/backend';

const STEPS = [
  {
    id: 'nome',
    title: 'Qual seu nome?',
    type: 'text',
    placeholder: 'Digite seu nome completo',
  },
  {
    id: 'tipoImovel',
    title: 'Seu imóvel é próprio ou alugado?',
    type: 'choice',
    options: [
      { label: 'Próprio', value: 'proprio' },
      { label: 'Alugado', value: 'alugado' },
    ],
  },
  {
    id: 'contaLuz',
    title: 'Qual a média da sua conta de luz?',
    type: 'choice',
    options: [
      { label: 'De R$ 300 a R$ 600', value: '300-600' },
      { label: 'De R$ 601 a R$ 1.000', value: '601-1000' },
      { label: 'De R$ 1.001 a R$ 2.000', value: '1000-2000' },
      { label: 'Mais de R$ 2.000', value: '>2000' },
    ],
  },
  {
    id: 'tipoTelhado',
    title: 'Selecione o tipo do seu telhado',
    type: 'choice',
    options: [
      { label: 'Colonial', value: 'colonial' },
      { label: 'Metálico', value: 'metalico' },
      { label: 'Fibrocimento', value: 'fibrocimento' },
      { label: 'Laje', value: 'laje' },
    ],
  },
  {
    id: 'whatsapp',
    title: 'Qual seu WhatsApp?',
    type: 'text',
    placeholder: '(11) 99999-9999',
  },
  {
    id: 'decisao',
    title: 'Em quanto tempo pretende tomar uma decisão?',
    type: 'choice',
    options: [
      { label: 'Em até 30 dias', value: '30dias' },
      { label: 'Entre 30 e 90 dias', value: '90dias' },
      { label: 'Mais de 90 dias, ainda estou pesquisando', value: '>90dias' },
    ],
  },
];

const contaMediaPorFaixa = {
  '300-600': 450,
  '601-1000': 800,
  '1000-2000': 1500,
  '>2000': 2200,
};

const formatPhone = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const getUrgencia = (decisao) => {
  if (decisao === '30dias') return '30 dias';
  if (decisao === '>90dias') return 'Pesquisando';
  return '60+ dias';
};

export default function LandingPage() {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    nome: '',
    tipoImovel: '',
    contaLuz: '',
    tipoTelhado: '',
    whatsapp: '',
    decisao: '',
  });

  useEffect(() => {
    if (!window.fbq) {
      window.fbq = function fbqProxy(...args) {
        if (window.fbq.callMethod) {
          window.fbq.callMethod(...args);
        } else {
          window.fbq.queue.push(args);
        }
      };

      if (!window._fbq) {
        window._fbq = window.fbq;
      }

      window.fbq.push = window.fbq;
      window.fbq.loaded = true;
      window.fbq.version = '2.0';
      window.fbq.queue = [];

      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.appendChild(script);
    }

    window.fbq('init', '2181553886009307');
    window.fbq('track', 'PageView');
  }, []);

  const currentStep = STEPS[stepIndex];
  const progress = useMemo(() => ((stepIndex + 1) / STEPS.length) * 100, [stepIndex]);

  const setStepValue = (value) => {
    setFormData((prev) => ({ ...prev, [currentStep.id]: value }));
    setError('');
  };

  const goNext = async () => {
    const value = (formData[currentStep.id] || '').toString().trim();
    if (!value) {
      setError('Preencha esta etapa para continuar.');
      return;
    }

    if (stepIndex < STEPS.length - 1) {
      setStepIndex((prev) => prev + 1);
      return;
    }

    try {
      setLoading(true);
      setError('');

      const isImovelProprio = formData.tipoImovel === 'proprio';
      const decisaoEm30Dias = formData.decisao === '30dias';
      const apenasPesquisando = formData.decisao === '>90dias';
      const possuiAreaUtil = ['colonial', 'metalico', 'fibrocimento'].includes(formData.tipoTelhado);

      const payload = {
        nome: formData.nome.trim(),
        nome_cliente: formData.nome.trim(),
        telefone: formData.whatsapp.replace(/\D/g, ''),
        origem: 'Orgânico',
        conta_media: contaMediaPorFaixa[formData.contaLuz],
        urgencia: getUrgencia(formData.decisao),
        tipo_imovel: isImovelProprio ? 'Próprio' : 'Alugado',
        tipo_telhado: formData.tipoTelhado,
        telhado: formData.tipoTelhado,
        decisao: formData.decisao,
        decisao_em_ate_30_dias: decisaoEm30Dias,
        apenas_pesquisando: apenasPesquisando,
        imovel_proprio: isImovelProprio,
        possui_area_util_necessaria: possuiAreaUtil,
        detalhes: {
          origem_captura: 'landing_step_by_step',
          conta_faixa: formData.contaLuz,
        },
      };

      const response = await fetch(`${BACKEND_URL}/api/webhooks/internal/lead-capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Falha ao cadastrar lead.');
      }

      if (window.fbq) {
        window.fbq('track', 'Lead');
      }

      navigate('/landingpage/obrigado');
    } catch (submitError) {
      console.error(submitError);
      setError('Não foi possível enviar agora. Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (stepIndex === 0 || loading) return;
    setStepIndex((prev) => prev - 1);
    setError('');
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 text-white">
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          src="https://www.facebook.com/tr?id=2181553886009307&ev=PageView&noscript=1"
          alt=""
        />
      </noscript>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(251,191,36,0.30),transparent_45%),radial-gradient(circle_at_90%_90%,rgba(249,115,22,0.22),transparent_40%)]" />
      <section className="relative z-10 w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900/85 p-6 shadow-2xl shadow-amber-500/10 backdrop-blur md:p-10">
        <img
          src="/images/logo-alluz-oficial.png"
          alt="Alluz Energia"
          className="h-10 w-auto"
        />
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-300/80">Simulador Alluz</p>
        <h1 className="mt-2 text-2xl font-semibold leading-tight md:text-3xl">Preencha as etapas abaixo e receba um estudo gratuito de redução de conta</h1>

        <div className="mt-6 h-2 w-full rounded-full bg-white/10">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-white/60">Etapa {stepIndex + 1} de {STEPS.length}</p>

        <div className="mt-8">
          <h2 className="text-xl font-medium">{currentStep.title}</h2>

          {currentStep.type === 'text' ? (
            <input
              className="mt-4 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-base outline-none transition focus:border-amber-400"
              placeholder={currentStep.placeholder}
              value={formData[currentStep.id]}
              onChange={(event) => {
                const nextValue = currentStep.id === 'whatsapp'
                  ? formatPhone(event.target.value)
                  : event.target.value;
                setStepValue(nextValue);
              }}
              disabled={loading}
            />
          ) : (
            <div className="mt-4 grid gap-3">
              {currentStep.options.map((option) => {
                const selected = formData[currentStep.id] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStepValue(option.value)}
                    disabled={loading}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      selected
                        ? 'border-amber-400 bg-amber-400/15 text-amber-100'
                        : 'border-white/10 bg-white/[0.03] text-white/90 hover:border-white/25'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}

          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            disabled={stepIndex === 0 || loading}
            className="rounded-xl border border-white/15 px-5 py-2.5 text-sm text-white/80 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {stepIndex === STEPS.length - 1 ? (loading ? 'Enviando...' : 'Finalizar') : 'Continuar'}
          </button>
        </div>
      </section>
    </main>
  );
}
