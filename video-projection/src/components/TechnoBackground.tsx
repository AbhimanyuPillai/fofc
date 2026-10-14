'use client';

import { useEffect, useRef } from 'react';
import { getCurrentPerformanceConfig } from '@/config/performance';

// Get performance configuration based on system capabilities
const PERF_CONFIG = getCurrentPerformanceConfig();
const ANIMATION_THROTTLE = PERF_CONFIG.CANVAS.FRAME_THROTTLE;

export default function TechnoBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Particle system
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      opacity: number;
      color: string;
    }> = [];

    // Dynamic particle count based on system performance
    for (let i = 0; i < PERF_CONFIG.RENDERING.MAX_PARTICLES; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.2,
        color: Math.random() > 0.5 ? '#00ffff' : '#0080ff'
      });
    }

    // Circuit lines
    const circuitLines: Array<{
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      progress: number;
      speed: number;
    }> = [];

    // Reduce circuit lines for better performance
    for (let i = 0; i < PERF_CONFIG.RENDERING.MAX_CIRCUIT_LINES; i++) {
      circuitLines.push({
        x1: Math.random() * canvas.width,
        y1: Math.random() * canvas.height,
        x2: Math.random() * canvas.width,
        y2: Math.random() * canvas.height,
        progress: 0,
        speed: Math.random() * 0.01 + 0.005
      });
    }

    let lastFrameTime = 0;
    const animate = (currentTime: number) => {
      // Throttle to 30fps for better performance
      if (currentTime - lastFrameTime < ANIMATION_THROTTLE) {
        requestAnimationFrame(animate);
        return;
      }
      lastFrameTime = currentTime;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Optimize grid drawing with reduced density
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      const gridSize = PERF_CONFIG.RENDERING.GRID_SIZE; // Dynamic grid size
      
      // Use single path for all grid lines
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
      }
      ctx.stroke();

      // Draw and update particles
      particles.forEach(particle => {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

        ctx.fillStyle = particle.color;
        ctx.globalAlpha = particle.opacity;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw circuit lines
      circuitLines.forEach(line => {
        line.progress += line.speed;
        if (line.progress > 1) {
          line.progress = 0;
          line.x1 = Math.random() * canvas.width;
          line.y1 = Math.random() * canvas.height;
          line.x2 = Math.random() * canvas.width;
          line.y2 = Math.random() * canvas.height;
        }

        const currentX = line.x1 + (line.x2 - line.x1) * line.progress;
        const currentY = line.y1 + (line.y2 - line.y1) * line.progress;

        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();

        // Glow effect
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      ctx.globalAlpha = 1;
      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 1 }}
      />
      
      {/* Static background elements */}
      <div className="absolute inset-0" style={{ zIndex: 2 }}>
        {/* Corner brackets */}
        <div className="absolute top-4 left-4 w-16 h-16 border-l-2 border-t-2 border-cyan-400 opacity-60"></div>
        <div className="absolute top-4 right-4 w-16 h-16 border-r-2 border-t-2 border-cyan-400 opacity-60"></div>
        <div className="absolute bottom-4 left-4 w-16 h-16 border-l-2 border-b-2 border-cyan-400 opacity-60"></div>
        <div className="absolute bottom-4 right-4 w-16 h-16 border-r-2 border-b-2 border-cyan-400 opacity-60"></div>

        {/* Central glow */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/10 rounded-full blur-2xl"></div>
      </div>
    </>
  );
}
