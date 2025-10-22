"use client";
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SimpleTopbar from '@/components/SimpleTopbar';
import CardFrame from '@/components/CardFrame';

export default function VaultItemPage() {
  const params = useParams();
  const router = useRouter();
  const itemId = params.id as string;
  
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // TODO: Lade Item-Daten aus Firebase basierend auf itemId
    // Für jetzt: Dummy-Daten
    const loadItem = async () => {
      try {
        setLoading(true);
        // Hier würde Firebase-Abfrage stattfinden
        // Beispiel Struktur:
        const dummyItem = {
          id: itemId,
          headline: 'Vault Item',
          content: 'Item Details for ' + itemId,
          title: 'Item: ' + itemId,
          subtitle: 'Drop Vault Prize'
        };
        setItem(dummyItem);
      } catch (err) {
        setError('Item konnte nicht geladen werden');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (itemId) {
      loadItem();
    }
  }, [itemId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <SimpleTopbar />
        <div>Lädt...</div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
        <SimpleTopbar />
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || 'Item nicht gefunden'}</p>
          <button 
            onClick={() => router.back()}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
          >
            Zurück
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <SimpleTopbar />
      <div className="container mx-auto p-4 mt-8">
        <button 
          onClick={() => router.back()}
          className="mb-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded"
        >
          ← Zurück
        </button>

        <div className="max-w-2xl mx-auto">
          <CardFrame>
            <div className="text-center">
              <h1 className="text-3xl font-bold mb-4">{item.headline || item.title}</h1>
              <p className="text-gray-300 mb-6">{item.content || item.subtitle}</p>
              
              {/* Item-spezifische Inhalte hier einfügen */}
              <div className="mt-8 p-4 bg-gray-900 rounded">
                <p className="text-sm text-gray-400">Item ID: {itemId}</p>
              </div>
            </div>
          </CardFrame>
        </div>
      </div>
    </div>
  );
}
