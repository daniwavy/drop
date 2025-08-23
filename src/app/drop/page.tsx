"use client";
import { useEffect, useState, useRef } from "react";
import { ref, getDownloadURL } from "firebase/storage";
import { storage } from "../../lib/firebase";

export default function DropPage() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);

  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fileRef = ref(storage, "prizes/drop-collage.png");
    getDownloadURL(fileRef)
      .then((downloadUrl) => setUrl(downloadUrl))
      .catch((err) => { setError(err.message); setLoading(false); });
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

  return (
    <div className="min-h-screen w-screen bg-red-500 text-white relative">
      {/* Fullscreen loader overlay */}
      {loading && (
        <div className="fixed inset-0 bg-red-500 flex items-center justify-center z-50">
          <div className="w-10 h-10 border-4 border-white/50 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Topbar */}
      <div className={`p-6 w-full ${loading ? 'opacity-0 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between gap-4">
          <img src="/logo.png" alt="DROP" className="h-4 w-auto select-none" />
          <div className="flex items-center gap-4">
            <img src="/bell.png" alt="Notifications" className="h-8 w-8 select-none cursor-pointer" />
            <a href="/profile">
              <img src="/profile-icon.png" alt="Profile" className="h-8 w-8 select-none cursor-pointer" />
            </a>
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        ref={areaRef}
        onMouseMove={handleMouseMove}
        className="flex flex-col items-center justify-center px-6"
        style={{ minHeight: "calc(100vh - 96px)" }}
      >
        {url && (
          <div style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
            <div className="relative inline-block">
              <img
                src={url}
                alt="Prizes"
                onLoad={() => setLoading(false)}
                onError={() => { setError("Bild-URL nicht erreichbar"); setLoading(false); }}
                className={`mt-8 w-full h-auto max-w-[480px] md:max-w-[576px] drop-shadow-2xl select-none prize-anim ${loading ? 'opacity-0' : 'opacity-100'}`}
              />
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-white/80">{error}</p>}
      </div>

      <style jsx>{`
        @keyframes prizePulse {
          0%, 100% { transform: scale(0.98); }
          50% { transform: scale(1.03); }
        }
        .prize-anim {
          animation: prizePulse 8s ease-in-out infinite;
          will-change: transform;
          display: block;
        }
        .no-scrollbar { scrollbar-width: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}