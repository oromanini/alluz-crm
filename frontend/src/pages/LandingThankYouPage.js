import React from 'react';
import { CheckCircle2, Globe, Instagram, MessageCircle } from 'lucide-react';

const SITE_URL = 'https://alluzenergia.com.br';
const INSTAGRAM_URL = 'https://www.instagram.com/alluzenergia/';
const WHATSAPP_URL = 'https://wa.me/';

export default function LandingThankYouPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#fffbeb] px-6 py-12 text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_26%,rgba(251,191,36,0.42),rgba(245,158,11,0.24)_32%,rgba(248,250,252,0.92)_65%,rgba(248,250,252,1)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(104deg,rgba(245,158,11,0.20)_0%,rgba(255,255,255,0.34)_44%,rgba(249,115,22,0.14)_100%)]" />

      <section className="relative z-10 w-full max-w-2xl rounded-3xl border border-amber-200 bg-white/95 p-8 text-center shadow-2xl shadow-amber-200/50 backdrop-blur">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-300/40">
          <CheckCircle2 className="h-8 w-8" />
        </div>

        <h1 className="text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">Cadastro recebido com sucesso!</h1>
        <p className="mt-3 text-base text-slate-700 md:text-lg">
          Obrigado pelo seu interesse. Nossa equipe entrará em contato em breve para apresentar a melhor solução.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <a
            href={SITE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
          >
            <Globe className="h-4 w-4" /> Nosso site
          </a>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-700 transition hover:bg-orange-100"
          >
            <Instagram className="h-4 w-4" /> Instagram
          </a>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
        </div>
      </section>
    </main>
  );
}
