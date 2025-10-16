import React from 'react';
import Link from 'next/link';
import SimpleTopbar from '@/components/SimpleTopbar';

export default function AgbPage() {
		return (
			<main className="min-h-screen bg-white text-black p-6 md:p-12">
				<SimpleTopbar />
				<div className="max-w-4xl mx-auto">
				<div className="mb-6">
					<Link href="/" className="text-sm text-black/60 hover:underline">← Zurück</Link>
				</div>

				<h1 className="text-3xl font-extrabold mb-4">Allgemeine Geschäftsbedingungen (AGB)</h1>

				<section className="mb-6">
					<h2 className="text-xl font-semibold mb-2">1. Geltungsbereich</h2>
					<p className="text-sm text-black/70">1.1 Diese Nutzungsbedingungen regeln das Vertragsverhältnis zwischen Daniel Knipp, Freiburg im Breisgau (nachfolgend „Veranstalter“ oder „Betreiber“) und den Nutzern („Teilnehmer“ oder „Nutzer“) der Plattform DROP, erreichbar unter https://www.drop-arcade.com.</p>
					<p className="text-sm text-black/70">1.2 Sie gelten für sämtliche Inhalte, Dienste und Funktionen, die auf drop-arcade.com sowie den zugehörigen Subdomains, mobilen Anwendungen und digitalen Angeboten bereitgestellt werden (gemeinsam „DROP“ oder „Plattform“).</p>
					<p className="text-sm text-black/70">1.3 Mit der Nutzung der Plattform erklärt sich der Nutzer mit diesen Nutzungsbedingungen einverstanden.</p>
				</section>

				<section className="mb-6">
					<h2 className="text-xl font-semibold mb-2">2. Leistungsbeschreibung</h2>
					<p className="text-sm text-black/70">2.1 DROP ist eine digitale Unterhaltungsplattform, die Nutzern die Teilnahme an kostenlosen Online-Gewinnspielen und kurzen Minigames ermöglicht.</p>
					<p className="text-sm text-black/70">2.2 Nutzer können durch ihre Aktivität (z. B. Spielen, Sammeln von Tickets oder Erreichen bestimmter Punktzahlen) virtuelle Teilnahmechancen erwerben, die zur Teilnahme an regelmäßig stattfindenden Verlosungen berechtigen.</p>
					<p className="text-sm text-black/70">2.3 Die Teilnahme ist kostenfrei; ein Einsatz von Geld oder ein Kauf ist nicht erforderlich.</p>
					<p className="text-sm text-black/70">2.4 Während der Nutzung können Werbeeinblendungen (z. B. Interstitials, Rewarded Ads) erscheinen. Diese dienen der Finanzierung der Plattform, haben jedoch keinen Einfluss auf die Gewinnchancen.</p>
					<p className="text-sm text-black/70">2.5 Der Betreiber kann Aktionen in Kooperation mit Partnern oder Preissponsoren durchführen. In diesem Fall werden die Gewinne im Namen der Preissponsoren ausgelobt (§ 657 BGB).</p>
				</section>

				<section className="mb-6">
					<h2 className="text-xl font-semibold mb-2">3. Registrierung und Nutzerkonto</h2>
					<p className="text-sm text-black/70">3.1 Die Nutzung bestimmter Funktionen (z. B. Gewinnspielteilnahme, Fortschrittsspeicherung) kann eine kostenlose Registrierung erfordern.</p>
					<p className="text-sm text-black/70">3.2 Der Nutzer verpflichtet sich, bei der Registrierung wahrheitsgemäße und vollständige Angaben zu machen und seine Zugangsdaten geheim zu halten.</p>
					<p className="text-sm text-black/70">3.3 Ein Nutzerkonto ist nicht übertragbar und darf nur vom registrierten Nutzer persönlich verwendet werden.</p>
					<p className="text-sm text-black/70">3.4 Der Betreiber behält sich das Recht vor, Registrierungen abzulehnen oder Konten bei Verstößen zu sperren oder zu löschen (vgl. Ziffer 8).</p>
				</section>

				<section className="mb-6">
					<h2 className="text-xl font-semibold mb-2">4. Teilnahme an Aktionen und Gewinnspielen</h2>
					<p className="text-sm text-black/70">4.1 Die Teilnahme an Aktionen ist freiwillig, kostenlos und an die jeweiligen Teilnahmebedingungen gebunden, die für jede Aktion separat veröffentlicht werden.</p>
					<p className="text-sm text-black/70">4.2 Teilnahmeberechtigt sind natürliche Personen ab 14 Jahren mit Wohnsitz in Deutschland. Minderjährige benötigen die Zustimmung eines Erziehungsberechtigten.</p>
					<p className="text-sm text-black/70">4.3 DROP kann einzelne Aktionen mit Zufallsauswahl (Losverfahren) oder Leistungsbezug (z. B. Punktzahl in Minigames) durchführen.</p>
					<p className="text-sm text-black/70">4.4 Nach Ende einer Aktion eingehende Teilnahmen werden nicht berücksichtigt.</p>
					<p className="text-sm text-black/70">4.5 Die jeweils aktuellen Teilnahmebedingungen sind Bestandteil dieser Nutzungsbedingungen.</p>
				</section>

				<section className="mb-6">
					<h2 className="text-xl font-semibold mb-2">5. Urheberrecht und geistiges Eigentum</h2>
					<p className="text-sm text-black/70">5.1 Alle Inhalte der Plattform (insbesondere Software, Grafiken, Designs, Sounds, Pixel-Art-Assets, Logos und Texte) sind urheberrechtlich oder durch andere Schutzrechte geschützt.</p>
					<p className="text-sm text-black/70">5.2 Nutzern wird eine einfache, nicht ausschließliche, nicht übertragbare Lizenz zur privaten Nutzung der Plattform eingeräumt.</p>
					<p className="text-sm text-black/70">5.3 Eine Veränderung, Vervielfältigung, Veröffentlichung, Weitergabe, kommerzielle Nutzung oder das Reverse Engineering der Software ist ohne ausdrückliche Zustimmung des Betreibers untersagt.</p>
					<p className="text-sm text-black/70">5.4 Marken, Designs oder sonstige geschützte Kennzeichen von DROP dürfen nicht ohne schriftliche Zustimmung verwendet werden.</p>
				</section>

				<section className="mb-6">
					<h2 className="text-xl font-semibold mb-2">6. Verfügbarkeit und Wartung</h2>
					<p className="text-sm text-black/70">6.1 Der Betreiber ist bemüht, einen unterbrechungsfreien Betrieb sicherzustellen, übernimmt jedoch keine Garantie für dauerhafte Verfügbarkeit.</p>
					<p className="text-sm text-black/70">6.2 Wartungsarbeiten, technische Störungen, Netzwerkausfälle oder höhere Gewalt können die Nutzung zeitweise einschränken.</p>
					<p className="text-sm text-black/70">6.3 Bei längeren Ausfällen wird der Betreiber die Nutzer über geeignete Wege (z. B. App-Mitteilung, Website-Hinweis) informieren.</p>
				</section>

				<section className="mb-6">
					<h2 className="text-xl font-semibold mb-2">7. Verantwortlichkeit des Nutzers</h2>
					<p className="text-sm text-black/70">7.1 Der Nutzer verpflichtet sich, die Plattform nicht missbräuchlich zu verwenden. Untersagt sind insbesondere:</p>
					<ul className="text-sm text-black/70 list-disc list-inside mb-2">
						<li>Manipulation von Spielen oder Gewinnverfahren</li>
						<li>Nutzung automatisierter Skripte oder Bots</li>
						<li>das Anlegen mehrerer Konten</li>
						<li>Eingriffe in technische Abläufe</li>
						<li>die Verbreitung rechtswidriger, beleidigender oder urheberrechtsverletzender Inhalte</li>
					</ul>
					<p className="text-sm text-black/70">7.2 Nutzer müssen ihre Zugangsdaten sicher verwahren und dürfen diese nicht an Dritte weitergeben.</p>
					<p className="text-sm text-black/70">7.3 DROP darf ausschließlich zu privaten Zwecken genutzt werden. Eine gewerbliche oder kommerzielle Verwendung ist untersagt.</p>
					<p className="text-sm text-black/70">7.4 Bei schuldhaften Verstößen haftet der Nutzer für entstandene Schäden und stellt den Betreiber von Ansprüchen Dritter frei.</p>
				</section>

				<section className="mb-6">
					<h2 className="text-xl font-semibold mb-2">8. Sperrung und Kündigung</h2>
					<p className="text-sm text-black/70">8.1 Der Betreiber kann Nutzerkonten sperren oder löschen, wenn</p>
					<ul className="text-sm text-black/70 list-disc list-inside mb-2">
						<li>ein Verstoß gegen diese Nutzungsbedingungen oder Teilnahmebedingungen vorliegt,</li>
						<li>Manipulationen oder technische Eingriffe festgestellt werden,</li>
						<li>der Nutzer falsche Angaben gemacht hat, oder</li>
						<li>rechtliche Gründe die Fortführung der Nutzung verhindern.</li>
					</ul>
					<p className="text-sm text-black/70">8.2 Nutzer können ihr Konto jederzeit ohne Frist kündigen, indem sie die Löschung beantragen (z. B. per E-Mail an support@drop-arcade.com).</p>
					<p className="text-sm text-black/70">8.3 Nach Löschung des Kontos verfallen Tickets, Fortschritte und Teilnahmeansprüche.</p>
					<p className="text-sm text-black/70">8.4 Eine erneute Registrierung kann im Einzelfall abgelehnt werden.</p>
				</section>

				<section className="mb-6">
					<h2 className="text-xl font-semibold mb-2">9. Haftung</h2>
					<p className="text-sm text-black/70">9.1 Der Betreiber haftet uneingeschränkt für Schäden aus der Verletzung von Leben, Körper oder Gesundheit sowie bei Vorsatz und grober Fahrlässigkeit.</p>
					<p className="text-sm text-black/70">9.2 Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten (Kardinalpflichten) ist die Haftung auf den vorhersehbaren, typischen Schaden begrenzt.</p>
					<p className="text-sm text-black/70">9.3 Für sonstige leicht fahrlässige Pflichtverletzungen ist die Haftung ausgeschlossen.</p>
					<p className="text-sm text-black/70">9.4 Der Betreiber übernimmt keine Haftung für Datenverluste, Übertragungsfehler oder Störungen außerhalb seines Einflussbereichs.</p>
					<p className="text-sm text-black/70">9.5 Für Sach- oder Rechtsmängel von durch Preissponsoren gestifteten Gewinnen haftet ausschließlich der jeweilige Sponsor.</p>
					<p className="text-sm text-black/70">9.6 Die Haftung nach dem Produkthaftungsgesetz bleibt unberührt.</p>
				</section>

				<section className="mb-6">
					<h2 className="text-xl font-semibold mb-2">10. Datenschutz</h2>
					<p className="text-sm text-black/70">10.1 Der Betreiber erhebt und verarbeitet personenbezogene Daten ausschließlich im Rahmen der gesetzlichen Vorschriften der DSGVO und des BDSG.</p>
					<p className="text-sm text-black/70">10.2 Details sind in der Datenschutzerklärung von DROP beschrieben.</p>
					<p className="text-sm text-black/70">10.3 Ohne ausdrückliche Zustimmung werden keine personenbezogenen Daten zu Werbezwecken weitergegeben.</p>
				</section>

				<section className="mb-6">
					<h2 className="text-xl font-semibold mb-2">11. Änderungen der Nutzungsbedingungen</h2>
					<p className="text-sm text-black/70">11.1 Der Betreiber kann diese Nutzungsbedingungen ändern, wenn dies erforderlich ist,</p>
					<ul className="text-sm text-black/70 list-disc list-inside mb-2">
						<li>um sie an geänderte gesetzliche oder technische Rahmenbedingungen anzupassen,</li>
						<li>neue oder geänderte Funktionen zu beschreiben, oder</li>
						<li>redaktionelle Anpassungen vorzunehmen, die keine wesentlichen Auswirkungen auf Rechte oder Pflichten der Nutzer haben.</li>
					</ul>
					<p className="text-sm text-black/70">11.2 Über Änderungen, die den Nutzer wesentlich betreffen, wird dieser rechtzeitig und transparent informiert (z. B. per Hinweis auf der Website oder in der App).</p>
					<p className="text-sm text-black/70">11.3 Änderungen werden nur wirksam, wenn der Nutzer ihnen ausdrücklich zustimmt, etwa durch Bestätigung innerhalb der Plattform oder durch fortgesetzte Nutzung nach klarer Information.</p>
					<p className="text-sm text-black/70">11.4 Widerspricht der Nutzer den Änderungen, kann der Betreiber die weitere Nutzung der Plattform einschränken oder beenden, sofern eine Fortführung rechtlich oder technisch nicht möglich ist.</p>
				</section>

				<section className="mb-6">
					<h2 className="text-xl font-semibold mb-2">12. Schlussbestimmungen</h2>
					<p className="text-sm text-black/70">12.1 Die Vertragssprache ist Deutsch.</p>
					<p className="text-sm text-black/70">12.2 Es gilt das Recht der Bundesrepublik Deutschland.</p>
					<p className="text-sm text-black/70">12.3 Gerichtsstand ist Freiburg im Breisgau, soweit gesetzlich zulässig.</p>
					<p className="text-sm text-black/70">12.4 Sollte eine Bestimmung dieser Nutzungsbedingungen unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</p>
					<p className="text-sm text-black/70">12.5 Der Betreiber ist weder verpflichtet noch bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
				</section>

			</div>
		</main>
	);
}

