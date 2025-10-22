"use client";
import React from 'react';
import Image from 'next/image';

export default function SiteFooter() {
  return (
    <footer className="bg-black text-white py-6">
      <div className="max-w-6xl mx-auto px-4">
        {/* Disclaimer / Brand Notice Section */}
        <div className="mb-6 pb-6 border-b border-white/10">
          <div className="rounded-lg p-6 border border-white/10">
            <h3 className="text-base font-semibold text-white mb-3">Haftungsausschluss / Markenhinweis</h3>
            <div className="space-y-3 text-white/70 text-xs leading-relaxed">
              <p>
                Gewinnspiele, Aktionen und Inhalte auf dieser Plattform stehen, sofern nicht ausdrücklich anders angegeben, in keiner Verbindung zu den genannten Marken, Unternehmen oder Produkten. Alle Marken- und Produktnamen sind Eigentum der jeweiligen Rechteinhaber und dienen ausschließlich der identifikatorischen Nennung der Gewinne.
              </p>
              <p>
                In einzelnen Fällen können Produkte, Gutscheine oder Sachpreise durch Partnerunternehmen gesponsert oder bereitgestellt werden. Solche Kooperationen werden im jeweiligen Gewinnspiel klar gekennzeichnet.
              </p>
              <p>
                Die Durchführung und Abwicklung der Gewinnspiele erfolgt alleinverantwortlich durch DROP-ARCADE. Für Rückfragen oder Ansprüche im Zusammenhang mit einem Gewinnspiel ist ausschließlich DROP-ARCADE zuständig.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 className="text-base font-semibold mb-2">
              <Image src="/logo.png" alt="DROP" width={96} height={24} className="h-6 object-contain inline-block" priority />
            </h3>
            <p className="text-white/60 text-sm">Deine Plattform für Gaming-Rewards und Preise.</p>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Links</h4>
            <ul className="space-y-1 text-sm text-white/60">
              <li><a href="/datenschutz" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Datenschutz</a></li>
              <li><a href="/impressum" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Impressum</a></li>
              <li><a href="/agb" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">AGB</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Community</h4>
            <ul className="space-y-1 text-sm text-white/60">
              <li><a href="#" className="hover:text-white transition-colors">Discord</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Twitter</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Instagram</a></li>
              <li><a href="/partners/dashboard" className="hover:text-white transition-colors">Partner werden</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-4 pt-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-white/50 text-xs">© {new Date().getFullYear()} DROP. Alle Rechte vorbehalten.</p>
            <p className="text-white/50 text-xs mt-2 md:mt-0">Made with ❤️ for Gamers</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
