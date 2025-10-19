'use client';
import React, { useEffect } from 'react';
import Image from 'next/image';
import LocalOnlyLinkWrapper from '../../components/LocalOnlyLinkWrapper';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot, getFirestore } from 'firebase/firestore';

export default function MaintenancePage() {
  const router = useRouter();

  useEffect(() => {
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
        
        // If maintenance is no longer active, redirect to /drop
        if (!maint) {
          try {
            router.replace('/drop');
          } catch {
            try { window.location.replace('/drop'); } catch {}
          }
        }
      }, (err) => {
        console.warn('[MaintenancePage] snapshot error', err);
      });
      return () => unsub();
    } catch (e) {
      console.warn('[MaintenancePage] init failed', e);
    }
  }, [router]);

  return (
    <div style={{minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000'}}>
      <div style={{textAlign: 'center', maxWidth: 720, padding: 24, color: '#fff'}}>
        <div style={{width:252,height:252,margin:'0 auto'}}>
          <Image src="/wartung.svg" alt="Wartung" width={252} height={252} style={{objectFit:'contain'}} />
        </div>
        <div style={{fontSize:40,fontWeight:900,marginTop:8}}>Wartungsarbeiten</div>
        <div style={{fontSize:16,opacity:0.95,marginTop:12}}>Wir führen gerade Wartungsarbeiten durch. Bitte versuche es später erneut.</div>
        <div style={{marginTop:20}}>
          <LocalOnlyLinkWrapper />
        </div>
      </div>
    </div>
  );
}
