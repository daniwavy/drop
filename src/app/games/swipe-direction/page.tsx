// @ts-nocheck
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import GameInfoSection from '@/components/GameInfoSection';
import SiteFooter from '@/components/SiteFooter';

const GAME_NAME = 'swipe-direction';
const DURATION_MS = 30_000; // 30 Sekunden
const FAIL_GRACE = 1.2; // +20% Zeit bis zum Timeout (Fail)

const ARROWS = [
  { key: 'ArrowUp', label: '↑' },
  { key: 'ArrowRight', label: '→' },
  { key: 'ArrowDown', label: '↓' },
  { key: 'ArrowLeft', label: '←' },
];

const RAFFLE_TICKET_MIN = 50;

export default function Page() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  // HUD
  const [score, setScore] = useState(0);
  const [tickets, setTickets] = useState(0); // granted at finish via thresholds
  const [countdown, setCountdown] = useState(3);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(DURATION_MS);
  const scoreRef = useRef(0);

  // round state
  const [current, setCurrent] = useState(() => pickArrow());
  const [next, setNext] = useState(() => pickArrow());
  const [arrowPos, setArrowPos] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
  function randomArrowPos(prev?: { x: number; y: number }) {
    const MIN = 18, MAX = 82; // keep away from edges
    let x = rand(MIN, MAX);
    let y = rand(MIN, MAX);
    if (prev) {
      let guard = 0;
      while (Math.hypot(x - prev.x, y - prev.y) < 20 && guard++ < 8) { // ensure visible change
        x = rand(MIN, MAX);
        y = rand(MIN, MAX);
      }
    }
    return { x, y };
  }

  // ensure next starts different from current
  useEffect(() => {
    setNext(pickArrow(current.key));
    setArrowPos(randomArrowPos());
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [speedMs, setSpeedMs] = useState(1000); // time to respond before next prompt

  // swipe detection
  const lastActionRef = useRef(0);
  const rafRef = useRef<number|null>(null);
  const finishedRef = useRef(false);

  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const resultPushedRef = useRef(false);
  const [grantStatus, setGrantStatus] = useState<string | null>(null);
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const [bursts, setBursts] = useState<{ id: number; text: string; kind: 'ok'|'bad' }[]>([]);
  const cardRef = useRef<HTMLDivElement|null>(null);
  const burstIdRef = useRef(1);

  // read topbar coins snapshot so Result has correct total at top
  const coinsSnapshot = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('topbarSnapshot') || sessionStorage.getItem('resultPayload');
      if (!raw) return 0;
      const p = JSON.parse(raw);
      if (typeof p.coins === 'number') return p.coins;
      if (typeof p.diamondsTotal === 'number') return p.diamondsTotal;
      if (typeof p.topbarDiamonds === 'number') return p.topbarDiamonds;
      return 0;
    } catch { return 0; }
  }, []);
  const streakSnapshot = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('topbarSnapshot') || sessionStorage.getItem('resultPayload');
      if (!raw) return 0;
      const p = JSON.parse(raw);
      if (typeof p.streak === 'number') return p.streak;
      if (typeof p.topbarStreak === 'number') return p.topbarStreak;
      return 0;
    } catch { return 0; }
  }, []);

  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      setCountdown(null);
      startRun();
      return;
    }
    const id = setTimeout(() => setCountdown(c => (c ?? 1) - 1), 700);
    return () => clearTimeout(id);
  }, [countdown]);

  function startRun() {
    setRunning(true);
    const start = performance.now();
    const loop = (now: number) => {
      const left = Math.max(0, DURATION_MS - (now - start));
      setTimeLeft(left);
      if (left <= 0) {
        finishRun();
        return;
      }
      if (!finishedRef.current) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  function finishRun() {
    if (finishedRef.current) return;
    finishedRef.current = true;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setRunning(false);
    setFinished(true);
  }

  useEffect(() => {
    if (!finished) return;
    if (resultPushedRef.current) return;
    resultPushedRef.current = true;
    void grantAndNavigate();
  }, [finished]);

  async function grantAndNavigate() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setGrantStatus(null);

    const s = scoreRef.current;
    const t = ticketsFromScore(s);
    let navTickets = t;
    let navDiamonds = t;
    let navMult = 1;
    let lastGrant: any = null;

    try {
      const [
        { getFunctions, httpsCallable },
        { getApp, getApps, initializeApp },
        { getAuth, onAuthStateChanged, getIdToken },
      ] = await Promise.all([
        import('firebase/functions'),
        import('firebase/app'),
        import('firebase/auth'),
      ]);

      const app = getApps().length ? getApp() : initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
      } as any);
      const functions = getFunctions(app, 'us-central1');
      const auth = getAuth(app);
      let user: any = auth.currentUser;
      if (!user) {
        user = await new Promise((resolve) => {
          const to = setTimeout(() => resolve(null), 1500);
          onAuthStateChanged(auth, (u) => { clearTimeout(to); resolve(u); }, { onlyOnce: true } as any);
        });
      }
      if (!user) {
        setGrantStatus('Login erforderlich');
      } else {
        try { await getIdToken(user, true); } catch {}

        // resolve multiplier from user doc
        try {
          const { getFirestore, doc, getDoc } = await import('firebase/firestore');
          const fs = getFirestore(app);
          const usnap = await getDoc(doc(fs as any, 'users', user.uid));
          const d: any = usnap.data() || {};
          const dt = d.effects?.double_tickets || d.double_tickets || null;
          const active = (() => {
            if (!dt) return false;
            const until = dt.untilMs ?? dt.until ?? null;
            return until ? Date.now() < Number(until) : false;
          })();
          navMult = active ? 2 : 1;
        } catch { navMult = 1; }

        // grant tickets
        try {
          const grant = httpsCallable(functions, 'grantTickets');
          const baseAmount = Math.max(0, Math.floor(t));
          const effAmount = baseAmount * navMult;
          const res: any = await grant({
            amount: effAmount,
            baseAmount,
            multiplierRequested: navMult,
            source: 'swipe-direction',
            uid: user.uid,
            score: s,
            comboMax: 0,
            bonusFromScore: 0,
            ticketsFromCells: baseAmount,
            doubleProof: { active: navMult === 2, until: null },
            ts: Date.now(),
          });
          const data: any = res?.data || {};
          lastGrant = data;
          navTickets = typeof data.added === 'number' ? data.added : effAmount;
          const srvMult = data?.multiplier;
          navMult = srvMult === 2 ? 2 : srvMult === 1 ? 1 : navMult;
        } catch (e) {
          setGrantStatus('Tickets konnten nicht gutgeschrieben werden');
        }

        // grant diamonds
        if (t > 0) {
          try {
            const grantDiamonds = httpsCallable(functions, 'grantDiamonds');
            await grantDiamonds({ amount: t, source: 'swipe-direction', uid: user.uid, score: s, ts: Date.now(), opId: `swipe-${Date.now()}` });
            navDiamonds = t;
          } catch (e) {
            // ignore
          }
        }
      }
    } catch (e) {
      setGrantStatus('Netzwerkfehler');
    } finally {
      setSubmitting(false);
      submittingRef.current = false;

      // write result payload
      const srv = lastGrant || {};
      const currentBefore = typeof srv.current === 'number' && Number.isFinite(srv.current) ? Number(srv.current) : undefined;
      const totalAfter = typeof srv.ticketsTotal === 'number' && Number.isFinite(srv.ticketsTotal)
        ? Number(srv.ticketsTotal)
        : currentBefore !== undefined
          ? currentBefore + navTickets
          : undefined;

      const payload = {
        game: GAME_NAME,
        score: s,
        tickets: navTickets,
        diamonds: navDiamonds,
        mult: navMult,
        coins: coinsSnapshot,
        streak: streakSnapshot,
        scoreMax: 1000,
        ticketsBefore: currentBefore,
        ticketsTotal: totalAfter,
        ticketsMin: RAFFLE_TICKET_MIN,
      } as any;
      try {
        // ensure payload contains the same fields tap-rush uses
        const effMult = navMult || 1;
        const tix2x = effMult === 2;
        const unified = Object.assign({}, payload, {
          multiplier: effMult,
          mult: effMult,
          tix2x,
          double: tix2x,
          x2: tix2x,
        });
        sessionStorage.setItem('resultPayload', JSON.stringify(unified));
        const seed = { coins: coinsSnapshot, streak: streakSnapshot, now: Date.now() };
        sessionStorage.setItem('topbarSnapshot', JSON.stringify(seed));
      } catch {}
      // navigate to result page the same way tap-rush does
      requestAnimationFrame(() => requestAnimationFrame(() => { try { router.replace('/result'); } catch { window.location.href = '/result'; } }));
    }
  }

  // prompt auto-advance if player waits too long
  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => {
      // penalize small for timeouts
      setScore(s => { const v = Math.max(0, s - 25); scoreRef.current = v; return v; });
      advancePrompt(current.key);
    }, Math.floor(speedMs * FAIL_GRACE));
    return () => clearTimeout(id);
  }, [running, current, speedMs]);

  function pickArrow(excludeKey?: string) {
    let a = ARROWS[Math.floor(Math.random() * ARROWS.length)];
    if (excludeKey) {
      let guard = 0;
      while (a.key === excludeKey && guard++ < 10) {
        a = ARROWS[Math.floor(Math.random() * ARROWS.length)];
      }
    }
    return a;
  }

  // Always set a new current that differs from prevKey, and a next that differs from the new current
  function advancePrompt(prevKey?: string | null) {
    const exclude = (prevKey ?? current?.key) as string | undefined;
    const newCurrent = pickArrow(exclude);
    setCurrent(newCurrent);
    setNext(pickArrow(newCurrent.key));
    setArrowPos(p => randomArrowPos(p));
  }

  function onAnswer(key: string) {
    if (!running) return;
    const now = Date.now();
    if (now - lastActionRef.current < 60) return; // debounce
    lastActionRef.current = now;
    const correct = key === current.key;
    const answeredKey = current.key;
    if (correct) {
      setScore(s => { const v = s + 35; scoreRef.current = v; return v; }); // 30% weniger Punkte pro Treffer
      setSpeedMs(ms => Math.max(450, Math.floor(ms - 30)));
      setFlash('ok');
      setTimeout(() => setFlash(null), 140);
      // floating +points burst
      const id = burstIdRef.current++;
      setBursts((b) => [...b, { id, text: '+35', kind: 'ok' }]);
      setTimeout(() => setBursts((b) => b.filter(x => x.id !== id)), 650);
      advancePrompt(answeredKey);
    } else {
      setScore(s => { const v = Math.max(0, s - 40); scoreRef.current = v; return v; });
      setSpeedMs(ms => Math.min(1200, Math.floor(ms + 40)));
      setFlash('bad');
      setTimeout(() => setFlash(null), 140);
      // floating -points burst and shake
      const id = burstIdRef.current++;
      setBursts((b) => [...b, { id, text: '−40', kind: 'bad' }]);
      setTimeout(() => setBursts((b) => b.filter(x => x.id !== id)), 650);
      if (cardRef.current) {
        cardRef.current.classList.add('shake');
        setTimeout(() => cardRef.current && cardRef.current.classList.remove('shake'), 180);
      }
      advancePrompt(current.key);
    }
  }

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!running) return;
      const k = e.key;
      let mapped: string | null = null;
      if (k === 'ArrowUp' || k === 'w' || k === 'W') mapped = 'ArrowUp';
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') mapped = 'ArrowRight';
      else if (k === 'ArrowDown' || k === 's' || k === 'S') mapped = 'ArrowDown';
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') mapped = 'ArrowLeft';
      if (mapped) { e.preventDefault(); onAnswer(mapped); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, current]);

  // touch

  // Cancel RAF on unmount
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // UI
  return (
    <div className="min-h-dvh w-full bg-white flex flex-col">
      {/* Fixed Top Bar */}
      <div className="fixed top-0 left-0 right-0 z-60 bg-black">
        <img src="/logo.png" alt="drop" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-auto select-none" />
        <div className="mx-auto max-w-6xl h-16 flex items-center justify-between px-0 relative">
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <div className="px-4 py-1.5 rounded-full bg-white text-black text-base font-semibold border border-black/10 shadow">
              💎 <span className="tabular-nums ml-1" suppressHydrationWarning>{hydrated ? coinsSnapshot : 0}</span>
            </div>
            <div className="px-4 py-1.5 rounded-full bg-white text-black text-base font-semibold border border-black/10 shadow">
              🔥 <span className="tabular-nums ml-1" suppressHydrationWarning>{hydrated ? streakSnapshot : 0}</span>
            </div>
          </div>
          <div className="w-16" />
        </div>
      </div>
      {/* Top bar spacer (external bar is fixed) */}
      <div className="h-16" />

      {/* Main content wrapper */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 w-full">
        {finished && (
          <div className="fixed inset-0 z-40 flex items-center justify-center">
            <div className="h-12 w-12 rounded-full border-4 border-black/20 border-t-black animate-spin" aria-label="Lädt" />
          </div>
        )}

        {/* Vignette flash overlay */}
        {flash && (
          <div className="fixed inset-0 z-40 pointer-events-none">
            <div className={`absolute inset-0 vignette ${flash === 'ok' ? 'vignette-hit' : 'vignette-miss'}`} />
          </div>
        )}

        {/* Countdown overlay (outside game card) */}
        {countdown != null && (
          <div className="fixed inset-0 z-40 flex items-center justify-center">
            <div className="text-[120px] font-black text-black/80 drop-shadow-[0_8px_24px_rgba(0,0,0,0.15)] animate-[scaleIn_320ms_cubic-bezier(.2,.8,.2,1)]">
              {countdown}
            </div>
          </div>
        )}

        {/* Game card */}
        <div
          className={`relative select-none rounded-2xl border bg-white/90 backdrop-blur-[2px] shadow-[0_20px_60px_rgba(0,0,0,0.12)] w-[min(92vw,520px)] h-[min(70vh,520px)] flex flex-col items-center justify-center ${finished || countdown != null ? 'invisible' : ''} border-black/10`}
          ref={cardRef}
        >
          <div className="pointer-events-none absolute inset-0 rounded-2xl" style={{ background: 'radial-gradient(1200px 500px at 50% 20%, rgba(0,0,0,0.06), transparent 60%)' }} />
          {/* ambient moving dots */}
          <div className="pointer-events-none absolute inset-0 rounded-2xl ambient" />

          {/* In-card HUD (hidden during countdown) */}
          {countdown == null && (
            <div className="absolute top-3 left-0 right-0 flex items-center justify-center gap-2 z-10">
              <div className="px-3 py-1 rounded-full bg-black text-white/95 text-sm font-semibold shadow-sm">
                Zeit: <span className="tabular-nums ml-1">{Math.ceil(timeLeft/1000)}</span>s
              </div>
              <div className="px-3 py-1 rounded-full bg-black text-white/95 text-sm font-semibold shadow-sm">
                Score: <span className="tabular-nums ml-1">{score}</span>
              </div>
            </div>
          )}

          {/* floating score bursts (hidden during countdown) */}
          {countdown == null && (
            <div className="pointer-events-none absolute inset-0">
              {bursts.map(b => (
                <div key={b.id} className={`burst ${b.kind}`}>{b.text}</div>
              ))}
            </div>
          )}

          {countdown == null && !finished && (
            <div className="absolute" style={{ left: `${arrowPos.x}%`, top: `${arrowPos.y}%`, transform: 'translate(-50%, -50%)' }}>
              <div className="arrow-label">{current.label}</div>
            </div>
          )}

          {finished && (
            <div className="text-xl text-black">Fertig…</div>
          )}
          <style jsx>{`
            @keyframes breathe { 0%,100%{ transform: translateZ(0) scale(1);} 50%{ transform: translateZ(0) scale(1.03);} }
            @keyframes pop2 { from{ transform: translateZ(0) scale(.92);} to{ transform: translateZ(0) scale(1);} }
            @keyframes scaleIn { from{ transform: scale(.8); opacity: .4;} to{ transform: scale(1); opacity: 1; } }
            .arrow-label{ font-size: 140px; font-weight: 900; line-height: 1; color: #0b0b0c; text-shadow: 0 8px 22px rgba(0,0,0,.18); animation: pop2 140ms ease-out; }
            :global{ @keyframes vignettePulse { 0% { opacity: 0; transform: scale(0.98); } 50% { opacity: 0.75; transform: scale(1); } 100% { opacity: 0; transform: scale(1.01); } } }
            :global(.vignette){ animation: vignettePulse 0.32s ease-out forwards; }
            :global(.vignette-hit){
              background: radial-gradient(ellipse at center, transparent 58%, rgba(16,185,129,0.08) 72%, rgba(16,185,129,0.18) 88%, rgba(16,185,129,0.25) 100%);
              mix-blend-mode: screen; filter: blur(8px);
            }
            :global(.vignette-miss){
              background: radial-gradient(ellipse at center, transparent 58%, rgba(244,63,94,0.09) 72%, rgba(244,63,94,0.18) 88%, rgba(244,63,94,0.26) 100%);
              mix-blend-mode: screen; filter: blur(8px); animation-duration: 0.36s;
            }
            @keyframes dotsMove { 0%{ background-position: 0 0, 80px 120px; } 100%{ background-position: 120px 160px, 0 0; } }
            .ambient{ background-image:
                radial-gradient(circle 1px at 20px 20px, rgba(0,0,0,.06) 99%, transparent 100%),
                radial-gradient(circle 1px at 60px 60px, rgba(0,0,0,.045) 99%, transparent 100%);
              background-size: 120px 160px, 120px 160px;
              animation: dotsMove 12s linear infinite;
            }
            @keyframes burstUp { from{ transform: translate(-50%,-40%) scale(.9); opacity:.0;} 30%{opacity:1;} to{ transform: translate(-50%,-120%) scale(1); opacity:0; } }
            .burst{ position:absolute; left:50%; top:50%; transform: translate(-50%,-40%); font-weight:900; font-size:28px; text-shadow: 0 6px 18px rgba(0,0,0,.18); animation: burstUp .65s ease-out forwards; }
            .burst.ok{ color:#10b981; }
            .burst.bad{ color:#f43f5e; }
            @keyframes kshake { 0%{ transform: translateX(0);} 25%{ transform: translateX(-6px);} 50%{ transform: translateX(0);} 75%{ transform: translateX(6px);} 100%{ transform: translateX(0);} }
            .shake{ animation: kshake 180ms ease-in-out; }
          `}</style>
        </div>

        {/* Game Info Section */}
        <div className="flex items-center justify-center w-full py-6 mt-4">
          <GameInfoSection
            title="Swipe Direction"
            description="Reagiere schnell! Wenn ein Pfeil angezeigt wird, drücke die entsprechende Pfeiltaste oder WASD-Taste. Je schneller und präziser deine Reaktion, desto höher dein Score und deine Chance auf Tickets."
            tags={["Reflexe", "Timing", "Arcade", "Casual"]}
            tips={[
              "Achte auf die Pfeile und reagiere schnell",
              "Halte den Rhythmus – es geht um Konsistenz",
              "Nutze Pfeiltasten oder WASD für maximale Geschwindigkeit"
            ]}
            rules={[
              "Das Spiel dauert 30 Sekunden",
              "Jede richtige Bewegung bringt Punkte",
              "Mindestscore für Tickets: 500",
              "Spielen ist kostenlos"
            ]}
            icon="👆"
          />
        </div>
      </div>

      {/* Footer at bottom */}
      <SiteFooter />
    </div>
  );
}

function gradientForDirection(dir: string) {
  const active = '#10b981'; // emerald-500
  const idle = '#e5e7eb';   // gray-200
  switch (dir) {
    case 'ArrowRight':
      // center on RIGHT corner of diamond → (100% 50%) in diamond space
      return `radial-gradient(circle at 100% 50%, ${active} 0 38%, ${idle} 42%)`;
    case 'ArrowLeft':
      // center on LEFT corner → (0% 50%)
      return `radial-gradient(circle at 0% 50%, ${active} 0 38%, ${idle} 42%)`;
    case 'ArrowUp':
      // center on TOP corner → (50% 0%)
      return `radial-gradient(circle at 50% 0%, ${active} 0 38%, ${idle} 42%)`;
    case 'ArrowDown':
      // center on BOTTOM corner → (50% 100%)
      return `radial-gradient(circle at 50% 100%, ${active} 0 38%, ${idle} 42%)`;
    default:
      return `radial-gradient(circle at 50% 50%, ${idle} 0 40%, ${idle} 42%)`;
  }
}

function Diamond({ dir, size = 220, subtle = false, flash = null }: { dir: string; size?: number; subtle?: boolean; flash?: 'ok' | 'bad' | null }) {
  const bg = gradientForDirection(dir);
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative rounded-[22px] ${flash === 'ok' ? 'ring-4 ring-emerald-400' : flash === 'bad' ? 'ring-4 ring-rose-400' : ''}`}
    >
      <div
        className={`w-full h-full rounded-[14px] border ${subtle ? 'border-black/10' : 'border-black/20'} shadow-[0_10px_24px_rgba(0,0,0,0.16)] animate-[pop_140ms_ease-out]`}
        style={{
          background: bg,
          clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
        }}
      />
      <style jsx>{`
        @keyframes pop { from { transform: rotate(45deg) scale(.92); } to { transform: rotate(45deg) scale(1); } }
      `}</style>
    </div>
  );
}

function ticketsFromScore(score: number) {
  if (score >= 1000) return 3;
  if (score >= 750) return 2;
  if (score >= 500) return 1;
  return 0;
}
