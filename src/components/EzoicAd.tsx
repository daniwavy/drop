"use client";
import { useEffect } from 'react';

interface EzoicAdProps {
  placementId: number | number[];
}

declare global {
  interface Window {
    ezstandalone?: {
      cmd: ((fn: () => void) => void)[];
      showAds: (...ids: number[]) => void;
    };
  }
}

export default function EzoicAd({ placementId }: EzoicAdProps) {
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ezstandalone) {
      window.ezstandalone.cmd.push(function () {
        const ids = Array.isArray(placementId) ? placementId : [placementId];
        window.ezstandalone?.showAds(...ids);
      });
    }
  }, [placementId]);

  const placementIds = Array.isArray(placementId) ? placementId : [placementId];

  return (
    <>
      {placementIds.map((id) => (
        <div key={id} id={`ezoic-pub-ad-placeholder-${id}`} />
      ))}
    </>
  );
}
