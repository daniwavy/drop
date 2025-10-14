// @ts-nocheck
'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ResultPage() {
  const router = useRouter();

  const [payload, setPayload] = React.useState<any | null>(null);

  const sp = useSearchParams();
  const loadedRef = React.useRef(false);
  React.useEffect(() => {
    if (loadedRef.current) return; // prevent double-run in Strict Mode
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem('resultPayload') : null;
      if (raw) {
        const p = JSON.parse(raw);
        setPayload(p);
        loadedRef.current = true; // keep payload for this mount
        return;
      }
      // Fallback: allow URL params during dev if sessionStorage is empty
      const qsGame = sp.get('game');
      const qsScore = sp.get('score');
      const qsTickets = sp.get('tickets');
      const qsDiamonds = sp.get('diamonds');
      const qsMult = sp.get('mult');
      if (qsGame || qsScore || qsTickets || qsDiamonds || qsMult) {
        setPayload({
          game: qsGame || 'game',
          score: Number(qsScore || 0),
          tickets: Number(qsTickets || 0),
          diamonds: Number(qsDiamonds || 0),
          mult: Number(qsMult || 1),
        });
        loadedRef.current = true;
        return;
      }
      router.replace('/drop');
    } catch {
      router.replace('/drop');
    }
  }, [router, sp]);

  // Cleanup on unmount: clear payload so next round sets a fresh one
  React.useEffect(() => {
    return () => {
      try { sessionStorage.removeItem('resultPayload'); } catch {}
    };
  }, []);

  const game = payload?.game || 'game';
  const score = clampNum(payload?.score, 0);
  const tickets = clampNum(payload?.tickets, 0);
  const diamonds = clampNum(payload?.diamonds, 0);
  const mult = clampNum(payload?.mult, 1);
  const coins = clampNum(payload?.coins ?? payload?.diamonds, 0);
  const streakVal = clampNum(payload?.streak, 0);

  const capped = Boolean(
    (payload as any)?.capped === true ||
    (typeof (payload as any)?.room === 'number' && (payload as any).room <= 0) ||
    (typeof (payload as any)?.current === 'number' && (payload as any).current >= 100)
  );

  const hasDouble = Boolean(
    (payload as any)?.double === true ||
    (payload as any)?.x2 === true ||
    (payload as any)?.tix2x === true ||
    Number((payload as any)?.mult ?? (payload as any)?.multiplier ?? 1) >= 2
  );

  const numberFormatter = React.useMemo(() => new Intl.NumberFormat('de-DE'), []);
  const formatTickets = (value: number) => numberFormatter.format(Math.max(0, Math.floor(value)));
  const ticketsEarned = Math.max(0, Math.floor(tickets));
  const ticketLabel = `+${formatTickets(ticketsEarned)}`;
  const ticketTextSize = 'text-lg';
  const ticketIconSize = 'h-5 w-5';

  // Progressbar 0 → Max
  const scoreMax = clampNum((payload as any)?.scoreMax ?? 1000, 1000);
  const pct = Math.min(100, Math.max(0, (scoreMax > 0 ? (score / scoreMax) * 100 : 0)));

  // Animate fill from 0 -> pct
  const [animPct, setAnimPct] = React.useState(0);
  const [raffleAnimPct, setRaffleAnimPct] = React.useState(0);
  React.useEffect(() => {
    if (!payload) return;
    // reset to 0 then in next frame set to target so CSS transition runs
    setAnimPct(0);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimPct(pct));
    });
    return () => cancelAnimationFrame(id);
  }, [pct, payload]);

  const topDiamondsRef = React.useRef<HTMLDivElement | null>(null);
  const diamondsPillRef = React.useRef<HTMLDivElement | null>(null);

  function animateDiamondsToBadge() {
    try {
      const srcEl = diamondsPillRef.current;
      const dstEl = topDiamondsRef.current;
      if (!srcEl || !dstEl) return;
      const src = srcEl.getBoundingClientRect();
      const dst = dstEl.getBoundingClientRect();
      const startX = src.left + src.width / 2;
      const startY = src.top + src.height / 2;
      const endX = dst.left + dst.width / 2;
      const endY = dst.top + dst.height / 2;

      const layer = document.createElement('div');
      Object.assign(layer.style, {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        zIndex: '99999',
      } as Partial<CSSStyleDeclaration>);
      document.body.appendChild(layer);

      const diamondsFromScore = diamonds;
      const count = Math.min(10, Math.max(3, Number.isFinite(diamondsFromScore) ? diamondsFromScore : 3));
      const duration = 700;
      for (let i = 0; i < count; i++) {
        const node = document.createElement('span');
        node.textContent = '🪙';
        Object.assign(node.style, {
          position: 'absolute',
          left: `${startX}px`,
          top: `${startY}px`,
          transform: 'translate(-50%, -50%) scale(1)',
          transition: `transform ${duration}ms cubic-bezier(.2,.8,.2,1), opacity ${duration}ms ease-out`,
          opacity: '1',
          fontSize: '18px',
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))',
        } as Partial<CSSStyleDeclaration>);
        layer.appendChild(node);
        const jx = (Math.random() - 0.5) * 30;
        const jy = (Math.random() - 0.5) * 20;
        requestAnimationFrame(() => {
          node.style.transform = `translate(${endX - startX + jx}px, ${endY - startY + jy}px) scale(0.6)`;
          node.style.opacity = '0.2';
        });
      }
      setTimeout(() => {
        layer.remove();
      }, duration + 100);
    } catch {}
  }

  const diamondsFlyTriggeredRef = React.useRef(false);
  React.useEffect(() => {
    if (!payload) return;
    diamondsFlyTriggeredRef.current = false;
    const t = setTimeout(() => {
      if (diamondsFlyTriggeredRef.current) return;
      diamondsFlyTriggeredRef.current = true;
      animateDiamondsToBadge();
    }, 750); // nach Bar-Animation
    return () => clearTimeout(t);
  }, [payload, pct]);

  // placeholders to satisfy UI-only mock
  const totalTickets = Math.max(0, Math.floor(tickets));
  const diamondsFromScore = diamonds;
  const resultRatio = scoreMax > 0 ? score / scoreMax : 0;
  const finished = true;
  const submitting = false;

  const raffleStats = React.useMemo(() => {
    const baseMin = Math.max(1, clampNum((payload as any)?.ticketsMin, 50));
    if (!payload) {
      const remaining = baseMin;
      return {
        minNeeded: baseMin,
        progressValue: 0,
        remaining,
        pct: 0,
        progressLabel: `${formatTickets(0)}/${formatTickets(baseMin)} Tickets`,
        remainingLabel: formatTickets(remaining),
        totalAfter: 0,
      };
    }

    const prevTicketsRaw = (payload as any)?.ticketsBefore ?? (payload as any)?.current;
    const prevTickets = typeof prevTicketsRaw === 'number' && Number.isFinite(prevTicketsRaw) ? prevTicketsRaw : undefined;
    const explicitTotal = (payload as any)?.ticketsTotal;
    const totalAfter = typeof explicitTotal === 'number' && Number.isFinite(explicitTotal)
      ? explicitTotal
      : prevTickets !== undefined
        ? prevTickets + ticketsEarned
        : ticketsEarned;
    const progressValue = Math.max(0, Math.min(totalAfter, baseMin));
    const remaining = Math.max(0, baseMin - totalAfter);
    const pct = baseMin > 0 ? Math.min(100, Math.round((progressValue / baseMin) * 100)) : 0;

    return {
      minNeeded: baseMin,
      progressValue,
      remaining,
      pct,
      progressLabel: `${formatTickets(progressValue)}/${formatTickets(baseMin)} Tickets`,
      remainingLabel: formatTickets(remaining),
      totalAfter,
    };
  }, [payload, ticketsEarned, formatTickets]);

  const ticketsMinNeeded = raffleStats.minNeeded;
  const ticketsProgressValue = raffleStats.progressValue;
  const ticketsRemaining = raffleStats.remaining;
  const rafflePct = raffleStats.pct;
  const ticketsProgressLabel = raffleStats.progressLabel;
  const ticketsRemainingLabel = raffleStats.remainingLabel;
  React.useEffect(() => {
    if (!payload) {
      setRaffleAnimPct(0);
      return;
    }
    setRaffleAnimPct(0);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setRaffleAnimPct(rafflePct));
    });
    return () => cancelAnimationFrame(id);
  }, [payload, rafflePct]);

  if (!payload) {
    return <div className="min-h-dvh w-full bg-white" />;
  }

  return (
  <div className="min-h-dvh w-full bg-white flex items-center justify-center">
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-black">
        <img
          src="/logo.png"
          alt="drop"
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-auto select-none"
        />
        <div className="mx-auto max-w-6xl h-16 flex items-center justify-between px-0 relative">
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <div ref={topDiamondsRef} className="px-4 py-1.5 rounded-full bg-white text-black text-base font-semibold border border-black/10 shadow">
              <img src="/icons/coin.svg" alt="" className="inline-block h-4 w-4 -mt-0.5 align-middle" /> <span className="tabular-nums ml-1">{coins + diamonds}</span>
            </div>
            <div className="px-4 py-1.5 rounded-full bg-white text-black text-base font-semibold border border-black/10 shadow">
              <img src="/icons/flame.png" alt="" className="inline-block h-4 w-4 -mt-0.5 align-middle" /> <span className="tabular-nums ml-1">{streakVal}</span>
            </div>
          </div>
          <div className="w-16" />
        </div>
      </div>
      {/* Spacer under fixed bar */}
      <div className="h-16" />
    <div className="bg-white rounded-2xl p-8 text-center w-full max-w-md mx-auto shadow-[0_0_50px_rgba(0,0,0,0.18)]">
      <div className="text-3xl font-bold text-black">Zeit abgelaufen</div>
      <div className="mt-3 text-lg text-black/80">
        Score: <span className="tabular-nums font-semibold text-black">{score}</span>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="relative w-full">
          <div className="h-4 w-full bg-black/10 rounded-full overflow-hidden border border-black/10">
            <div
              className="h-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-500 transition-[width] duration-700 ease-out"
              style={{ width: `${animPct}%`, willChange: 'width' }}
            />
            {/* Tick lines at 500, 750 points */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute top-0 bottom-0 w-px bg-black/20" style={{ left: '50%' }} />
              <div className="absolute top-0 bottom-0 w-px bg-black/20" style={{ left: '75%' }} />
            </div>
          </div>

        </div>
        <img src="/reward.png" alt="Reward" className="w-full h-auto" />

        {/* Reward pills */}
        <div className="mt-3 flex items-stretch justify-center gap-3">
          {/* Tickets */}
          <div className={`w-[112px] rounded-2xl px-4 py-2 shadow-sm border ${hasDouble ? 'bg-emerald-100 border-emerald-300 active-glow active-anim active-bling' : 'bg-white border-black/10'}`}>
            <div className="text-[10px] leading-none tracking-wider text-black/50 font-semibold text-center">
              TICKETS
            </div>
            <div className={`mt-1 ${ticketTextSize} font-extrabold text-black flex items-center justify-center gap-1`}>
              <span className={`select-none whitespace-pre-line overflow-hidden text-ellipsis ${capped ? 'text-xs leading-tight' : ''}`}>{ticketLabel}</span>
              <img src="/icons/ticket.svg" alt="" className={`select-none inline-block ${ticketIconSize} -mt-0.5 align-middle`} />
            </div>
          </div>
          {/* Diamonds */}
          <div ref={diamondsPillRef} className="w-[112px] rounded-2xl border border-black/10 bg-white px-4 py-2 shadow-sm">
            <div className="text-[10px] leading-none tracking-wider text-black/50 font-semibold text-center">
              DIAMANTEN
            </div>
            <div className="mt-1 text-lg font-extrabold text-black flex items-center justify-center gap-1">
              <span className="select-none">+{diamondsFromScore}</span>
              <img src="/icons/coin.svg" alt="" className="select-none inline-block h-5 w-5 -mt-0.5 align-middle" />
            </div>
          </div>
        </div>

        {/* Raffle progress */}
        <div className="mt-6 w-full text-left">
          <div className="flex items-center justify-between text-sm text-black/60">
            <span>Raffle-Teilnahme</span>
            <span className="tabular-nums font-semibold text-black">{ticketsProgressLabel}</span>
          </div>
          <div className="mt-2 h-4 w-full bg-black/10 rounded-full overflow-hidden border border-black/10">
            <div
              className="h-full bg-gradient-to-r from-[#f97316] via-[#f97316] to-[#dc2626] transition-[width] duration-700 ease-out"
              style={{ width: `${raffleAnimPct}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-black/60">
            {ticketsRemaining > 0
              ? `Du brauchst noch ${ticketsRemainingLabel} Tickets bis zur Teilnahme.`
              : 'Teilnahme am heutigen Raffle gesichert!'}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => router.push(`/games/${game}`)}
          className="px-6 py-3 rounded-full bg-black text-white font-semibold text-lg shadow hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          Erneut spielen
        </button>
        <button
          onClick={() => router.push('/drop')}
          className="px-6 py-3 rounded-full bg-black text-white font-semibold text-lg shadow hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          Weiter
        </button>
      </div>
      <style jsx global>{`
        /* --- active item highlight for x2 --- */
        .active-glow{ position: relative; overflow: hidden; }
        .active-glow::after{
          content:"";
          position:absolute; inset:-2px;
          border-radius: 1rem;
          box-shadow: 0 0 0 0 rgba(16,185,129,0.0), 0 0 0 0 rgba(16,185,129,0.0), 0 0 0 0 rgba(16,185,129,0.0);
          pointer-events:none;
          animation: activePulse 1.8s ease-in-out infinite;
        }
        @keyframes activePulse {
          0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.55), 0 0 24px 0 rgba(16,185,129,0.35), inset 0 0 0 0 rgba(16,185,129,0.0); }
          50%  { box-shadow: 0 0 0 6px rgba(16,185,129,0.00), 0 0 32px 4px rgba(16,185,129,0.45), inset 0 0 0 0 rgba(16,185,129,0.0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.55), 0 0 24px 0 rgba(16,185,129,0.35), inset 0 0 0 0 rgba(16,185,129,0.0); }
        }
        .active-anim { animation: activeBgPulse 1.4s ease-in-out infinite; }
        @keyframes activeBgPulse { 0%,100%{ transform: scale(1); } 50%{ transform: scale(1.02); } }
        .active-bling{ position: relative; }
        .active-bling::before{
          content:""; position:absolute; inset:0; border-radius:1rem; pointer-events:none;
          background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%);
          transform: translateX(-120%);
          animation: activeSheen 2.2s ease-in-out infinite;
        }
        @keyframes activeSheen { 0%{ transform: translateX(-120%); } 100%{ transform: translateX(120%); } }
      `}</style>
    </div>
  </div>
  );
}

function clampNum(v: string | number | null, fallback: number) {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}
