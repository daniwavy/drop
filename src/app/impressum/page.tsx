import React from 'react';
import SimpleTopbar from '@/components/SimpleTopbar';

export default function ImpressumPage() {
	return (
		<div className="min-h-screen w-full bg-black text-white">
			<SimpleTopbar />
			
			<div className="max-w-4xl mx-auto px-4 py-16 mt-16">
				<h1 className="text-4xl font-bold mb-8">Impressum</h1>

				<div className="space-y-8 text-white/80">
					{/* Angaben gemäß TMG */}
					<section>
						<h2 className="text-2xl font-semibold text-white mb-4">1. Angaben gemäß TMG</h2>
						<div className="space-y-2">
							<p>
								<strong>Betreiber:</strong><br />
								Daniel Knipp<br />
								Wentzingerstraße 32<br />
								70196 Freiburg im Breisgau
							</p>
						</div>
					</section>

					{/* Kontaktinformationen */}
					<section>
						<h2 className="text-2xl font-semibold text-white mb-4">2. Kontaktinformationen</h2>
						<div className="space-y-2">
							<p>
								<strong>Email:</strong><br />
								<a href="mailto:hallo@drop-arcade.com" className="text-emerald-400 hover:text-emerald-300 underline">
									hallo@drop-arcade.com
								</a>
							</p>
						</div>
					</section>

					{/* Verantwortung für Inhalte */}
					<section>
						<h2 className="text-2xl font-semibold text-white mb-4">3. Verantwortung für Inhalte</h2>
						<p>
							Gemäß § 7 Abs.1 TMG sind wir als Diensteanbieter für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. 
							Allerdings sind wir als Diensteanbieter nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder 
							nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
						</p>
						<p className="mt-4">
							Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen bleiben hiervon unberührt und gelten entsprechend den einschlägigen Gesetzen. 
							Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt möglich, in dem wir von einer konkreten Rechtsverletzung Kenntnis erhalten.
						</p>
					</section>

					{/* Haftung für Links */}
					<section>
						<h2 className="text-2xl font-semibold text-white mb-4">4. Haftung für Links</h2>
						<p>
							Unsere Website enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte 
							auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich. 
							Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft. Rechtswidrige Inhalte waren zum Zeitpunkt der Verlinkung nicht erkennbar.
						</p>
						<p className="mt-4">
							Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. 
							Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.
						</p>
					</section>

					{/* Urheberrecht */}
					<section>
						<h2 className="text-2xl font-semibold text-white mb-4">5. Urheberrecht</h2>
						<p>
							Die Inhalte und Werke auf diesen Seiten sind urheberrechtlich geschützt. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung 
							außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des Autors oder Schöpfers. Downloads und Kopien dieser Seite sind 
							nur für den privaten, nicht kommerziellen Gebrauch gestattet.
						</p>
						<p className="mt-4">
							Soweit die Inhalte auf dieser Seite nicht von uns erstellt worden sind, werden die Urheberrechte Dritter beachtet. Insbesondere werden Inhalte 
							Dritter als solche gekennzeichnet. Sollten Sie trotzdem auf eine Urheberrechtsverletzung aufmerksam werden, bitten wir um einen entsprechenden Hinweis. 
							Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Inhalte umgehend entfernen.
						</p>
					</section>

					{/* Datenschutz */}
					<section>
						<h2 className="text-2xl font-semibold text-white mb-4">6. Datenschutz</h2>
						<p>
							Die Nutzung unserer Website ist in der Regel ohne Angabe personenbezogener Daten möglich. Soweit auf unseren Seiten personenbezogene Daten 
							(beispielsweise Name, Adresse oder eMail-Adressen) erhoben werden, erfolgt dies, soweit möglich, stets auf freiwilliger Basis.
						</p>
						<p className="mt-4">
							Für weitere Informationen zum Datenschutz besuchen Sie bitte unsere{' '}
							<a href="/datenschutz" className="text-emerald-400 hover:text-emerald-300 underline">
								Datenschutzerklärung
							</a>.
						</p>
					</section>

					{/* Nutzungsbedingungen */}
					<section>
						<h2 className="text-2xl font-semibold text-white mb-4">7. Nutzungsbedingungen</h2>
						<p>
							Durch die Nutzung dieser Website erkennen Sie an, dass Sie die Nutzungsbedingungen akzeptiert haben. 
							Diese Website und alle Inhalte werden „wie besehen" zur Verfügung gestellt. Wir lehnen alle ausdrücklichen und stillschweigenden Garantien ab.
						</p>
						<p className="mt-4">
							Für weitere Informationen besuchen Sie bitte unsere{' '}
							<a href="/Teilnahmebedingungen" className="text-emerald-400 hover:text-emerald-300 underline">
								Teilnahmebedingungen
							</a>.
						</p>
					</section>

					{/* Widerspruch gegen E-Mail-Werbung */}
					<section>
						<h2 className="text-2xl font-semibold text-white mb-4">8. Widerspruch gegen E-Mail-Werbung</h2>
						<p>
							Es ist uns untersagt, Nutzer, welche ihre Einwilligung zur Nutzung von E-Mail-Adressen widerrufen haben, per E-Mail zu kontaktieren.
						</p>
					</section>

					{/* Streitbeilegung */}
					<section>
						<h2 className="text-2xl font-semibold text-white mb-4">9. Streitbeilegung</h2>
						<p>
							Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: 
							<a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300 underline ml-2">
								https://ec.europa.eu/consumers/odr/
							</a>
						</p>
						<p className="mt-4">
							Unsere E-Mail-Adresse finden Sie oben im Impressum.
						</p>
					</section>

					{/* Quellenangaben */}
					<section>
						<h2 className="text-2xl font-semibold text-white mb-4">10. Quellenangaben</h2>
						<p>
							Dieses Impressum wurde mit Hilfe von Online-Impressum-Generatoren erstellt und wird regelmäßig aktualisiert.
						</p>
					</section>
				</div>

				{/* Fußnote */}
				<div className="mt-12 pt-8 border-t border-white/10 text-center text-white/60 text-sm">
					<p>Zuletzt aktualisiert: Oktober 2025</p>
				</div>
			</div>
		</div>
	);
}

