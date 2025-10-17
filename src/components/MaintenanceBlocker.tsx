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
          // If maintenance is active, navigate to the centralized server maintenance page.
          // The server middleware already rewrites initial requests, but a client-side
          // redirect is useful for SPA navigation after the app has loaded.
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
