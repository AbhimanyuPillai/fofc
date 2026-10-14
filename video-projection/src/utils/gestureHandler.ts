import { soundSystem } from './soundSystem';

export interface GestureConfig {
  onSwipeLeft: (velocity?: number) => void;
  onSwipeRight: (velocity?: number) => void;
  onSwipeUp: () => void;
  onLongPress: () => void;
  onHover: () => void;
  onWheel?: (deltaX: number, deltaY: number) => void;
  swipeThreshold?: number;
  longPressDelay?: number;
}

export class IronManGestureHandler {
  private config: GestureConfig;
  private longPressTimer: NodeJS.Timeout | null = null;
  private startX: number = 0;
  private startY: number = 0;
  private startTime: number = 0;
  private isDragging: boolean = false;
  private isMouseDown: boolean = false;
  private velocityX: number = 0;
  private velocityY: number = 0;
  private lastMoveTime: number = 0;
  private lastX: number = 0;
  private lastY: number = 0;
  private element: HTMLElement | null = null;

  constructor(config: GestureConfig) {
    this.config = {
      swipeThreshold: 20, // Reduced for better responsiveness
      longPressDelay: 500, // Reduced for better mobile experience
      ...config
    };
  }

  private calculateVelocity = (currentX: number, currentY: number, currentTime: number) => {
    const timeDiff = currentTime - this.lastMoveTime;
    if (timeDiff > 0 && timeDiff < 100) { // Only calculate velocity for recent moves
      this.velocityX = (currentX - this.lastX) / timeDiff;
      this.velocityY = (currentY - this.lastY) / timeDiff;
    }
    this.lastX = currentX;
    this.lastY = currentY;
    this.lastMoveTime = currentTime;
  };

  public attachToElement = (element: HTMLElement) => {
    // Remove any existing listeners first
    this.cleanup();

    // Touch events
    element.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    element.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    element.addEventListener('touchend', this.handleTouchEnd, { passive: false });

    // Mouse events
    element.addEventListener('mousedown', this.handleMouseDown, { passive: false });
    element.addEventListener('mousemove', this.handleMouseMove, { passive: true });
    element.addEventListener('mouseup', this.handleMouseUp, { passive: false });
    element.addEventListener('mouseleave', this.handleMouseUp, { passive: false }); // Prevent stuck drag state

    // Wheel events
    element.addEventListener('wheel', this.handleWheel, { passive: false });

    // Hover events
    element.addEventListener('mouseenter', this.config.onHover, { passive: true });

    // Store element reference for cleanup
    this.element = element;
  };

  public handleTouchStart = (e: TouchEvent | React.TouchEvent) => {
    const touch = 'touches' in e ? e.touches[0] : e;
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.startTime = Date.now();
    this.lastX = touch.clientX;
    this.lastY = touch.clientY;
    this.lastMoveTime = this.startTime;
    this.isDragging = false;
    this.velocityX = 0;
    this.velocityY = 0;

    // Start long press timer
    this.longPressTimer = setTimeout(() => {
      if (!this.isDragging) {
        soundSystem.play('activate');
        this.config.onLongPress();
      }
    }, this.config.longPressDelay);
  };

  public handleTouchMove = (e: TouchEvent | React.TouchEvent) => {
    const touch = 'touches' in e ? e.touches[0] : e;
    const currentTime = Date.now();
    
    this.calculateVelocity(touch.clientX, touch.clientY, currentTime);
    
    const deltaX = Math.abs(touch.clientX - this.startX);
    const deltaY = Math.abs(touch.clientY - this.startY);

    // If moved significantly, cancel long press and mark as dragging
    if (deltaX > 10 || deltaY > 10) { // Reduced threshold for better responsiveness
      this.isDragging = true;
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    }
  };

  public handleTouchEnd = (e: TouchEvent | React.TouchEvent) => {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    const touch = 'changedTouches' in e ? e.changedTouches[0] : e;
    const deltaX = touch.clientX - this.startX;
    const deltaY = touch.clientY - this.startY;
    const deltaTime = Date.now() - this.startTime;

    // If it's a short tap without much movement, don't process as swipe
    if (!this.isDragging && deltaTime < 200 && Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
      return;
    }

    // Use velocity for better gesture detection
    const threshold = this.config.swipeThreshold || 20;
    const velocityThreshold = 0.2; // Reduced for better sensitivity

    // Check if it's a fast swipe based on velocity or distance
    const isFastSwipe = Math.abs(this.velocityX) > velocityThreshold || Math.abs(this.velocityY) > velocityThreshold;
    const isLongSwipe = Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold;

    if (isFastSwipe || (isLongSwipe && deltaTime < 1000)) {
      // Determine swipe direction with better logic
      const absVelX = Math.abs(this.velocityX);
      const absVelY = Math.abs(this.velocityY);
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // Use both velocity and distance to determine direction
      const isHorizontal = (absVelX > absVelY) || (absDeltaX > absDeltaY && absDeltaX > 15);

      if (isHorizontal) {
        // Horizontal swipe
        if (deltaX > 0 || this.velocityX > 0) {
          soundSystem.play('swipe');
          this.config.onSwipeRight(this.velocityX);
        } else {
          soundSystem.play('swipe');
          this.config.onSwipeLeft(this.velocityX);
        }
      } else {
        // Vertical swipe
        if (deltaY < 0 || this.velocityY < 0) {
          soundSystem.play('activate');
          this.config.onSwipeUp();
        }
      }
    }

    // Reset state
    this.isDragging = false;
    this.velocityX = 0;
    this.velocityY = 0;
  };

  public handleMouseDown = (e: MouseEvent | React.MouseEvent) => {
    this.isMouseDown = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startTime = Date.now();
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.lastMoveTime = this.startTime;
    this.isDragging = false;
    this.velocityX = 0;
    this.velocityY = 0;

    // Start long press timer
    this.longPressTimer = setTimeout(() => {
      if (!this.isDragging && this.isMouseDown) {
        soundSystem.play('activate');
        this.config.onLongPress();
      }
    }, this.config.longPressDelay);
  };

  public handleMouseMove = (e: MouseEvent | React.MouseEvent) => {
    if (!this.isMouseDown) return;

    const currentTime = Date.now();
    this.calculateVelocity(e.clientX, e.clientY, currentTime);
    
    const deltaX = Math.abs(e.clientX - this.startX);
    const deltaY = Math.abs(e.clientY - this.startY);

    // If moved significantly, cancel long press and mark as dragging
    if (deltaX > 8 || deltaY > 8) { // Reduced threshold for better desktop responsiveness
      this.isDragging = true;
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
    }
  };

  public handleMouseUp = (e: MouseEvent | React.MouseEvent) => {
    if (!this.isMouseDown) return;
    
    this.isMouseDown = false;
    
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    const deltaX = e.clientX - this.startX;
    const deltaY = e.clientY - this.startY;
    const deltaTime = Date.now() - this.startTime;

    // If it's a short click without much movement, don't process as swipe
    if (!this.isDragging && deltaTime < 200 && Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) {
      return;
    }

    // Use velocity for better gesture detection
    const threshold = this.config.swipeThreshold || 20;
    const velocityThreshold = 0.15; // Reduced for better desktop sensitivity

    // Check if it's a fast swipe based on velocity or distance
    const isFastSwipe = Math.abs(this.velocityX) > velocityThreshold || Math.abs(this.velocityY) > velocityThreshold;
    const isLongSwipe = Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold;

    if (isFastSwipe || (isLongSwipe && deltaTime < 1000)) {
      // Determine swipe direction with better logic
      const absVelX = Math.abs(this.velocityX);
      const absVelY = Math.abs(this.velocityY);
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // Use both velocity and distance to determine direction
      const isHorizontal = (absVelX > absVelY) || (absDeltaX > absDeltaY && absDeltaX > 12);

      if (isHorizontal) {
        // Horizontal swipe
        if (deltaX > 0 || this.velocityX > 0) {
          soundSystem.play('swipe');
          this.config.onSwipeRight(this.velocityX);
        } else {
          soundSystem.play('swipe');
          this.config.onSwipeLeft(this.velocityX);
        }
      } else {
        // Vertical swipe
        if (deltaY < 0 || this.velocityY < 0) {
          soundSystem.play('activate');
          this.config.onSwipeUp();
        }
      }
    }

    // Reset state
    this.isDragging = false;
    this.velocityX = 0;
    this.velocityY = 0;
  };

  public handleWheel = (e: WheelEvent | React.WheelEvent) => {
    e.preventDefault();
    
    const deltaX = e.deltaX;
    const deltaY = e.deltaY;
    
    // Handle trackpad/mouse wheel scrolling
    if (this.config.onWheel) {
      this.config.onWheel(deltaX, deltaY);
    } else {
      // Default wheel behavior
      const threshold = 50;
      
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal scroll
        if (Math.abs(deltaX) > threshold) {
          if (deltaX > 0) {
            soundSystem.play('swipe');
            this.config.onSwipeLeft();
          } else {
            soundSystem.play('swipe');
            this.config.onSwipeRight();
          }
        }
      } else {
        // Vertical scroll
        if (Math.abs(deltaY) > threshold) {
          if (deltaY > 0) {
            soundSystem.play('swipe');
            this.config.onSwipeLeft();
          } else {
            soundSystem.play('swipe');
            this.config.onSwipeRight();
          }
        }
      }
    }
  };

  public handleMouseEnter = () => {
    soundSystem.play('hover');
    this.config.onHover();
  };

  public cleanup = () => {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    if (this.element) {
      // Remove touch events
      this.element.removeEventListener('touchstart', this.handleTouchStart);
      this.element.removeEventListener('touchmove', this.handleTouchMove);
      this.element.removeEventListener('touchend', this.handleTouchEnd);

      // Remove mouse events
      this.element.removeEventListener('mousedown', this.handleMouseDown);
      this.element.removeEventListener('mousemove', this.handleMouseMove);
      this.element.removeEventListener('mouseup', this.handleMouseUp);
      this.element.removeEventListener('mouseleave', this.handleMouseUp);

      // Remove wheel events
      this.element.removeEventListener('wheel', this.handleWheel);

      // Remove hover events
      this.element.removeEventListener('mouseenter', this.config.onHover);

      this.element = null;
    }

    // Reset state
    this.isDragging = false;
    this.isMouseDown = false;
    this.velocityX = 0;
    this.velocityY = 0;
  };
}

export const createGestureHandler = (config: GestureConfig) => {
  return new IronManGestureHandler(config);
};
