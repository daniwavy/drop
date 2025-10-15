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
        <div style={{display:'flex',justifyContent:'center',marginBottom:12}}>
          <img src="/adblock-warning.png" alt="warning" style={{width:192,height:192,objectFit:'contain',borderRadius:16,boxShadow:'0 10px 30px rgba(0,0,0,0.6)'}} />
        </div>
        <div style={{display:'flex',justifyContent:'center',marginBottom:10}}>
          <div style={{background:'#10B981',color:'#fff',padding:'6px 10px',borderRadius:999,fontWeight:700,fontSize:14}}>App kommt bald</div>
        </div>
        <div style={{fontSize:28,fontWeight:800,marginBottom:12}}>Zugriff nur auf Desktop</div>
        <div style={{fontSize:16,opacity:0.95,marginBottom:18}}>Diese Seite ist nur auf Desktop-Rechnern zugänglich. Bitte öffne die Seite auf einem Desktop-Gerät.</div>
        {/* removed support hint and button per request */}
      </div>
    </div>
  );
}
