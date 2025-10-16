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
        <div className="text-sm text-black/70 mb-6">Stand: 16.10.2025</div>

        <p className="text-sm text-black/70 mb-6">Veranstalter: Daniel Knipp, Freiburg im Breisgau, Deutschland<br />Website: <a href="https://www.drop-arcade.com" className="text-black/70 hover:underline">https://www.drop-arcade.com</a></p>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">1. Geltungsbereich und Veranstalter</h2>
          <p className="text-sm text-black/70">1.1 Diese Teilnahmebedingungen gelten für alle Gewinnspiele, Verlosungen und Aktionen (&bdquo;Aktionen&rdquo;) auf der Plattform DROP, erreichbar unter https://www.drop-arcade.com.</p>
          <p className="text-sm text-black/70">1.2 Veranstalter ist Daniel Knipp, wohnhaft in Freiburg im Breisgau, Deutschland.</p>
          <p className="text-sm text-black/70">1.3 DROP kann Aktionen in Kooperation mit Partnern (&bdquo;Preissponsoren&rdquo;) durchführen, die Gewinne zur Verfügung stellen. In diesem Fall verspricht der Veranstalter die von den Preissponsoren gestifteten Preise im Namen der Preissponsoren (§ 657 BGB). Auslobender ist der jeweilige Preissponsor.</p>
          <p className="text-sm text-black/70">1.4 Der Veranstalter behält sich vor, Aktionen zu ändern, zu unterbrechen oder abzubrechen, sofern technische, rechtliche oder organisatorische Gründe dies erforderlich machen.</p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">2. Teilnahmeberechtigung</h2>
          <p className="text-sm text-black/70">2.1 Teilnahmeberechtigt sind natürliche Personen ab 14 Jahren mit Wohnsitz in Deutschland.</p>
          <p className="text-sm text-black/70">2.2 Teilnehmende unter 18 Jahren benötigen die Zustimmung eines Erziehungsberechtigten. Der Veranstalter kann den Nachweis (z. B. durch Upload eines Einverständnisformulars oder Double-Opt-In der Eltern-E-Mail) verlangen. Erfolgt der Nachweis nicht innerhalb einer gesetzten Frist, verfällt der Gewinnanspruch.</p>
          <p className="text-sm text-black/70">2.3 Mitarbeitende von Preissponsoren, deren Angehörige sowie Partnerunternehmen sind von der Teilnahme ausgeschlossen.</p>
          <p className="text-sm text-black/70">2.4 Die Teilnahme ist nur in eigenem Namen zulässig. Automatisierte Teilnahmen, Bot-Nutzung, Mehrfachkonten oder sonstige Manipulationsversuche führen zum Ausschluss.</p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">3. Teilnahme und Ablauf</h2>
          <p className="text-sm text-black/70">3.1 Die Teilnahme an allen Aktionen auf DROP ist kostenfrei. Es ist kein Kauf oder Geldeinsatz erforderlich.</p>
          <p className="text-sm text-black/70">3.2 Die Teilnahme erfolgt ausschließlich über die Plattform drop-arcade.com oder die offiziellen DROP-Apps. Andere Teilnahmewege (z. B. Telefon, SMS, Post) sind ausgeschlossen.</p>
          <p className="text-sm text-black/70">3.3 Teilnehmende können durch das Spielen von Minigames, das Sammeln von Tickets oder andere, klar kommunizierte Handlungen an Gewinnaktionen teilnehmen.</p>
          <p className="text-sm text-black/70">3.4 Während der Nutzung können Werbeeinblendungen (z. B. Interstitials oder Rewarded Ads) erscheinen. Diese sind keine Teilnahmevoraussetzung und haben keinen Einfluss auf Gewinnchancen.</p>
          <p className="text-sm text-black/70">3.5 Aktionen können Zufallselemente (z. B. Verlosungen) oder Leistungsaspekte (z. B. Punktzahlen in Minigames) enthalten. Der jeweilige Modus wird im Vorfeld klar angegeben.</p>
          <p className="text-sm text-black/70">3.6 Nach Ablauf des Teilnahmezeitraums eingehende Teilnahmen werden nicht berücksichtigt.</p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">4. Gewinnermittlung und Chancengleichheit</h2>
          <p className="text-sm text-black/70">4.1 Alle gültigen Teilnahmen haben während der gesamten Laufzeit die gleiche Gewinnchance. Bei Zufallsziehungen wird ein dokumentierter technischer Zufallsmechanismus verwendet.</p>
          <p className="text-sm text-black/70">4.2 Bei Aktionen mit Leistungsbezug entscheidet die erreichte Punktzahl über den Gewinn. Bei Gleichstand kann ein Losentscheid erfolgen.</p>
          <p className="text-sm text-black/70">4.3 Sofern nicht anders angegeben, ist pro Aktion nur ein Gewinn je Teilnehmerkonto zulässig.</p>
          <p className="text-sm text-black/70">4.4 Die Gewinner werden nach Aktionsende per E-Mail, Push-Mitteilung oder In-App-Nachricht informiert. Erfolgt innerhalb von 14 Tagen keine Rückmeldung, verfällt der Gewinnanspruch.</p>
          <p className="text-sm text-black/70">4.5 Gewinner können pseudonymisiert (z. B. Vorname, erster Buchstabe des Nachnamens, Wohnort oder Nutzername) auf der Plattform veröffentlicht werden. Betroffene können der Veröffentlichung aus berechtigtem Interesse widersprechen.</p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">5. Gewinne und Zustellung</h2>
          <p className="text-sm text-black/70">5.1 In der Regel werden digitale Gewinne vergeben, z. B. Guthabenkarten (App Store, Amazon, PlayStation, etc.) oder PayPal-Guthaben.</p>
          <p className="text-sm text-black/70">5.2 Die Zustellung erfolgt ausschließlich digital (z. B. per E-Mail oder In-App-Nachricht mit Einlösecode).</p>
          <p className="text-sm text-black/70">5.3 Die Zustellung erfolgt innerhalb von 30 Tagen nach Bestätigung des Gewinns durch den Teilnehmer.</p>
          <p className="text-sm text-black/70">5.4 In Ausnahmefällen (z. B. physische Preise) kann die Lieferung postalisch erfolgen. Die Versandkosten innerhalb Deutschlands trägt der Veranstalter.</p>
          <p className="text-sm text-black/70">5.5 Kann der Gewinn aufgrund falscher Angaben nicht zugestellt werden, verfällt der Anspruch ohne Ersatz.</p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">6. Partnerangebote (Opt-In)</h2>
          <p className="text-sm text-black/70">6.1 DROP kann Teilnehmende optional auf Angebote von Werbe- oder Kooperationspartnern hinweisen.</p>
          <p className="text-sm text-black/70">6.2 Eine Weitergabe personenbezogener Daten an Partner erfolgt ausschließlich nach ausdrücklicher Einwilligung (Opt-In) des Teilnehmenden und nur im für die Kontaktaufnahme oder Gewinnabwicklung erforderlichen Umfang.</p>
          <p className="text-sm text-black/70">6.3 Eine erteilte Einwilligung kann jederzeit mit Wirkung für die Zukunft widerrufen werden (siehe Datenschutzerklärung).</p>
          <p className="text-sm text-black/70">6.4 Ein Anspruch auf den Erhalt solcher Partnerangebote besteht nicht.</p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">7. Ausschluss und Manipulation</h2>
          <p className="text-sm text-black/70">7.1 Der Veranstalter behält sich vor, Teilnehmende bei Manipulationen, technischen Eingriffen oder Verstößen gegen diese Teilnahmebedingungen auszuschließen.</p>
          <p className="text-sm text-black/70">7.2 Insbesondere untersagt sind: Bot-Nutzung, automatisierte Eingaben, Ausnutzen technischer Fehler, Handel oder Transfer von Konten und jede Handlung, die die Chancengleichheit beeinträchtigt.</p>
          <p className="text-sm text-black/70">7.3 In solchen Fällen können bereits gewährte Gewinne aberkannt oder zurückgefordert werden.</p>
          <p className="text-sm text-black/70">7.4 Der Veranstalter ist berechtigt, Aktionen bei technischen Problemen, höherer Gewalt oder rechtlichen Gründen zu ändern, zu unterbrechen oder abzubrechen.</p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">8. Haftung</h2>
          <p className="text-sm text-black/70">8.1 Der Veranstalter haftet uneingeschränkt für Schäden aus der Verletzung von Leben, Körper oder Gesundheit, die auf einer vorsätzlichen oder fahrlässigen Pflichtverletzung beruhen, sowie für sonstige Schäden bei Vorsatz oder grober Fahrlässigkeit.</p>
          <p className="text-sm text-black/70">8.2 Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten (Kardinalpflichten) ist die Haftung auf den vorhersehbaren, typischen Schaden begrenzt.</p>
          <p className="text-sm text-black/70">8.3 Im Übrigen ist die Haftung für leicht fahrlässige Pflichtverletzungen ausgeschlossen.</p>
          <p className="text-sm text-black/70">8.4 Für technische Störungen, Datenverluste oder Netzwerkprobleme außerhalb des Einflussbereichs des Veranstalters wird keine Haftung übernommen.</p>
          <p className="text-sm text-black/70">8.5 Ansprüche wegen Sach- oder Rechtsmängeln an von Preissponsoren gestifteten Gewinnen sind ausschließlich gegenüber diesen geltend zu machen.</p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">9. Datenschutz</h2>
          <p className="text-sm text-black/70">9.1 Für die Durchführung der Aktionen werden personenbezogene Daten (z. B. Name, E-Mail-Adresse, Nutzer-ID) verarbeitet.</p>
          <p className="text-sm text-black/70">9.2 Die Daten werden ausschließlich zur Abwicklung des Gewinnspiels genutzt und anschließend gelöscht, sofern keine gesetzlichen Aufbewahrungspflichten bestehen.</p>
          <p className="text-sm text-black/70">9.3 Eine Weitergabe an Dritte erfolgt nur, soweit dies zur Gewinnabwicklung erforderlich ist (z. B. an Preissponsoren oder Zahlungsdienstleister wie PayPal).</p>
          <p className="text-sm text-black/70">9.4 Weitere Informationen finden sich in der Datenschutzerklärung von DROP.</p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">10. Widerruf</h2>
          <p className="text-sm text-black/70">10.1 Teilnehmer können ihre Teilnahme jederzeit beenden, indem sie eine Löschung ihrer Daten beantragen (z. B. per E-Mail an <a href="mailto:support@drop-arcade.com" className="hover:underline">support@drop-arcade.com</a>).</p>
          <p className="text-sm text-black/70">10.2 Mit dem Widerruf erlischt der Anspruch auf Teilnahme an laufenden Aktionen; bereits gezogene Gewinne bleiben hiervon unberührt.</p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">11. Schlussbestimmungen</h2>
          <p className="text-sm text-black/70">11.1 Die Anfechtung der Gewinnermittlung ist ausgeschlossen. Dies gilt nicht für Ansprüche aufgrund von Pflichtverletzungen, Vorsatz oder grober Fahrlässigkeit.</p>
          <p className="text-sm text-black/70">11.2 Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist Freiburg im Breisgau, soweit gesetzlich zulässig.</p>
          <p className="text-sm text-black/70">11.3 Sollte eine Bestimmung dieser Teilnahmebedingungen unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Regelungen unberührt.</p>
          <p className="text-sm text-black/70">11.4 Der Veranstalter kann diese Teilnahmebedingungen jederzeit anpassen. Änderungen werden rechtzeitig und deutlich auf der Plattform bekannt gegeben.</p>
        </section>

        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-2">Kontakt</h2>
          <p className="text-sm text-black/70">Bei Fragen zu den Teilnahmebedingungen erreichen Sie den Veranstalter per E-Mail an <a href="mailto:support@drop-arcade.com" className="hover:underline">support@drop-arcade.com</a>.</p>
        </section>

      </div>
    </div>
  );
}
