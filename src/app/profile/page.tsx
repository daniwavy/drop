"use client";
import { useEffect, useState } from "react";
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
import { doc, setDoc, serverTimestamp, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { getStorage, ref as storageRef, getDownloadURL, listAll } from "firebase/storage";

async function upsertUser(u: User) {
  const ref = doc(db, "users", u.uid);
  await setDoc(
    ref,
    {
      email: u.email ?? null,
      displayName: u.displayName ?? null,
      photoURL: u.photoURL ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

async function ensureUserDoc(u: User) {
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email: u.email ?? null,
      displayName: u.displayName ?? null,
      photoURL: u.photoURL ?? null,
      profileCompleted: false,
      updatedAt: serverTimestamp(),
    });
  }
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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

  // Track whether registration flow is in progress
  const registrationInProgress = (user ? (!user.emailVerified || showComplete) : showRegister);

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
        getDoc(ref).then((snap) => {
          const data = snap.data() as any | undefined;
          const completed = data?.profileCompleted === true;
          setShowComplete(!completed);
          if (u.displayName) setUsername(u.displayName);
          setAuthLoading(false);
        }).catch(() => setAuthLoading(false));
      } else {
        setShowComplete(false);
        setUsername("");
        setAuthLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const storage = getStorage();
    const folderRef = storageRef(storage, "avatars/"); // trailing slash explicit
    listAll(folderRef)
      .then(async (res) => {
        console.log("[avatars] prefixes:", res.prefixes.map((p) => p.fullPath));
        console.log("[avatars] items:", res.items.map((i) => i.fullPath));
        if (res.items.length === 0) {
          console.warn("Keine Dateien unter /avatars gefunden. Prüfe Bucket & Pfad.");
        }
        const urls = await Promise.all(
          res.items.map(async (item) => {
            try {
              const url = await getDownloadURL(item);
              return url;
            } catch (e) {
              console.warn("getDownloadURL fehlgeschlagen für", item.fullPath, e);
              return null;
            }
          })
        );
        setPresetUrls(urls.filter((u): u is string => Boolean(u)));
      })
      .catch((e) => {
        console.warn("listAll fehlgeschlagen für /avatars:", e);
      });
  }, []);

  // Preselect current values for username and avatar after presets loaded
  useEffect(() => {
    if (user) {
      if (user.displayName) setUsername(user.displayName);
      if (user.photoURL && presetUrls.includes(user.photoURL)) {
        setSelectedPreset(user.photoURL);
      }
    }
  }, [user, presetUrls]);

  const loginGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await upsertUser(cred.user);
      await ensureUserDoc(cred.user);
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      const completed = (snap.data() as any)?.profileCompleted === true;
      setShowComplete(!completed);
    } catch (e: any) {
      setError(e?.message ?? "Login fehlgeschlagen");
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
      await upsertUser(cred.user);
      await ensureUserDoc(cred.user);
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      const completed = (snap.data() as any)?.profileCompleted === true;
      setShowComplete(!completed);
      setEmail("");
      setPassword("");
    } catch (e: any) {
      setError(e?.message ?? "Login fehlgeschlagen");
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
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await upsertUser(cred.user);
      await ensureUserDoc(cred.user);
      await sendEmailVerification(cred.user);
      setVerifyInfo({ sent: true, email: cred.user.email ?? email.trim() });
      // We require verification before completion flow
      setShowRegister(false);
      setShowComplete(false);
      setEmail("");
      setPassword("");
      setConfirm("");
    } catch (e: any) {
      setError(e?.message ?? "Registrierung fehlgeschlagen");
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
      setError(`${e?.code ?? ""} ${e?.message ?? "Logout fehlgeschlagen"}`);
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
      setError(e?.message ?? "E-Mail konnte nicht gesendet werden");
    }
  };

  const checkVerifiedNow = async () => {
    if (!auth.currentUser) return;
    setCheckingVerification(true);
    try {
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        // proceed to completion flow gating
        await upsertUser(auth.currentUser);
        await ensureUserDoc(auth.currentUser);
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        const completed = (snap.data() as any)?.profileCompleted === true;
        setShowComplete(!completed);
        setVerifyInfo({ sent: false });
      }
    } catch (e: any) {
      setError(e?.message ?? "Überprüfung fehlgeschlagen");
    } finally {
      setCheckingVerification(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
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
      router.push("/drop");
    } catch (e: any) {
      setError(e?.message ?? "Speichern fehlgeschlagen");
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
      setError(e?.message ?? "E-Mail-Update fehlgeschlagen");
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
      setError(e?.message ?? "Passwort-Update fehlgeschlagen");
    } finally { setChanging(false); }
  };

  const deleteAccount = async () => {
    if (!user) return;
    setError(null); setMsg(null);
    const ok = window.confirm("Konto endgültig löschen? Dies kann nicht rückgängig gemacht werden.");
    if (!ok) return;
    setBusy(true);
    try {
      const uid = user.uid;
      // Firestore-Dokument zuerst entfernen (best effort)
      try { await deleteDoc(doc(db, "users", uid)); } catch {}
      // Versuche zu löschen
      await deleteUser(user);
      router.push("/");
    } catch (e: any) {
      if (e?.code === 'auth/requires-recent-login') {
        try {
          // Reauth abhängig vom Provider
          const providers = user.providerData.map(p => p.providerId);
          if (providers.includes('google.com')) {
            await reauthenticateWithPopup(user, new GoogleAuthProvider());
          } else if (providers.includes('password')) {
            // Für E-Mail/Passwort hier keine UI – Hinweis ausgeben
            setError('Bitte mit E-Mail/Passwort neu einloggen und erneut löschen.');
            setBusy(false);
            return;
          } else {
            setError('Bitte erneut einloggen und dann nochmal löschen.');
            setBusy(false);
            return;
          }
          // Nach erfolgreicher Reauth nochmal löschen
          const uid2 = user.uid;
          try { await deleteDoc(doc(db, "users", uid2)); } catch {}
          await deleteUser(user);
          router.push("/");
          return;
        } catch (reauthErr: any) {
          setError(reauthErr?.message ?? 'Re-Authentifizierung fehlgeschlagen');
        }
      } else {
        setError(e?.message ?? 'Löschen fehlgeschlagen');
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-screen w-screen bg-red-500 text-white flex flex-col">
      {/* Busy overlay for login/register */}
      {!user && busy && (
        <div className="fixed inset-0 bg-red-500/90 flex items-center justify-center z-50">
          <div className="w-10 h-10 border-4 border-white/50 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {authLoading && (
        <div className="fixed inset-0 bg-red-500/90 flex items-center justify-center z-50">
          <div className="w-10 h-10 border-4 border-white/50 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div className={authLoading ? "opacity-0 pointer-events-none" : "opacity-100 transition-opacity"}>
        <>
          <div className="p-6 flex items-center justify-between w-full">
            <Link href="/">
              <img src="/logo.png" alt="DROP" className="h-4 w-auto select-none" />
            </Link>
            {user && !registrationInProgress ? (
              <div className="flex items-center gap-2">
                <button onClick={logout} disabled={busy} className="px-4 py-2 rounded-full bg-white text-black font-semibold disabled:opacity-60">{busy ? "Logging out…" : "Logout"}</button>
                <button onClick={deleteAccount} disabled={busy} className="px-4 py-2 rounded-full border border-white text-white font-semibold disabled:opacity-60">Account löschen</button>
              </div>
            ) : null}
          </div>

          <div className="flex-1 flex items-center justify-center" style={{ minHeight: "calc(100vh - 96px)" }}>
            <div className="px-6 max-w-xl w-full">
              {user ? (
                !user.emailVerified ? (
                  <div className="flex flex-col gap-4 w-full">
                    <h2 className="text-lg font-semibold">E-Mail bestätigen</h2>
                    <p className="text-white/80 text-sm">
                      Wir haben dir eine Bestätigungs-E-Mail an {verifyInfo.email ?? user?.email ?? "deine E-Mail"} gesendet.
                    </p>
                    <div className="flex gap-3">
                      <button onClick={resendVerification} className="px-4 py-2 rounded-full bg-white text-black font-semibold">
                        E-Mail erneut senden
                      </button>
                      <button onClick={checkVerifiedNow} disabled={checkingVerification} className="px-4 py-2 rounded-full bg-white text-black font-semibold disabled:opacity-60">
                        {checkingVerification ? "Prüfe…" : "Ich habe bestätigt"}
                      </button>
                    </div>
                  </div>
                ) : (
                  (
                    <div className="flex flex-col gap-4 w-full">
                      <h2 className="text-lg font-semibold">Profil bearbeiten</h2>
                      <label className="text-sm text-white/80">Nutzername</label>
                      <input
                        type="text"
                        placeholder="z. B. dani"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="px-4 py-2 rounded bg-white text-black w-full"
                      />
                      {presetUrls.length > 0 && (
                        <div>
                          <p className="text-sm text-white/80 mb-2">Profilbild</p>
                          <div className="grid grid-cols-6 gap-2">
                            {presetUrls.map((url) => (
                              <button
                                key={url}
                                type="button"
                                onClick={() => setSelectedPreset(url)}
                                className={`aspect-square rounded overflow-hidden border ${
                                  selectedPreset === url ? "border-white ring-2 ring-white" : "border-white/30"
                                }`}
                              >
                                <img src={url} alt="Preset Avatar" className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {presetUrls.length === 0 && (
                        <p className="text-sm text-white/70">Keine Avatare gefunden. Lade Dateien nach <code>avatars/</code> im selben Projekt-Bucket hoch und erlaube <code>read</code>-Zugriff in den Storage-Regeln.</p>
                      )}
                      <button
                        onClick={saveProfile}
                        disabled={saving || !username.trim()}
                        className="px-4 py-2 rounded-full bg-white text-black font-semibold disabled:opacity-60 w-full md:w-1/2 mx-auto block"
                      >
                        {saving ? "Speichern…" : "Speichern"}
                      </button>
                      {/* E-Mail/Passwort ändern – nur für E-Mail-Konten */}
                      {user?.providerData?.some(p => p.providerId === 'password') && !showComplete && (
                        <>
                          <div className="my-4 h-px bg-white/20" />
                          <div className="flex flex-col gap-4">
                            <h3 className="text-base font-semibold">E-Mail & Passwort</h3>

                            <label className="text-sm text-white/80">Aktuelles Passwort</label>
                            <input
                              type="password"
                              placeholder="Aktuelles Passwort"
                              value={currentPwd}
                              onChange={(e) => setCurrentPwd(e.target.value)}
                              className="px-4 py-2 rounded bg-white text-black w-full"
                              autoComplete="current-password"
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="flex flex-col gap-2">
                                <label className="text-sm text-white/80">Neue E-Mail</label>
                                <input
                                  type="email"
                                  placeholder="neue@mail.de"
                                  value={newEmail}
                                  onChange={(e) => setNewEmail(e.target.value)}
                                  className="px-4 py-2 rounded bg-white text-black w-full"
                                  autoComplete="email"
                                />
                                <button
                                  type="button"
                                  onClick={changeEmail}
                                  disabled={changing}
                                  className="w-full px-4 py-2 rounded-full bg-white text-black font-semibold disabled:opacity-60"
                                >
                                  {changing ? "Speichere…" : "E-Mail ändern"}
                                </button>
                              </div>

                              <div className="flex flex-col gap-2">
                                <label className="text-sm text-white/80">Neues Passwort</label>
                                <input
                                  type="password"
                                  placeholder="Neues Passwort"
                                  value={newPwd}
                                  onChange={(e) => setNewPwd(e.target.value)}
                                  className="px-4 py-2 rounded bg-white text-black w-full"
                                  autoComplete="new-password"
                                />
                                <button
                                  type="button"
                                  onClick={changePassword}
                                  disabled={changing}
                                  className="w-full px-4 py-2 rounded-full bg-white text-black font-semibold disabled:opacity-60"
                                >
                                  {changing ? "Speichere…" : "Passwort ändern"}
                                </button>
                              </div>
                            </div>

                            {msg && <p className="text-sm text-white/80">{msg}</p>}
                          </div>
                        </>
                      )}
                    </div>
                  )
                )
              ) : (
                <div className="flex flex-col gap-4">
                  {showRegister ? (
                    <>
                      {/* Register View */}
                      <h2 className="text-lg font-semibold">Account erstellen</h2>
                      <input
                        type="email"
                        placeholder="E-Mail"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="px-4 py-2 rounded bg-white text-black w-full"
                        autoComplete="email"
                      />
                      <input
                        type="password"
                        placeholder="Passwort"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="px-4 py-2 rounded bg-white text-black w-full"
                        autoComplete="new-password"
                      />
                      <input
                        type="password"
                        placeholder="Passwort bestätigen"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="px-4 py-2 rounded bg-white text-black w-full"
                        autoComplete="new-password"
                      />
                      <button
                        onClick={registerEmail}
                        disabled={busy || password.length < 6 || password !== confirm}
                        className="px-4 py-2 rounded-full bg:white text-black font-semibold disabled:opacity-60 w-1/2 mx-auto block bg-white"
                      >
                        {busy ? "Erstelle…" : "Account erstellen"}
                      </button>
                      <p
                        className="text-sm text-white/80 text-center mt-2 cursor-pointer underline"
                        onClick={() => setShowRegister(false)}
                      >
                        &lt; Zurück zum Login
                      </p>
                    </>
                  ) : (
                    <>
                      {/* Login View */}
                      <button onClick={loginGoogle} disabled={busy} className="px-6 py-2 rounded-full bg-white text-black font-semibold w-full disabled:opacity-60">{busy ? "Logging in…" : "Mit Google einloggen"}</button>
                      <div className="flex items-center gap-3 text-white/60 text-sm">
                        <div className="flex-1 h-px bg-white/30" />
                        <span>oder</span>
                        <div className="flex-1 h-px bg-white/30" />
                      </div>
                      <input
                        type="email"
                        placeholder="E-Mail"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="px-4 py-2 rounded bg-white text-black w-full"
                        autoComplete="email"
                      />
                      <input
                        type="password"
                        placeholder="Passwort"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="px-4 py-2 rounded bg-white text-black w-full"
                        autoComplete="current-password"
                      />
                      <button onClick={loginEmail} disabled={busy} className="px-4 py-2 rounded-full bg-white text-black font-semibold disabled:opacity-60 w-1/2 mx-auto block">Login</button>
                      <p
                        className="text-sm text-white/80 text-center mt-2 cursor-pointer underline"
                        onClick={() => setShowRegister(true)}
                      >
                        Account erstellen &gt;
                      </p>
                    </>
                  )}
                </div>
              )}

              {error && <p className="mt-4 text-sm text-white/80">{error}</p>}
            </div>
          </div>
        </>
      </div>
    </div>
  );
}