'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface FullscreenToggleProps {
  autoFullscreen?: boolean;
}

const FullscreenToggle: React.FC<FullscreenToggleProps> = ({ autoFullscreen = false }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoFullscreenAttempted, setAutoFullscreenAttempted] = useState(false);

  const requestFullscreen = async () => {
    try {
      const element = document.documentElement;
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if ((element as any).webkitRequestFullscreen) {
        await (element as any).webkitRequestFullscreen();
      } else if ((element as any).mozRequestFullScreen) {
        await (element as any).mozRequestFullScreen();
      } else if ((element as any).msRequestFullscreen) {
        await (element as any).msRequestFullscreen();
      }
      return true;
    } catch (error) {
      console.warn('Fullscreen request failed:', error);
      return false;
    }
  };

  const exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).mozCancelFullScreen) {
        await (document as any).mozCancelFullScreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
      return true;
    } catch (error) {
      console.warn('Exit fullscreen failed:', error);
      return false;
    }
  };

  useEffect(() => {
    const checkFullscreen = () => {
      const fullscreenElement = document.fullscreenElement ||
                               (document as any).webkitFullscreenElement ||
                               (document as any).mozFullScreenElement ||
                               (document as any).msFullscreenElement;
      setIsFullscreen(!!fullscreenElement);
    };

    // Check initial state
    checkFullscreen();

    // Listen for fullscreen changes - only on client side
    if (typeof window !== 'undefined' && document) {
      document.addEventListener('fullscreenchange', checkFullscreen);
      document.addEventListener('webkitfullscreenchange', checkFullscreen);
      document.addEventListener('mozfullscreenchange', checkFullscreen);
      document.addEventListener('MSFullscreenChange', checkFullscreen);
    }

    return () => {
      if (typeof window !== 'undefined' && document) {
        document.removeEventListener('fullscreenchange', checkFullscreen);
        document.removeEventListener('webkitfullscreenchange', checkFullscreen);
        document.removeEventListener('mozfullscreenchange', checkFullscreen);
        document.removeEventListener('MSFullscreenChange', checkFullscreen);
      }
    };
  }, []);

  // Auto fullscreen effect
  useEffect(() => {
    if (autoFullscreen && !autoFullscreenAttempted && !isFullscreen) {
      setAutoFullscreenAttempted(true);
      
      // Try immediate fullscreen (works in some contexts like Electron)
      requestFullscreen().then(success => {
        if (!success) {
          // If immediate fullscreen fails, set up click handler for user gesture
          const handleFirstClick = async () => {
            await requestFullscreen();
            if (typeof window !== 'undefined' && document) {
              document.removeEventListener('click', handleFirstClick);
              document.removeEventListener('keydown', handleFirstKeydown);
            }
          };

          const handleFirstKeydown = async (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'F11') {
              await requestFullscreen();
              if (typeof window !== 'undefined' && document) {
                document.removeEventListener('click', handleFirstClick);
                document.removeEventListener('keydown', handleFirstKeydown);
              }
            }
          };

          // Add event listeners for user gesture - only on client side
          if (typeof window !== 'undefined' && document) {
            document.addEventListener('click', handleFirstClick);
            document.addEventListener('keydown', handleFirstKeydown);
          }

          // Show a subtle notification
          console.log('Auto-fullscreen requires user interaction. Click anywhere or press Enter/Space/F11 to enter fullscreen.');
        }
      });
    }
  }, [autoFullscreen, autoFullscreenAttempted, isFullscreen]);

  const toggleFullscreen = async () => {
    if (!isFullscreen) {
      await requestFullscreen();
    } else {
      await exitFullscreen();
    }
  };

  // Don't show button in fullscreen mode or if auto fullscreen is enabled and we're not in fullscreen yet
  if (isFullscreen || (autoFullscreen && !autoFullscreenAttempted)) return null;

  return (
    <motion.button
      onClick={toggleFullscreen}
      className="fixed top-4 right-4 z-50 p-3 bg-slate-900/80 hover:bg-slate-800/90 backdrop-blur-lg border border-blue-500/30 rounded-lg shadow-lg transition-all duration-200 group"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen (F11)'}
    >
      {autoFullscreen && !isFullscreen && (
        <div className="absolute -top-12 -left-8 bg-slate-800/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          Click to enter fullscreen
        </div>
      )}
      {isFullscreen ? (
        // Exit fullscreen icon
        <svg 
          className="w-5 h-5 text-blue-400 group-hover:text-blue-300" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5" 
          />
        </svg>
      ) : (
        // Enter fullscreen icon
        <svg 
          className="w-5 h-5 text-blue-400 group-hover:text-blue-300" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M4 8V4m0 0h4M4 4l5.5 5.5M20 8V4m0 0h-4m4 0l-5.5 5.5M4 16v4m0 0h4m-4 0l5.5-5.5M20 16v4m0 0h-4m4 0l-5.5-5.5" 
          />
        </svg>
      )}
    </motion.button>
  );
};

export default FullscreenToggle;
