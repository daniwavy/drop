"use client";
import React from 'react';

type Consent = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

const STORAGE_KEY = 'drop:cookie_consent_v1';

function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Consent;
  } catch { return null; }
}

function writeConsent(c: Consent) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    // also write a cookie for server-side checks (7 days)
    document.cookie = `drop_cookie_consent=${encodeURIComponent(JSON.stringify(c))}; path=/; max-age=${7 * 24 * 60 * 60}`;
  } catch {}
}

export function useCookieConsent() {
  const [consent, setConsent] = React.useState<Consent | null>(null);
  React.useEffect(() => {
    const c = readConsent();
    setConsent(c);
  }, []);
  const acceptAll = React.useCallback(() => {
    const next: Consent = { necessary: true, analytics: true, marketing: true };
    setConsent(next); writeConsent(next);
  }, []);
  const acceptNecessary = React.useCallback(() => {
    const next: Consent = { necessary: true, analytics: false, marketing: false };
    setConsent(next); writeConsent(next);
  }, []);
  const saveCustom = React.useCallback((analytics: boolean, marketing: boolean) => {
    const next: Consent = { necessary: true, analytics, marketing };
    setConsent(next); writeConsent(next);
  }, []);
  return { consent, acceptAll, acceptNecessary, saveCustom } as const;
}

export default function CookieConsentBanner() {
  const { consent, acceptAll, acceptNecessary, saveCustom } = useCookieConsent();
  const [open, setOpen] = React.useState(false);
  const [analytics, setAnalytics] = React.useState(false);
  const [marketing, setMarketing] = React.useState(false);

  React.useEffect(() => {
    if (consent) {
      setAnalytics(Boolean(consent.analytics));
      setMarketing(Boolean(consent.marketing));
    }
  }, [consent]);

  if (consent) return null; // already chosen

  return (
    <div style={{position:'fixed',right:16,bottom:16,zIndex:99999,maxWidth:420}}>
      <div style={{background:'#111',color:'#fff',padding:16,borderRadius:12,boxShadow:'0 8px 30px rgba(0,0,0,0.4)'}}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Cookies & Datenschutz</div>
        <div style={{fontSize:13,opacity:0.9,marginBottom:12}}>Wir verwenden notwendige Cookies und optional Analytics/Marketing, um die Seite zu verbessern. Du kannst auswählen.</div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button onClick={acceptNecessary} style={{background:'#fff',color:'#000',borderRadius:8,padding:'8px 12px',fontWeight:600}}>Nur notwendige</button>
          <button onClick={() => setOpen(true)} style={{background:'transparent',color:'#fff',borderRadius:8,padding:'8px 12px',border:'1px solid rgba(255,255,255,0.12)'}}>Einstellungen</button>
          <button onClick={acceptAll} style={{background:'#10B981',color:'#fff',borderRadius:8,padding:'8px 12px',fontWeight:700}}>Alle akzeptieren</button>
        </div>
      </div>

      {open && (
        <div style={{marginTop:8,background:'#fff',color:'#000',padding:12,borderRadius:12,boxShadow:'0 8px 30px rgba(0,0,0,0.2)'}}>
          <div style={{fontWeight:700,marginBottom:8}}>Cookie-Einstellungen</div>
          <label style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div>
              <div style={{fontWeight:600}}>Analytics</div>
              <div style={{fontSize:12,opacity:0.8}}>Hilft uns, Nutzung zu analysieren (anonymisiert)</div>
            </div>
            <input type="checkbox" checked={analytics} onChange={(e)=>setAnalytics(e.target.checked)} />
          </label>
          <label style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div>
              <div style={{fontWeight:600}}>Marketing</div>
              <div style={{fontSize:12,opacity:0.8}}>Personalisierte Inhalte & Werbung</div>
            </div>
            <input type="checkbox" checked={marketing} onChange={(e)=>setMarketing(e.target.checked)} />
          </label>
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
            <button onClick={()=>{ setOpen(false); }} style={{background:'transparent',padding:'8px 12px',borderRadius:8}}>Abbrechen</button>
            <button onClick={()=>{ saveCustom(analytics, marketing); setOpen(false); }} style={{background:'#10B981',color:'#fff',padding:'8px 12px',borderRadius:8,fontWeight:700}}>Speichern</button>
          </div>
        </div>
      )}
    </div>
  );
}
