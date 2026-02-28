import React from 'react';

export default function Aprendizado() {
  return (
    <div className="space-y-6" data-testid="aprendizado-page">
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Aprendizado</h1>
        <p className="text-white/60">Acesse os materiais de treinamento da equipe</p>
      </div>

      <div style={{ width: 640, height: 480, margin: 10, position: 'relative' }}>
        <iframe
          allowFullScreen
          frameBorder="0"
          id="AkLA3IvVp_cL"
          src="https://lucid.app/documents/embedded/b7cd71e0-2857-45bd-b3bf-ace00db8255e"
          style={{ width: 640, height: 480 }}
          title="Conteúdo de Aprendizado"
        />
      </div>
    </div>
  );
}
