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
import { getStorage, ref as storageRef, getDownloadURL, listAll } from "firebase/storage";

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
  const [presetUrls, setPresetUrls] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const [verifyInfo, setVerifyInfo] = useState<{sent: boolean; email?: string}>({sent: false});
  const [checkingVerification, setCheckingVerification] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [changing, setChanging] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [profileCompletedFlag, setProfileCompletedFlag] = useState<boolean | null>(null);
  const mustComplete = !!user && !!user.emailVerified && profileCompletedFlag === false;
  // Track whether registration/verification/completion is in progress
  const registrationInProgress = (
    user ? (!user.emailVerified || mustComplete || showComplete) : showRegister
  );
  // Optionally mark as gated on initial mount if user not ready yet
  if (!wasGatedRef.current) {
    wasGatedRef.current = !!(user ? (!user.emailVerified || mustComplete || showComplete) : showRegister);
  }
  // Add a flag to reload only right after completing the profile from the gated flow.
  const [justCompleted, setJustCompleted] = useState(false);

  // Hard gate: prevent leaving while login/verify/complete is required
  useEffect(() => {
    if (!registrationInProgress) return;
    // block browser back
    const onPop = () => {
      history.pushState(null, "", location.href);
    };
    history.pushState(null, "", location.href);
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
              // Force completion flow if not completed
              setShowComplete(!completed);
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
          setShowComplete(false);
          setUsername("");
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
    const CACHE_KEY = 'drop_avatar_urls_v1';
    const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 Woche

    // Try session cache first
    try {
      if (typeof window !== 'undefined') {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw) as { ts: number; urls: string[] } | null;
          if (cached && Array.isArray(cached.urls) && (Date.now() - cached.ts) < TTL_MS) {
            setPresetUrls(cached.urls);
            return; // skip Storage calls
          }
        }
      }
    } catch (e) {
      console.warn('[avatars] Cache read failed', e);
    }

    // Fallback: fetch from Storage once and cache
    const storage = getStorage();
    const folderRef = storageRef(storage, 'avatars/');
    listAll(folderRef)
      .then(async (res) => {
        if (res.items.length === 0) {
          console.warn('Keine Dateien unter /avatars gefunden. Prüfe Bucket & Pfad.');
        }
        const urls = await Promise.all(
          res.items.map(async (item) => {
            try {
              const url = await getDownloadURL(item);
              return url;
            } catch (e) {
              console.warn('getDownloadURL fehlgeschlagen für', item.fullPath, e);
              return null;
            }
          })
        );
        const finalUrls = urls.filter((u): u is string => Boolean(u));
        setPresetUrls(finalUrls);
        try {
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), urls: finalUrls }));
          }
        } catch (e) {
          console.warn('[avatars] Cache write failed', e);
        }
      })
      .catch((e) => {
        console.warn('listAll fehlgeschlagen für /avatars:', e);
      });
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
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      const completed = (snap.data() as any)?.profileCompleted === true;
      // Set UI state immediately so gating applies without waiting for onAuthStateChanged
      setProfileCompletedFlag(completed && !!cred.user.displayName && !!cred.user.photoURL);
      setShowComplete(!(completed && !!cred.user.displayName && !!cred.user.photoURL));
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
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      const completed = (snap.data() as any)?.profileCompleted === true;
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
      // 1) Erlaubter Create-Merge ohne geschützte Felder
      await setDoc(
        doc(db, "users", cred.user.uid),
        { age: nAge, ageUpdatedAt: serverTimestamp() },
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

  const logout = async () => {
    setError(null);
    const ok = window.confirm("Jetzt abmelden?");
    if (!ok) return;
    setBusy(true);
    try {
      console.log("Logout clicked. currentUser:", auth.currentUser?.uid);
      await signOut(auth);
      console.log("Logout success");
    } catch (e: any) {
      console.error("Logout error:", e?.code, e?.message || e);
      setError(prettyAuthError(e) || 'Logout fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

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
    const name = username.trim();
    if (!name) {
      setError("Bitte Nutzernamen eingeben");
      return;
    }
    setSaving(true);
    try {
      let photoURL: string | null = selectedPreset ?? user.photoURL ?? null;
      if (!photoURL) {
        setError("Bitte einen Avatar wählen");
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
    setError(null); setMsg(null);
    if (!newEmail.trim()) { setError("Neue E-Mail angeben"); return; }
    if (!currentPwd.trim()) { setError("Aktuelles Passwort angeben"); return; }
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
      setError(prettyAuthError(e) || 'E-Mail-Update fehlgeschlagen');
    } finally { setChanging(false); }
  };

  const changePassword = async () => {
    if (!user) return;
    setError(null); setMsg(null);
    if (!newPwd.trim() || newPwd.length < 6) { setError("Neues Passwort min. 6 Zeichen"); return; }
    if (!currentPwd.trim()) { setError("Aktuelles Passwort angeben"); return; }
    setChanging(true);
    try {
      await reauthWithPassword();
      await updatePassword(user, newPwd);
      setMsg("Passwort aktualisiert");
      setNewPwd(""); setCurrentPwd("");
    } catch (e: any) {
      setError(prettyAuthError(e) || 'Passwort-Update fehlgeschlagen');
    } finally { setChanging(false); }
  };

  const deleteAccount = async () => {
    if (!user) return;
    setError(null); setMsg(null);
    const ok = window.confirm("Konto endgültig löschen? Dies kann nicht rückgängig gemacht werden.");
    if (!ok) return;
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
          const providers = user.providerData.map(p => p.providerId);
          if (providers.includes('google.com')) {
            await reauthenticateWithPopup(user, new GoogleAuthProvider());
          } else if (providers.includes('password')) {
            setError('Bitte mit E-Mail/Passwort neu einloggen und erneut löschen.');
            setBusy(false);
            return;
          } else {
            setError('Bitte erneut einloggen und dann nochmal löschen.');
            setBusy(false);
            return;
          }
          // Reauth erfolgreich → erneut versuchen
          await doDelete();
          return;
        } catch (reauthErr: any) {
          console.error('[delete] reauth failed', reauthErr);
          setError(prettyAuthError(reauthErr) || 'Re-Authentifizierung fehlgeschlagen');
        }
      } else {
        setError(prettyAuthError(e) || 'Löschen fehlgeschlagen');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={embedded ? "relative w-full bg-white text-black flex flex-col" : "relative min-h-screen w-screen bg-white text-black flex flex-col"}>
      {/* Busy overlay for login/register */}
      {!user && busy && (
        <div className={(embedded ? "absolute" : "fixed") + " inset-0 bg-black/90 flex items-center justify-center z-50"}>
          <div className="w-10 h-10 border-4 border-white/50 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {authLoading && (
        <div className={(embedded ? "absolute" : "fixed") + " inset-0 bg-black/90 flex items-center justify-center z-50"}>
          <div className="w-10 h-10 border-4 border-white/50 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {/* Registration gating overlay to block outside clicks */}
      {registrationInProgress && (
        <div
          className="fixed inset-0 z-40"
          aria-hidden
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        />
      )}
      <div className={(authLoading ? "opacity-0 pointer-events-none" : "opacity-100 transition-opacity") + " relative z-50"}>
        <>
          <div className={( !user || registrationInProgress ? "px-6 pt-2 pb-3" : "p-6") + " flex items-center justify-between w-full"}>
            <div className="h-4" />
            {user && !registrationInProgress ? (
              <div className="flex items-center gap-2">
                <button onClick={logout} disabled={busy} className="px-4 py-2 rounded-full bg-white text-black font-semibold disabled:opacity-60">{busy ? "Logging out…" : "Logout"}</button>
                <button onClick={deleteAccount} disabled={busy} className="px-4 py-2 rounded-full border border-black text-black font-semibold disabled:opacity-60">Account löschen</button>
              </div>
            ) : null}
          </div>

          <div
            className="flex-1 flex items-center justify-center"
            style={{ minHeight: embedded ? undefined : "calc(100vh - 96px)" }}
          >
            <div
              ref={panelRef}
              className="relative z-50 px-6 pb-8 max-w-xl w-full box-border"
            >
              {user ? (
                !user.emailVerified ? (
                  <div className="flex flex-col gap-4 w-full">
                    <h2 className="text-lg font-semibold">E-Mail bestätigen</h2>
                    <p className="text-black/70 text-sm">
                      Wir haben dir eine Bestätigungs-E-Mail an {verifyInfo.email ?? user?.email ?? "deine E-Mail"} gesendet.
                    </p>
                    <div className="flex flex-col items-center gap-2 mt-3 mb-4">
                      <button onClick={checkVerifiedNow} disabled={checkingVerification} className="px-4 py-2 rounded-full bg-black text-white font-semibold disabled:opacity-60 hover:opacity-90">
                        {checkingVerification ? "Prüfe…" : "Ich habe bestätigt"}
                      </button>
                      <button onClick={resendVerification} className="text-sm text-black/70 underline hover:text-black">
                        E-Mail erneut senden
                      </button>
                    </div>
                  </div>
                ) : (mustComplete || showComplete) ? (
                  <div className="flex flex-col gap-4 w-full">
                    <h2 className="text-lg font-semibold">Profil vervollständigen</h2>
                    <div className="flex flex-col gap-1">
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
                        <div className="grid grid-cols-6 gap-2">
                          {presetUrls.map((url) => (
                            <button
                              key={url}
                              type="button"
                              onClick={() => setSelectedPreset(url)}
                              className={`aspect-square rounded overflow-hidden border ${
                                selectedPreset === url ? "border-black ring-2 ring-black" : "border-black/30"
                              }`}
                            >
                              <img src={url} alt="Preset Avatar" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {presetUrls.length === 0 && (
                      <p className="text-sm text-black/60">Keine Avatare gefunden. Lade Dateien nach <code>avatars/</code> hoch und erlaube <code>read</code>-Zugriff.</p>
                    )}
                    <button
                      onClick={saveProfile}
                      disabled={saving || !username.trim() || (!selectedPreset && !user?.photoURL)}
                      className="px-4 py-2 rounded-full bg-black text-white font-semibold disabled:opacity-60 w-full md:w-1/2 mx-auto block mb-2"
                    >
                      {saving ? "Speichern…" : "Speichern"}
                    </button>
                  </div>
                ) : (
                  (
                    <div className="flex flex-col gap-4 w-full">
                      <h2 className="text-lg font-semibold">Profil bearbeiten</h2>
                      <div className="flex flex-col gap-1">
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
                          <div className="grid grid-cols-6 gap-2">
                            {presetUrls.map((url) => (
                              <button
                                key={url}
                                type="button"
                                onClick={() => setSelectedPreset(url)}
                                className={`aspect-square rounded overflow-hidden border ${
                                  selectedPreset === url ? "border-black ring-2 ring-black" : "border-black/30"
                                }`}
                              >
                                <img src={url} alt="Preset Avatar" className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {presetUrls.length === 0 && (
                        <p className="text-sm text-black/60">Keine Avatare gefunden. Lade Dateien nach <code>avatars/</code> im selben Projekt-Bucket hoch und erlaube <code>read</code>-Zugriff in den Storage-Regeln.</p>
                      )}
                      <button
                        onClick={saveProfile}
                        disabled={saving || !username.trim()}
                        className="px-4 py-2 rounded-full bg-black text-white font-semibold disabled:opacity-60 w-full md:w-1/2 mx-auto block mb-2"
                      >
                        {saving ? "Speichern…" : "Speichern"}
                      </button>
                      {/* E-Mail/Passwort ändern – nur für E-Mail-Konten */}
                      {user?.providerData?.some(p => p.providerId === 'password') && !showComplete && (
                        <>
                          <div className="my-2 h-px bg-black/10" />
                          <div className="flex flex-col gap-4">
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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                  className="w-full px-4 py-2 rounded-full bg-black text-white font-semibold disabled:opacity-60 hover:opacity-90"
                                >
                                  {changing ? "Speichere…" : "E-Mail ändern"}
                                </button>
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
                                  className="w-full px-4 py-2 rounded-full bg-black text-white font-semibold disabled:opacity-60 hover:opacity-90"
                                >
                                  {changing ? "Speichere…" : "Passwort ändern"}
                                </button>
                              </div>
                            </div>

                            {msg && <p className="text-sm text-black/70">{msg}</p>}
                          </div>
                        </>
                      )}
                    </div>
                  )
                )
              ) : (
                <div className="flex flex-col gap-4">
                  {showRegister ? (
                    <div className="flex flex-col">
                      {/* Register View */}
                      <button
                        type="button"
                        onClick={() => setShowRegister(false)}
                        aria-label="Zurück zum Login"
                        className="self-start p-1 mb-1 rounded-full hover:bg-black/5"
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <h2 className="text-lg font-semibold mb-3">Account erstellen</h2>
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
                        <input
                          type="number"
                          placeholder="Alter"
                          value={age}
                          onChange={(e) => setAge(e.target.value)}
                          className="px-4 py-2 rounded bg-white text-black w-full border border-black/40 focus:outline-none focus:ring-2 focus:ring-black/30"
                          min={13}
                          max={120}
                          inputMode="numeric"
                        />
                      </div>
                      <button
                        onClick={registerEmail}
                        disabled={busy || password.length < 6 || password !== confirm || !age.trim()}
                        className="mt-5 mb-6 px-4 py-2 rounded-full bg-black text-white font-semibold w-1/2 mx-auto block hover:opacity-90"
                      >
                        {busy ? "Erstelle…" : "Account erstellen"}
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Login View */}
                      <button onClick={loginGoogle} disabled={busy} className="px-6 py-2 rounded-full bg-white text-black font-semibold w-full max-w-full disabled:opacity-60 border border-black/40 focus:outline-none focus:ring-2 focus:ring-black/20">{busy ? "Logging in…" : "Mit Google einloggen"}</button>
                      <div className="flex items-center gap-3 text-black/60 text-sm">
                        <div className="flex-1 h-px bg-black/20" />
                        <span>oder</span>
                        <div className="flex-1 h-px bg-black/20" />
                      </div>
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
                        autoComplete="current-password"
                      />
                      <button onClick={loginEmail} disabled={busy} className="px-4 py-2 rounded-full bg-black text-white font-semibold w-1/2 max-w-full mx-auto block hover:opacity-90">Login</button>
                      <p
                        className="text-sm text-black/70 text-center my-2 cursor-pointer underline"
                        onClick={() => setShowRegister(true)}
                      >
                        Account erstellen &gt;
                      </p>
                    </>
                  )}
                </div>
              )}

              {error && <p className="mt-4 text-sm text-black/70 break-words">{error}</p>}
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