import React from 'react';
import ClientResult from './ClientResult';

export default function ResultPage() {
  return (
    <React.Suspense fallback={<div className="min-h-dvh w-full flex items-center justify-center">Lade Ergebnis…</div>}>
      <ClientResult />
    </React.Suspense>
  );
}