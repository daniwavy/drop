import React from 'react';

export default function MaintenancePage() {
  return (
    <div style={{minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff'}}>
      <div style={{textAlign: 'center', maxWidth: 720, padding: 24}}>
        <img src="/wartung.svg" alt="Wartung" style={{width:252,height:252,objectFit:'contain',margin:'0 auto'}}/>
        <div style={{fontSize:40,fontWeight:900,marginTop:8}}>Wartungsarbeiten</div>
        <div style={{fontSize:16,opacity:0.95,marginTop:12}}>Wir führen gerade Wartungsarbeiten durch. Bitte versuche es später erneut.</div>
        <div style={{marginTop:20}}>
          <a href="/" style={{padding:'10px 16px',borderRadius:8,background:'#10B981',color:'#fff',textDecoration:'none',fontWeight:700}}>Zurück zur Startseite</a>
        </div>
      </div>
    </div>
  );
}
