import React from 'react';

export default function CardFrame({
  children,
  svg = '/card-frame.svg',
  aspect = '16/13',
  safePadding = '1rem',
}: {
  children: React.ReactNode;
  svg?: string;
  aspect?: string;
  safePadding?: string;
}) {
  // The wrapper enforces an aspect ratio so content keeps placement relative to the decorative frame.
  // The SVG is rendered as a background <img> with pointer-events: none to avoid blocking interactions.
  // Convert aspect like '16/13' or '1/1' into numeric value for inline style
  const [wStr, hStr] = aspect.split('/');
  const aspectNum = (Number(wStr) && Number(hStr)) ? Number(wStr) / Number(hStr) : undefined;
  return (
    <div className={`relative w-full`} style={{ WebkitTapHighlightColor: 'transparent', aspectRatio: aspectNum }}>
      <img
        src={svg}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none rounded-2xl"
        onError={(e) => {
          try {
            const el = e.currentTarget as HTMLImageElement;
            el.onerror = null;
            el.src = '/error-frame.svg';
          } catch {}
        }}
      />
      <div className="absolute inset-0" style={{ padding: safePadding }}>
        {children}
      </div>
    </div>
  );
}
