'use client';

import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen racing-bg flex flex-col items-center justify-center p-8">
      {/* Header */}
      <div className="text-center mb-16">
        <h1 className="text-6xl font-bold gradient-text mb-4 tracking-tight">
          F1 Dashboard
        </h1>
        <p className="text-xl text-zinc-400 font-light">
          2026 Season • Real-time Telemetry & Race Analysis
        </p>
      </div>

      {/* Mode Selection Cards */}
      <div className="flex flex-col md:flex-row gap-8 w-full max-w-4xl">

        {/* Live Mode Card */}
        <Link
          href="/live"
          className="glass-card glow-red flex-1 p-10 cursor-pointer group"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-4 h-4 rounded-full bg-red-600 live-pulse" />
            <span className="text-sm font-semibold uppercase tracking-widest text-red-500">
              Live
            </span>
          </div>

          <h2 className="text-3xl font-bold text-white mb-4 group-hover:text-red-400 transition-colors">
            Stream Live Telemetry
          </h2>

          <p className="text-zinc-400 mb-8 leading-relaxed">
            Connect to real-time race data. Track positions, lap times, tyre strategies, and weather conditions as they happen.
          </p>

          <div className="flex items-center gap-2 text-red-500 font-medium">
            <span>Start Stream</span>
            <svg className="w-5 h-5 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>

          {/* Visual decoration */}
          <div className="mt-8 flex gap-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-1 flex-1 rounded-full bg-gradient-to-r from-red-600 to-red-800 opacity-50"
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        </Link>

        {/* Archive Mode Card */}
        <Link
          href="/archive"
          className="glass-card flex-1 p-10 cursor-pointer group"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-4 h-4 rounded-full bg-zinc-500" />
            <span className="text-sm font-semibold uppercase tracking-widest text-zinc-500">
              Archive
            </span>
          </div>

          <h2 className="text-3xl font-bold text-white mb-4 group-hover:text-zinc-300 transition-colors">
            Browse Past Races
          </h2>

          <p className="text-zinc-400 mb-8 leading-relaxed">
            Explore historical race data. Replay any session with full telemetry, compare driver performances, and analyze strategies.
          </p>

          <div className="flex items-center gap-2 text-zinc-400 font-medium">
            <span>Open Archive</span>
            <svg className="w-5 h-5 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>

          {/* Visual decoration - Database grid */}
          <div className="mt-8 grid grid-cols-6 gap-1">
            {[...Array(18)].map((_, i) => (
              <div
                key={i}
                className="h-2 rounded-sm bg-zinc-700/50"
              />
            ))}
          </div>
        </Link>

      </div>

      {/* Footer */}
      <div className="mt-16 text-center text-zinc-600 text-sm">
        <p>Powered by FastF1 • Data from Formula 1®</p>
      </div>
    </div>
  );
}
