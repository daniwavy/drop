"use client";

import React from 'react';

// Renders a set of randomly positioned raster backgrounds (PNGs) from /public/bgs
export default function RandomBackgrounds({ count = 6 }: { count?: number }) {
  // prefer explicit PNGs; if you add more PNGs into public/bgs add them here
  const files = React.useMemo(() => ['/bgs/chest.png', '/bgs/blob1.png', '/bgs/blob2.png', '/bgs/blob3.png'], []);
  // seed by page load so positions stay stable until reload
  const seed = React.useMemo(() => Math.random(), []);

  // scroll position for parallax (updated via rAF)
  const [scrollY, setScrollY] = React.useState(0);
  const scrollRef = React.useRef(0);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf = 0;
    const loop = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      if (y !== scrollRef.current) {
        scrollRef.current = y;
        setScrollY(y);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const placements = React.useMemo(() => {
    const out: Array<{ file: string; left: string; top: string; size: number; rotate: number; opacity: number; speed: number }> = [];
    for (let i = 0; i < count; i++) {
      const f = files[Math.floor((seed * 1000 + i) % files.length)];
      const left = Math.floor(((seed * 10007) % 1) * 100);
      const top = Math.floor(((seed * 21997 + i * 13) % 1) * 100);
      const size = 80 + Math.floor(((seed * 391) % 1) * 180);
      // limit rotation to +/- 10 degrees for subtle effect
      const rotate = -10 + Math.floor(((seed * 7411 + i * 7) % 1) * 21);
      // fixed opacity 0.8 as requested
      const opacity = 0.8;
      // stronger parallax: per-image speed between -0.8 and +0.8
      const speed = -0.8 + (((seed * 1299827 + i * 97) % 1) * 1.6);
      out.push({ file: f, left: `${left}%`, top: `${top}%`, size, rotate, opacity, speed });
    }
    return out;
  }, [count, seed, files]);

  // Temporary: disable rendering while we iterate on visuals.
  // Keep the implementation above for future re-enable.
  // Remove this return to re-activate backgrounds.
  if (true) return null;

  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      {placements.map((p, i) => (
        <img
          key={i}
          src={p.file}
          alt=""
          loading="lazy"
          onError={(e) => { try { (e.currentTarget as HTMLImageElement).style.display = 'none'; } catch {} }}
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            width: `${p.size}px`,
            height: `${p.size}px`,
            // apply translateY based on scrollY * speed for parallax
            transform: `translate(-50%,-50%) translateY(${Math.round(scrollY * p.speed)}px) rotate(${p.rotate}deg)`,
            opacity: p.opacity,
            filter: 'blur(6px) saturate(0.9) contrast(0.95)',
            objectFit: 'cover'
          }}
        />
      ))}
    </div>
  );
}
