"use client";


import React from "react";
import { useRouter } from "next/navigation";
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getApp, getApps, initializeApp } from 'firebase/app';

function ensureFirebase() {
  const cfg: any = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const app = getApps().length ? getApp() : initializeApp(cfg);
  return { app, auth: getAuth(app), fs: getFirestore(app) as ReturnType<typeof getFirestore> };
}

export default function TapRushPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [grantStatus, setGrantStatus] = React.useState<string | null>(null);
  const DURATION_MS = 30000;
  const GRID = 16;

  // game state
  const [running, setRunning] = React.useState(false);
  const [score, setScore] = React.useState(0);
  // animated score display
  const [displayScore, setDisplayScore] = React.useState(0);
  const scoreAnimRef = React.useRef<number | null>(null);
  const scoreFromRef = React.useRef(0);
  const scoreToRef = React.useRef(0);
  const scoreStartRef = React.useRef(0);
  const [scoreBump, setScoreBump] = React.useState(false);
  const [timeLeft, setTimeLeft] = React.useState(DURATION_MS);
  const [target, setTarget] = React.useState<number>(0); // deterministic for SSR
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [lastHit, setLastHit] = React.useState<{ i: number; ok: boolean; t: number } | null>(
    null
  );
  const [finished, setFinished] = React.useState(false);

  // difficulty
  const [combo, setCombo] = React.useState(0);
  const [bestCombo, setBestCombo] = React.useState(0);
  // combo animations
  const prevComboRef = React.useRef(0);
  const [comboBump, setComboBump] = React.useState(false);
  const [comboBursts, setComboBursts] = React.useState<{ id: number; text: string }[]>([]);
  const comboIdRef = React.useRef(1);
  // Combo animation: bump only (removed floating burst)
  React.useEffect(() => {
    const prev = prevComboRef.current;
    if (combo > prev && combo > 1) {
      // bump pill
      setComboBump(true);
      const to1 = window.setTimeout(() => setComboBump(false), 220);
      return () => { window.clearTimeout(to1); };
    }
    prevComboRef.current = combo;
  }, [combo]);
  // Ensure prevComboRef is synced
  React.useEffect(() => { prevComboRef.current = combo; }, [combo]);
  const [hazard, setHazard] = React.useState<number[] | null>(null);
  const penaltyMsRef = React.useRef(0);

  const [uid, setUid] = React.useState<string | null>(null);
  const [coins, setCoins] = React.useState<number>(0);
  const [streak, setStreak] = React.useState<number>(0);
  const [avatar, setAvatar] = React.useState<string | null>(null);

  // golden LOS cell (index in grid)
  const [losCell, setLosCell] = React.useState<number | null>(null);
  const [losLocked, setLosLocked] = React.useState(false);
  // per-game LOS logic
  const [shouldSpawnLos, setShouldSpawnLos] = React.useState(false); // 20% chance per game
  const [losSpawned, setLosSpawned] = React.useState(false); // true after it appeared once

  // tickets and special ticket cell
  const [tickets, setTickets] = React.useState(0);
  const [ticketCell, setTicketCell] = React.useState<number | null>(null);

  const [flash, setFlash] = React.useState<null | 'hit' | 'miss'>(null);
  const flashToRef = React.useRef<number | null>(null);

  // Animated result bar state
  const [resultPct, setResultPct] = React.useState(0);
  const resultRafRef = React.useRef<number | null>(null);

  // pre-countdown intro animation (start true to avoid initial flash)
  const [intro, setIntro] = React.useState(true);

  React.useEffect(() => {
    // play intro wave, then start countdown
    setIntro(true);
    const to = setTimeout(() => {
      setIntro(false);
      setCountdown(3);
    }, 900);
    return () => clearTimeout(to);
  }, []);

  // auth → uid
  React.useEffect(() => {
    const { auth } = ensureFirebase();
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u ? u.uid : null);
      if (!u) { setCoins(0); setStreak(0); }
    });
    return () => unsub();
  }, []);

  // uid → user snapshot
  React.useEffect(() => {
    if (!uid) return;
    const { fs } = ensureFirebase();
    const ref = doc(fs as any, 'users', uid);
    const unsub = onSnapshot(ref, (snap) => {
      const d: any = snap.data() || {};
      setCoins(typeof d.coins === 'number' ? d.coins : 0);
      setStreak(typeof d.streak === 'number' ? d.streak : 0);
      setAvatar(typeof d.photoURL === 'string' && d.photoURL ? d.photoURL : null);
    });
    return () => unsub();
  }, [uid]);

  const tickRef = React.useRef<number | null>(null);

  // countdown → running
  const startWithCountdown = () => {
    setScore(0);
    setDisplayScore(0);
    if (scoreAnimRef.current) cancelAnimationFrame(scoreAnimRef.current);
    setTimeLeft(DURATION_MS);
    setTarget(0);
    penaltyMsRef.current = 0;
    setCombo(0);
    setBestCombo(0);
    setHazard(null);
    setLosCell(null);
    setLosLocked(false);
    setTicketCell(null);
    setTickets(0);
    setResultPct(0);
    setFinished(false);
    if (resultRafRef.current) cancelAnimationFrame(resultRafRef.current);
    setShouldSpawnLos(Math.random() < 0.2); // 20% per game
    setLosSpawned(false);
    setIntro(true);
    setTimeout(() => {
      setIntro(false);
      setCountdown(3);
    }, 900);
  };
  // Animate display score when `score` changes
  React.useEffect(() => {
    // ease-out animation to new score
    scoreFromRef.current = displayScore;
    scoreToRef.current = score;
    scoreStartRef.current = performance.now();
    const D = 380; // ms duration
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    const step = (now: number) => {
      const t = Math.min(1, (now - scoreStartRef.current) / D);
      const v = scoreFromRef.current + (scoreToRef.current - scoreFromRef.current) * ease(t);
      setDisplayScore(v);
      if (t < 1) {
        scoreAnimRef.current = requestAnimationFrame(step);
      }
    };
    if (scoreAnimRef.current) cancelAnimationFrame(scoreAnimRef.current);
    scoreAnimRef.current = requestAnimationFrame(step);
    // small bump effect
    setScoreBump(true);
    const to = window.setTimeout(() => setScoreBump(false), 160);
    return () => {
      if (scoreAnimRef.current) cancelAnimationFrame(scoreAnimRef.current);
      window.clearTimeout(to);
    };
  }, [score]);
  // Animate result bar on finish
  React.useEffect(() => {
    if (!finished) return;
    const pctTarget = Math.min(100, Math.max(0, ((score - 300) / 200) * 100));
    setResultPct(0);
    const startTs = performance.now();
    const dur = 700; // ms
    const ease = (t: number) => t * (2 - t); // easeOutQuad
    const step = (now: number) => {
      const t = Math.min(1, (now - startTs) / dur);
      const v = 0 + (pctTarget - 0) * ease(t);
      setResultPct(v);
      if (t < 1) resultRafRef.current = requestAnimationFrame(step);
    };
    if (resultRafRef.current) cancelAnimationFrame(resultRafRef.current);
    resultRafRef.current = requestAnimationFrame(step);
    return () => { if (resultRafRef.current) cancelAnimationFrame(resultRafRef.current); };
  }, [finished, score]);

  React.useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      setCountdown(null);
      setRunning(true);
      return;
    }
    const id = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 800);
    return () => clearTimeout(id);
  }, [countdown]);

  // timer loop
  React.useEffect(() => {
    if (!running) return;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const left = Math.max(0, DURATION_MS - elapsed - penaltyMsRef.current);
      setTimeLeft(left);
      if (left <= 0) {
        setTimeLeft(0);
        setRunning(false);
        setFinished(true);
        if (tickRef.current) cancelAnimationFrame(tickRef.current);
        return;
      }
      tickRef.current = requestAnimationFrame(step);
    };
    tickRef.current = requestAnimationFrame(step);
    return () => {
      if (tickRef.current) cancelAnimationFrame(tickRef.current);
    };
  }, [running]);

  // retarget interval speeds up
  React.useEffect(() => {
    if (!running) return;
    const base = 650; // faster base
    const iv = setInterval(() => {
      setTarget(Math.floor(Math.random() * GRID));
    }, Math.max(180, base - Math.floor((1 - timeLeft / DURATION_MS) * 520)));
    return () => clearInterval(iv);
  }, [running, timeLeft]);

  // Ticket spawner: random bonus cell that grants a ticket
  React.useEffect(() => {
    if (!running) { setTicketCell(null); return; }
    const iv = setInterval(() => {
      if (ticketCell != null) return; // only one at a time
      if (Math.random() < 0.3) { // 30% chance per tick
        let idx = Math.floor(Math.random() * GRID);
        if (
          idx === target ||
          (hazard && hazard.includes(idx)) ||
          losCell === idx
        ) {
          idx = (idx + 1) % GRID;
        }
        setTicketCell(idx);
      }
    }, 2500);
    return () => clearInterval(iv);
  }, [running, ticketCell, target, hazard, losCell, GRID]);

  React.useEffect(() => () => { if (flashToRef.current) window.clearTimeout(flashToRef.current); }, []);

  const onCell = (i: number) => {
    if (!running) return;
    // ticket cell: award and clear, but do not advance
    if (ticketCell != null) {
      if (i === ticketCell) {
        setTickets((t) => t + 1);
        setTicketCell(null);
        return; // stop here, target stays the same
      }
      // if clicked elsewhere, keep the ticket cell
    }
    if (losCell != null && i === losCell) {
      setHazard((prev) => {
        const arr = Array.isArray(prev) ? [...prev] : [];
        if (!arr.includes(losCell)) arr.push(losCell);
        return arr;
      });
      setLosCell(null);
      setLosLocked(true);
      setLosSpawned(true); // lock-out for this game
      return; // do not advance or penalize
    }
    const hit = i === target;
    const hitHazard = hazard != null && hazard.includes(i);

    if (hit) {
      // screen vignette for hit
      if (flashToRef.current) window.clearTimeout(flashToRef.current);
      setFlash('hit');
      flashToRef.current = window.setTimeout(() => setFlash(null), 220);

      setCombo((c) => {
        const nc = c + 1; // unlimited combo growth
        setBestCombo((b) => Math.max(b, nc));
        setScore((s) => s + nc); // award with multiplier
        return nc;
      });
      setLastHit({ i, ok: true, t: performance.now() });
      // choose next target and spawn hazards simultaneously
      let newTarget = Math.floor(Math.random() * GRID);
      // avoid repeating the same target to keep flow dynamic
      if (newTarget === target) newTarget = (newTarget + 1) % GRID;
      setTarget(newTarget);
      const hazardCountHit = 2 + Math.floor(Math.random() * 3); // 2–4 hazards
      const hz1: number[] = [];
      while (hz1.length < hazardCountHit) {
        let idx = Math.floor(Math.random() * GRID);
        if (idx !== newTarget && !hz1.includes(idx)) hz1.push(idx);
      }
      setHazard(hz1);
      // with 20% per game, spawn exactly one LOS cell (if not already spawned)
      if (shouldSpawnLos && !losSpawned) {
        const forbidden = new Set<number>();
        forbidden.add(newTarget);
        hz1.forEach((h) => forbidden.add(h));
        let idx = Math.floor(Math.random() * GRID);
        let guard = 0;
        while (forbidden.has(idx) && guard++ < 50) idx = (idx + 1) % GRID;
        setLosCell(idx);
        setLosSpawned(true);
      }
    } else {
      // screen vignette for miss
      if (flashToRef.current) window.clearTimeout(flashToRef.current);
      setFlash('miss');
      flashToRef.current = window.setTimeout(() => setFlash(null), 280);

      // miss: reset combo, apply penalty; heavier if hazard tapped
      setCombo(0);
      const penalty = hitHazard ? 1500 : 700; // ms
      penaltyMsRef.current += penalty;
      setScore((s) => Math.max(0, s - 1));
      setLastHit({ i, ok: false, t: performance.now() });
      // Removed retarget and hazard spawn on miss
    }
  };

  const reset = () => {
    setScore(0);
    setTimeLeft(DURATION_MS);
    setTarget(0);
    setShouldSpawnLos(false);
    setLosSpawned(false);
    setLosLocked(false);
    setLosCell(null);
    setRunning(false);
    setCountdown(null);
    setFinished(false);
  };

  const seconds = Math.ceil(timeLeft / 1000);
  const lowTime = running && !finished && seconds <= 5;
// Bonus tickets from score milestones (500–1000 in 3 steps of 250)
const BONUS_START = 500;
const BONUS_STEP = 250; // 500 → +1, 750 → +2, 1000 → +3
const bonusTickets = Math.max(0, Math.floor((score - BONUS_START) / BONUS_STEP) + 1);
const bonusFromScore = score >= BONUS_START ? Math.min(bonusTickets, 3) : 0;
const totalTickets = tickets + bonusFromScore;
// Ratio for bars (0..1) over 500..1000 (range 500)
const resultRatio = Math.min(1, Math.max(0, (score - BONUS_START) / 500));

// Diamonds bonus: 1–3 at end, same thresholds as tickets
const diamondsFromScore = score >= BONUS_START
  ? Math.min(3, Math.max(1, Math.floor((score - BONUS_START) / BONUS_STEP) + 1))
  : 0;

  const grantTickets = async (mode: 'drop' | 'replay') => {
    if (submitting) return;
    const amount = Math.max(0, totalTickets);
    const diamonds = Math.max(0, diamondsFromScore);
    if (amount <= 0 && diamonds <= 0) {
      if (mode === 'drop') router.push('/drop');
      if (mode === 'replay') startWithCountdown();
      return;
    }
    setSubmitting(true);
    setGrantStatus(null);
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
      const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY as string | undefined,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN as string | undefined,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID as string | undefined,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET as string | undefined,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID as string | undefined,
      } as any;
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      const functions = getFunctions(app, 'us-central1');
      const auth = getAuth(app);
      let user = auth.currentUser;
      if (!user) {
        user = (await new Promise((resolve) => {
          const to = setTimeout(() => resolve(null), 1500);
          onAuthStateChanged(auth, (u) => { clearTimeout(to); resolve(u); }, { onlyOnce: true } as any);
        })) as any;
      }
      if (!user) {
        setGrantStatus('Login erforderlich');
        setSubmitting(false);
        return;
      }
      try { await getIdToken(user, true); } catch {}
      const uid = user.uid;
      const grant = httpsCallable(functions, 'grantTickets');
      const payload = {
        amount,
        source: 'tap-rush',
        uid,
        score,
        comboMax: bestCombo,
        bonusFromScore,
        ticketsFromCells: tickets,
        ts: Date.now(),
      };
      const res = await grant(payload);
      const ok = res && (res as any).data && (((res as any).data.ok === true) || ((res as any).data.success === true));
      if (ok) {
        setGrantStatus(`Tickets: ${amount}${diamonds > 0 ? ` • Diamanten: ${diamonds}` : ''}`);
      } else {
        setGrantStatus(`Unklare Antwort vom Server. Angefordert: ${amount}`);
        console.warn('grantTickets response', (res as any)?.data);
      }
      // Grant diamonds (coins) 1–3 at end
      if (diamonds > 0) {
        try {
          // Add idempotency opId to grantCoins and grantDiamonds
          const opId = `tap-rush-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const grantCoins = httpsCallable(functions, 'grantCoins');
          await grantCoins({ amount: diamonds, source: 'tap-rush', uid, score, ts: Date.now(), opId });
        } catch (e1) {
          try {
            // Fallback function name
            const grantDiamonds = httpsCallable(functions, 'grantDiamonds');
            await grantDiamonds({ amount: diamonds, source: 'tap-rush', uid, score, ts: Date.now(), opId });
          } catch (e2) {
            console.warn('grant diamonds failed', e1, e2);
          }
        }
      }
    } catch (e) {
      console.error('grantTickets error', e);
      setGrantStatus('Fehler beim Gutschreiben der Tickets');
    } finally {
      const next = () => {
        if (mode === 'drop') router.push('/drop');
        if (mode === 'replay') startWithCountdown();
      };
      setTimeout(next, 300);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-white flex items-center justify-center p-6 pt-16 overflow-hidden">
      {/* Fixed Top Bar (like drop page) */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-black">
        <img src="/logo.png" alt="drop" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-auto select-none" />
        <div className="mx-auto max-w-6xl h-16 flex items-center justify-between px-0 relative">
          {/* center: coins and streak */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <div className="px-4 py-1.5 rounded-full bg-white text-black text-base font-semibold border border-black/10 shadow">
              💎 <span className="tabular-nums ml-1">{coins ?? 0}</span>
            </div>
            <div className="px-4 py-1.5 rounded-full bg-white text-black text-base font-semibold border border-black/10 shadow">
              🔥 <span className="tabular-nums ml-1">{streak ?? 0}</span>
            </div>
          </div>
          {/* right spacer to balance */}
          <div className="w-16" />
        </div>
      </div>
      <div className="relative z-10 w-full max-w-xl">
        {/* Card */}
        <div className="relative rounded-3xl bg-white shadow-[0_20px_80px_rgba(0,0,0,0.15)] p-5 sm:p-6 flex flex-col overflow-hidden">
          {/* Vignette feedback overlay */}
          {flash && (
            <div className="fixed inset-0 z-40 pointer-events-none">
              <div className={`absolute inset-0 vignette ${flash === 'hit' ? 'vignette-hit' : 'vignette-miss'}`} />
            </div>
          )}
          {!finished ? (
            <>
              {/* HUD */}
              <div className="flex items-center justify-between gap-2">
                <div className={`px-3 py-1 rounded-full bg-black text-white text-sm font-semibold shadow ${intro ? 'wave-item' : ''}`} style={intro ? { animationDelay: '40ms' } : undefined}>
                  Score: <span className={`tabular-nums inline-block ${scoreBump ? 'score-bump' : ''}`}>{Math.floor(displayScore)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`px-3 py-1 rounded-full bg-amber-500 text-black text-sm font-semibold shadow ${comboBump ? 'combo-bump' : ''} ${intro ? 'wave-item' : ''}`} style={intro ? { animationDelay: '100ms' } : undefined}>
                    Combo ×<span className="tabular-nums">{Math.max(1, combo)}</span>
                  </div>
                  <div
                    className={`px-3 py-1 rounded-full text-sm font-semibold shadow ${lowTime ? 'bg-rose-600 text-white timer-pulse' : 'bg-black text-white'} ${intro ? 'wave-item' : ''}`}
                    style={intro ? { animationDelay: '160ms' } : undefined}
                  >
                    Zeit: <span className="tabular-nums">{seconds}s</span>
                  </div>
                </div>
              </div>




              {/* Grid (scrolls inside card) */}
              <div className={`mt-5 flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-2 pt-1 ${intro ? 'pointer-events-none' : ''}`} style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="grid grid-cols-4 gap-3 pb-2">
                  {Array.from({ length: GRID }).map((_, i) => {
                    const isTarget = i === target && running;
                    const flashCell = false;
                    const flashCls = '';
                    return (
                      <button
                        key={i}
                        onClick={() => onCell(i)}
                        className={`group select-none aspect-square rounded-2xl border transition-all active:scale-[0.97] ${intro ? 'wave-item' : ''} ${
                          isTarget
                            ? 'bg-white text-black border-black shadow ring-4 ring-black animate-pulse'
                            : hazard && hazard.includes(i)
                            ? 'bg-white text-black border-black shadow ring-4 ring-black animate-pulse'
                            : losCell === i
                            ? 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 text-black border-amber-600 shadow ring-4 ring-amber-400 animate-pulse'
                            : ticketCell === i
                            ? 'bg-gradient-to-br from-blue-300 via-sky-400 to-blue-600 text-white border-blue-600 shadow ring-2 ring-blue-400 animate-pulse'
                            : 'bg-black text-white border-black shadow'
                        }`}
                        style={intro ? { animationDelay: `${(i % 4) * 90 + 280}ms` } : undefined}
                      >
                        <span
                          className={`font-extrabold leading-none select-none ${
                            isTarget
                              ? 'text-black cross-in rotate-45 text-[52px] md:text-[64px]'
                              : hazard && hazard.includes(i)
                              ? 'text-black text-[44px] md:text-[56px]'
                              : losCell === i
                              ? 'text-black text-[36px]'
                              : ticketCell === i
                              ? 'text-white text-[36px]'
                              : 'text-white/60 group-active:opacity-80 text-[36px]'
                          }`}
                        >
                          {isTarget ? '✛' : hazard && hazard.includes(i) ? 'x' : losCell === i ? '🎟' : ticketCell === i ? '🎟' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Controls removed: no pause allowed */}
              <div className="mt-5" />
            </>
          ) : (
            /* Result screen only */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center w-full max-w-md mx-auto px-4">
                <div className="text-3xl font-bold text-black">Zeit abgelaufen</div>
                <div className="mt-3 text-lg text-black/80">
                  Score: <span className="tabular-nums font-semibold text-black">{score}</span>
                </div>
                <div className="mt-4">
                  <div className="relative w-full">
                    {/* Bar (clipped) */}
                    <div className="h-4 w-full bg-black/10 rounded-full overflow-hidden border border-black/10">
                      <div
                        className={`result-fill ${finished ? 'result-anim' : ''}`}
                        style={{ ['--sx' as any]: String(resultRatio) }}
                      />
                      {/* Tick lines */}
                      <div className="pointer-events-none absolute inset-0 flex justify-between">
                        <div className="w-px bg-black/20" />
                        <div className="w-px bg-black/20" />
                        <div className="w-px bg-black/20" />
                      </div>
                    </div>


                    {/* Current score marker */}
                    <div
                      className="absolute -top-2 h-8 w-0.5 bg-black/50"
                      style={{ left: `calc(${Math.min(100, Math.max(0, resultRatio * 100))}% )` }}
                    />
                  </div>

                  <div className="mt-3 flex items-stretch justify-center gap-3">
                    {/* Tickets card */}
                    <div className="min-w-[92px] rounded-2xl border border-black/10 bg-white px-4 py-2 shadow-sm">
                      <div className="text-[10px] leading-none tracking-wider text-black/50 font-semibold text-center">TICKETS</div>
                      <div className="mt-1 text-lg font-extrabold text-black flex items-center justify-center gap-1">
                        <span className="select-none">+{totalTickets}</span>
                        <span className="select-none">🎟</span>
                      </div>
                    </div>
                    {/* Diamonds card */}
                    <div className="min-w-[92px] rounded-2xl border border-black/10 bg-white px-4 py-2 shadow-sm">
                      <div className="text-[10px] leading-none tracking-wider text-black/50 font-semibold text-center">DIAMANTEN</div>
                      <div className="mt-1 text-lg font-extrabold text-black flex items-center justify-center gap-1">
                        <span className="select-none">+{diamondsFromScore}</span>
                        <span className="select-none">💎</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-center gap-3">
                  <button
                    onClick={() => grantTickets('replay')}
                    disabled={submitting}
                    className="px-6 py-3 rounded-full bg-black text-white font-semibold text-lg shadow hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting && (
                      <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    Erneut spielen
                  </button>
                  <button
                    onClick={() => grantTickets('drop')}
                    disabled={submitting}
                    className="px-6 py-3 rounded-full bg-black text-white font-semibold text-lg shadow hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {submitting && (
                      <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    Weiter
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Countdown Overlay */}
          {countdown != null && countdown > 0 && (
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center">
              <div
                key={countdown}
                className={`font-extrabold tracking-tighter text-white animate-countdown-${countdown}`}
                style={{
                  fontSize: '31.5vmin',
                  lineHeight: 0.8,
                  WebkitTextStroke: '8px black',
                  willChange: 'transform',
                }}
              >
                {countdown}
              </div>
            </div>
          )}
        </div>
      </div>
      <style jsx global>{`
        @keyframes popIn {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes rotateIn {
          0% { transform: rotate(-180deg) scale(0); opacity: 0; }
          100% { transform: rotate(0) scale(1); opacity: 1; }
        }
        @keyframes fadeInUp {
          0% { transform: translateY(100%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .animate-countdown-3 { animation: popIn 0.8s ease-out; transform-origin: center; }
        .animate-countdown-2 { animation: rotateIn 0.8s ease-out; transform-origin: center; }
        .animate-countdown-1 { animation: fadeInUp 0.8s ease-out; transform-origin: center; }

        @keyframes losPulse { 0% { transform: translate(-50%, -50%) scale(1); } 50% { transform: translate(-50%, -50%) scale(1.06); } 100% { transform: translate(-50%, -50%) scale(1); } }
        button[aria-label="los-btn"], .los-btn { animation: losPulse 1.2s ease-in-out infinite; }

        @keyframes vignettePulse {
          0% { opacity: 0; transform: scale(0.98); }
          50% { opacity: 0.75; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.01); }
        }
        .vignette { animation: vignettePulse 0.32s ease-out forwards; }
        .vignette-hit {
          background: radial-gradient(ellipse at center, transparent 58%, rgba(16,185,129,0.16) 72%, rgba(16,185,129,0.32) 88%, rgba(16,185,129,0.5) 100%);
          mix-blend-mode: screen;
          filter: blur(8px);
        }
        .vignette-miss {
          background: radial-gradient(ellipse at center, transparent 58%, rgba(244,63,94,0.18) 72%, rgba(244,63,94,0.34) 88%, rgba(244,63,94,0.52) 100%);
          mix-blend-mode: screen;
          filter: blur(8px);
          animation-duration: 0.36s;
        }
        .result-fill { height: 100%; background: linear-gradient(90deg,#ef4444,#22c55e); transform-origin: left; transform: scaleX(0); }
        .result-anim { animation: fillBar 1.1s cubic-bezier(.2,.8,.2,1) forwards; }
        .result-live { transform: scaleX(var(--sx)); transition: transform 100ms linear; }
        @keyframes fillBar { to { transform: scaleX(var(--sx)); } }
        @keyframes wavePop {
          0% { opacity: 0; transform: translateX(-24px) scale(0.96); }
          60% { opacity: 1; transform: translateX(0) scale(1.02); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        .wave-item { opacity: 0; animation: wavePop 0.6s cubic-bezier(.2,.8,.2,1) forwards; will-change: transform, opacity; }
        @keyframes scoreBump {
          0% { transform: translateY(0) scale(1); }
          40% { transform: translateY(-2px) scale(1.12); }
          100% { transform: translateY(0) scale(1); }
        }
        .score-bump { animation: scoreBump 160ms cubic-bezier(.2,.8,.2,1); will-change: transform; }
        /* combo HUD bump */
        @keyframes comboBump {
          0% { transform: scale(1); }
          35% { transform: scale(1.12); }
          100% { transform: scale(1); }
        }
        .combo-bump { animation: comboBump 220ms cubic-bezier(.2,.8,.2,1); will-change: transform; }
        /* floating stack of combo labels */
        @keyframes comboFloat {
          0% { transform: translateY(0) scale(0.9); opacity: 0; }
          20% { transform: translateY(-6px) scale(1); opacity: 1; }
          100% { transform: translateY(-30px) scale(1); opacity: 0; }
        }
        .combo-burst { animation: comboFloat 900ms ease-out forwards; font-size: 28px; text-shadow: 0 2px 0 rgba(0,0,0,0.1); }
        @keyframes timerPulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(244,63,94,0.4); }
          50% { transform: scale(1.06); box-shadow: 0 0 0 8px rgba(244,63,94,0.0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(244,63,94,0.4); }
        }
        .timer-pulse { animation: timerPulse 0.9s ease-in-out infinite; }
        @keyframes crossIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
        .cross-in { animation: crossIn 180ms cubic-bezier(.2,.8,.2,1); will-change: opacity, transform; }
      `}</style>
    </div>
  );
}