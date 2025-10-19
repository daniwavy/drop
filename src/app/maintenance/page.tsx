'use client';
import React, { useRef, useState } from 'react';
import Image from 'next/image';
import LocalOnlyLinkWrapper from '../../components/LocalOnlyLinkWrapper';
import { useRouter } from 'next/navigation';

export default function MaintenancePage() {
  const router = useRouter();
  const areaRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = areaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const nx = (e.clientX - cx) / (rect.width / 2);
    const ny = (e.clientY - cy) / (rect.height / 2);
    const max = 10;
    const x = Math.max(-1, Math.min(1, nx)) * max;
    const y = Math.max(-1, Math.min(1, ny)) * max;
    setOffset({ x, y });
  };

  return (
    <div 
      ref={areaRef}
      onMouseMove={handleMouseMove}
      style={{minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000'}}
    >
      <div style={{textAlign: 'center', maxWidth: 720, padding: 24, color: '#fff'}}>
        <div style={{width:252,height:252,margin:'0 auto', transform: `translate(${offset.x}px, ${offset.y}px)`, transition: 'transform 0.1s ease-out' }}>
          <Image src="/wartung.svg" alt="Wartung" width={252} height={252} style={{objectFit:'contain'}} />
        </div>
        <div style={{fontSize:40,fontWeight:900,marginTop:8}}>Wartungsarbeiten</div>
        <div style={{fontSize:16,opacity:0.95,marginTop:12}}>Wir führen gerade Wartungsarbeiten durch. Bitte versuche es später erneut.</div>
        <div style={{marginTop:20}}>
          <button
            onClick={() => router.push('/')}
            style={{
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 600,
              background: '#fff',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              marginRight: 12
            }}
          >
            Aktualisieren
          </button>
          <LocalOnlyLinkWrapper />
        </div>
      </div>
    </div>
  );
}
