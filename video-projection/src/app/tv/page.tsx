'use client';

import {useState, useEffect, useRef} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {Hand, Mic, Play} from 'lucide-react';
import FullscreenToggle from "@/components/ui/FullscreenToggle";
import {getDynamicAssetPath} from '@/utils/dynamicAssetPath';

interface VideoCommand {
    action: 'play' | 'pause' | 'stop' | 'connected' | 'seek' | 'restart' | 'swap';
    videoUrl?: string;
    productName?: string;
    timestamp?: number;
    seekTime?: number;
    currentState?: {
        action: 'play';
        videoUrl: string;
        productName: string;
    };
}

export default function TVDisplay() {
    const [currentVideo, setCurrentVideo] = useState<string | null>(null);
    const [productName, setProductName] = useState<string>('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [animationsEnabled, setAnimationsEnabled] = useState(true);
    const [userInteracted, setUserInteracted] = useState(true);
    // Hydration guard to avoid SSR/CSR text mismatches
    const [hydrated, setHydrated] = useState(false);
    // Device/connection status UI state
    const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [wsCount, setWsCount] = useState<number>(0);
    const [cores, setCores] = useState<number>(typeof navigator !== 'undefined' && (navigator as any).hardwareConcurrency ? (navigator as any).hardwareConcurrency : 0);
    const [deviceMemory, setDeviceMemory] = useState<number | undefined>(typeof navigator !== 'undefined' ? (navigator as any).deviceMemory : undefined);
    const [storageEstimate, setStorageEstimate] = useState<{usage?: number; quota?: number}>({});
    const [jsHeap, setJsHeap] = useState<{used?: number; total?: number}>({});
    const [wsPulse, setWsPulse] = useState(false);
    // Smoothed display percentages for subtle continuous motion
    const [displayHeapPct, setDisplayHeapPct] = useState<number>(0);
    const [displayStoragePct, setDisplayStoragePct] = useState<number>(0);
    const [displayBatteryPct, setDisplayBatteryPct] = useState<number>(0);
    const [battery, setBattery] = useState<{level: number; charging: boolean} | undefined>(undefined);
    const [powerInfo, setPowerInfo] = useState<{ voltage?: number; current?: number } | undefined>(undefined);
    const [cpuInfo, setCpuInfo] = useState<{ percent?: number; perCore?: number[]; temperatureC?: number; temperatureSource?: string }>({});
    const [logLines, setLogLines] = useState<string[]>(["system.init()", "Loading modules..."]);
    const logTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const logRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    // Dynamic binary overlay content
    const [binaryLine1, setBinaryLine1] = useState<string>('01001000 01100101 01101100 01101100 01101111');
    // WebSocket connection and heartbeat
    const wsRef = useRef<WebSocket | null>(null);
    const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const healthCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const lastPongRef = useRef<number>(0);

    useEffect(() => {
        // Connect to WebSocket for real-time video commands
        const connectWebSocket = () => {
            try {
                // Cleanup any existing connection and timers
                if (wsRef.current) {
                    try { wsRef.current.close(); } catch {}
                    wsRef.current = null;
                }
                if (heartbeatIntervalRef.current) {
                    clearInterval(heartbeatIntervalRef.current);
                    heartbeatIntervalRef.current = null;
                }
                if (healthCheckIntervalRef.current) {
                    clearInterval(healthCheckIntervalRef.current);
                    healthCheckIntervalRef.current = null;
                }

                const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
                const wsUrl = `${protocol}://${window.location.host}/api/video-control/ws`;
                console.log('Attempting to connect to WebSocket:', wsUrl);
                const ws = new WebSocket(wsUrl);
                wsRef.current = ws;

                ws.onopen = () => {
                    console.log('✅ WebSocket connected');
                    setIsConnected(true);
                    lastPongRef.current = Date.now();
                    // Send periodic pings
                    heartbeatIntervalRef.current = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
                        }
                    }, 10000); // 10s
                    // Health check for stale connection
                    healthCheckIntervalRef.current = setInterval(() => {
                        const since = Date.now() - lastPongRef.current;
                        if (since > 30000) { // 30s without pong
                            console.warn('⚠️ WebSocket heartbeat timed out. Reconnecting...');
                            setIsConnected(false);
                            try { ws.close(); } catch {}
                            connectWebSocket();
                        }
                    }, 5000);
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);

                        console.log("\n\nmsg.action\n\n", msg?.currentState?.action);
                        // Handle pong
                        if (msg.type === 'pong') {
                            lastPongRef.current = Date.now();
                            if (!isConnected) setIsConnected(true);
                            return;
                        }
                        // Initial connection info with current state
                        if (msg.type === 'connection' && msg.currentState) {
                            const st = msg.currentState;
                            if (st.action === 'play' && st.videoUrl) {
                                handleVideoCommand({ action: 'play', videoUrl: st.videoUrl, productName: st.productName });
                            }
                            return;
                        }
                        // Video control messages
                        if (msg.type === 'video-control') {
                            const action = msg.action as 'play' | 'pause' | 'stop' | 'seek' | 'restart' | 'swap'
                            const command: VideoCommand = {
                                action,
                                videoUrl: msg.videoUrl,
                                productName: msg.productName,
                                timestamp: msg.timestamp,
                                seekTime: msg.seekTime
                            };
                            handleVideoCommand(command);
                            return;
                        }
                    } catch (err) {
                        console.error('❌ WS message parse error:', err, 'raw:', event.data);
                    }
                };

                ws.onerror = (err) => {
                    console.error('❌ WebSocket error:', err);
                };

                ws.onclose = () => {
                    console.warn('🔌 WebSocket closed. Reconnecting...');
                    setIsConnected(false);
                    // Clear timers
                    if (heartbeatIntervalRef.current) {
                        clearInterval(heartbeatIntervalRef.current);
                        heartbeatIntervalRef.current = null;
                    }
                    if (healthCheckIntervalRef.current) {
                        clearInterval(healthCheckIntervalRef.current);
                        healthCheckIntervalRef.current = null;
                    }
                    // Reconnect shortly
                    setTimeout(connectWebSocket, 1000);
                };

            } catch (error) {
                console.error('❌ Failed to connect to WebSocket:', error);
                setIsConnected(false);
                setTimeout(connectWebSocket, 1000);
            }
        };

        connectWebSocket();

        // Cleanup on unmount
        return () => {
            if (wsRef.current) {
                console.log('🧹 Cleaning up WebSocket connection');
                try { wsRef.current.close(); } catch {}
                wsRef.current = null;
            }
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
                heartbeatIntervalRef.current = null;
            }
            if (healthCheckIntervalRef.current) {
                clearInterval(healthCheckIntervalRef.current);
                healthCheckIntervalRef.current = null;
            }
        };
    }, []); // Empty dependency array to run only once

    // Mark hydrated on mount
    useEffect(() => {
        setHydrated(true);
    }, []);

    // Continuously append pretty tech logs (disabled while video is playing for performance)
    useEffect(() => {
        const shouldRenderAnimations = !isPlaying && animationsEnabled;
        if (!shouldRenderAnimations) {
            if (logTickRef.current) {
                clearInterval(logTickRef.current);
                logTickRef.current = null;
            }
            return;
        }

        const messages = [
            () => `net.link: ${isConnected ? 'online' : 'offline'}`,
            () => currentVideo ? `video.stream: PLAYING → ${currentVideo}` : 'video.stream: IDLE',
            () => productName ? `product: ${productName}` : 'product: —',
            () => `heartbeat: ${new Date().toLocaleTimeString()}`,
            () => `gpu.status: OK`
        ];

        let i = 0;
        logTickRef.current = setInterval(() => {
            setLogLines(prev => {
                const next = `${new Date().toLocaleTimeString()} — ${messages[i % messages.length]()}`;
                const out = [...prev.slice(-8), next]; // keep fewer lines for better performance
                // Auto-scroll to bottom if needed
                if (logRef.current) {
                    logRef.current.scrollTop = logRef.current.scrollHeight;
                }
                return out;
            });
            i++;
        }, 2000); // Keep decorative log updates from forcing frequent full-screen renders

        return () => {
            if (logTickRef.current) {
                clearInterval(logTickRef.current);
                logTickRef.current = null;
            }
        };
    }, [isConnected, currentVideo, productName, isPlaying, animationsEnabled]);

    // Lightweight device/status polling
    useEffect(() => {
        // Online/offline
        const onOnline = () => setIsOnline(true);
        const onOffline = () => setIsOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);

        // WebSocket connections via status API
        const fetchStatus = async () => {
            try {
                const res = await fetch('/api/video-control/status');
                if (res.ok) {
                    const data = await res.json();
                    if (typeof data.websocketConnections === 'number') setWsCount(data.websocketConnections);
                }
            } catch {}
        };
        fetchStatus();
        const statusIv = setInterval(fetchStatus, 10000); // Reduced from 5s to 10s

        // Storage estimate (quota/usage)
        const updateStorage = async () => {
            try {
                // @ts-ignore
                const est = await (navigator.storage?.estimate?.() ?? Promise.resolve(undefined));
                if (est) setStorageEstimate({ usage: est.usage, quota: est.quota });
            } catch {}
        };
        updateStorage();
        const storageIv = setInterval(updateStorage, 60000); // Reduced from 30s to 60s

        // JS heap (Chrome-based)
        const heapIv = setInterval(() => {
            const pm: any = (performance as any);
            if (pm && pm.memory) {
                setJsHeap({ used: pm.memory.usedJSHeapSize, total: pm.memory.totalJSHeapSize });
            }
        }, 2000); // Reduced from 800ms to 2s

        // Show only external power info: poll /api/power for voltage/current (no Battery API usage)
        let pIv: ReturnType<typeof setInterval> | null = null;
        let cIv: ReturnType<typeof setInterval> | null = null;
        const fetchPower = async () => {
            try {
                const res = await fetch('/api/power', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    const v = typeof data.voltage === 'number' ? data.voltage : undefined; // volts
                    const c = typeof data.current === 'number' ? data.current : undefined; // amps
                    setPowerInfo({ voltage: v, current: c });
                }
            } catch {
                // ignore
            }
        };
        const fetchCpu = async () => {
            try {
                const res = await fetch('/api/cpu', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.cpu) {
                        setCpuInfo({ percent: data.cpu.percent, perCore: data.cpu.perCore, temperatureC: data.cpu.temperatureC, temperatureSource: data.cpu.temperatureSource });
                    }
                }
            } catch {
                // ignore
            }
        };
        fetchPower();
        fetchCpu();
        pIv = setInterval(fetchPower, 10000); // Reduced from 5s to 10s
        cIv = setInterval(fetchCpu, 5000); // Reduced from 2s to 5s

        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            clearInterval(statusIv);
            clearInterval(storageIv);
            clearInterval(heapIv);
            if (pIv) clearInterval(pIv);
            if (cIv) clearInterval(cIv);
        };
    }, []);

    // Derived metrics for animated UI
    const heapTotal = jsHeap.total && jsHeap.total > 0 ? jsHeap.total : undefined;
    const heapUsed = jsHeap.used && jsHeap.used > 0 ? jsHeap.used : undefined;
    const heapPct = heapTotal && heapUsed ? Math.min(100, Math.max(0, Math.round((heapUsed / heapTotal) * 100))) : undefined;
    const storagePct = storageEstimate.usage && storageEstimate.quota ? Math.min(100, Math.max(0, Math.round((storageEstimate.usage / storageEstimate.quota) * 100))) : undefined;
    const batteryPct = battery ? Math.round(battery.level * 100) : undefined;

    // Metric bars already use CSS transitions, so keep their displayed values
    // in sync with telemetry without a per-frame React render loop.
    useEffect(() => {
        if (heapPct !== undefined) setDisplayHeapPct(heapPct);
        if (storagePct !== undefined) setDisplayStoragePct(storagePct);
        if (batteryPct !== undefined) setDisplayBatteryPct(batteryPct);
    }, [heapPct, storagePct, batteryPct]);

    // Update dynamic binary line based on live UI metrics (only when animations are on)
    useEffect(() => {
        const shouldRenderAnimations = !isPlaying && animationsEnabled;
        if (!shouldRenderAnimations) return;

        const update = () => {
            // Pack some runtime metrics into bytes
            const now = Date.now() & 0xFFFF; // 2 bytes of timestamp entropy
            const bytes: number[] = [];
            bytes.push(now & 0xFF, (now >> 8) & 0xFF);
            bytes.push(isConnected ? 1 : 0);
            bytes.push(wsCount & 0xFF);
            bytes.push(Math.round(displayHeapPct) & 0xFF);
            bytes.push(Math.round(displayStoragePct) & 0xFF);
            bytes.push(Math.round(displayBatteryPct) & 0xFF);
            // Keep it concise: first 10-12 bytes
            const out = bytes.slice(0, 12)
                .map(b => b.toString(2).padStart(8, '0'))
                .join(' ');
            setBinaryLine1(out);
        };

        update();
        const iv = setInterval(update, 1000); // Reduced from 300ms to 1s
        return () => clearInterval(iv);
    }, [isPlaying, animationsEnabled, isConnected, wsCount, displayHeapPct, displayStoragePct, displayBatteryPct]);

    // Pulse when WS count changes
    const lastWsRef = useRef<number>(0);
    useEffect(() => {
        if (wsCount !== lastWsRef.current) {
            lastWsRef.current = wsCount;
            setWsPulse(true);
            const t = setTimeout(() => setWsPulse(false), 600);
            return () => clearTimeout(t);
        }
    }, [wsCount]);

    const handleVideoCommand = (command: VideoCommand) => {

        // Handle connection message separately (no video element needed)
        if (command.action === 'connected') {
            if (command.currentState?.action === 'play' && command.currentState?.videoUrl) {
                setTimeout(() => {
                    handleVideoCommand({
                        action: 'play',
                        videoUrl: command.currentState!.videoUrl,
                        productName: command.currentState!.productName
                    });
                }, 100);
            }
            return;
        }

        const video = videoRef.current;
        if (!video) {
            return;
        }

        const playVideo = async () => {
            try {
                await video.play();
                setIsPlaying(true);
                setAnimationsEnabled(false);
            } catch (error) {
                // @ts-ignore
                if (error.name === 'NotAllowedError') {
                    console.log('⚠️ Autoplay blocked by browser policy');
                }
            }
        };

        switch (command.action) {
            case 'play':
                // Check if this is the same video that's already loaded
                const isSameVideo = video.src && video.src.includes(command.videoUrl || '');

                // New video URL - load and play
                if (command.videoUrl && !isSameVideo) {
                    // Use dynamic path for production to serve files added after build
                    const dynamicVideoUrl = getDynamicAssetPath(command.videoUrl);
                    setCurrentVideo(dynamicVideoUrl);
                    setProductName(command.productName || '');

                    // Set video source and play when ready
                    video.src = dynamicVideoUrl;
                    video.onloadeddata = () => {
                        video.onloadeddata = null; // Clean up handler
                        playVideo();
                    };

                    video.onerror = () => {
                        video.onerror = null; // Clean up handler
                    };
                }
                // Resume paused video (same video)
                else if (video.paused && (isSameVideo || currentVideo)) {
                    // Update state to match the video being resumed
                    if (command.videoUrl) {
                        const dynamicVideoUrl = getDynamicAssetPath(command.videoUrl);
                        setCurrentVideo(dynamicVideoUrl);
                        setProductName(command.productName || '');
                    }
                    playVideo();
                }
                // Video already playing
                else {
                    console.log('ℹ️ Video is already playing or no video loaded');
                }
                break;

            case 'pause':
                video.pause();
                setIsPlaying(false);
                break;

            case 'stop':
                video.pause();
                video.currentTime = 0;
                setIsPlaying(false);
                setCurrentVideo(null);
                setProductName('');
                setAnimationsEnabled(true);
                break;

            case 'swap' :
                video.pause();
                video.currentTime = 0;
                setIsPlaying(false);
                setCurrentVideo(null);
                setProductName('');
                setAnimationsEnabled(true);
                break;

            case 'seek':
                if (command.seekTime !== undefined && video.duration) {
                    const newTime = Math.max(0, Math.min(video.duration, video.currentTime + command.seekTime));
                    video.currentTime = newTime;
                    console.log(`⏩ Seeked to ${newTime.toFixed(1)}s`);
                }
                break;

            case 'restart':
                video.currentTime = 0;
                if (video.paused && currentVideo) {
                    playVideo();
                }
                break;

            default:
                console.warn('⚠️ Unknown video command:', command.action);
        }
    };

    // PERFORMANCE OPTIMIZATION: Completely disable all animations when video is playing
    // This is critical for Raspberry Pi performance as animations can cause video playback to lag
    // See docs/PERFORMANCE_OPTIMIZATIONS.md for more details
    const shouldRenderAnimations = !isPlaying && animationsEnabled;

    // Helper to rotate groups of 8-bit words to create varied streams
    const rotateBinaryWords = (s: string, shift: number) => {
        const parts = s.split(' ').filter(Boolean);
        if (parts.length === 0) return s;
        const k = ((shift % parts.length) + parts.length) % parts.length;
        return parts.slice(k).concat(parts.slice(0, k)).join(' ');
    };

    return (
        <div className="min-h-screen bg-black relative overflow-hidden">
            {/* AI/OS Circuit Wave Background - Hidden during video playback */}
            {!isPlaying && (
                <div className={`absolute inset-0 ${shouldRenderAnimations ? 'animate-circuit-wave' : ''}`}
                     style={{display: isPlaying ? 'none' : 'block'}}>
                    Animated gradient background with scan lines
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-emerald-800">
                        <div
                            className={`absolute inset-0 bg-gradient-to-t from-transparent via-cyan-500/10 to-transparent ${shouldRenderAnimations ? 'animate-scan-line' : ''}`}></div>
                        {/* Additional light layers */}
                        <div
                            className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-transparent to-cyan-500/5"></div>
                        <div
                            className="absolute inset-0 bg-radial-gradient from-cyan-500/8 via-transparent to-transparent"></div>
                    </div>

                    {/* Circuit Board Pattern */}
                    <div
                        className={`absolute inset-0 opacity-30 ${shouldRenderAnimations ? 'animate-circuit-pattern' : ''}`}>
                        {/* Horizontal circuit lines */}
                        <div className="absolute top-1/4 left-0 w-full h-0.5 bg-cyan-400/60">
                            <div
                                className={`absolute top-0 left-0 w-4 h-4 bg-cyan-400 rounded-full ${shouldRenderAnimations ? 'animate-data-pulse' : ''}`}></div>
                            <div
                                className={`absolute top-0 left-1/3 w-2 h-2 bg-emerald-400 rounded-full ${shouldRenderAnimations ? 'animate-data-pulse-delayed' : ''}`}></div>
                            <div
                                className={`absolute top-0 right-1/4 w-3 h-3 bg-blue-400 rounded-full ${shouldRenderAnimations ? 'animate-data-pulse' : ''}`}></div>
                        </div>

                        <div className="absolute top-2/4 left-0 w-full h-0.5 bg-emerald-400/60">
                            <div
                                className={`absolute top-0 right-0 w-4 h-4 bg-emerald-400 rounded-full ${shouldRenderAnimations ? 'animate-data-pulse' : ''}`}></div>
                            <div
                                className={`absolute top-0 right-1/3 w-2 h-2 bg-cyan-400 rounded-full ${shouldRenderAnimations ? 'animate-data-pulse-delayed' : ''}`}></div>
                            <div
                                className={`absolute top-0 left-1/4 w-3 h-3 bg-purple-400 rounded-full ${shouldRenderAnimations ? 'animate-data-pulse' : ''}`}></div>
                        </div>

                        <div className="absolute top-3/4 left-0 w-full h-0.5 bg-purple-400/60">
                            <div
                                className={`absolute top-0 left-1/2 w-4 h-4 bg-purple-400 rounded-full ${shouldRenderAnimations ? 'animate-data-pulse' : ''}`}></div>
                            <div
                                className={`absolute top-0 left-1/6 w-2 h-2 bg-cyan-400 rounded-full ${shouldRenderAnimations ? 'animate-data-pulse-delayed' : ''}`}></div>
                            <div
                                className={`absolute top-0 right-1/6 w-3 h-3 bg-emerald-400 rounded-full ${shouldRenderAnimations ? 'animate-data-pulse' : ''}`}></div>
                        </div>

                        {/* Vertical circuit lines */}
                        <div className="absolute top-0 left-1/4 w-0.5 h-full bg-cyan-400/60">
                            <div
                                className={`absolute left-0 top-1/4 w-4 h-4 bg-cyan-400 rounded-full ${shouldRenderAnimations ? 'animate-data-pulse' : ''}`}></div>
                            <div
                                className={`absolute left-0 top-2/3 w-2 h-2 bg-emerald-400 rounded-full ${shouldRenderAnimations ? 'animate-data-pulse-delayed' : ''}`}></div>
                        </div>

                        <div className="absolute top-0 right-1/4 w-0.5 h-full bg-emerald-400/60">
                            <div
                                className={`absolute left-0 top-1/3 w-4 h-4 bg-emerald-400 rounded-full ${shouldRenderAnimations ? 'animate-data-pulse' : ''}`}></div>
                            <div
                                className={`absolute left-0 top-3/4 w-3 h-3 bg-purple-400 rounded-full ${shouldRenderAnimations ? 'animate-data-pulse-delayed' : ''}`}></div>
                        </div>
                    </div>

                    {/* AI Data Streams */}
                    <div className={`absolute inset-0 ${shouldRenderAnimations ? 'animate-data-streams' : ''}`}>
                        {/* Binary code streams */}
                        {hydrated && shouldRenderAnimations && (
                            <div className="absolute top-8 left-8 text-cyan-400/40 font-mono text-xs" suppressHydrationWarning>
                                {binaryLine1}
                            </div>
                        )}
                        {hydrated && shouldRenderAnimations && (
                            <div className="absolute top-16 right-8 text-emerald-400/40 font-mono text-xs" suppressHydrationWarning>
                                {rotateBinaryWords(binaryLine1, 3)}
                            </div>
                        )}
                        {hydrated && shouldRenderAnimations && (
                            <div className="absolute bottom-16 left-8 text-purple-400/40 font-mono text-xs" suppressHydrationWarning>
                                {rotateBinaryWords(binaryLine1, 6)}
                            </div>
                        )}

                        {/* Hexadecimal data */}
                        <div className="absolute top-1/3 left-4 text-cyan-400/30 font-mono text-xs">
                            0xA1B2C3 0xD4E5F6 0x789ABC
                        </div>
                        <div className="absolute bottom-1/3 right-4 text-emerald-400/30 font-mono text-xs">
                            0xDEF123 0x456789 0xABCDEF
                        </div>
                    </div>

                    {/* OS Interface Elements */}
                    <div className={`absolute inset-0 ${shouldRenderAnimations ? 'animate-os-elements' : ''}`}>
                        {/* Terminal windows */}
                        <div className="absolute top-15 left-12 hidden h-46 w-68 border border-cyan-400/40 bg-black/60 lg:block">
                            <div ref={logRef} className="relative p-2 terminal-log terminal-scroll pb-5">
                                {logLines.map((l, idx) => (
                                    <div key={idx} className="terminal-line">{l}</div>
                                ))}
                                {shouldRenderAnimations && (
                                    <div className="absolute left-2 bottom-1 terminal-line animate-typing">listening...</div>
                                )}
                            </div>
                        </div>

                        <div className="absolute bottom-12 right-12 hidden h-52 w-60 border border-emerald-400/40 bg-black/60 lg:block">
                            <div className="p-2 text-[10px] font-mono text-emerald-300/80 space-y-1">
                                {/* Online + WS */}
                                <div className="flex items-center justify-between">
                                    <div className="mr-2">SYS ONLINE</div>
                                    <div suppressHydrationWarning className={isOnline ? 'text-emerald-400' : 'text-red-400'}>{hydrated ? (isOnline ? 'YES' : 'NO') : '—'}</div>
                                    <div className="ml-2">WS</div>
                                    <div suppressHydrationWarning className={`tabular-nums ${wsPulse ? 'text-emerald-200' : ''}`}>{hydrated ? wsCount : '—'}</div>
                                </div>

                                {/* CPU / RAM approx */}
                                <div className="flex items-center justify-between">
                                    <div>CPU CORES</div>
                                    <div suppressHydrationWarning className="tabular-nums">{hydrated ? (cores || '—') : '—'}</div>
                                    <div className="ml-2">RAM(~)</div>
                                    <div suppressHydrationWarning className="tabular-nums">{hydrated ? (deviceMemory ? `${deviceMemory}GB` : '—') : '—'}</div>
                                </div>

                                {/* CPU usage */}
                                <div>
                                    <div className="flex items-center justify-between">
                                        <div>CPU</div>
                                        <div suppressHydrationWarning className="tabular-nums">{hydrated ? (cpuInfo.percent !== undefined ? `${cpuInfo.percent}%` : '—') : '—'}</div>
                                    </div>
                                    <div className="mt-0.5 h-1.5 bg-gray-800/60 border border-emerald-400/30">
                                        <div
                                            className="h-full bg-gradient-to-r from-amber-400 to-red-500 transition-all duration-500 ease-out"
                                            style={{ width: `${cpuInfo.percent ?? 0}%` }}
                                        />
                                    </div>
                                </div>

                                {/* CPU temperature */}
                                <div>
                                    <div className="flex items-center justify-between">
                                        <div>CPU TEMP</div>
                                        <div suppressHydrationWarning className="tabular-nums">{hydrated ? (cpuInfo.temperatureC !== undefined ? `${cpuInfo.temperatureC.toFixed(1)}°C${cpuInfo.temperatureSource === 'estimated' ? ' ~' : ''}` : 'N/A') : '—'}</div>
                                    </div>
                                    <div className="mt-0.5 h-1.5 bg-gray-800/60 border border-emerald-400/30">
                                        {cpuInfo.temperatureC !== undefined ? (
                                            <div
                                                className="h-full bg-gradient-to-r from-sky-400 via-amber-400 to-red-500 transition-all duration-500 ease-out"
                                                style={{ width: `${Math.max(0, Math.min(100, (cpuInfo.temperatureC / 85) * 100))}%` }}
                                            />
                                        ) : (
                                            <div className="h-full w-0" />
                                        )}
                                    </div>
                                </div>

                                {/* JS Heap bar */}
                                <div>
                                    <div className="flex items-center justify-between">
                                        <div>JS HEAP</div>
                                        <div suppressHydrationWarning className="tabular-nums">
                                            {hydrated ? (heapUsed ? `${(heapUsed/1048576).toFixed(0)}MB` : '—') : '—'}
                                            {hydrated ? (heapTotal ? ` / ${(heapTotal/1048576).toFixed(0)}MB` : '') : ''}
                                        </div>
                                    </div>
                                    <div className="mt-0.5 h-1.5 bg-gray-800/60 border border-emerald-400/30">
                                        <div
                                            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-500 ease-out"
                                            style={{ width: (displayHeapPct ?? 0) + '%' }}
                                        />
                                    </div>
                                </div>

                                {/* Storage bar */}
                                <div>
                                    <div className="flex items-center justify-between">
                                        <div>STORAGE</div>
                                        <div suppressHydrationWarning className="tabular-nums">
                                            {hydrated && storageEstimate.usage && storageEstimate.quota ? `${(storageEstimate.usage/1048576).toFixed(0)}MB / ${(storageEstimate.quota/1048576).toFixed(0)}MB` : '—'}
                                        </div>
                                    </div>
                                    <div className="mt-0.5 h-1.5 bg-gray-800/60 border border-emerald-400/30">
                                        <div
                                            className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-500 ease-out"
                                            style={{ width: (displayStoragePct ?? 0) + '%' }}
                                        />
                                    </div>
                                </div>

                                {/* Power (Voltage/Current) */}
                                <div>
                                    <div className="flex items-center justify-between">
                                        <div>{'POWER'}</div>
                                        <div suppressHydrationWarning className="tabular-nums">
                                            {hydrated ? (
                                                powerInfo && (powerInfo.voltage !== undefined || powerInfo.current !== undefined)
                                                    ? `${powerInfo.voltage !== undefined ? powerInfo.voltage.toFixed(2) + 'V' : '—'}${powerInfo.current !== undefined ? ' ' + powerInfo.current.toFixed(2) + 'A' : ''}`
                                                    : '—'
                                            ) : '—'}
                                        </div>
                                    </div>
                                    {/* No battery bar when showing only external power */}
                                </div>
                            </div>
                        </div>

                        {/* Progress bars */}

                        <div className="absolute top-1/2 left-8 w-48 h-2 bg-gray-800/60 border border-cyan-400/40">
                            <div
                                className={`h-full bg-gradient-to-r from-cyan-400 to-emerald-400 ${shouldRenderAnimations ? 'animate-progress-fill' : ''}`}></div>
                        </div>

                        <div className="absolute top-1/2 right-8 w-32 h-2 bg-gray-800/60 border border-purple-400/40">
                            <div
                                className={`h-full bg-gradient-to-r from-purple-400 to-blue-400 ${shouldRenderAnimations ? 'animate-progress-fill-reverse' : ''}`}></div>
                        </div>
                    </div>

                    {/* Wave Interference Patterns */}
                    <div
                        className={`absolute inset-0 opacity-20 ${shouldRenderAnimations ? 'animate-wave-interference' : ''}`}>
                        <div className="absolute top-1/4 left-1/4 w-32 h-32 border-2 border-cyan-400/40 rounded-full">
                            <div
                                className={`absolute top-0 left-0 w-4 h-4 bg-cyan-400 rounded-full ${shouldRenderAnimations ? 'animate-pulse' : ''}`}></div>
                        </div>
                        <div
                            className="absolute top-3/4 right-1/4 w-24 h-24 border-2 border-emerald-400/40 rounded-full">
                            <div
                                className={`absolute top-0 right-0 w-4 h-4 bg-emerald-400 rounded-full ${shouldRenderAnimations ? 'animate-pulse' : ''}`}></div>
                        </div>
                        <div
                            className="absolute bottom-1/4 left-1/2 w-40 h-40 border-2 border-purple-400/40 rounded-full">
                            <div
                                className={`absolute top-0 left-1/2 w-4 h-4 bg-purple-400 rounded-full ${shouldRenderAnimations ? 'animate-pulse' : ''}`}></div>
                        </div>
                    </div>

                    {/* Corner HUD Elements */}
                    <div
                        className={`absolute top-4 left-4 w-20 h-20 border-l-2 border-t-2 border-cyan-400/60 ${shouldRenderAnimations ? 'animate-hud-pulse' : ''}`}>
                        <div
                            className={`absolute -top-1 -left-1 w-2 h-2 bg-cyan-400 ${shouldRenderAnimations ? 'animate-ping' : ''}`}></div>
                        <div className="absolute top-2 left-2 text-xs font-mono text-cyan-400/80">SYS</div>
                    </div>

                    <div
                        className={`absolute top-4 right-4 w-20 h-20 border-r-2 border-t-2 border-emerald-400/60 ${shouldRenderAnimations ? 'animate-hud-pulse-delayed' : ''}`}>
                        <div
                            className={`absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 ${shouldRenderAnimations ? 'animate-ping' : ''}`}></div>
                        <div className="absolute top-2 right-2 text-xs font-mono text-emerald-400/80">AI</div>
                    </div>

                    <div
                        className={`absolute bottom-4 left-4 w-20 h-20 border-l-2 border-b-2 border-purple-400/60 ${shouldRenderAnimations ? 'animate-hud-pulse' : ''}`}>
                        <div
                            className={`absolute -bottom-1 -left-1 w-2 h-2 bg-purple-400 ${shouldRenderAnimations ? 'animate-ping' : ''}`}></div>
                        <div className="absolute bottom-2 left-2 text-xs font-mono text-purple-400/80">NET</div>
                    </div>

                    <div
                        className={`absolute bottom-4 right-4 w-20 h-20 border-r-2 border-b-2 border-blue-400/60 ${shouldRenderAnimations ? 'animate-hud-pulse-delayed' : ''}`}>
                        <div
                            className={`absolute -bottom-1 -right-1 w-2 h-2 bg-blue-400 ${shouldRenderAnimations ? 'animate-ping' : ''}`}></div>
                        <div className="absolute bottom-2 right-2 text-xs font-mono text-blue-400/80">OS</div>
                    </div>
                </div>
            )}

            <div className="fixed top-4 right-4 z-50">
                <FullscreenToggle autoFullscreen={true}/>
            </div>

            {/* Main Video Display */}
            <div
                className="relative z-10 min-h-screen flex items-center justify-center lg:px-80"
                onClick={() => {
                    if (!userInteracted && videoRef.current) {
                        setUserInteracted(true);
                        videoRef.current.muted = false;
                        console.log('✅ User interaction detected, unmuting video');
                    }
                }}
            >
                {/* Hidden video element - always present for ref access */}
                <video
                    width="1920"
                    height="1080"
                    ref={videoRef}
                    className={`w-full h-full object-contain ${currentVideo ? 'block' : 'hidden'}`}
                    autoPlay={true}
                    muted={false}
                    playsInline
                    disablePictureInPicture
                    disableRemotePlayback
                    style={{
                        transform: 'translateZ(0)',
                        WebkitTransform: 'translateZ(0)',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        willChange: 'transform',
                        imageRendering: 'auto',
                        imageResolution: 'from-image',
                        filter: 'none',
                        WebkitFilter: 'none'
                    }}
                    onPlay={() => {
                        setIsPlaying(true);
                        setAnimationsEnabled(false);
                    }}
                    onPause={() => setIsPlaying(false)}
                    onEnded={async () => {
                        // Locally reset state
                        setIsPlaying(false);
                        setAnimationsEnabled(true);
                        setCurrentVideo(null);
                        setProductName('');
                        // Notify controller/system to sync state
                        try {
                            await fetch('/api/video-control', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'stop' })
                            });
                        } catch (e) {
                            console.error('Failed to notify stop on video end', e);
                        }
                    }}
                >
                    {currentVideo && <source src={currentVideo} type="video/mp4"/>}
                </video>

                {/* Sound Unmute Prompt - Only shown when video is muted and user hasn't interacted */}
                {isPlaying && videoRef.current?.muted && !userInteracted && (
                    <motion.div
                        initial={{opacity: 0, y: 20}}
                        animate={{opacity: 1, y: 0}}
                        transition={{duration: 0.3}}
                        className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-30"
                        style={{
                            willChange: 'transform, opacity',
                            backfaceVisibility: 'hidden'
                        }}
                    >
                        <div
                            className="bg-black/80 backdrop-blur-md border border-yellow-500/50 rounded-lg px-6 py-3 flex items-center space-x-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400"
                                 viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd"
                                      d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
                                      clipRule="evenodd"/>
                            </svg>
                            <div className="text-yellow-400 text-sm font-medium">Click anywhere for sound</div>
                        </div>
                    </motion.div>
                )}

                {isPlaying && (
                    <motion.div
                        initial={{opacity: 0, y: 12}}
                        animate={{opacity: 1, y: 0}}
                        transition={{duration: 0.25}}
                        className="pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2"
                        aria-live="polite"
                    >
                        <div className="flex max-w-[90vw] flex-wrap items-center justify-center gap-2 rounded-full border border-white/15 bg-black/65 px-4 py-2 text-center text-xs text-white/90 shadow-lg backdrop-blur-sm sm:text-sm">
                            <span className="font-semibold text-cyan-200">Voice controls</span>
                            <span className="text-white/50">·</span>
                            <span>Say “Hey Repos, pause video” or “Hey Repos, stop video”</span>
                        </div>
                    </motion.div>
                )}

                {!isPlaying && <AnimatePresence mode="wait">
                    {currentVideo ? (
                        <motion.div
                            key={currentVideo}
                            initial={{opacity: 0, scale: 0.9}}
                            animate={{opacity: 1, scale: 1}}
                            exit={{opacity: 0, scale: 0.9}}
                            transition={{
                                duration: 0.3, // Reduced from 0.5 for better performance
                                ease: "easeOut",
                                // Disable animations when not needed
                                transitionEnd: {
                                    display: isPlaying ? 'none' : 'flex'
                                }
                            }}
                            className="absolute inset-0 flex flex-col items-center justify-center"
                            style={{
                                willChange: 'transform, opacity',
                                backfaceVisibility: 'hidden'
                            }}
                        >
                            {/* Product Title */}
                            {productName && (
                                <motion.div
                                    initial={{opacity: 0, y: -20}}
                                    animate={{opacity: 1, y: 0}}
                                    transition={{duration: 0.2}} // Faster transition
                                    className="absolute top-8 left-1/2 transform -translate-x-1/2 z-20"
                                    style={{
                                        willChange: 'transform, opacity',
                                        backfaceVisibility: 'hidden'
                                    }}
                                >
                                    <div
                                        className="bg-black/60 backdrop-blur-md border border-cyan-500/30 rounded-lg px-6 py-3">
                                        <h2 className="text-2xl font-bold text-cyan-400 text-center">
                                            {productName}
                                        </h2>
                                        <p className="text-cyan-300/70 text-sm text-center mt-1">
                                            Product Demonstration
                                        </p>
                                    </div>
                                </motion.div>
                            )}

                            {/* Playing Indicator */}
                            {isPlaying && (
                                <motion.div
                                    initial={{opacity: 0}}
                                    animate={{opacity: 1}}
                                    transition={{duration: 0.2}} // Faster transition
                                    className="absolute bottom-8 right-8 z-20"
                                    style={{
                                        willChange: 'opacity',
                                        backfaceVisibility: 'hidden'
                                    }}
                                >
                                    <div
                                        className="flex items-center space-x-2 bg-black/60 backdrop-blur-md border border-green-500/30 rounded-full px-4 py-2">
                                        <div
                                            className={`w-3 h-3 bg-green-400 rounded-full ${shouldRenderAnimations ? 'animate-pulse' : ''}`}/>
                                        <div className="text-green-400 text-sm font-medium">PLAYING</div>
                                    </div>
                                </motion.div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{opacity: 0}}
                            animate={{opacity: 1}}
                            exit={{opacity: 0}}
                            transition={{duration: 0.2}} // Faster transition
                            className="w-full max-w-3xl text-center"
                            style={{
                                willChange: 'opacity',
                                backfaceVisibility: 'hidden'
                            }}
                        >
                            <div
                                className="w-32 h-32 border-4 border-cyan-400/30 rounded-full mx-auto mb-8 flex items-center justify-center">
                                <div
                                    className="w-16 h-16 border-2 border-cyan-400 rounded-full flex items-center justify-center">
                                    <div
                                        className={`w-6 h-6 bg-cyan-400 rounded-full ${shouldRenderAnimations ? 'animate-pulse' : ''}`}/>
                                </div>
                            </div>
                            <h2 className="text-3xl text-cyan-400 font-bold mb-4">Welcome to REPOS AI</h2>
                            <p className="text-cyan-300/70 text-lg mb-4">
                                {isConnected ? 'Experience Future of Fueling' : 'Connecting to main device...'}
                            </p>

                            <div className="mx-auto mt-4 grid w-full max-w-3xl grid-cols-1 gap-4 px-6 text-left xl:grid-cols-2">
                                <div className="rounded-none border border-cyan-200/15 bg-slate-900/55 px-5 py-4 font-mono backdrop-blur-md">
                                    <div className="mb-1 flex items-center gap-3">
                                        <span className="flex h-8 w-8 items-center justify-center border border-cyan-200/15 bg-cyan-300/10 text-cyan-200" aria-hidden="true">
                                            <Hand className="h-4 w-4 -rotate-12" strokeWidth={1.7} />
                                        </span>
                                        <h3 className="text-sm font-bold text-cyan-400">Point to explore</h3>
                                    </div>
                                    <p className="pl-[52px] text-sm leading-relaxed text-cyan-300/80">
                                        Point at any board to select it. Repos will identify the board, switch the conversation to it, and give you a short introduction. Point to another board anytime to switch.
                                    </p>
                                </div>
                                <div className="rounded-none border border-cyan-200/15 bg-slate-900/55 px-5 py-4 font-mono backdrop-blur-md">
                                    <div className="mb-1 flex items-center gap-3">
                                        <span className="flex h-8 w-8 items-center justify-center border border-cyan-200/15 bg-cyan-300/10 text-cyan-200" aria-hidden="true">
                                            <Mic className="h-4 w-4" strokeWidth={1.7} />
                                        </span>
                                        <h3 className="text-sm font-bold text-cyan-400">Ask by voice</h3>
                                    </div>
                                    <p className="pl-[52px] text-sm leading-relaxed text-cyan-300/80">
                                        Ask about the selected board, then follow up naturally. For example: <span className="text-cyan-200">“What does this board do?”</span>
                                    </p>
                                </div>
                                <div className="rounded-none border border-cyan-200/15 bg-slate-900/55 px-5 py-4 font-mono backdrop-blur-md xl:col-span-2 xl:w-1/2 xl:justify-self-center">
                                    <div className="mb-1 flex items-center gap-3">
                                        <span className="flex h-8 w-8 items-center justify-center border border-cyan-200/15 bg-cyan-300/10 text-cyan-200" aria-hidden="true">
                                            <Play className="ml-0.5 h-4 w-4" strokeWidth={1.7} />
                                        </span>
                                        <h3 className="text-sm font-bold text-cyan-400">Watch a demo</h3>
                                    </div>
                                    <p className="pl-[52px] text-sm leading-relaxed text-cyan-300/80">
                                        Swipe up on the selected board in the showcase, or ask Repos to play its demo video. It will play on this screen.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-8 flex items-center justify-center space-x-2">
                                <div
                                    className={`w-2 h-2 bg-cyan-400 rounded-full ${shouldRenderAnimations ? 'animate-ping' : ''}`}/>
                                <div
                                    className={`w-2 h-2 bg-cyan-400 rounded-full ${shouldRenderAnimations ? 'animate-ping' : ''}`}
                                    style={{animationDelay: '0.2s'}}/>
                                <div
                                    className={`w-2 h-2 bg-cyan-400 rounded-full ${shouldRenderAnimations ? 'animate-ping' : ''}`}
                                    style={{animationDelay: '0.4s'}}/>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>}
            </div>
        </div>
    );
}
