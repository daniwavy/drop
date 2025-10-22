"use client";

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

export default function SimpleTopbar() {
  return (
    <div className={`fixed top-0 left-0 right-0 z-60 topbar-wrapper top-visible`} style={{ backfaceVisibility: 'hidden', willChange: 'transform', transform: 'translateZ(0)' }}>
      {/* Tiny scroll banner */}
      <div className="h-6 bg-black text-white" style={{ backfaceVisibility: 'hidden' }}>
        <div className="small-ticker-wrap w-full h-full">
          <div className="small-ticker-track relative h-full">
            {/* empty ticker placeholder to match layout */}
            <span className="small-ticker-text" />
          </div>
        </div>
      </div>

      {/* Main header */}
      <div className="h-14 bg-black" style={{ backfaceVisibility: 'hidden' }}>
        {/* Left: Logo */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
          <Link href="/" className="block cursor-pointer hover:opacity-80 transition-opacity">
            <Image src="/logo.svg" alt="DROP" width={64} height={16} className={`h-6 w-auto select-none drop-logo drop-anim-0`} priority />
          </Link>
        </div>
      </div>
    </div>
  );
}
