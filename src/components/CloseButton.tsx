import React from 'react';

export default function CloseButton({ onClick, className, label = 'Schließen' }: { onClick?: () => void; className?: string; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`absolute top-3 right-3 z-10 text-black/60 hover:text-black ${className ?? ''}`}
    >
      ✕
    </button>
  );
}
