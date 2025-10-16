import React from 'react';
import SimpleTopbar from '@/components/SimpleTopbar';

export default function ImpressumPage() {
	return (
			<main className="min-h-screen bg-white text-black p-8">
				<SimpleTopbar />
				<div className="max-w-4xl mx-auto">
				<h1 className="text-2xl font-bold mb-4">Impressum</h1>
				<p className="text-sm text-gray-700">Angaben gemäß § 5 TMG: DROP GmbH, Musterstraße 1, 12345 Musterstadt.</p>
				<p className="mt-4 text-sm text-gray-700">Kontakt: impressum@example.com</p>
			</div>
		</main>
	);
}

