"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { auth } from "../../lib/firebase";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  type User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  reload,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
  deleteUser,
  reauthenticateWithPopup,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
// ...existing imports...
// Inline referral functions
async function ensureReferralCodeForUser(uid: string): Promise<string> {
  // Generate or get existing referral code
  return `ref_${uid.substring(0, 8)}`;
}

function buildReferralLink(code: string): string {
  return `${window.location.origin}/drop?ref=${code}`;
}

async function processPendingReferral(uid: string): Promise<void> {
  try {
    if (!uid) return;
    // Try to read pending referral from sessionStorage (set by landing with ?ref=CODE)
    let pending: any = null;
    try {
      if (typeof window !== 'undefined') {
        // sessionStorage (preferred)
        const rawSession = sessionStorage.getItem('pendingReferral');
        if (rawSession) pending = JSON.parse(rawSession);
        // fallback to localStorage (in case sessionStorage was lost during redirect)
        if (!pending) {
          const rawLocal = localStorage.getItem('pendingReferral');
          if (rawLocal) pending = JSON.parse(rawLocal);
        }
        // fallback to cookie
        if (!pending) {
          const m = document.cookie.match(/pendingReferral=([^;]+)/);
          if (m && m[1]) {
            try { pending = JSON.parse(decodeURIComponent(m[1])); } catch {}
          }
        }
        // fallback to URL param
        if (!pending) {
          try {
            const u = new URL(window.location.href);
            const ref = u.searchParams.get('ref');
            if (ref) pending = { code: ref };
          } catch {}
        }
      }
    } catch { pending = null; }

  let code = pending && typeof pending.code === 'string' ? String(pending.code).trim() : null;
  if (code && code.startsWith('ref_')) code = code.slice(4);
    if (!code) return;

    const userRef = doc(db, 'users', uid);
    try {
      const snap = await getDoc(userRef);
      const data: any = snap.exists() ? (snap.data() || {}) : {};
      // If referredBy already present, don't overwrite
      if (data && (data.referredBy || data.referred_by || data.referrer)) {
        // already recorded
        try { sessionStorage.removeItem('pendingReferral'); } catch {}
        return;
      }
      // Persist referral info: only set `referredBy` (strip any 'ref_' prefix)
      const existingInviter = data && (data.referredBy);
      if (!existingInviter) {
        await setDoc(userRef, { referredBy: code, referred_at: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
      }
      try { sessionStorage.removeItem('pendingReferral'); } catch {}
      console.log('[referral] persisted referredBy for', uid, code);
    } catch (e) {
      console.error('[referral] failed to persist pending referral', e);
    }
  } catch (err) {
    console.error('[referral] processPendingReferral error', err);
  }
}
// Firebase storage removed - using local avatars from /public/pfpfs

// Helper: Signal parent to close account view
function signalAccountClose() {
  try { window.dispatchEvent(new CustomEvent('drop:account-close')); } catch {}
  try { window.postMessage({ type: 'drop:account-close' }, '*'); } catch {}
}

// Helper: Normalize Firebase Auth errors to user-friendly German messages
function prettyAuthError(err: any): string {
  const code = (err?.code || err?.message || '').toString();
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'E-Mail oder Passwort ist falsch.';
    case 'auth/user-disabled':
      return 'Dieses Konto wurde deaktiviert.';
    case 'auth/credential-already-in-use':
      return 'Dieses Login ist bereits mit einem anderen Konto verknüpft.';
    case 'auth/invalid-action-code':
      return 'Ungültiger Aktionscode.';
    case 'auth/expired-action-code':
      return 'Der Aktionscode ist abgelaufen.';
    case 'auth/user-not-found':
      return 'Kein Konto mit dieser E-Mail gefunden.';
    case 'auth/too-many-requests':
      return 'Zu viele Versuche. Bitte später erneut versuchen.';
    case 'auth/email-already-in-use':
      return 'Diese E-Mail wird bereits verwendet.';
    case 'auth/invalid-email':
      return 'Ungültige E-Mail-Adresse.';
    case 'auth/weak-password':
      return 'Passwort zu schwach. Mindestens 6 Zeichen wählen.';
    case 'auth/requires-recent-login':
      return 'Bitte melde dich neu an, um diese Aktion auszuführen.';
    case 'auth/popup-closed-by-user':
      return 'Anmeldung abgebrochen.';
    case 'auth/network-request-failed':
      return 'Netzwerkfehler. Prüfe deine Verbindung.';
    case 'permission-denied':
      return 'Keine Berechtigung für diese Aktion.';
    default:
      // Fallback: kurze, generische Meldung
      return err?.message ? String(err.message).replace(/^Firebase:\s*/,'') : 'Es ist ein Fehler aufgetreten.';
  }
}


async function upsertUser(u: User) {
  const ref = doc(db, "users", u.uid);
  await setDoc(
    ref,
    {
      email: u.email ?? null,
      displayName: u.displayName ?? null,
      photoURL: u.photoURL ?? null,
      // create coins if missing without overwriting existing value
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function ensureUserDoc(u: User) {
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // Brandneuer Account: KEINE geschützten Felder beim Create (coins ist protected)
    await setDoc(ref, {
      email: u.email ?? null,
      displayName: u.displayName ?? null,
      photoURL: u.photoURL ?? null,
      profileCompleted: false,
      gamesSelected: false,
      // Items ist erlaubt und soll sofort vorhanden sein
      items: { double_xp: 0, double_tickets: 0 },
      updatedAt: serverTimestamp(),
    });
    return;
  }
  // Existiert → fehlende Pflichtfelder nachziehen, ohne bestehende zu überschreiben
  const data: any = snap.data() || {};
  const patch: any = {};
  const dx = (data.items && typeof data.items.double_xp === 'number') ? data.items.double_xp : 0;
  const dt = (data.items && typeof data.items.double_tickets === 'number') ? data.items.double_tickets : 0;
  if (!data.items || typeof data.items.double_xp !== 'number' || typeof data.items.double_tickets !== 'number') {
    patch.items = { double_xp: dx, double_tickets: dt };
  }
  if (Object.keys(patch).length) {
    patch.updatedAt = serverTimestamp();
    await setDoc(ref, patch, { merge: true });
  }
}

// Referral Section Component
function ReferralSection({ uid }: { uid: string | null }) {
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!uid) return;
    
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const code = await ensureReferralCodeForUser(uid);
        if (mounted) setReferralCode(code);
      } catch (error) {
        console.error('[referral] Failed to load code:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    
    return () => { mounted = false; };
  }, [uid]);

  const handleCopy = async () => {
    if (!referralCode) return;
    
    const link = buildReferralLink(referralCode);
    
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('[referral] Copy failed:', error);
    }
  };

  if (!uid) return null;

  return (
    <div className="p-0 bg-white rounded-2xl shadow-none border-2 border-red-500 referral-animated-border">
      <div className="flex items-center gap-4 px-6 pt-6 pb-4">
        <img 
          src="/gift-icon.svg" 
          alt="Geschenk" 
          className="w-12 h-12 object-contain"
          style={{ imageRendering: 'pixelated' }}
        />
        <div>
          <h3 className="text-lg font-semibold text-black">Lade Freunde ein</h3>
          <div className="flex items-center gap-1">
            <p className="text-sm text-black/60">Ihr beide erhaltet 500</p>
            <img 
              src="/icons/coin.svg" 
              alt="Coins" 
              className="w-4 h-4 object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        </div>
      </div>
      
      <div className="px-6 pb-6">
        {loading ? (
          <div className="text-sm text-black/60">Lade deinen Referral-Code...</div>
        ) : referralCode ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={buildReferralLink(referralCode)}
                className="flex-1 px-3 py-2 bg-white border border-black/20 rounded-lg text-black text-sm"
              />
              <button
                onClick={handleCopy}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  copied 
                    ? 'bg-green-600 text-white' 
                    : 'bg-black text-white hover:bg-black/90'
                }`}
              >
                {copied ? '✓ Kopiert!' : 'Kopieren'}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-black/60">Fehler beim Laden des Referral-Codes</div>
        )}
      </div>
    </div>
  );
}

export function AccountPanel({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const didReloadRef = useRef(false);
  const autoClosedRef = useRef(false);
  const wasGatedRef = useRef(false);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [age, setAge] = useState("");
  const [busy, setBusy] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const [showComplete, setShowComplete] = useState(false);
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  // Games selection step
  const [gamesSelectedFlag, setGamesSelectedFlag] = useState<boolean | null>(null);
  const GAMES: string[] = [
    'Fortnite','Valorant','Minecraft','League of Legends','CS2','EA FC 25','GTA Online','Roblox','Clash of Clans','Brawl Stars'
  ];
  const [selectedGames, setSelectedGames] = useState<string[]>([]);
  const [customGame, setCustomGame] = useState("");
  const [savingGames, setSavingGames] = useState(false);
  const toggleGame = (g: string) => {
    setSelectedGames((prev) => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  };
  const [presetUrls, setPresetUrls] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const presetScrollRefComplete = useRef<HTMLDivElement | null>(null);

  // Function to handle avatar selection
  const handleAvatarSelection = (url: string) => {
    setSelectedPreset(url);
    
    // Save to localStorage
    try {
      localStorage.setItem('selectedLocalAvatar', url);
    } catch (e) {
      console.warn('Could not save selected avatar to localStorage', e);
    }
    
    // Send event to Drop page
    const event = new CustomEvent('localAvatarChanged', { detail: { avatar: url } });
    window.dispatchEvent(event);
  };
  const presetScrollRefEdit = useRef<HTMLDivElement | null>(null);

  // Mouse wheel scroll handler for horizontal scrolling
  const handleWheelScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    // Prevent vertical page scrolling when scrolling over avatar images
    e.preventDefault();
    e.stopPropagation();
    
    const scrollAmount = e.deltaY > 0 ? 120 : -120;
    e.currentTarget.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };


  const [verifyInfo, setVerifyInfo] = useState<{sent: boolean; email?: string}>({sent: false});
  const [checkingVerification, setCheckingVerification] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);


  const [currentPwd, setCurrentPwd] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [changing, setChanging] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Clear transient messages when switching between login and register views
  useEffect(() => {
    setError(null);
    setMsg(null);
  }, [showRegister]);

  const [profileCompletedFlag, setProfileCompletedFlag] = useState<boolean | null>(null);
  const mustComplete = !!user && !!user.emailVerified && profileCompletedFlag === false;
  const mustPickGames = !!user && !!user.emailVerified && gamesSelectedFlag === false;
  // Track whether registration/verification/completion is in progress
  const registrationInProgress = (
    user ? (!user.emailVerified || mustPickGames || mustComplete || showComplete) : showRegister
  );
  // Optionally mark as gated on initial mount if user not ready yet
  if (!wasGatedRef.current) {
    wasGatedRef.current = !!(user ? (!user.emailVerified || mustPickGames || mustComplete || showComplete) : showRegister);
  }
  // Add a flag to reload only right after completing the profile from the gated flow.
  const [justCompleted, setJustCompleted] = useState(false);

  // Hard gate: prevent leaving while login/verify/complete is required
  useEffect(() => {
    if (!registrationInProgress) return;
    const onPop = () => {
      try { history.pushState(null, "", location.href); } catch {}
    };
    try { history.pushState(null, "", location.href); } catch {}
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [registrationInProgress]);

  // Block ESC to prevent parent modals from closing while gated
  useEffect(() => {
    if (!registrationInProgress) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [registrationInProgress]);

  const startEdit = () => {
    if (user) {
      setUsername(user.displayName ?? "");
      // if current photoURL matches a preset, preselect it
      if (user.photoURL && presetUrls.includes(user.photoURL)) {
        setSelectedPreset(user.photoURL);
      } else {
        setSelectedPreset(null);
      }
      setShowComplete(true);
    }
  };

    useEffect(() => {
      const unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u) {
          const ref = doc(db, "users", u.uid);
          getDoc(ref)
            .then((snap) => {
              const data = snap.data() as any | undefined;
              const completed = data?.profileCompleted === true && !!(u.displayName) && !!(u.photoURL);
              setProfileCompletedFlag(completed);
              const gamesDone = data?.gamesSelected === true;
              setGamesSelectedFlag(!!gamesDone);
              // Force completion flow only if games already picked
              setShowComplete(!(completed) && !!gamesDone);
              // Prefill selected games if present
              if (Array.isArray((data as any)?.games)) setSelectedGames((data as any).games as string[]);
              // For Google accounts: do not prefill before completion, but show saved name after completion
              const isGoogle = u.providerData?.some(p => p.providerId === 'google.com');
              if ((completed || !isGoogle) && u.displayName) setUsername(u.displayName);
              setAuthLoading(false);
            })
            .catch(() => {
              setProfileCompletedFlag(false);
              setShowComplete(true);
              setAuthLoading(false);
            });
        } else {
          setProfileCompletedFlag(null);
          setGamesSelectedFlag(null);
          setShowComplete(false);
          setUsername("");
          setSelectedGames([]);
          setAuthLoading(false);
        }
      });
      return () => unsub();
    }, []);

  // Remember if this panel instance was ever in a gated state
  useEffect(() => {
    if (registrationInProgress) {
      wasGatedRef.current = true;
    }
  }, [registrationInProgress]);

  // Auto-close once after successful login+completion when embedded,
  // but only if this panel instance was previously gated (to avoid closing on manual opens later)
  useEffect(() => {
    if (!embedded) return;
    if (autoClosedRef.current) return;
    if (!user) return;
    const ready = !!user.emailVerified && profileCompletedFlag === true && !showComplete;
    if (ready && wasGatedRef.current) {
      autoClosedRef.current = true;
      signalAccountClose();
    }
  }, [embedded, user, profileCompletedFlag, showComplete]);

  useEffect(() => {
    // Clear old Firebase cache and use local avatars from /public/pfpfs
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('drop_avatar_urls_v1'); // Clear old cache
    }
    
    // Load all local preset avatars from /public/pfpfs directory
    const localAvatars = [
      '/pfpfs/preset1.png',
      '/pfpfs/preset2.png', 
      '/pfpfs/preset3.png',
      '/pfpfs/preset4.png',
      '/pfpfs/preset5.png',
      '/pfpfs/preset6.png',
    ];
    setPresetUrls(localAvatars);
  }, []);

  // Preselect current values for username and avatar after presets loaded
  useEffect(() => {
    if (user) {
      const isGoogle = user.providerData?.some(p => p.providerId === 'google.com');
      if ((profileCompletedFlag === true || !isGoogle) && user.displayName) setUsername(user.displayName);
      if (user.photoURL && presetUrls.includes(user.photoURL)) {
        setSelectedPreset(user.photoURL);
      }
    }
  }, [user, presetUrls, profileCompletedFlag]);

  // Reload once when justCompleted becomes true
  useEffect(() => {
    if (!justCompleted || didReloadRef.current) return;
    didReloadRef.current = true;
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, [justCompleted]);

  const loginGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await ensureUserDoc(cred.user);
      await upsertUser(cred.user);
      
      // Process any pending referral
      try {
        await processPendingReferral(cred.user.uid);
      } catch (error) {
        console.error('Failed to process pending referral:', error);
      }
      
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      const completed = (snap.data() as any)?.profileCompleted === true;
      const gamesDone = (snap.data() as any)?.gamesSelected === true;
      setGamesSelectedFlag(!!gamesDone);
      // Set UI state immediately so gating applies without waiting for onAuthStateChanged
      const hasAuthProfile = !!cred.user.displayName && !!cred.user.photoURL;
      setProfileCompletedFlag(completed && hasAuthProfile);
      // If games not chosen yet, force picker and hide completion step for now
      if (!gamesDone) {
        setShowComplete(false);
      } else {
        setShowComplete(!(completed && hasAuthProfile));
      }
      // do not prefill username for Google sign-in
      if (embedded && completed && !!cred.user.displayName && !!cred.user.photoURL) {
        signalAccountClose();
      }
    } catch (e: any) {
      setError(prettyAuthError(e) || 'Login fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const loginEmail = async () => {
    setError(null);
    setBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (!cred.user.emailVerified) {
        // stay signed-in but force verify flow
        setVerifyInfo({ sent: false, email: cred.user.email ?? email.trim() });
        setShowComplete(false);
        setEmail("");
        setPassword("");
        return;
      }
      await ensureUserDoc(cred.user);
      await upsertUser(cred.user);
      
      // Process any pending referral
      try {
        await processPendingReferral(cred.user.uid);
      } catch (error) {
        console.error('Failed to process pending referral:', error);
      }
      
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      const completed = (snap.data() as any)?.profileCompleted === true;
      const gamesDone = (snap.data() as any)?.gamesSelected === true;
      setGamesSelectedFlag(!!gamesDone);
      setShowComplete(!completed);
      setEmail("");
      setPassword("");
      if (embedded && completed) {
        signalAccountClose();
      }
    } catch (e: any) {
      setError(prettyAuthError(e) || 'Login fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const registerEmail = async () => {
    setError(null);
    // Required fields validation (granular messages)
    if (!email.trim()) { setError('Bitte E-Mail angeben'); return; }
    if (!password.trim()) { setError('Bitte Passwort angeben'); return; }
    if (!confirm.trim()) { setError('Bitte Passwort bestätigen'); return; }
    if (!age.trim()) { setError('Bitte Alter auswählen'); return; }
    if (password.trim().length < 6) {
      setError("Passwort muss mind. 6 Zeichen haben");
      return;
    }
    if (password !== confirm) {
      setError("Passwörter stimmen nicht überein");
      return;
    }
    const nAge = Number.parseInt(age, 10);
    if (!Number.isFinite(nAge) || nAge < 13 || nAge > 120) {
      setError("Bitte gültiges Alter angeben (13–120)");
      return;
    }
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await ensureUserDoc(cred.user);
      await upsertUser(cred.user);
      
      // Process any pending referral
      try {
        await processPendingReferral(cred.user.uid);
      } catch (error) {
        console.error('Failed to process pending referral:', error);
      }
      // 1) Erlaubter Create-Merge ohne geschützte Felder
      await setDoc(
        doc(db, "users", cred.user.uid),
        { age: nAge, ageUpdatedAt: serverTimestamp(), gamesSelected: false },
        { merge: true }
      );
      // 2) Unmittelbar danach Items-Map anlegen (erlaubt, da nicht protected)
      await setDoc(
        doc(db, "users", cred.user.uid),
        { items: { double_xp: 0, double_tickets: 0 }, updatedAt: serverTimestamp() },
        { merge: true }
      );
      await sendEmailVerification(cred.user);
      setVerifyInfo({ sent: true, email: cred.user.email ?? email.trim() });
      // We require verification before completion flow
      setShowRegister(false);
      setShowComplete(false);
      setEmail("");
      setPassword("");
      setConfirm("");
      setAge("");
    } catch (e: any) {
      setError(prettyAuthError(e) || 'Registrierung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };
  const saveGames = async () => {
    if (!user) return;
    const list = [...selectedGames]
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (list.length === 0) { setError('Bitte mindestens ein Spiel wählen.'); return; }
    setSavingGames(true);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { games: list, gamesSelected: true, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setGamesSelectedFlag(true);
      setShowComplete(true);
    } catch (e: any) {
      setError(prettyAuthError(e) || 'Speichern der Spiele fehlgeschlagen');
    } finally {
      setSavingGames(false);
    }
  };


  const skipGames = async () => {
    if (!user) { setShowComplete(true); return; }
    setSavingGames(true);
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { gamesSelected: true, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setGamesSelectedFlag(true);
      setShowComplete(true);
    } catch (e: any) {
      setError(prettyAuthError(e) || 'Konnte nicht überspringen');
    } finally {
      setSavingGames(false);
    }
  };

  const logout = async () => {
    setError(null);
    const ok = window.confirm("Jetzt abmelden?");
    if (!ok) return;
    setBusy(true);
    try {
      console.log("Logout clicked. currentUser:", auth.currentUser?.uid);
      await signOut(auth);
      console.log("Logout success");
      
      // Reset all user-related states
      setUser(null);
      setEmail("");
      setPassword("");
      setConfirm("");
      setAge("");
      setUsername("");
      setSelectedGames([]);
      setCustomGame("");
      setSelectedPreset(null);
      setPresetUrls([]);
      setCurrentPwd("");
      setNewEmail("");
      setNewPwd("");
      setMsg(null);
      setVerifyInfo({sent: false});
      setProfileCompletedFlag(null);
      setGamesSelectedFlag(null);
      setShowComplete(false);
      setShowRegister(false);
      setSaving(false);
      setSavingGames(false);
      setChanging(false);
      setCheckingVerification(false);
      setJustCompleted(false);
      
    } catch (e: any) {
      console.error("Logout error:", e?.code, e?.message || e);
      setError(prettyAuthError(e) || 'Logout fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  // ...existing code...

  const resendVerification = async () => {
    if (!auth.currentUser) return;
    setError(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setVerifyInfo({ sent: true, email: auth.currentUser.email ?? verifyInfo.email });
    } catch (e: any) {
      setError(prettyAuthError(e) || 'E-Mail konnte nicht gesendet werden');
    }
  };

  const checkVerifiedNow = async () => {
    if (!auth.currentUser) return;
    setCheckingVerification(true);
    try {
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        // proceed to completion flow gating
        await ensureUserDoc(auth.currentUser);
        await upsertUser(auth.currentUser);
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        const completed = (snap.data() as any)?.profileCompleted === true;
        setShowComplete(!completed);
        setVerifyInfo({ sent: false });
        if (embedded && completed) {
          signalAccountClose();
        }
      }
    } catch (e: any) {
      setError(prettyAuthError(e) || 'Überprüfung fehlgeschlagen');
    } finally {
      setCheckingVerification(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    const wasGated = mustComplete;
    const requirePreset = profileCompletedFlag !== true; // first-time completion must choose a preset avatar
    const name = username.trim();
    if (!name) {
      setError("Bitte Nutzernamen eingeben");
      return;
    }
    setSaving(true);
    try {
      // For first-time completion, enforce choosing a preset; for edits, allow existing photoURL
      const photoURL: string | null = selectedPreset ?? user.photoURL ?? null;
      if (requirePreset && !selectedPreset) {
        setError("Bitte wähle ein Profilbild");
        setSaving(false);
        return;
      }
      if (!photoURL) {
        setError("Bitte wähle ein Profilbild");
        setSaving(false);
        return;
      }
      // Update Auth profile
      await updateProfile(user, { displayName: name, photoURL: photoURL || undefined });
      // Persist to Firestore and mark as completed
      await setDoc(
        doc(db, "users", user.uid),
        {
          displayName: name,
          photoURL: photoURL,
          profileCompleted: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setShowComplete(false);
      if (wasGated) {
        setJustCompleted(true);
      } else {
        router.push("/drop");
      }
    } catch (e: any) {
      setError(prettyAuthError(e) || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const reauthWithPassword = async () => {
    if (!user || !user.email) throw new Error("Kein Nutzer");
    const cred = EmailAuthProvider.credential(user.email, currentPwd);
    await reauthenticateWithCredential(user, cred);
  };

  const changeEmail = async () => {
    if (!user) return;
  setError(null); setMsg(null); setEmailError(null);
  if (!newEmail.trim()) { setEmailError("Neue E-Mail angeben"); return; }
  if (!currentPwd.trim()) { setEmailError("Aktuelles Passwort angeben"); return; }
    setChanging(true);
    try {
      await reauthWithPassword();
      await updateEmail(user, newEmail.trim());
      await reload(user);
      await sendEmailVerification(user);
      setVerifyInfo({ sent: true, email: newEmail.trim() });
      setShowComplete(false);
      setMsg("E-Mail geändert. Bitte Bestätigung per E-Mail abschließen.");
      setNewEmail(""); setCurrentPwd("");
    } catch (e: any) {
      setEmailError(prettyAuthError(e) || 'E-Mail-Update fehlgeschlagen');
    } finally { setChanging(false); }
  };

  const changePassword = async () => {
    if (!user) return;
  setError(null); setMsg(null); setPasswordError(null);
  if (!newPwd.trim() || newPwd.length < 6) { setPasswordError("Neues Passwort min. 6 Zeichen"); return; }
  if (!currentPwd.trim()) { setPasswordError("Aktuelles Passwort angeben"); return; }
    setChanging(true);
    try {
      await reauthWithPassword();
      await updatePassword(user, newPwd);
      setMsg("Passwort aktualisiert");
      setNewPwd(""); setCurrentPwd("");
    } catch (e: any) {
      setPasswordError(prettyAuthError(e) || 'Passwort-Update fehlgeschlagen');
    } finally { setChanging(false); }
  };

  const deleteAccount = async () => {
    if (!user) return;
    setError(null); setMsg(null);
    
    // System-Popup für Bestätigung
    const confirmed = window.confirm(
      "Account wirklich löschen?\n\n" +
      "⚠️ Diese Aktion kann NICHT rückgängig gemacht werden!\n\n" +
      "Alle deine Daten werden unwiderruflich gelöscht:\n" +
      "• Coins und Tickets\n" +
      "• Fortschritte und Erfolge\n" +
      "• Profil und Einstellungen\n" +
      "• Referral-Codes und Statistiken"
    );
    
    if (!confirmed) return;
    
    setBusy(true);

    const doDelete = async () => {
      console.log("[delete] deleting auth user");
      await deleteUser(user!);
      console.log("[delete] auth user deleted");
      router.push("/");
    };

    try {
      await doDelete();
    } catch (e: any) {
      console.warn("[delete] initial delete failed", e?.code, e?.message || e);
      if (e?.code === 'auth/requires-recent-login') {
        try {
          // Automatische Re-Authentifizierung je nach Provider
          const providers = user.providerData.map(p => p.providerId);
          if (providers.includes('google.com')) {
            // Google Re-Auth mit Popup
            await reauthenticateWithPopup(user, new GoogleAuthProvider());
          } else if (providers.includes('password')) {
            // Für Email-Accounts: Passwort nochmal abfragen
            const password = window.prompt('Zur Bestätigung dein aktuelles Passwort eingeben:');
            if (!password) {
              setError('Passwort erforderlich zum Löschen.');
              setBusy(false);
              return;
            }
            const credential = EmailAuthProvider.credential(user.email!, password);
            await reauthenticateWithCredential(user, credential);
          } else {
            setError('Bitte erneut einloggen und dann nochmal löschen.');
            setBusy(false);
            return;
          }
          
          // Nach erfolgreicher Re-Auth nochmal versuchen
          await doDelete();
          
        } catch (reauthErr: any) {
          console.error('[delete] reauth failed', reauthErr);
          if (reauthErr?.code === 'auth/wrong-password') {
            setError('Falsches Passwort eingegeben.');
          } else if (reauthErr?.code === 'auth/popup-closed-by-user') {
            setError('Login abgebrochen.');
          } else {
            setError(prettyAuthError(reauthErr) || 'Re-Authentifizierung fehlgeschlagen');
          }
        }
      } else {
        setError(prettyAuthError(e) || 'Löschen fehlgeschlagen');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={embedded ? "relative w-full text-black flex flex-col" : "relative min-h-screen w-screen text-black flex flex-col"}>
      <style jsx global>{`
        
        @keyframes referral-glow {
          0%, 100% { 
            border-color: #ef4444; 
            box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.25), 0 0 8px rgba(239, 68, 68, 0.2);
          }
          50% { 
            border-color: #dc2626; 
            box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.4), 0 0 15px rgba(220, 38, 38, 0.3);
          }
        }
        
        .referral-animated-border {
          animation: referral-glow 2s ease-in-out infinite;
        }
      `}</style>
      {/* Registration gating overlay to block outside clicks */}
      {registrationInProgress && (
        <div
          className={(embedded ? "absolute" : "fixed") + " inset-0 z-40"}
          aria-hidden
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        />
      )}
      {/* No global fullscreen dimmers — we use local card blockers now. */}
  <div className={(authLoading && registrationInProgress ? "opacity-0 pointer-events-none" : "opacity-100 transition-opacity") + " relative z-50"}>
        <>
          <div className="px-6 pt-2 pb-3">
            <div className="h-4" />
          </div>

          <div
            className="flex-1 flex items-center justify-center"
            style={{ minHeight: embedded ? undefined : "calc(100vh - 96px)" }}
          >
            <div
              ref={panelRef}
              className="relative z-50 px-6 pb-8 max-w-md w-full box-border mx-auto"
            >
              {user ? (
                !user.emailVerified ? (
                  <div className="relative bg-white rounded-2xl shadow-none px-6 py-4 w-full min-h-[220px] flex flex-col justify-between">
                    <button
                      type="button"
                      onClick={async () => {
                        // Abort verification: sign out and reset form state so user can re-enter email
                        try {
                          setBusy(true);
                          setError(null);
                          await signOut(auth);
                        } catch (e) {
                          // ignore
                        } finally {
                          setBusy(false);
                          setVerifyInfo({ sent: false });
                          setShowRegister(false);
                          setEmail("");
                          setPassword("");
                          setConfirm("");
                          setError(null);
                        }
                      }}
                      className="absolute left-4 top-4 w-7 h-7 flex items-center justify-center rounded-full text-black bg-transparent hover:bg-black/5 transition-colors"
                      aria-label="Abbrechen und zurück zum Login"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    <div className="flex items-center justify-center mb-2 pt-2">
                      <img
                        src="/briefkasten.svg"
                        alt="Briefkasten"
                        className="w-24 h-24 object-contain"
                        onError={(e) => { const el = e.currentTarget as HTMLImageElement; el.onerror = null; el.outerHTML = '<div style="font-size:28px;">📮</div>'; }}
                      />
                    </div>
                    <div className="flex flex-col gap-3 w-full items-center text-center flex-grow">
                      <h2 className="text-lg font-semibold">E-Mail bestätigen</h2>
                      <p className="text-black/70 text-sm">
                        Wir haben dir eine Bestätigungs-E-Mail an {verifyInfo.email ?? user?.email ?? "deine E-Mail"} gesendet.
                      </p>
                      <div className="flex flex-col items-center gap-2 mt-3">
                        <button onClick={checkVerifiedNow} disabled={checkingVerification} className="px-4 py-2 rounded-full bg-black text-white font-semibold disabled:opacity-60 hover:opacity-90">
                          {checkingVerification ? "Prüfe…" : "Ich habe bestätigt"}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-center pt-3">
                      <button onClick={resendVerification} className="text-sm text-black/70 underline hover:text-black">
                        E-Mail erneut senden
                      </button>
                    </div>
                  </div>
                ) : mustPickGames ? (
                  <div className="bg-white rounded-2xl shadow-none p-6 w-full">
                    <div className="flex flex-col gap-4 w-full">
                    <h2 className="text-lg font-semibold">Welche Games spielst du?</h2>
                    <p className="text-sm text-black/70">Wähle ein paar aus. Das hilft uns, passende Minigames und Rewards zu zeigen.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {GAMES.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => toggleGame(g)}
                          className={`px-3 py-2 rounded border text-left ${selectedGames.includes(g) ? 'border-black ring-2 ring-black' : 'border-black/30'}`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={saveGames}
                      disabled={savingGames}
                      className="mt-2 px-4 py-2 rounded-full bg-black text-white font-semibold disabled:opacity-60 w-full md:w-1/2 mx-auto"
                    >
                      {savingGames ? 'Speichere…' : 'Weiter'}
                    </button>
                    <p
                      className="text-sm text-black/60 text-center mt-1 underline cursor-pointer"
                      onClick={skipGames}
                    >
                      Überspringen
                    </p>
                    </div>
                  </div>
                ) : (mustComplete || showComplete) ? (
                  <div className="bg-white rounded-2xl shadow-none p-6 w-full">
                    <div className="flex flex-col gap-4 w-full">
                      <h2 className="text-lg font-semibold">Profil vervollständigen</h2>
                      <div className="flex flex-col gap-2">
                      <label className="text-sm text-black/70">Nutzername</label>
                      <input
                        type="text"
                        placeholder="z. B. dani"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="px-4 py-2 rounded border border-black/40 focus:outline-none focus:ring-2 focus:ring-black/30 bg-white text-black w-full"
                      />
                    </div>
                    {presetUrls.length > 0 && (
                      <div>
                        <p className="text-sm text-black/70 mb-2">Profilbild</p>
                        <div 
                          ref={presetScrollRefComplete} 
                          className="overflow-x-scroll pb-1 pt-0.5" 
                          style={{ overflowX: 'scroll', WebkitOverflowScrolling: 'touch' }}
                          onWheel={handleWheelScroll}
                        >
                          <div className="flex gap-1.5 pr-1">
                            {presetUrls.map((url) => (
                              <button
                                key={url}
                                type="button"
                                onClick={() => handleAvatarSelection(url)}
                                className={`shrink-0 rounded border ${
                                  selectedPreset === url ? 'border-black ring-2 ring-black' : 'border-black/30'
                                }`}
                                style={{ padding: 0 }}
                              >
                                <div className="rounded overflow-hidden" style={{ width: 'calc(6rem * 0.95)', height: '6rem' }}>
                                  <img src={url} alt="Preset Avatar" className="w-full h-full object-cover" />
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {presetUrls.length === 0 && (
                      <p className="text-sm text-black/60">Keine Avatare gefunden. Lade Dateien nach <code>avatars/</code> hoch und erlaube <code>read</code>-Zugriff.</p>
                    )}
                    <button
                      onClick={saveProfile}
                      disabled={saving || !username.trim() || !selectedPreset}
                      className="px-4 py-2 rounded-full bg-black text-white font-semibold disabled:opacity-60 w-full md:w-1/2 mx-auto block mb-2"
                    >
                      {saving ? "Speichern…" : "Speichern"}
                    </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6 w-full">
                    {/* Profil Container - Weißer Block mit scrollbarem Inhalt */}
                    <div className="bg-white rounded-2xl shadow-none flex flex-col" style={{ height: 'auto', maxHeight: '400px' }}>
                      {/* Header mit Titel und Buttons - fixiert */}
                      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-black/10 flex-shrink-0">
                        <h2 className="text-lg font-semibold">Profil</h2>
                        <div className="flex items-center gap-2">
                          <button onClick={logout} disabled={busy} className="px-3 py-1.5 text-sm rounded-full bg-gray-100 text-black font-semibold disabled:opacity-60 hover:bg-gray-200">{busy ? "Logging out…" : "Logout"}</button>
                          <button onClick={deleteAccount} disabled={busy} className="px-3 py-1.5 text-sm rounded-full border border-gray-300 text-black font-semibold disabled:opacity-60 hover:bg-gray-50 whitespace-nowrap">Account löschen</button>
                          {/* Admin test button moved to /test-console */}
                        </div>
                      </div>
                      
                      {/* Scrollbarer Content */}
                      <div className="flex-1 overflow-y-auto px-6 py-3">
                        <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-2">
                        <label className="text-sm text-black/70">Nutzername</label>
                        <input
                          type="text"
                          placeholder="z. B. dani"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="px-4 py-2 rounded border border-black/40 focus:outline-none focus:ring-2 focus:ring-black/30 bg-white text-black w-full"
                        />
                      </div>
                      {presetUrls.length > 0 && (
                        <div>
                          <p className="text-sm text-black/70 mb-2">Profilbild</p>
                          <div 
                            ref={presetScrollRefEdit} 
                            className="overflow-x-scroll pb-1 pt-0.5" 
                            style={{ overflowX: 'scroll', WebkitOverflowScrolling: 'touch' }}
                            onWheel={handleWheelScroll}
                          >
                            <div className="flex gap-1.5 pr-1">
                              {presetUrls.map((url) => (
                                <button
                                  key={url}
                                  type="button"
                                  onClick={() => handleAvatarSelection(url)}
                                  className={`shrink-0 rounded border ${
                                    selectedPreset === url ? 'border-black ring-2 ring-black' : 'border-black/30'
                                  }`}
                                  style={{ padding: 0 }}
                                >
                                  <div className="rounded overflow-hidden" style={{ width: 'calc(6rem * 0.95)', height: '6rem' }}>
                                    <img src={url} alt="Preset Avatar" className="w-full h-full object-cover" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                          <button
                            onClick={saveProfile}
                            disabled={saving || !username.trim() || (!selectedPreset && !user?.photoURL)}
                            className="px-4 py-2 rounded-full bg-black text-white font-semibold disabled:opacity-60 w-full md:w-1/2 mx-auto block mt-3"
                          >
                            {saving ? "Speichern…" : "Speichern"}
                          </button>
                        </div>
                      )}
                      {presetUrls.length === 0 && (
                        <div className="flex flex-col gap-2">
                          <p className="text-sm text-black/60">Keine Avatare gefunden. Lade Dateien nach <code>avatars/</code> im selben Projekt-Bucket hoch und erlaube <code>read</code>-Zugriff in den Storage-Regeln.</p>
                          <button
                            onClick={saveProfile}
                            disabled={saving || !username.trim() || (!selectedPreset && !user?.photoURL)}
                            className="px-4 py-2 rounded-full bg-black text-white font-semibold disabled:opacity-60 w-full md:w-1/2 mx-auto block"
                          >
                            {saving ? "Speichern…" : "Speichern"}
                          </button>
                        </div>
                      )}
                      {/* E-Mail/Passwort ändern – nur für E-Mail-Konten */}
                      {user?.providerData?.some(p => p.providerId === 'password') && !showComplete && (
                        <>
                          <div className="my-2 h-px bg-black/10" />
                          <div className="flex flex-col gap-4 px-6">
                            <h3 className="text-base font-semibold">E-Mail & Passwort</h3>

                            <label className="text-sm text-black/70">Aktuelles Passwort</label>
                            <input
                              type="password"
                              placeholder="Aktuelles Passwort"
                              value={currentPwd}
                              onChange={(e) => setCurrentPwd(e.target.value)}
                              className="px-4 py-2 rounded bg-white text-black w-full border border-black/40 focus:outline-none focus:ring-2 focus:ring-black/30"
                              autoComplete="current-password"
                            />

                            <div className="flex flex-col gap-4">
                              <div className="flex flex-col gap-2">
                                <label className="text-sm text-black/70">Neue E-Mail</label>
                                <input
                                  type="email"
                                  placeholder="neue@mail.de"
                                  value={newEmail}
                                  onChange={(e) => setNewEmail(e.target.value)}
                                  className="px-4 py-2 rounded bg-white text-black w-full border border-black/40 focus:outline-none focus:ring-2 focus:ring-black/30"
                                  autoComplete="email"
                                />
                                <button
                                  type="button"
                                  onClick={changeEmail}
                                  disabled={changing}
                                  className="w-1/2 mx-auto px-4 py-2 rounded-full bg-black text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
                                >
                                  {changing ? "Speichere…" : "E-Mail ändern"}
                                </button>
                                {emailError && (
                                  <p role="alert" className="text-sm text-red-600 text-center mt-2">{emailError}</p>
                                )}
                              </div>

                              <div className="flex flex-col gap-2">
                                <label className="text-sm text-black/70">Neues Passwort</label>
                                <input
                                  type="password"
                                  placeholder="Neues Passwort"
                                  value={newPwd}
                                  onChange={(e) => setNewPwd(e.target.value)}
                                  className="px-4 py-2 rounded bg-white text-black w-full border border-black/40 focus:outline-none focus:ring-2 focus:ring-black/30"
                                  autoComplete="new-password"
                                />
                                <button
                                  type="button"
                                  onClick={changePassword}
                                  disabled={changing}
                                  className="w-1/2 mx-auto px-4 py-2 rounded-full bg-black text-white text-sm font-semibold disabled:opacity-60 hover:opacity-90"
                                >
                                  {changing ? "Speichere…" : "Passwort ändern"}
                                </button>
                                {passwordError && (
                                  <p role="alert" className="text-sm text-red-600 text-center mt-2">{passwordError}</p>
                                )}
                              </div>
                            </div>

                            {msg && <p className="text-sm text-black/70">{msg}</p>}
                          </div>
                        </>
                      )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Referral Section - Weißer Block */}
                    <ReferralSection uid={user.uid} />
                  </div>
                )
              ) : (
                <div className="relative flex flex-col gap-3 bg-white rounded-2xl shadow-none p-5 w-full max-w-md mx-auto overflow-hidden">
                  {/* Local blocker for this card (covers whole white area when busy) */}
                  {busy && (
                    <div
                      className="absolute bg-black/80 flex items-center justify-center pointer-events-auto z-[9999]"
                      style={{ top: '-8px', left: '-8px', right: '-8px', bottom: '-8px', borderRadius: 'inherit' }}
                    >
                      <div className="w-8 h-8 border-4 border-white/50 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {/* Header Image & Welcome (moved into Login view below) */}
                  
                  {showRegister ? (
                    <div className="flex flex-col">
                      {/* Register View */}
                      <div className="flex items-center gap-0 mb-3">
                        <button
                          type="button"
                          onClick={() => setShowRegister(false)}
                          aria-label="Zurück zum Login"
                          className="p-0 rounded-full hover:bg-black/5"
                          style={{ lineHeight: 0 }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <h2 className="text-lg font-semibold m-0">Account erstellen</h2>
                      </div>
                      <div className="flex flex-col gap-3">
                        <input
                          type="email"
                          placeholder="E-Mail"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="px-4 py-2 rounded bg-white text-black w-full border border-black/40 focus:outline-none focus:ring-2 focus:ring-black/30"
                          autoComplete="email"
                        />
                        <input
                          type="password"
                          placeholder="Passwort"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="px-4 py-2 rounded bg-white text-black w-full border border-black/40 focus:outline-none focus:ring-2 focus:ring-black/30"
                          autoComplete="new-password"
                        />
                        <input
                          type="password"
                          placeholder="Passwort bestätigen"
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                          className="px-4 py-2 rounded bg-white text-black w-full border border-black/40 focus:outline-none focus:ring-2 focus:ring-black/30"
                          autoComplete="new-password"
                        />
                        <label className="sr-only" htmlFor="age-select">Alter</label>
                        <select
                          id="age-select"
                          value={age}
                          onChange={(e) => setAge(e.target.value)}
                          className="px-3 py-1.5 rounded bg-white text-black w-full border border-black/40 focus:outline-none focus:ring-2 focus:ring-black/30"
                        >
                          <option value="">Alter auswählen</option>
                          {Array.from({ length: 87 }, (_, i) => 14 + i).map((v) => (
                            <option key={v} value={String(v)}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={registerEmail}
                        disabled={busy}
                        className="mt-4 mb-4 px-4 py-2 rounded-full bg-black text-white font-semibold w-1/2 mx-auto block hover:opacity-90"
                      >
                        {busy ? "Erstelle…" : "Account erstellen"}
                      </button>
                      {error && (
                        <p role="alert" aria-live="assertive" className="mt-2 text-sm text-red-600 text-center break-words">{error}</p>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Header Image & Welcome - only for Login view */}
                      <div className="flex flex-col items-center gap-1">
                        <div className="wave-container">
                          <img 
                            src="/wave-emoji.png" 
                            alt="Wave" 
                            className="w-20 h-20 object-contain"
                            style={{ imageRendering: 'pixelated' }}
                          />
                        </div>
                        <h1 className="text-lg font-bold text-black">Willkommen bei DROP!</h1>
                      </div>
                      <style dangerouslySetInnerHTML={{
                        __html: `
                          .wave-container {
                            animation: wave 2s ease-in-out infinite;
                            transform-origin: 70% 70%;
                          }
                          @keyframes wave {
                            0%, 100% { transform: rotate(0deg); }
                            10%, 30% { transform: rotate(8deg); }
                            20% { transform: rotate(-4deg); }
                            40%, 60% { transform: rotate(8deg); }
                            50% { transform: rotate(-4deg); }
                            70%, 90% { transform: rotate(0deg); }
                          }
                        `
                      }} />
                      {/* Login View */}
                      <div className="relative">
                        <button onClick={loginGoogle} disabled={busy} className="px-5 py-2 rounded-full bg-white text-black font-semibold w-full max-w-full disabled:opacity-60 border border-black/40 focus:outline-none focus:ring-2 focus:ring-black/20">{busy ? "Logging in…" : "Mit Google einloggen"}</button>
                      </div>
                      <div className="flex items-center gap-2 text-black/60 text-sm">
                        <div className="flex-1 h-px bg-black/20" />
                        <span>oder</span>
                        <div className="flex-1 h-px bg-black/20" />
                      </div>
                      <input
                        type="email"
                        placeholder="E-Mail"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="px-3 py-1.5 rounded bg-white text-black w-full border border-black/40 focus:outline-none focus:ring-2 focus:ring-black/30"
                        autoComplete="email"
                      />
                      <input
                        type="password"
                        placeholder="Passwort"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="px-3 py-1.5 rounded bg-white text-black w-full border border-black/40 focus:outline-none focus:ring-2 focus:ring-black/30"
                        autoComplete="current-password"
                      />
                      <button onClick={loginEmail} disabled={busy} className="px-4 py-1.5 rounded-full bg-black text-white font-semibold w-1/2 max-w-full mx-auto block hover:opacity-90">Login</button>
                      <p
                        className="text-sm text-black/70 text-center mt-1 cursor-pointer underline"
                        onClick={() => setShowRegister(true)}
                      >
                        Account erstellen &gt;
                      </p>
                      {error && (
                        <p role="alert" aria-live="assertive" className="mt-2 text-sm text-red-600 text-center break-words">{error}</p>
                      )}
                    </>
                  )}
                </div>
              )}
              
            </div>
          </div>
        </>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return <AccountPanel />;
}