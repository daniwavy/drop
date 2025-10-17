import React from 'react';

export const metadata = {
  title: 'Partner Dashboard',
  description: 'Dashboard for partners with revenue-share codes',
};

export default function PartnerDashboardPage() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Partner Dashboard</h1>
      <p className="text-sm text-gray-600 mb-6">This page will list partner revenue-share codes, stats and payouts. Placeholder for now.</p>

      <section className="bg-white/5 p-4 rounded-lg shadow-sm">
        <h2 className="text-lg font-semibold">Your codes</h2>
        <div className="mt-3 text-sm text-gray-400">No codes yet — this is a placeholder view.</div>
      </section>
    </main>
  );
}
