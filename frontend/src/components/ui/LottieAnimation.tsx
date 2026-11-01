/**
 * LottieAnimation — Reusable wrapper for @lottiefiles/dotlottie-react
 *
 * Handles loading, error fallbacks, lazy loading, reduced-motion, and cleanup.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import type { DotLottie } from '@lottiefiles/dotlottie-react';

export interface LottieAnimationProps {
  /** Lottie .lottie or .json file URL */
  src: string;
  /** Width and height (CSS value or number for px) */
  width?: string | number;
  height?: string | number;
  /** Whether to autoplay */
  autoplay?: boolean;
  /** Whether to loop */
  loop?: boolean;
  /** Playback speed (1 = normal) */
  speed?: number;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
  /** Accessible description of the animation */
  ariaLabel?: string;
  /** Callback with the dotLottie instance */
  onReady?: (instance: DotLottie) => void;
  /** Fallback content when loading fails */
  fallback?: React.ReactNode;
  /** Loading placeholder */
  loadingPlaceholder?: React.ReactNode;
  /** Whether to lazy-load (IntersectionObserver) */
  lazy?: boolean;
  /** Whether the animation is visible / should play */
  isVisible?: boolean;
}

export const LottieAnimation: React.FC<LottieAnimationProps> = ({
  src,
  width = '100%',
  height = '100%',
  autoplay = true,
  loop = true,
  speed = 1,
  className = '',
  style,
  ariaLabel,
  onReady,
  fallback,
  loadingPlaceholder,
  lazy = false,
  isVisible = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotLottieRef = useRef<DotLottie | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(!lazy);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check reduced motion preference
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    try {
      const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mql.matches);
      const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    } catch {
      // noop
    }
  }, []);

  // Lazy-load using IntersectionObserver
  useEffect(() => {
    if (!lazy) return;
    const el = containerRef.current;
    if (!el) return;

    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [lazy]);

  // Pause/play based on visibility
  useEffect(() => {
    const instance = dotLottieRef.current;
    if (!instance) return;
    if (isVisible && !prefersReducedMotion) {
      instance.play();
    } else {
      instance.pause();
    }
  }, [isVisible, prefersReducedMotion]);

  const handleDotLottieReady = useCallback(
    (instance: DotLottie) => {
      dotLottieRef.current = instance;
      instance.addEventListener('loadError', () => {
        setHasError(true);
      });
      if (speed !== 1) {
        instance.setSpeed(speed);
      }
      if (onReady) {
        onReady(instance);
      }
    },
    [speed, onReady]
  );

  const cssWidth = typeof width === 'number' ? `${width}px` : width;
  const cssHeight = typeof height === 'number' ? `${height}px` : height;

  // If reduced motion or error, show fallback
  if (hasError) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{ width: cssWidth, height: cssHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}
        role="img"
        aria-label={ariaLabel}
      >
        {fallback || null}
      </div>
    );
  }

  if (prefersReducedMotion) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{ width: cssWidth, height: cssHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style }}
        role="img"
        aria-label={ariaLabel}
      >
        {fallback || (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {ariaLabel || 'Animation'}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`lottie-animation-wrapper ${className}`}
      style={{
        width: cssWidth,
        height: cssHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
      role="img"
      aria-label={ariaLabel}
    >
      {!isInView ? (
        loadingPlaceholder || <div style={{ width: cssWidth, height: cssHeight }} />
      ) : (
        <DotLottieReact
          src={src}
          autoplay={autoplay && isVisible}
          loop={loop}
          speed={speed}
          style={{ width: '100%', height: '100%' }}
          dotLottieRefCallback={handleDotLottieReady}
        />
      )}
    </div>
  );
};

export default LottieAnimation;
