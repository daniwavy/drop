"use client";

import React, { useEffect, useState, useRef } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import PartnerApplicationForm from '@/components/PartnerApplicationForm';
import SiteFooter from '@/components/SiteFooter';

// Simple client-only modal component
function Modal({ children, open, onClose }: { children: React.ReactNode; open: boolean; onClose: () => void; }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white text-black rounded-2xl shadow-xl w-[min(78vw,720px)] max-h-[86vh] p-4 sm:p-5 overflow-hidden z-10">
        {/* close button removed - rely on overlay click or programmatic close */}
        <div className="mt-2 overflow-y-auto" style={{ maxHeight: '70vh' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// Note: metadata must live in a Server Component (Next.js). If needed,
// move metadata to a server file or a layout/head file.

export default function PartnerDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [isPartner, setIsPartner] = useState<boolean | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [application, setApplication] = useState<Record<string, unknown> | null>(null);
  const [referralsCount, setReferralsCount] = useState<number>(0);
  const [activeTodayCount, setActiveTodayCount] = useState<number>(0);
  const [showModal, setShowModal] = useState(false);
  // button-only follow: compute offset relative to viewport center for larger area
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [pendingOffset, setPendingOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      // Normalized in range [-1, 1]
      const nx = (e.clientX - cx) / (window.innerWidth / 2);
      const ny = (e.clientY - cy) / (window.innerHeight / 2);
  const max = 28; // px - larger movement area so the button visibly follows more
      const x = Math.max(-1, Math.min(1, nx)) * max;
      const y = Math.max(-1, Math.min(1, ny)) * max;
  setOffset({ x, y });
  // Pending image follow (50% mehr)
  const pendingMax = 42;
  const px = Math.max(-1, Math.min(1, nx)) * pendingMax;
  const py = Math.max(-1, Math.min(1, ny)) * pendingMax;
  setPendingOffset({ x: px, y: py });
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsPartner(null);
        setUid(null);
        setReferralCode(null);
        setLoading(false);
        return;
      }

      setUid(user.uid);

      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          setIsPartner(false);
          setReferralCode(null);
        } else {
          const data = snap.data() as Record<string, unknown> | undefined;
          setIsPartner(Boolean(data && Boolean(data['isPartner'])));
          setReferralCode(data && data['referralCode'] ? String(data['referralCode']) : null);
        }
      } catch (err: unknown) {
        console.warn('[PartnerDashboard] failed to read user document', err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // Listen for application document changes so we can show status (pending/approved)
  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, 'partners', uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setApplication(null);
        setReferralsCount(0);
        return;
      }
  const data = snap.data() as Record<string, unknown>;
  setApplication(data);
  const count = typeof data.referralsCount === 'number' ? data.referralsCount : 0;
  setReferralsCount(count);
    }, (err) => {
      console.warn('[PartnerDashboard] application snapshot error', err);
      setApplication(null);
      setReferralsCount(0);
    });
    return () => unsub();
  }, [uid]);

  // Listen for activeTodayUsers collection
  useEffect(() => {
    if (!uid) return;
    const activeTodayUsersRef = collection(db, 'partners', uid, 'activeTodayUsers');
    const unsub = onSnapshot(
      activeTodayUsersRef,
      (snap) => {
        setActiveTodayCount(snap.size);
      },
      (err) => {
        console.warn('[PartnerDashboard] activeTodayUsers snapshot error', err);
        setActiveTodayCount(0);
      }
    );
    return () => unsub();
  }, [uid]);

  // Safe string representations for rendering
  const applicationData = application as Record<string, unknown> | null;
  const applicationStatusStr = applicationData ? String(applicationData.status ?? 'pending') : null;
  // updatedAt is available on the application doc but we don't render the full timestamp string here
  // keep the value extractable in future if needed
  const applicationMessageStr = applicationData ? String(applicationData.message ?? '') : '';

  return (
    <>
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Partner Dashboard</h1>

      {/* 'Your partner status' removed per request */}

      {/* Partner Dashboard - nur wenn isPartner === true */}
      {!loading && isPartner === true && (
        <section className="max-w-6xl mx-auto mt-20">
          <style>{`
            @keyframes pulse-dot {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.5; }
            }
            .pulse-dot {
              animation: pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
            }
            @keyframes scale-pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.08); opacity: 0.8; }
            }
            .commission-glow {
              animation: scale-pulse 4s ease-in-out infinite;
            }
          `}</style>
          <div className="flex items-center gap-2 mb-6">
            <h2 className="text-2xl font-bold">Dein Dashboard</h2>
            <div className="flex items-center gap-1 px-2 py-1 bg-red-50 rounded-full">
              <div className="w-2 h-2 bg-red-500 rounded-full pulse-dot" />
              <span className="text-xs font-semibold text-red-600">Live</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Stats Cards */}
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
              <h3 className="text-gray-600 text-sm font-semibold uppercase">Angeworbene Nutzer</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">{referralsCount}</p>
              <p className="text-xs text-gray-500 mt-1">Nutzer mit Account erstellt</p>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
              <h3 className="text-gray-600 text-sm font-semibold uppercase">Heute Aktive Nutzer</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">{activeTodayCount}</p>
              <p className="text-xs text-gray-500 mt-1">Heute Qualifiziert</p>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
              <h3 className="text-gray-600 text-sm font-semibold uppercase">Offener Betrag</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">€ 0,00</p>
              <p className="text-xs text-gray-500 mt-1">Wird um 00:00 aktualisiert</p>
            </div>
          </div>

          {/* Commission Structure */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Deine Commission</h2>
            <div className="space-y-4">
              {/* Current Commission Display */}
              <div className="text-center mb-6">
                <p className="text-gray-600 text-sm font-semibold mb-2">Aktuelle Commission</p>
                <p 
                  className="text-6xl font-bold text-transparent bg-clip-text commission-glow"
                  style={{
                    backgroundImage: referralsCount < 100 
                      ? 'linear-gradient(to right, #9ca3af, #9ca3af)' 
                      : referralsCount < 501 
                      ? 'linear-gradient(to right, #3b82f6, #3b82f6)' 
                      : 'linear-gradient(to right, #10b981, #10b981)'
                  }}
                >
                  {referralsCount < 100 ? '10' : referralsCount < 501 ? '15' : '20'}%
                </p>
              </div>

              {/* Horizontal Commission Bar */}
              <div className="flex items-center gap-2 h-12 bg-gray-100 rounded-lg overflow-hidden">
                {/* Tier 1: 0-99 */}
                <div className="h-full flex items-center justify-center flex-1 text-white font-semibold text-sm transition-all bg-gray-500" style={{ 
                  opacity: referralsCount < 100 ? 1 : 0.7
                }}>
                  0-99 User: 10%
                </div>
                
                {/* Tier 2: 100-500 */}
                <div className="h-full flex items-center justify-center flex-1 text-white font-semibold text-sm transition-all bg-blue-500" style={{ 
                  opacity: referralsCount >= 100 && referralsCount < 501 ? 1 : 0.7
                }}>
                  100-500 User: 15%
                </div>
                
                {/* Tier 3: 501+ */}
                <div className="h-full flex items-center justify-center flex-1 text-white font-semibold text-sm transition-all bg-green-500" style={{ 
                  opacity: referralsCount >= 501 ? 1 : 0.7
                }}>
                  501+ User: 20%
                </div>
              </div>

              {/* Current Status */}
              <div className="mt-4 p-4 rounded-lg">
                <p className="text-sm text-gray-700">
                  Mit <span className="font-bold text-gray-900">{referralsCount} angeworbenen Nutzer(n)</span> befindest du dich aktuell in der Commission-Stufe von <span 
                    className="font-bold"
                    style={{
                      color: referralsCount < 100 ? '#9ca3af' : referralsCount < 501 ? '#3b82f6' : '#10b981'
                    }}
                  >{referralsCount < 100 ? '10%' : referralsCount < 501 ? '15%' : '20%'}</span>. Das bedeutet, dass du für jeden qualifizierten Referral diese Commission erhältst. Je mehr aktive Nutzer du anwirbt, desto höher steigt deine Commission – bei 100 Nutzern erhältst du 15%, und ab 500 Nutzern sogar 20%.
                </p>
              </div>
            </div>
          </div>

          {/* Referral Links */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Dein Referral Link</h2>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <input 
                type="text" 
                value={referralCode ? `https://drop-arcade.com/drop?ref=${referralCode}` : 'Loading...'}
                readOnly
                className="flex-1 bg-transparent text-sm text-gray-700 outline-none"
              />
              <button 
                onClick={() => {
                  const link = referralCode ? `https://drop-arcade.com/drop?ref=${referralCode}` : '';
                  navigator.clipboard.writeText(link);
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-semibold"
              >
                Kopieren
              </button>
            </div>
          </div>

          {/* Payout Section */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Auszahlung</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="text-sm text-gray-600 mb-2">Verfügbarer Betrag</div>
                  <div className="text-2xl font-bold text-gray-900">€ 0,00</div>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="text-sm text-gray-600 mb-2">Bereits ausbezahlt</div>
                  <div className="text-2xl font-bold text-gray-900">€ 0,00</div>
                </div>
              </div>
              <button className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                Auszahlung anfordern (min. €10)
              </button>
            </div>
          </div>

          {/* Program Explanation */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Wie unser Partnerprogramm funktioniert</h2>
            <div className="space-y-4 text-gray-700 text-sm leading-relaxed">
              <p>
                Willkommen im DROP Partnerprogramm! Wir sind begeistert, dass du Teil unserer wachsenden Community bist. Unser Programm bietet dir die Möglichkeit, durch das Teilen deines persönlichen Referral-Links zusätzliche Einnahmen zu generieren. Jedes Mal, wenn eine neue Person über deinen Link sich bei DROP registriert und einen Account erstellt, erhältst du eine attraktive Commission – völlig passiv und ohne zusätzliche Anstrengung.
              </p>
              <p>
                <strong>Wie funktioniert es?</strong> Es ist ganz einfach: Du teilst deinen einzigartigen Referral-Link mit Freunden, Familie oder Followern. Wenn diese Person auf deinen Link klickt und sich registriert, wird sie als dein Referral gespeichert. Unser System erkennt dies automatisch und gutschreibt dir eine Commission basierend auf unserem gestaffelten Modell.
              </p>
              <p>
                <strong>Das Provisionsmodell:</strong> Je mehr aktive Nutzer du anwerbst, desto höher wird deine Commission. Bei 0-99 angeworbenen Nutzern erhältst du 10% Commission. Wenn du zwischen 100 und 500 Nutzer angeworben hast, steigt deine Commission auf 15%. Und bei beeindruckenden 501+ Nutzern erreichst du die Premium-Stufe mit 20% Commission. Dies ist unser Weg, loyal und erfolgreiche Partner zu belohnen.
              </p>
              <p>
                <strong>Auszahlungen:</strong> Du kannst deine verdiente Commission jederzeit auszahlen lassen. Wir unterstützen verschiedene Zahlungsmethoden für deine Convenience. Es gibt keine versteckten Gebühren oder komplizierten Bedingungen – du erhältst genau das, was du verdient hast. Die Auszahlungen werden schnell und zuverlässig bearbeitet.
              </p>
              <p>
                <strong>Support & Ressourcen:</strong> Wir unterstützen dich bei jedem Schritt. Falls du Fragen hast oder Hilfe brauchst, kontaktiere unser Support-Team. Wir stellen dir auch Marketing-Materialien zur Verfügung, um dir bei der Promotion deines Links zu helfen. Gemeinsam können wir das DROP-Netzwerk wachsen lassen und dich gleichzeitig finanziell unterstützen.
              </p>
              <p>
                <strong>Wann zählt ein User als qualifiziert?</strong> Damit ein User in deine Statistik aufgenommen wird und dir Commission bringt, muss dieser folgende Kriterien erfüllen: Der User muss über deinen Referral-Link kommen und sich mit einer gültigen E-Mail-Adresse registrieren. Nach der Registrierung muss der User seinen Account verifizieren, um als aktiv zu gelten. Nur verifizierte Accounts werden in deiner Referral-Statistik gezählt. Dies stellt sicher, dass nur echte, aktive Nutzer für deine Commission zählen.
              </p>
              <p>
                <strong>Tracking & Transparenz:</strong> Unser System verfolgt alle Referrals in Echtzeit. Du kannst jederzeit in deinem Dashboard einsehen, wie viele Nutzer du angeworben hast und welche davon qualifiziert sind. Wir nutzen sichere Cookies und Pixel-Tracking, um sicherzustellen, dass jeder Referral korrekt zugeordnet wird. Falls es zu Diskrepanzen kommt, können wir diese jederzeit nachverfolgbar klären.
              </p>
              <p>
                <strong>Bedingungen für Commission-Zahlungen:</strong> Angeworbene Nutzer zählen direkt, sobald sie sich über deinen Link registrieren und ihren Account verifizieren. Du erhältst 10-20% des Werbeumsatzes dieser Nutzer – abhängig von deiner aktuellen Commission-Stufe. Die Commission wird auf Basis des Gesamtumsatzes deiner geworbenen Nutzer berechnet und monatlich ausgezahlt. Du kannst deine Einnahmen auszahlen lassen, sobald du mindestens 10€ gesammelt hast. Es gibt keine Wartezeit – sobald dein Nutzer einen Umsatz generiert, verdienst du direkt deine Commission.
              </p>
              <div className="flex justify-center mt-6">
                <a 
                  href="mailto:partner@drop-arcade.com"
                  className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors inline-block"
                >
                  Kontakt aufnehmen
                </a>
              </div>
            </div>
          </div>


        </section>
      )}

  {!loading && (isPartner === false || isPartner === null) && (
        <section
          className="flex items-center justify-center"
          style={{ height: 'calc(100dvh - 4rem)' }}
        >
          <div className="text-sm flex flex-col items-center gap-3 w-full">
            <>
              <div className="flex flex-col items-center">
                {/* Wenn nicht eingeloggt oder keine Bewerbung: immer Bild + Button */}
                {(!uid || !application) ? (
                  <>
                    <img src="/partner-image.svg" alt="Apply to be partner" className="max-w-[min(60vw,360px)] max-h-[min(40vh,360px)] object-contain" />
                    <button
                      ref={buttonRef}
                      onClick={() => setShowModal(true)}
                      className="mt-3 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold will-change-transform"
                      style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
                    >
                      Jetzt bewerben
                    </button>
                  </>
                ) : applicationStatusStr === 'pending' ? (
                  // pending: only show the pending image (no button, no timestamp)
                  <img
                    src="/pending.png"
                    alt="Bewerbung pending"
                    className="max-w-[min(90vw,540px)] max-h-[min(60vh,540px)] object-contain"
                    style={{ transform: `translate3d(${pendingOffset.x}px, ${pendingOffset.y}px, 0)` }}
                  />
                ) : (
                  // application exists but not pending: show image + status + button
                  <>
                    <img src="/partner-image.svg" alt="Partner status" className="max-w-[min(60vw,360px)] max-h-[min(40vh,360px)] object-contain" />
                    <div className="mt-3 text-sm text-gray-300 text-center">
                      <div className="font-medium">Status: {applicationStatusStr}</div>
                      {applicationMessageStr && <div className="mt-1">Nachricht: {applicationMessageStr}</div>}
                    </div>
                    <button
                      ref={buttonRef}
                      onClick={() => setShowModal(true)}
                      className="mt-3 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold will-change-transform"
                      style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
                    >
                      Jetzt bewerben
                    </button>
                  </>
                )}
              </div>

              <Modal open={showModal} onClose={() => setShowModal(false)}>
                <h3 className="text-lg font-semibold mb-3">Partner-Bewerbung</h3>
                {!uid ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <p className="mb-6 text-center text-base text-gray-700">Bitte logge dich ein, um dich als Partner zu bewerben.</p>
                    <a
                      href="/drop?login=1"
                      className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold text-center block"
                    >
                      Zum Login
                    </a>
                  </div>
                ) : (
                  <PartnerApplicationForm onSuccessAction={() => setShowModal(false)} />
                )}
              </Modal>
            </>
          </div>
        </section>
      )}
    </main>
    <SiteFooter />
    </>
  );
}
