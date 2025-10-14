import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Ensure browsers don't restore scroll automatically on reload */}
        <script dangerouslySetInnerHTML={{ __html: "try{history.scrollRestoration='manual'}catch(e){}" }} />
        {children}
      </body>
    </html>
  );
}
