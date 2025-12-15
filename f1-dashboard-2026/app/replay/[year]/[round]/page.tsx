'use client';

import Link from "next/link";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';

interface DriverPosition {
    x: number;
    y: number;
    dist: number;
    lap: number;
    rel_dist: number;
    tyre: number;
    position: number;
    speed: number;
    gear: number;
    drs: number;
    throttle: number;
    brake: number;
}

interface Weather {
    track_temp: number;
    air_temp: number;
    humidity: number;
    wind_speed: number;
    wind_direction: number;
    rain_state: string;
}

interface Frame {
    t: number;
    lap: number;
    drivers: Record<string, DriverPosition>;
    weather?: Weather;
}

interface Driver {
    code: string;
    number: string;
    color: string;
    team: string;
    fullName: string;
}

interface TeamRadioClip {
    t: number;           // Timestamp (seconds from race start)
    driver: string;      // Driver code (e.g., "VER")
    driverNumber: number;
    url: string;         // MP3 audio URL
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
    track: { x: number[]; y: number[] };
    drivers: Driver[];
    driverColors: Record<string, [number, number, number]>;
    totalLaps: number;
    frames: Frame[];
    frameRate: number;
    teamRadio?: TeamRadioClip[];  // Team radio clips with timestamps
    lapTiming?: Record<string, {
        grid_pos: number;
        laps: Record<number, {
            time: number | null;
            s1: number | null;
            s2: number | null;
            s3: number | null;
            is_pb: boolean;
            compound: string;
        }>;
    }>;
}

const TYRE_COMPOUNDS: Record<number, { name: string; color: string; bg: string }> = {
    1: { name: 'SOFT', color: '#ff3333', bg: 'bg-red-500' },
    2: { name: 'MEDIUM', color: '#ffcc00', bg: 'bg-yellow-400' },
    3: { name: 'HARD', color: '#ffffff', bg: 'bg-white' },
    4: { name: 'INTER', color: '#44cc44', bg: 'bg-green-400' },
    5: { name: 'WET', color: '#4444ff', bg: 'bg-blue-500' },
};

export default function ReplayPage() {
    const params = useParams();
    const year = params.year as string;
    const round = params.round as string;

    const [raceData, setRaceData] = useState<RaceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [frameIndex, setFrameIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
    const [canvasSize, setCanvasSize] = useState({ width: 800, height: 500 });
    const [interpolationProgress, setInterpolationProgress] = useState(0);
    const [telemetryPanelPos, setTelemetryPanelPos] = useState({ x: 16, y: 0 });
    const [showWeatherOverlay, setShowWeatherOverlay] = useState(true);
    const [driverInfoPanelPos, setDriverInfoPanelPos] = useState({ x: 32, y: 112 }); // bottom-left position
    const [isDragging, setIsDragging] = useState(false);
    const [showTimingBoard, setShowTimingBoard] = useState(false);

    // Team Radio state
    const [currentRadio, setCurrentRadio] = useState<TeamRadioClip | null>(null);
    const [radioEnabled, setRadioEnabled] = useState(true);
    const [radioVolume, setRadioVolume] = useState(0.7);
    const [hasInteracted, setHasInteracted] = useState(false); // Track if user has interacted (for autoplay)

    const dragOffset = useRef({ x: 0, y: 0 });

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const animationRef = useRef<number | undefined>(undefined);
    const lastTimeRef = useRef<number>(0);

    // Team Radio refs
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const playedRadioClipsRef = useRef<Set<number>>(new Set()); // Track which clips have played (by index)

    // Load race data
    useEffect(() => {
        fetch(`/data/${year}/${round}/race_telemetry.json`)
            .then(res => res.json())
            .then(data => {
                setRaceData(data);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to load race data:', err);
                setLoading(false);
            });
    }, [year, round]);

    // Team Radio Playback - trigger clips at the right timestamps
    useEffect(() => {
        if (!raceData?.teamRadio || !radioEnabled || raceData.teamRadio.length === 0) return;
        if (!hasInteracted) return; // Don't try to play until user has interacted

        const currentTime = raceData.frames[frameIndex]?.t || 0;

        // Find a radio clip that should play now (within a few seconds window, not yet played)
        for (let i = 0; i < raceData.teamRadio.length; i++) {
            const clip = raceData.teamRadio[i];

            // Skip if already played
            if (playedRadioClipsRef.current.has(i)) continue;

            // Check if we've passed this clip's timestamp (within a few seconds window)
            if (currentTime >= clip.t && currentTime < clip.t + 3) {
                // Mark as played
                playedRadioClipsRef.current.add(i);

                // Stop any currently playing audio
                if (audioRef.current) {
                    audioRef.current.pause();
                    audioRef.current = null;
                }

                // Set current radio for UI display
                setCurrentRadio(clip);

                // Create and play audio
                const audio = new Audio(clip.url);
                audio.volume = radioVolume;
                audioRef.current = audio;

                audio.play().then(() => {
                    // Audio playing successfully
                }).catch(err => {
                    console.warn('Failed to play team radio:', err);
                });

                // Clear the display after audio ends
                audio.onended = () => {
                    setCurrentRadio(null);
                };

                // Fallback timeout - clear after 8 seconds regardless
                const clipTimestamp = clip.t;
                setTimeout(() => {
                    setCurrentRadio(prev => prev?.t === clipTimestamp ? null : prev);
                }, 8000);

                break; // Only one clip at a time
            }
        }
    }, [frameIndex, raceData, radioEnabled, radioVolume, hasInteracted]);

    // Reset played clips when seeking backwards or restarting
    useEffect(() => {
        const currentTime = raceData?.frames[frameIndex]?.t || 0;

        // Remove clips that are in the future from the played set
        playedRadioClipsRef.current.forEach(clipIndex => {
            const clip = raceData?.teamRadio?.[clipIndex];
            if (clip && clip.t > currentTime) {
                playedRadioClipsRef.current.delete(clipIndex);
            }
        });
    }, [frameIndex, raceData]);

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // Resize observer for responsive canvas
    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setCanvasSize({
                    width: Math.floor(width),
                    height: Math.floor(Math.max(300, height))
                });
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Animation loop with smooth interpolation
    useEffect(() => {
        if (!isPlaying || !raceData) return;

        const targetFPS = 60; // Smooth 60fps animation
        const frameInterval = 1000 / (raceData.frameRate * playbackSpeed);

        const animate = (time: number) => {
            if (lastTimeRef.current === 0) lastTimeRef.current = time;
            const delta = time - lastTimeRef.current;

            // Calculate interpolation progress (0 to 1 between frames)
            const progress = Math.min(delta / frameInterval, 1);
            setInterpolationProgress(progress);

            if (delta >= frameInterval) {
                setFrameIndex(prev => {
                    if (prev >= raceData.frames.length - 1) {
                        setIsPlaying(false);
                        return prev;
                    }
                    return prev + 1;
                });
                setInterpolationProgress(0);
                lastTimeRef.current = time;
            }

            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [isPlaying, raceData, playbackSpeed]);

    // Draw track and drivers
    const drawTrack = useCallback(() => {
        if (!canvasRef.current || !raceData) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { track, frames, driverColors } = raceData;
        const frame = frames[frameIndex];
        if (!frame) return;

        // Clear with gradient background
        const gradient = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, 0,
            canvas.width / 2, canvas.height / 2, canvas.width / 2
        );
        gradient.addColorStop(0, '#1a1a1a');
        gradient.addColorStop(1, '#0a0a0a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Calculate track bounds and scale
        const padding = 50;
        const xMin = Math.min(...track.x);
        const xMax = Math.max(...track.x);
        const yMin = Math.min(...track.y);
        const yMax = Math.max(...track.y);

        const trackWidth = xMax - xMin;
        const trackHeight = yMax - yMin;
        const scaleX = (canvas.width - padding * 2) / trackWidth;
        const scaleY = (canvas.height - padding * 2) / trackHeight;
        const scale = Math.min(scaleX, scaleY);

        const offsetX = (canvas.width - trackWidth * scale) / 2 - xMin * scale;
        const offsetY = (canvas.height - trackHeight * scale) / 2 - yMin * scale;

        // Draw track shadow
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(225, 6, 0, 0.15)';
        ctx.lineWidth = Math.max(20, 30 * scale / 0.05);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 0; i < track.x.length; i++) {
            const x = track.x[i] * scale + offsetX;
            const y = track.y[i] * scale + offsetY;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Draw track outline
        ctx.beginPath();
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = Math.max(10, 16 * scale / 0.05);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 0; i < track.x.length; i++) {
            const x = track.x[i] * scale + offsetX;
            const y = track.y[i] * scale + offsetY;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Draw track center line (racing line)
        ctx.beginPath();
        ctx.strokeStyle = '#555';
        ctx.lineWidth = Math.max(2, 4 * scale / 0.05);
        ctx.setLineDash([10, 10]);
        for (let i = 0; i < track.x.length; i++) {
            const x = track.x[i] * scale + offsetX;
            const y = track.y[i] * scale + offsetY;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw DRS zones (highlighted sections of track in green)
        // Silverstone DRS zones are approximately: Zone 1 (65-75% of lap), Zone 2 (88-98% of lap)
        const drsZones = [
            { start: 0.65, end: 0.75 },  // Wellington Straight
            { start: 0.88, end: 0.98 }   // Hangar Straight
        ];

        for (const zone of drsZones) {
            const startIdx = Math.floor(zone.start * track.x.length);
            const endIdx = Math.floor(zone.end * track.x.length);

            ctx.beginPath();
            ctx.strokeStyle = 'rgba(0, 255, 100, 0.5)';
            ctx.lineWidth = Math.max(12, 18 * scale / 0.05);
            ctx.lineCap = 'round';

            for (let i = startIdx; i <= endIdx; i++) {
                const x = track.x[i] * scale + offsetX;
                const y = track.y[i] * scale + offsetY;
                if (i === startIdx) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // DRS label
            const labelIdx = Math.floor((startIdx + endIdx) / 2);
            const labelX = track.x[labelIdx] * scale + offsetX;
            const labelY = track.y[labelIdx] * scale + offsetY;
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.fillStyle = 'rgba(0, 255, 100, 0.9)';
            ctx.textAlign = 'center';
            ctx.fillText('DRS', labelX, labelY - 12);
        }

        // Draw drivers with interpolation (reverse order so leader is on top)
        const driverCodes = Object.keys(frame.drivers);
        const sortedDrivers = driverCodes.sort((a, b) =>
            frame.drivers[b].position - frame.drivers[a].position
        );

        // Get next frame for interpolation
        const nextFrame = frames[Math.min(frameIndex + 1, frames.length - 1)];

        for (const code of sortedDrivers) {
            const pos = frame.drivers[code];
            const nextPos = nextFrame?.drivers[code] || pos;

            // Interpolate position for smooth movement
            const interpX = pos.x + (nextPos.x - pos.x) * interpolationProgress;
            const interpY = pos.y + (nextPos.y - pos.y) * interpolationProgress;

            const x = interpX * scale + offsetX;
            const y = interpY * scale + offsetY;

            const color = driverColors[code] || [128, 128, 128];
            const isSelected = selectedDriver === code;
            const dotSize = isSelected ? 12 : 8;

            // Draw glow for selected/top3
            if (isSelected || pos.position <= 3) {
                ctx.beginPath();
                ctx.arc(x, y, dotSize + 6, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.3)`;
                ctx.fill();
            }

            // Draw driver dot
            ctx.beginPath();
            ctx.arc(x, y, dotSize, 0, Math.PI * 2);
            const dotGradient = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, dotSize);
            dotGradient.addColorStop(0, `rgb(${Math.min(255, color[0] + 50)}, ${Math.min(255, color[1] + 50)}, ${Math.min(255, color[2] + 50)})`);
            dotGradient.addColorStop(1, `rgb(${color[0]}, ${color[1]}, ${color[2]})`);
            ctx.fillStyle = dotGradient;
            ctx.fill();

            // Draw border for selected
            if (isSelected) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.stroke();
            }

            // Draw driver code label for top 3 or selected
            if (pos.position <= 3 || isSelected) {
                ctx.font = 'bold 12px "Inter", sans-serif';
                ctx.textAlign = 'center';

                // Text shadow
                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.fillText(code, x + 1, y - 16);

                // Text
                ctx.fillStyle = '#fff';
                ctx.fillText(code, x, y - 17);
            }
        }

        // Weather overlay effects (only when enabled)
        const weather = frame.weather;
        if (weather && showWeatherOverlay) {
            const time = Date.now() / 1000; // Current time for animation

            // Wind streaks
            if (weather.wind_speed > 0.5) {
                const windAngle = (weather.wind_direction * Math.PI) / 180;
                const streakCount = Math.floor(weather.wind_speed * 8);
                const streakLength = 20 + weather.wind_speed * 10;

                ctx.strokeStyle = `rgba(150, 200, 255, ${Math.min(0.15, weather.wind_speed / 20)})`;
                ctx.lineWidth = Math.max(1, weather.wind_speed / 4);

                for (let i = 0; i < streakCount; i++) {
                    // Animated position based on time
                    const baseX = ((i * 137 + time * 50 * weather.wind_speed) % (canvas.width + 100)) - 50;
                    const baseY = ((i * 89 + time * 30) % (canvas.height + 100)) - 50;

                    ctx.beginPath();
                    ctx.moveTo(baseX, baseY);
                    ctx.lineTo(
                        baseX + Math.cos(windAngle) * streakLength,
                        baseY + Math.sin(windAngle) * streakLength
                    );
                    ctx.stroke();
                }
            }

            // Rain drops
            if (weather.rain_state !== 'DRY') {
                const rainIntensity = weather.rain_state === 'HEAVY' ? 80 : weather.rain_state === 'LIGHT' ? 30 : 50;
                const dropLength = weather.rain_state === 'HEAVY' ? 25 : 15;

                ctx.strokeStyle = 'rgba(100, 180, 255, 0.4)';
                ctx.lineWidth = weather.rain_state === 'HEAVY' ? 2 : 1;

                for (let i = 0; i < rainIntensity; i++) {
                    // Animated falling drops
                    const dropX = (i * 47) % canvas.width;
                    const dropY = ((i * 31 + time * 400) % (canvas.height + dropLength)) - dropLength;

                    ctx.beginPath();
                    ctx.moveTo(dropX, dropY);
                    ctx.lineTo(dropX - 2, dropY + dropLength);
                    ctx.stroke();
                }

                // Rain splash effects on track
                ctx.fillStyle = 'rgba(100, 180, 255, 0.2)';
                for (let i = 0; i < rainIntensity / 3; i++) {
                    const splashX = (i * 73 + time * 100) % canvas.width;
                    const splashY = (i * 97) % canvas.height;
                    const splashSize = 2 + (Math.sin(time * 10 + i) + 1) * 2;

                    ctx.beginPath();
                    ctx.arc(splashX, splashY, splashSize, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }, [raceData, frameIndex, selectedDriver, canvasSize, interpolationProgress, showWeatherOverlay]);

    // Redraw on frame/size change
    useEffect(() => {
        drawTrack();
    }, [drawTrack]);

    // Telemetry chart data for selected driver (speed, throttle, brake)
    const telemetryChartData = useMemo(() => {
        if (!raceData || !selectedDriver) return [];

        const startIdx = Math.max(0, frameIndex - 120);
        const endIdx = frameIndex + 1;

        return raceData.frames.slice(startIdx, endIdx).map((frame, i) => {
            const driverData = frame.drivers[selectedDriver];
            return {
                time: startIdx + i,
                speed: driverData?.speed || 0,
                throttle: driverData?.throttle || 0,
                brake: (driverData?.brake || 0) * 100, // Convert to percentage (0-100)
            };
        });
    }, [raceData, selectedDriver, frameIndex]);

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                setIsPlaying(prev => !prev);
            } else if (e.code === 'ArrowRight') {
                setFrameIndex(prev => Math.min(prev + 10, (raceData?.frames.length || 1) - 1));
            } else if (e.code === 'ArrowLeft') {
                setFrameIndex(prev => Math.max(prev - 10, 0));
            } else if (e.code === 'ArrowUp') {
                setPlaybackSpeed(prev => Math.min(prev * 2, 8));
            } else if (e.code === 'ArrowDown') {
                setPlaybackSpeed(prev => Math.max(prev / 2, 0.5));
            } else if (e.code === 'KeyR') {
                setFrameIndex(0);
                setIsPlaying(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [raceData]);

    // Drag handlers for driver info panel
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            setDriverInfoPanelPos({
                x: e.clientX - dragOffset.current.x,
                y: window.innerHeight - e.clientY - dragOffset.current.y
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const handlePanelMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - driverInfoPanelPos.x,
            y: window.innerHeight - e.clientY - driverInfoPanelPos.y
        };
        e.preventDefault();
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
                    <div className="text-xl text-zinc-400">Loading telemetry...</div>
                </div>
            </div>
        );
    }

    if (!raceData) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-zinc-900 to-black">
                <div className="text-2xl text-zinc-400">Failed to load race data</div>
                <Link href="/archive" className="text-red-500 hover:underline">← Back to Archive</Link>
            </div>
        );
    }

    const currentFrame = raceData.frames[frameIndex];
    const sortedDrivers = currentFrame ?
        Object.entries(currentFrame.drivers)
            .sort(([, a], [, b]) => a.position - b.position) : [];

    const formatTime = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const driverColor = selectedDriver && raceData.driverColors[selectedDriver]
        ? `rgb(${raceData.driverColors[selectedDriver].join(',')})`
        : '#e10600';

    const progress = (frameIndex / (raceData.frames.length - 1)) * 100;

    return (
        <div
            className="h-screen bg-gradient-to-br from-zinc-900 via-zinc-900 to-black flex flex-col overflow-hidden"
            onClick={() => !hasInteracted && setHasInteracted(true)}
        >
            {/* Premium Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-black/40 backdrop-blur-xl border-b border-white/5 shrink-0">
                <Link href="/archive" className="flex items-center gap-2 text-zinc-400 hover:text-white transition-all group">
                    <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="text-sm font-medium">Back</span>
                </Link>

                <div className="text-center">
                    <div className="flex items-center justify-center gap-2">
                        <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
                        <h1 className="text-xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                            {raceData.event.eventName}
                        </h1>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">
                        Round {raceData.event.roundNumber} • {raceData.event.year}
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    {/* Timing Board Toggle */}
                    <button
                        onClick={() => setShowTimingBoard(!showTimingBoard)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${showTimingBoard
                            ? 'bg-red-600 text-white'
                            : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                            }`}
                    >
                        Timing
                    </button>

                    {/* Team Radio Toggle */}
                    <button
                        onClick={() => setRadioEnabled(!radioEnabled)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${radioEnabled
                            ? 'bg-orange-600 text-white'
                            : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                            }`}
                        title={radioEnabled ? 'Disable team radio' : 'Enable team radio'}
                    >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                            <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                        </svg>
                        Radio
                    </button>

                    <div className="text-right">
                        <div className="text-2xl font-mono font-bold text-white tracking-wider">
                            {formatTime(currentFrame?.t || 0)}
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-1">
                            <span className="text-xs text-zinc-500">LAP</span>
                            <span className="text-sm font-bold text-red-500">{currentFrame?.lap || 1}</span>
                            <span className="text-xs text-zinc-600">/ {raceData.totalLaps}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex min-h-0">
                {/* Track + Chart area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Track Canvas */}
                    <div className="flex-1 relative min-h-0 p-4" ref={containerRef}>
                        <canvas
                            ref={canvasRef}
                            width={canvasSize.width}
                            height={canvasSize.height}
                            className="rounded-2xl"
                            style={{ width: '100%', height: '100%' }}
                        />

                        {/* Weather Widget Overlay */}
                        {currentFrame?.weather && (
                            <div className="absolute top-6 left-6 bg-black/70 backdrop-blur-xl rounded-xl border border-white/10 p-3 min-w-[160px]">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-bold text-white uppercase tracking-wider">Weather</span>
                                    {currentFrame.weather.rain_state !== 'DRY' && (
                                        <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                            {currentFrame.weather.rain_state}
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[10px]">
                                    <div>
                                        <div className="text-zinc-500">Track</div>
                                        <div className="text-white font-mono">{currentFrame.weather.track_temp.toFixed(1)}°C</div>
                                    </div>
                                    <div>
                                        <div className="text-zinc-500">Air</div>
                                        <div className="text-white font-mono">{currentFrame.weather.air_temp.toFixed(1)}°C</div>
                                    </div>
                                    <div>
                                        <div className="text-zinc-500">Humidity</div>
                                        <div className="text-white font-mono">{currentFrame.weather.humidity.toFixed(0)}%</div>
                                    </div>
                                </div>

                                {/* Wind Direction & Speed Display */}
                                <div className="mt-3 pt-3 border-t border-white/10">
                                    <div className="text-[10px] text-zinc-500 mb-2">Wind</div>
                                    <div className="flex items-center gap-3">
                                        {/* Animated Wind Arrows */}
                                        <div
                                            className="relative w-10 h-10 rounded-full bg-zinc-800/50 flex items-center justify-center overflow-hidden"
                                            style={{ transform: `rotate(${currentFrame.weather.wind_direction}deg)` }}
                                        >
                                            {/* Arrow that moves based on wind speed */}
                                            <div
                                                className="flex flex-col items-center animate-pulse"
                                                style={{
                                                    animationDuration: `${Math.max(0.3, 2 - currentFrame.weather.wind_speed / 5)}s`
                                                }}
                                            >
                                                <svg
                                                    viewBox="0 0 24 24"
                                                    className="text-cyan-400"
                                                    style={{
                                                        width: `${Math.min(24, 12 + currentFrame.weather.wind_speed * 2)}px`,
                                                        height: `${Math.min(24, 12 + currentFrame.weather.wind_speed * 2)}px`,
                                                        strokeWidth: Math.max(1, currentFrame.weather.wind_speed / 2)
                                                    }}
                                                    fill="currentColor"
                                                >
                                                    <path d="M12 2L8 6h3v6H8l4 4 4-4h-3V6h3L12 2z" />
                                                </svg>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-white font-mono text-sm font-bold">
                                                {currentFrame.weather.wind_speed.toFixed(1)} m/s
                                            </div>
                                            <div className="text-zinc-500 text-[9px]">
                                                {currentFrame.weather.wind_direction.toFixed(0)}°
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Rain animation */}
                                {currentFrame.weather.rain_state !== 'DRY' && (
                                    <div className="mt-2 flex items-center gap-1">
                                        <span className="text-blue-400 animate-bounce">💧</span>
                                        <span className="text-blue-400 animate-bounce" style={{ animationDelay: '0.1s' }}>💧</span>
                                        <span className="text-blue-400 animate-bounce" style={{ animationDelay: '0.2s' }}>💧</span>
                                    </div>
                                )}

                                {/* Overlay Toggle */}
                                <div className="mt-3 pt-3 border-t border-white/10">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={showWeatherOverlay}
                                            onChange={(e) => setShowWeatherOverlay(e.target.checked)}
                                            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0 cursor-pointer"
                                        />
                                        <span className="text-[10px] text-zinc-400 group-hover:text-white transition-colors">
                                            Show overlay on track
                                        </span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* Team Radio Overlay */}
                        {currentRadio && (
                            <div className="absolute top-6 right-6 bg-black/80 backdrop-blur-xl rounded-xl border border-orange-500/30 p-3 min-w-[200px] animate-in slide-in-from-right duration-300">
                                <div className="flex items-center gap-3">
                                    {/* Radio icon with pulse animation */}
                                    <div className="relative">
                                        <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-orange-400" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                                                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                                            </svg>
                                        </div>
                                        {/* Pulsing ring */}
                                        <div className="absolute inset-0 rounded-full border-2 border-orange-400 animate-ping opacity-30" />
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="text-lg font-bold"
                                                style={{
                                                    color: raceData?.driverColors[currentRadio.driver]
                                                        ? `rgb(${raceData.driverColors[currentRadio.driver].join(',')})`
                                                        : '#fff'
                                                }}
                                            >
                                                {currentRadio.driver}
                                            </span>
                                            <span className="text-xs text-zinc-400">Team Radio</span>
                                        </div>
                                        {/* Audio wave animation */}
                                        <div className="flex items-end gap-0.5 h-3 mt-1">
                                            {[...Array(8)].map((_, i) => (
                                                <div
                                                    key={i}
                                                    className="w-1 bg-orange-400 rounded-full animate-pulse"
                                                    style={{
                                                        height: `${40 + (i % 3) * 20}%`,
                                                        animationDuration: `${0.3 + (i * 0.05)}s`,
                                                        animationDelay: `${i * 0.05}s`
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Telemetry Charts Panel (shows when driver selected) */}
                    {selectedDriver && telemetryChartData.length > 0 && (
                        <div className="mx-4 mb-2 rounded-xl bg-black/40 backdrop-blur border border-white/5 shrink-0 overflow-hidden">
                            {/* Header with driver info and tyre */}
                            <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-white/5">
                                <div className="w-3 h-3 rounded-full shadow-lg" style={{ backgroundColor: driverColor, boxShadow: `0 0 10px ${driverColor}` }} />
                                <span className="text-sm font-bold text-white">{selectedDriver}</span>
                                <span className="text-xs text-zinc-500">Telemetry</span>
                                {/* Current Tyre */}
                                <div className="ml-auto flex items-center gap-2">
                                    <span className="text-[10px] text-zinc-500 uppercase">Tyre</span>
                                    <div
                                        className="w-5 h-5 rounded-full ring-2 ring-zinc-700"
                                        style={{ backgroundColor: TYRE_COMPOUNDS[Math.round(currentFrame?.drivers[selectedDriver]?.tyre || 3)]?.color || '#fff' }}
                                        title={TYRE_COMPOUNDS[Math.round(currentFrame?.drivers[selectedDriver]?.tyre || 3)]?.name || 'UNKNOWN'}
                                    />
                                    <span className="text-xs font-bold text-white">
                                        {TYRE_COMPOUNDS[Math.round(currentFrame?.drivers[selectedDriver]?.tyre || 3)]?.name || '?'}
                                    </span>
                                </div>
                            </div>

                            {/* Speed Chart */}
                            <div className="px-2 pt-1">
                                <div className="flex items-center gap-2 px-2">
                                    <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    <span className="text-[10px] text-cyan-400 font-bold uppercase">Speed</span>
                                    <span className="text-xs font-mono text-white ml-auto">{Math.round(currentFrame?.drivers[selectedDriver]?.speed || 0)} km/h</span>
                                </div>
                                <ResponsiveContainer width="100%" height={50}>
                                    <LineChart data={telemetryChartData} margin={{ top: 2, right: 5, bottom: 2, left: 5 }}>
                                        <XAxis dataKey="time" hide />
                                        <YAxis domain={[0, 360]} hide />
                                        <Line type="monotone" dataKey="speed" stroke="#00bcd4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Throttle Chart */}
                            <div className="px-2">
                                <div className="flex items-center gap-2 px-2">
                                    <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                                    </svg>
                                    <span className="text-[10px] text-green-400 font-bold uppercase">Throttle</span>
                                    <span className="text-xs font-mono text-white ml-auto">{Math.round(currentFrame?.drivers[selectedDriver]?.throttle || 0)}%</span>
                                </div>
                                <ResponsiveContainer width="100%" height={40}>
                                    <LineChart data={telemetryChartData} margin={{ top: 2, right: 5, bottom: 2, left: 5 }}>
                                        <XAxis dataKey="time" hide />
                                        <YAxis domain={[0, 100]} hide />
                                        <Line type="monotone" dataKey="throttle" stroke="#4caf50" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Brake Chart */}
                            <div className="px-2 pb-2">
                                <div className="flex items-center gap-2 px-2">
                                    <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                                        <rect x="6" y="4" width="12" height="16" rx="2" />
                                    </svg>
                                    <span className="text-[10px] text-red-400 font-bold uppercase">Brake</span>
                                    <span className={`text-xs font-mono ml-auto ${Math.round(currentFrame?.drivers[selectedDriver]?.brake || 0) ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                                        {Math.round(currentFrame?.drivers[selectedDriver]?.brake || 0) ? 'ON' : 'OFF'}
                                    </span>
                                </div>
                                <ResponsiveContainer width="100%" height={40}>
                                    <LineChart data={telemetryChartData} margin={{ top: 2, right: 5, bottom: 2, left: 5 }}>
                                        <XAxis dataKey="time" hide />
                                        <YAxis domain={[0, 100]} hide />
                                        <Line type="monotone" dataKey="brake" stroke="#f44336" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Playback controls - Premium Design */}
                    <div className="mx-4 mb-4 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 p-4 shrink-0">
                        {/* Progress bar */}
                        <div className="relative h-1 bg-zinc-800 rounded-full mb-4 overflow-hidden cursor-pointer group"
                            onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const percent = (e.clientX - rect.left) / rect.width;
                                setFrameIndex(Math.floor(percent * (raceData.frames.length - 1)));
                            }}>
                            <div
                                className="h-full bg-gradient-to-r from-red-700 to-red-500 transition-all"
                                style={{ width: `${progress}%` }}
                            />
                            <div
                                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
                            />
                        </div>

                        <div className="flex items-center justify-center gap-6">
                            <button onClick={() => setFrameIndex(0)} className="text-zinc-500 hover:text-white transition-colors p-2" title="Restart (R)">
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                                </svg>
                            </button>

                            <button onClick={() => setFrameIndex(prev => Math.max(prev - 50, 0))} className="text-zinc-500 hover:text-white transition-colors p-2" title="Rewind (←)">
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
                                </svg>
                            </button>

                            <button
                                onClick={() => setIsPlaying(prev => !prev)}
                                className="w-14 h-14 rounded-full bg-gradient-to-br from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 flex items-center justify-center shadow-lg shadow-red-900/30 transition-all hover:scale-105"
                                title="Play/Pause (Space)"
                            >
                                {isPlaying ? (
                                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                    </svg>
                                ) : (
                                    <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                )}
                            </button>

                            <button onClick={() => setFrameIndex(prev => Math.min(prev + 50, raceData.frames.length - 1))} className="text-zinc-500 hover:text-white transition-colors p-2" title="Fast Forward (→)">
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
                                </svg>
                            </button>

                            <button
                                onClick={() => setPlaybackSpeed(prev => prev === 8 ? 0.5 : prev * 2)}
                                className="text-zinc-500 hover:text-white transition-colors p-2 font-mono text-sm font-bold min-w-[3rem]"
                                title="Speed (↑/↓)"
                            >
                                {playbackSpeed}x
                            </button>
                        </div>
                    </div>
                </div>

                {/* Leaderboard Sidebar - Premium Glass Look */}
                <div className="w-72 bg-black/40 backdrop-blur-xl border-l border-white/5 overflow-y-auto shrink-0">
                    <div className="p-4 border-b border-white/5 sticky top-0 bg-black/60 backdrop-blur-xl z-10">
                        <h2 className="text-sm font-bold text-white tracking-wider uppercase">Live Standings</h2>
                    </div>

                    <div className="p-2">
                        {sortedDrivers.map(([code, pos], index) => {
                            const driver = raceData.drivers.find(d => d.code === code);
                            const color = raceData.driverColors[code] || [128, 128, 128];
                            const tyre = TYRE_COMPOUNDS[Math.round(pos.tyre)] || { name: '?', color: '#888', bg: 'bg-zinc-500' };
                            const isSelected = selectedDriver === code;
                            const isTop3 = index < 3;

                            return (
                                <div
                                    key={code}
                                    onClick={() => setSelectedDriver(isSelected ? null : code)}
                                    className={`
                                        mb-1 rounded-xl p-3 flex items-center gap-3 cursor-pointer transition-all
                                        ${isSelected
                                            ? 'bg-white/10 border border-white/20 shadow-lg'
                                            : 'hover:bg-white/5 border border-transparent'}
                                        ${isTop3 && !isSelected ? 'bg-gradient-to-r from-white/5 to-transparent' : ''}
                                    `}
                                >
                                    {/* Position */}
                                    <div className={`
                                        w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold
                                        ${index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                                            index === 1 ? 'bg-zinc-400/20 text-zinc-300' :
                                                index === 2 ? 'bg-amber-600/20 text-amber-500' :
                                                    'text-zinc-500'}
                                    `}>
                                        {index + 1}
                                    </div>

                                    {/* Team color bar */}
                                    <div
                                        className="w-1 h-8 rounded-full"
                                        style={{
                                            backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
                                            boxShadow: isSelected ? `0 0 10px rgb(${color[0]}, ${color[1]}, ${color[2]})` : 'none'
                                        }}
                                    />

                                    {/* Driver info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm text-white">{code}</div>
                                        <div className="text-[10px] text-zinc-500 truncate">{driver?.team}</div>
                                    </div>

                                    {/* Tyre compound */}
                                    <div
                                        className="w-4 h-4 rounded-full shrink-0 ring-2 ring-zinc-800"
                                        style={{ backgroundColor: tyre.color }}
                                        title={tyre.name}
                                    />

                                    {/* Speed when selected */}
                                    {isSelected && (
                                        <div className="text-xs text-white font-mono font-bold">
                                            {Math.round(pos.speed)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Selected driver info panel - Draggable Floating Glass Card */}
            {
                selectedDriver && currentFrame?.drivers[selectedDriver] && (
                    <div
                        className="fixed bg-black/70 backdrop-blur-xl border border-white/10 rounded-2xl p-4 w-60 shadow-2xl select-none"
                        style={{
                            left: driverInfoPanelPos.x,
                            bottom: driverInfoPanelPos.y,
                            cursor: isDragging ? 'grabbing' : 'grab'
                        }}
                        onMouseDown={handlePanelMouseDown}
                    >
                        {/* Drag handle */}
                        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-zinc-600 rounded-full opacity-50" />

                        <div className="flex items-center gap-3 mb-3 mt-1">
                            <div
                                className="w-2 h-10 rounded-full"
                                style={{
                                    backgroundColor: driverColor,
                                    boxShadow: `0 0 15px ${driverColor}`
                                }}
                            />
                            <div>
                                <div className="font-bold text-white text-lg">{selectedDriver}</div>
                                <div className="text-xs text-zinc-500">
                                    {raceData.drivers.find(d => d.code === selectedDriver)?.fullName}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white/5 rounded-xl p-3 text-center">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Speed</div>
                                <div className="font-mono text-xl font-bold text-white">
                                    {Math.round(currentFrame.drivers[selectedDriver].speed)}
                                </div>
                                <div className="text-[10px] text-zinc-600">km/h</div>
                            </div>
                            <div className="bg-white/5 rounded-xl p-3 text-center">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Gear</div>
                                <div className="font-mono text-xl font-bold text-white">
                                    {currentFrame.drivers[selectedDriver].gear}
                                </div>
                            </div>
                            <div className="bg-white/5 rounded-xl p-3 text-center">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">DRS</div>
                                <div className={`font-mono text-xl font-bold ${currentFrame.drivers[selectedDriver].drs >= 10 ? 'text-green-400' : 'text-zinc-600'}`}>
                                    {currentFrame.drivers[selectedDriver].drs >= 10 ? 'ON' : 'OFF'}
                                </div>
                            </div>
                            <div className="bg-white/5 rounded-xl p-3 text-center">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Position</div>
                                <div className="font-mono text-xl font-bold text-red-500">
                                    P{currentFrame.drivers[selectedDriver].position}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Timing Board Slide-out Panel */}
            {showTimingBoard && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-zinc-900/95 border border-white/10 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
                            <h2 className="text-xl font-bold text-white">Live Timing - Lap {currentFrame?.lap || 1}</h2>
                            <button
                                onClick={() => setShowTimingBoard(false)}
                                className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Timing Table */}
                        <div className="flex-1 overflow-auto p-4">
                            <table className="w-full text-sm">
                                <thead className="text-[10px] text-zinc-500 uppercase sticky top-0 bg-zinc-900">
                                    <tr>
                                        <th className="p-2 text-left w-8">Pos</th>
                                        <th className="p-2 text-left">Driver</th>
                                        <th className="p-2 text-center">DRS</th>
                                        <th className="p-2 text-right">Last Lap</th>
                                        <th className="p-2 text-right">Best Lap</th>
                                        <th className="p-2 text-right">Interval</th>
                                        <th className="p-2 text-right">Gap</th>
                                        <th className="p-2 text-right">S1</th>
                                        <th className="p-2 text-right">S2</th>
                                        <th className="p-2 text-right">S3</th>
                                        <th className="p-2 text-center">Tyre</th>
                                        <th className="p-2 text-center">Diff</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedDrivers.map(([code, pos], idx) => {
                                        const lapData = raceData.lapTiming?.[code];
                                        const currentLap = currentFrame?.lap || 1;
                                        const lastLapData = lapData?.laps?.[currentLap - 1];

                                        // Find best lap time
                                        let bestLapTime: number | null = null;
                                        if (lapData?.laps) {
                                            Object.values(lapData.laps).forEach((l) => {
                                                if (l.time && (bestLapTime === null || l.time < bestLapTime)) {
                                                    bestLapTime = l.time;
                                                }
                                            });
                                        }

                                        const gridPos = lapData?.grid_pos || 0;
                                        const posDiff = gridPos - pos.position;
                                        const color = raceData.driverColors[code] || [128, 128, 128];

                                        // Calculate gap/interval from lap time differences (simplified)
                                        const leaderLapData = raceData.lapTiming?.[sortedDrivers[0]?.[0]]?.laps?.[currentLap - 1];
                                        const gapToLeader = lastLapData?.time && leaderLapData?.time
                                            ? lastLapData.time - leaderLapData.time
                                            : 0;

                                        // Calculate interval to car ahead
                                        const carAheadCode = idx > 0 ? sortedDrivers[idx - 1]?.[0] : null;
                                        const carAheadLapData = carAheadCode ? raceData.lapTiming?.[carAheadCode]?.laps?.[currentLap - 1] : null;
                                        const interval = lastLapData?.time && carAheadLapData?.time
                                            ? lastLapData.time - carAheadLapData.time
                                            : 0;

                                        const formatLapTime = (seconds: number | null) => {
                                            if (!seconds) return '—';
                                            const mins = Math.floor(seconds / 60);
                                            const secs = (seconds % 60).toFixed(3);
                                            return `${mins}:${secs.padStart(6, '0')}`;
                                        };

                                        const formatSector = (seconds: number | null) => {
                                            if (!seconds) return '—';
                                            return seconds.toFixed(3);
                                        };

                                        const tyre = TYRE_COMPOUNDS[Math.round(pos.tyre || 3)];

                                        return (
                                            <tr
                                                key={code}
                                                className={`border-b border-white/5 hover:bg-white/5 transition-colors ${selectedDriver === code ? 'bg-white/10' : ''
                                                    }`}
                                                onClick={() => setSelectedDriver(code === selectedDriver ? null : code)}
                                            >
                                                <td className={`p-2 font-bold ${idx === 0 ? 'text-yellow-400' :
                                                    idx === 1 ? 'text-zinc-300' :
                                                        idx === 2 ? 'text-amber-500' : 'text-zinc-500'
                                                    }`}>
                                                    {pos.position}
                                                </td>
                                                <td className="p-2">
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className="w-1 h-5 rounded-full"
                                                            style={{ backgroundColor: `rgb(${color.join(',')})` }}
                                                        />
                                                        <span className="font-bold text-white">{code}</span>
                                                    </div>
                                                </td>
                                                <td className="p-2 text-center">
                                                    <span className={`text-xs px-1.5 py-0.5 rounded ${pos.drs >= 10 ? 'bg-green-500/20 text-green-400' : 'text-zinc-600'
                                                        }`}>
                                                        {pos.drs >= 10 ? 'ON' : 'OFF'}
                                                    </span>
                                                </td>
                                                <td className={`p-2 text-right font-mono ${lastLapData?.is_pb ? 'text-green-400' : 'text-white'
                                                    }`}>
                                                    {formatLapTime(lastLapData?.time || null)}
                                                </td>
                                                <td className="p-2 text-right font-mono text-purple-400">
                                                    {formatLapTime(bestLapTime)}
                                                </td>
                                                <td className="p-2 text-right font-mono text-yellow-400">
                                                    {idx === 0 ? '—' : interval ? `+${Math.abs(interval).toFixed(3)}s` : '—'}
                                                </td>
                                                <td className="p-2 text-right font-mono text-red-400">
                                                    {idx === 0 ? 'Leader' : gapToLeader ? `+${Math.abs(gapToLeader).toFixed(3)}s` : '—'}
                                                </td>
                                                <td className="p-2 text-right font-mono text-zinc-400">
                                                    {formatSector(lastLapData?.s1 || null)}
                                                </td>
                                                <td className="p-2 text-right font-mono text-zinc-400">
                                                    {formatSector(lastLapData?.s2 || null)}
                                                </td>
                                                <td className="p-2 text-right font-mono text-zinc-400">
                                                    {formatSector(lastLapData?.s3 || null)}
                                                </td>
                                                <td className="p-2 text-center">
                                                    <div
                                                        className="w-5 h-5 rounded-full mx-auto ring-2 ring-zinc-800"
                                                        style={{ backgroundColor: tyre?.color || '#fff' }}
                                                        title={tyre?.name || 'Unknown'}
                                                    />
                                                </td>
                                                <td className="p-2 text-center">
                                                    {posDiff !== 0 && (
                                                        <span className={`text-xs font-bold ${posDiff > 0 ? 'text-green-400' : 'text-red-400'
                                                            }`}>
                                                            {posDiff > 0 ? `+${posDiff}` : posDiff}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}
