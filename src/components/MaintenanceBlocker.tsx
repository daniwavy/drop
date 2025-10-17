"use client";
import React from 'react';
import { doc, onSnapshot, getFirestore } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

export default function MaintenanceBlocker() {
  const router = useRouter();

  React.useEffect(() => {
    try {
      const fs = getFirestore();
      const ref = doc(fs, 'config', 'status');
      const unsub = onSnapshot(ref, (snap) => {
        const data = snap.exists() ? (snap.data() as unknown) : null;
        let maint = false;
        if (data && typeof data === 'object') {
          const d = data as Record<string, unknown>;
          maint = Boolean(d.maintenance || d.maintenante || false);
        }
        if (maint) {
          // Skip redirect on localhost so local development is unaffected.
          try {
            const host = typeof window !== 'undefined' ? window.location.hostname : '';
            if (host === 'localhost' || host === '127.0.0.1') {
              return;
            }
          } catch {}

          // If maintenance is active, navigate to the centralized server maintenance page.
          try {
            router.replace('/maintenance');
          } catch {
            try { window.location.replace('/maintenance'); } catch {}
          }
        }
      }, (err) => {
        console.warn('[MaintenanceBlocker] snapshot error', err);
      });
      return () => unsub();
    } catch (e) {
      // If Firestore isn't available, don't block users silently
      // just log and continue
      console.warn('[MaintenanceBlocker] init failed', e);
    }
  }, [router]);

  // Render nothing: server middleware handles first-request routing. This
  // component only triggers a client-side redirect when SPA state changes.
  return null;
}
