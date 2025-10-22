import React from 'react';
import SimpleTopbar from '@/components/SimpleTopbar';

export default function DatenschutzPage() {
  return (
    <main className="min-h-screen bg-black text-white py-12 px-4">
      <SimpleTopbar />
      <div className="max-w-4xl mx-auto mt-8">
        <h1 className="text-4xl font-bold mb-2">Datenschutzerklärung</h1>
        <p className="text-gray-400 mb-8">Stand: Oktober 2025</p>

        <div className="space-y-8">
          <p className="text-gray-300">
            Diese Datenschutzbestimmungen gelten für das Online-Angebot unter www.drop-arcade.com („Online-Angebot").
          </p>

          <section>
            <h2 className="text-2xl font-bold mb-4">1. Wer sind wir? (Verantwortlicher)</h2>
            <p className="text-gray-300 mb-4">Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:</p>
            <div className="bg-gray-900 p-4 rounded-lg text-gray-300">
              <p>Daniel Knipp</p>
              <p>DROP Arcade</p>
              <p>Freiburg im Breisgau, Deutschland</p>
              <p>E-Mail: <a href="mailto:datenschutz@drop-arcade.com" className="text-green-400 hover:underline">datenschutz@drop-arcade.com</a></p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">2. Kontaktdaten unseres Datenschutzbeauftragten</h2>
            <p className="text-gray-300">
              Ein Datenschutzbeauftragter ist derzeit nicht benannt, da die gesetzlichen Voraussetzungen gemäß Art. 37 DSGVO nicht vorliegen.
              Bei Fragen zum Datenschutz können Sie sich dennoch an <a href="mailto:privacy@drop-arcade.com" className="text-green-400 hover:underline">privacy@drop-arcade.com</a> wenden.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">3. Wofür verarbeiten wir Ihre personenbezogenen Daten und auf welcher Rechtsgrundlage?</h2>
            <p className="text-gray-300 mb-4">
              Wir verarbeiten personenbezogene Daten im Rahmen der Bereitstellung unseres Angebots, der Durchführung von Gewinnspielen und der Auswertung anonymer Nutzungsdaten.
            </p>
            
            <h3 className="text-xl font-semibold mb-2">3.1 Bereitstellung und Vertragserfüllung (Art. 6 Abs. 1 b DSGVO)</h3>
            <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
              <li>Registrierung und Verwaltung von Nutzerkonten</li>
              <li>Teilnahme an täglichen Minigames und Gewinnspielen</li>
              <li>Verwaltung von Tickets, Coins und XP</li>
              <li>Kontaktaufnahme bei Gewinnen</li>
              <li>Auszahlung über PayPal</li>
            </ul>

            <h3 className="text-xl font-semibold mb-2">3.2 Werbung und Analyse (Art. 6 Abs. 1 a, f DSGVO)</h3>
            <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
              <li>Anzeige und Messung von Werbung über Partner wie Google AdMob, Unity Ads und Ezoic</li>
              <li>Nutzung von Firebase Analytics zur Verbesserung der App</li>
              <li>Erkennung und Vermeidung von Missbrauch oder Manipulation</li>
            </ul>

            <h3 className="text-xl font-semibold mb-2">3.3 Sicherheit und Systembetrieb (Art. 6 Abs. 1 c, f DSGVO)</h3>
            <ul className="list-disc list-inside text-gray-300 space-y-1">
              <li>Erfassung von Logdaten (IP-Adresse, Browsertyp, Zugriffszeitpunkt etc.)</li>
              <li>Sicherstellung der technischen Stabilität und Nachverfolgung von Fehlfunktionen</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">4. Wer bekommt Ihre personenbezogenen Daten?</h2>
            <p className="text-gray-300 mb-4">
              Daten werden nur an Dritte weitergegeben, wenn dies zur Vertragserfüllung, für den Betrieb oder zur Erfüllung rechtlicher Pflichten erforderlich ist.
              Mögliche Empfänger sind:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
              <li>Google Ireland Ltd. (Firebase, AdMob)</li>
              <li>Ezoic Inc. (Anzeigenverwaltung, Analyse)</li>
              <li>Unity Technologies ApS (Unity Ads)</li>
              <li>PayPal (Europe) S.à r.l. et Cie, S.C.A. (Gewinnauszahlung)</li>
              <li>Technische Hosting-Dienstleister innerhalb der EU</li>
            </ul>
            <p className="text-gray-300">
              Mit allen Auftragsverarbeitern bestehen Vereinbarungen gemäß Art. 28 DSGVO.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">5. Datenübermittlung in Drittländer</h2>
            <p className="text-gray-300">
              Einige Partner (z. B. Google, Ezoic, Unity, PayPal) verarbeiten Daten in den USA.
              Der Schutz erfolgt über EU-Standardvertragsklauseln nach Art. 46 DSGVO.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">6. Speicherdauer</h2>
            <ul className="list-disc list-inside text-gray-300 space-y-1">
              <li>Kontodaten: bis zur Löschung durch den Nutzer</li>
              <li>Log-Dateien: 7–10 Tage</li>
              <li>Gewinnspiel-Daten: 6 Monate</li>
              <li>Zahlungsdaten: 10 Jahre (gesetzliche Aufbewahrungspflichten)</li>
              <li>Werbe-/Analyse-Daten: abhängig von den Partnern, gemäß deren Richtlinien</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">7. Freiwilligkeit der Angaben</h2>
            <p className="text-gray-300">
              Die Nutzung des Angebots ist grundsätzlich ohne Registrierung möglich.
              Bestimmte Funktionen (z. B. Teilnahme an Gewinnspielen oder Auszahlung) erfordern jedoch personenbezogene Angaben.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">8. Zahlungsdienstleister</h2>
            <p className="text-gray-300">
              Gewinnauszahlungen erfolgen über PayPal.
              Hierfür werden Name, E-Mail-Adresse und Transaktionsdaten übermittelt.
              Es gilt ergänzend die Datenschutzerklärung von PayPal unter: <a href="https://www.paypal.com/de/webapps/mpp/ua/privacy-full" className="text-green-400 hover:underline" target="_blank" rel="noopener noreferrer">https://www.paypal.com/de/webapps/mpp/ua/privacy-full</a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">9. Log-Dateien</h2>
            <p className="text-gray-300">
              Wir speichern technische Zugriffsdaten (IP-Adresse, Browserinformationen, Datum, Uhrzeit, Referrer-URL) zur Sicherstellung der Sicherheit und Systemstabilität.
              Die Daten werden nach spätestens 10 Tagen gelöscht.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">10. Cookies und Einwilligungsmanagement</h2>
            <p className="text-gray-300">
              Wir verwenden Cookies und ähnliche Technologien, um Login-Daten zu speichern, Werbung zu steuern und Statistiken zu erheben.
              Die Einwilligung erfolgt über unsere Consent Management Plattform (CMP) nach dem IAB Europe Transparency & Consent Framework.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">11. Newsletter</h2>
            <p className="text-gray-300">
              Mit Ihrer Zustimmung senden wir E-Mail- oder Push-Benachrichtigungen zu neuen Spielen oder Aktionen.
              Sie können diese jederzeit über den Abmeldelink oder in den App-Einstellungen widerrufen.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">12. Ihre Rechte</h2>
            <p className="text-gray-300 mb-4">Sie haben jederzeit das Recht auf:</p>
            <ul className="list-disc list-inside text-gray-300 space-y-1 mb-4">
              <li>Auskunft (Art. 15 DSGVO)</li>
              <li>Berichtigung (Art. 16 DSGVO)</li>
              <li>Löschung (Art. 17 DSGVO)</li>
              <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
              <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
              <li>Widerspruch gegen Verarbeitung (Art. 21 DSGVO)</li>
              <li>Beschwerde bei der zuständigen Aufsichtsbehörde</li>
            </ul>
            <p className="text-gray-300">
              Zur Ausübung dieser Rechte kontaktieren Sie bitte <a href="mailto:privacy@drop-arcade.com" className="text-green-400 hover:underline">privacy@drop-arcade.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">13. Kontakt</h2>
            <div className="bg-gray-900 p-4 rounded-lg text-gray-300">
              <p><strong>Verantwortlicher:</strong></p>
              <p>Daniel Knipp</p>
              <p>E-Mail: <a href="mailto:datenschutz@drop-arcade.com" className="text-green-400 hover:underline">datenschutz@drop-arcade.com</a></p>
              <p>Ort: Freiburg im Breisgau, Deutschland</p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">14. Ezoic Datenschutz</h2>
            <p className="text-gray-300 mb-4">
              Für spezifische Informationen zu Ezoic und seinen Partnern bezüglich Datenschutz, besuchen Sie bitte:
              <a href="http://g.ezoic.net/privacy/drop-arcade.com" className="text-green-400 hover:underline block mt-2" target="_blank" rel="noopener noreferrer">
                http://g.ezoic.net/privacy/drop-arcade.com
              </a>
            </p>
            {/* Ezoic Privacy Policy Embed */}
            <div className="mt-4">
              <span id="ezoic-privacy-policy-embed" />
            </div>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-700">
          <p className="text-gray-500 text-sm">
            Zuletzt aktualisiert: Oktober 2025
          </p>
        </div>

        {/* Ezoic Privacy Policy Embed Script */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = '//g.ezoic.net/ezoic/privacy-drop-arcade.com.js';
            script.async = true;
            document.body.appendChild(script);
          })();
        ` }} />
      </div>
    </main>
  );
}
