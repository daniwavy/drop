"use client";
import { useEffect } from 'react';

export default function Page() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { search, hash, pathname } = window.location;
    if (pathname === '/' || pathname === '/index.html') {
      // Nur weiterleiten, wenn wir NICHT schon auf /drop sind
      window.location.assign('/drop' + search + hash);
    }
  }, []);
  return null;
}