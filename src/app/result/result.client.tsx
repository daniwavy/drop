"use client";
import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ResultClient() {
      const router = useRouter();
      const sp = useSearchParams();
      React.useEffect(() => {
            const qsGame = sp.get('game');
            if (!qsGame) return;
            // simple behaviour: if there is no session payload, redirect back
            try {
                  const raw = typeof window !== 'undefined' ? sessionStorage.getItem('resultPayload') : null;
                  if (!raw) {
                        router.replace('/drop');
                  }
            } catch {
                  router.replace('/drop');
            }
      }, [router, sp]);

      return <div className="min-h-dvh w-full bg-white" />;
}
