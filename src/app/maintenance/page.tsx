import React from 'react';
import Image from 'next/image';
import LocalOnlyLinkWrapper from '../../components/LocalOnlyLinkWrapper';

export default function MaintenancePage() {
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
