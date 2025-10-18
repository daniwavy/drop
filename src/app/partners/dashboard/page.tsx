"use client";

import React, { useEffect, useState, useRef } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
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
  const [application, setApplication] = useState<Record<string, unknown> | null>(null);
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
        setLoading(false);
        return;
      }

      setUid(user.uid);

      try {
        const userRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          setIsPartner(false);
        } else {
          const data = snap.data() as Record<string, unknown> | undefined;
          setIsPartner(Boolean(data && Boolean(data['isPartner'])));
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
    const ref = doc(db, 'applications', uid);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setApplication(null);
        return;
      }
  setApplication(snap.data() as Record<string, unknown>);
    }, (err) => {
      console.warn('[PartnerDashboard] application snapshot error', err);
      setApplication(null);
    });
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

      {/* 'Your codes' section removed */}
    </main>
    <SiteFooter />
    </>
  );
}
