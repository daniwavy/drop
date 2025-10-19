"use client";
import React from "react"; // React import hinzugefügt
// Small global declaration for the dev setter used by the Test Terminal
declare global {
  interface Window {
    __drop_setGridCount?: (n: number) => void;
  }

}
import { useEffect, useLayoutEffect, useState, useRef, useMemo } from "react";
import CardFrame from '../../components/CardFrame';
import RandomBackgrounds from '../../components/RandomBackgrounds';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
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
// --- Mark that a minigame was started from the Drop screen (client-side token) ---
function markDropStart() {
  try { 
    const now = Date.now();
    sessionStorage.setItem('drop.startedFromDrop', String(now)); 
    console.log('[markDropStart] Token set:', now);
  } catch (e) {
    console.error('[markDropStart] Failed to set token:', e);
  }
}
function withAvatarCache(u?: string | null) {
  if (!u) return null;
  const sep = u.includes('?') ? '&' : '?';
  return `${u}${sep}wk=${weekStamp()}`;
}

const berlinPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false, // FIX: Force 24-hour format instead of 12-hour (8:45 vs 20:45)
});

function berlinPartsFromMs(ms: number) {
  const parts = berlinPartsFormatter.formatToParts(new Date(ms));
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return {
    year: Number(map.year || '0'),
    month: Number(map.month || '0'),
    day: Number(map.day || '0'),
    hour: Number(map.hour || '0'),
    minute: Number(map.minute || '0'),
    second: Number(map.second || '0'),
  };
}

function formatBerlinDay(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function shiftBerlinDay(parts: { year: number; month: number; day: number }, delta: number) {
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  base.setUTCDate(base.getUTCDate() + delta);
  return { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, day: base.getUTCDate() };
}

function raffleCollectionDateIdFromMs(ms: number): string {
  const parts = berlinPartsFromMs(ms);
  const minutes = parts.hour * 60 + parts.minute + parts.second / 60;
  const cutoff = 20 * 60;
  let target = { year: parts.year, month: parts.month, day: parts.day };
  if (minutes >= cutoff) {
    target = shiftBerlinDay(target, 1);
  }
  return formatBerlinDay(target);
}

function raffleDrawDateIdFromMs(ms: number): string {
  const parts = berlinPartsFromMs(ms);
  const minutes = parts.hour * 60 + parts.minute + parts.second / 60;
  const cutoff = 20 * 60;
  let target = { year: parts.year, month: parts.month, day: parts.day };
  if (minutes < cutoff) {
    target = shiftBerlinDay(target, -1);
  }
  return formatBerlinDay(target);
}

function winnersDisplayDateIdFromMs(ms: number): string {
  const parts = berlinPartsFromMs(ms);
  // NEW LOGIC: Show YESTERDAY's winners by default, only show TODAY's after 20:15
  const minutes = parts.hour * 60 + parts.minute;
  const cutoff = 20 * 60 + 15; // 20:15 Berlin time
  let target = { year: parts.year, month: parts.month, day: parts.day };
  
  // Before 20:15: Show yesterday's winners (because today's raffle hasn't happened yet)
  // After 20:15: Show today's winners (new raffle results available)
  if (minutes < cutoff) {
    target = shiftBerlinDay(target, -1); // Show yesterday's winners before 20:15
  }
  // After 20:15: show today's winners (default = today)
  
  // Debug logging for winner display timing
  const timeStr = `${String(parts.hour).padStart(2,'0')}:${String(parts.minute).padStart(2,'0')}:${String(parts.second).padStart(2,'0')}`;
  const resultDate = formatBerlinDay(target);
  console.log(`[winnersDisplayDateIdFromMs] NEW LOGIC Berlin: ${timeStr}, minutes: ${minutes}, < ${cutoff}? ${minutes < cutoff}, result: ${resultDate}`);
  
  return resultDate;
}
import { getFirestore, doc, onSnapshot, getDoc, getDocFromServer, runTransaction, serverTimestamp, collectionGroup, query as fsQuery, where, getDocs, documentId, writeBatch, collection, setDoc } from "firebase/firestore";
// --- Raffle Test Terminal (client-only, read-only) ---
function RaffleTestTerminal({
  onClose,
  forceRaffleWindow, 
  onForceRaffleWindowChange
}: {
  onClose: () => void;
  forceRaffleWindow: boolean;
  onForceRaffleWindowChange: (next: boolean) => void;
}) {
  const [dateId, setDateId] = useState<string>(() => raffleCollectionDateIdFromMs(Date.now()));
  const [seed, setSeed] = useState<string>(() => Math.random().toString(36).slice(2, 10));
  const [prizesText, setPrizesText] = useState<string>('[{"amount":5,"count":10},{"amount":20,"count":2}]');
  const [entrants, setEntrants] = useState<Array<{ uid: string; w: number }>>([]);
  const [winners, setWinners] = useState<Array<{ uid: string; amount: number }>>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [seeding, setSeeding] = useState<boolean>(false);
  const [seedInfo, setSeedInfo] = useState<{ code?: string; message?: string; debug?: string } | null>(null);
  const [raffleInfo, setRaffleInfo] = useState<{ dateId?: string; levelKey?: string; winners?: Record<string, { name: string; prize: string }> } | null>(null);
  const [raffleBusy, setRaffleBusy] = useState(false);
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantInfo, setGrantInfo] = useState<string | null>(null);

  // Toggle to show/hide section dividers (controlled from the test terminal)
  const [rtShowDividers, setRtShowDividers] = useState<boolean>(() => {
    try {
      return document?.documentElement?.getAttribute('data-show-section-dividers') === 'true';
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (rtShowDividers) {
        document.documentElement.setAttribute('data-show-section-dividers', 'true');
      } else {
        document.documentElement.removeAttribute('data-show-section-dividers');
      }
    } catch (e) {
      // noop
    }
  }, [rtShowDividers]);

  // tiny deterministic RNG based on string seed
  function xmur3(str: string) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return function () { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^ (h >>> 16)) >>> 0; }; }
  function mulberry32(a: number) { return function () { let t = (a += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), 1 | t); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function detRand(uid: string, salt: string, seedStr: string) { const s = xmur3(`${seedStr}|${uid}|${salt}`)(); return mulberry32(s)(); }

  // Referral debug shown in terminal (read from sessionStorage)
  const [rtRefDebug, setRtRefDebug] = useState<string>(() => {
    try { return sessionStorage.getItem('__drop_ref_debug_str') || ''; } catch { return ''; }
  });
  useEffect(() => {
    const onStorage = (ev: StorageEvent) => {
      try {
        if (ev.key === '__drop_ref_debug_str') setRtRefDebug(ev.newValue || '');
      } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function weightedSampleWithoutReplacement(ents: Array<{ uid: string; w: number }>, k: number, seedStr: string, salt: string) {
    const scored = ents.map(e => {
      const u = Math.max(1e-12, detRand(e.uid, salt, seedStr));
      const key = Math.pow(u, 1 / Math.max(1, e.w));
      return { uid: e.uid, key };
    });
    scored.sort((a, b) => b.key - a.key);
    return scored.slice(0, k).map(s => s.uid);
  }

  function parsePrizes(): Array<{ amount: number; count: number }> {
    try {
      const arr = JSON.parse(prizesText);
      if (Array.isArray(arr)) return arr.map((p: any) => ({ amount: Number(p.amount) || 0, count: Number(p.count) || 0 })).filter(p => p.count > 0);
    } catch {}
    return [];
  }

  async function loadEntrants() {
    setLoading(true);
    try {
      const fs = getFirestore();
      // Note: documentId() requires full document paths in collectionGroup queries.
      // For the test terminal, filter by doc.id clientseitig.
      const q = fsQuery(
        collectionGroup(fs, 'countersByDay'),
        where('tickets', '>', 0)
      );
      const snap = await getDocs(q);
      const arr: Array<{ uid: string; w: number }> = [];
      snap.forEach(docSnap => {
        const t = Number(docSnap.get('tickets') || 0);
        const uid = docSnap.ref.parent?.parent?.id;
        if (uid && t > 0 && docSnap.id === dateId) arr.push({ uid, w: t });
      });
      setEntrants(arr);
      setWinners([]);
    } finally {
      setLoading(false);
    }
  }


  function runSim() {
    const totalTickets = entrants.reduce((s, e) => s + e.w, 0);
    const prizes = parsePrizes();
    const totalSlots = prizes.reduce((s, p) => s + (p.count || 0), 0);
    const k = Math.min(totalSlots, entrants.length);
    const ids = weightedSampleWithoutReplacement(entrants, k, seed, 'slot-allocation');
    const slots: number[] = [];
    prizes.sort((a, b) => (b.amount || 0) - (a.amount || 0)).forEach(p => { for (let i = 0; i < p.count; i++) slots.push(p.amount); });
    const out = ids.map((uid, i) => ({ uid, amount: slots[i] ?? 0 }));
    setWinners(out);
  }

  async function runCloudRaffle() {
    setRaffleBusy(true);
    setSeedInfo(null);
    try {
      const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'runRaffleNow');
      const res: any = await fn();
      const data = res?.data || {};
      console.log('[runRaffleNow] data', data);
      const dbg = (() => { try { return JSON.stringify(data, null, 2); } catch { return String(data); } })();
      if (data.ok) {
        setRaffleInfo({ dateId: data.dateId, levelKey: data.levelKey, winners: data.winners || {} });
        setSeedInfo({ code: 'ok', message: `Cloud: ${Object.keys(data.winners || {}).length} Gewinner gespeichert (Level ${data.levelKey || '?'})`, debug: dbg });
        await loadEntrants();
        setWinners([]);
      } else {
        setRaffleInfo(null);
        setSeedInfo({ code: data.code || 'error', message: data.message || 'Cloud-Raffle fehlgeschlagen', debug: dbg });
      }
  } catch (e) {
    setRaffleInfo(null);
    const edbg = (() => { try { return JSON.stringify({ code: (e as any)?.code, message: (e as any)?.message, details: (e as any)?.details }, null, 2); } catch { return String(e); } })();
    console.error('[runRaffleNow] failed', e);
    setSeedInfo({ code: (e as any)?.code || 'internal', message: (e as any)?.message || String(e), debug: edbg });
    } finally {
      setRaffleBusy(false);
    }
  }

  const totalTickets = entrants.reduce((s, e) => s + e.w, 0);

  async function grantTestTickets() {
    setGrantBusy(true);
    setGrantInfo(null);
    try {
      const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'grantTickets');
      const res: any = await fn({ amount: 3, mode: 'base' });
      const data = res?.data || {};
      console.log('[grantTickets] test response', data);
      const added = data.added ?? data.applied ?? data.ok ? 3 : 0;
      setGrantInfo(`grantTickets OK • +${added} Tickets (${data.day || 'n/a'})`);
      await loadEntrants();
  } catch (e) {
      console.error('[grantTickets] test failed', e);
      const msg = e?.message || e?.code || String(e);
      setGrantInfo(`grantTickets Fehler: ${msg}`);
    } finally {
      setGrantBusy(false);
    }
  }

  // Debug Info Text
  const [debugText, setDebugText] = useState<string>('');
  const [refDebugText, setRefDebugText] = useState<string>('');

  // Reference to shared base variable
  const serverNowBaseRef = useRef<number>(0);
  const perfBaseRef = useRef<number>(0);

  useEffect(() => {
    const updateDebugText = () => {
      try {
        const baseReady = serverNowBaseRef.current > 0 && perfBaseRef.current > 0;
        const now = baseReady ? (serverNowBaseRef.current + (performance.now() - perfBaseRef.current)) : Date.now();
        const parts = berlinPartsFromMs(now);
        const minutes = parts.hour * 60 + parts.minute;
        const freezeActive = (parts.hour === 20 && parts.minute < 15);
        const collectionDay = raffleCollectionDateIdFromMs(now);
        const drawDay = raffleDrawDateIdFromMs(now); 
        const displayDay = winnersDisplayDateIdFromMs(now);

        // Browser und System-Informationen sammeln
        const getBrowserInfo = () => {
          const ua = navigator.userAgent;
          let browser = 'Unbekannt';
          let os = 'Unbekannt';
          
          // Browser erkennen
          if (ua.includes('Chrome') && !ua.includes('Chromium') && !ua.includes('Edg')) browser = 'Chrome';
          else if (ua.includes('Firefox')) browser = 'Firefox';
          else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
          else if (ua.includes('Edg')) browser = 'Edge';
          else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';
          
          // OS erkennen
          if (ua.includes('Windows')) os = 'Windows';
          else if (ua.includes('Mac')) os = 'macOS';
          else if (ua.includes('Linux')) os = 'Linux';
          else if (ua.includes('Android')) os = 'Android';
          else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
          
          return { browser, os };
        };

        const getLocationInfo = () => {
          // Zeitzone als Standort-Hinweis
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const language = navigator.language;
          const languages = navigator.languages?.join(', ') || language;
          
          // Land aus Zeitzone ableiten (grober Hinweis)
          let probableCountry = 'Unbekannt';
          if (timezone.includes('Europe/Berlin') || timezone.includes('Europe/Vienna') || timezone.includes('Europe/Zurich')) {
            probableCountry = 'DACH-Region';
          } else if (timezone.includes('Europe/')) {
            probableCountry = 'Europa';
          } else if (timezone.includes('America/')) {
            probableCountry = 'Amerika';
          } else if (timezone.includes('Asia/')) {
            probableCountry = 'Asien';
          }
          
          return { timezone, language, languages, probableCountry };
        };

        const getDeviceInfo = () => {
          const screen = window.screen;
          const viewport = { width: window.innerWidth, height: window.innerHeight };
          const pixelRatio = window.devicePixelRatio || 1;
          const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          const isTablet = /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent);
          
          return {
            screenRes: `${screen.width}x${screen.height}`,
            viewport: `${viewport.width}x${viewport.height}`,
            pixelRatio,
            deviceType: isMobile ? 'Mobile' : isTablet ? 'Tablet' : 'Desktop'
          };
        };

        const browserInfo = getBrowserInfo();
        const locationInfo = getLocationInfo();
        const deviceInfo = getDeviceInfo();

        const text = [
          '=== ZEIT & SPIEL INFO ===',
          `Berlin Zeit: ${String(parts.hour).padStart(2,'0')}:${String(parts.minute).padStart(2,'0')}`,
          `Collection Tag: ${collectionDay}`,
          `Draw Tag: ${drawDay}`,
          `Display Tag: ${displayDay}`,
          `20:00-20:15 ${freezeActive ? 'aktiv' : 'inaktiv'}`,
          `Tickets gesamt: ${totalTickets}`,
          `${minutes < (20*60+15) ? 'Nächster Wechsel: 20:15' : 'Nächster Wechsel: morgen 20:15'}`,
          '',
          '=== SPIELER SYSTEM INFO ===',
          `Browser: ${browserInfo.browser}`,
          `Betriebssystem: ${browserInfo.os}`,
          `Gerätetyp: ${deviceInfo.deviceType}`,
          `Bildschirm: ${deviceInfo.screenRes}`,
          `Viewport: ${deviceInfo.viewport}`,
          `Pixel Ratio: ${deviceInfo.pixelRatio}`,
          '',
          '=== STANDORT & SPRACHE ===',
          `Zeitzone: ${locationInfo.timezone}`,
          `Wahrscheinliches Land: ${locationInfo.probableCountry}`,
          `Hauptsprache: ${locationInfo.language}`,
          `Alle Sprachen: ${locationInfo.languages}`,
          '',
          '=== TECHNISCHE DETAILS ===',
          `User Agent: ${navigator.userAgent.substring(0, 100)}...`,
          `Online Status: ${navigator.onLine ? 'Online' : 'Offline'}`,
          `Cookie aktiviert: ${navigator.cookieEnabled ? 'Ja' : 'Nein'}`
        ].join('\n');
        setDebugText(text);
        try {
          const r = sessionStorage.getItem('__drop_ref_debug_str') || '';
          setRefDebugText(r);
          const termEl = document.getElementById('__raffle_terminal_ref_debug') as HTMLDivElement | null;
          if (termEl) termEl.textContent = r;
        } catch {}
      } catch (e) {
        console.error('[debug] update failed', e);
      }
    };

    // Initial update
    updateDebugText();
    
    // Update every minute
    const interval = setInterval(updateDebugText, 60 * 1000);
    return () => clearInterval(interval);
  }, [totalTickets]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
  <div className="absolute inset-0 bg-black/80 cursor-pointer" onClick={onClose} />
      {/* Shrink modal by ~10%: reduce max width/height and add visible scrollbar */}
      <div className="relative bg-white text-black rounded-2xl shadow-xl w-[min(86vw,810px)] max-h-[81vh] p-4 overflow-auto visible-scrollbar">
        {/* close button intentionally removed - use overlay click or programmatic close */}
        <div className="text-lg font-bold mb-2">Raffle Test-Terminal</div>
  {/* Referral debug target (dev-only) */}
  <div id="__raffle_terminal_ref_debug" className="text-xs font-mono text-black/70 bg-black/5 p-2 rounded mb-2" style={{whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{rtRefDebug}</div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <label className="text-sm">
            Grid tiles (0–6)
            <select className="w-full border px-2 py-1 rounded" defaultValue={String(6)} onChange={(e) => {
              try { const v = Number(e.target.value); (window as any).__drop_setGridCount?.(v); } catch { }
            }}>
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
              <option value="6">6</option>
            </select>
          </label>
          <label className="text-sm">
            Datum (YYYY-MM-DD)
            <input
              value={dateId}
              onChange={(e) => setDateId(e.target.value)}
              className="w-full border px-2 py-1 rounded"
            />
          </label>
          <label className="text-sm">
            Seed
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="w-full border px-2 py-1 rounded"
            />
          </label>
          <div className="text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={rtShowDividers}
                onChange={(e) => setRtShowDividers(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span>Zeige Section Divider</span>
            </label>
          </div>
          <div className="text-sm flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={forceRaffleWindow}
                onChange={(e) => onForceRaffleWindowChange(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span>Simuliere 20:00–20:15 Countdown</span>
            </label>
            <label className="flex flex-col">
              <span>Prizes JSON</span>
              <textarea
                value={prizesText}
                onChange={(e) => setPrizesText(e.target.value)}
                className="w-full border px-2 py-1 rounded h-16 font-mono text-xs"
              />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {seedInfo && (
            <div className="mb-2 text-xs">
              <span className="font-semibold">Status:</span> [{seedInfo.code}] {seedInfo.message}
              {seedInfo.debug && (
                <details className="mt-1">
                  <summary className="cursor-pointer select-none">Debug</summary>
                  <pre className="mt-1 p-2 bg-black/5 rounded max-h-48 overflow-auto text-[10px] whitespace-pre-wrap break-words">
                    {seedInfo.debug}
                  </pre>
                </details>
              )}
            </div>
          )}
          {grantInfo && (
            <div className="mb-2 text-xs text-emerald-700">
              <span className="font-semibold">Tickets:</span> {grantInfo}
            </div>
          )}
          <button
            onClick={loadEntrants}
            className="px-3 py-1 rounded bg-black text-white disabled:opacity-50"
            disabled={loading}
          >
            Entries laden
          </button>
          <button
            className={`px-3 py-1 rounded bg-black text-white disabled:opacity-50 relative flex items-center justify-center`}
            aria-label={`Teilnehmen an Drop`}
            disabled={loading}
            onClick={async () => {
              try {
                const auth = getAuth();
                const user = auth.currentUser;
                if (!user) { alert('Bitte einloggen'); return; }
                setLoading(true);
                const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'enterDrop');
                const res: any = await fn({ entryId: `test-entry-${seed}` });
                if (res?.data?.ok) {
                  alert(`Teilnahme erfolgreich (${res.data.count})`);
                } else {
                  alert(`Fehler: ${String(res?.data?.message || 'unknown')}`);
                }
              } catch (e) {
                console.error('test-enterDrop failed', e);
                alert(`Fehler: ${String(e)}`);
              } finally {
                setLoading(false);
              }
            }}
          >
            <span className="text-center">{loading ? 'Sende...' : 'Teilnehmen'}</span>
          </button>
          <button
            onClick={runCloudRaffle}
            className="px-3 py-1 rounded bg-black text-white disabled:opacity-50"
            disabled={raffleBusy || loading}
          >
            Ziehung starten (Cloud)
          </button>
          <button
            onClick={async () => {
              try {
                const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'rotateMinigameNow');
                const res: any = await fn({});
                if (res?.data?.ok) {
                  alert('Rotation: ' + (res.data.storagePath || 'OK'));
                } else {
                  alert('Rotation error: ' + (res?.data?.error || JSON.stringify(res?.data)));
                }
              } catch (e) {
                console.error('rotateMinigameNow failed', e);
                alert('rotateMinigameNow failed: ' + String(e));
              }
            }}
            className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
          >
            Rotate Minigame
          </button>
          <button
            onClick={grantTestTickets}
            className="px-3 py-1 rounded bg-black text-white disabled:opacity-50"
            disabled={grantBusy}
          >
            +3 Tickets testen
          </button>
          {winners.length > 0 && (
            <button
              onClick={() => navigator.clipboard.writeText(JSON.stringify(winners))}
              className="px-3 py-1 rounded bg-black text-white"
            >
              Gewinner kopieren
            </button>
          )}
        </div>

        <div className="text-sm mb-2">
          Teilnehmer: <span className="tabular-nums">{entrants.length}</span> • Tickets gesamt:{' '}
          <span className="tabular-nums">{totalTickets}</span>
        </div>

        {entrants.length > 0 && (
          <div className="mb-3 overflow-auto max-h-48 border rounded">
            <div className="p-2 text-sm font-semibold">Teilnehmerliste</div>
            <table className="min-w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left p-1">UID</th>
                  <th className="text-right p-1">Tickets</th>
                </tr>
              </thead>
              <tbody>
                {entrants.map((e: any, i: number) => (
                  <tr key={e?.uid ?? i} className={i % 2 ? 'bg-black/5' : ''}>
                    <td className="p-1">{e?.uid ?? e?.id ?? '\u2014'}</td>
                    <td className="p-1 text-right">{e?.w ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {winners.length > 0 && (
          <>
            <div className="text-sm font-semibold mb-1">Letzte Gewinner</div>
            <div className="mb-2 overflow-auto max-h-56 border rounded">
              <table className="min-w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left p-1">UID</th>
                    <th className="text-right p-1">Prize</th>
                  </tr>
                </thead>
                <tbody>
                  {winners.map((w, i) => (
                    <tr key={`${w.uid}-${i}`} className={i % 2 ? 'bg-black/5' : ''}>
                      <td className="p-1">{w.uid}</td>
                      <td className="p-1 text-right">{w.amount}€</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {raffleInfo?.winners && (
          <>
            <div className="text-sm font-semibold mb-1">
              Cloud-Gewinner ({raffleInfo.dateId} • Level {raffleInfo.levelKey || '?'})
            </div>
            <div className="mb-2 overflow-auto max-h-56 border rounded">
              <table className="min-w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left p-1">Name</th>
                    <th className="text-right p-1">Prize</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(raffleInfo.winners)
                    .sort((a, b) => Number(a) - Number(b))
                    .map((k, i) => {
                      const r = (raffleInfo!.winners as any)[k];
                      return (
                        <tr key={k} className={i % 2 ? 'bg-black/5' : ''}>
                          <td className="p-1">{r?.name || '—'}</td>
                          <td className="p-1 text-right">{r?.prize || ''}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Debug Info Panel */}
        <pre className="mt-4 p-3 text-xs bg-black/5 rounded border border-black/10 font-mono whitespace-pre-wrap break-words">
          {debugText}
        </pre>

        <div className="mt-3 text-xs text-black/60">Simulation.</div>
      </div>
    </div>
  );
}
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getDatabase, ref as dbRef, onValue } from "firebase/database";
import { AccountPanel } from "../profile/page";
import { useRouter } from "next/navigation";
import { getAuth as getAuthFull, deleteUser, reauthenticateWithPopup, GoogleAuthProvider } from "firebase/auth";

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

    const N = 120; // Reduced from 220 for better performance
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

    const tick = (t: number) => {
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
    };

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
const CountdownPreviewCard = React.memo(function CountdownPreviewCard({ title, timeLabel }: { title: string; timeLabel: string }) {
  // Yesterday winners from Firestore: config/winners[YYYY-MM-DD]
  type WinnerRow = { name: string; prize: string; time?: string };
  const [winners, setWinners] = useState<WinnerRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const dayRef = { current: '' };

    const load = async (dayId: string) => {
      try {
        const fs = getFirestore();
        const snap = await getDoc(doc(fs, 'config', 'winners'));
        if (cancelled) return;
        const data: any = snap.exists() ? snap.data() : null;
        const rows: any[] = Array.isArray(data?.[dayId]) ? data[dayId] : Array.isArray(data?.days?.[dayId]) ? data.days[dayId] : [];
        const normalized: WinnerRow[] = rows
          .map((r: any) => ({ name: String(r?.name || r?.n || '—'), prize: String(r?.prize || r?.p || ''), time: r?.time ? String(r.time) : undefined }))
          .filter((r: WinnerRow) => r.name && r.prize);
        setWinners(normalized);
      } catch (e) {
        if (!cancelled) {
          setWinners([]);
          console.warn('[winners] load failed', e);
        }
      }
    };

    const refresh = () => {
      const baseReady = serverNowBaseRef.current > 0 && perfBaseRef.current > 0;
      const now = baseReady ? (serverNowBaseRef.current + (performance.now() - perfBaseRef.current)) : Date.now();
      const dayId = winnersDisplayDateIdFromMs(now);
      if (dayId === dayRef.current) return;
      dayRef.current = dayId;
      load(dayId);
    };

    refresh();
    const interval = setInterval(refresh, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);
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
});

function ParticipateButton({ activeTile, setActiveTile, item }: { activeTile: number | null; setActiveTile: (n: number | null) => void; item?: { src: string; toMs?: number | null; headline?: string | null; subtitle?: string | null; content?: string | null } | null }) {
  const [busy, setBusy] = useState(false);
  const onClick = React.useCallback(async (ev?: React.SyntheticEvent) => {
    ev?.stopPropagation();
    if (!item) return;
    try {
      setBusy(true);
      const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'enterDrop');
      const entryId = (item as any)?.id ?? (item as any)?.name ?? (item as any)?.title ?? null;
      if (!entryId) {
        alert('Ungültiger Eintrag');
        return;
      }
      const res = await fn({ entryId });
      if (res?.data?.ok) {
        alert(`Teilnahme erfolgreich (${res.data.count})`);
        setActiveTile(null);
      } else {
        const serverMsg = String(res?.data?.message || 'unknown');
        if (serverMsg.includes('insufficient-coins')) {
          alert('Nicht genügend Coins.');
        } else {
          alert(`Fehler: ${serverMsg}`);
        }
      }
    } catch (err: unknown) {
      console.error('enterDrop failed', err);
      const msg = (err as any)?.message ?? String(err);
      if (String(msg).includes('insufficient-coins')) {
        alert('Nicht genügend Coins.');
      } else {
        alert(`Fehler: ${msg}`);
      }
    } finally {
      setBusy(false);
    }
  }, [item, setActiveTile]);

  return (
    <button
      type="button"
      aria-label={`Teilnehmen an Drop ${activeTile !== null ? activeTile + 1 : ''}`}
      onClick={onClick}
      disabled={busy}
  className={`w-full py-4 ${busy ? 'opacity-60' : ''} bg-black text-white rounded-2xl text-lg font-bold shadow-lg hover:opacity-95 transition-opacity`}
  style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.35)', cursor: busy ? 'default' : 'pointer', pointerEvents: busy ? 'none' : 'auto' }}
  onMouseEnter={(e) => { try { (e.currentTarget as HTMLElement).style.cursor = busy ? 'default' : 'pointer'; } catch {} }}
  onMouseLeave={(e) => { try { (e.currentTarget as HTMLElement).style.cursor = ''; } catch {} }}
    >
      {busy ? 'Sende...' : 'Teilnehmen'}
    </button>
  );
}


// 3D tilt Steam-style gift card sprite for prize pool
const GiftCard3D = React.memo(function GiftCard3D({ title, img, children }: { title?: string; img?: string; children?: React.ReactNode }) {
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
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div 
        className="card relative w-full h-full rounded-2xl overflow-hidden border border-white/10 bg-black/30 backdrop-blur-[2px]"
        style={{
          transform: 'rotateX(calc(var(--rx, 0) * 0.3deg)) rotateY(calc(var(--ry, 0) * 0.3deg)) translateX(calc(var(--tx, 0px) * 0.3)) translateY(calc(var(--ty, 0px) * 0.3))',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.15s ease-out',
        }}
      >
        {/* Base gradient similar to minigame when no image is supplied */}
        {img ? (
          <img src={img} alt={title || 'Preis'} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <img src="/error-frame.svg" alt="Frame" className="absolute inset-0 w-full h-full object-cover rounded-2xl" />
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
});

// Interactive Neon Hologram card for the minigame
const NeonHoloCard = React.memo(function NeonHoloCard({ title, subtitle, timeLabel, img, onImgLoad, onImgError, onStart, uid, onShowAccount }: { title: string; subtitle: string; timeLabel: string; img?: string | null; onImgLoad?: () => void; onImgError?: () => void; onStart?: () => void; uid?: string | null; onShowAccount?: () => void; }) {
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

  // Centralized start handler (called from button, wrapper pointer events and keyboard)
  const startHandler = (ev?: React.SyntheticEvent) => {
    try {
      console.log('[MINIGAME CLICK] Start handler invoked, title:', title, 'uid:', uid);
      if (!uid) {
        console.log('[MINIGAME CLICK] not logged in, showing account');
        try { onShowAccount?.(); } catch {}
        return;
      }

      try { onStart?.(); } catch {}
      try { markDropStart(); } catch (e) { console.error('[MINIGAME CLICK] markDropStart failed:', e); }
      const gameRoute = title && title !== 'Minigame' ? `/games/${title}` : '/games/tap-rush';
      // Use client-side navigation if available (Next router fallback), else location
      try {
        // prefer window.location for now to ensure navigation in all environments
        window.location.href = gameRoute;
      } catch (e) {
        console.error('[NAVIGATION] navigation failed:', e);
      }
    } catch (e) {
      console.error('[MINIGAME CLICK] startHandler unexpected error', e);
    }
  };

  // Allow keyboard activation when focused
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      startHandler();
    }
  };

  return (
    <div 
      ref={wrapRef} 
      onMouseMove={handle} 
      onMouseLeave={leave}
      onClick={() => startHandler()}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
      className="holo group relative w-full h-full [perspective:1200px] select-none cursor-pointer"
      style={{ transformStyle: 'preserve-3d', outline: 'none' }}
    >
      {/* 3D card */}
      <button
        type="button"
        aria-label={uid ? "Spiel starten" : "Einloggen zum Spielen"}
        onClick={(e) => { e.stopPropagation(); startHandler(); }}
        className="card relative w-[120%] -ml-[10%] h-full rounded-2xl overflow-hidden border border-white/10 bg-black/30 backdrop-blur-[2px] shadow-[0_10px_50px_rgba(0,0,0,0.45)]"
        style={{
          transform: 'rotateX(calc(var(--rx, 0) * 1deg)) rotateY(calc(var(--ry, 0) * 1deg))',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.1s ease-out',
        }}
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
          <img src="/error-frame.svg" alt="Frame" className="absolute inset-0 w-full h-full object-cover rounded-2xl" />
        )}

        {/* Animated neon border replaced with static border */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none border-2 border-black"
        />

        {/* Schwarzer Balken mit Spielname am unteren Rand */}
        <div className="absolute bottom-0 left-0 right-0 bg-black text-white px-3 py-2 font-bold text-sm tracking-wide rounded-b-2xl flex items-center">
          <span>{title.toUpperCase()}</span>
          <span className="animate-pulse text-xs opacity-80 absolute left-1/2 transform -translate-x-1/2 flex items-center gap-1">
            PRESS TO PLAY
            <img 
              src="/play-icon.svg" 
              alt="Play" 
              className="w-3 h-3 animate-pulse opacity-80" 
            />
          </span>
        </div>

        {/* Countdown pill only */}
        <div className="absolute bottom-1 right-2 z-20 px-3 py-1 rounded-full bg-white text-black text-xs font-semibold shadow-sm border border-black/10 tabular-nums">
          {timeLabel}
        </div>
      </button>
    </div>
  );
});

// Reusable small Tile wrapper using same mouse-tilt logic as NeonHoloCard
const Tile3D = React.memo(function Tile3D({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const handle = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;   // 0..1
    const y = (e.clientY - r.top) / r.height;  // 0..1
    // stronger tilt intensity
    const rx = (0.5 - y) * 20; // tilt intensity
    const ry = (x - 0.5) * 22;
    el.style.setProperty('--rx', rx.toFixed(2));
    el.style.setProperty('--ry', ry.toFixed(2));
  };
  const leave = () => {
    const el = wrapRef.current; if (!el) return;
    el.style.setProperty('--rx', '0');
    el.style.setProperty('--ry', '0');
  };
  return (
    <div ref={wrapRef} onMouseMove={handle} onMouseLeave={leave} className="[perspective:1200px]" style={{ transformStyle: 'preserve-3d' }}>
      <div style={{ transform: 'perspective(1200px) translateZ(6px) rotateX(calc(var(--rx, 0) * 0.6deg)) rotateY(calc(var(--ry, 0) * 0.6deg))', transition: 'transform 180ms cubic-bezier(.2,.9,.25,1)' }}>
        {children}
      </div>
    </div>
  );
});


export default function DropPage() {
  const [isHydrated, setIsHydrated] = useState(false);
  // Login-Modal: Query-Parameter SOFORT beim ersten Rendern auswerten (vor Hydrierung)
  const [shouldOpenLogin, setShouldOpenLogin] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get('login') === '1';
    } catch {
      return false;
    }
  });
  
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Ensure we land at the top immediately on first paint (stronger than the post-hydration effect)
  useEffect(() => {
    try {
      const r = sessionStorage.getItem('__drop_ref_debug_str') || '';
      setRefDebugText(r);
    } catch {}

    try {
      // reset document scroll
      const docEl = document.scrollingElement as HTMLElement | null;
      if (docEl) docEl.scrollTo?.({ top: 0 });
    } catch {}

    try {
      // reset inner container if present
      const sc = scrollContainerRef.current;
      if (sc) sc.scrollTop = 0;
    } catch {}
  }, [isHydrated]);

  // Auto-Refresh um 20:15 Uhr Berlin Zeit
  useEffect(() => {
    let hasRefreshed = false; // Verhindert mehrfache Refreshs
    
    const checkRefreshTime = () => {
      if (hasRefreshed) return;
      
      const now = new Date();
      // Korrekte Berlin Zeit mit Intl.DateTimeFormat
      const berlinFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Berlin',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      const berlinTime = berlinFormatter.format(now);
      const [hours, minutes, seconds] = berlinTime.split(':').map(Number);
      
      console.log(`[auto-refresh] Berlin Zeit: ${hours}:${minutes}:${seconds}`);
      
      // Wenn es 20:15:xx ist (beliebige Sekunde)
      if (hours === 20 && minutes === 15) {
        console.log('[auto-refresh] 🔄 Auto-Refresh um 20:15 Uhr ausgelöst');
        hasRefreshed = true;
        window.location.reload();
      }
    };

    // Sofort prüfen beim Load
    checkRefreshTime();
    
    // Prüfe alle 10 Sekunden für bessere Genauigkeit
    const interval = setInterval(checkRefreshTime, 10000);
    
    // Cleanup bei unmount
    return () => clearInterval(interval);
  }, []);

  // Capture Referral Code from URL
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const refCode = url.searchParams.get('ref');
      
      console.log('[referral-debug] Current URL:', window.location.href);
      console.log('[referral-debug] Extracted ref code:', refCode);
      console.log('[referral-debug] Code length:', refCode?.length);
      
  // Accept common referral code lengths (e.g. 6 or 8 chars). Relax strict check so codes like
  // `wqY6A1eb` (8) and `xmyFNT` (6) are accepted. Range 4..12 is a safe heuristic.
  if (refCode && typeof refCode === 'string' && refCode.length >= 4 && refCode.length <= 12) {
        // Speichere Referral Code in sessionStorage für spätere Verwendung
        const referralData = {
          code: refCode,
          timestamp: Date.now(),
          url: window.location.href
        };
        
        sessionStorage.setItem('pendingReferral', JSON.stringify(referralData));
        console.log('[referral-debug] ✅ Stored referral data:', referralData);
        
        // Optional: URL bereinigen ohne Page Reload
        if (window.history?.replaceState) {
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('ref');
          window.history.replaceState({}, '', cleanUrl.toString());
          console.log('[referral-debug] ✅ Cleaned URL to:', cleanUrl.toString());
        }
      } else {
        console.log('[referral-debug] ❌ Invalid or missing ref code');
      }
      
      // Check if there's already stored referral data
      const existing = sessionStorage.getItem('pendingReferral');
      if (existing) {
        console.log('[referral-debug] 📋 Existing referral data found:', JSON.parse(existing));
      } else {
        console.log('[referral-debug] 📋 No existing referral data');
      }
      
    } catch (error) {
      console.error('[referral-debug] ❌ Failed to capture referral code:', error);
    }
  }, []);

  // State for minigame slug/title
  const [gameSlug, setGameSlug] = useState<string | null>(null);
  useEffect(() => {
    try { sessionStorage.setItem('drop.present', String(Date.now())); } catch {}
    return () => { try { sessionStorage.removeItem('drop.present'); } catch {} };
  }, []);
  const router = useRouter();
  const [deletingAcc, setDeletingAcc] = useState(false);

  // Winners: gestern aus Firestore (config/winners[YYYY-MM-DD] oder days[...])
  type WinnersRow = { name: string; prize: string; time?: string; _source?: 'days' | 'top' | 'array'; _day?: string };
  const [winners, setWinners] = useState<WinnersRow[]>([]);
  const [winnersDateLabel, setWinnersDateLabel] = useState<string>("");
  const [latestWinner, setLatestWinner] = useState<WinnersRow | null>(null);
  const [latestWinnerSource, setLatestWinnerSource] = useState<'days' | 'top' | 'array' | undefined>(undefined);
  const [latestWinnerDay,   setLatestWinnerDay]   = useState<string | undefined>(undefined);
  const [winnersDebugText,  setWinnersDebugText]  = useState<string>("");

  useEffect(() => {
    const fs = getFirestore();
    let cancelled = false;

    const loadWinners = async (_dayId?: string) => {
      try {
        const snap = await getDoc(doc(fs, 'config', 'winners'));
        if (cancelled) return;
        const data: any = snap.exists() ? snap.data() : null;

        // === SIMPLE SOURCE: config/winners[YYYY-MM-DD] (map-like: "0","1",...) ===
        // Determine Anzeige-Tag (20:15-Regel)
        const baseReady = serverNowBaseRef.current > 0 && perfBaseRef.current > 0;
        const now = baseReady ? (serverNowBaseRef.current + (performance.now() - perfBaseRef.current)) : Date.now();
        const dayId = winnersDisplayDateIdFromMs(now);
        
        // DEBUG: Check what dates are available in winners data
        console.log('[loadWinners] Searching for dayId:', dayId);
        console.log('[loadWinners] Available dates in data:', data ? Object.keys(data) : 'no data');

        // Coerce map-like object to ordered array by numeric keys
        const asArr = (node: any): any[] => {
          if (!node || typeof node !== 'object') return [];
          const numKeys = Object.keys(node).filter(k => /^\d+$/.test(k)).map(k => Number(k)).sort((a,b)=>a-b);
          return numKeys.map(i => (node as any)[String(i)]);
        };

        const rawDay = (data || {})[dayId];
        const rowsRaw: any[] = Array.isArray(rawDay) ? rawDay : asArr(rawDay);

        type W = WinnersRow;
        const all: W[] = rowsRaw
          .map((r: any) => ({
            name: String(r?.name ?? r?.n ?? '').trim(),
            prize: String(r?.prize ?? r?.p ?? '').trim(),
            time: r?.time ? String(r.time) : undefined,
            _source: 'top',
            _day: dayId,
          }))
          .filter((r: W) => r.name.length > 0 && r.prize.length > 0);

        // Pick latest (by time if vorhanden, sonst letzte Zeile)
        let latest: W | null = null;
        const parseScore = (t?: string, idx: number) => {
          if (!t) return idx;
          const asDate = Date.parse(t);
          if (!Number.isNaN(asDate)) return asDate;
          const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t);
          if (m) { const h=+m[1]||0, mi=+m[2]||0, s=+(m[3]||'0')||0; return h*3600+mi*60+s+idx/1000; }
          return idx;
        };
        all.forEach((r, i) => { const s = parseScore(r.time, i); if (!latest || s >= parseScore(latest.time, i-1)) latest = r; });

        // UI: zeige alle Gewinner dieses Anzeige-Tages
        setWinners(all);
        setLatestWinner(latest);
        setLatestWinnerSource('top');
        setLatestWinnerDay(dayId);
  setWinnersDateLabel('Letzte Gewinner:');

        // Debug-Overlay-Text aktualisieren
        try {
          const parts = berlinPartsFromMs(now);
          const minutes = parts.hour * 60 + parts.minute;
          const freezeActive = (parts.hour === 20 && parts.minute < 15);
          const where = `config/winners[${dayId}]`;
          const hh = String(parts.hour).padStart(2, '0');
          const mm = String(parts.minute).padStart(2, '0');
          const rule = `Regel: 20:00–20:15 keine Aktualisierung; Anzeige-Tag bis 20:14 = gestern, ab 20:15 = heute.`;
          const nextSwitch = minutes < (20*60+15) ? `Nächster Wechsel 20:15` : `Nächster Wechsel morgen 20:15`;
          setWinnersDebugText(`Quelle: ${where} • Jetzt (Berlin): ${hh}:${mm} • Anzeige-Tag: ${dayId} • Freeze aktiv: ${freezeActive ? 'ja' : 'nein'} • ${nextSwitch}. ${rule}`);
        } catch {}
      } catch (e) {
        if (cancelled) return;
        console.warn('[winners] load failed', e);
        setWinners([]);
        setLatestWinner(null);
  setWinnersDateLabel('Letzte Gewinner:');
      }
    };

    const refresh = () => {
      // Lade immer die Winners - das Freeze nur für die Tag-Berechnung (in winnersDisplayDateIdFromMs)
      // Die Winners vom vorherigen Tag sollen weiterhin angezeigt werden
      loadWinners();
    };

    refresh();
    const interval = setInterval(refresh, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Keep the overlay text in sync
  useEffect(() => {
    const el = document.getElementById('winners-debug-overlay');
    if (el) el.textContent = winnersDebugText || '';
  }, [winnersDebugText]);

  // Also refresh the clock-based parts each minute
  useEffect(() => {
    const tick = () => {
      try {
        const baseReady = serverNowBaseRef.current > 0 && perfBaseRef.current > 0;
        const now = baseReady ? (serverNowBaseRef.current + (performance.now() - perfBaseRef.current)) : Date.now();
        const parts = berlinPartsFromMs(now);
        const minutes = parts.hour * 60 + parts.minute;
        const freezeActive = (parts.hour === 20 && parts.minute < 15);
        const displayDay = winnersDisplayDateIdFromMs(now);
        const where = latestWinnerSource === 'days' ? `config/winners.days[${latestWinnerDay || '—'}]`
                    : latestWinnerSource === 'top'  ? `config/winners[${latestWinnerDay || '—'}]`
                    : latestWinnerSource === 'array'? `config/winners (Array)`
                    : `config/winners (unbekannt)`;
        const hh = String(parts.hour).padStart(2, '0');
        const mm = String(parts.minute).padStart(2, '0');
        const rule = `Regel: 20:00–20:15 keine Aktualisierung; Anzeige-Tag bis 20:14 = gestern, ab 20:15 = heute.`;
        const nextSwitch = minutes < (20*60+15) ? `Nächster Wechsel 20:15` : `Nächster Wechsel morgen 20:15`;
        setWinnersDebugText(`Quelle: ${where} • Jetzt (Berlin): ${hh}:${mm} • Anzeige-Tag: ${displayDay} • Freeze aktiv: ${freezeActive ? 'ja' : 'nein'} • ${nextSwitch}. ${rule}`);
      } catch { /* noop */ }
    };
    const iv = setInterval(tick, 60 * 1000);
    tick();
    return () => clearInterval(iv);
  }, [latestWinnerSource, latestWinnerDay]);

  async function handleDeleteAccount() {
    const auth = getAuthFull();
    const u = auth.currentUser;
    if (!u) { alert('Nicht eingeloggt'); return; }
    if (!confirm('Konto endgültig löschen? Dies kann nicht rückgängig gemacht werden.')) return;
    setDeletingAcc(true);
    try {
      try {
        await deleteUser(u);
  } catch (e) {
        if (e?.code === 'auth/requires-recent-login') {
          await reauthenticateWithPopup(u, new GoogleAuthProvider());
          await deleteUser(u);
        } else {
          throw e;
        }
      }
      router.push('/');
    } catch (err) {
      console.error('Account löschen fehlgeschlagen', err);
      alert('Löschen fehlgeschlagen.');
    } finally {
      setDeletingAcc(false);
    }
  }
  const [authReady, setAuthReady] = useState(false);
  const [mustComplete, setMustComplete] = useState(false);
  const [authUser, setAuthUser] = useState<ReturnType<typeof getAuth>["currentUser"] | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [selectedLocalAvatar, setSelectedLocalAvatar] = useState<string | null>(null);
  const [showTest, setShowTest] = useState(false);

  // Load selected local avatar from localStorage
  useEffect(() => {
    try {
      const savedAvatar = localStorage.getItem('selectedLocalAvatar');
      if (savedAvatar && savedAvatar.startsWith('/pfpfs/')) {
        setSelectedLocalAvatar(savedAvatar);
      }
    } catch (e) {
      console.warn('Could not load selected avatar from localStorage', e);
    }
  }, []);

  // Listen for avatar changes from AccountPanel
  useEffect(() => {
    const handleAvatarChange = (event: CustomEvent<{ avatar: string }>) => {
      setSelectedLocalAvatar(event.detail.avatar);
    };
    
    window.addEventListener('localAvatarChanged', handleAvatarChange as EventListener);
    return () => window.removeEventListener('localAvatarChanged', handleAvatarChange as EventListener);
  }, []);
  const [forceRaffleWindow, setForceRaffleWindow] = useState<boolean>(() => {
    try {
      return document?.documentElement?.getAttribute('data-force-raffle-window') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [testEnabled, setTestEnabled] = useState(false);

  useEffect(() => {
    try {
      // Only allow test terminal during development/non-production builds.
      // Using process.env.NODE_ENV enables bundlers to drop this branch from production builds.
      if (process.env.NODE_ENV === 'production') {
        setTestEnabled(false);
        return;
      }
      const url = new URL(window.location.href);
      const hostname = (url.hostname || '').toLowerCase();
      const enable = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.localhost');
      setTestEnabled(enable);
    } catch {}
  }, []);

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
        closeAllModals();
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
          closeAllModals();
          setShowAccount(true);
        }
      } catch {
        // Nutzer existiert, aber Profil nicht lesbar → als unvollständig behandeln
        setMustComplete(true);
        closeAllModals();
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
  const MIN_TICKETS_FOR_RAFFLE = 50;
  const ticketsTodaySafe = Math.max(0, ticketsToday || 0);
  // Global tickets total (today) for dynamic prize scaling
  const [ticketsTotalToday, setTicketsTotalToday] = useState<number>(0);
  const totalPoolTickets = Math.max(0, ticketsTotalToday || 0);
  const [poolLevel, setPoolLevel] = useState<number>(0);
  // Prize pool modal state (declare early so hooks below can reference showPool)
  type PrizeItem = { title?: string; image?: string; qty?: number };
  type PrizeLevel = { levelIndex: number; ticketsNeeded?: number; items?: PrizeItem[]; totalRewards?: number }
  const [showPool, setShowPool] = useState(false);
  const [poolItems, setPoolItems] = useState<PrizeItem[]>([]);
  const [prizeLevels, setPrizeLevels] = useState<PrizeLevel[] | null>(null);
  const [levelTotals, setLevelTotals] = useState<number[] | null>(null);
  const [totalRewards, setTotalRewards] = useState<number>(0);
  const [poolResolved, setPoolResolved] = useState<({ title?: string; qty?: number; url: string })[]>([]);


  const findLevelArrayIndex = React.useCallback((levelsList: PrizeLevel[] | null, target: number | null | undefined) => {
    if (!levelsList || levelsList.length === 0) return -1;
    if (target == null) return 0;
    let bestLowerIndex = -1;
    let bestLowerDiff = Number.POSITIVE_INFINITY;
    let bestHigherIndex = -1;
    let bestHigherDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < levelsList.length; i++) {
      const candidate = levelsList[i];
      const idx = candidate.levelIndex;
      if (idx === target) return i;
      if (idx < target) {
        const diff = target - idx;
        if (diff < bestLowerDiff) {
          bestLowerDiff = diff;
          bestLowerIndex = i;
        }
      } else if (idx > target) {
        const diff = idx - target;
        if (diff < bestHigherDiff) {
          bestHigherDiff = diff;
          bestHigherIndex = i;
        }
      }
    }
    if (bestLowerIndex !== -1) return bestLowerIndex;
    if (bestHigherIndex !== -1) return bestHigherIndex;
    return 0;
  }, []);

  const numberFormatter = useMemo(() => new Intl.NumberFormat('de-DE'), []);
  const ticketsBadgeText = useMemo(() => {
    return `${numberFormatter.format(ticketsTodaySafe)}/${numberFormatter.format(MIN_TICKETS_FOR_RAFFLE)}`;
  }, [numberFormatter, ticketsTodaySafe, MIN_TICKETS_FOR_RAFFLE]);

  const thresholdList = useMemo(() => {
    if (!prizeLevels || prizeLevels.length === 0) {
      return [] as Array<{ levelIndex: number; start: number; end: number; required: number }>;
    }
    const sorted = [...prizeLevels].sort((a, b) => a.levelIndex - b.levelIndex);
    let cumulative = 0;
    return sorted.map((lv) => {
      const raw = Number(lv.ticketsNeeded);
      const increment = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100;
      const required = Math.max(1, increment);
      const start = cumulative;
      const end = start + required;
      cumulative = end;
      return { levelIndex: lv.levelIndex, start, end, required };
    });
  }, [prizeLevels]);

  const poolProgress = useMemo(() => {
    if (thresholdList.length === 0) {
      const baseLevel = Math.floor(totalPoolTickets / 100);
      const baseThreshold = baseLevel * 100;
      const earnedRaw = Math.max(0, totalPoolTickets - baseThreshold);
      const required = 100;
      const earnedClamped = Math.max(0, Math.min(required, earnedRaw));
      const pct = Math.max(0, Math.min(100, Math.round((earnedClamped / required) * 100)));
      return {
        levelIndex: baseLevel,
        baseThreshold,
        nextThreshold: baseThreshold + required,
        earnedInLevel: earnedClamped,
        requiredForNext: required,
        pct,
        isMax: false,
        total: totalPoolTickets,
      };
    }

    let current = thresholdList[0];
    let next: typeof current | null = thresholdList.length > 1 ? thresholdList[1] : null;
    for (let i = 0; i < thresholdList.length; i++) {
      const entry = thresholdList[i];
      const nextEntry = thresholdList[i + 1] ?? null;
      if (totalPoolTickets >= entry.end && nextEntry) {
        current = nextEntry;
        next = thresholdList[i + 2] ?? null;
        continue;
      }
      current = entry;
      next = nextEntry;
      break;
    }

    const start = current.start;
    const required = Math.max(1, current.required);
    const end = current.end;
    const earnedRaw = Math.max(0, totalPoolTickets - start);
    const earnedClamped = Math.max(0, Math.min(required, earnedRaw));
    const pct = Math.max(0, Math.min(100, Math.round((earnedClamped / required) * 100)));

    if (!next && totalPoolTickets >= end) {
      return {
        levelIndex: current.levelIndex,
        baseThreshold: start,
        nextThreshold: null,
        earnedInLevel: earnedRaw,
        requiredForNext: null,
        pct: 100,
        isMax: true,
        total: totalPoolTickets,
      };
    }

    return {
      levelIndex: current.levelIndex,
      baseThreshold: start,
      nextThreshold: end,
      earnedInLevel: earnedClamped,
      requiredForNext: required,
      pct,
      isMax: false,
      total: totalPoolTickets,
    };
  }, [thresholdList, totalPoolTickets]);

  const effectivePoolLevel = useMemo(() => Math.max(0, Math.max(poolLevel ?? 0, poolProgress.levelIndex ?? 0)), [poolLevel, poolProgress.levelIndex]);
  
  const poolProgressLabel = useMemo(() => poolProgress.requiredForNext != null
    ? `${numberFormatter.format(Math.max(0, Math.floor(poolProgress.earnedInLevel)))}/${numberFormatter.format(Math.max(0, Math.floor(poolProgress.requiredForNext)))}`
    : `${numberFormatter.format(Math.max(0, Math.floor(poolProgress.total)))}`, [poolProgress]);
  
  const poolProgressSuffix = useMemo(() => poolProgress.requiredForNext != null ? 'Tickets' : 'Tickets gesamt', [poolProgress.requiredForNext]);
  
  const poolProgressIsMax = useMemo(() => poolProgress.requiredForNext == null, [poolProgress.requiredForNext]);
  
  // Memoized inline styles to prevent object recreation on each render
  const topBarWrapperStyle = useMemo(() => ({ backfaceVisibility: 'hidden', willChange: 'transform', transform: 'translateZ(0)' } as React.CSSProperties), []);
  const smallTickerStyle = useMemo(() => ({ backfaceVisibility: 'hidden' } as React.CSSProperties), []);
  
  // --- Loading overlay: shown until Firebase data is ready on first load ---
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [prizePoolLoaded, setPrizePoolLoaded] = useState(false);
  const [poolLevelServerLoaded, setPoolLevelServerLoaded] = useState(false);
  // Listen to aggregated tickets count for the Berlin day in metrics_daily/{YYYY-MM-DD}
  useEffect(() => {
    const fs = getFirestore();
    let unsub: (() => void) | null = null;
    let currentDayId: string | null = null;

    function resubscribe() {
      const baseReady = serverNowBaseRef.current > 0 && perfBaseRef.current > 0;
      const serverNow = baseReady ? (serverNowBaseRef.current + (performance.now() - perfBaseRef.current)) : Date.now();
      const dayId = raffleCollectionDateIdFromMs(serverNow);
      if (dayId === currentDayId) {
        return; // still same aggregation window; keep existing listener
      }
      currentDayId = dayId;
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
      setTicketsTotalToday(0);
      setPoolLevel(0);
    }

    resubscribe();
    const iv = setInterval(resubscribe, 60 * 1000);
    return () => { if (unsub) unsub(); clearInterval(iv); };
  }, []);

  // When showPool is opened, fetch latest ticketsTotalToday from server immediately
  useEffect(() => {
    if (!showPool) return;
    const fs = getFirestore();
    const baseReady = serverNowBaseRef.current > 0 && perfBaseRef.current > 0;
    const serverNow = baseReady ? (serverNowBaseRef.current + (performance.now() - perfBaseRef.current)) : Date.now();
    const dayId = raffleCollectionDateIdFromMs(serverNow);
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
    // Single default message — do not repeat here
    return 'Platzhalter • News • Update';
  }
  const [smallTicker, setSmallTicker] = useState<string>(getDefaultSmallTicker());
  const smallTickerContainerRef = useRef<HTMLDivElement | null>(null);
  const smallTickerSpanRef = useRef<HTMLSpanElement | null>(null);

  // scroll container and footer refs to control header visibility on last screen
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const footerSectionRef = useRef<HTMLElement | null>(null);
  const modalContentRef = useRef<HTMLDivElement | null>(null);
  const participateButtonRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubbleStyle, setBubbleStyle] = useState<{ bottom?: string; right?: string } | null>(null);
  const [hideTopOnFooter, setHideTopOnFooter] = useState<boolean>(false);
  // Test grid on second screen
  const [gridCount, setGridCount] = useState<number>(6);
  const [gridImages, setGridImages] = useState<string[]>([]);
  const [gridItems, setGridItems] = useState<Array<{ id?: string | null; src: string; toMs?: number | null; headline?: string | null; subtitle?: string | null; content?: string | null; interval?: string | undefined; withCode?: string | null }>>([]);
  const [activeTile, setActiveTile] = useState<number | null>(null);
  const [popupLoading, setPopupLoading] = useState<boolean>(false);
  // Prevent page scroll when grid popup is open
  
  // Participant counts for the active tile popup
  // participation counts are shown only in the bubble; we don't keep total count state here
  const [myParticipationCount, setMyParticipationCount] = useState<number | null>(null);
  const [myLastParticipatedMs, setMyLastParticipatedMs] = useState<number | null>(null);
  const [nextAllowedMs, setNextAllowedMs] = useState<number | null>(null);
  const [canParticipate, setCanParticipate] = useState<boolean>(true);
  const [countdownMs, setCountdownMs] = useState<number | null>(null);
  const [popupBusy, setPopupBusy] = useState<boolean>(false);

  // Measure button and modal to position the speech bubble exactly above the button
  useEffect(() => {
    let mounted = true;
    const update = () => {
      try {
        const modal = modalContentRef.current;
        const btn = participateButtonRef.current;
        const bubbleEl = bubbleRef.current;
        if (!modal || !btn) {
          if (mounted) setBubbleStyle(null);
          return;
        }
        const modalRect = modal.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        const bubbleRect = bubbleEl?.getBoundingClientRect();
        // distance from modal bottom to button top
        const base = Math.round(modalRect.bottom - btnRect.top);
  // position so the bubble's lower edge is slightly closer to the button
  // subtract a small offset (based on bubble height or a sensible default)
  // no extra offset: bubble lower edge should touch the button top
  let bottomPx = base;
        if (!mounted) return;
        setBubbleStyle({ bottom: `${bottomPx}px`, right: '12px' });
      } catch (e) {
        // ignore
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => { mounted = false; window.removeEventListener('resize', update); };
  }, [activeTile, popupLoading, myParticipationCount]);

  // Load participant counts for the active tile whenever it changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPopupLoading(false);
      try {
        if (activeTile === null) {
          if (!cancelled) {
                // no-op: total count not tracked here
            setMyParticipationCount(null);
            // removed participantsLoading state
          }
          return;
        }

        const item = gridItems[activeTile];
        if (!item) {
          if (!cancelled) {
                // no-op: total count not tracked here
            setMyParticipationCount(null);
            // removed participantsLoading state
          }
          return;
        }

        let entryId: string | null = (item as any)?.id ?? (item as any)?.__id ?? null;
        if (!entryId) {
          // fallback to index-based synthetic id
          entryId = `drop-item-${activeTile}`;
        }

  // loading state not needed for bubble-only display
        const fs = getFirestore();
        const partsCol = collection(fs, 'drop-vault-entries', entryId, 'participants');
  // show loading spinner while we fetch popup data
  if (!cancelled) setPopupLoading(true);
  // Fetch all participant docs and sum their `count` fields (fallback to 1 per doc)
  const snap = await getDocs(partsCol);
        if (cancelled) return;
        // we don't display the total count in the modal body anymore; leave aggregation out

        // Fetch current user's participant doc (if logged in)
        if (uid) {
          try {
            const myDocRef = doc(fs, 'drop-vault-entries', entryId, 'participants', uid);
            const mySnap = await getDoc(myDocRef);
            if (!cancelled) {
              if (mySnap.exists()) {
                const md: any = mySnap.data();
                setMyParticipationCount(typeof md?.count === 'number' ? md.count : 1);
                const lp = md?.lastParticipated?.toMillis ? md.lastParticipated.toMillis() : (typeof md?.lastParticipated === 'number' ? md.lastParticipated : null);
                setMyLastParticipatedMs(typeof lp === 'number' ? lp : null);
              } else {
                setMyParticipationCount(0);
                setMyLastParticipatedMs(null);
              }
            }
          } catch (e) {
            if (!cancelled) setMyParticipationCount(null);
          }
        } else {
          setMyParticipationCount(null);
          setMyLastParticipatedMs(null);
        }
      } catch (e) {
        if (!cancelled) {
          // removed participantsTotalCount state
          setMyParticipationCount(null);
        }
      } finally {
  if (!cancelled) { try { setPopupLoading(false); } catch {} }
      }
    })();

    return () => { cancelled = true; };
  }, [activeTile, gridItems, uid]);

  // Compute nextAllowedMs & canParticipate when myLastParticipatedMs or activeTile changes
  useEffect(() => {
    const compute = () => {
      setNextAllowedMs(null);
      setCanParticipate(true);
      if (activeTile === null) return;
      const item = gridItems[activeTile];
      if (!item) return;
      const interval = (item as any)?.interval || (item as any)?.public?.interval || 'hourly';
      const now = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);
      const lp = myLastParticipatedMs;
      if (!lp) {
        setCanParticipate(true);
        setNextAllowedMs(null);
        return;
      }
      if (interval === 'hourly') {
        const next = Number(lp) + 60 * 60 * 1000; // +1 hour
        setNextAllowedMs(next);
        setCanParticipate(next <= now);
        try { console.debug('[participation] compute hourly', { interval, lp, next, now, can: next <= now }); } catch {}
        return;
      }
      // daily: allow once per Berlin day (use berlinYMD helper)
      try {
        const lastDay = berlinYMD(lp);
        const nowDay = berlinYMD(now);
        if (lastDay !== nowDay) {
          setCanParticipate(true);
          setNextAllowedMs(null);
        } else {
          // compute start of next Berlin day (00:00 next day) as nextAllowed
          const parts = berlinPartsFromMs(lp);
          const target = shiftBerlinDay({ year: parts.year, month: parts.month, day: parts.day }, 1);
          const ms = getBerlinMidnightMs(target.year, target.month, target.day);
          if (ms && Number.isFinite(ms)) {
            setNextAllowedMs(ms);
            setCanParticipate(ms <= now);
            try { console.debug('[participation] compute daily', { interval, lp, ms, now, can: ms <= now }); } catch {}
          } else {
            setNextAllowedMs(null);
            setCanParticipate(false);
          }
        }
      } catch (e) {
        setNextAllowedMs(null);
        setCanParticipate(true);
      }
    };
    compute();
  }, [myLastParticipatedMs, activeTile, gridItems]);

  // Countdown updater for nextAllowedMs
  useEffect(() => {
    if (!nextAllowedMs) {
      setCountdownMs(null);
      return;
    }
    let cancelled = false;
    const update = () => {
      const serverNow = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);
      const rem = Math.max(0, nextAllowedMs - serverNow);
      if (!cancelled) setCountdownMs(rem);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [nextAllowedMs]);

  function formatCountdown(ms: number | null) {
    if (ms === null) return '';
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  // Ensure items with expired toMs are removed immediately (handles stuck 0 display)
  useEffect(() => {
    const iv = setInterval(() => {
      try {
        const baseReady = serverNowBaseRef.current > 0 && perfBaseRef.current > 0;
        const serverNow = baseReady ? (serverNowBaseRef.current + (performance.now() - perfBaseRef.current)) : Date.now();
        setGridItems((prev) => {
          const filtered = prev.filter(item => !item.toMs || (typeof item.toMs === 'number' && item.toMs > serverNow));
          if (filtered.length === prev.length) return prev;
          // sync images & count
          const newImgs = filtered.map(i => i.src).slice(0, 36);
          setGridImages((imgs) => {
            if (imgs.length === newImgs.length && imgs.every((v, idx) => v === newImgs[idx])) return imgs;
            return newImgs;
          });
          setGridCount(Math.max(0, Math.min(36, filtered.length)));
          // close active modal if the active index was removed
          setActiveTile((at) => (at === null ? null : (at < filtered.length ? at : null)));
          return filtered;
        });
      } catch { /* ignore */ }
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  function TileCountdown({ toMs }: { toMs?: number | null }) {
    const [, setTick] = useState(0);
    useEffect(() => {
      if (!toMs) return;
      const update = () => setTick((t) => t + 1);
      const initialNow = serverNowBaseRef.current && perfBaseRef.current ? (serverNowBaseRef.current + (performance.now() - perfBaseRef.current)) : Date.now();
      const remaining = Math.max(0, (toMs || 0) - initialNow);
      const interval = remaining < 60000 ? 250 : 1000;
      const iv = setInterval(update, interval);
      return () => clearInterval(iv);
    }, [toMs]);

    if (!toMs) return null;
    const serverNow = serverNowBaseRef.current && perfBaseRef.current ? (serverNowBaseRef.current + (performance.now() - perfBaseRef.current)) : Date.now();
    let diff = Math.max(0, toMs - serverNow);
    const dayMs = 24 * 60 * 60 * 1000;
    const hourMs = 60 * 60 * 1000;
    const minMs = 60 * 1000;

    let display = '';
    if (diff >= dayMs) {
      const days = Math.floor(diff / dayMs);
      display = `${days}d`;
    } else if (diff >= hourMs) {
      const hours = Math.floor(diff / hourMs);
      display = `${hours}h`;
    } else {
      // less than 1 hour -> show MM:SS
      const mins = Math.floor(diff / minMs);
      const secs = Math.floor((diff % minMs) / 1000);
      const mm = String(mins).padStart(2, '0');
      const ss = String(Math.max(0, secs)).padStart(2, '0');
      display = `${mm}:${ss}`;
    }

    return (
      <div className="absolute top-2 right-2 pointer-events-none z-30">
        <div className="px-3 py-1 rounded-full bg-white text-black text-xs font-semibold shadow-sm border border-black/10 tabular-nums antialiased leading-none" style={{ minWidth: 64, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'translateZ(0)' }}>
          {display}
        </div>
      </div>
    );
  }
  // Expose a quick setter for the dev console: window.__drop_setGridCount(n)
  useEffect(() => {
    try {
      (window as any).__drop_setGridCount = (n: number) => {
        const v = Number(n) || 0;
        setGridCount(Math.max(0, Math.min(36, Math.floor(v))));
        console.log('[DEV] gridCount set to', v);
      };
    } catch { /* ignore */ }
    return () => { try { delete (window as any).__drop_setGridCount; } catch {} };
  }, []);

  // Watch collection `drop-vault-entries` and build a list of image URLs (drop-image) for tiles
  useEffect(() => {
    try {
      const fs = getFirestore();
      const colRef = collection(fs, 'drop-vault-entries');
      // current auth uid (reload effect when user logs in/out)
      const uid = authUser?.uid ?? null;

      // Compute user's referral code (from sessionStorage pendingReferral or users/{uid})
      let currentUserReferralCode: string | null = null;
      const loadUserReferral = async () => {
        try {
          if (typeof window !== 'undefined') {
            const pending = sessionStorage.getItem('pendingReferral');
            if (pending) {
              try {
                const p = JSON.parse(pending);
                if (p && typeof p.code === 'string') {
                  currentUserReferralCode = String(p.code);
                  try { console.debug('[drop] loaded pendingReferral from sessionStorage', { pendingCode: currentUserReferralCode }); } catch {}
                    try {
                      const val = `pending=${String(p.code)} uid=${String(uid || '')} loaded=${String(currentUserReferralCode)}`;
                      try { sessionStorage.setItem('__drop_ref_debug_str', val); } catch {}
                    } catch {}
                  return;
                }
              } catch {}
            }
          }
          if (uid) {
            try {
              const uSnap = await getDoc(doc(fs, 'users', uid));
              if (uSnap.exists()) {
                const ud = uSnap.data() || {};
                const candidates = [
                  ud.referredBy,
                  ud.referred_by,
                  ud.referredFrom,
                  ud.referred_from,
                  ud.referrer,
                  ud.referralCode,
                  ud.referral_code,
                  ud.referredCode,
                  ud.referred_code,
                ];
                for (const c of candidates) {
                  if (typeof c === 'string' && c.length > 0) {
                    currentUserReferralCode = c;
                    try { console.debug('[drop] loaded referral from users/{uid}', { uid, currentUserReferralCode }); } catch {}
                    try {
                      const val = `pending=${String(sessionStorage.getItem('pendingReferral') || '')} uid=${String(uid || '')} loaded=${String(currentUserReferralCode)}`;
                      try { sessionStorage.setItem('__drop_ref_debug_str', val); } catch {}
                    } catch {}
                    break;
                  }
                }
              }
            } catch (e) {
              /* ignore */
            }
          }
        } catch { /* ignore */ }
      };

      // initial load
      loadUserReferral();

      const unsub = onSnapshot(colRef, (snap) => {
        (async () => {
          try {
            // ensure latest referral info available before processing entries
            await loadUserReferral();
            if (snap.empty) {
              setGridImages([]);
              setGridCount(0);
              return;
            }
            // Map documents to entries array
            const entries: Array<any> = [];
            snap.forEach(docSnap => {
              const data = docSnap.data() || {};
              entries.push({ ...(data as any), __id: docSnap.id });
            });

            const itemsArr: Array<{ id?: string | null; src: string; toMs?: number | null; headline?: string | null; subtitle?: string | null; content?: string | null; interval?: string | undefined; withCode?: string | null }> = [];
            const nowServerMs = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);
            for (const node of entries) {
              try {
                // Default for this entry
                let entryToMs: number | null = null;

                // Respect optional publishing window: node.public.from / node.public.to
                try {
                  const pub = node?.public || node?.meta || null;
                  if (pub) {
                    const fromRaw = pub?.from ?? pub?.start ?? null;
                    const toRaw = pub?.to ?? pub?.end ?? null;
                    let fromMs: number | null = null;
                    let toMs: number | null = null;
                    if (fromRaw) {
                      const d = (fromRaw?.toMillis ? fromRaw.toMillis() : (typeof fromRaw === 'number' ? fromRaw : Date.parse(String(fromRaw))));
                      fromMs = Number.isFinite(d) ? Number(d) : null;
                    }
                    if (toRaw) {
                      const d = (toRaw?.toMillis ? toRaw.toMillis() : (typeof toRaw === 'number' ? toRaw : Date.parse(String(toRaw))));
                      toMs = Number.isFinite(d) ? Number(d) : null;
                    }
                    entryToMs = toMs ?? null;
                    if ((fromMs && nowServerMs < fromMs) || (toMs && nowServerMs >= toMs)) {
                      // Not yet public or already expired — skip this entry
                      if (process.env.NODE_ENV !== 'production') {
                        try {
                          const label = node?.id || node?.name || node?.title || '<unknown>';
                          console.debug('[drop] skipping entry by public window', { label, fromMs, toMs, nowServerMs });
                        } catch { /* ignore */ }
                      }
                      continue;
                    }
                  }
                } catch (pf) {
                  // ignore public parsing errors and fall back to showing entry
                }

                const srcRaw = node?.['drop-image'] || node?.['dropImage'] || node?.['image'] || node?.['img'] || null;
                const headline = node?.headline ?? node?.title ?? node?.name ?? null;
                const subtitle = node?.subtitle ?? node?.desc ?? node?.description ?? null;
                const content = node?.content ?? node?.text ?? node?.body ?? null;
                const withCode = (node?.withCode ?? node?.with_code ?? node?.withcode ?? null) as string | null;
                if (!srcRaw) {
                  const interval = (node?.interval ?? node?.public?.interval) || undefined;
                  itemsArr.push({ id: node?.__id ?? node?.id ?? null, src: '/error-frame.svg', toMs: entryToMs, headline, subtitle, content, interval, withCode });
                  continue;
                }
                const src = String(srcRaw);
                // Gate by optional withCode: if entry defines a withCode and it's non-empty,
                // only show this entry if the current user was referred by that code.
                if (withCode && String(withCode).trim().length > 0) {
                  try { console.debug('[drop] gating: entry has withCode', { entryId: node?.__id ?? node?.id ?? null, withCode }); } catch {}
                  // if user has no referral code, hide gated entries
                  if (!currentUserReferralCode || String(currentUserReferralCode).trim() !== String(withCode).trim()) {
                    try { console.debug('[drop] gating: skipping entry due to mismatch', { entryId: node?.__id ?? node?.id ?? null, currentUserReferralCode, withCode }); } catch {}
                    // skip this entry
                    continue;
                  }
                  try { console.debug('[drop] gating: allowed entry as referral matches', { entryId: node?.__id ?? node?.id ?? null, currentUserReferralCode, withCode }); } catch {}
                }
                if (!/^https?:\/\//i.test(src) && !src.startsWith('/')) {
                  try {
                    const resolved = await getCachedDownloadURL(src);
                    const interval = (node?.interval ?? node?.public?.interval) || undefined;
                    itemsArr.push({ id: node?.__id ?? node?.id ?? null, src: resolved || '/error-frame.svg', toMs: entryToMs, headline, subtitle, content, interval, withCode });
                    continue;
                  } catch (err) {
                    console.warn('[drop] failed to resolve storage path', src, err);
                    itemsArr.push({ id: node?.__id ?? node?.id ?? null, src: '/error-frame.svg', toMs: entryToMs, headline, subtitle, content });
                    continue;
                  }
                }
                const interval2 = (node?.interval ?? node?.public?.interval) || undefined;
                itemsArr.push({ id: node?.__id ?? node?.id ?? null, src, toMs: entryToMs, headline, subtitle, content, interval: interval2, withCode });
              } catch (err) {
                itemsArr.push({ id: null, src: '/error-frame.svg', toMs: null, headline: null, subtitle: null, content: null });
              }
            }

            setGridItems(itemsArr.slice(0, 36));
            setGridImages(itemsArr.map(i => i.src).slice(0, 36));
            setGridCount(Math.max(0, Math.min(36, itemsArr.length)));
          } catch (e) {
            console.warn('[drop] parse drop-vault snapshot failed', e);
          }
        })();
      }, (err) => {
        console.warn('[drop] snapshot error for drop-vault', err);
      });
      return () => { try { unsub(); } catch {} };
    } catch (e) {
      console.warn('[drop] failed to subscribe to config/drop-vault', e);
    }
  }, [authUser?.uid]);
  // FAQ open state: which item is expanded (null = none)
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  // FAQ tab state (grouped sections)
  const [faqTab, setFaqTab] = useState<'minigames' | 'tickets' | 'coins' | 'support'>('minigames');

  // drop-spezifische FAQ-Gruppen
  const faqGroups: Record<string, Array<{ question: string; answer: string }>> = {
    minigames: [
      {
        question: 'Wie funktionieren die Minigames?',
        answer:
          'Minigames sind kleine Spiele, die du direkt im Browser spielen kannst. Für jede Runde erhältst du Coins und manchmal auch Tickets. Die Auswahl der Minigames ändert sich regelmäßig.',
      },
      {
        question: 'Wie oft kann ich Minigames spielen?',
        answer:
          'Du kannst Minigames beliebig oft spielen. Für die Teilnahme an Verlosungen zählen jedoch nur die ersten Runden pro Tag, abhängig vom jeweiligen Spiel.',
      },
      {
        question: 'Warum laden manche Minigames nicht?',
        answer:
          'Stelle sicher, dass du eine stabile Internetverbindung hast und kein Adblocker aktiv ist. Bei Problemen hilft ein Neuladen der Seite oder das Löschen des Browser-Caches.',
      },
      {
        question: 'Welche Belohnungen gibt es in Minigames?',
        answer:
          'Du kannst Coins, Tickets und manchmal exklusive Items gewinnen. Die Belohnungen variieren je nach Spiel und Tagesaktion.',
      },
    ],
    tickets: [
      {
        question: 'Was sind Tickets und wie bekomme ich sie?',
        answer:
          'Tickets sind deine Teilnahmeberechtigungen für die tägliche Verlosung. Du erhältst Tickets durch das Spielen von Minigames, besondere Aktionen oder als Belohnung für Streaks.',
      },
      {
        question: 'Wie läuft die Verlosung ab?',
        answer:
          'Jeden Abend um 20:00 Uhr werden die Gewinner unter allen Ticket-Besitzern ausgelost. Je mehr Tickets du hast, desto höher sind deine Gewinnchancen.',
      },
      {
        question: 'Kann ich Tickets übertragen oder verschenken?',
        answer:
          'Tickets sind nicht übertragbar und können nur vom eigenen Account genutzt werden.',
      },
      {
        question: 'Wie hoch sind meine Gewinnchancen?',
        answer:
          'Deine Gewinnchance steigt mit der Anzahl deiner Tickets. Die genaue Wahrscheinlichkeit hängt von der Gesamtzahl aller Tickets am Tag ab.',
      },
      {
        question: 'Was passiert, wenn ich gewinne?',
        answer:
          'Du wirst per Benachrichtigung und E-Mail informiert. Dein Gewinn erscheint direkt in deinem Account oder wird dir zugeschickt.',
      },
    ],
    coins: [
      {
        question: 'Wie kann ich Coins verdienen?',
        answer:
          'Coins bekommst du für das Spielen von Minigames, tägliche Logins, das Einladen von Freunden und das Abschließen von Aufgaben. Coins kannst du gegen Prämien eintauschen.',
      },
      {
        question: 'Wofür kann ich Coins verwenden?',
        answer:
          'Du kannst Coins im Shop gegen Items eintauschen und für die Teilnahme an Giveaways verwenden. Preise erhältst du ausschließlich über Verlosungen, nicht direkt für Coins.',
      },
      {
        question: 'Verfallen meine Coins?',
        answer:
          'Coins verfallen nicht, solange dein Account aktiv bleibt. Bei längerer Inaktivität kann es jedoch zu einer Löschung kommen.',
      },
      {
        question: 'Was sind Coin-Boosts?',
        answer:
          'Coin-Boosts sind zeitlich begrenzte Aktionen, bei denen du für bestimmte Aufgaben oder Spiele mehr Coins erhältst.',
      },
      {
        question: 'Kann ich Coins mit anderen tauschen?',
        answer:
          'Ein direkter Tausch von Coins ist nicht möglich. Du kannst aber Freunde einladen und gemeinsam Belohnungen sammeln.',
      },
    ],
    support: [
      {
        question: 'Ich habe ein technisches Problem – was tun?',
        answer:
          'Prüfe zunächst, ob du die neueste Browserversion verwendest und alle Updates installiert sind. Bei anhaltenden Problemen kontaktiere den Support über das Kontaktformular.',
      },
      {
        question: 'Wie sicher sind meine Daten bei drop?',
        answer:
          'Deine Daten werden nach aktuellen Standards verschlüsselt und nicht an Dritte weitergegeben. Details findest du in unserer Datenschutzerklärung.',
      },
      {
        question: 'Wie kann ich den Support erreichen?',
        answer:
          'Du erreichst uns über das Kontaktformular oder per E-Mail an support@drop-app.de. Wir antworten in der Regel innerhalb von 24 Stunden.',
      },
      {
        question: 'Wie kann ich meinen Account schützen?',
        answer:
          'Nutze ein sicheres Passwort und teile deine Zugangsdaten niemals mit anderen.',
      },
      {
        question: 'Gibt es eine drop-Community?',
        answer:
          'Ja! Du kannst dich mit anderen Nutzern im Community-Bereich austauschen, an Events teilnehmen und Tipps teilen.',
      },
    ],
  };

  useEffect(() => {
    const footer = footerSectionRef.current;
    if (!footer) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const rootForIo = null; // always use the viewport as root
    console.log('SNAP_DEBUG footer IO attached (root=viewport)');

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        try {
          if ((window as any).__drop_snapping) {
            console.log('SNAP_DEBUG footer IO skipped due to programmatic snap');
            continue;
          }
        } catch { /* ignore */ }

        const ratio = e.intersectionRatio || 0;
        console.log('SNAP_DEBUG footer IO', { isIntersecting: e.isIntersecting, ratio });
        // if footer is at least 60% visible within the scroll container/viewport, hide topbar
        if (e.isIntersecting && ratio >= 0.6) {
          setHideTopOnFooter(true);
        } else {
          setHideTopOnFooter(false);
        }
      }
    }, { root: rootForIo, threshold: [0.0, 0.25, 0.5, 0.6, 0.75, 1.0] });

    io.observe(footer);
    return () => io.disconnect();
  }, []);

  // Development-only debug: determine which element actually scrolls and
  // dump computed styles relevant to scroll-snap. Logs only in dev mode.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (typeof window === 'undefined') return;
  const container = scrollContainerRef.current;
  if (!container) return;
  const c = container as HTMLDivElement;
    let lastScrollTop = container.scrollTop;
    let prevWindowY = typeof window !== 'undefined' ? window.scrollY : 0;
    let lastWindowY = prevWindowY;
  // Throttle RAF variable for logging
  let raf = 0 as number | null;

    function dumpStyles(el: Element | null, name: string) {
      if (!el) return;
      try {
        const cs = window.getComputedStyle(el as Element);
        console.log('SNAP_DEBUG styles for', name, {
          overflow: cs.overflow,
          overflowY: cs.overflowY,
          scrollSnapType: cs.getPropertyValue('scroll-snap-type'),
          transform: cs.transform,
          willChange: cs.willChange,
        });
      } catch (err) { console.warn('SNAP_DEBUG failed to read styles for', name, err); }
    }

  function onScroll() {
    // Skip expensive debug operations in scroll handler
    // RAF is not necessary here since scroll events are already throttled by browser
    try {
      const st = c.scrollTop;
      lastScrollTop = st;
      prevWindowY = typeof window !== 'undefined' ? window.scrollY : prevWindowY;
      lastWindowY = prevWindowY;
      // Minimize debug output - only on resize, not on every scroll
    } catch (err) {
      console.warn('SNAP_DEBUG onScroll error', err);
    }
  }

    // Let CSS handle scroll-snap natively first, fallback only if needed
    // Uncomment below lines only if native scroll-snap doesn't work
    // const containerScrollableNow = c.scrollHeight > c.clientHeight;
    // if (containerScrollableNow) {
    //   c.addEventListener('scroll', scheduleSnap, { passive: true });
    //   console.log('SNAP_DEBUG attached scheduleSnap to container');
    // } else {
    //   window.addEventListener('scroll', scheduleSnap, { passive: true });
    //   console.log('SNAP_DEBUG attached scheduleSnap to window');
    // }

    // Verify scroll-snap is working and apply it to the correct element
    function ensureScrollSnap() {
      try {
        const containerScrollable = c.scrollHeight > c.clientHeight;
        const docEl = document.scrollingElement as HTMLElement | null;
        
        console.log('SCROLL-SNAP DEBUG:', {
          containerScrollable,
          containerScrollHeight: c.scrollHeight,
          containerClientHeight: c.clientHeight,
          windowScrollY: window.scrollY,
          documentScrollTop: docEl?.scrollTop || 0
        });
        
        // Apply scroll-snap to the element that actually scrolls (no padding needed)
        if (containerScrollable) {
          // Container scrolls - apply to container
          c.style.scrollSnapType = 'y mandatory';
          console.log('Applied scroll-snap to container');
        } else {
          // Document scrolls - apply to document
          if (docEl) {
            docEl.style.scrollSnapType = 'y mandatory';
            console.log('Applied scroll-snap to document');
          }
          // Also ensure body/html don't interfere
          document.body.style.scrollSnapType = 'y mandatory';
          document.documentElement.style.scrollSnapType = 'y mandatory';
        }
        
        return () => {
          // Cleanup on unmount
          try {
            if (containerScrollable) {
              c.style.removeProperty('scroll-snap-type');
            } else {
              if (docEl) {
                docEl.style.removeProperty('scroll-snap-type');
              }
              document.body.style.removeProperty('scroll-snap-type');
              document.documentElement.style.removeProperty('scroll-snap-type');
            }
          } catch { /* ignore */ }
        };
      } catch (e) {
        console.warn('Failed to ensure scroll-snap:', e);
        return () => {};
      }
    }

    const ensureCleanup = ensureScrollSnap();

    // Attach scroll listener to container for debug logging
    try {
      c.addEventListener('scroll', onScroll, { passive: true });
  } catch { /* ignore */ }

    return () => {
      try { c.removeEventListener('scroll', onScroll); } catch {}
      if (raf) cancelAnimationFrame(raf as number);
      try {
        if (typeof ensureCleanup === 'function') ensureCleanup();
      } catch { /* ignore */ }
    };
    // Intentionally no dependencies: we only want to attach once on mount
  }, []);

  // Scroll restoration: Nach F5 immer oben starten
  useLayoutEffect(() => {
    if (typeof window !== 'undefined') {
      // Browser-Scroll-Restoration deaktivieren
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
      }
      
      // Beim Mount zur Spitze scrollen - aber erst nach kurzer Verzögerung
      const scrollToTop = () => {
        const container = scrollContainerRef.current;
        if (container) {
          // Force scroll to top
          container.scrollTop = 0;
          console.log('Scrolled container to top');
        }
      };
      
      // Immediate scroll + delayed scroll to ensure it works
      scrollToTop();
      setTimeout(scrollToTop, 100);
    }
  }, []);

  // CSS-driven ticker: measure once and use GPU-accelerated CSS animation
  // Note: Ticker always runs, even in reduced-motion mode (important content)
  useEffect(() => {
    const span = smallTickerSpanRef.current;
    if (!span) return;
    if (typeof window === 'undefined') return;

  // ensure base styles
    span.style.position = 'absolute';
    span.style.top = '50%';
    span.style.left = '0';
    span.style.whiteSpace = 'nowrap';
    span.style.willChange = 'transform';
    span.style.backfaceVisibility = 'hidden';
    span.style.transform = 'translateZ(0) translateY(-50%)';
    (span as any).style.WebkitAcceleration = 'true';

    function startCssTicker() {
      if (!span) return;
      // measure text width once
      const rect = span.getBoundingClientRect();
      const textWidth = rect.width || span.offsetWidth || 0;
      const distance = window.innerWidth + textWidth;
  const speed = 80; // px/s — much slower for better readability
  // ensure a minimum duration so very short messages are readable
  const duration = Math.max(8, distance / speed);
      span.style.animationDuration = `${duration}s`;
      // set CSS variables so the keyframes start/end exactly off-screen
      span.style.setProperty('--startX', `${window.innerWidth}px`);
      span.style.setProperty('--endX', `${-textWidth}px`);
      // add the css-anim marker class (selector: .small-ticker-text.css-anim)
      span.classList.add('css-anim');
    }

    function stopCssTicker() {
      if (!span) return;
      span.classList.remove('css-anim');
      span.style.removeProperty('animation-duration');
      span.style.removeProperty('--startX');
      span.style.removeProperty('--endX');
    }

    startCssTicker();

    const onResize = () => {
      // restart animation on resize to recalc width/duration
      stopCssTicker();
      // next frame ensure reflow before restarting
      requestAnimationFrame(() => startCssTicker());
    };

    let resizeTimeout: NodeJS.Timeout | null = null;
    const debouncedResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        onResize();
        resizeTimeout = null;
      }, 300);
    };

    window.addEventListener('resize', debouncedResize, { passive: true });

    return () => {
      window.removeEventListener('resize', debouncedResize);
      if (resizeTimeout) clearTimeout(resizeTimeout);
      stopCssTicker();
    };
  }, [smallTicker]);
  // Readiness flags for images
  const [collageReady, setCollageReady] = useState(false);
  const [gameReady, setGameReady] = useState(false);
  const [minigameResolved, setMinigameResolved] = useState(false);
  // Image preloading state & cache: ensure grid images are preloaded during initial loading
  const [imagesPreloaded, setImagesPreloaded] = useState(false);
  const preloadCacheRef = useRef<Set<string> | null>(null);

  // Preload image URLs from gridImages during initial load. Wait until all
  // images are loaded or a global timeout fires. Uses a simple in-memory cache
  // to avoid reloading the same URLs across mounts.
  useEffect(() => {
    // Only run preloading on first mount / when gridImages changes and initial load not done
    if (initialLoadDone) return;
    if (!Array.isArray(gridImages) || gridImages.length === 0) {
      // Nothing to preload — mark as done quickly
      setImagesPreloaded(true);
      return;
    }

    if (!preloadCacheRef.current) preloadCacheRef.current = new Set<string>();
    const cache = preloadCacheRef.current;

    let cancelled = false;
    let finished = false;

    // Helper to load a single image with timeout
    function loadOne(src: string, timeoutMs = 3000): Promise<void> {
      return new Promise((resolve) => {
        if (cache.has(src)) return resolve();
        const img = new Image();
        let to: number | null = null;
        const done = (ok: boolean) => {
          if (to) { window.clearTimeout(to); to = null; }
          try { img.onload = img.onerror = null; } catch {}
          if (ok) cache.add(src);
          resolve();
        };
        img.onload = () => done(true);
        img.onerror = () => {
          console.warn('[drop] preload failed for', src);
          done(false);
        };
        try {
          img.src = src;
        } catch (e) {
          console.warn('[drop] preload exception for', src, e);
          done(false);
        }
        to = window.setTimeout(() => { done(false); }, timeoutMs);
      });
    }

    (async () => {
      try {
        const urls = gridImages.slice(0, 36).filter(Boolean).map(String);
        const tasks: Promise<void>[] = [];
        for (const u of urls) tasks.push(loadOne(u, 3000));

        // Global timeout to avoid blocking forever (6s)
        const global = new Promise<void>((res) => setTimeout(res, 6000));
        await Promise.race([Promise.all(tasks).then(() => undefined), global.then(() => undefined)]);
        if (!cancelled) {
          finished = true;
          setImagesPreloaded(true);
        }
      } catch (e) {
        if (!cancelled) setImagesPreloaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, [gridImages, initialLoadDone]);

  // Compute initial readiness: collage image, minigame config, and prize pool config
  useEffect(() => {
    const ready = collageReady && minigameResolved && (!gameUrl || gameReady) && prizePoolLoaded && poolLevelServerLoaded && imagesPreloaded;
    if (!initialLoadDone) {
      if (ready) {
        setInitialLoadDone(true);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }
  }, [collageReady, minigameResolved, gameUrl, gameReady, prizePoolLoaded, initialLoadDone, poolLevelServerLoaded]);
  
  // Check for reduced motion preference (early declaration for all animations)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // cycle logo animation: 0..5 every 15s (6 variants) - increased interval for better performance
  const [logoAnim, setLogoAnim] = useState<number>(0);
  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = setInterval(() => setLogoAnim(v => (v + 1) % 6), 15000);
    return () => clearInterval(id);
  }, [prefersReducedMotion]);

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
  const pos = currentDailyPos();           // 1..len
  if (dailySpecialItems[pos]) return 0;    // keine Diamanten an 7/14
  const idx = Math.max(0, Math.min(len - 1, pos - 1));
  return dailyRewards[idx] || 0;
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
  const [showAccount, setShowAccount] = useState<boolean>(false);
  const [showItems, setShowItems] = useState<boolean>(false);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  
  // Login-Modal öffnen, sobald loading beendet, hydrated und shouldOpenLogin true ist
  useEffect(() => {
    if (!loading && isHydrated && shouldOpenLogin) {
      setShowAccount(true);
      setShouldOpenLogin(false); // nur einmal triggern
      // Query-Parameter aus URL entfernen
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('login');
        window.history.replaceState({}, '', url.toString());
      } catch {}
    }
  }, [loading, isHydrated, shouldOpenLogin]);
  
  // Function to close all modals before opening a new one
  const closeAllModals = () => {
    setShowDaily(false);
    setShowAccount(false);
    setShowItems(false);
    setShowNotifications(false);
    setShowPool(false);
    // also close the grid popup if open
    try { setPopupLoading(false); setActiveTile(null); } catch {}
  };

  // When any modal is open, prevent background/page scrolling
  // but still allow scrolling inside the modal itself. We do this by
  // locking body scroll (overflow: hidden) and preventing touchmove on the
  // document while any modal is open. We restore previous values on close.
  useEffect(() => {
    let prevOverflow: string | null = null;
    let prevTouchAction: string | null = null;
    function preventTouch(e: TouchEvent) {
      // allow if the target is inside any modal scroll container
      const modalScroll = document.querySelector('.account-modal-scroll') as Element | null;
      if (modalScroll && modalScroll.contains(e.target as Node)) return;
      // also allow if target is inside fixed modals
      const target = e.target as Element;
      if (target?.closest('[className*="fixed"][className*="inset-0"]')) return;
      e.preventDefault();
    }

    // Check if any modal is open
    const isAnyModalOpen = showAccount || showDaily || showItems || showNotifications || showPool || showTest || activeTile !== null;

    if (isAnyModalOpen) {
      try {
        prevOverflow = document.body.style.overflow || null;
        prevTouchAction = document.documentElement.style.touchAction || null;
        document.body.style.overflow = 'hidden';
        // prevent passive touchmove from scrolling the background on mobile
        document.documentElement.style.touchAction = 'none';
        document.addEventListener('touchmove', preventTouch, { passive: false });
      } catch { /* ignore */ }
    }

    return () => {
      try {
        if (prevOverflow !== null) document.body.style.overflow = prevOverflow; else document.body.style.removeProperty('overflow');
        if (prevTouchAction !== null) document.documentElement.style.touchAction = prevTouchAction; else document.documentElement.style.removeProperty('touch-action');
        document.removeEventListener('touchmove', preventTouch as EventListener);
      } catch (e) { /* ignore */ }
    };
  }, [showAccount, showDaily, showItems, showNotifications, showPool, showTest, activeTile]);
  
  // Adblock detector
  const [adblockDetected, setAdblockDetected] = useState<boolean>(false);
  const [adblockDismissed, setAdblockDismissed] = useState<boolean>(false);
  // --- Adblock detection: DOM bait + network bait + fetch probe (robust) ---
  useEffect(() => {
    let cancelled = false;

    // signal states
    let baitHidden = false;           // DOM bait removed/hidden
    let scriptBlocked: boolean | null = null; // external ads script failed
    let fetchBlocked: boolean | null = null;  // fetch probe failed

    const settle = () => {
      if (cancelled) return;
      // votes: network signals count heavier
      const votes = (baitHidden ? 1 : 0) + (scriptBlocked === true ? 2 : 0) + (fetchBlocked === true ? 2 : 0);
      const detected = (scriptBlocked === true) || (fetchBlocked === true) || votes >= 2; // majority OR any hard network block
      setAdblockDetected(detected);
    };

    // 1) DOM bait many blockers hide
    const bait = document.createElement('div');
    bait.className = 'adsbox ad adsbygoogle ad-banner ad-unit ad-container sponsored advertisement';
    bait.style.cssText = 'position:absolute; left:-9999px; top:-9999px; width:300px; height:250px; pointer-events:none; opacity:0;';
    bait.innerHTML = '&nbsp;';
    document.body.appendChild(bait);

    const checkBait = () => {
      try {
        const cs = window.getComputedStyle(bait);
        const zeroSize = (bait.offsetHeight === 0 && bait.offsetWidth === 0) || (parseInt(cs.height || '0', 10) === 0);
        const hidden = cs.display === 'none' || cs.visibility === 'hidden' || zeroSize || !bait.isConnected;
        baitHidden = hidden;
      } catch {
        baitHidden = true;
      } finally {
        settle();
      }
    };

    // 2) Script probe to a well‑known ads script (most blockers stop this)
    const s = document.createElement('script');
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
    s.async = true;
    s.onload = () => { if (!cancelled) { scriptBlocked = false; settle(); } };
    s.onerror = () => { if (!cancelled) { scriptBlocked = true; settle(); } };
    document.head.appendChild(s);

    // 3) Fetch probe (no‑cors) — adblockers typically cancel these requests
    (async () => {
      try {
        const ctrl = new AbortController();
        const to = window.setTimeout(() => ctrl.abort(), 2500);
        try {
          // most blockers cancel to *.googlesyndication.com; opaque ok, abort/error => blocked
          const res = await fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', { mode: 'no-cors', signal: ctrl.signal });
          fetchBlocked = false; // request was not actively blocked
        } catch {
          fetchBlocked = true;
        } finally {
          window.clearTimeout(to);
          settle();
        }
      } catch {
        fetchBlocked = null; // leave undecided
        settle();
      }
    })();

    // initial and delayed DOM bait checks
    requestAnimationFrame(() => requestAnimationFrame(checkBait));
    const retry = window.setTimeout(checkBait, 1500);

    return () => {
      cancelled = true;
      try { bait.remove(); } catch {}
      try { s.remove(); } catch {}
      window.clearTimeout(retry);
    };
  }, []);
  
  // Block scroll when adblock modal is visible
  useEffect(() => {
    if (adblockDetected && !adblockDismissed) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      };
    }
  }, [adblockDetected, adblockDismissed]);

  const [claimError, setClaimError] = useState<string | null>(null);
  // --- Item System --- (Firestore-driven)
  // Firestore: config/shop
  // { items: { double_xp: { name: string, desc: string, price: number, active?: boolean }, double_tickets: { ... } } }
type ShopItem = { id: 'double_xp'|'double_tickets'|'ad_20_coins'; name: string; desc: string; price: number; active?: boolean; icon?: string };
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);

  type ItemId = 'double_xp' | 'double_tickets' | 'ad_20_coins';
  const [itemsOwned, setItemsOwned] = useState<Record<ItemId, number>>({ double_xp: 0, double_tickets: 0, ad_20_coins: 0 });
  const [buyBusy, setBuyBusy] = useState<Record<ItemId, boolean>>({ double_xp: false, double_tickets: false, ad_20_coins: false });
  const [buyError, setBuyError] = useState<string | null>(null);
  const [effects, setEffects] = useState<Record<ItemId, { active?: boolean; untilMs?: number }>>({
    double_xp: {},
    double_tickets: {},
    ad_20_coins: {},
  });
  // live timer inside Items modal
  const [itemsTick, setItemsTick] = useState(0);
  const [nowMsItems, setNowMsItems] = useState<number>(0);

  useEffect(() => {
    if (!showItems) return;
    // Start a 1s tick while the Items modal is open so the remaining timers update live.
    // Prefer server-synced time if available (serverNowBaseRef + perf delta), else fallback to Date.now().
    const update = () => {
      const baseReady = serverNowBaseRef.current > 0 && perfBaseRef.current > 0;
      const now = baseReady ? Math.floor(serverNowBaseRef.current + (performance.now() - perfBaseRef.current)) : Date.now();
      setNowMsItems(now);
      // also advance a tick counter for any derived effects (forces re-render)
      setItemsTick((t) => (t + 1) % 1000000);
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
      // { items: { double_xp: { name, desc, price, active }, double_tickets: {...}, ad_20_coins: {...} } }
      const raw = data?.items || {};
      const out: ShopItem[] = [];
      // double_tickets from config if present
      const dt = raw['double_tickets'];
      if (dt && typeof dt.price === 'number') {
        out.push({
          id: 'double_tickets',
          name: dt.name || 'Doppelte Tickets',
          desc: dt.desc || '',
          price: dt.price,
          icon: '/icons/double_tickets.svg', // von .png zu .svg geändert
          active: dt.active !== false,
        });
      }
      // ad_20_coins: default enabled unless explicitly disabled in config
      const ad = raw['ad_20_coins'];
      if (!ad || ad?.active !== false) {
        out.push({
          id: 'ad_20_coins',
          name: (ad?.name) || 'Gratis Coins',
          desc: (ad?.desc) || '',
          price: typeof ad?.price === 'number' ? ad.price : 25, // von 20 auf 25 geändert
          icon: '/icons/coin-stack.svg',
          active: true,
        });
      }
      setShopItems(out);
    }, () => setShopItems([]));
    return () => unsub();
  }, []);
  const [streak, setStreak] = useState<number>(0);
  const [claimedToday, setClaimedToday] = useState<boolean>(false);
  // Daily rewards: 14 Tage, Darstellung in 2 Reihen à 7
  const dailyRewards = [
    5, 5, 5, 10, 5,   // 1–5T
    5, 10, 5, 5, 5,   // 6–10  (Tag 7 = 10 Diamanten, Tag 8 = 5)
    10, 5, 5, 15      // 11–14
  ];
  // Special daily items: only day 14 → double_tickets
  const dailySpecialItems: Record<number, { id: ItemId; label: string; emoji: string }> = {
    14: { id: 'double_tickets', label: '2× Tickets', emoji: '🎟️' },
  };

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
    setClaimError(null);
    setClaimLoading(true);
    try {
      const fsNow = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);
      // Determine today’s reward index 1..14 using same logic as UI
      const dayPos = currentDailyPos();
      const special = dailySpecialItems[dayPos];
      const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'claimDaily');
      const res: any = await fn(special ? { requestItem: special.id } : {});
      console.log('[claimDaily] response', res?.data);
      if (res?.data?.ok === true) {
        startConfetti();
        setClaimedToday(true);
      } else if (res?.data?.code === 'already-claimed') {
        setClaimedToday(true);
      } else {
        const msg = res?.data?.message || 'Claim fehlgeschlagen';
        setClaimError(msg);
        console.error('[claimDaily] failed', res?.data);
      }
      // coins/streak/lastClaim werden via onSnapshot aktualisiert
  } catch (e) {
      const rawMsg = e?.message || String(e);
      const msg = (typeof rawMsg === 'string') ? rawMsg.toLowerCase() : '';
      const code = (e?.code || e?.name || '').toString().toLowerCase();
      const already = msg.includes('already-claimed') || code.includes('already-claimed') || (e?.details && JSON.stringify(e.details).includes('already-claimed'));
      if (already) {
        try {
          const fs = getFirestore();
          const now = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);
          const todayId = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
          const snap = await getDoc(doc(fs, 'users', uid!, 'claims', todayId));
          if (snap.exists()) {
            setClaimedToday(true);
            setClaimError(null);
            console.warn('[claimDaily] already-claimed verified by Firestore');
          } else {
            setClaimedToday(false);
            setClaimError('Bereits eingelöst gemeldet, aber kein Nachweis gefunden.');
            console.warn('[claimDaily] already-claimed without claim doc');
          }
        } catch (vErr) {
          setClaimError('Bereits eingelöst gemeldet, Prüfung fehlgeschlagen.');
          console.error('[claimDaily] verify error', vErr);
        }
      } else {
        const details = e?.details ? ` (${JSON.stringify(e.details)})` : '';
        setClaimError(`Fehler: ${code || 'unknown'}${details ? ' ' + details : ''}`);
        console.error('[claimDaily] exception', e);
      }
    } finally {
      setClaimLoading(false);
    }
  }

  // Erweitere die Hilfsfunktionen um ticketsDateIdFromMs
  function ticketsDateIdFromMs(ms: number): string {
    const parts = berlinPartsFromMs(ms);
    const minutes = parts.hour * 60 + parts.minute + parts.second / 60;
    const cutoff = 20 * 60 + 15; // 20:15 Berlin time
    let target = { year: parts.year, month: parts.month, day: parts.day };
    const afterCutoff = minutes >= cutoff;
    
    if (afterCutoff) {
      target = shiftBerlinDay(target, 1); // Show tomorrow's tickets after 20:15
    }
    // Before 20:15: show today's tickets
    
    // DEBUG: Log tickets calculation
    const timeStr = `${String(parts.hour).padStart(2,'0')}:${String(parts.minute).padStart(2,'0')}:${String(parts.second).padStart(2,'0')}`;
    const resultDate = formatBerlinDay(target);
    console.log(`[ticketsDateIdFromMs] Berlin: ${timeStr}, minutes: ${minutes.toFixed(1)}, >= ${cutoff}? ${afterCutoff}, result: ${resultDate}`);
    
    return resultDate;
  }

  const [serverOffset, setServerOffset] = useState<number>(0); // ms: serverNow = Date.now() + serverOffset

  const areaRef = useRef<HTMLDivElement>(null);
  const serverNowBaseRef = useRef<number>(0); // epoch ms at last sync
  const perfBaseRef = useRef<number>(0);      // performance.now() at last sync




  function fmt(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
  }

  function berlinTodayId() {
    return raffleCollectionDateIdFromMs(Date.now());
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

  function fmtMS(ms: number) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    return `${m}:${sec}`;
  }

  // Compute next rotation timestamp at hours 0,5,10,15,20 (Berlin-local) coming after nowMs
  function nextLocal5hMsFrom(nowMs: number) {
    const d = new Date(nowMs);
    d.setMinutes(0, 0, 0);
    const h = d.getHours();
    // allowed hours array
    const allowed = [0, 5, 10, 15, 20];
    // find next allowed hour strictly after current hour
    let nextHour = allowed.find(a => a > h);
    if (nextHour === undefined) {
      // wrap to next day's 0 hour
      nextHour = 0;
      d.setDate(d.getDate() + 1);
    }
    d.setHours(nextHour, 0, 0, 0);
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

  const lastClaimMsRef = useRef<number | null>(null);
function berlinYMD(ms: number) {
  const opt: Intl.DateTimeFormatOptions = { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' };
  return new Intl.DateTimeFormat('en-CA', opt).format(new Date(ms));
}
// Robustly compute the epoch ms of Berlin-local midnight (00:00) for a given Y-M-D.
// We scan a ±36h window minute-by-minute to find the timestamp that corresponds
// to Berlin 00:00 for the target date. This avoids hardcoding an offset (+02:00)
// and correctly handles DST switches.
function getBerlinMidnightMs(year: number, month: number, day: number): number | null {
  const utcMid = Date.UTC(year, month - 1, day, 0, 0, 0);
  const start = utcMid - 36 * 60 * 60 * 1000;
  const end = utcMid + 36 * 60 * 60 * 1000;
  for (let t = start; t <= end; t += 60 * 1000) {
    const p = berlinPartsFromMs(t);
    if (p.year === year && p.month === month && p.day === day && p.hour === 0 && p.minute === 0) {
      return t;
    }
  }
  return null;
}
function isBerlinYesterday(lcMs: number | null, nowMs: number) {
  if (!lcMs) return false;
  const DAY = 24 * 60 * 60 * 1000;
  return berlinYMD(lcMs) === berlinYMD(nowMs - DAY);
}
function currentDailyPos() {
  const len = dailyRewards.length;
  if (!streak || streak <= 0) return 1;
  const nowMs = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);
  if (claimedToday) return ((streak - 1) % len) + 1;     // heute schon geholt
  if (isBerlinYesterday(lastClaimMsRef.current, nowMs)) return (streak % len) + 1; // gestern geholt → nächste Kachel
  return 1; // Serie gebrochen → Tag 1
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
        lastClaimMsRef.current = lc ?? null;
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
        setItemsOwned({ double_xp: dx, double_tickets: dt, ad_20_coins: 0 });
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
          ad_20_coins: {},
        });
      } else {
        setCoins(0);
        setStreak(0);
        setClaimedToday(false);
        setItemsOwned({ double_xp: 0, double_tickets: 0, ad_20_coins: 0 });
        setEffects({ double_xp: {}, double_tickets: {}, ad_20_coins: {} });
      }
    });
    return () => unsub();
  }, [uid]);
  // --- Item purchase function ---
  async function watchAdForCoins() {
    if (!uid) { setBuyError('Bitte zuerst einloggen.'); return; }
    setBuyBusy((s) => ({ ...s, ad_20_coins: true }));
    try {
      // TODO: Integrate real rewarded ad SDK. For now, call server to grant reward.
      const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'grantCoinsForAd');
      const res: any = await fn({ reward: 25 }); // von 20 auf 25 geändert
      if (!res || res?.data?.ok !== true) {
        const msg = res?.data?.message || 'Keine Bestätigung vom Server';
        throw new Error(msg);
      }
      // Coins update via onSnapshot listener.
  } catch (e) {
      const msg = e?.message || String(e);
      setBuyError(`Werbung fehlgeschlagen: ${msg}`);
    } finally {
      setBuyBusy((s) => ({ ...s, ad_20_coins: false }));
 }
  }

  async function buyItem(id: ItemId) {
    if (id === 'ad_20_coins') { await watchAdForCoins(); return; }
    if (!uid) { setBuyError('Bitte zuerst einloggen.'); return; }
    setBuyError(null);
    setBuyBusy((s) => ({ ...s, [id]: true }));
    const fs = getFirestore();
    const userRef = doc(fs, 'users', uid);
    // Find the catalog item from shopItems
    const catalogItem = shopItems.find(item => item.id === id);
    // Add debug context for transaction
    const ctx = { uid, itemId: id, catalogItem: catalogItem?.name };
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
  } catch (e) {
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
    if (id === 'ad_20_coins') { await watchAdForCoins(); return; }
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
    let unsub: (() => void) | null = null;
    let currentDayId: string | null = null;

    const subscribeForDay = (dayId: string) => {
      console.log('[tickets] subscribe', { uid, dayId });
      unsub = onSnapshot(
        doc(fs, 'users', uid, 'countersByDay', dayId),
        (snap) => {
          const data: any = snap.exists() ? snap.data() : null;
          const raw = typeof data?.tickets === 'number' ? data.tickets : 0;
          console.log('[tickets] snap', {
            day: dayId,
            exists: snap.exists(),
            fromCache: snap.metadata?.fromCache ?? undefined,
            tickets: data?.tickets,
            data,
          });
          setTicketsToday(Math.max(0, raw));
        },
        (err) => {
          console.warn('[tickets] snap error', err);
          setTicketsToday(0);
        }
      );

      // Hole einmal direkt vom Server für initiale Synchronisation
      getDocFromServer(doc(fs, 'users', uid, 'countersByDay', dayId))
        .then((snap) => {
          const data: any = snap.exists() ? snap.data() : null;
          const raw = typeof data?.tickets === 'number' ? data.tickets : null;
          if (typeof raw === 'number' && isFinite(raw)) {
            setTicketsToday(Math.max(0, raw));
          }
        })
        .catch((err) => {
          console.warn('[tickets] server get error', err);
        });
    };

    const ensureSubscription = () => {
      const serverNow = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);
      // Verwende ticketsDateIdFromMs statt raffleCollectionDateIdFromMs
      const dayId = ticketsDateIdFromMs(serverNow);
      
      // DEBUG: Force refresh for debugging
      const berlinParts = berlinPartsFromMs(serverNow);
      const timeStr = `${String(berlinParts.hour).padStart(2,'0')}:${String(berlinParts.minute).padStart(2,'0')}`;
      console.log(`[tickets ensureSubscription] Berlin: ${timeStr}, dayId: ${dayId}, currentDayId: ${currentDayId}, serverSynced: ${serverNowBaseRef.current > 0}`);
      

      
      if (dayId === currentDayId) return;
      currentDayId = dayId;
      if (unsub) {
        unsub();
        unsub = null;
      }
      setTicketsToday(0);
      subscribeForDay(dayId);
    };

    // FORCE IMMEDIATE REFRESH - Clear currentDayId to ensure subscription updates (only once)
    if (currentDayId) {
      console.log(`[FORCE RESET] Clearing currentDayId from "${currentDayId}" to force refresh`);
      currentDayId = '';
    }
    

    
    ensureSubscription();
    const interval = setInterval(ensureSubscription, 60 * 1000);

    return () => {
      if (unsub) unsub();
      clearInterval(interval);
    };
  }, [uid]);

    useEffect(() => {
      // use local public asset for parallax shadow (not Firebase)
      setShadowUrl("/collage-shadow.png");

      const fs = getFirestore();
      const unsub = onSnapshot(doc(fs, "config", "currentMinigame"), async (snap) => {
        const data = snap.data();
        const serverNow = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);

        if (data) {
          // Prefer authoritative updatedAt + 5h to avoid stale nextAt values from older deployments
          let ts: number | null = null;
          if (data.updatedAt?.toMillis) {
            ts = data.updatedAt.toMillis() + 5 * 60 * 60 * 1000;
          } else if (data.nextAt?.toMillis) {
            ts = data.nextAt.toMillis();
          }

          if (ts != null) {
            // snap to hour boundary for nicer display
            const snapToHour = new Date(ts);
            snapToHour.setMinutes(0, 0, 0);
            ts = snapToHour.getTime();
            if (ts <= serverNow) ts = nextLocal5hMsFrom(serverNow);
            setNextAtMs(ts);
          } else {
            setNextAtMs(nextLocal5hMsFrom(serverNow));
          }
        } else {
          setNextAtMs(nextLocal5hMsFrom(serverNow));
        }
        setMinigameResolved(false);
        try {
          // Derive identifier for current minigame
          const nameSource = (data && (data.slug || data.id || data.key || data.name)) || null;
          let previewUrl: string | null = null;
          if (nameSource) {
            const base = String(nameSource).replace(/\.(png|jpg|jpeg|webp)$/i, '');
            setGameSlug(base); // set slug state for title
            const file = toSlugFilename(base); // e.g. "tap-rush.png"
            if (file) {
              // Use Next.js public asset directly. No HEAD probe.
              const publicUrl = `/minigame-previews/${file}?v=${Date.now()}`;
              previewUrl = publicUrl;
            }
          } else {
            setGameSlug(null);
          }
          setGameReady(!previewUrl);
          setGameUrl(previewUrl);
        } catch (e) {
          setGameUrl(null);
          setGameReady(true);
          setGameSlug(null);
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
  //     totalRewards?: number // total number of cards to show for this level
  //   },
  //   "level-01": { ... }
  //   ...
  //   totalRewards?: number // optional fallback for all levels
  // }
  // Notes:
  // - image accepts Next.js public path starting with "/", Firebase Storage path, or https URL
  // - Collage is now static and loaded from /prizes/drop-collage.png
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

      const levels: PrizeLevel[] = levelEntries.map(([levelKey, levelObj]: [string, any], idx) => {
        const numericIndex = Number.parseInt(levelKey.slice(6), 10);
        const levelIndex = Number.isFinite(numericIndex) ? numericIndex : idx;
        const rawTicketsNeeded = levelObj?.['tickets-needed'];
        const parsedTicketsNeeded = Number(rawTicketsNeeded);
        const ticketsNeeded = Number.isFinite(parsedTicketsNeeded)
          ? parsedTicketsNeeded
          : levelIndex * 100;
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
        return { levelIndex, ticketsNeeded, items, totalRewards: lvlTotal } as PrizeLevel;
      });

      setPrizeLevels(levels);
      // build per-level totals and set current totalRewards
      const fallbackTotal = typeof (data?.totalRewards) === 'number' ? data.totalRewards : 0;
      const totals = levels.map(lv => (typeof lv.totalRewards === 'number' ? lv.totalRewards! : fallbackTotal));
      setLevelTotals(totals);
      const idxForTotal = findLevelArrayIndex(levels, effectivePoolLevel);
      if (idxForTotal >= 0 && idxForTotal < totals.length) {
        setTotalRewards(totals[idxForTotal] || 0);
      } else {
        setTotalRewards(totals[0] || 0);
      }
      // Collage logic removed - now using static collage

      // Select items for current level (capped)
      if (levels.length > 0) {
        const idx = findLevelArrayIndex(levels, poolLevel);
        const safeIdx = idx >= 0 && idx < levels.length ? idx : 0;
        const items = Array.isArray(levels[safeIdx]?.items) ? levels[safeIdx]!.items! : [];
        setPoolItems(items);
      } else {
        setPoolItems([]);
      }

      setPrizePoolLoaded(true);
    }, () => setPoolItems([]));
    return () => unsub();
  }, [effectivePoolLevel]);

  // Update poolItems when poolLevel changes and prizeLevels exists; also update totalRewards for current level
  const memoPoolItems = useMemo(() => {
    if (!prizeLevels || prizeLevels.length === 0) return [];
    const idx = findLevelArrayIndex(prizeLevels, effectivePoolLevel);
    const safeIdx = idx >= 0 && idx < prizeLevels.length ? idx : 0;
    return Array.isArray(prizeLevels[safeIdx]?.items) ? prizeLevels[safeIdx]!.items! : [];
  }, [effectivePoolLevel, prizeLevels, findLevelArrayIndex]);

  const memoTotalRewards = useMemo(() => {
    if (!levelTotals || !prizeLevels || prizeLevels.length === 0) return 0;
    const idx = findLevelArrayIndex(prizeLevels, effectivePoolLevel);
    const safeIdx = idx >= 0 && idx < levelTotals.length ? idx : 0;
    return levelTotals[safeIdx] || 0;
  }, [effectivePoolLevel, prizeLevels, levelTotals, findLevelArrayIndex]);

  useEffect(() => {
    setPoolItems(memoPoolItems);
    setTotalRewards(memoTotalRewards);
  }, [memoPoolItems, memoTotalRewards]);

  // Load static collage from local public folder
  useEffect(() => {
    let cancelled = false;
    
    async function loadStaticCollage() {
      try {
        setCollageReady(false);
        setError(null);
        
        // Use a static collage image from public folder
        const staticCollageUrl = '/prizes/drop-collage.png';
        
        // DISABLED: Preloading for performance testing
        // Skip preloading - direct image loading
        
        if (!cancelled) {
          setUrl(staticCollageUrl);
          setError(null);
          setCollageReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          const errorUrl = '/drop-error.png';
          // DISABLED: Error image preloading for performance testing
          setUrl(errorUrl);
          setError(null);
          setCollageReady(true);
        }
      }
    }

    loadStaticCollage();
    return () => { cancelled = true; };
  }, []); // No dependencies since we use a static image


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
      closeAllModals();
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


  // Demo: Yesterday's winners (test view)
  // const demoWinnersData = [
  //   { name: 'Lena', prize: '5€ Steam', time: '22:13' },
  //   { name: 'Max', prize: '500 V-Bucks', time: '21:47' },
  //   { name: 'Sara', prize: 'LoL RP 5€', time: '20:05' },
  //   { name: 'Jonas', prize: 'Gamer Supps', time: '19:52' },
  //   { name: 'Mia', prize: '5€ Steam', time: '18:11' },
  // ];
  return (
    <React.Fragment>
    {loading && (
      <div className="fixed inset-0 bg-black z-[9999]" role="status" aria-live="polite">
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Centered Drop logo */}
          <img src="/logo.png" alt="DROP lädt" className="drop-loader-logo select-none pointer-events-none" />

          {/* Bottom-centered spinner */}
          <div className="loader-bottom-spinner pointer-events-none" aria-hidden="true">
            <div className="w-12 h-12 border-4 border-white/40 border-t-white rounded-full animate-spin" />
          </div>
        </div>
      </div>
    )}
  
  {/* MODALS PORTAL - Rendered at ROOT level, completely outside scroll context */}
  {showNotifications && (
    <div className="fixed inset-0 z-40 flex items-center justify-center opacity-100 pointer-events-auto">
      <div className="absolute inset-0 bg-black/80 cursor-pointer" onClick={() => setShowNotifications(false)} />
      <div className="relative bg-white text-black rounded-2xl shadow-xl w-[min(92vw,560px)] max-w-[560px] p-8 md:p-10 flex flex-col items-center justify-center">
        <img
          src="/icons/zzz.svg"
          alt="Keine Benachrichtigungen"
          className="mb-4 h-28 w-28 object-contain select-none pointer-events-none"
          style={{ imageRendering: 'pixelated' }}
          onError={(e) => {
            const el = e.currentTarget as HTMLImageElement;
            el.onerror = null;
            el.outerHTML = '<div style="font-size:48px;line-height:1">💤</div>';
          }}
        />
        <div className="text-lg font-semibold">Keine neuen Nachrichten</div>
        <div className="mt-1 text-sm text-black/60">Du bist up to date</div>
      </div>
    </div>
  )}

  {showTest && (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 cursor-pointer" onClick={() => setShowTest(false)} />
      <div className="relative bg-white text-black rounded-2xl shadow-xl w-[min(92vw,800px)] max-h-[80vh] overflow-y-auto p-0">
        <RaffleTestTerminal
          onClose={() => setShowTest(false)}
          forceRaffleWindow={forceRaffleWindow}
          onForceRaffleWindowChange={setForceRaffleWindow}
        />
      </div>
    </div>
  )}

  {showPool && (
    <div className="fixed inset-0 z-40 flex items-center justify-center" onClick={() => setShowPool(false)}>
      <div className="absolute inset-0 bg-black/80 cursor-pointer" onClick={() => setShowPool(false)} />
      <div className="relative bg-white text-black rounded-2xl shadow-xl w-[min(92vw,784px)] max-h-[67vh] p-4 sm:p-6 overflow-y-auto">
        {/* close button removed - rely on overlay click/programmatic close */}
        {/* Centered level bar below header: 50% modal width */}
        {(() => {
          const pct = poolProgress.pct;
          return (
            <div className="mt-2 mb-8 w-full">
              <div className="mx-auto w-1/2">
                <div className="flex items-baseline justify-between text-sm text-black">
                  <span>
                    Level <span className="tabular-nums font-bold text-base">{Math.max(0, effectivePoolLevel)}</span>
                  </span>
                  <div className="text-right">
                    <span className="tabular-nums">{poolProgressLabel}</span> {poolProgressSuffix}
                    {poolProgressIsMax && (
                      <div className="text-[10px] uppercase tracking-wide text-black/50">Max Level erreicht</div>
                    )}
                  </div>
                </div>
                <div className="mt-1 h-3 rounded-full bg-black/10 overflow-hidden ring-1 ring-white/10">
                  <div
                    className="h-3 rounded-full bg-gradient-to-r from-rose-500 via-red-500 to-orange-500 transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <p className="mt-2 text-center text-xs text-black/60">Sammle Tickets, um den Pool zu füllen und bessere Preise freizuschalten.</p>
            </div>
          );
        })()}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pr-1">
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
        <div className="mt-4 flex items-center justify-center">
          <button
            type="button"
            onClick={() => { try { window.open('/Teilnahmebedingungen', '_blank', 'noopener'); } catch { window.open('/Teilnahmebedingungen', '_blank'); } }}
            className="text-black text-xs underline-offset-2 hover:underline cursor-pointer"
            aria-label="Teilnahmebedingungen ansehen"
          >
            Es gelten unsere Teilnahmebedingungen
          </button>
        </div>
      </div>
    </div>
  )}

  {showDaily && (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 cursor-pointer" onClick={() => setShowDaily(false)} />
      <div className="relative bg-white text-black rounded-2xl shadow-xl w-[min(78vw,720px)] max-h-[86vh] p-4 sm:p-5 overflow-hidden">
        {/* close button removed - rely on overlay click/programmatic close */}
        {/* scroll container */}
        <div className="mt-2 overflow-y-auto" style={{ maxHeight: '70vh' }}>
          {/* Streak progress 1–30 */}
          <div className="mt-3 max-w-3xl mx-auto">
            <div className="grid grid-cols-7 gap-1 items-stretch justify-items-stretch">
            {dailyRewards.map((r, i) => {
                // 14 Tage, 2 Reihen à 7
                const day = i + 1; // 1..14
                const pos = currentDailyPos(); // 1..14
                const isToday = day === pos;         // aktuelle Kachel
                const isDone = day <= (streak || 0); // alle Tage bis zur Serie gelten als eingelöst
                return (
                  <div
                    key={i}
                    className={`relative flex flex-col items-center justify-center rounded-xl border aspect-[4/3] w-full h-full min-w-0 p-1 sm:p-1.5 text-[10px] sm:text-xs ${
                      isDone
                        ? 'bg-emerald-100 border-emerald-300'
                        : isToday
                        ? 'bg-amber-100 border-amber-300'
                        : (dailySpecialItems[day] ? 'bg-sky-50 border-sky-300' : 'bg-white border-black/10')
                    }`}
                  >
                    <div className={`text-[10px] sm:text-[11px] uppercase tracking-wide ${isToday ? 'text-amber-700' : 'text-black/50'}`}>
                      Tag {day}
                    </div>
                    {!dailySpecialItems[day] ? (
                      <div className="font-bold text-sm sm:text-base">
                        +{r}
                        <span ref={isToday ? dailySourceGemRef : undefined} className="inline-block align-middle ml-1">
                          <img
                            src="/icons/coin.svg"
                            alt="Coin"
                            width={16}
                            height={16}
                            className="inline-block select-none pointer-events-none align-middle"
                            style={{ imageRendering: 'pixelated', verticalAlign: '-0.125em' }}
                            onError={(e) => {
                              const el = e.currentTarget as HTMLImageElement;
                              if (!el.dataset.fallback) {
                                el.dataset.fallback = 'png';
                                el.src = '/icons/coin.png';
                              } else {
                                el.outerHTML = '<span aria-hidden="true" style="font-size:14px;line-height:1">🪙</span>';
                              }
                            }}
                          />
                        </span>
                      </div>
                    ) : (
                      <div className="mt-0.5 text-[10px] sm:text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                        <span aria-hidden>{dailySpecialItems[day].emoji}</span>
                        <span>{dailySpecialItems[day].label}</span>
                      </div>
                    )}
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
          {claimError && (
            <div className="mt-2 text-xs text-red-600 font-semibold">
              {claimError}
            </div>
          )}
        </div>
      </div>
    </div>
  )}

  {showAccount && (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 cursor-pointer" onClick={() => { if (!mustComplete) setShowAccount(false); }} />
      <div className="relative bg-transparent text-black w-[min(92vw,480px)] max-h-[85vh] p-0 overflow-visible">
        <div className="w-full max-h-[calc(85vh-2rem)] overflow-y-auto account-modal-scroll">
          <AccountPanel embedded />
        </div>
      </div>
    </div>
  )}

  {showItems && (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80" onClick={() => setShowItems(false)} />
      <div className="relative bg-white text-black rounded-2xl shadow-xl w-[min(92vw,480px)] max-h-[80vh] px-6 pb-6 pt-12 overflow-y-auto">
        {/* close button removed - rely on overlay click/programmatic close */}
        <div className="space-y-3">
          {buyError && <div className="p-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded">{buyError}</div>}
          {shopItems.filter(it => (it.active ?? true)).map((it) => {
              const owned = itemsOwned[it.id] || 0; // echte Anzahl
              const canBuy = (coins || 0) >= it.price && owned < 1; // kaufen nur, wenn noch keins
              const busy = buyBusy[it.id];
              const nowMs = nowMsItems || Date.now();
              const eff = effects[it.id];
              const isActive = !!eff?.active && typeof eff?.untilMs === 'number' && eff.untilMs > nowMs;
              const remMs = isActive && eff?.untilMs ? Math.max(0, eff.untilMs - nowMs) : 0;
              const remLabel = isActive && eff?.untilMs ? fmt(remMs) : null;
              return (
                <div
                  key={it.id}
                  className={`p-4 border rounded-2xl flex items-center justify-between gap-3 ${isActive ? 'bg-emerald-100 border-emerald-300 active-glow active-anim active-bling' : 'bg-white border-black/10'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={it.id === 'ad_20_coins' ? '/icons/free-coins.svg' : `/icons/${it.id}.svg`} 
                      alt=""
                      width={40}
                      height={40}
                      onError={(e) => {
                        const el = e.currentTarget as HTMLImageElement;
                        el.onerror = null;
                        el.src = it.id === 'ad_20_coins' ? '/icons/free-coins.svg' : '/items/pixel-items.svg';
                      }}
                      className="w-10 h-10 object-contain select-none"
                      style={{ imageRendering: 'pixelated' }}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{it.name}</div>
                      <div className="text-sm text-gray-700 truncate">{it.desc}</div>
                      {it.id !== 'ad_20_coins' && (
                        <div className="mt-1 text-xs text-gray-700">
                          Besitz: <span className="tabular-nums">{owned}</span>
                        </div>
                      )}
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
                        className={`px-3 py-1.5 rounded-full text-white text-sm font-semibold flex items-center gap-1.5 ${(!uid || busy || !canBuy) ? 'bg-black/30 cursor-not-allowed' : 'bg-black hover:opacity-90'}`}
                      >
                        {it.id === 'ad_20_coins' && (
                          <img
                            src="/icons/ad-icon.svg"
                            width={12} // von 14 auf 12 reduziert
                            height={12} // von 14 auf 12 reduziert 
                            alt=""
                            className="opacity-90"
                          />
                        )}
                        {it.price}
                        <img
                          src="/icons/coin.svg"
                          width={18}
                          height={18}
                          alt="Coins"
                          className="inline-block align-middle"
                          style={{ imageRendering: 'pixelated', verticalAlign: '-0.18em' }}
                        />
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

  {activeTile !== null && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4" onClick={() => { setPopupLoading(false); setActiveTile(null); }}>
      <div className="max-w-[420px] w-full" onClick={(e) => e.stopPropagation()}>
        <CardFrame svg="/card-frame.svg" aspect="5/6" safePadding="0">
          <div ref={modalContentRef} className="relative w-full h-full rounded-2xl overflow-visible bg-white">
            {popupLoading ? (
              <div className="flex items-center justify-center w-full h-full">
                <div className="w-12 h-12 border-4 border-gray-200 border-t-black rounded-full animate-spin" aria-hidden />
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="flex-1 px-6 pt-6 pb-4 overflow-y-auto">
                  {/* Modal top-right countdown pill */}
                  <div className="absolute top-3 right-3 z-20">
                    <TileCountdown toMs={gridItems[activeTile]?.toMs} />
                  </div>
                  <h3 className="text-3xl font-extrabold text-black leading-tight mt-8">
                    {(gridItems[activeTile] as any)?.headline ?? (gridItems[activeTile] as any)?.title ?? `Headline`}
                  </h3>
                  <p className="mt-3 text-sm text-black/70 whitespace-pre-line break-words">
                    {(gridItems[activeTile] as any)?.content ?? (gridItems[activeTile] as any)?.subtitle ?? `Beschreibung`}
                  </p>
                  {/* spacer: eight blank lines */}
                  <div aria-hidden>
                    <br />
                    <br />
                    <br />
                    <br />
                    <br />
                    <br />
                    <br />
                  </div>
                </div>

                <div className="px-6 pb-6">
                  <div className="absolute left-6 right-6 bottom-2 flex flex-col items-center">
                    <button
                      ref={participateButtonRef}
                      type="button"
                      aria-label={`Teilnehmen an Drop ${activeTile !== null ? activeTile + 1 : ''}`}
                      disabled={!canParticipate || popupBusy}
                      onClick={async (ev) => {
                        ev?.stopPropagation();
                        if (!canParticipate) {
                          if (nextAllowedMs) {
                            try {
                              const p = berlinPartsFromMs(nextAllowedMs);
                              alert(`Nächstes Teilnehmen möglich: ${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')} (Berlin)`);
                            } catch {
                              alert('Noch gesperrt');
                            }
                          } else {
                            alert('Noch gesperrt');
                          }
                          return;
                        }
                        setPopupBusy(true);
                        try {
                          const item = gridItems[activeTile ?? -1];
                          if (!item) { alert('Ungültiger Eintrag'); return; }
                          let entryId = (item as any)?.id ?? (item as any)?.__id ?? (item as any)?.name ?? (item as any)?.title ?? null;
                          if (!entryId) {
                            if (typeof activeTile === 'number') entryId = `drop-item-${activeTile}`;
                            else { alert('Ungültiger Eintrag'); return; }
                          }
                          try { console.log('[drop] calling enterDrop', { entryId, item, activeTile }); } catch { }
                          let res: any = null;
                          try {
                            const fn = httpsCallable(getFunctions(undefined, 'us-central1'), 'enterDrop');
                            res = await fn({ entryId });
                          } catch (err: any) {
                            console.warn('[drop] httpsCallable failed, will try HTTP fallback', err?.message || err);
                            try {
                              const auth = getAuth();
                              const user = auth.currentUser;
                              if (!user) throw new Error('no-auth-user');
                              const idToken = await user.getIdToken();
                              const url = `/api/proxy/enterDrop`;
                              const fetchRes = await fetch(url, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                                body: JSON.stringify({ entryId }),
                              });
                              const body = await fetchRes.json();
                              res = { data: body };
                            } catch (err2: any) {
                              console.error('[drop] HTTP fallback failed', err2);
                              throw err2;
                            }
                          }
                          if (res?.data?.ok) {
                            alert(`Teilnahme erfolgreich (${res.data.count})`);
                            setActiveTile(null);
                            if (typeof res.data.remainingCoins === 'number') {
                              setCoins(res.data.remainingCoins);
                            }
                          } else {
                            const serverMsg = String(res?.data?.message || 'unknown');
                            if (serverMsg.includes('insufficient-coins')) {
                              alert('Nicht genügend Coins. Teilnahme kostet 10 Coins.');
                            } else {
                              alert(`Fehler: ${serverMsg}`);
                            }
                          }
                        } catch (err) {
                          console.error('enterDrop failed', err);
                          alert(`Fehler: ${String(err)}`);
                        } finally {
                          setPopupBusy(false);
                        }
                      }}
                      className={`w-full py-4 rounded-2xl text-lg font-bold shadow-lg transition-opacity relative flex items-center justify-center ${!canParticipate || popupBusy ? 'bg-black/70 cursor-not-allowed text-white/90' : 'bg-black text-white hover:opacity-95'}`}
                      style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.35)', cursor: (!canParticipate || popupBusy) ? 'not-allowed' : 'pointer', pointerEvents: (!canParticipate || popupBusy) ? 'none' : 'auto' }}
                      onMouseEnter={(e) => { try { (e.currentTarget as HTMLElement).style.cursor = (!canParticipate || popupBusy) ? 'not-allowed' : 'pointer'; } catch {} }}
                      onMouseLeave={(e) => { try { (e.currentTarget as HTMLElement).style.cursor = ''; } catch {} }}
                    >
                      {canParticipate && !popupBusy && (
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 pointer-events-none">
                          <img src="/icons/coin.svg" alt="Coins" className="w-5 h-5" />
                          <span className="text-white font-semibold tabular-nums">10</span>
                        </span>
                      )}
                      <div className="text-white font-semibold">
                        {popupBusy ? 'Sende...' : (!canParticipate && countdownMs !== null ? `Nächste Teilnahme in ${formatCountdown(countdownMs)}` : 'Teilnehmen')}
                      </div>
                    </button>
                    {/* Speech bubble positioned above the button using the SVG background */}
                    <div
                      ref={bubbleRef}
                      aria-hidden
                      style={bubbleStyle ? { position: 'absolute', ...bubbleStyle, zIndex: 40, pointerEvents: 'none' } : { position: 'absolute', bottom: '80px', right: '12px', zIndex: 40, pointerEvents: 'none' }}
                    >
                      <div style={{ position: 'relative', pointerEvents: 'none', filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.22))' }}>
                        <div
                          role="img"
                          aria-hidden
                          style={{
                            display: 'inline-block',
                            backgroundImage: `url('/speech-bubble.svg')`,
                            backgroundRepeat: 'no-repeat',
                            backgroundSize: '100% 100%',
                            padding: '12px 28px 22px',
                            maxWidth: '72vw',
                            whiteSpace: 'nowrap',
                            textAlign: 'center',
                            boxSizing: 'border-box'
                          }}
                        >
                          <div className="text-sm text-white font-semibold" style={{ lineHeight: 1.1, textShadow: '0 1px 0 rgba(0,0,0,0.2)' }}>
                            {uid ? (myParticipationCount === null ? 'Lade…' : `Du bist ${myParticipationCount}× dabei`) : 'Bitte einloggen, um zu sehen, wie oft du teilgenommen hast'}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 md:mt-8">
                      <button
                        type="button"
                        onClick={() => { try { router.push('/Teilnahmebedingungen'); } catch { window.location.href = '/Teilnahmebedingungen'; } }}
                        className="text-black text-[12px] text-center underline-offset-2 hover:underline cursor-pointer"
                        aria-label="Teilnahmebedingungen ansehen"
                        style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
                      >
                        Es gelten unsere Teilnahmebedingungen
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardFrame>
      </div>
    </div>
  )}

  {/* Hidden asset preloading */}
  <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', visibility: 'hidden', pointerEvents: 'none' }} aria-hidden="true">
    <img src="/icons/trophy.svg" alt="" />
    <img src="/icons/ad-icon.svg" alt="" />
    <img src="/icons/free-coins.svg" alt="" />
    <img src="/icons/double_tickets.svg" alt="" />
    <img src="/adblock-warning.png" alt="" />
    {/* Preload all local avatar presets to prevent popping */}
    <img src="/profile-icon.png" alt="" />
    <img src="/pfpfs/preset1.png" alt="" />
    <img src="/pfpfs/preset2.png" alt="" />
    <img src="/pfpfs/preset3.png" alt="" />
    <img src="/pfpfs/preset4.png" alt="" />
    <img src="/pfpfs/preset5.png" alt="" />
    <img src="/pfpfs/preset6.png" alt="" />
  </div>

  {/* Sticky Header Elements */}
  <div ref={null} className={`fixed top-0 left-0 right-0 z-60 topbar-wrapper ${hideTopOnFooter ? 'top-hidden' : 'top-visible'}`} style={topBarWrapperStyle}>
  {/* Tiny scroll banner */}
  <div className={`h-6 ${hideTopOnFooter ? 'bg-transparent' : 'bg-black'} text-white`} style={smallTickerStyle}>
        <div ref={smallTickerContainerRef} className="small-ticker-wrap w-full h-full">
          <div className="small-ticker-track relative h-full">
            <span ref={smallTickerSpanRef} className="small-ticker-text">{smallTicker}</span>
          </div>
        </div>
      </div>
      
  {/* Combined sticky header */}
  <div className={`h-14 ${hideTopOnFooter ? 'bg-transparent' : 'bg-black'}`} style={{ backfaceVisibility: 'hidden' }}>
        {/* Left: Logo */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
          <img src="/logo.png" alt="DROP" className={`h-4 w-auto select-none drop-logo drop-anim-${logoAnim}`} />
        </div>
        
        {/* Center: Coins Badges */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 z-[60] pointer-events-none">
          <div className="flex items-center gap-3">
            {/* Coins */}
            <div ref={coinBadgeRef} className="flex items-center gap-2 rounded-full bg-white text-black text-sm font-semibold shadow-sm border border-black/10 select-none px-4 py-1.5 pointer-events-auto">
              <img
                src="/icons/coin.svg"
                alt="Coin"
                width={20}
                height={20}
                className="inline-block align-middle select-none pointer-events-none"
              />
              <span className="font-semibold text-base tabular-nums">{coins}</span>
            </div>
            {/* Tickets */}
            <div className="flex items-center gap-2 rounded-full bg-white text-black text-sm font-semibold shadow-sm border border-black/10 select-none px-4 py-1.5 pointer-events-auto">
              <img
                src="/icons/ticket.svg"
                alt="Tickets"
                width={20}
                height={20}
                className="inline-block align-middle select-none pointer-events-none"
              />
              <span className="font-semibold text-base tabular-nums">{ticketsBadgeText}</span>
            </div>
            {/* Streak */}
            <div
              onClick={() => { closeAllModals(); setShowDaily(true); }}
              className="flex items-center gap-2 rounded-full bg-white text-black text-sm font-semibold shadow-sm border border-black/10 select-none px-4 py-1.5 pointer-events-auto cursor-pointer hover:opacity-90"
              role="button"
              aria-label="Täglicher Bonus"
            >
              <img
                src="/icons/flame.png"
                alt="Streak"
                width={20}
                height={20}
                className="select-none pointer-events-none align-middle"
                style={{ imageRendering: 'pixelated' }}
              />
              <span className="font-semibold text-base tabular-nums">{Math.max(0, streak || 0)}</span>
            </div>
          </div>
        </div>
        
        {/* Right: Navigation buttons */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3 z-10">
          {/* Performance test spinner */}
          <div className="test-spinner h-6 w-6"></div>
          
          <button onClick={() => { closeAllModals(); setShowNotifications(true); }} aria-label="Benachrichtigungen" className="h-8 w-8 flex items-center justify-center cursor-pointer">
            <img 
              src="/icons/bell.png" 
              alt="Benachrichtigungen" 
              className="h-8 w-8 select-none pointer-events-none" 
              style={{ imageRendering: "pixelated" }}
            />
          </button>
          {uid && (
            <button onClick={() => { closeAllModals(); setShowItems(true); }} aria-label="Items" className="cursor-pointer">
              <img
                src="/items/items-icon.png"
                alt=""
                aria-hidden="true"
                className="h-8 w-8 select-none pointer-events-none"
                style={{ imageRendering: 'pixelated' }}
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/items/pixel-items.png'; }}
              />
            </button>
          )}
          {testEnabled && (
            <button onClick={() => setShowTest(true)} aria-label="Test-Terminal" className="h-8 px-2 rounded bg-white/10 text-white text-xs border border-white/20 cursor-pointer">
              Test
            </button>
          )}
          {/* Quick access to Test Console was removed */}
          <button onClick={() => { closeAllModals(); setShowAccount(true); }} aria-label="Account" className="cursor-pointer">
            <img
              src={uid ? (selectedLocalAvatar || profilePhoto || "/profile-icon.png") : "/profile-icon.png"}
              alt="Profil"
              className="h-8 w-8 select-none cursor-pointer rounded-full object-cover"
            />
          </button>
        </div>
      </div>
    </div>
    <div className="relative w-screen h-screen bg-black text-white flex flex-col overflow-hidden scroll-snap-section" style={{ contain: 'layout style paint' }}>
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
          backgroundSize: '100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%',
          backgroundPosition: '0 0',
          animation: 'none',
          willChange: 'auto',
          backfaceVisibility: 'hidden'
        }}
      />
      {/* Global scanline overlay */}
      {!prefersReducedMotion && (
        <div 
          aria-hidden 
          className="absolute inset-0 z-[1] pointer-events-none scanlines" 
          style={{ 
            willChange: 'auto', 
            backfaceVisibility: 'hidden'
          }} 
        />
      )}

      {/* Adblock Modal */}
      {adblockDetected && !adblockDismissed && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-auto" style={{ pointerEvents: 'auto' }}>
          <div className="absolute inset-0 bg-black/80 pointer-events-auto" style={{ pointerEvents: 'auto' }} />
          <div className="relative bg-white text-black rounded-2xl shadow-xl w-[min(92vw,560px)] max-w-[640px] p-6 pointer-events-auto" style={{ pointerEvents: 'auto' }}>
            <div className="absolute -top-3 -right-3">
              {/* close button removed - rely on overlay click/programmatic close */}
            </div>
            <img
              src="/adblock-warning.png"
              alt="Adblock Warning"
              className="mx-auto mb-2 h-40 sm:h-48 w-auto max-w-[70%] object-contain"
            />
            <div>
              <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold text-center text-black">Adblocker erkannt</h2>
              <p className="text-sm text-gray-600 text-center mt-1">
                Bitte deaktiviere deinen Adblocker oder füge eine Ausnahme hinzu.
              </p>
              <p className="text-sm text-gray-600 text-center mt-1">
                Mehr Werbung = mehr Rewards :)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* test grid removed from here and moved to the red second screen */}
  {/* Random background blobs */}
  <RandomBackgrounds count={5} />
  {/* Main viewport content: ads + center column with proportional layout */}
      <div className="relative z-10 flex-1 w-full px-4 overflow-hidden flex justify-between items-center" style={{paddingTop: '5rem'}}>
        {/* Left panel: Yesterday's winners */}
        <aside className="hidden xl:flex w-[300px] flex-col gap-4 self-center -mr-4">
          <div className="w-full rounded-2xl border border-white/15 bg-white/5 backdrop-blur-[2px] text-white p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
            {/* Datum und Uhrzeit der Losung */}
            <div className="text-xs text-white/60 mb-1.5 font-medium">
              {(() => {
                // If we have a loaded winners day (YYYY-MM-DD) show that, otherwise fallback to yesterday
                if (latestWinnerDay) {
                  const parts = latestWinnerDay.split('-'); // YYYY-MM-DD
                  if (parts.length === 3) {
                    const [y, m, d] = parts;
                    return `${d}.${m}.${y} • 20:00`;
                  }
                }
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const berlinTime = new Intl.DateTimeFormat('de-DE', {
                  timeZone: 'Europe/Berlin',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                }).format(yesterday);
                return `${berlinTime} • 20:00`;
              })()}
            </div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold">
                {winnersDateLabel || 'Letzte Gewinner:'}
              </div>
              {/* Gewinner-Anzahl oben rechts: Anzahl der Children/Einträge */}
              <div className="flex items-baseline gap-1 text-xs font-semibold">
                <span className="tabular-nums">{Array.isArray(winners) ? winners.length : 0}</span>
                <span className="opacity-80">Gewinner</span>
              </div>
            </div>
            <div className={`${winners.length > 5 ? 'max-h-[195px] overflow-y-auto pr-1' : ''}`}>
              <ul className="space-y-1.5 text-[13px]">
                {winners.length === 0 ? (
                  <li className="flex items-center justify-between gap-2 rounded-xl bg-white/5 border border-white/10 px-2 py-1.5 text-white/70">
                    <span className="truncate">Noch keine Gewinne</span>
                    <span className="text-[11px]">—</span>
                  </li>
                ) : (
                  winners.map((w, i) => (
                    <li key={`w-${i}`} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 border border-white/10 px-2 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src="/icons/trophy.svg"
                        alt="Trophy"
                        width={16}
                        height={16}
                        className="select-none pointer-events-none"
                        style={{ imageRendering: 'pixelated' }}
                      />
                      <span className="truncate">{w.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-right">
                      <span className="whitespace-nowrap text-white/85">{w.prize}</span>
                      <span className="text-[11px] text-white/60 tabular-nums">{w.time ?? ''}</span>
                    </div>
                  </li>
                ))
              )}
              </ul>
            </div>
          </div>
        </aside>

        {/* Center column: collage fills most, minigame pinned near bottom */}
        <div className="flex-1 h-full flex flex-col items-stretch pb-2 justify-between">
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
                  {/* Sunburst background behind the collage (dev: subtle decorative element) */}
                  <img
                    src="/sunburst.svg"
                    alt=""
                    aria-hidden="true"
                    className="collage-sunburst"
                  />
                  {/* Drop level inline bar */}
                  {(() => {
                    const pct = poolProgress.pct;
                    return (
                      <div className="mb-2 w-[80%] max-w-sm mx-auto">
                        <div className="flex items-baseline justify-between text-sm text-white">
                          <span>
                            Level <span className="tabular-nums font-bold text-base">{Math.max(0, effectivePoolLevel)}</span>
                          </span>
                          <div className="text-right">
                            <span className="tabular-nums">{poolProgressLabel}</span> {poolProgressSuffix}
                            {poolProgressIsMax && (
                              <div className="text-[10px] uppercase tracking-wide text-white/60">Max Level erreicht</div>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 h-3 rounded-full bg-black/10 overflow-hidden ring-1 ring-white/10">
                          <div
                            className="h-3 rounded-full bg-gradient-to-r from-rose-500 via-red-500 to-orange-500 transition-[width] duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => { closeAllModals(); setShowPool(true); }}
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
                  <span className="tabular-nums">
                    {isHydrated
                      ? (() => {
                          const now = Math.floor((serverNowBaseRef.current + (performance.now() - perfBaseRef.current)) / 1000) * 1000;
                          const raffleStart = new Date(now);
                          raffleStart.setHours(20, 0, 0, 0);
                          const raffleEnd = new Date(now);
                          raffleEnd.setHours(20, 15, 0, 0);
                          const realWindow = now >= raffleStart.getTime() && now < raffleEnd.getTime();
                          const isRaffleWindow = forceRaffleWindow || realWindow;

                          if (isRaffleWindow) {
                            let msLeft = Math.max(0, raffleEnd.getTime() - now);
                            if (forceRaffleWindow && !realWindow) {
                              msLeft = 15 * 60 * 1000;
                            }
                            return (
                              <span className="flex items-center gap-2">
                                <div className="relative w-4 h-4" style={{ contain: 'layout style paint' }}>
                                  {/* Base circle */}
                                  <div className="absolute inset-0 border-2 border-black/30 rounded-full"></div>
                                  {/* Gravity-affected loading segment */}
                                  <div className="absolute inset-0 border-2 border-transparent border-t-black rounded-full" style={{ 
                                    animation: prefersReducedMotion ? 'none' : 'gravityRoll 2s linear infinite',
                                    transformOrigin: 'center',
                                    willChange: 'transform',
                                    backfaceVisibility: 'hidden',
                                    transform: 'translateZ(0)'
                                  }}></div>
                                </div>
                                Gewinner werden gelost • {fmtMS(msLeft)}
                              </span>
                            );
                          }

                          return until20 || fmtHMS(msUntil20From(now));
                        })()
                      : "--:--:--"}
                  </span>
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-white/80">{error}</p>}
          </div>

          {/* Minigame — Neon Hologram */}
          <div className="w-full flex flex-col items-center flex-none mt-auto mb-0">
          <div className="relative aspect-[921/177] h-[clamp(120px,18vh,160px)] w-[33.33vw] max-w-full">
            <NeonHoloCard
              title={gameSlug || 'Minigame'}
              subtitle="Tippe die richtige Zelle"
              timeLabel={remaining || 'Jetzt spielen'}
              img={gameUrl || null}
              onImgLoad={() => setGameReady(true)}
              onImgError={() => setGameReady(true)}
              uid={uid}
              onShowAccount={() => { closeAllModals(); setShowAccount(true); }}
              onStart={() => {
                try {
                  const now = serverNowBaseRef.current + (performance.now() - perfBaseRef.current);
                  const snap = {
                    v: 1,
                    now,
                    coins,
                    streak,
                    ticketsToday,
                    effects,
                    avatar: profilePhoto || null,
                  };
                  sessionStorage.setItem('topbarSnapshot', JSON.stringify(snap));
                } catch {}
              }}
            />
          </div>
          <div className="w-full flex items-center justify-center mt-0">
            <button
              type="button"
              onClick={() => { try { window.open('/Teilnahmebedingungen', '_blank', 'noopener'); } catch { window.open('/Teilnahmebedingungen', '_blank'); } }}
              className="text-white text-xs underline-offset-2 hover:underline cursor-pointer"
              aria-label="Teilnahmebedingungen ansehen"
            >
              Es gelten unsere Teilnahmebedingungen
            </button>
          </div>
          </div>
        </div>

        {/* Right sidebar: Ads am rechten Rand, vertikal mittig */}
  {/* Right spacer to keep center truly centered when left panel is visible */}
  <div className="hidden xl:block w-[300px] self-center" aria-hidden="true" />
      </div>
      {/* Styles temporarily removed to fix build error */}
      {/* Confetti burst overlay */}
      {confettiAt !== 0 && (
        <ConfettiBurst onDone={() => { setConfettiAt(0); }} />
      )}
      
      {/* Second page below: full-screen black */}
    </div>
  <section className="relative w-screen h-screen bg-black text-white scroll-snap-section below-topbar">
    {/* --- same animated red gradient over black as first section --- */}
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
        backgroundSize: '100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%',
        backgroundPosition: '0 0',
        animation: 'none',
        willChange: 'auto',
        backfaceVisibility: 'hidden'
      }}
    />
    {/* Global scanline overlay */}
    {!prefersReducedMotion && (
      <div aria-hidden className="absolute inset-0 z-[1] pointer-events-none scanlines" style={{ willChange: 'auto', backfaceVisibility: 'hidden' }} />
    )}

    {/* --- Test grid placed on the red second screen --- */}
  <div className="flex items-center justify-center px-4 relative z-20" style={{ height: 'calc(100vh - var(--topbar-height))' }}>
      {/* larger container and vertical centering */}
      <div className="w-full max-w-[1200px] flex items-center justify-center">
        <div className="mx-auto">
              {(() => {
                const n = Math.max(0, gridCount || 0);
                if (n === 0) return <div className="text-center text-white/80">No tiles (use window.__drop_setGridCount(n))</div>;
                // Prefer 3 columns when possible. Use Tailwind utility classes for reliable output.
                const cols = n === 4 ? 2 : (n >= 3 ? 3 : Math.max(1, n));
                // Map to static Tailwind classes so JIT sees them
                const colsClassMap: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };
                const gridColsClass = colsClassMap[cols] || 'grid-cols-3';
                const gapValue = '1.1875rem';

                // Calculate tile size based on number of items
                // Fewer items = larger tiles
                let tileSize: string;
                if (n === 1) {
                  tileSize = 'clamp(15rem, 25vw, 28rem)'; // 1 item: very large
                } else if (n === 2) {
                  tileSize = 'clamp(13rem, 21vw, 24rem)'; // 2 items: large
                } else if (n === 3 || n === 4) {
                  tileSize = 'clamp(12rem, 19vw, 22rem)'; // 3-4 items: medium-large
                } else if (n <= 6) {
                  tileSize = 'clamp(11.52rem, 17.28vw, 19.2rem)'; // 5-6 items: medium
                } else {
                  tileSize = 'clamp(10rem, 15vw, 18rem)'; // 7+ items: normal
                }

                // Build item elements
                
                const items = new Array(n).fill(0).map((_, i) => (
                  <div
                    key={i}
                    onClick={() => { if (!uid) { closeAllModals(); setShowAccount(true); return; } setPopupLoading(true); setActiveTile(i); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!uid) { closeAllModals(); setShowAccount(true); return; } setPopupLoading(true); setActiveTile(i); } }}
                    role="button"
                    tabIndex={0}
                    className="relative cursor-pointer group transform transition duration-200 ease-out hover:scale-105 hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    <div style={{ width: tileSize, aspectRatio: '1/1' }} className="relative">
                      <CardFrame svg="/card-frame.svg" aspect="1/1" safePadding="0">
                        <div className="relative w-full h-full rounded-2xl overflow-visible">
                          {/* subtle highlight overlay on hover/focus */}
                          <div className="absolute inset-0 rounded-2xl pointer-events-none bg-white/6 opacity-0 group-hover:opacity-70 group-focus:opacity-70 transition-opacity duration-200" />
                          <img
                            src={(gridItems[i]?.src) || gridImages[i] || '/error-frame.svg'}
                            alt={`Drop ${i + 1}`}
                            className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none rounded-2xl"
                            onError={(e) => {
                              try {
                                const el = e.currentTarget as HTMLImageElement;
                                console.warn('[drop] image load failed for', el.src);
                                el.onerror = null;
                                el.src = '/error-frame.svg';
                              } catch {}
                            }}
                          />
                          {/* Countdown (top-right) */}
                          <TileCountdown toMs={gridItems[i]?.toMs} />
                          {/* Exclusive badge when entry is gated by withCode */}
                          {gridItems[i]?.withCode ? (
                            <div className="absolute left-3 top-3 z-20 px-2 py-1 rounded-full bg-yellow-400 text-black text-xs font-semibold exclusive-badge">Exklusiver Drop</div>
                          ) : null}
                        </div>
                      </CardFrame>
                    </div>
                  </div>
                ));

                // Chunk into rows of `cols` and render full rows as grid, last (incomplete) row as centered flex
                const rows: React.ReactNode[][] = [];
                for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));

                return (
                  <div className="mx-auto" style={{ display: 'flex', flexDirection: 'column', gap: gapValue }} aria-hidden>
                    {/* Headline space */}
                    <div style={{ paddingTop: '1.25rem', paddingLeft: '0.5rem', paddingRight: '0.5rem' }}>
                      <div className="flex items-center justify-center gap-3 flex-col">
                        <div>
                          <img
                            src="/vault-title.svg"
                            alt="Drop Vault"
                            className="vault-title opacity-100"
                            style={{ width: 'min(52vw, 520px)', height: 'auto', opacity: 1 }}
                          />
                          <p className="text-sm text-white opacity-100 mt-1 text-center"
                             style={{ color: '#ffffff', opacity: 1 }}>
                            Secure your drops and track claimed rewards
                          </p>
                        </div>
                      </div>
                    </div>
                    {rows.map((row, idx) => (
                      row.length === cols ? (
                        <div key={idx} className={`grid ${gridColsClass} place-items-center`} style={{ gap: gapValue }}>
                          {row}
                        </div>
                      ) : (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: `repeat(${row.length}, auto)`, gap: gapValue, width: 'max-content', marginLeft: 'auto', marginRight: 'auto' }}>
                          {row}
                        </div>
                      )
                    ))}
                  </div>
                );
              })()}
        </div>
      </div>
    </div>
  </section>

      {/* Footer Section */}
      <section ref={footerSectionRef} className="relative w-screen h-screen bg-black text-white scroll-snap-section border-t border-white/10">
    <div className="h-full flex flex-col justify-between relative z-10">
        {/* FAQ Section */}
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="max-w-4xl mx-auto px-4">
            <h2 className="text-3xl font-bold text-center mb-12">Häufig gestellte Fragen</h2>
              {/* FAQ Tabs */}
              <div className="flex justify-center mb-8 gap-2">
                {[
                  { key: 'minigames', label: 'Minigames' },
                  { key: 'tickets', label: 'Tickets & Verlosung' },
                  { key: 'coins', label: 'Coins & Belohnungen' },
                  { key: 'support', label: 'Technik & Support' }
                ].map(tab => (
                  <button
                    key={tab.key}
                    className={`px-6 py-2 rounded-full font-semibold transition-colors duration-150 ${faqTab === tab.key ? 'bg-white text-black shadow' : 'bg-black/10 text-white/80'} cursor-pointer`}
                    onClick={() => {
                      setFaqTab(tab.key as typeof faqTab);
                      setOpenFaq(null);
                    }}
                    aria-selected={faqTab === tab.key}
                    role="tab"
                    tabIndex={0}
                    aria-controls={`faq-group-${tab.key}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {/* FAQ Accordions */}
              <div className="space-y-4">
                {faqGroups[faqTab].map((item, idx) => (
                  <div key={idx} className="w-full flex justify-center">
                    <div className="bg-white/90 rounded-lg w-full box-border overflow-hidden" style={{ width: 'min(86vw,980px)' }}>
                      <button
                        className="w-full px-6 py-4 text-left flex justify-between items-center cursor-pointer"
                        onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                        aria-expanded={openFaq === idx}
                        aria-controls={`faq-${idx}`}
                      >
                        <span className="font-semibold text-black">{item.question}</span>
                        <span className={`transition-transform duration-200 text-black ${openFaq === idx ? 'rotate-180' : 'rotate-0'}`}>▼</span>
                      </button>
                      <div id={`faq-${idx}`} className="px-6 pb-4 text-black/80" style={{ display: openFaq === idx ? 'block' : 'none' }}>
                        {item.answer}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
          </div>
        </div>
        {/* Divider between FAQ and footer - matches footer content width */}
          {/* Divider between FAQ and footer - matches footer content width */}
          <div className="w-full" aria-hidden>
            <div className="max-w-6xl mx-auto px-4">
              <div className="border-t border-white/10" aria-hidden />
            </div>
          </div>
  <SiteFooter />
      </div>
    </section>
  </React.Fragment>
  );
}
