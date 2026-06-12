import { Heart, Github, Coffee } from "lucide-react";

export default function License() {
  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="page-title">Über Nexboard</h1>
        <p className="text-white/40 text-sm mt-0.5">Open Source · MIT Lizenz · Kostenlos für alle</p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/25 flex items-center justify-center">
            <Heart size={18} className="text-amber-300" />
          </div>
          <div>
            <div className="font-semibold text-sm">Nexboard ist vollständig kostenlos</div>
            <div className="text-white/40 text-xs mt-0.5">Alle Features für alle Nutzer freigeschaltet</div>
          </div>
        </div>

        <div className="text-xs text-white/55 leading-relaxed">
          Nexboard ist ein Open-Source-Projekt unter der MIT-Lizenz. Du kannst es frei nutzen,
          verändern und weitergeben. Kein Abo, keine Limits, kein Phone-Home.
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <a
            href="https://github.com/Felix-23-1/Nexboard"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost flex items-center justify-center gap-2 text-sm py-2.5"
          >
            <Github size={15} />
            GitHub
          </a>
          <a
            href="https://ko-fi.com/nexboard"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary flex items-center justify-center gap-2 text-sm py-2.5"
            style={{ background: "rgba(255,94,91,0.85)" }}
          >
            <Coffee size={15} />
            Ko-fi unterstützen
          </a>
        </div>
      </div>

      <div className="card">
        <div className="section-label mb-3">MIT License</div>
        <p className="text-xs text-white/40 leading-relaxed">
          Copyright © 2025 Felix (Felix-23-1). Permission is hereby granted, free of charge,
          to any person obtaining a copy of this software to use, copy, modify, merge, publish,
          distribute, sublicense, and/or sell copies of the Software, without restriction.
        </p>
      </div>
    </div>
  );
}
