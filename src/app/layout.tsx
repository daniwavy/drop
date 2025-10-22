import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import CookieConsent from '../components/CookieConsent';
import MobileBlocker from '../components/MobileBlocker';
import SimpleTopbar from '../components/SimpleTopbar';
import MaintenanceBlocker from '../components/MaintenanceBlocker';
import HushConsole from '../components/HushConsole';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DROP",
  description: "Täglich Preise gewinnen im Drop Vault",
  icons: {
    icon: "/icons/coin.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Ezoic Site Verification */}
        <meta name="ezoic-site-verification" content="UlILyx6We0YEpDNqVkiLozpQUWU9Mz" />
        
        {/* Ezoic Privacy Scripts - Must load before header script */}
        <Script 
          src="https://cmp.gatekeeperconsent.com/min.js" 
          strategy="beforeInteractive"
          data-cfasync="false"
        />
        <Script 
          src="https://the.gatekeeperconsent.com/cmp.min.js" 
          strategy="beforeInteractive"
          data-cfasync="false"
        />
        
        {/* Ezoic Header Script */}
        <Script 
          src="//www.ezojs.com/ezoic/sa.min.js" 
          async
          strategy="beforeInteractive"
        />
        <Script 
          id="ezoic-standalone-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ 
            __html: `
              window.ezstandalone = window.ezstandalone || {};
              ezstandalone.cmd = ezstandalone.cmd || [];
            ` 
          }} 
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Ensure browsers don't restore scroll automatically on reload */}
        <script dangerouslySetInnerHTML={{ __html: "try{history.scrollRestoration='manual'}catch(e){}" }} />
    <SimpleTopbar />
    <HushConsole />
  {children}
    <CookieConsent />
  <MobileBlocker />
  <MaintenanceBlocker />
      </body>
    </html>
  );
}
