"use client";

import { useEffect } from 'react';

export default function HushConsole() {
  useEffect(() => {
    const methods = ['log','debug','info','warn','error'] as const;
    const original: Partial<Record<string, any>> = {};
    for (const m of methods) {
      // save original if exists
      // @ts-ignore
      original[m] = console[m];
      // @ts-ignore
      console[m] = () => {};
    }
    return () => {
      for (const m of methods) {
        try {
          // @ts-ignore
          console[m] = original[m] || (() => {});
        } catch {}
      }
    };
  }, []);
  return null;
}
