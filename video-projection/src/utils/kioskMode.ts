/**
 * Kiosk Mode Utilities for PWA
 * Handles fullscreen mode, exit detection, and user guidance
 */

import { useState, useEffect } from 'react';

export class KioskModeManager {
  private isKioskMode: boolean = false;
  private exitHandlers: (() => void)[] = [];

  constructor() {
    this.initializeKioskMode();
    this.setupEventListeners();
  }

  private initializeKioskMode() {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') return;
    
    // Check if app is running in standalone mode (installed PWA)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        window.matchMedia('(display-mode: fullscreen)').matches ||
                        (window.navigator as any).standalone === true;

    if (isStandalone) {
      this.enableKioskMode();
    }
  }

  private setupEventListeners() {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this.handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', this.handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', this.handleFullscreenChange);

    // Listen for escape key
    document.addEventListener('keydown', this.handleKeyDown);

    // Prevent context menu in kiosk mode
    document.addEventListener('contextmenu', this.handleContextMenu);
  }

  private handleFullscreenChange = () => {
    const isFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );

    if (!isFullscreen && this.isKioskMode) {
      this.showExitNotification();
    }
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (this.isKioskMode) {
      // Allow Escape and F11 to exit fullscreen
      if (event.key === 'Escape' || event.key === 'F11') {
        this.showExitNotification();
        return;
      }

      // Prevent other system keys in kiosk mode
      if (event.altKey || event.ctrlKey || event.metaKey) {
        if (!['F5', 'F12'].includes(event.key)) { // Allow refresh and dev tools
          event.preventDefault();
        }
      }
    }
  };

  private handleContextMenu = (event: MouseEvent) => {
    if (this.isKioskMode) {
      event.preventDefault();
    }
  };

  public enableKioskMode() {
    this.isKioskMode = true;
    
    // Request fullscreen
    this.requestFullscreen();
    
    // Add kiosk mode styles
    document.body.classList.add('kiosk-mode');
    
    // Show kiosk mode notification
    this.showKioskModeNotification();
  }

  public disableKioskMode() {
    this.isKioskMode = false;
    
    // Exit fullscreen
    this.exitFullscreen();
    
    // Remove kiosk mode styles
    document.body.classList.remove('kiosk-mode');
  }

  private requestFullscreen() {
    // Check if we're in a browser environment
    if (typeof document === 'undefined') return;
    
    const element = document.documentElement;
    
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if ((element as any).webkitRequestFullscreen) {
      (element as any).webkitRequestFullscreen();
    } else if ((element as any).mozRequestFullScreen) {
      (element as any).mozRequestFullScreen();
    } else if ((element as any).msRequestFullscreen) {
      (element as any).msRequestFullscreen();
    }
  }

  private exitFullscreen() {
    // Check if we're in a browser environment
    if (typeof document === 'undefined') return;
    
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      (document as any).webkitExitFullscreen();
    } else if ((document as any).mozCancelFullScreen) {
      (document as any).mozCancelFullScreen();
    } else if ((document as any).msExitFullscreen) {
      (document as any).msExitFullscreen();
    }
  }

  private showKioskModeNotification() {
    // Check if we're in a browser environment
    if (typeof document === 'undefined') return;
    
    const notification = document.createElement('div');
    notification.className = 'kiosk-notification';
    notification.innerHTML = `
      <div class="kiosk-notification-content">
        <div class="kiosk-icon">🖥️</div>
        <div class="kiosk-text">
          <h3>Kiosk Mode Active</h3>
          <p>Press <kbd>Esc</kbd> or <kbd>F11</kbd> to exit fullscreen</p>
        </div>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }

  private showExitNotification() {
    // Check if we're in a browser environment
    if (typeof document === 'undefined') return;
    
    const notification = document.createElement('div');
    notification.className = 'exit-notification';
    notification.innerHTML = `
      <div class="exit-notification-content">
        <div class="exit-icon">ℹ️</div>
        <div class="exit-text">
          <h3>Exited Kiosk Mode</h3>
          <p>You can return to fullscreen anytime</p>
        </div>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);

    // Call exit handlers
    this.exitHandlers.forEach(handler => handler());
  }

  public onExit(handler: () => void) {
    this.exitHandlers.push(handler);
  }

  public isInKioskMode(): boolean {
    return this.isKioskMode;
  }

  public cleanup() {
    // Check if we're in a browser environment
    if (typeof document === 'undefined') return;
    
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', this.handleFullscreenChange);
    document.removeEventListener('mozfullscreenchange', this.handleFullscreenChange);
    document.removeEventListener('MSFullscreenChange', this.handleFullscreenChange);
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('contextmenu', this.handleContextMenu);
  }
}

// Hook for using kiosk mode manager in components
export function useKioskMode() {
  const [kioskManager, setKioskManager] = useState<KioskModeManager | null>(null);

  useEffect(() => {
    // Only create the manager on the client side
    if (typeof window !== 'undefined') {
      const manager = new KioskModeManager();
      setKioskManager(manager);
      
      return () => {
        manager.cleanup();
      };
    }
  }, []);

  return kioskManager;
}
