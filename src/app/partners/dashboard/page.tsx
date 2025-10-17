"use client";

import React, { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// Note: metadata must live in a Server Component (Next.js). If needed,
// move metadata to a server file or a layout/head file.

export default function PartnerDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [isPartner, setIsPartner] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsPartner(null);
        setLoading(false);
        return;
      }

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
        let message = String(err);
        if (err && typeof err === 'object') {
          const e = err as Record<string, unknown>;
          if ('message' in e && typeof e.message === 'string') message = e.message;
        }
        setError(message);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Partner Dashboard</h1>
      <p className="text-sm text-gray-600 mb-6">This page will list partner revenue-share codes, stats and payouts. Placeholder for now.</p>

      <section className="bg-white/5 p-4 rounded-lg shadow-sm mb-6">
        <h2 className="text-lg font-semibold">Your partner status</h2>
        <div className="mt-3 text-sm">
          {loading && <span className="text-gray-400">Lade Status…</span>}
          {!loading && error && <span className="text-red-400">Fehler: {error}</span>}
          {!loading && !error && isPartner === null && <span className="text-gray-400">Nicht angemeldet</span>}
          {!loading && !error && isPartner !== null && (
            <span className={isPartner ? 'text-green-400' : 'text-gray-400'}>
              Partner: {isPartner ? 'Ja' : 'Nein'}
            </span>
          )}
        </div>
      </section>

      <section className="bg-white/5 p-4 rounded-lg shadow-sm">
        <h2 className="text-lg font-semibold">Your codes</h2>
        <div className="mt-3 text-sm text-gray-400">No codes yet — this is a placeholder view.</div>
      </section>
    </main>
  );
}
