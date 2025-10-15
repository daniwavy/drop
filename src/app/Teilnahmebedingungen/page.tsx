import React from 'react';
import Link from 'next/link';

export default function TeilnahmebedingungenPage() {
  return (
    <div className="min-h-screen bg-white text-black p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/" className="text-sm text-black/60 hover:underline cursor-pointer">← Zurück</Link>
        </div>

        <h1 className="text-3xl font-extrabold mb-4">Teilnahmebedingungen</h1>
        <p className="text-sm text-black/70 mb-6">
          Diese Teilnahmebedingungen regeln die Teilnahme an den Aktionen, Drops und Verlosungen auf DROP ("die Plattform"). Bitte lesen Sie die Bedingungen sorgfältig durch. Durch die Teilnahme stimmen Sie diesen Bedingungen zu.
        </p>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">1. Teilnahmeberechtigung</h2>
          <p className="text-sm text-black/70">
            Teilnehmen kann grundsätzlich jede natürliche Person mit Wohnsitz in Deutschland, die das 16. Lebensjahr vollendet hat, sofern nicht anders angegeben. Minderjährige benötigen die Einwilligung der gesetzlichen Vertreter. Mitarbeiter von DROP sowie deren Angehörige sind von bestimmten Gewinnspielen ausgeschlossen, sofern dies gesondert angegeben wird.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">2. Teilnahme und Kosten</h2>
          <p className="text-sm text-black/70 mb-2">
            Die Teilnahme an einem Drop/Verlosung erfolgt über die in der App vorgesehenen Mechaniken (z. B. Klick auf "Teilnehmen"). Für einzelne Teilnahmen kann eine Gebühr in Coins anfallen (z. B. 10 Coins). Coins sind virtuelle In-App-Werte und haben keinen Geldwert.
          </p>
          <p className="text-sm text-black/70">
            DROP behält sich das Recht vor, die Teilnahmevoraussetzungen, Teilnahmezeiten oder Teilnahmegebühren jederzeit zu ändern. Änderungen werden in der App oder auf der Website angekündigt.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">3. Gewinnerermittlung und Preise</h2>
          <p className="text-sm text-black/70 mb-2">
            Gewinner werden gemäß der in der jeweiligen Aktion beschriebenen Methode ermittelt. Preise werden nur an verifizierte Gewinner ausgegeben. DROP behält sich das Recht vor, Preise durch gleichwertige Alternativen zu ersetzen, wenn dies aus technischen oder organisatorischen Gründen erforderlich ist.
          </p>
          <p className="text-sm text-black/70">
            Hinweise zu Steuern oder Abgaben gehen zu Lasten des Gewinners, sofern zutreffend.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">4. Ausschluss und Sperrung</h2>
          <p className="text-sm text-black/70">
            DROP kann Nutzer von Aktionen ausschließen oder sperren, die gegen diese Bedingungen oder gegen geltende Gesetze verstoßen, mehrfach teilnehmen, den Betrieb der Plattform stören oder betrügerische Aktivitäten zeigen.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">5. Haftung</h2>
          <p className="text-sm text-black/70">
            DROP haftet nur für Schäden, die auf vorsätzlichen oder grob fahrlässigen Pflichtverletzungen beruhen. Die Haftung für leichte Fahrlässigkeit ist ausgeschlossen, soweit nicht eine wesentliche Vertragspflicht verletzt wurde.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">6. Datenschutz</h2>
          <p className="text-sm text-black/70">
            Personenbezogene Daten der Teilnehmer werden gemäß unserer Datenschutzerklärung verarbeitet. Weitere Informationen finden Sie auf der Datenschutz-Seite in der App.
          </p>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-2">7. Kontakt</h2>
          <p className="text-sm text-black/70">
            Bei Fragen zu den Teilnahmebedingungen erreichen Sie uns über den Support‑Kanal in der App oder per E‑Mail an <a href="mailto:support@drop.example" className="hover:underline cursor-pointer">support@drop.example</a> (Beispieladresse).
          </p>
        </section>

        <div className="text-sm text-black/60">Stand: {new Date().toLocaleDateString('de-DE')}</div>
      </div>
    </div>
  );
}
