"use client";
import React from 'react';
import { doc, onSnapshot, getFirestore } from 'firebase/firestore';

export default function MaintenanceBlocker() {
  const [maintenance, setMaintenance] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [bypassLocal, setBypassLocal] = React.useState<boolean>(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem('maintenance:bypass') === '1'; } catch { return false; }
  });

  React.useEffect(() => {
    try {
      const fs = getFirestore();
      const ref = doc(fs, 'config', 'status');
      const unsub = onSnapshot(ref, (snap) => {
        const data = snap.exists() ? snap.data() : null as any;
        if (!data) {
          setMaintenance(false);
          setMessage(null);
          return;
        }
        const maint = Boolean(data.maintenance || data.maintenante || false);
        const msg = typeof data.maintenanceMessage === 'string' ? data.maintenanceMessage : (typeof data.maintenance_message === 'string' ? data.maintenance_message : null);
        setMaintenance(maint);
        setMessage(msg);
      }, (err) => {
        console.warn('[MaintenanceBlocker] snapshot error', err);
        setMaintenance(false);
        setMessage(null);
      });
      return () => unsub();
    } catch (e) {
      // If Firestore isn't available, don't block users silently
      console.warn('[MaintenanceBlocker] init failed', e);
      setMaintenance(false);
      setMessage(null);
    }
  }, []);

  // lock body scroll while maintenance overlay is active
  React.useEffect(() => {
    if (maintenance) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
    return;
  }, [maintenance]);

  // Allow a local bypass when developing on localhost
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  if (!maintenance || (bypassLocal && isLocalhost)) return null;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.95)',zIndex:999999,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',padding:24}}>
      <div style={{maxWidth:720,textAlign:'center'}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,marginBottom:12}}>
          <img src="/wartung.svg" alt="Wartung" style={{width:252,height:252,objectFit:'contain'}}/>
          <div style={{fontSize:40,fontWeight:900}}>Wartungsarbeiten</div>
        </div>
        {message ? <div style={{fontSize:16,opacity:0.95,marginBottom:18}}>{message}</div> : <div style={{fontSize:16,opacity:0.95,marginBottom:18}}>Wir führen gerade Wartungsarbeiten durch. Bitte versuche es später erneut.</div>}
        {isLocalhost && (
          <div style={{marginTop:12}}>
            {!bypassLocal ? (
              <button onClick={() => { try { localStorage.setItem('maintenance:bypass','1'); } catch{}; setBypassLocal(true); }} style={{padding:'10px 16px',borderRadius:8,background:'#10B981',color:'#fff',border:'none',fontWeight:700}}>Bypass Maintenance (localhost)</button>
            ) : (
              <button onClick={() => { try { localStorage.removeItem('maintenance:bypass'); } catch{}; setBypassLocal(false); }} style={{padding:'8px 12px',borderRadius:8,background:'#374151',color:'#fff',border:'none',fontWeight:700}}>Disable Bypass</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
