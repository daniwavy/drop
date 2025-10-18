"use client";
import React from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

export type PartnerApplicationFormProps = {
  onSuccessAction?: () => void;
};

export default function PartnerApplicationForm({ onSuccessAction }: PartnerApplicationFormProps) {
  const [userId, setUserId] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  // allow multiple websites/social links
  const [websites, setWebsites] = React.useState<string[]>(['']);
  // influencer flag removed per request
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUserId(u ? u.uid : null);
      if (u && u.email) setEmail(u.email);
      if (u && u.displayName) setName(u.displayName);
    });
    return () => unsub();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!userId) return setError('Nicht angemeldet');
    if (!name.trim()) return setError('Name ist erforderlich');
    setSubmitting(true);
    try {
      const appRef = doc(db, 'applications', userId);
      const cleaned = websites.map((w) => (w || '').trim()).filter(Boolean);
      await setDoc(appRef, {
        name: name.trim(),
        email: email.trim() || null,
        // keep single 'website' for compatibility, and add 'websites' array
        website: cleaned[0] || null,
        websites: cleaned,
        status: 'pending',
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSuccess('Deine Bewerbung wurde eingereicht. Wir melden uns bald.');
  setName('');
  setWebsites(['']);
      if (onSuccessAction) {
        try {
          onSuccessAction();
        } catch {
          // ignore callback errors
        }
      }
    } catch {
      setError('Fehler beim Senden. Bitte versuche es später.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!userId) return <div className="text-sm text-gray-400">Bitte melde dich an, um dich als Partner zu bewerben.</div>;

  if (success) return <div className="p-4 bg-green-800 text-white rounded">{success}</div>;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <div className="text-red-400 text-sm">{error}</div>}
      <div>
  <label className="block text-sm font-medium text-black">Name</label>
  <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-lg px-3 py-2 bg-white border border-black/20 text-black text-sm" />
      </div>
      <div>
  <label className="block text-sm font-medium text-black">E-Mail</label>
  <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full rounded-lg px-3 py-2 bg-white border border-black/20 text-black text-sm" />
      </div>
      <div>
  <label className="block text-sm font-medium text-black">Webseite / Social</label>
  <div className="space-y-2 mt-1">
    {websites.map((w, i) => (
      <div key={i} className="flex gap-2 items-center">
        <input
          value={w}
          onChange={(e) => {
            const next = [...websites];
            next[i] = e.target.value;
            setWebsites(next);
          }}
          placeholder={i === 0 ? 'z.B. https://beispiel.de oder @username' : 'weitere Webseite oder Social'}
          className="flex-1 rounded-lg px-3 py-2 bg-white border border-black/20 text-black text-sm"
        />
        <button
          type="button"
          onClick={() => {
            // remove this entry (leave at least one)
            if (websites.length === 1) return setWebsites(['']);
            setWebsites(websites.filter((_, idx) => idx !== i));
          }}
          aria-label="Entfernen"
          className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-red-50 text-red-600 border border-red-100"
        >
          ×
        </button>
      </div>
    ))}
    <div>
      <button
        type="button"
        onClick={() => setWebsites([...websites, ''])}
        className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-black/10 text-sm"
      >
        + Weitere Webseite
      </button>
    </div>
  </div>
      </div>
    {/* influencer checkbox removed */}
      {/* message field removed */}
      <div className="flex justify-center">
        <button disabled={submitting} type="submit" className="px-4 py-2 rounded-lg bg-black text-white text-sm font-semibold">
          {submitting ? 'Senden…' : 'Bewerbung senden'}
        </button>
      </div>
    </form>
  );
}
