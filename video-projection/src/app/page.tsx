'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import ProductCarousel from '@/components/ProductCarousel';
import LoadingSpinner from '@/components/LoadingSpinner';
import InstallPrompt from '@/components/ui/InstallPrompt';
import FullscreenToggle from '@/components/ui/FullscreenToggle';
import { useSearchParams } from 'next/navigation';

function ExperienceCenterContent() {
  const search = useSearchParams();
  const [hydrated, setHydrated] = useState(false);
  const disableWebGL = useMemo(() => search?.get('nowebgl') === '1', [search]);

  useEffect(() => {
    setHydrated(true);
    let interval: any;
    const check = () => {
      try {
        const canvas = document.createElement('canvas');
        const gl2 = canvas.getContext('webgl2');
        const gl1 = gl2 || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        const ok = !!gl1;
        if (ok && interval) {
          clearInterval(interval);
          interval = null;
        }
      } catch {
      }
    };
    // Initial check
    check();
    // Retry every 2s up to 60s; if still not available, keep loader (user requested no disabled message)
    const start = Date.now();
    interval = setInterval(() => {
      if (Date.now() - start > 60000) {
        // stop retrying but keep loader to avoid jarring message
        clearInterval(interval);
        interval = null;
        return;
      }
      check();
    }, 2000);
    return () => { if (interval) clearInterval(interval); };
  }, [disableWebGL]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-black to-purple-900 relative overflow-hidden">
      {/* Tech Product Showcase Background */}
      <div className="absolute inset-0">
        {/* Animated gradient background with product showcase feel */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-800">
          {/* Defer scan-line layer to post-hydration to avoid SSR/CSR class mismatch */}
          {hydrated && (
            <div className="absolute inset-0 bg-gradient-to-t from-transparent via-blue-500/10 to-transparent animate-scan-line"></div>
          )}
          {/* Additional light layers */}
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-blue-500/5"></div>
          <div className="absolute inset-0 bg-radial-gradient from-indigo-500/8 via-transparent to-transparent"></div>
        </div>
        
        {/* Product Data Flow Network */}
        <div className="absolute inset-0 opacity-25">
          {/* Horizontal product data streams */}
          <div className="absolute top-1/6 left-0 w-full h-0.5 bg-blue-400/60 animate-circuit-flow">
            <div className="absolute top-0 left-1/4 w-3 h-3 bg-blue-400 rounded-full animate-data-pulse">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-xs font-mono text-blue-400/80">PROD</div>
            </div>
            <div className="absolute top-0 left-2/3 w-2 h-2 bg-cyan-400 rounded-full animate-data-pulse-delayed">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-xs font-mono text-cyan-400/80">DATA</div>
            </div>
          </div>
          
          <div className="absolute top-2/6 left-0 w-full h-0.5 bg-cyan-400/60 animate-circuit-flow-reverse">
            <div className="absolute top-0 right-1/4 w-3 h-3 bg-cyan-400 rounded-full animate-data-pulse">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-xs font-mono text-cyan-400/80">SYNC</div>
            </div>
            <div className="absolute top-0 right-2/3 w-2 h-2 bg-indigo-400 rounded-full animate-data-pulse-delayed">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-xs font-mono text-indigo-400/80">API</div>
            </div>
          </div>
          
          <div className="absolute top-4/6 left-0 w-full h-0.5 bg-indigo-400/60 animate-circuit-flow">
            <div className="absolute top-0 left-1/3 w-3 h-3 bg-indigo-400 rounded-full animate-data-pulse">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-xs font-mono text-indigo-400/80">TECH</div>
            </div>
            <div className="absolute top-0 right-1/3 w-2 h-2 bg-purple-400 rounded-full animate-data-pulse-delayed">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-xs font-mono text-purple-400/80">EXPO</div>
            </div>
          </div>
          
          {/* Vertical showcase connections */}
          <div className="absolute top-0 left-1/5 w-0.5 h-full bg-blue-400/60 animate-circuit-flow-vertical">
            <div className="absolute left-0 top-1/3 w-3 h-3 bg-blue-400 rounded-full animate-data-pulse"></div>
            <div className="absolute left-0 top-2/3 w-2 h-2 bg-cyan-400 rounded-full animate-data-pulse-delayed"></div>
          </div>
          
          <div className="absolute top-0 right-1/5 w-0.5 h-full bg-indigo-400/60 animate-circuit-flow-vertical-reverse">
            <div className="absolute left-0 top-1/4 w-3 h-3 bg-indigo-400 rounded-full animate-data-pulse"></div>
            <div className="absolute left-0 top-3/4 w-2 h-2 bg-purple-400 rounded-full animate-data-pulse-delayed"></div>
          </div>
        </div>
        
        {/* Product Information Streams */}
        <div className="absolute inset-0">
          {/* Product specs and data */}
          <div className="absolute top-12 left-8 text-blue-400/40 font-mono text-xs animate-code-stream">
            PRODUCT_ID: 0x2024 | STATUS: ACTIVE | CATEGORY: TECH
          </div>
          <div className="absolute top-20 right-8 text-cyan-400/40 font-mono text-xs animate-code-stream-delayed">
            SHOWCASE_MODE: ENABLED | DISPLAY: 4K | REFRESH: 60Hz
          </div>
          <div className="absolute bottom-20 left-8 text-indigo-400/40 font-mono text-xs animate-code-stream">
            NETWORK: CONNECTED | LATENCY: 12ms | BANDWIDTH: HIGH
          </div>
          
          {/* Product metadata */}
          <div className="absolute top-1/3 left-6 text-blue-400/30 font-mono text-xs animate-hex-stream">
            SKU: A1B2C3 | PRICE: $999 | STOCK: 42
          </div>
          <div className="absolute bottom-1/3 right-6 text-indigo-400/30 font-mono text-xs animate-hex-stream-delayed">
            RATING: 4.8★ | REVIEWS: 1.2K | TRENDING: ↗
          </div>
        </div>
        
        {/* Product Showcase Interface Elements */}
        <div className="absolute inset-0">
          {/* Product catalog terminal */}
          <div className="absolute top-16 left-16 w-40 h-24 border border-blue-400/40 bg-black/60 animate-terminal-blink">
            <div className="p-2 text-xs font-mono text-blue-400/60">
              <div className="animate-typing">$ catalog.load()</div>
              <div className="animate-typing-delayed">Products: 42</div>
              <div className="animate-typing">Categories: 8</div>
            </div>
          </div>
          
          <div className="absolute bottom-16 right-16 w-44 h-28 border border-cyan-400/40 bg-black/60 animate-terminal-blink-delayed">
            <div className="p-2 text-xs font-mono text-cyan-400/60">
              <div className="animate-typing">EXPO_STATUS: LIVE</div>
              <div className="animate-typing-delayed">VISITORS: 2.4K</div>
              <div className="animate-typing">ENGAGEMENT: 94%</div>
              <div className="animate-typing-delayed">SHOWCASE: READY</div>
            </div>
          </div>
          
          {/* Product analytics bars */}
          <div className="absolute top-1/2 left-12 w-56 h-2 bg-gray-800/60 border border-blue-400/40 animate-progress-glow">
            <div className="h-full bg-gradient-to-r from-blue-400 to-cyan-400 animate-progress-fill"></div>
            <div className="absolute -top-6 left-0 text-xs font-mono text-blue-400/80">Product Views</div>
          </div>
          
          <div className="absolute top-1/2 right-12 w-40 h-2 bg-gray-800/60 border border-indigo-400/40 animate-progress-glow-delayed">
            <div className="h-full bg-gradient-to-r from-indigo-400 to-purple-400 animate-progress-fill-reverse"></div>
            <div className="absolute -top-6 right-0 text-xs font-mono text-indigo-400/80">Engagement</div>
          </div>
        </div>
        
        {/* Product Spotlight Waves */}
        <div className="absolute inset-0 opacity-15">
          <div className="absolute top-1/3 left-1/3 w-40 h-40 border-2 border-blue-400/40 rounded-full animate-wave-expand"></div>
          <div className="absolute top-2/3 right-1/3 w-32 h-32 border-2 border-cyan-400/40 rounded-full animate-wave-expand-delayed"></div>
          <div className="absolute bottom-1/3 left-1/2 w-48 h-48 border-2 border-indigo-400/40 rounded-full animate-wave-expand"></div>
          
          {/* Product focus indicators */}
          <div className="absolute top-1/4 right-1/4 w-6 h-6 border border-blue-400/60 animate-ping"></div>
          <div className="absolute bottom-1/4 left-1/4 w-4 h-4 border border-cyan-400/60 animate-ping"></div>
        </div>
        
        {/* Showcase HUD Elements */}
        <div className="absolute top-6 left-6 w-24 h-24 border-l-2 border-t-2 border-blue-400/60 animate-hud-pulse">
          <div className="absolute -top-1 -left-1 w-2 h-2 bg-blue-400 animate-ping"></div>
          <div className="absolute top-2 left-2 text-xs font-mono text-blue-400/80">EXPO</div>
          <div className="absolute top-6 left-2 text-xs font-mono text-blue-400/60">LIVE</div>
        </div>
        
        <div className="absolute top-6 right-6 w-24 h-24 border-r-2 border-t-2 border-cyan-400/60 animate-hud-pulse-delayed">
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-400 animate-ping"></div>
          <div className="absolute top-2 right-2 text-xs font-mono text-cyan-400/80">TECH</div>
          <div className="absolute top-6 right-2 text-xs font-mono text-cyan-400/60">SHOW</div>
        </div>
        
        <div className="absolute bottom-6 left-6 w-24 h-24 border-l-2 border-b-2 border-indigo-400/60 animate-hud-pulse">
          <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-indigo-400 animate-ping"></div>
          <div className="absolute bottom-6 left-2 text-xs font-mono text-indigo-400/80">PROD</div>
          <div className="absolute bottom-2 left-2 text-xs font-mono text-indigo-400/60">CAST</div>
        </div>
        
        <div className="absolute bottom-6 right-6 w-24 h-24 border-r-2 border-b-2 border-purple-400/60 animate-hud-pulse-delayed">
          <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-purple-400 animate-ping"></div>
          <div className="absolute bottom-6 right-2 text-xs font-mono text-purple-400/80">DEMO</div>
          <div className="absolute bottom-2 right-2 text-xs font-mono text-purple-400/60">MODE</div>
        </div>
      </div>
      
      {/* PWA Install Prompt */}
      <InstallPrompt />
      
      {/* Fullscreen Toggle (for manual fullscreen control) */}
      <div className="fixed top-4 right-4 z-50">
        <FullscreenToggle />
      </div>

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="p-6 text-center">
          <motion.h1 
            className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent"
            initial={{ opacity: 0, y: 50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ 
              duration: 1.2, 
              ease: "easeOut",
              type: "spring",
              stiffness: 100
            }}
          >
            Future Of Fuelling Center
          </motion.h1>
          <motion.p 
            className="text-cyan-300 mt-2 text-lg tracking-wider"
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ 
              duration: 1, 
              delay: 0.3,
              ease: "easeOut",
              type: "spring",
              stiffness: 120
            }}
          >
            Explore Our 3D Product Collection
          </motion.p>
        </header>

        {/* Product Carousel */}
        <div className="flex-1 flex items-center justify-center">
            <Suspense fallback={<LoadingSpinner />}>
              <ProductCarousel />
            </Suspense>
        </div>

        {/* Instructions */}
        <footer className="p-6 text-center">
          <div className="text-cyan-400 text-sm space-y-1">
            <motion.p
              initial={{ opacity: 0, y: 40, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ 
                duration: 1, 
                delay: 0.6,
                ease: "easeOut",
                type: "spring",
                stiffness: 100
              }}
            >
              Swipe left/right to rotate • Long press for details • Swipe up to center for video
            </motion.p>
            <motion.div 
              className="flex justify-center space-x-4 mt-2"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                duration: 0.8, 
                delay: 0.9,
                ease: "easeOut"
              }}
            >
              <motion.span 
                className="px-3 py-1 bg-cyan-500/20 rounded-full border border-cyan-500/30"
                initial={{ opacity: 0, scale: 0.5, rotateY: -90 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                transition={{ 
                  duration: 0.6, 
                  delay: 1.1,
                  ease: "backOut"
                }}
              >
                ← → Rotate
              </motion.span>
              <motion.span 
                className="px-3 py-1 bg-purple-500/20 rounded-full border border-purple-500/30"
                initial={{ opacity: 0, scale: 0.5, rotateY: -90 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                transition={{ 
                  duration: 0.6, 
                  delay: 1.3,
                  ease: "backOut"
                }}
              >
                Hold Details
              </motion.span>
              <motion.span 
                className="px-3 py-1 bg-blue-500/20 rounded-full border border-blue-500/30"
                initial={{ opacity: 0, scale: 0.5, rotateY: -90 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                transition={{ 
                  duration: 0.6, 
                  delay: 1.5,
                  ease: "backOut"
                }}
              >
                ↑ Video
              </motion.span>
            </motion.div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function ExperienceCenter() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ExperienceCenterContent />
    </Suspense>
  );
}
