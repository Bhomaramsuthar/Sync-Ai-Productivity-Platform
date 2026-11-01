/**
 * KineticTextReveal — Animated text entrance component
 *
 * Local implementation compatible with the existing CSS-based styling system.
 * Uses framer-motion for staggered word/character reveal animations.
 * Preserves semantic headings and supports prefers-reduced-motion.
 */
import React, { useMemo, useRef, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export type KineticSplitBy = 'words' | 'characters';
export type KineticDirection = 'up' | 'down' | 'left' | 'right';

export interface KineticTextRevealProps {
  /** The text content to animate */
  text: string;
  /** Semantic HTML tag to render (preserves heading hierarchy) */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'div';
  /** Split text by words or characters */
  splitBy?: KineticSplitBy;
  /** Direction of entrance movement */
  direction?: KineticDirection;
  /** Distance in pixels for the entrance animation */
  distance?: number;
  /** Stagger delay between each token in seconds */
  stagger?: number;
  /** Whether to apply a subtle blur during entrance */
  blur?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Additional inline styles */
  style?: React.CSSProperties;
  /** Whether the animation should play (prevents replaying on re-render) */
  triggerOnce?: boolean;
  /** React children (used as fallback if no text prop) */
  children?: React.ReactNode;
}

const getDirectionOffset = (direction: KineticDirection, distance: number) => {
  switch (direction) {
    case 'up':
      return { x: 0, y: distance };
    case 'down':
      return { x: 0, y: -distance };
    case 'left':
      return { x: distance, y: 0 };
    case 'right':
      return { x: -distance, y: 0 };
  }
};

export const KineticTextReveal: React.FC<KineticTextRevealProps> = ({
  text,
  as: Tag = 'h1',
  splitBy = 'words',
  direction = 'up',
  distance = 18,
  stagger = 0.05,
  blur = true,
  className = '',
  style,
  triggerOnce = true,
  children,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [hasAnimated, setHasAnimated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  // IntersectionObserver for viewport detection
  useEffect(() => {
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
          if (triggerOnce) {
            observer.disconnect();
          }
        } else if (!triggerOnce) {
          setIsInView(false);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [triggerOnce]);

  const displayText = text || (typeof children === 'string' ? children : '');

  const tokens = useMemo(() => {
    if (!displayText) return [];
    if (splitBy === 'characters') {
      return displayText.split('');
    }
    // Split by words but preserve spaces
    return displayText.split(/(\s+)/);
  }, [displayText, splitBy]);

  const offset = useMemo(() => getDirectionOffset(direction, distance), [direction, distance]);

  // If reduced motion is preferred, render static text
  if (prefersReducedMotion) {
    return (
      <Tag className={className} style={style}>
        {displayText || children}
      </Tag>
    );
  }

  const shouldAnimate = isInView && (!triggerOnce || !hasAnimated);

  return (
    <Tag
      className={className}
      style={{
        ...style,
        // Prevent layout shifts while animating
        minHeight: style?.minHeight || 'auto',
      }}
    >
      <span
        ref={containerRef}
        style={{ display: 'inline' }}
        aria-label={displayText}
      >
        {tokens.map((token, index) => {
          // Whitespace tokens render as-is
          if (/^\s+$/.test(token)) {
            return <span key={`ws-${index}`}>{token}</span>;
          }

          return (
            <motion.span
              key={`${token}-${index}`}
              initial={{
                opacity: 0,
                x: offset.x,
                y: offset.y,
                filter: blur ? 'blur(4px)' : 'none',
              }}
              animate={
                shouldAnimate || hasAnimated
                  ? {
                      opacity: 1,
                      x: 0,
                      y: 0,
                      filter: 'blur(0px)',
                    }
                  : {
                      opacity: 0,
                      x: offset.x,
                      y: offset.y,
                      filter: blur ? 'blur(4px)' : 'none',
                    }
              }
              transition={{
                duration: 0.45,
                delay: index * stagger,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
              onAnimationComplete={() => {
                if (index === tokens.length - 1 && triggerOnce) {
                  setHasAnimated(true);
                }
              }}
              style={{
                display: 'inline-block',
                whiteSpace: splitBy === 'words' ? 'pre' : 'normal',
                willChange: 'transform, opacity, filter',
              }}
              aria-hidden="true"
            >
              {token}
            </motion.span>
          );
        })}
        {/* Screen reader accessible text */}
        <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
          {displayText}
        </span>
      </span>
    </Tag>
  );
};

export default KineticTextReveal;
