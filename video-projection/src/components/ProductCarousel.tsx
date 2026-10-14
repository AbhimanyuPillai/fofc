'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AnimatePresence, motion } from 'framer-motion';
import { useGesture } from '@use-gesture/react';
import Product3D from './Product3D';
import ProductDetails from './ProductDetails';
import { soundSystem } from '@/utils/soundSystem';

// Dynamic products loaded from /api/products
type Product = {
    id: number;
    name: string;
    category: string;
    description: string;
    modelPath: string;
    videoUrl: string;
    images: string[];
    specs: string[];
};

// We'll fetch products client-side to keep in sync with the admin dashboard
// and avoid SSR/CSR mismatch issues for large JSON.
// Initial state is empty; UI will show a lightweight loader until data arrives.

export default function ProductCarousel() {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [products, setProducts] = useState<Product[]>([]);
    const [showDetails, setShowDetails] = useState(false);
    const [showVideoControls, setShowVideoControls] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRotating, setIsRotating] = useState(false);
    const [isClient, setIsClient] = useState(false);
    const [animationsEnabled, setAnimationsEnabled] = useState(false);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const productsRef = useRef<Product[]>([]);
    const pendingProductId = useRef<number | null>(null);
    const selectedIndexRef = useRef(0);

    useEffect(() => {
        selectedIndexRef.current = selectedIndex;
    }, [selectedIndex]);

    // Initialize audio context on component mount
    useEffect(() => {
        soundSystem.initializeAudio().catch(console.error);
        setIsClient(true); // Set client flag to true after mount
    }, []);

    // Load products dynamically from API
    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch('/api/products', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        setProducts(data);
                        setSelectedIndex(0);
                    }
                }
            } catch (e) {
                console.error('Failed to load products', e);
            }
        };
        load();
    }, []);

    // Resolve a product ID pushed by the pointing/agent bridge to the carousel.
    const selectProductById = useCallback((rawId: number | string) => {
        const productId = Number(rawId);
        if (!Number.isInteger(productId)) return;
        const index = productsRef.current.findIndex(product => Number(product.id) === productId);
        if (index < 0) {
            pendingProductId.current = productId;
            return;
        }

        pendingProductId.current = null;
        if (index === selectedIndexRef.current) return;
        selectedIndexRef.current = index;
        setSelectedIndex(index);
        setShowDetails(false);
        setShowVideoControls(false);
        setIsPlaying(false);
        setAnimationsEnabled(true);
        setIsRotating(true);
        window.setTimeout(() => setIsRotating(false), 300);
    }, []);

    useEffect(() => {
        productsRef.current = products;
        if (pendingProductId.current !== null) {
            selectProductById(pendingProductId.current);
        }
    }, [products, selectProductById]);

    // Ensure selectedIndex stays within bounds when products change
    useEffect(() => {
        const len = products.length;
        if (len === 0) {
            if (selectedIndex !== 0) setSelectedIndex(0);
            return;
        }
        if (selectedIndex >= len) {
            setSelectedIndex(len - 1);
        }
    }, [products.length]);

    // Keep controller UI in sync with TV page via WebSocket broadcast
    useEffect(() => {
        if (typeof window === 'undefined') return;

        let ws: WebSocket | null = null;
        let heartbeat: ReturnType<typeof setInterval> | null = null;

        const connect = () => {
            try {
                const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
                const wsUrl = `${protocol}://${window.location.host}/api/video-control/ws`;
                ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    // ping to keep alive (optional)
                    heartbeat = setInterval(() => {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'ping', t: Date.now() }));
                        }
                    }, 15000);
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);
                        const currentState = msg.type === 'connection' ? msg.currentState : msg;
                        if (currentState?.productId !== undefined && currentState?.productId !== null) {
                            selectProductById(currentState.productId);
                        }

                        if (msg.type === 'video-control') {
                            const action = msg.action as 'play' | 'pause' | 'stop' | 'seek' | 'restart';
                            switch (action) {
                                case 'play':
                                    setIsPlaying(true);
                                    setShowVideoControls(true);
                                    break;
                                case 'pause':
                                    setIsPlaying(false);
                                    break;
                                case 'stop':
                                    setIsPlaying(false);
                                    setShowVideoControls(false);
                                    setAnimationsEnabled(false);
                                    break;
                                case 'restart':
                                    setIsPlaying(true);
                                    setShowVideoControls(true);
                                    break;
                            }
                        }
                    } catch (e) {
                        // ignore parse errors
                    }
                };

                ws.onclose = () => {
                    if (heartbeat) {
                        clearInterval(heartbeat);
                        heartbeat = null;
                    }
                    // try to reconnect
                    setTimeout(connect, 1000);
                };

                ws.onerror = () => {
                    try { ws && ws.close(); } catch { }
                };
            } catch {
                setTimeout(connect, 1000);
            }
        };

        connect();

        return () => {
            if (heartbeat) clearInterval(heartbeat);
            if (ws) {
                try { ws.close(); } catch { }
                ws = null;
            }
        };
    }, [selectProductById]);

    const radius = 300;
    const angleStep = products.length > 0 ? (Math.PI * 2) / products.length : 0;

    // Calculate positions for circular layout
    const getProductPosition = useCallback((index: number, currentSelected: number) => {
        const adjustedIndex = index - currentSelected;
        const angle = adjustedIndex * angleStep;
        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;
        const y = Math.sin(angle * 0.5) * 20; // Slight vertical wave

        return { x, y, z, angle };
    }, [angleStep, radius]);

    // Gesture handling
    const bind = useGesture({
        onDrag: ({ movement: [mx], velocity: [vx], direction: [dx], down }) => {
            if (!down && Math.abs(mx) > 50) {
                const direction = dx > 0 ? 1 : -1;
                rotateCarousel(direction);
                sendVideoCommand('swap');
            }
        },
        onWheel: ({ delta: [, dy] }) => {
            if (Math.abs(dy) > 20) {
                const direction = dy > 0 ? 1 : -1;
                rotateCarousel(direction);
                sendVideoCommand('swap');
            }
        },
        onPointerDown: () => {
            // Start long press timer
            longPressTimer.current = setTimeout(() => {
                setShowDetails(true);
            }, 800);
        },
        onPointerUp: () => {
            // Clear long press timer
            if (longPressTimer.current) {
                clearTimeout(longPressTimer.current);
                longPressTimer.current = null;
            }
        }
    }, {
        drag: {
            threshold: 10,
            filterTaps: true
        },
        wheel: {
            threshold: 20
        }
    });

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Prevent default behavior for our custom keys
            const customKeys = ['d', 'a', 'w', 's', 'f', 'b', 'x', 'y'];
            if (customKeys.includes(event.key.toLowerCase())) {
                event.preventDefault();
            }
            switch (event.key.toLowerCase()) {
                case 'd': // Swap right
                    if (!isRotating) {
                        rotateCarousel(1);
                        // sendVideoCommand('swap');
                    }
                    break;
                case 'a': // Swap left
                    if (!isRotating) {
                        rotateCarousel(-1);
                        // sendVideoCommand('swap');
                    }
                    break;
                case 'w': // Play video (same as swipe up)
                    handleSwipeUp();
                    break;
                case 's': // Toggle details view
                    if (showVideoControls) {
                        soundSystem.play('stop');
                        setAnimationsEnabled(false);
                        sendVideoCommand('stop');
                        break;
                    }
                    !showDetails && soundSystem.play('close')
                    setShowDetails(prev => !prev);
                    break;
                case 'f': // Play video
                    if (showVideoControls) {
                        sendVideoCommand('pause');
                    }
                    break;
                case 'b': // Stop video
                    if (showVideoControls) {
                        soundSystem.play(isPlaying ? 'pause' : 'play');
                        sendVideoCommand('play');
                    }
                    break;
                case 'x': // Forward 30 seconds
                    if (showVideoControls) {
                        soundSystem.play('seek');
                        sendVideoCommand('seek', 30);
                    }
                    break;
                case 'y': // Backward 30 seconds
                    if (showVideoControls) {
                        soundSystem.play('seek');
                        sendVideoCommand('seek', -30);
                    }
                    break;
            }
        };

        // Add event listener
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', handleKeyDown);
        }

        // Cleanup
        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('keydown', handleKeyDown);
            }
        };
    }, [isRotating, showVideoControls, selectedIndex]); // Dependencies for the keyboard handler

    const rotateCarousel = (direction: number) => {
        if (isRotating && products.length === 0) return;
        let id = 0

        if (products.length === 0) {
            id = 0
        } else {
            id = (selectedIndex + direction + products.length) % products.length
        }

        soundSystem.play('swipe');
        selectedIndexRef.current = id;
        setIsRotating(true);
        setSelectedIndex(id);

        callProduct(id)
        // Increased duration for smoother animation
        setTimeout(() => setIsRotating(false), 300);
    };

    const callProduct = async (id: any) => {
        if (products.length === 0) return;
        const selectedProduct = products[id];
        // Send video command to TV display
        try {
            await soundSystem.play('swipeUP');
            setAnimationsEnabled(true);
            const response = await fetch('/api/video-control', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'swap',
                    videoUrl: selectedProduct.videoUrl,
                    productName: selectedProduct.name,
                    productId: selectedProduct.id
                })
            });

            if (response.ok) {
                console.log('only for LED command');
            } else {
                console.error('error for LED');
            }
        } catch (error) {
            console.error('Error sending LED command:', error);
        }
    }

    const handleSwipeUp = async () => {
        if (products.length === 0) return;
        const selectedProduct = products[selectedIndex];
        // Send video command to TV display
        try {
            await soundSystem.play('swipeUP');
            setAnimationsEnabled(true);
            const response = await fetch('/api/video-control', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'play',
                    videoUrl: selectedProduct.videoUrl,
                    productName: selectedProduct.name,
                    productId: selectedProduct.id
                })
            });

            if (response.ok) {
                console.log('Video command sent to TV display');
                setIsPlaying(true);
                setShowVideoControls(true);
            } else {
                console.error('Failed to send video command to TV');
            }
        } catch (error) {
            console.error('Error sending video command:', error);
        }
    };

    const sendVideoCommand = async (action: string, seekTime?: number) => {
        if (products.length === 0) return;
        const selectedProduct = products[selectedIndex];

        try {
            const response = await fetch('/api/video-control', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action,
                    videoUrl: selectedProduct.videoUrl,
                    productName: selectedProduct.name,
                    productId: selectedProduct.id,
                    seekTime: seekTime
                })
            });

            if (response.ok) {
                console.log(`Video ${action} command sent to TV display`);

                // Update local state based on action
                switch (action) {
                    case 'play':
                        setIsPlaying(true);
                        break;
                    case 'pause':
                        setIsPlaying(false);
                        break;
                    case 'stop':
                        setIsPlaying(false);
                        setShowVideoControls(false);
                        break;
                }
            } else {
                console.error(`Failed to send video ${action} command to TV`);
            }
        } catch (error) {
            console.error(`Error sending video ${action} command:`, error);
        }
    };

    return (
        <div className="relative w-full h-full">
            {/* 3D Carousel Container */}
            <div
                ref={containerRef}
                {...bind()}
                className="relative w-full h-[600px] cursor-grab active:cursor-grabbing touch-none select-none"
            >
                {isClient ? (
                    <Canvas
                        camera={{ position: [0, 30, 400], fov: 60 }}
                        className="w-full h-full"
                    >
                        <ambientLight intensity={0.4} />
                        <directionalLight position={[10, 10, 5]} intensity={1} />
                        <pointLight position={[0, 0, 0]} intensity={0.5} color="#00ffff" />

                        {products?.length > 0 && products?.map((product, index) => {
                            const position = getProductPosition(index, selectedIndex);
                            const isSelected = index === selectedIndex;

                            return (
                                <Product3D
                                    key={product?.id}
                                    product={product}
                                    animationsEnabled={animationsEnabled}
                                    position={[position.x, position.y, position.z]}
                                    rotation={[0, position.angle + Math.PI, 0]}
                                    isSelected={isSelected}
                                    onSwipeUp={handleSwipeUp}

                                    // Hover effect
                                    meshHoverScale={1.2}

                                    // Selection ring (you're already using these)
                                    selectionRingRadius={20}
                                    selectionRingThickness={0.25}
                                    selectionRingPosition={[0, -5.0, 0]}


                                    // Holographic base (you're already using these)
                                    // holographicBaseRadius={18}
                                    // holographicBaseHeight={0.8}
                                    // holographicBasePosition={[0, -4.1, 0]}

                                    // NEW: 3D Model size and position
                                    modelScale={5.0}                    // Make all models bigger
                                    selectedModelScale={5.0}            // Make selected model even bigger
                                    modelPosition={[0, 5, 0]}         // Move model up slightly
                                />
                            );
                        })}
                    </Canvas>
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br">
                        <div className="text-center">
                            <div
                                className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mx-auto mb-4"></div>
                            <p className="text-cyan-400 text-lg font-semibold">Initializing 3D Experience...</p>
                        </div>
                    </div>
                )}
                {/* Selection Indicator */}
                {products.length > 0 && (
                    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 ">
                        <div className="flex items-center space-x-4">
                            <motion.div
                                className="w-4 h-4 border-2 border-cyan-400 rounded-full"
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            />
                            <span className="text-cyan-400 text-sm font-medium">
                                SELECTED: {products[selectedIndex]?.name?.toUpperCase?.() || '—'}
                            </span>
                            <motion.div
                                className="w-4 h-4 border-2 border-cyan-400 rounded-full"
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ duration: 2, repeat: Infinity, delay: 1 }}
                            />
                        </div>
                    </div>
                )}

                {/* Navigation Hints with Enhanced Visual Feedback */}
                <div className="absolute top-1/2 left-4 transform -translate-y-1/2">
                    <motion.div
                        className="w-12 h-12 border-2 border-cyan-400/50 rounded-full flex items-center justify-center hover:border-cyan-400 transition-colors cursor-pointer"
                        whileHover={{ scale: 1.2, x: -5 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => rotateCarousel(-1)}
                        animate={{
                            x: isRotating ? [-5, 0] : 0,
                            borderColor: isRotating ? ['rgba(34, 211, 238, 0.5)', 'rgba(34, 211, 238, 1)', 'rgba(34, 211, 238, 0.5)'] : 'rgba(34, 211, 238, 0.5)'
                        }}
                        transition={{ duration: 0.8 }}
                    >
                        <motion.span
                            className="text-cyan-400 text-xl font-bold"
                            animate={{
                                x: isRotating ? [-3, 0] : 0
                            }}
                            transition={{ duration: 0.8 }}
                        >
                            ←
                        </motion.span>
                    </motion.div>
                    <div className="mt-2 text-xs text-cyan-400/60 text-center font-mono">PREV</div>
                </div>

                <div className="absolute top-1/2 right-4 transform -translate-y-1/2">
                    <motion.div
                        className="w-12 h-12 border-2 border-cyan-400/50 rounded-full flex items-center justify-center hover:border-cyan-400 transition-colors cursor-pointer"
                        whileHover={{ scale: 1.2, x: 5 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => rotateCarousel(1)}
                        animate={{
                            x: isRotating ? [5, 0] : 0,
                            borderColor: isRotating ? ['rgba(34, 211, 238, 0.5)', 'rgba(34, 211, 238, 1)', 'rgba(34, 211, 238, 0.5)'] : 'rgba(34, 211, 238, 0.5)'
                        }}
                        transition={{ duration: 0.8 }}
                    >
                        <motion.span
                            className="text-cyan-400 text-xl font-bold"
                            animate={{
                                x: isRotating ? [3, 0] : 0
                            }}
                            transition={{ duration: 0.8 }}
                        >
                            →
                        </motion.span>
                    </motion.div>
                    <div className="mt-2 text-xs text-cyan-400/60 text-center font-mono">NEXT</div>
                </div>

                {/* Translation Direction Indicator */}
                <AnimatePresence>
                    {isRotating && (
                        <motion.div
                            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div
                                className="flex items-center space-x-2 bg-black/60 border border-cyan-400/40 rounded-lg px-4 py-2">
                                <motion.div
                                    className="w-3 h-3 bg-cyan-400 rounded-full"
                                    animate={{ x: [-10, 10, -10] }}
                                    transition={{ duration: 0.8, repeat: 1 }}
                                />
                                <span className="text-cyan-400 text-sm font-mono">ROTATING</span>
                                <motion.div
                                    className="w-3 h-3 bg-cyan-400 rounded-full"
                                    animate={{ x: [10, -10, 10] }}
                                    transition={{ duration: 0.8, repeat: 1 }}
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Product Info Panel */}
                {products[selectedIndex] && (
                    <div
                        className="absolute top-4 left-4 bg-black/40 backdrop-blur-md border border-cyan-500/30 rounded-lg p-4 max-w-xs">
                        <h3 className="text-cyan-400 font-bold text-lg">{products[selectedIndex].name}</h3>
                        <p className="text-cyan-300 text-sm mt-1">{products[selectedIndex].category}</p>
                        <p className="text-gray-300 text-xs mt-2 line-clamp-3">{products[selectedIndex].description}</p>
                    </div>
                )}
            </div>

            {/* Product Details Modal */}
            <AnimatePresence>
                {showDetails && products[selectedIndex] && (
                    <ProductDetails
                        product={products[selectedIndex]}
                        onClose={() => {
                            setShowDetails(false)
                            soundSystem.play('close')
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Video Controls Panel */}
            <AnimatePresence>
                {showVideoControls && products[selectedIndex] && (
                    <motion.div
                        initial={{ opacity: 0, y: 100 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 100 }}
                        className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50"
                    >
                        <div
                            className="bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded-2xl p-6 min-w-[400px]">
                            {/* Video Info */}
                            <div className="text-center mb-4">
                                <h3 className="text-cyan-400 font-bold text-lg">{products[selectedIndex]?.name || ''}</h3>
                                <p className="text-cyan-300 text-sm">Playing on TV Display</p>
                            </div>

                            {/* Control Buttons */}
                            <div className="flex items-center justify-center space-x-4">
                                {/* Reverse 10s */}
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => {
                                        soundSystem.play('seek');
                                        sendVideoCommand('seek', -10);
                                    }}
                                    className="w-12 h-12 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-full flex items-center justify-center transition-colors"
                                >
                                    <span className="text-cyan-400 text-lg">⏪</span>
                                </motion.button>

                                {/* Play/Pause */}
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => {
                                        soundSystem.play(isPlaying ? 'pause' : 'play');
                                        sendVideoCommand(isPlaying ? 'pause' : 'play');
                                    }}
                                    className="w-16 h-16 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-full flex items-center justify-center transition-colors"
                                ><span className="text-cyan-400 text-2xl">{isPlaying ? '⏸️' : '▶️'}</span>
                                </motion.button>

                                {/* Forward 10s */}
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => {
                                        soundSystem.play('seek');
                                        sendVideoCommand('seek', 10);
                                    }}
                                    className="w-12 h-12 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 rounded-full flex items-center justify-center transition-colors"
                                >
                                    <span className="text-cyan-400 text-lg">⏩</span>
                                </motion.button>

                                {/* Stop/Close */}
                                <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => {
                                        soundSystem.play('stop');
                                        setAnimationsEnabled(false);
                                        sendVideoCommand('stop');
                                    }}
                                    className="w-12 h-12 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-full flex items-center justify-center transition-colors"
                                >
                                    <span className="text-red-400 text-lg">⏹️</span>
                                </motion.button>
                            </div>

                            {/* Additional Controls */}
                            <div
                                className="flex items-center justify-center space-x-6 mt-4 pt-4 border-t border-cyan-500/20">
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => {
                                        soundSystem.play('seek');
                                        sendVideoCommand('seek', -30);
                                    }}
                                    className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
                                >
                                    -30s
                                </motion.button>

                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => {
                                        soundSystem.play('activate');
                                        sendVideoCommand('restart');
                                    }}
                                    className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
                                >
                                    Restart
                                </motion.button>

                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => {
                                        soundSystem.play('seek');
                                        sendVideoCommand('seek', 30);
                                    }}
                                    className="text-cyan-400 hover:text-cyan-300 text-sm transition-colors"
                                >
                                    +30s
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
