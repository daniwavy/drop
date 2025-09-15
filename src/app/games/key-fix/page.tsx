"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

// QWERTZ layout target
const ROWS: string[][] = [
  ["Q","W","E","R","T","Z","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Y","X","C","V","B","N","M"],
];

const FLAT_TARGET = ROWS.flat();
const TOTAL = FLAT_TARGET.length; // 26 keys

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

const DURATION_MS = 30_000;

async function grantTicketsCF(tickets: number) {
  const functions = getFunctions(undefined, "us-central1");
  const fn = httpsCallable(functions, "grantTickets");
  return await fn({ game: "key-fix", tickets });
}

export default function Page() {
  const [{ layout, shuffledCount }, setState] = useState(() => makeShuffledLayout());
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(DURATION_MS);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);

  const correct = useMemo(() => layout.reduce((a, c, i) => a + (c === FLAT_TARGET[i] ? 1 : 0), 0), [layout]);
  const solved = correct === TOTAL;

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
        setState(makeShuffledLayout());
        setTimeLeft(DURATION_MS);
        setStarted(true);
        setEnded(false);
        return null;
      });
    }, 1000);
  }, []);

  const restart = useCallback(() => {
    setState(makeShuffledLayout());
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

  // Tickets profile:
  // 1–7 → 0, 8–15 → 1, 16–23 → 2, 24–26 → 3
  let tickets = 0;
  if (correct >= 24) tickets = 3;
  else if (correct >= 16) tickets = 2;
  else if (correct >= 8) tickets = 1;

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

  return (
    <div style={styles.page}>

      {countdown !== null && (
        <div style={styles.countdownOverlay}>
          <div style={styles.countdownNum}>{countdown}</div>
        </div>
      )}

      {started && !ended && (
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
                        e.dataTransfer.setData("text/plain", String(flatIndex));
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
                        outline: ok ? "2px solid rgba(80,200,120,0.8)" : "2px solid transparent",
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
      )}

      {ended && (
        <div style={styles.resultWrap}>
          <div style={styles.resultTitle}>Zeit abgelaufen</div>
          <div style={styles.resultScore}>Score: <span className="tnum" style={{ fontWeight: 800 }}>{correct}</span></div>
          <div style={styles.simpleBar}>
            <div style={{ ...styles.simpleBarFill, width: `${(correct / TOTAL) * 100}%` }} />
          </div>
          <div style={styles.resultSub}>Tickets: <span className="tnum" style={{ fontWeight: 600 }}>{tickets}</span></div>
          <button
            style={styles.resultBtn}
            onClick={async () => {
              if (!claimed && !claiming && tickets > 0) { try { await claim(); } catch {} }
              window.location.href = '/drop';
            }}
            disabled={claiming}
          >
            Weiter
          </button>
        </div>
      )}

      <style>{css}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: "0 auto", padding: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, minHeight: "100vh" },
  title: { margin: 8 },
  hudStats: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16, fontWeight: 600, letterSpacing: 0.2 as any, fontVariantNumeric: "tabular-nums" as any },
  boardWrap: { display: "flex", flexDirection: "column", alignItems: "center", width: "max-content", gap: 8 },
  hudItem: { opacity: 0.9 },
  board: { display: "flex", flexDirection: "column", gap: 10, marginTop: 6 },
  row: { display: "flex", gap: 10, justifyContent: "center" },
  key: { width: 58, height: 58, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", userSelect: "none", fontWeight: 600, letterSpacing: 1, cursor: "grab", fontSize: 20 },
  btn: { padding: "10px 16px", borderRadius: 10, border: "none", cursor: "pointer" },
  btnAlt: { padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "transparent", cursor: "pointer" },
  countdownOverlay: { position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", zIndex: 50 },
  countdownNum: { fontSize: 72, fontWeight: 700, color: "white" },
  resultWrap: { marginTop: 0, padding: 0, borderRadius: 0, background: "transparent", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, minWidth: "auto" },
  resultTitle: { fontSize: 20, fontWeight: 800, color: "#fff" },
  resultScore: { fontSize: 18, color: "rgba(255,255,255,0.9)" },
  simpleBar: { width: 420, maxWidth: "84vw", height: 10, borderRadius: 999, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.08)" },
  simpleBarFill: { height: "100%", borderRadius: 999, background: "linear-gradient(90deg, rgba(255,255,255,0.8), rgba(255,255,255,0.35))", boxShadow: "0 1px 2px rgba(0,0,0,0.25) inset", transition: "width 200ms linear" },
  resultSub: { fontSize: 13, color: "rgba(255,255,255,0.75)" },
  resultBtn: { marginTop: 4, padding: "10px 22px", borderRadius: 999, background: "#000", color: "#fff", fontWeight: 700, border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 6px 20px rgba(0,0,0,0.35)", cursor: "pointer" },
};

const css = `
  .tnum { font-variant-numeric: tabular-nums; }
  @media (max-width: 480px){
    div[style*='width: 58px'][style*='height: 58px']{ width:46px !important; height:46px !important; }
  }
`;
