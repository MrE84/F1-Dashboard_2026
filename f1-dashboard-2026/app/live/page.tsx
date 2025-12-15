'use client';

import Link from "next/link";

export default function LivePage() {
    return (
        <div className="min-h-screen racing-bg p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <Link href="/" className="text-zinc-400 hover:text-white transition-colors flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                </Link>
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-600 live-pulse" />
                    <h1 className="text-2xl font-bold gradient-text">Live Timing</h1>
                </div>
                <div className="w-20" /> {/* Spacer */}
            </div>

            {/* Status Card */}
            <div className="glass-card glow-red p-12 max-w-2xl mx-auto text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-600/20 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-red-600 live-pulse" />
                </div>

                <h2 className="text-3xl font-bold text-white mb-4">
                    No Live Session
                </h2>

                <p className="text-zinc-400 mb-8 leading-relaxed max-w-md mx-auto">
                    There is currently no live F1 session. Live timing will be available during Practice, Qualifying, Sprint, and Race sessions.
                </p>

                <div className="bg-zinc-800/50 rounded-xl p-6 mb-6">
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-3">
                        Next Session
                    </h3>
                    <p className="text-xl text-white">
                        Check the F1 calendar for upcoming sessions
                    </p>
                </div>

                <Link
                    href="/archive"
                    className="inline-flex items-center gap-2 text-red-500 hover:text-red-400 font-medium transition-colors"
                >
                    Browse Archive Instead
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                </Link>
            </div>
        </div>
    );
}
