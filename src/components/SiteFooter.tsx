"use client";
import React from 'react';
import Image from 'next/image';

export default function SiteFooter() {
  return (
    <footer className="bg-black text-white py-6">
      <div className="max-w-6xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h3 className="text-base font-semibold mb-2">
              <Image src="/logo.png" alt="DROP" width={96} height={24} className="h-6 object-contain inline-block" priority />
            </h3>
            <p className="text-gray-400 text-sm">Deine Plattform für Gaming-Rewards und Preise.</p>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Links</h4>
            <ul className="space-y-1 text-sm text-gray-400">
              <li><a href="/datenschutz" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Datenschutz</a></li>
              <li><a href="/impressum" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Impressum</a></li>
              <li><a href="/agb" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">AGB</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Support</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">Community</h4>
            <ul className="space-y-1 text-sm text-gray-400">
              <li><a href="#" className="hover:text-white transition-colors">Discord</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Twitter</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Instagram</a></li>
              <li><a href="/partners/dashboard" className="hover:text-white transition-colors">Partner werden</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-4 pt-4">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-500 text-xs">© {new Date().getFullYear()} DROP. Alle Rechte vorbehalten.</p>
            <p className="text-gray-500 text-xs mt-2 md:mt-0">Made with ❤️ for Gamers</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
