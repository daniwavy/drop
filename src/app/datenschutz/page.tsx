import React from 'react';
import SimpleTopbar from '@/components/SimpleTopbar';

export default function DatenschutzPage() {
  return (
    <main className="min-h-screen bg-white text-black p-6 md:p-12">
      <SimpleTopbar />
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Datenschutzerklärung</h1>
        <p className="text-sm text-gray-700">Diese Seite enthält Informationen zum Datenschutz. Hier stehen die Details zur Verarbeitung personenbezogener Daten, Zwecke und Kontaktmöglichkeiten.</p>
        <p className="mt-4 text-sm text-gray-700">Wenn du möchtest, kann ich hier den vollständigen Text aus dem alten Projekt einfügen oder die vorhandenen Inhalte aus den Teamdokumenten übernehmen.</p>
      </div>
    </main>
  );
}
