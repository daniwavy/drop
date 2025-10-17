"use client";
import React from 'react';
import Link from 'next/link';

export default function LocalOnlyLink() {
  const [isLocal, setIsLocal] = React.useState(false);

  React.useEffect(() => {
    try {
      const host = typeof window !== 'undefined' ? window.location.hostname : '';
      setIsLocal(host === 'localhost' || host === '127.0.0.1');
    } catch {
      setIsLocal(false);
    }
  }, []);

  if (!isLocal) return null;
  return (
    <Link href="/" style={{padding:'10px 16px',borderRadius:8,background:'#10B981',color:'#000',textDecoration:'none',fontWeight:700}}>
      Zurück zur Startseite
    </Link>
  );
}
