/**
 * HoldToDeleteButton — Press-and-hold destructive action with progress indicator.
 *
 * Supports mouse, touch, and keyboard (Space/Enter hold).
 * Provides accessible confirmation alternative via an accessible dialog fallback.
 * Respects prefers-reduced-motion.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Trash2 } from 'lucide-react';

export interface HoldToDeleteButtonProps {
  /** Duration in milliseconds to hold before triggering */
  holdDuration?: number;
  /** Callback fired when hold completes */
  onConfirm: () => void | Promise<void>;
  /** Button label */
  label?: string;
  /** Description of what will be deleted */
  itemName?: string;
  /** Whether the operation is in progress (e.g., waiting for API) */
  isLoading?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Additional CSS class */
  className?: string;
  /** Icon to show */
  icon?: React.ReactNode;
  /** ID for testing */
  id?: string;
}

export const HoldToDeleteButton: React.FC<HoldToDeleteButtonProps> = ({
  holdDuration = 1500,
  onConfirm,
  label = 'Hold to Delete',
  itemName,
  isLoading = false,
  disabled = false,
  className = '',
  icon,
  id,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [showFallbackConfirm, setShowFallbackConfirm] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const isActiveRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isDisabled = disabled || isLoading;

  const cancelHold = useCallback(() => {
    isActiveRef.current = false;
    setIsHolding(false);
    setProgress(0);
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    if (!isActiveRef.current) return;
    const elapsed = performance.now() - startTimeRef.current;
    const pct = Math.min(elapsed / holdDuration, 1);
    setProgress(pct);

    if (pct >= 1) {
      cancelHold();
      onConfirm();
      return;
    }
    animationFrameRef.current = requestAnimationFrame(tick);
  }, [holdDuration, onConfirm, cancelHold]);

  const startHold = useCallback(() => {
    if (isDisabled || isActiveRef.current) return;
    isActiveRef.current = true;
    setIsHolding(true);
    startTimeRef.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(tick);
  }, [isDisabled, tick]);

  // Mouse events
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    startHold();
  }, [startHold]);

  const handleMouseUp = useCallback(() => cancelHold(), [cancelHold]);
  const handleMouseLeave = useCallback(() => cancelHold(), [cancelHold]);

  // Touch events
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    startHold();
  }, [startHold]);

  const handleTouchEnd = useCallback(() => cancelHold(), [cancelHold]);

  // Keyboard events (Space/Enter hold)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!isActiveRef.current) {
        startHold();
      }
    }
  }, [startHold]);

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      cancelHold();
    }
  }, [cancelHold]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const progressPct = Math.round(progress * 100);
  const progressColor = progress > 0.7 ? '#ef4444' : progress > 0.3 ? '#f59e0b' : '#f87171';

  // For reduced motion, use a click-to-confirm dialog
  if (prefersReducedMotion) {
    return (
      <>
        <button
          id={id}
          className={`hold-to-delete-btn ${className}`}
          onClick={() => setShowFallbackConfirm(true)}
          disabled={isDisabled}
          type="button"
          aria-label={`Delete ${itemName || 'item'}`}
        >
          {icon || <Trash2 size={14} />}
          <span>{label}</span>
        </button>

        {showFallbackConfirm && (
          <div
            className="hold-delete-confirm-backdrop"
            onClick={() => setShowFallbackConfirm(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm deletion"
          >
            <div
              className="hold-delete-confirm-dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                Are you sure you want to delete{itemName ? ` "${itemName}"` : ' this item'}?
                This action cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowFallbackConfirm(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="btn"
                  style={{ background: '#ef4444', color: '#fff', border: 'none' }}
                  onClick={() => {
                    setShowFallbackConfirm(false);
                    onConfirm();
                  }}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <button
      ref={buttonRef}
      id={id}
      className={`hold-to-delete-btn ${isHolding ? 'holding' : ''} ${className}`}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      disabled={isDisabled}
      type="button"
      aria-label={`Hold to delete ${itemName || 'item'}. ${isHolding ? `${progressPct}% complete` : 'Press and hold to confirm deletion'}`}
      aria-live="polite"
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      {/* Progress bar overlay */}
      <motion.div
        className="hold-delete-progress"
        initial={{ width: '0%' }}
        animate={{ width: `${progressPct}%` }}
        transition={{ duration: 0.05, ease: 'linear' }}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          background: `linear-gradient(90deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.3) 100%)`,
          borderRadius: 'inherit',
          pointerEvents: 'none',
        }}
      />

      {/* Ring indicator */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          zIndex: 1,
        }}
      >
        <div style={{ position: 'relative', width: 18, height: 18 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
            <circle
              cx="9"
              cy="9"
              r="7"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="2"
            />
            <circle
              cx="9"
              cy="9"
              r="7"
              fill="none"
              stroke={progressColor}
              strokeWidth="2"
              strokeDasharray={`${2 * Math.PI * 7}`}
              strokeDashoffset={`${2 * Math.PI * 7 * (1 - progress)}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.05s linear' }}
            />
          </svg>
          <div style={{ position: 'absolute', top: 0, left: 0, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {icon || <Trash2 size={10} />}
          </div>
        </div>
        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>
          {isLoading ? 'Deleting...' : isHolding ? `${progressPct}%` : label}
        </span>
      </div>
    </button>
  );
};

export default HoldToDeleteButton;
