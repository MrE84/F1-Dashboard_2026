'use client';

import Link from "next/link";
import { useState, useEffect } from "react";

interface Driver {
    code: string;
    number: string;
    color: string;
    team: string;
    fullName: string;
}

interface RaceData {
    event: {
        eventName: string;
        roundNumber: number;
        country: string;
        location: string;
        sessionType: string;
        year: number;
    };
    track: {
        x: number[];
        y: number[];
    };
    drivers: Driver[];
}

export default function ArchivePage() {
    const [raceData, setRaceData] = useState<RaceData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Load the pre-generated 2025 Round 12 data
        fetch('/data/2025/12/race_data.json')
            .then(res => res.json())
            .then(data => {
                setRaceData(data);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to load race data:', err);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-2xl text-zinc-400">Loading race data...</div>
            </div>
        );
    }

    if (!raceData) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4">
                <div className="text-2xl text-zinc-400">No race data found</div>
                <Link href="/" className="text-red-500 hover:underline">← Back to Home</Link>
            </div>
        );
    }

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
                <h1 className="text-2xl font-bold gradient-text">Archive</h1>
                <div className="w-20" /> {/* Spacer */}
            </div>

            {/* Race Info Card */}
            <div className="glass-card p-8 mb-8 max-w-4xl mx-auto">
                <div className="flex items-center gap-4 mb-4">
                    <span className="text-sm font-semibold uppercase tracking-widest text-red-500">
                        Round {raceData.event.roundNumber}
                    </span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-zinc-400">{raceData.event.year}</span>
                </div>

                <h2 className="text-4xl font-bold text-white mb-2">
                    {raceData.event.eventName}
                </h2>

                <p className="text-xl text-zinc-400 mb-6">
                    {raceData.event.location}, {raceData.event.country}
                </p>

                {/* Track Preview */}
                <div className="bg-zinc-900/50 rounded-xl p-6 mb-6">
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-4">
                        Circuit Layout
                    </h3>
                    <svg viewBox="-2500 0 10000 7000" className="w-full h-64" preserveAspectRatio="xMidYMid meet">
                        <polyline
                            points={raceData.track.x.map((x, i) => `${x},${raceData.track.y[i]}`).join(' ')}
                            fill="none"
                            stroke="#e10600"
                            strokeWidth="80"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>

                {/* Drivers Grid */}
                <h3 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-4">
                    Drivers ({raceData.drivers.length})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {raceData.drivers.map((driver) => (
                        <div
                            key={driver.code}
                            className="bg-zinc-800/50 rounded-lg p-3 flex items-center gap-3 hover:bg-zinc-700/50 transition-colors cursor-pointer"
                        >
                            <div
                                className="w-1 h-10 rounded-full"
                                style={{ backgroundColor: driver.color }}
                            />
                            <div>
                                <div className="font-bold text-white">{driver.code}</div>
                                <div className="text-xs text-zinc-500">{driver.team}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Action Button */}
                <div className="mt-8 flex justify-center">
                    <Link
                        href={`/replay/${raceData.event.year}/${raceData.event.roundNumber}`}
                        className="bg-red-600 hover:bg-red-700 text-white font-semibold px-8 py-4 rounded-full transition-colors flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                        Start Replay
                    </Link>
                </div>
            </div>
        </div>
    );
}
