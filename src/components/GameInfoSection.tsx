"use client";

import React from 'react';

interface GameInfoSectionProps {
  title?: string;
  description?: string;
  tips?: string[];
  rules?: string[];
  icon?: React.ReactNode;
  tags?: string[];
}

export default function GameInfoSection({
  title = "Über dieses Spiel",
  description = "Placeholder: Hier kommt die Spielbeschreibung rein.",
  tips = [],
  rules = [],
  icon,
  tags = []
}: GameInfoSectionProps) {
  return (
    <div className="w-full bg-white rounded-3xl shadow-[0_20px_80px_rgba(0,0,0,0.15)] p-5 sm:p-6 md:p-8 mt-6 max-w-2xl mx-auto">
      {/* Title Section with Icon */}
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200">
        {icon && <div className="text-3xl">{icon}</div>}
        <h2 className="text-2xl md:text-3xl font-bold text-black">{title}</h2>
      </div>

      {/* Tags Row */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6 pb-4 border-b border-gray-200">
          {tags.map((tag, idx) => (
            <div key={idx} className="text-sm text-gray-600 font-medium">
              {tag}
            </div>
          ))}
        </div>
      )}

      {/* Description Section */}
      {description && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-black mb-3 uppercase tracking-wider opacity-70">Wie man {title?.toLowerCase()} spielt</h3>
          <p className="text-sm text-gray-700 leading-relaxed">
            {description}
          </p>
        </div>
      )}

      {/* Tips Section */}
      {tips && tips.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-black mb-3 uppercase tracking-wider opacity-70">💡 Tipps</h3>
          <ul className="space-y-2">
            {tips.map((tip, idx) => (
              <li key={idx} className="text-sm text-gray-700 flex items-start gap-3">
                <span className="text-yellow-500 font-bold text-lg flex-shrink-0 mt-0.5">★</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Rules/Mechanics Section */}
      {rules && rules.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-black mb-3 uppercase tracking-wider opacity-70">📋 Regeln</h3>
          <ul className="space-y-2">
            {rules.map((rule, idx) => (
              <li key={idx} className="text-sm text-gray-700 flex items-start gap-3">
                <span className="text-blue-500 font-bold text-lg flex-shrink-0 mt-0.5">•</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
