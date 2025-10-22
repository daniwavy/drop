"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import GameInfoSection from "@/components/GameInfoSection";
import SiteFooter from "@/components/SiteFooter";

// QWERTZ layout target
const ROWS: string[][] = [
  ["Q","W","E","R","T","Z","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Y","X","C","V","B","N","M"],
];

const FLAT_TARGET = ROWS.flat();
const TOTAL = FLAT_TARGET.length; // 26 keys

const MAX_POINTS = 1000; // Volltreffer = 1000 Punkte

// Choose k unique indexes in [0..TOTAL)
function pickIndexes(k: number): number[] {
  const all = Array.from({ length: TOTAL }, (_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, k).sort((a, b) => a - b);
}

// Create a permutation by shuffling only a subset of positions
function makeShuffledLayout(): { layout: string[]; shuffledCount: number } {
  const base = [...FLAT_TARGET];
  const k = 14 + Math.floor(Math.random() * 3); // 14–16
  const idx = pickIndexes(k);
  // Extract the selected keys and permute them
  const pool = idx.map(i => base[i]);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  idx.forEach((pos, i) => { base[pos] = pool[i]; });
  // Ensure not already solved; if solved, reshuffle
  if (base.every((c, i) => c === FLAT_TARGET[i])) {
    return makeShuffledLayout();
  }
  return { layout: base, shuffledCount: k };
}

function splitToRows(arr: string[]): string[][] {
  const r0 = arr.slice(0, ROWS[0].length);
  const r1 = arr.slice(r0.length, r0.length + ROWS[1].length);
  const r2 = arr.slice(r0.length + r1.length);
  return [r0, r1, r2];
}

function countCorrect(arr: string[]): number {
  return arr.reduce((a, c, i) => a + (c === FLAT_TARGET[i] ? 1 : 0), 0);
}

const DURATION_MS = 30_000;
const RAFFLE_TICKET_MIN = 50;

async function grantTicketsCF(tickets: number) {
  const functions = getFunctions(undefined, "us-central1");
  const fn = httpsCallable(functions, "grantTickets");
  return await fn({ game: "key-fix", tickets });
}

function ticketsByPoints(points: number): number {
  if (points >= 1000) return 3;
  if (points >= 750) return 2;
  if (points >= 500) return 1;
  return 0;
}

function diamondsByPoints(points: number): number {
  if (points >= 1000) return 3;
  if (points >= 750) return 2;
  if (points >= 500) return 1;
  return 0;
}

// Canvas drag preview with transparent corners
function makeKeyDragCanvas(ch: string, bg: string, fg: string, w: number, h: number, r: number, fontPx: number) {
  const dpr = Math.max(1, (globalThis as any).devicePixelRatio || 1);
  const cw = Math.max(1, Math.round(w * dpr));
  const chh = Math.max(1, Math.round(h * dpr));
  const cr = Math.max(0, Math.round(r * dpr));
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = chh;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, cw, chh); // transparent corners
  // rounded rect path
  const rr = (x:number,y:number,w:number,h:number,r:number) => {
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  };
  rr(0,0,cw,chh,cr);
  ctx.fillStyle = bg;
  ctx.fill();
  // label
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(fontPx * dpr)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.fillText(ch, cw/2, chh/2 + (0.5 * dpr));
  return canvas;
}

function resolveDoubleActive(_eff: any): boolean { return !!_eff; }

export default function Page() {
  const [{ layout, shuffledCount }, setState] = useState(() => makeShuffledLayout());
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(DURATION_MS);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [grantStatus, setGrantStatus] = useState<string | null>(null);
  const resultPushedRef = React.useRef(false);
  const [coins, setCoins] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);
  const [initialCorrect, setInitialCorrect] = useState<number>(0);
  const tempDragImgRef = React.useRef<HTMLImageElement | null>(null);

  const correct = useMemo(() => layout.reduce((a, c, i) => a + (c === FLAT_TARGET[i] ? 1 : 0), 0), [layout]);
  const solved = correct === TOTAL;
  const fixesTotal = Math.max(0, TOTAL - initialCorrect);
  const fixesDone = Math.max(0, correct - initialCorrect);
  const points = fixesTotal > 0 ? Math.round((fixesDone / fixesTotal) * MAX_POINTS) : (solved ? MAX_POINTS : 0);
  const diamonds = diamondsByPoints(points);

  const router = useRouter();

  const grantTickets = useCallback(async () => {
    if (resultPushedRef.current) return;
    resultPushedRef.current = true;
  const amountBase = Math.max(0, ticketsByPoints(points));
  let localMult = 1;
  let navTickets = amountBase;
  let navDiamonds = diamonds;
  let navMult = 1;
  let currentTotalBefore: number | undefined;
  let currentTotalAfter: number | undefined;
    setSubmitting(true);
    setGrantStatus(null);
    try {
      // Lazy imports to avoid SSR issues
      const [appMod, authMod, fsMod, fnMod] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
        import('firebase/functions'),
      ]);
      const { getApp, getApps, initializeApp } = appMod as any;
      const { getAuth, onAuthStateChanged, getIdToken } = authMod as any;
      const { getFirestore, doc, getDoc } = fsMod as any;
      const { getFunctions, httpsCallable } = fnMod as any;

      const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      } as any;

      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      const auth = getAuth(app);
      const functions = getFunctions(app, 'us-central1');

      let user = auth.currentUser;
      if (!user) {
        user = (await new Promise((resolve) => {
          const to = setTimeout(() => resolve(null), 1500);
          onAuthStateChanged(auth, (u) => { clearTimeout(to); resolve(u); }, { onlyOnce: true } as any);
        })) as any;
      }
      if (!user) {
        setGrantStatus('Login erforderlich');
        return;
      }
      try { await getIdToken(user, true); } catch {}

      // Optional: read multiplier from user.effects.double_tickets
      try {
        const fs = getFirestore(app);
        const uref = doc(fs, 'users', user.uid);
        const usnap = await getDoc(uref);
        const d: any = usnap.data() || {};
        const eff = d.effects?.double_tickets || d.double_tickets || null;
        localMult = resolveDoubleActive(eff) ? 2 : 1;
      } catch {}

      const grant = httpsCallable(functions, 'grantTickets');
      const grantAmountEff = amountBase * localMult;
      const payload = {
        amount: grantAmountEff,
        baseAmount: amountBase,
        multiplierRequested: localMult,
        source: 'key-fix',
        uid: user.uid,
        score: points,
        ticketsFromCells: amountBase,
        bonusFromScore: 0,
        ts: Date.now(),
      } as any;

      const res = await grant(payload);
      const data = (res as any)?.data || {};
      const tAdded = typeof data.added === 'number' ? data.added : grantAmountEff;
      const currentBefore = typeof data.current === 'number' ? data.current : undefined;
      const totalAfter = typeof data.ticketsTotal === 'number' && Number.isFinite(data.ticketsTotal)
        ? data.ticketsTotal
        : currentBefore !== undefined
          ? currentBefore + tAdded
          : undefined;
      currentTotalBefore = currentBefore;
      currentTotalAfter = totalAfter;
  const srvMult = (data as any)?.multiplier === 2 ? 2 : ((data as any)?.multiplier === 1 ? 1 : localMult);
  navTickets = tAdded;
  navMult = srvMult;
      setGrantStatus(`Tickets: ${tAdded}${srvMult > 1 ? ' (x' + srvMult + ')' : ''}`);

      if (diamonds > 0) {
        try {
          const grantDiamonds = httpsCallable(functions, 'grantDiamonds');
          await grantDiamonds({ amount: diamonds, source: 'key-fix', uid: user.uid, score: points, ts: Date.now() });
          navDiamonds = diamonds;
        } catch (e) {
          console.warn('[key-fix] grantDiamonds failed', e);
        }
      }
    } catch (e) {
      console.error('[key-fix] grantTickets error', e);
      setGrantStatus('Fehler beim Gutschreiben der Tickets');
    } finally {
      setSubmitting(false);
      // Align payload structure with tap-rush: include multiplier, tix2x and diagnostics
      const effMult = navMult || 1;
      const tix2x = effMult === 2;
      sessionStorage.setItem('resultPayload', JSON.stringify({
        game: 'key-fix',
        score: points,
        tickets: navTickets,
        diamonds: navDiamonds,
        multiplier: effMult,
        mult: effMult,
        tix2x,
        double: tix2x,
        x2: tix2x,
        capped: false,
        room: undefined,
        current: currentTotalBefore,
        ticketsBefore: currentTotalBefore,
        ticketsTotal: currentTotalAfter,
        ticketsMin: RAFFLE_TICKET_MIN,
        coins,
        streak,
      }));
      router.push('/result');
    }
  }, [points, coins, streak, diamonds]);

  // Timer
  useEffect(() => {
    if (!started || ended) return;
    const t0 = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - t0;
      const left = Math.max(0, DURATION_MS - elapsed);
      setTimeLeft(left);
      if (left === 0) {
        setEnded(true);
      }
    }, 100);
    return () => clearInterval(id);
  }, [started, ended]);

  useEffect(() => {
    if (started && solved && !ended) setEnded(true);
  }, [solved, started, ended]);

  useEffect(() => {
    if (!ended) return;
    grantTickets();
  }, [ended, grantTickets]);

  const onSwap = useCallback((a: number, b: number) => {
    if (a === b) return;
    setState(prev => {
      const next = [...prev.layout];
      [next[a], next[b]] = [next[b], next[a]];
      return { layout: next, shuffledCount: prev.shuffledCount };
    });
  }, []);

  const startGame = useCallback(() => {
    setCountdown(3);
    setStarted(false);
    setEnded(false);
    setDragFrom(null);
    const id = setInterval(() => {
      setCountdown(prev => {
        if (prev && prev > 1) return prev - 1;
        clearInterval(id);
        const next = makeShuffledLayout();
        setState(next);
        setInitialCorrect(countCorrect(next.layout));
        setTimeLeft(DURATION_MS);
        setStarted(true);
        setEnded(false);
        return null;
      });
    }, 1000);
  }, []);

  const restart = useCallback(() => {
    const next = makeShuffledLayout();
    setState(next);
    setInitialCorrect(countCorrect(next.layout));
    setTimeLeft(DURATION_MS);
    setStarted(false);
    setEnded(false);
    setDragFrom(null);
    setClaiming(false);
    setClaimed(false);
  }, []);

  // Auto-start countdown on mount
  useEffect(() => {
    if (!started && !ended && countdown === null) {
      startGame();
    }
  }, [started, ended, countdown, startGame]);

  const rows = splitToRows(layout);
  const progress = 1 - timeLeft / DURATION_MS;

  // Tickets by points: 500→1, 750→2, ≥1000→3
  let tickets = ticketsByPoints(points);

  const claim = useCallback(async () => {
    if (claiming || claimed || tickets <= 0) return;
    try {
      setClaiming(true);
      await grantTicketsCF(tickets);
      setClaimed(true);
    } finally {
      setClaiming(false);
    }
  }, [claiming, claimed, tickets]);


  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('topbarSnapshot');
      if (raw) {
        const snap = JSON.parse(raw);
        if (typeof snap?.coins === 'number') setCoins(snap.coins);
        if (typeof snap?.streak === 'number') setStreak(snap.streak);
      }
    } catch {}
  }, []);

  return (
    <div style={styles.page}>

      {/* Fixed Top Bar (like drop page) */}
      <div className="fixed top-0 left-0 right-0 z-60 bg-black">
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

      {countdown !== null && (
        <div style={styles.countdownOverlay}>
          <div style={styles.countdownNum}>{countdown}</div>
        </div>
      )}

      {started && !ended && (
        <div style={styles.card}>
          <div style={styles.boardWrap}>
            <div style={styles.hudStats}>
            <span style={styles.hudItem}>Richtig: <b className="tnum">{correct}</b>/<b className="tnum">{TOTAL}</b></span>
            <span style={styles.hudItem}>Vertauscht: <b className="tnum">{shuffledCount}</b></span>
            <span style={styles.hudItem}>Zeit: <b className="tnum">{(timeLeft / 1000).toFixed(1)}s</b></span>
          </div>

          <div style={styles.board}>
            {rows.map((r, ri) => (
              <div key={ri} style={styles.row}>
                {r.map((ch, ci) => {
                  const flatIndex = (ri === 0 ? 0 : ri === 1 ? ROWS[0].length : ROWS[0].length + ROWS[1].length) + ci;
                  const ok = ch === FLAT_TARGET[flatIndex];
                  return (
                    <div
                      key={flatIndex}
                      draggable={!ended}
                      onDragStart={(e) => {
                        setDragFrom(flatIndex);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(flatIndex));
                        try {
                          const el = e.currentTarget as HTMLDivElement;
                          const cs = getComputedStyle(el);
                          const w = el.offsetWidth;
                          const h = el.offsetHeight;
                          const r = parseFloat(cs.borderRadius) || 8;
                          const fontPx = parseFloat(cs.fontSize) || 18;
                          const bg = ok ? "#006400" : "#000";
                          const fg = "#fff";
                          const canvas = makeKeyDragCanvas(ch, bg, fg, w, h, r, fontPx);
                          const url = canvas.toDataURL("image/png");
                          const img = new Image();
                          img.src = url;
                          img.style.position = "fixed";
                          img.style.top = "-1000px";
                          img.style.left = "-1000px";
                          document.body.appendChild(img);
                          tempDragImgRef.current = img;
                          e.dataTransfer.setDragImage(img, Math.round(w/2), Math.round(h/2));
                        } catch {}
                      }}
                      onDragEnd={() => {
                        if (tempDragImgRef.current && tempDragImgRef.current.parentNode) {
                          tempDragImgRef.current.parentNode.removeChild(tempDragImgRef.current);
                        }
                        tempDragImgRef.current = null;
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = dragFrom ?? Number(e.dataTransfer.getData("text/plain"));
                        const to = flatIndex;
                        if (Number.isFinite(from)) onSwap(from as number, to);
                        setDragFrom(null);
                      }}
                      style={{
                        ...styles.key,
                        opacity: ended ? 0.7 : 1,
                        background: ok ? "#006400" : styles.key.background,
                        color: ok ? "#fff" : styles.key.color,
                      }}
                    >
                      {ch}
                    </div>
                  );
                })}
              </div>
            ))}
            </div>
          </div>
        </div>
      )}

      {ended && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="h-12 w-12 rounded-full border-4 border-black/20 border-t-black animate-spin" aria-label="Lädt" />
        </div>
      )}

      {/* Game Info Section */}
      <div className="flex items-center justify-center w-full py-6">
        <GameInfoSection
          title="Key Fix"
          description="Sortiere alle Tasten in die richtige QWERTY-Reihenfolge! Tippe schnell und präzise, um höhere Scores zu erreichen und mehr Tickets zu gewinnen."
          tags={["Puzzle", "Timing", "Skill", "Brain"]}
          tips={[
            "Merke dir die QWERTY-Layout-Reihenfolge",
            "Schnelligkeit ist wichtiger als Perfektion – nutze Richtungseinweise",
            "Konzentriere dich auf einen Bereich zur Zeit"
          ]}
          rules={[
            "Das Spiel dauert 60 Sekunden",
            "Jede richtige Taste bringt Punkte",
            "Mindestscore für Tickets: 500",
            "Spielen ist kostenlos"
          ]}
          icon="⌨️"
        />
      </div>

      <style>{css}</style>
      <SiteFooter />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { width: "100vw", height: "100vh", margin: 0, padding: 24, paddingTop: 96, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "#fff", color: "#000" },
  card: { background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.12), 0 2px 10px rgba(0,0,0,0.06)", padding: 24, maxWidth: "100%", display: "inline-flex", flexDirection: "column", alignItems: "center" },
  title: { margin: 8 },
  hudStats: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, fontWeight: 600, letterSpacing: 0.2 as any, fontVariantNumeric: "tabular-nums" as any },
  boardWrap: { display: "flex", flexDirection: "column", alignItems: "center", width: "max-content", gap: 8 },
  hudItem: { opacity: 0.9 },
  board: { display: "flex", flexDirection: "column", gap: 10, marginTop: 6 },
  row: { display: "flex", gap: 10, justifyContent: "center" },
  key: { width: 58, height: 58, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "#000", color: "#fff", userSelect: "none", fontWeight: 600, letterSpacing: 1, cursor: "grab", fontSize: 20 },
  btn: { padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer" },
  btnAlt: { padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", cursor: "pointer" },
  countdownOverlay: { position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", zIndex: 50 },
  countdownNum: { fontSize: 72, fontWeight: 700, color: "#000" },
};

const css = `
  .tnum { font-variant-numeric: tabular-nums; }
  html, body { background:#fff !important; }
  #__next, [data-nextjs-root] { background:#fff !important; }
  @media (max-width: 480px){
    div[style*='width: 58px'][style*='height: 58px']{ width:46px !important; height:46px !important; }
  }
`;
