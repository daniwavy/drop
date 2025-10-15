"use client";
import React from 'react';

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0));
  } catch {
    return false;
  }
}

export default function MobileBlocker() {
  const [block, setBlock] = React.useState(false);

  React.useEffect(() => {
    setBlock(isTouchDevice());
  }, []);

  if (!block) return null;

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.95)',zIndex:999999,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',padding:24}}>
      <div style={{maxWidth:720,textAlign:'center'}}>
        <div style={{fontSize:28,fontWeight:800,marginBottom:12}}>Zugriff nur auf Desktop</div>
        <div style={{fontSize:16,opacity:0.95,marginBottom:18}}>Diese Seite ist nur auf Desktop-Rechnern zugänglich. Bitte öffne die Seite auf einem Desktop-Gerät.</div>
        <div style={{fontSize:13,opacity:0.9,marginBottom:20}}>Wenn du diese Meldung irrtümlich siehst, versuche den Browser-User-Agent zurückzusetzen oder nutze ein Desktop-Gerät. Mobile Nutzung wird blockiert.</div>
        <div style={{display:'flex',gap:12,justifyContent:'center'}}>
          <a href="https://example.com" style={{background:'#111',color:'#fff',padding:'10px 16px',borderRadius:8,textDecoration:'none'}}>Hilfe & Support</a>
        </div>
      </div>
    </div>
  );
}
