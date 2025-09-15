"use client";
import { useEffect, useState, useRef } from "react";
import { ref, getDownloadURL } from "firebase/storage";
import { storage } from "../../lib/firebase";
// --- Cached getDownloadURL with memory + localStorage TTL ---
const __dlMem = new Map<string, { url: string; exp: number }>();
const DL_TTL_MS = 24 * 60 * 60 * 1000; // 24h
function lsGet(k: string) {
  try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; }
}
function lsSet(k: string, v: any) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}
async function getCachedDownloadURL(path: string): Promise<string> {
  // passthrough for absolute URLs and Next.js public assets (starting with "/")
  if (/^https?:\/\//i.test(path) || path.startsWith('/')) return path;
  const now = Date.now();
  const mem = __dlMem.get(path);
  if (mem && mem.exp > now) return mem.url;
  const k = `dl:${path}`;
  const st = lsGet(k);
  if (st && st.url && typeof st.exp === 'number' && st.exp > now) {
    __dlMem.set(path, { url: st.url, exp: st.exp });
    return st.url;
  }
  const url = await getDownloadURL(ref(storage, path));
  const exp = now + DL_TTL_MS;
  const rec = { url, exp };
  __dlMem.set(path, rec);
  lsSet(k, rec);
  return url;
}

// Slugify a name for local asset lookup (e.g. "Amazon Karte" -> "amazon-karte.png")
function toSlugFilename(name?: string | null): string | null {
  if (!name || typeof name !== 'string') return null;
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `${slug}.png` : null;
}

// Weekly cache-busting for avatar images
function weekStamp() { return Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)); }
function withAvatarCache(u?: string | null) {
  if (!u) return null;
  const sep = u.includes('?') ? '&' : '?';
  return `${u}${sep}wk=${weekStamp()}`;
}
import { getFirestore, doc, onSnapshot, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getDatabase, ref as dbRef, onValue } from "firebase/database";
import { AccountPanel } from "../profile/page";

// One-shot confetti burst (Canvas overlay)
function ConfettiBurst({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;
    canvas.className = 'fixed inset-0 w-screen h-screen pointer-events-none z-[9999]';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let running = true;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const N = 220;
    const colors = ['#f59e0b','#10b981','#3b82f6','#ef4444','#a855f7','#f97316'];
    const particles = Array.from({ length: N }).map((_, i) => {
      // Centered around upward (-PI/2) with ±90° spread
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI; // [-135°, -45°]
      const speed = 5 + Math.random() * 6;
      const vx = Math.cos(angle) * speed;      // balanced left/right
      const vy = Math.sin(angle) * speed - 4;  // consistent upward kick
      return {
        x: canvas.width / 2 + (Math.random() - 0.5) * 40,
        y: canvas.height / 3,
        vx,
        vy,
        g: 0.18 + Math.random() * 0.08,
        size: 8 + Math.random() * 8,
        rot: Math.random() * Math.PI * 2,
        vr: (-0.3 + Math.random() * 0.6),
        life: 0,
        color: colors[i % colors.length],
      };
    });

    const t0 = performance.now();
    const duration = 4000; // ms

    function tick(t: number) {
      if (!ctx) return;
      const last = (tick as any).lt ?? t;
      const dt = t - last;
      (tick as any).lt = t;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.life += dt;
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        // simple drag
        p.vx *= 0.992;
        p.vy *= 0.992;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        // Add faint outline for better visibility
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        ctx.restore();
      }
      if (running && t - t0 < duration) {
        raf = requestAnimationFrame(tick);
      } else {
        cleanup();
      }
    }

    function cleanup() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    raf = requestAnimationFrame(tick);
    const timeout = setTimeout(() => { cleanup(); onDoneRef.current?.(); }, duration + 200);
    return () => { clearTimeout(timeout); cleanup(); };
  }, []);

  return null;
}

// Stylized preview card for the Countdown minigame (used when no image is available)
function CountdownPreviewCard({ title, timeLabel }: { title: string; timeLabel: string }) {
  return (
    <div className="relative w-full h-full rounded-[20px] overflow-hidden">
      {/* glossy background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-fuchsia-600 to-rose-500" />
        {/* radial glow blobs */}
        <div className="absolute -top-20 -left-16 w-64 h-64 rounded-full bg-white/15 blur-3xl" />
        <div className="absolute -bottom-24 -right-16 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
        {/* diagonal stripes */}
        <div className="absolute inset-0 opacity-[0.08] bg-[length:28px_28px] bg-[linear-gradient(45deg,white_2px,transparent_2px)]" />
      </div>

      {/* content */}
      <div className="relative z-10 h-full flex items-center justify-between px-6">
        {/* left: icon + title */}
        <div className="flex items-center gap-4">
          <div className="shrink-0 w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white">
            {/* timer icon */}
            <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="13" r="8" />
              <path d="M12 13V9" />
              <path d="M9 2h6" />
            </svg>
          </div>
          <div className="text-white">
            <div className="text-2xl font-extrabold drop-shadow-sm leading-none">{title}</div>
            <div className="mt-1 text-white/80 text-sm">Reagiere vor Ablauf des Countdowns</div>
          </div>
        </div>

        {/* right: timer chip + CTA */}
        <div className="flex flex-col items-end gap-2">
          <div className="px-3 py-1 rounded-full bg-white/90 text-black text-sm font-semibold shadow">{timeLabel}</div>
          <div className="px-3 py-1 rounded-full bg-black/40 text-white text-xs font-semibold border border-white/20 animate-cta-shine">Schnell spielen</div>
        </div>
      </div>

      {/* corner badge */}
      <div className="absolute top-3 left-3 px-2 py-1 rounded-full bg-black/40 text-white text-[11px] font-semibold border border-white/15">NEU</div>
    </div>
  );
}


// 3D tilt Steam-style gift card sprite for prize pool
function GiftCard3D({ title, img, children }: { title?: string; img?: string; children?: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const handle = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;   // 0..1
    const y = (e.clientY - r.top) / r.height;  // 0..1
    const rx = (0.5 - y) * 32; // stronger tilt up/down (doubled)
    const ry = (x - 0.5) * 40; // stronger tilt left/right (doubled)
    const tx = (x - 0.5) * 36; // stronger parallax x (doubled)
    const ty = (0.5 - y) * 36; // stronger parallax y (doubled)
    el.style.setProperty('--rx', rx.toFixed(2));
    el.style.setProperty('--ry', ry.toFixed(2));
    el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    el.style.setProperty('--tx', tx.toFixed(2) + 'px');
    el.style.setProperty('--ty', ty.toFixed(2) + 'px');
  };
  const leave = () => {
    const el = wrapRef.current; if (!el) return;
    el.style.setProperty('--rx', '0');
    el.style.setProperty('--ry', '0');
    el.style.setProperty('--tx', '0px');
    el.style.setProperty('--ty', '0px');
  };
  return (
    <div
      ref={wrapRef}
      onMouseMove={handle}
      onMouseLeave={leave}
      className="holo group relative w-full h-full [perspective:1200px] select-none"
    >
      <div className="card relative w-full h-full rounded-2xl overflow-hidden border border-white/10 bg-black/30 backdrop-blur-[2px]">
        {/* Base gradient similar to minigame when no image is supplied */}
        {img ? (
          <img src={img} alt={title || 'Preis'} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-200 via-white to-neutral-100" />
        )}
        {/* Animated neon border replaced with static border */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none border-2 border-black"
        />
        {/* Children rendered on top */}
        {children ? <div className="absolute inset-0 z-20 pointer-events-none">{children}</div> : null}
        {/* No inner content; sprite is the card itself */}
      </div>
    </div>
  );
}

// Interactive Neon Hologram card for the minigame
function NeonHoloCard({ title, subtitle, timeLabel, img, onImgLoad, onImgError }: { title: string; subtitle: string; timeLabel: string; img?: string | null; onImgLoad?: () => void; onImgError?: () => void; }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const handle = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;   // 0..1
    const y = (e.clientY - r.top) / r.height;  // 0..1
    const rx = (0.5 - y) * 16; // stronger tilt up/down
    const ry = (x - 0.5) * 20; // stronger tilt left/right
    el.style.setProperty('--rx', rx.toFixed(2));
    el.style.setProperty('--ry', ry.toFixed(2));
    el.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  };
  const leave = () => {
    const el = wrapRef.current; if (!el) return;
    el.style.setProperty('--rx', '0');
    el.style.setProperty('--ry', '0');
  };
  return (
    <div ref={wrapRef} onMouseMove={handle} onMouseLeave={leave}
      className="holo group relative w-full h-full [perspective:1200px] select-none">
      {/* 3D card */}
          <button
            type="button"
            aria-label="Spiel starten"
            onClick={() => { window.location.href = '/games/tap-rush'; }}
            className="card relative w-full h-full rounded-2xl overflow-hidden border border-white/10 bg-black/30 backdrop-blur-[2px] shadow-[0_10px_50px_rgba(0,0,0,0.45)]"
          >
        {/* Background image only */}
        {img ? (
          <img
            src={img}
            alt="Minigame"
            className="absolute inset-0 w-full h-full object-cover"
            onLoad={onImgLoad}
            onError={onImgError}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-600 via-purple-600 to-rose-500" />
        )}

        {/* Animated neon border replaced with static border */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none border-2 border-black"
        />

        {/* Countdown pill only */}
        <div className="absolute bottom-2 right-2 z-10 px-3 py-1 rounded-full bg-white text-black text-xs font-semibold shadow-sm border border-black/10 tabular-nums">
          {timeLabel}
        </div>
      </button>
    </div>
  );
}

export default function DropPage() {
  const [authReady, setAuthReady] = useState(false);
  const [mustComplete, setMustComplete] = useState(false);
  const [authUser, setAuthUser] = useState<ReturnType<typeof getAuth>["currentUser"] | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      setAuthUser(u);
      setProfilePhoto(withAvatarCache(u?.photoURL || null));
      if (!u) {
        // Kein gestarteter Account → nicht automatisch öffnen
        setMustComplete(false);
        setAuthReady(true);
        setProfilePhoto(null);
        setShowAccount(false);
        return;
      }
      if (!u.emailVerified) {
        // Account begonnen, aber nicht verifiziert → automatisch öffnen
        setMustComplete(true);
        setAuthReady(true);
        setShowAccount(true);
        return;
      }
      try {
        const fs = getFirestore();
        const snap = await getDoc(doc(fs, "users", u.uid));
        const completed = !!(snap.exists() && (snap.data() as any)?.profileCompleted === true) && !!u.displayName && !!u.photoURL;
        setMustComplete(!completed);
        if (completed) {
          setShowAccount(false);
        } else {
          setShowAccount(true);
        }
      } catch {
        // Nutzer existiert, aber Profil nicht lesbar → als unvollständig behandeln
        setMustComplete(true);
        setShowAccount(true);
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  const [url, setUrl] = useState<string | null>(null);
  const [gameUrl, setGameUrl] = useState<string | null>(null);
  const [shadowUrl, setShadowUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [nextAtMs, setNextAtMs] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<string>("");
  const [uid, setUid] = useState<string | null>(null);
  const [coins, setCoins] = useState<number>(0);
  const [ticketsToday, setTicketsToday] = useState<number>(0);
  // Global tickets total (today) for dynamic prize scaling
  const [ticketsTotalToday, setTicketsTotalToday] = useState<number>(0);
  const [poolLevel, setPoolLevel] = useState<number>(0);
  // Prize pool modal state (declare early so hooks below can reference showPool)
  type PrizeItem = { title?: string; image?: string; qty?: number };
  type PrizeLevel = { collage?: string; items?: PrizeItem[]; totalRewards?: number }
  const [showPool, setShowPool] = useState(false);
  const [poolItems, setPoolItems] = useState<PrizeItem[]>([]);
  const [prizeLevels, setPrizeLevels] = useState<PrizeLevel[] | null>(null);
  const [levelTotals, setLevelTotals] = useState<number[] | null>(null);
  const [totalRewards, setTotalRewards] = useState<number>(0);
  const [poolResolved, setPoolResolved] = useState<({ title?: string; qty?: number; url: string })[]>([]);
  const [collagePaths, setCollagePaths] = useState<string[] | null>(null);
  // --- Loading overlay: shown until Firebase data is ready on first load ---
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [prizePoolLoaded, setPrizePoolLoaded] = useState(false);
  const [poolLevelServerLoaded, setPoolLevelServerLoaded] = useState(false);
  // Listen to aggregated tickets count for the Berlin day in metrics_daily/{YYYY-MM-DD}
  useEffect(() => {
    const fs = getFirestore();
    let unsub: (() => void) | null = null;

    function berlinYMDFromMs(ms: number) {
      const opts: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' };
      return new Intl.DateTimeFormat('en-CA', opts).format(new Date(ms));
    }

    function resubscribe() {
      const baseReady = serverNowBaseRef.current > 0 && perfBaseRef.current > 0;
      const serverNow = baseReady ? (serverNowBaseRef.current + (performance.now() - perfBaseRef.current)) : Date.now();
      const dayId = berlinYMDFromMs(serverNow);
      if (unsub) { unsub(); unsub = null; }
      unsub = onSnapshot(
        doc(fs, 'metrics_daily', dayId),
        { includeMetadataChanges: true },
        (snap) => {
          const data: any = snap.exists() ? snap.data() : null;
          const v = data?.ticketsTodayTotal;
          setTicketsTotalToday(typeof v === 'number' ? v : 0);
          const lvl = data?.poolLevel;
          setPoolLevel(typeof lvl === 'number' ? lvl : 0);
          if (!snap.metadata.fromCache) setPoolLevelServerLoaded(true);
        },
        () => setTicketsTotalToday(0)
      );
      // Force a server read once to bypass cache and get the latest level immediately
      getDoc(doc(fs, 'metrics_daily', dayId)).then((snap) => {
        const data: any = snap.exists() ? snap.data() : null;
        const v = data?.ticketsTodayTotal;
        setTicketsTotalToday(typeof v === 'number' ? v : 0);
        const lvl = data?.poolLevel;
        setPoolLevel(typeof lvl === 'number' ? lvl : 0);
        setPoolLevelServerLoaded(true);
      }).catch(() => {});
    }

    resubscribe();
    const iv = setInterval(resubscribe, 60 * 1000);
    return () => { if (unsub) unsub(); clearInterval(iv); };
  }, []);

  // When showPool is opened, fetch latest ticketsTotalToday from server immediately
  useEffect(() => {
    if (!showPool) return;
    const fs = getFirestore();
    function berlinYMDFromMs(ms: number) {
      const opts: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' };
      return new Intl.DateTimeFormat('en-CA', opts).format(new Date(ms));
    }
    const baseReady = serverNowBaseRef.current > 0 && perfBaseRef.current > 0;
    const serverNow = baseReady ? (serverNowBaseRef.current + (performance.now() - perfBaseRef.current)) : Date.now();
    const dayId = berlinYMDFromMs(serverNow);
    getDoc(doc(fs, 'metrics_daily', dayId)).then((snap) => {
      const data: any = snap.exists() ? snap.data() : null;
      const v = data?.ticketsTodayTotal;
      setTicketsTotalToday(typeof v === 'number' ? v : 0);
      const lvl = data?.poolLevel;
      setPoolLevel(typeof lvl === 'number' ? lvl : 0);
      setPoolLevelServerLoaded(true);
    }).catch(() => {});
  }, [showPool]);
  const [until20, setUntil20] = useState<string>("");
  function getDefaultSmallTicker() {
    const base = 'Platzhalter • News • Update';
    return base; // each string only once
  }
  const [smallTicker, setSmallTicker] = useState<string>(getDefaultSmallTicker());
  // Readiness flags for images
  const [collageReady, setCollageReady] = useState(false);
  const [gameReady, setGameReady] = useState(false);
  const [minigameResolved, setMinigameResolved] = useState(false);

  // Compute initial readiness: collage image, minigame config, and prize pool config
  useEffect(() => {
    const ready = collageReady && minigameResolved && (!gameUrl || gameReady) && prizePoolLoaded && poolLevelServerLoaded;
    if (!initialLoadDone) {
      if (ready) {
        setInitialLoadDone(true);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
  }, [collageReady, minigameResolved, gameUrl, gameReady, prizePoolLoaded, initialLoadDone, poolLevelServerLoaded]);
  // cycle logo animation: 0..5 every 20s (6 variants)
  const [logoAnim, setLogoAnim] = useState<number>(0);
  useEffect(() => {
    const id = setInterval(() => setLogoAnim(v => (v + 1) % 6), 20000);
    return () => clearInterval(id);
  }, []);

  // --- Animation Refs and helpers ---
  const coinBadgeRef = useRef<HTMLDivElement | null>(null);
  const testAnchorRef = useRef<HTMLDivElement | null>(null);
  const dailySourceGemRef = useRef<HTMLSpanElement | null>(null);

  function centerOf(el: Element | null) {
    if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  // Fly diamond animation: fly from origin element (if given) to badge
  function playGemFly(count = 10, fromEl?: Element | null) {
    const targetEl = coinBadgeRef.current;
    if (!targetEl) return;
    const target = centerOf(targetEl);
    const start = centerOf(fromEl || targetEl);

    const durMin = 650, durMax = 1100;
    for (let i = 0; i < count; i++) {
      const node = document.createElement('span');
      node.textContent = '💎';
      node.style.position = 'fixed';
      node.style.left = '0';
      node.style.top = '0';
      node.style.willChange = 'transform, opacity';
      node.style.pointerEvents = 'none';
      node.style.zIndex = '9998';
      node.style.fontSize = (14 + Math.random() * 10) + 'px';
      node.style.opacity = '0';
      document.body.appendChild(node);

      const dx = (Math.random() - 0.5) * 140;
      const dy = -60 - Math.random() * 120; // arc upward
      const cp = { x: start.x + dx, y: start.y + dy };
      const T = durMin + Math.random() * (durMax - durMin);
      const delay = i * 28;

      const t0 = performance.now() + delay;
      function tick(t: number) {
        const pRaw = (t - t0) / T;
        const p = Math.max(0, Math.min(1, pRaw));
        const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
        const x = (1 - ease) * (1 - ease) * start.x + 2 * (1 - ease) * ease * cp.x + ease * ease * target.x;
        const y = (1 - ease) * (1 - ease) * start.y + 2 * (1 - ease) * ease * cp.y + ease * ease * target.y;
        node.style.transform = `translate(${x}px, ${y}px)`;
        node.style.opacity = p < 0.1 ? String(p * 10) : p > 0.9 ? String(1 - (p - 0.9) * 10) : '1';
        if (p < 1) requestAnimationFrame(tick); else node.remove();
      }
      requestAnimationFrame(tick);
    }
  }

  // Helper: heutige Reward-Anzahl
  function todaysRewardCount() {
    const len = dailyRewards.length;
    const dayIndex = (streak && streak > 0) ? (((streak - 1) % len)) : 0; // 0..len-1
    return dailyRewards[Math.max(0, Math.min(len - 1, dayIndex))] || 0;
  }

  // Scale item quantity by total tickets today: +1 qty per 10k tickets, cap 99
  function scaledQty(base?: number) {
    const baseQty = typeof base === 'number' && base > 0 ? base : 1;
    const steps = Math.floor((ticketsTotalToday || 0) / 10000); // 10k tickets → +1
    const q = baseQty + steps;
    return Math.min(99, q);
  }



  // Daily bonus UI state (layout only)
  const [showDaily, setShowDaily] = useState<boolean>(false);
  const [showStreakView, setShowStreakView] = useState<boolean>(false);
  const [showAccount, setShowAccount] = useState<boolean>(false);
  const [showItems, setShowItems] = useState<boolean>(false);
  // --- Item System --- (Firestore-driven)
  // Firestore: config/shop
  // { items: { double_xp: { name: string, desc: string, price: number, active?: boolean }, double_tickets: { ... } } }
  type ShopItem = { id: 'double_xp'|'double_tickets'; name: string; desc: string; price: number; active?: boolean };
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);

  type ItemId = 'double_xp' | 'double_tickets';
  const [itemsOwned, setItemsOwned] = useState<Record<ItemId, number>>({ double_xp: 0, double_tickets: 0 });
  const [buyBusy, setBuyBusy] = useState<Record<ItemId, boolean>>({ double_xp: false, double_tickets: false });
  const [buyError, setBuyError] = useState<string | null>(null);
  const [effects, setEffects] = useState<Record<ItemId, { active?: boolean; untilMs?: number }>>({
    double_xp: {},
    double_tickets: {},
  });
  // live timer inside Items modal
  const [itemsTick, setItemsTick] = useState(0);
  const [nowMsItems, setNowMsItems] = useState<number>(0);

  useEffect(() => {
    if (!showItems) return;
    const update = () => {
      const t = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);
      setNowMsItems(t);
      setItemsTick((v) => v + 1);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [showItems]);
  // Subscribe to Firestore for shop items
  useEffect(() => {
    const fs = getFirestore();
    const unsub = onSnapshot(doc(fs, 'config', 'shop'), (snap) => {
      const data: any = snap.exists() ? snap.data() : null;
      // expected shape:
      // { items: { double_xp: { name, desc, price, active }, double_tickets: {...} } }
      const raw = data?.items || {};
      const out: ShopItem[] = [];
      for (const id of ['double_xp','double_tickets'] as const) {
        const it = raw[id];
        if (it && typeof it.price === 'number') {
          out.push({ id, name: it.name || (id === 'double_xp' ? 'Doppeltes XP' : 'Doppelte Lose'), desc: it.desc || '', price: it.price, active: it.active !== false });
        }
      }
      setShopItems(out);
    }, () => setShopItems([]));
    return () => unsub();
  }, []);
  const [streak, setStreak] = useState<number>(0);
  const [claimedToday, setClaimedToday] = useState<boolean>(false);
  // Daily rewards: 14 Tage, Darstellung in 2 Reihen à 7
  const dailyRewards = [
    5, 5, 5, 10, 5,   // 1–5
    5, 10, 5, 5, 5,   // 6–10
    10, 5, 5, 15      // 11–14
  ];

  const [claimLoading, setClaimLoading] = useState(false);
  const [confettiAt, setConfettiAt] = useState<number>(0);
  const confettiLockRef = useRef(false);
  const startConfetti = () => {
    if (confettiLockRef.current) return;
    confettiLockRef.current = true;
    setConfettiAt(Date.now());
    // unlock slightly after the animation finishes
    setTimeout(() => { confettiLockRef.current = false; }, 4500);
  };

  async function handleClaim() {
    if (!uid || claimLoading || claimedToday) return;
    setClaimLoading(true);
    try {
      const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'claimDaily');
      const res: any = await fn({});
      if (res?.data?.ok === true) {
        startConfetti();
        setClaimedToday(true);
      } else if (res?.data?.ok === false && res?.data?.code === 'already-claimed') {
        setClaimedToday(true);
      }
      // coins/streak/lastClaim werden via onSnapshot aktualisiert
    } catch (e) {
      // optional: Fehlerbehandlung
    } finally {
      setClaimLoading(false);
    }
  }

  const [serverOffset, setServerOffset] = useState<number>(0); // ms: serverNow = Date.now() + serverOffset

  const areaRef = useRef<HTMLDivElement>(null);
  const serverNowBaseRef = useRef<number>(0); // epoch ms at last sync
  const perfBaseRef = useRef<number>(0);      // performance.now() at last sync

  // Simple marquee: one long string scrolling endlessly
  const tickerText = 'Platzhalter';
  const tickerRepeat = 50; // ensure long track
  const tickerContent = Array.from({ length: tickerRepeat }, () => `${tickerText} •`).join(' ');
  const trackRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<number>(0);
  const speedRef = useRef<number>(1.2); // px per frame ~72px/s at 60fps
  useEffect(() => {
    let raf = 0;
    function tick() {
      const el = trackRef.current;
      if (el) {
        const w = el.scrollWidth || 0;
        posRef.current += speedRef.current;
        if (w > 0 && posRef.current >= w / 2) posRef.current = 0; // wrap halfway for buffer
        el.style.transform = `translateX(${-posRef.current}px)`;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);


  function fmt(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
  }

  function berlinTodayId() {
    const opts: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' };
    return new Intl.DateTimeFormat('en-CA', opts).format(new Date());
  }
  useEffect(() => {
    const dayKey = `ticker:${berlinTodayId()}`;
    // Try daily cache first
    const cached = lsGet(dayKey);
    if (Array.isArray(cached) && cached.every((s: any) => typeof s === 'string')) {
      const base = (cached as string[]).join(' • ');
      setSmallTicker(base);
    }
    // Fallback: read once from Firestore and cache for the day
    (async () => {
      try {
        const fs = getFirestore();
        const snap = await getDoc(doc(fs, 'config', 'ticker'));
        const data: any = snap.exists() ? snap.data() : null;
        let msgs: string[] = [];
        if (Array.isArray(data)) {
          msgs = data.filter((s: any) => typeof s === 'string');
        } else if (Array.isArray(data?.messages)) {
          msgs = data.messages.filter((s: any) => typeof s === 'string');
        } else if (data && typeof data === 'object') {
          msgs = Object.values(data).filter((s: any) => typeof s === 'string');
        }
        const finalMsgs = msgs.length > 0 ? msgs : ['Platzhalter'];
        lsSet(dayKey, finalMsgs);
        const base = finalMsgs.join(' • ');
        setSmallTicker(base);
      } catch {
        const base = 'Platzhalter • News • Update';
        setSmallTicker(base);
      }
    })();
  }, []);
  function fmtHMS(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${h}:${m}:${sec}`;
  }

  function nextLocal3hMsFrom(nowMs: number) {
    const d = new Date(nowMs);
    d.setMinutes(0, 0, 0);
    const h = d.getHours();
    const nextH = Math.floor(h / 3) * 3 + 3; // 0,3,6,9,12,15,18,21 → next
    if (nextH >= 24) {
      d.setDate(d.getDate() + 1);
      d.setHours(nextH - 24);
    } else {
      d.setHours(nextH);
    }
    return d.getTime();
  }

  function msUntil20From(nowMs: number) {
    const now = new Date(nowMs);
    const target = new Date(nowMs);
    target.setHours(20, 0, 0, 0);
    if (now.getTime() >= target.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime() - now.getTime();
  }

  function sameYMDInBerlin(aMs: number, bMs: number) {
    const opts: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' };
    const fmt = new Intl.DateTimeFormat('en-CA', opts); // stable YYYY-MM-DD
    const A = fmt.format(new Date(aMs));
    const B = fmt.format(new Date(bMs));
    return A === B;
  }


  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUid(u.uid);
      } else {
        setUid(null);
        setCoins(0);
        setStreak(0);
        setClaimedToday(false);
        setShowItems(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const db = getDatabase();
    const offRef = dbRef(db, "/.info/serverTimeOffset");
    const unsub = onValue(offRef, (snap) => {
      const off = snap.val();
      setServerOffset(typeof off === 'number' ? off : 0);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Re-sync bases whenever offset changes
    serverNowBaseRef.current = Date.now() + serverOffset;
    perfBaseRef.current = performance.now();
  }, [serverOffset]);


  useEffect(() => {
    if (!uid) return;
    const fs = getFirestore();
    const unsub = onSnapshot(doc(fs, "users", uid), (snap) => {
      if (snap.exists()) {
        const data: any = snap.data();
        setCoins(typeof data.coins === "number" ? data.coins : 0);
        const s = typeof data.streak === 'number' ? data.streak : 0;
        setStreak(s);
        const lc = data.lastClaim?.toMillis ? data.lastClaim.toMillis() : (typeof data.lastClaim === 'number' ? data.lastClaim : null);
        const serverNow = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);
        if (lc) {
          const isTodayClaim = sameYMDInBerlin(lc, serverNow);
          setClaimedToday(isTodayClaim);
        } else {
          setClaimedToday(false);
        }
        if (typeof data.photoURL === 'string' && data.photoURL) {
          setProfilePhoto(withAvatarCache(data.photoURL));
        }
        // Items owned
        const it = data.items;
        const dx = typeof it?.double_xp === 'number' ? it.double_xp : 0;
        const dt = typeof it?.double_tickets === 'number' ? it.double_tickets : 0;
        setItemsOwned({ double_xp: dx, double_tickets: dt });
        // Effects with fallback: if `until` missing, derive from `activatedAt + 10min`
        const eff = data.effects || {};
        const toMs = (v: any) => (v?.toMillis ? v.toMillis() : (typeof v === 'number' ? v : undefined));
        const deriveUntil = (node: any) => {
          const u = toMs(node?.until);
          if (typeof u === 'number') return u;
          const a = toMs(node?.activatedAt);
          return typeof a === 'number' ? a + 10 * 60 * 1000 : undefined;
        };
        setEffects({
          double_xp: { active: !!eff?.double_xp?.active, untilMs: deriveUntil(eff?.double_xp) },
          double_tickets: { active: !!eff?.double_tickets?.active, untilMs: deriveUntil(eff?.double_tickets) },
        });
      } else {
        setCoins(0);
        setStreak(0);
        setClaimedToday(false);
        setItemsOwned({ double_xp: 0, double_tickets: 0 });
        setEffects({ double_xp: {}, double_tickets: {} });
      }
    });
    return () => unsub();
  }, [uid]);
  // --- Item purchase function ---
  async function buyItem(id: ItemId) {
    if (!uid) { setBuyError('Bitte zuerst einloggen.'); return; }
    setBuyError(null);
    setBuyBusy((s) => ({ ...s, [id]: true }));
    const fs = getFirestore();
    const userRef = doc(fs, 'users', uid);
    const catalogItem = shopItems.find(x => x.id === id && (x.active ?? true));
    const shopPrice = catalogItem ? catalogItem.price : -1;
    const coinsBefore = coins || 0;
    const ctx = { uid, item: id, coinsBefore, shopPrice, canAfford: coinsBefore >= shopPrice };
    // Add mutable debug context for transaction
    const dbg: any = { preflight: ctx };
    if (!catalogItem) { setBuyError('Item nicht verfügbar.'); setBuyBusy((s) => ({ ...s, [id]: false })); return; }
    try {
      await runTransaction(fs, async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists()) throw new Error('Profil nicht gefunden');
        const data: any = snap.data() || {};
        const coins: number = typeof data.coins === 'number' ? data.coins : 0;
        // Load server-side price inside the same transaction
        const shopSnap = await tx.get(doc(fs, 'config', 'shop'));
        const shop: any = shopSnap.exists() ? shopSnap.data() : {};
        const priceMap = shop?.items || {};
        const serverPrice = typeof priceMap?.[id]?.price === 'number' ? priceMap[id].price : catalogItem.price;
        const active = (priceMap?.[id]?.active !== false);
        if (!active) throw new Error('Item nicht verfügbar');
        if (coins < serverPrice) throw new Error('Nicht genug 💎');
        const items = { ...(data.items || {}) };
        const current = typeof items[id] === 'number' ? items[id] : 0;
        // Enforce single ownership: cannot buy if already owned (max 1)
        if (current >= 1) throw new Error('Nur ein Exemplar erlaubt');
        items[id] = current + 1;
        // capture attempted write for debug
        (dbg.tx = dbg.tx || {}).read = {
          coinsOld: coins,
          itemsOld: { [id]: current },
          serverPrice,
          active,
        };
        (dbg.tx = dbg.tx || {}).write = {
          coinsNew: coins - serverPrice,
          itemsNew: { [id]: items[id] },
          keys: Object.keys({ coins: coins - serverPrice, items, updatedAt: '<serverTimestamp>' })
        };
        tx.update(userRef, { coins: coins - serverPrice, items, updatedAt: serverTimestamp() });
      });
    } catch (e: any) {
      const code = e?.code || e?.name || 'unknown-error';
      const msg = e?.message || String(e);
      let hint = '';
      if (code === 'permission-denied') {
        hint = 'Hinweis: Firestore-Rules haben das Update abgelehnt. Prüfe config/shop Preise & active, Rules-Branch für Kauf, und ob nur {coins, items, updatedAt} geändert werden.';
      } else if (code === 'failed-precondition' || code === 'aborted') {
        hint = 'Hinweis: Transaktion abgebrochen. Mögliche Race Condition oder veraltete Daten.';
      }
      const extra = `Kontext: ${JSON.stringify(ctx)} | TX: ${JSON.stringify(dbg)}`;
      setBuyError(`Kauf fehlgeschlagen [${code}]: ${msg}. ${hint} ${extra}`);
      console.error('[buyItem] error', { code, msg, ctx, dbg, raw: e });
    } finally {
      setBuyBusy((s) => ({ ...s, [id]: false }));
    }
  }

  // --- Activate a single owned item ---
  async function useItem(id: ItemId) {
    if (!uid) { setBuyError('Bitte zuerst einloggen.'); return; }
    setBuyError(null);
    setBuyBusy((s) => ({ ...s, [id]: true }));
    try {
      const fs = getFirestore();
      const userRef = doc(fs, 'users', uid);
      await runTransaction(fs, async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists()) throw new Error('Profil nicht gefunden');
        const data: any = snap.data() || {};
        const itemsData: any = data.items || {};
        const owned = typeof itemsData[id] === 'number' ? itemsData[id] : 0;
        if (owned <= 0) throw new Error('Kein Item vorhanden');
        const newCount = owned - 1;

        const effects: any = { ...(data.effects || {}) };
        // compute server-relative now and set 10 minutes duration
        const serverNow = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);
        const untilMs = Math.floor(serverNow + 10 * 60 * 1000);
        effects[id] = { active: true, activatedAt: serverTimestamp(), until: untilMs };

        // Only update the nested counter for this item to avoid overwriting other entries
        const updates: any = { effects, updatedAt: serverTimestamp() };
        (updates as any)[`items.${id}`] = newCount;
        tx.update(userRef, updates);
      });
    } catch (e: any) {
      const code = e?.code || e?.name || 'unknown-error';
      const msg = e?.message || String(e);
      setBuyError(`Verwenden fehlgeschlagen [${code}]: ${msg}`);
      console.error('[useItem] error', e);
    } finally {
      setBuyBusy((s) => ({ ...s, [id]: false }));
    }
  }


  useEffect(() => {
    if (!uid) return;
    const fs = getFirestore();
    // Use server-synced time to compute todayId to avoid client clock drift
    const serverNow = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);
    const todayId = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(serverNow));

    const unsub = onSnapshot(
      doc(fs, 'users', uid, 'countersByDay', todayId),
      (snap) => {
        const data: any = snap.exists() ? snap.data() : null;
        const n = typeof data?.tickets === 'number' ? data.tickets : 0;
        setTicketsToday(n);
        console.debug('[tickets] countersByDay', todayId, 'exists:', snap.exists(), 'tickets:', n);
      },
      (err) => {
        console.warn('[tickets] countersByDay error', err);
        setTicketsToday(0);
      }
    );

    return () => { unsub(); };
  }, [uid, serverOffset]);

  useEffect(() => {
    // use local public asset for parallax shadow (not Firebase)
    setShadowUrl("/collage-shadow.png");

    const fs = getFirestore();
    const unsub = onSnapshot(doc(fs, "config", "currentMinigame"), async (snap) => {
      const data = snap.data();
      // Removed: if (!data?.storagePath) return;
      if (data && data.nextAt?.toMillis) {
        let ts = data.nextAt.toMillis();
        const snapToHour = new Date(ts);
        snapToHour.setMinutes(0, 0, 0);
        ts = snapToHour.getTime();

        const serverNow = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);
        if (ts <= serverNow) ts = nextLocal3hMsFrom(serverNow);
        setNextAtMs(ts);
      } else {
        const serverNow = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);
        setNextAtMs(nextLocal3hMsFrom(serverNow));
      }
      setMinigameResolved(false);
      try {
        if (data && data.storagePath) {
          const dl = await getDownloadURL(ref(storage, data.storagePath));
          setGameReady(false);
          setGameUrl(dl + `?v=${Date.now()}`);
        } else {
          setGameUrl(null);
          setGameReady(true);
        }
      } catch (e) {
        setGameUrl(null);
        setGameReady(true);
      } finally {
        setMinigameResolved(true);
      }
    });
    return () => unsub();
  }, []);

  // Mark collage as ready if no collage URL is set
  useEffect(() => {
    if (!url) setCollageReady(true);
  }, [url]);

  // Firestore schema expected (new):
  // doc: config/prizePools
  // {
  //   "level-00": {
  //     "item-01": { name: string, amount: number, image?: string },
  //     "item-02": { ... },
  //     collage?: string // optional per-level collage ("/prizes/..." | "prizes/..." | "https://...")
  //     totalRewards?: number // total number of cards to show for this level
  //   },
  //   "level-01": { ... }
  //   ...
  //   totalRewards?: number // optional fallback for all levels
  // }
  // Notes:
  // - image accepts Next.js public path starting with "/", Firebase Storage path, or https URL
  // - If no collage is set, the page falls back to Storage pattern `prizes/drop-XX.png`
  // Subscribe to Firestore for prize pool config
  useEffect(() => {
    const fs = getFirestore();
    const unsub = onSnapshot(doc(fs, 'config', 'prizePools'), async (snap) => {
      const data: any = snap.exists() ? snap.data() : null;
      // Expect structure: { "level-00": { "item-01": { name, amount, image }, ... }, "level-01": { ... }, ... }
      const levelEntries = Object.entries(data || {})
        .filter(([k, v]) => /^level-\d{2}$/i.test(k) && v && typeof v === 'object');
      // sort by level number asc
      levelEntries.sort((a, b) => parseInt(a[0].slice(6), 10) - parseInt(b[0].slice(6), 10));

      const levels: PrizeLevel[] = levelEntries.map(([_, levelObj]: [string, any]) => {
        // optional collage per level
        const collage = typeof levelObj?.collage === 'string' ? levelObj.collage : undefined;
        const lvlTotal = typeof levelObj?.totalRewards === 'number' ? levelObj.totalRewards : undefined;
        // items: keys like item-01
        const itemEntries = Object.entries(levelObj)
          .filter(([k, v]) => /^item-\d{2}$/i.test(k) && v && typeof v === 'object');
        itemEntries.sort((a, b) => parseInt(a[0].slice(5), 10) - parseInt(b[0].slice(5), 10));
        const items: PrizeItem[] = itemEntries.map(([, it]: [string, any]) => ({
          title: typeof it?.name === 'string' ? it.name : undefined,
          qty: typeof it?.amount === 'number' ? it.amount : undefined,
          image: typeof it?.image === 'string' ? it.image : undefined,
        }));
        return { collage, items, totalRewards: lvlTotal } as PrizeLevel;
      });

      setPrizeLevels(levels);
      // build per-level totals and set current totalRewards
      const totals = levels.map(lv => (typeof lv.totalRewards === 'number' ? lv.totalRewards! : (typeof (data?.totalRewards) === 'number' ? data.totalRewards : 0)));
      setLevelTotals(totals);
      const idxForTotal = levels.length > 0 ? Math.min(Math.max(0, poolLevel || 0), levels.length - 1) : 0;
      setTotalRewards(totals[idxForTotal] || 0);
      // Derive collagePaths from levels if present; otherwise keep existing fallback logic
      const paths = levels.map(lv => lv?.collage).filter((p): p is string => typeof p === 'string');
      setCollagePaths(paths.length > 0 ? paths : null);

      // Select items for current level (capped)
      if (levels.length > 0) {
        const idx = Math.min(Math.max(0, poolLevel || 0), levels.length - 1);
        const items = Array.isArray(levels[idx]?.items) ? levels[idx]!.items! : [];
        setPoolItems(items);
      } else {
        setPoolItems([]);
      }

      setPrizePoolLoaded(true);
    }, () => setPoolItems([]));
    return () => unsub();
  }, [poolLevel]);

  // Update poolItems when poolLevel changes and prizeLevels exists; also update totalRewards for current level
  useEffect(() => {
    if (!prizeLevels || prizeLevels.length === 0) return;
    const idx = Math.min(Math.max(0, poolLevel || 0), prizeLevels.length - 1);
    const items = Array.isArray(prizeLevels[idx]?.items) ? prizeLevels[idx]!.items! : [];
    setPoolItems(items);
    if (levelTotals && levelTotals.length > idx) {
      setTotalRewards(levelTotals[idx] || 0);
    }
  }, [poolLevel, prizeLevels, levelTotals]);

  // Dynamically resolve collage image based on current pool level and Firestore config
  useEffect(() => {
    let cancelled = false;
    const level = Math.max(0, poolLevel || 0);
    if (!poolLevelServerLoaded) {
      return () => { cancelled = true; };
    }

    async function resolveCollage() {
      try {
        setCollageReady(false);
        setError(null);
        // Choose candidates: explicit collagePaths entry, else fallback patterns
        let candidates: string[] = [];
        if (collagePaths && collagePaths.length > 0) {
          const idx = Math.min(level, collagePaths.length - 1);
          const c = collagePaths[idx];
          if (typeof c === 'string' && c) candidates = [c];
        } else {
          const idx2 = String(level).padStart(2, '0'); // 00, 01, 02, ...
          const idx1 = String(level);                  // 0, 1, 2, ...
          candidates = [
            `prizes/drop-${idx2}.png`,
            `prizes/drop-${idx1}.png`,
          ];
        }

        let finalUrl = '';
        for (const cand of candidates) {
          try {
            if (/^https?:\/\//i.test(cand)) { finalUrl = cand; break; }
            const u = await getCachedDownloadURL(cand);
            finalUrl = u; break;
          } catch (e) {
            // try next candidate
          }
        }
        console.debug('[collage] level', level, 'candidates', candidates, 'resolved', Boolean(finalUrl));
        if (!cancelled) {
          const targetUrl = finalUrl || '/drop-error.png';
          try {
            // Preload and decode before swapping src to avoid visible pop-in
            await new Promise<void>((resolve) => {
              const img = new window.Image();
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = targetUrl;
              // If supported, prefer decode for layout-ready pixels
              // @ts-ignore
              if (img.decode) { /* optional */ }
            });
          } catch {}
          if (!cancelled) {
            setUrl(targetUrl);
            setError(null);
            setCollageReady(true);
          }
        }
      } catch (e) {
        if (!cancelled) {
          const targetUrl = '/drop-error.png';
          try {
            await new Promise<void>((resolve) => {
              const img = new window.Image();
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = targetUrl;
              // @ts-ignore
              if (img.decode) { /* optional */ }
            });
          } catch {}
          if (!cancelled) {
            setUrl(targetUrl);
            setError(null);
            setCollageReady(true);
          }
        }
      }
    }

    resolveCollage();
    return () => { cancelled = true; };
  }, [poolLevel, collagePaths, poolLevelServerLoaded]);


  // Resolve storage paths to URLs when poolItems changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: { title?: string; qty?: number; url: string }[] = [];
      for (const it of poolItems) {
        try {
          const title = it.title; const qty = it.qty;
          const img = it.image || '';
          let url = '';
          const candidates: string[] = [];
          if (img) candidates.push(img);
          const fn = toSlugFilename(title);
          if (fn) {
            candidates.push(`/prizes/${fn}`);      // Next.js public asset
            candidates.push(`prizes/${fn}`);       // Firebase Storage fallback
          }
          for (const c of candidates) {
            try {
              url = await getCachedDownloadURL(c);
              if (url) break;
            } catch {/* try next */}
          }
          if (!url) url = '/prizes/placeholder.png';
          out.push({ title, qty, url });
        } catch { /* ignore single item errors */ }
      }
      // Append not-disclosed placeholders up to totalRewards
      try {
        const currentTotal = out.reduce((acc, it) => acc + scaledQty(it.qty), 0);
        const missing = Math.max(0, (totalRewards || 0) - currentTotal);
        if (missing > 0) {
          const placeholderUrl = '/prizes/not-disclosed.png';
          for (let i = 0; i < missing; i++) {
            out.push({ title: 'Not disclosed', qty: 1, url: placeholderUrl });
          }
        }
      } catch {}
      if (!cancelled) setPoolResolved(out);
    })();
    return () => { cancelled = true; };
  }, [poolItems, totalRewards]);

  useEffect(() => {
    if (!nextAtMs) { setRemaining(""); return; }
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - perfBaseRef.current;
      const serverNow = serverNowBaseRef.current + elapsed; // ms
      const secNowMs = Math.floor(serverNow / 1000) * 1000; // gemeinsame Sekundentaktung
      setRemaining(fmt(nextAtMs - secNowMs));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [nextAtMs]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const elapsed = performance.now() - perfBaseRef.current;
      const serverNow = serverNowBaseRef.current + elapsed; // ms
      const secNowMs = Math.floor(serverNow / 1000) * 1000; // gemeinsame Sekundentaktung
      setUntil20(fmtHMS(msUntil20From(secNowMs)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = areaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Normalized in range [-1, 1]
    const nx = (e.clientX - cx) / (rect.width / 2);
    const ny = (e.clientY - cy) / (rect.height / 2);
    const max = 10; // px, reduced effect (half as strong)
    const x = Math.max(-1, Math.min(1, nx)) * max;
    const y = Math.max(-1, Math.min(1, ny)) * max;
    setOffset({ x, y });
  };



  // Auto-open profile popup if profile is incomplete
  useEffect(() => {
    if (authReady && mustComplete) {
      setShowAccount(true);
    }
  }, [authReady, mustComplete]);

  // Auto-close profile popup once user is ready and no completion needed
  useEffect(() => {
    if (authReady && !mustComplete) {
      setShowAccount(false);
    }
  }, [authReady, mustComplete]);

  // Close Account modal when profile panel signals success
  useEffect(() => {
    const onClose = () => {
      try { setShowAccount(false); } catch {}
    };
    const onMsg = (e: MessageEvent) => {
      if (e?.data && e.data.type === 'drop:account-close') onClose();
    };
    window.addEventListener('drop:account-close' as any, onClose);
    window.addEventListener('message', onMsg);
    return () => {
      window.removeEventListener('drop:account-close' as any, onClose);
      window.removeEventListener('message', onMsg);
    };
  }, []);
  return (
    <>
    {loading && (
      <div className="fixed inset-0 bg-black flex items-center justify-center z-[9999]">
        <div className="w-12 h-12 border-4 border-white/40 border-t-white rounded-full animate-spin" />
      </div>
    )}
    <div className="h-screen w-screen overflow-y-scroll overflow-x-hidden snap-y snap-mandatory">
      <div className="relative h-screen w-screen bg-black text-white flex flex-col overflow-hidden snap-start snap-always">
        {/* Tiny scroll banner above top bar */}
        <div className="absolute top-0 left-0 right-0 h-6 bg-black/90 text-white z-30">
          <div className="small-ticker-wrap w-full h-full">
            <div className="small-ticker-track">
              {smallTicker}
            </div>
          </div>
        </div>
      {/* Animated red gradient over black */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: `
  radial-gradient(2000px 1500px at 20% -5%,   rgba(255,60,60,0.44), rgba(0,0,0,0) 78%),
  radial-gradient(2200px 1600px at 80% 5%,    rgba(220,40,40,0.38), rgba(0,0,0,0) 75%),
  radial-gradient(2400px 1800px at 50% 115%,  rgba(244,63,94,0.40), rgba(0,0,0,0) 76%),
  radial-gradient(1600px 1200px at 10% 85%,   rgba(255,70,70,0.40), rgba(0,0,0,0) 76%),
  radial-gradient(1800px 1300px at 90% 80%,   rgba(235,50,60,0.36), rgba(0,0,0,0) 76%),
  radial-gradient(2000px 1400px at 50% 40%,   rgba(255,0,0,0.34),   rgba(0,0,0,0) 82%),
  radial-gradient(1500px 1100px at 5% 50%,    rgba(255,80,80,0.34), rgba(0,0,0,0) 75%),
  /* two mega-blobs left/right to stabilize ~50% red coverage */
  radial-gradient(3000px 2200px at -10% 50%,  rgba(220,30,30,0.06), rgba(0,0,0,0) 82%),
  radial-gradient(3000px 2200px at 110% 50%,  rgba(220,30,30,0.06), rgba(0,0,0,0) 82%)
`,
          backgroundSize: '160% 160%, 160% 160%, 160% 160%, 170% 170%, 170% 170%, 180% 180%, 160% 160%, 200% 200%, 200% 200%',
          backgroundPosition: '0% 0%, 100% 0%, 50% 100%, 10% 85%, 90% 80%, 50% 40%, 5% 50%, 0% 50%, 100% 50%',
          animation: 'gradientShift 28s ease-in-out infinite alternate'
        }}
      />
      {/* Global scanline overlay */}
      <div aria-hidden className="absolute inset-0 z-[1] pointer-events-none scanlines" />

        {/* Topbar */}
        <div className="absolute top-6 left-0 right-0 h-14 px-4 py-2 bg-black z-20">
          <div className="h-full flex items-center justify-between gap-3">
            <img src="/logo.png" alt="DROP" className={`h-4 w-auto select-none drop-logo drop-anim-${logoAnim}`} />
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowDaily(true)}
                aria-label="Täglicher Bonus"
                className="h-8 w-8 flex items-center justify-center text-white hover:opacity-90"
              >
                <svg className="h-8 w-8" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2" ry="2" />
                  <line x1="16" y1="3" x2="16" y2="7" />
                  <line x1="8" y1="3" x2="8" y2="7" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                </svg>
              </button>
              <img src="/bell.png" alt="Benachrichtigungen" className="h-8 w-8 select-none cursor-pointer" />
              {uid && (
                <button onClick={() => setShowItems(true)} aria-label="Items">
                  <img src="/items-icon.png" alt="Items" className="h-8 w-8 select-none cursor-pointer" />
                </button>
              )}
              <button onClick={() => setShowAccount(true)} aria-label="Account">
                <img
                  src={uid && profilePhoto ? profilePhoto : "/profile-icon.png"}
                  alt="Profil"
                  className="h-8 w-8 select-none cursor-pointer rounded-full object-cover"
                />
              </button>
            </div>
          </div>
        </div>

        {/* Coins badge top-center */}
        <div className={`absolute top-6 left-1/2 -translate-x-1/2 h-14 flex items-center ${showDaily ? 'z-[60]' : 'z-20'} pointer-events-none`}>
          <div className="flex items-center gap-3">
            {/* Coins */}
            <div ref={coinBadgeRef} className="flex items-center gap-2 rounded-full bg-white text-black text-sm font-semibold shadow-sm border border-black/10 select-none px-4 py-1.5">
              <span aria-hidden className="text-xl leading-none">💎</span>
              <span className="font-semibold text-base tabular-nums">{coins}</span>
            </div>
            {/* Streak */}
            <div
              onClick={() => setShowStreakView(true)}
              className="flex items-center gap-2 rounded-full bg-white text-black text-sm font-semibold shadow-sm border border-black/10 select-none px-4 py-1.5 pointer-events-auto cursor-pointer hover:opacity-90"
              role="button"
              aria-label="Streak anzeigen"
            >
              <span className="text-lg leading-none">🔥</span>
              <span className="font-semibold text-base tabular-nums">{Math.max(0, streak || 0)}</span>
            </div>
          </div>
        </div>
      {/* Streak View Modal */}
      {showStreakView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowStreakView(false)} />
          <div className="relative bg-white text-black rounded-3xl shadow-xl w-[min(92vw,560px)] p-6 flex flex-col items-center justify-center">
            <button onClick={() => setShowStreakView(false)} className="absolute top-3 right-3 text-black/60 hover:text-black">✕</button>
            <div className="text-[9rem] leading-none select-none" aria-hidden>🔥</div>
            <div className="mt-4 text-4xl font-extrabold tabular-nums">{Math.max(0, streak || 0)}</div>
            <div className="text-sm text-black/60 mt-1">Tage</div>
          </div>
        </div>
      )}


      {/* Main viewport content: ads + center column with proportional layout */}
      <div className="relative z-10 flex-1 w-full px-4 overflow-hidden flex">
        {/* Left ad (desktop only) */}
        <div className="hidden xl:flex mt-[-40px] bg-gray-400 w-[300px] h-[250px] self-center items-center justify-center text-black/70 text-xs select-none">
          Anzeige 300x250
        </div>

        {/* Center column: collage fills most, minigame pinned near bottom */}
        <div className="flex-1 h-full flex flex-col items-stretch pb-6">
          {/* Collage area (flex grows) */}
          <div
            ref={areaRef}
            onMouseMove={handleMouseMove}
            className="w-full flex-1 min-h-0 flex items-center justify-center"
          >
            <div
              className="flex flex-col items-center mt-8"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
            >
              <div className="px-4 py-1.5 rounded-full bg-white text-black text-sm font-semibold shadow-sm border border-black/10 select-none mb-2">
                {ticketsToday === 0 ? (
                  <>0 Tickets</>
                ) : (
                  <>
                    <span className="tabular-nums">{ticketsToday}</span> Tickets
                  </>
                )}
              </div>
              <div
                className="self-center flex flex-col items-center justify-center mx-auto"
                style={{ maxWidth: 'min(74vw, 720px)', maxHeight: '60vh' }}
              >
                <div className="relative inline-block">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center"
                  >
                    <div
                      className="rounded-full blur-xl opacity-95"
                      style={{
                        width: '100%',
                        height: '80%',
                        background: 'radial-gradient(circle at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.7) 40%, rgba(0,0,0,0.4) 65%, rgba(0,0,0,0.15) 80%, rgba(0,0,0,0) 88%)'
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPool(true)}
                    aria-label="Collage öffnen"
                    className="relative block cursor-pointer focus:outline-none focus:ring-0 rounded"
                  >
                    {url ? (
                      <img
                        src={url}
                        alt="Preise"
                        onLoad={() => { /* preloaded; no-op */ }}
                        onError={() => { setUrl('/drop-error.png'); }}
                        className="pointer-events-none block mx-auto object-contain max-w-full max-h-[60vh] drop-shadow-2xl select-none opacity-100"
                      />
                    ) : (
                      <div className="block mx-auto max-w-full max-h-[60vh] aspect-[16/9] rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-200 via-white to-neutral-100 opacity-100" />
                    )}
                  </button>
                </div>
                <div className="mt-2 px-4 py-1.5 rounded-full bg-white text-black text-sm font-semibold shadow-sm border border-black/10 select-none">
                  <span className="tabular-nums">{until20 || fmtHMS(msUntil20From(Math.floor((serverNowBaseRef.current) / 1000) * 1000))}</span>
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-white/80">{error}</p>}
          </div>

          {/* Minigame — Neon Hologram */}
          <div className="w-full flex flex-col items-center flex-none mt-auto mb-6">
          <div className="relative aspect-[921/177] h-[clamp(120px,18vh,160px)] w-[50vw] max-w-full">
            <NeonHoloCard
              title="tap-rush"
              subtitle="Tippe die richtige Zelle"
              timeLabel={remaining || 'Jetzt spielen'}
              img={null}
              onImgLoad={() => setGameReady(true)}
              onImgError={() => setGameReady(true)}
            />
          </div>
          </div>
        </div>

        {/* Right ad (desktop only) */}
        <div className="hidden xl:flex mt-[-40px] bg-gray-400 w-[300px] h-[250px] self-center items-center justify-center text-black/70 text-xs select-none">
          Anzeige 300x250
        </div>
      </div>

      {/* --- Temporary Test Button for grantTickets --- */}
      <div className="absolute bottom-6 left-6 z-50">
        <button
          onClick={async () => {
            try {
              const fn = httpsCallable(getFunctions(undefined, "us-central1"), "grantTickets");
              const res: any = await fn({ amount: 5, grantId: `manual-${Date.now()}` });
              console.log("grantTickets result", res.data);
            } catch (e) {
              console.error(e);
            }
          }}
          className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg"
        >
          Test Grant Tickets
        </button>
      </div>
      {/* Prize Pool Modal */}
      {showPool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowPool(false)} />
          <div className="relative bg-white text-black rounded-2xl shadow-xl w-[min(92vw,980px)] max-h-[84vh] p-4 sm:p-6 overflow-hidden">
            <div className="flex items-start justify-end gap-3">
              <button onClick={() => setShowPool(false)} className="text-black/60 hover:text-black">✕</button>
            </div>
            {/* Centered level bar below header: 50% modal width */}
            {(() => {
              const total = ticketsTotalToday || 0;
              const level = Math.max(0, poolLevel || 0);
              const within = total % 100; // 0..99
              const pct = Math.max(0, Math.min(100, within));
              return (
                <div className="mt-2 mb-8 w-full">
                  <div className="mx-auto w-1/2">
                    <div className="flex items-baseline justify-between text-sm text-black/70">
                      <span>Level <span className="tabular-nums font-bold text-base">{level}</span></span>
                      <span><span className="tabular-nums">{within}/100</span> Tickets</span>
                    </div>
                    <div className="mt-2 h-4 rounded-full bg-black/10 overflow-hidden ring-1 ring-black/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-rose-500 via-red-500 to-orange-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <p className="mt-2 text-center text-xs text-black/60">Sammle Tickets, um den Pool zu füllen und bessere Preise freizuschalten.</p>
                </div>
              );
            })()}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto pr-1" style={{ maxHeight: '68vh' }}>
              {poolResolved.length === 0 && (
                <>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={`pp-demo-${i}`} className="relative flex flex-col items-center">
                      <div className="aspect-[64/100] w-full">
                        <GiftCard3D title="Titel">
                          <div className="absolute top-2 left-2 bg-black/70 text-white text-[11px] px-2 py-0.5 rounded-full">×1</div>
                        </GiftCard3D>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {poolResolved.map((it, idx) => (
                <div key={idx} className="relative flex flex-col items-center">
                  <div className="aspect-[64/100] w-full">
                    <GiftCard3D title={it.title || "Titel"} img={it.url}>
                      {it.title !== 'Not disclosed' && (
                        <div className="absolute top-2 left-2 bg-black/70 text-white text-[11px] px-2 py-0.5 rounded-full">
                          ×{scaledQty(it.qty)}
                        </div>
                      )}
                    </GiftCard3D>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Daily Login Bonus — layout only */}
      {showDaily && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDaily(false)} />
          <div className="relative bg-white text-black rounded-2xl shadow-xl w-[min(78vw,720px)] max-h-[86vh] p-4 sm:p-5 overflow-hidden">
            <div className="sticky top-0 z-10 bg-white pt-1 pb-2 -mx-4 sm:-mx-5 px-4 sm:px-5 flex items-start justify-end">
              <button onClick={() => setShowDaily(false)} className="text-black/60 hover:text-black">✕</button>
            </div>
            {/* scroll container */}
            <div className="mt-2 overflow-y-auto" style={{ maxHeight: '70vh' }}>
              {/* Streak progress 1–30 */}
              <div className="mt-3 max-w-3xl mx-auto">
                <div className="grid grid-cols-7 gap-1 items-stretch justify-items-stretch">
                  {dailyRewards.map((r, i) => {
                    // 14 Tage, 2 Reihen à 7
                    const day = i + 1; // 1..30
                    const len = dailyRewards.length; // 30
                    const pos = ((Math.max(1, streak) - 1) % len) + 1; // 1..len
                    const isToday = streak > 0 ? day === pos : day === 1;
                    const isClaimed = isToday && claimedToday;
                    const isDone = (streak > 0 && day < pos) || isClaimed;
                    return (
                      <div
                        key={i}
                        className={`relative flex flex-col items-center justify-center rounded-xl border aspect-[4/3] w-full h-full min-w-0 p-1 sm:p-1.5 text-[10px] sm:text-xs ${
                          isDone
                            ? 'bg-emerald-100 border-emerald-300'
                            : isToday
                            ? 'bg-amber-100 border-amber-300'
                            : 'bg-white border-black/10'
                        }`}
                      >
                        <div className={`text-[10px] sm:text-[11px] uppercase tracking-wide ${isToday ? 'text-amber-700' : 'text-black/50'}`}>
                          Tag {day}
                        </div>
                        <div className="font-bold text-sm sm:text-base">+{r} <span ref={isToday ? dailySourceGemRef : undefined}>💎</span></div>
                        {isDone && (
                          <div className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                            Eingelöst
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {/* Claim row (moved outside scroll container, always visible at bottom of modal card) */}
            {/* invisible anchor near claim area for gem spawn */}
            <div ref={testAnchorRef} className="sr-only" aria-hidden />
            <div className="mt-4 sm:mt-6 flex items-center justify-center gap-3">
              <button
                disabled={!uid || claimedToday || claimLoading}
                className={`px-4 py-2 rounded-full text-white font-semibold ${(!uid || claimedToday || claimLoading) ? 'bg-black/30 cursor-not-allowed' : 'bg-black hover:opacity-90'}`}
                onClick={() => {
                  const n = todaysRewardCount();
                  playGemFly(n, dailySourceGemRef.current);
                  handleClaim();
                }}
              >
                {claimedToday ? 'Heute bereits abgeholt' : (claimLoading ? 'Wird abgeholt…' : 'Heute abholen')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { if (!mustComplete) setShowAccount(false); }} />
          <div className="relative bg-black text-white rounded-2xl shadow-xl w-[min(92vw,480px)] max-h-[80vh] p-0 overflow-hidden border border-white/10">
            <button onClick={() => { if (!mustComplete) setShowAccount(false); }} className="absolute top-3 right-3 z-10 text-white/70 hover:text-white">✕</button>
            <div className="w-full h-full overflow-y-auto">
              <AccountPanel embedded />
            </div>
          </div>
        </div>
      )}
      {uid && showItems && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowItems(false)} />
          <div className="relative bg-white text-black rounded-2xl shadow-xl w-[min(92vw,480px)] max-h-[80vh] px-6 pb-6 pt-12 overflow-y-auto">
            <button onClick={() => setShowItems(false)} className="absolute top-3 right-3 text-black/60 hover:text-black">✕</button>
            <div className="space-y-3">
              {buyError && <div className="p-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded">{buyError}</div>}
              {shopItems.filter(it => (it.active ?? true)).map((it) => {
                const owned = itemsOwned[it.id] || 0; // echte Anzahl
                const canBuy = (coins || 0) >= it.price && owned < 1; // kaufen nur, wenn noch keins
                const busy = buyBusy[it.id];
                const nowMs = nowMsItems || (serverNowBaseRef.current + (performance.now() - perfBaseRef.current));
                const eff = effects[it.id];
                const isActive = !!eff?.active && typeof eff?.untilMs === 'number' && eff.untilMs > nowMs;
                const remMs = isActive && eff?.untilMs ? Math.max(0, eff.untilMs - nowMs) : 0;
                const remLabel = isActive && eff?.untilMs ? fmt(remMs) : null;
                return (
                  <div
                    key={it.id}
                    className={`p-4 border rounded-2xl flex items-center justify-between gap-3 ${isActive ? 'bg-emerald-100 border-emerald-300 active-glow active-anim active-bling' : 'bg-white border-black/10'}`}
                  >
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        {it.name}
                      </div>
                      <div className="text-sm text-gray-700">
                        {it.desc}
                      </div>
                      <div className="mt-1 text-xs text-gray-700">
                        Besitz: <span className="tabular-nums">{owned}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isActive ? (
                        <span className="px-3 py-1.5 rounded-full text-[12px] font-semibold bg-black text-white border border-emerald-700 tabular-nums">
                          Aktiv{remLabel ? ` · ${remLabel}` : ''}
                        </span>
                      ) : owned < 1 ? (
                        <button
                          onClick={() => buyItem(it.id)}
                          disabled={!uid || busy || !canBuy}
                          className={`px-3 py-1.5 rounded-full text-white text-sm font-semibold ${(!uid || busy || !canBuy) ? 'bg-black/30 cursor-not-allowed' : 'bg-black hover:opacity-90'}`}
                        >
                          {busy ? 'Kaufen…' : `Kaufen (${it.price}💎)`}
                        </button>
                      ) : (
                        <button
                          onClick={() => useItem(it.id)}
                          disabled={!uid || busy}
                          className={`px-3 py-1.5 rounded-full text-white text-sm font-semibold ${(!uid || busy) ? 'bg-black/30 cursor-not-allowed' : 'bg-black hover:opacity-90'}`}
                        >
                          {busy ? 'Verwenden…' : 'Verwenden'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <style jsx global>{`
        /* --- active item highlight --- */
        .active-glow{
          position: relative;
          overflow: hidden;
        }
        .active-glow::after{
          content:"";
          position:absolute; inset:-2px;
          border-radius: 1rem; /* match rounded-2xl */
          box-shadow: 0 0 0 0 rgba(16,185,129,0.0), 0 0 0 0 rgba(16,185,129,0.0), 0 0 0 0 rgba(16,185,129,0.0);
          pointer-events:none;
          animation: activePulse 1.8s ease-in-out infinite;
        }
        @keyframes activePulse {
          0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.55), 0 0 24px 0 rgba(16,185,129,0.35), inset 0 0 0 0 rgba(16,185,129,0.0); }
          50%  { box-shadow: 0 0 0 6px rgba(16,185,129,0.00), 0 0 32px 4px rgba(16,185,129,0.45), inset 0 0 0 0 rgba(16,185,129,0.0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.55), 0 0 24px 0 rgba(16,185,129,0.35), inset 0 0 0 0 rgba(16,185,129,0.0); }
        }
        /* stronger visible animation */
        .active-anim { animation: activeBgPulse 1.4s ease-in-out infinite; }
        @keyframes activeBgPulse { 0%,100%{ transform: scale(1); } 50%{ transform: scale(1.02); } }
        .active-bling{ position: relative; }
        .active-bling::before{
          content:""; position:absolute; inset:0; border-radius:1rem; /* match rounded-2xl */ pointer-events:none;
          background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%);
          transform: translateX(-120%);
          animation: activeSheen 2.2s ease-in-out infinite;
        }
        @keyframes activeSheen { 0%{ transform: translateX(-120%); } 100%{ transform: translateX(120%); } }
        :global(.small-ticker-wrap){ position:relative; overflow:hidden; }
        :global(.small-ticker-track){ display:inline-block; white-space:nowrap; padding-left:100%; animation: tickerScroll 20s linear infinite; }
        @keyframes tickerScroll {
          0%{ transform: translateX(0%); }
          100%{ transform: translateX(-100%); }
        }
        /* --- skeleton placeholders for Prize Pool --- */
        :global(.skeleton-shine){
          position: relative;
          background: linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.12) 37%, rgba(0,0,0,0.06) 63%);
          background-size: 400% 100%;
          animation: skeletonLoading 1.1s ease-in-out infinite;
        }
        :global(.skeleton-shine\/soft){
          position: relative;
          background: linear-gradient(90deg, rgba(0,0,0,0.04) 25%, rgba(0,0,0,0.08) 37%, rgba(0,0,0,0.04) 63%);
          background-size: 400% 100%;
          animation: skeletonLoading 1.1s ease-in-out infinite;
        }
        @keyframes skeletonLoading {
          0% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        /* 3D tilt for the hologram card */
        :global(.holo .card) { transform: rotateX(calc(var(--rx,0) * 1deg)) rotateY(calc(var(--ry,0) * 1deg)); transform-style: preserve-3d; transition: transform 120ms ease; }
        :global(.gift .gift-card){ transform: rotateX(calc(var(--rx,0) * 1deg)) rotateY(calc(var(--ry,0) * 1deg)); transform-style: preserve-3d; transition: transform 120ms ease; }
        :global(.gift .parallax){
          transform: translate3d(var(--tx,0px), var(--ty,0px), var(--dz,0));
          transition: transform 120ms ease;
        }
        @keyframes holoBorder { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(360deg); } }
        .no-scrollbar { scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        :global(.ticker-wrap) { position: relative; overflow: hidden; }
        :global(.ticker-track) { display: inline-flex; }
        :global(.animate-cta-shine) { position: relative; overflow: hidden; }
        :global(.animate-cta-shine)::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.6) 45%, transparent 90%);
          transform: translateX(-120%);
          animation: ctaShine 2.4s ease-in-out infinite;
        }
        /* --- scanlines overlay --- */
        :global(.scanlines){
          pointer-events:none;
          background-image:repeating-linear-gradient(to bottom, rgba(255,255,255,0.6) 0 1px, transparent 1px 3px);
          background-size:100% 3px;
          opacity:0.07;
          animation:scanDrift 12s linear infinite;
        }
        @keyframes scanDrift{0%{background-position:0 0}100%{background-position:0 12px}}
        @media (prefers-reduced-motion: reduce){ :global(.scanlines){ animation:none !important; } }
        /* --- drop logo animation --- */
        :global(.drop-logo) {
          transform-origin: left center;
        }
        /* six variants; each animates early, then idles */
        :global(.drop-anim-0) { animation: dropLogoA 20s cubic-bezier(.22,.61,.36,1) infinite; }
        :global(.drop-anim-1) { animation: dropLogoB 20s cubic-bezier(.22,.61,.36,1) infinite; }
        :global(.drop-anim-2) { animation: dropLogoC 20s cubic-bezier(.22,.61,.36,1) infinite; }
        :global(.drop-anim-3) { animation: dropLogoD 20s cubic-bezier(.22,.61,.36,1) infinite; }
        :global(.drop-anim-4) { animation: dropLogoE 20s cubic-bezier(.22,.61,.36,1) infinite; }
        :global(.drop-anim-5) { animation: dropLogoG 20s cubic-bezier(.22,.61,.36,1) infinite; }

        @keyframes dropLogoA {
          0%   { transform: translateY(0) rotate(0deg) scale(1); }
          2%   { transform: translateY(-1.5px) rotate(-2deg) scale(1.04); }
          4%   { transform: translateY(0) rotate(0deg) scale(1); }
          6%   { transform: translateY(1.5px) rotate(2deg) scale(1.03); }
          8%   { transform: translateY(0) rotate(0deg) scale(1); }
          100% { transform: translateY(0) rotate(0deg) scale(1); }
        }
        @keyframes dropLogoB {
          0%   { transform: translateX(0) skewX(0deg) scale(1); }
          2%   { transform: translateX(2px) skewX(6deg)  scale(1.03); }
          4%   { transform: translateX(-1px) skewX(-4deg) scale(1.02); }
          6%   { transform: translateX(1px) skewX(2deg)  scale(1.01); }
          8%   { transform: translateX(0) skewX(0deg)  scale(1); }
          100% { transform: translateX(0) skewX(0deg)  scale(1); }
        }
        @keyframes dropLogoC {
          0%   { transform: scale(1) rotate(0deg); filter: brightness(1) saturate(1) drop-shadow(0 0 0 rgba(255,255,255,0)); }
          2.5% { transform: scale(1.06) rotate(0.5deg); filter: brightness(1.6) saturate(1.2) drop-shadow(0 0 10px rgba(255,255,255,0.6)); }
          5%   { transform: scale(1) rotate(0deg);   filter: brightness(1) saturate(1) drop-shadow(0 0 0 rgba(255,255,255,0)); }
          100% { transform: scale(1) rotate(0deg);   filter: brightness(1) saturate(1) drop-shadow(0 0 0 rgba(255,255,255,0)); }
        }
        @keyframes dropLogoD {
          0%   { transform: translateY(0) scale(1); filter: brightness(1); }
          3%   { transform: translateY(-3px) scale(1.06); filter: brightness(1.3); }
          6%   { transform: translateY(0) scale(1.02); }
          9%   { transform: translateY(-2px) scale(1.04); }
          12%  { transform: translateY(0) scale(1); }
          100% { transform: translateY(0) scale(1); }
        }
        @keyframes dropLogoE {
          0%   { transform: rotate(0deg) scale(1); filter: drop-shadow(0 0 0 rgba(255,255,255,0)); }
          2.5% { transform: rotate(-2deg) scale(1.03); filter: drop-shadow(0 0 8px rgba(255,255,255,0.5)); }
          5%   { transform: rotate(2deg) scale(1.02); }
          7.5% { transform: rotate(0deg) scale(1); }
          100% { transform: rotate(0deg) scale(1); }
        }
        @keyframes dropLogoG {
          0%   { filter: blur(0px) contrast(1) saturate(1); }
          2%   { filter: blur(1.2px) contrast(1.12) saturate(1.18); }
          4%   { filter: blur(0px) contrast(1.06) saturate(1.06); }
          6%   { filter: blur(0px) contrast(1) saturate(1); }
          100% { filter: blur(0px) contrast(1) saturate(1); }
        }


        @media (prefers-reduced-motion: reduce) {
          :global(.drop-logo), :global(.drop-anim-0), :global(.drop-anim-1), :global(.drop-anim-2), :global(.drop-anim-3), :global(.drop-anim-4), :global(.drop-anim-5) { animation: none !important; }
        }
        /* --- end drop logo animation --- */
        @keyframes ctaShine { 0% { transform: translateX(-120%);} 60% { transform: translateX(120%);} 100% { transform: translateX(120%);} }
        @keyframes gradientShift {
          0%   { background-position: 0% 0%, 100% 0%, 50% 100%; }
          50%  { background-position: 20% 30%, 80% 10%, 45% 80%; }
          100% { background-position: 100% 100%, 0% 100%, 50% 0%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .no-motion { animation: none !important; }
        }
      `}</style>
    {/* Confetti burst overlay */}
    {confettiAt !== 0 && (<ConfettiBurst onDone={() => { setConfettiAt(0); }} />)}
    </div>
    {/* Second page below: full-screen black */}
    <section className="relative w-screen h-screen bg-red-500 snap-start snap-always">
      <div className="absolute top-0 left-0 right-0 z-20">
        <div className="ticker-wrap h-40 bg-white text-black overflow-hidden border-b border-black/10">
          <div ref={trackRef} className="ticker-track h-full flex items-center will-change-transform">
            <span className="block text-[8.5rem] leading-[10rem] whitespace-nowrap pl-24 pr-24 select-none">
              {tickerContent}
            </span>
          </div>
        </div>
      </div>
      <div className="pt-10 h-full" />
    </section>
  </div>
    </>
  );
}