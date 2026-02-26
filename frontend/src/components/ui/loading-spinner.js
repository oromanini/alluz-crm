import React from 'react';
import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ className = 'text-brand-yellow', size = 20 }) {
  return <Loader2 className={`animate-spin ${className}`} size={size} aria-label="Carregando" />;
}

