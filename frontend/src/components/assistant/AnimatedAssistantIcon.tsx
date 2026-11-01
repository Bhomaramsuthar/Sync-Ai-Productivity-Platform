import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  type AssistantAnimationState,
  type AssistantIconConfig,
  type AssistantOperationalState,
  DEFAULT_ASSISTANT_ICON_CONFIG,
  AI_ICON_SEQUENCE_LABELS,
} from './assistantIconConfig';
import './AnimatedAssistantIcon.css';

export interface AnimatedAssistantIconProps {
  /** Asset and timeout overrides */
  config?: Partial<AssistantIconConfig>;
  /** External hover state (e.g. from hovering the parent launcher button) */
  isHovered?: boolean;
  /** Width and height in pixels (default: 22) */
  size?: number;
  /** Custom CSS class names */
  className?: string;
  /** Fallback accessible image alt text */
  alt?: string;
  /** Callback fired whenever the animation state changes */
  onStateChange?: (state: AssistantAnimationState) => void;
  /** Bypass reduced motion media query (useful in test environments) */
  disableReducedMotionCheck?: boolean;
  /** Operational state from Global AI Assistant */
  operationalState?: AssistantOperationalState;
}

export const AnimatedAssistantIcon: React.FC<AnimatedAssistantIconProps> = ({
  config: userConfig,
  isHovered: externalHover = false,
  size = 22,
  className = '',
  alt = 'AI Assistant Icon',
  onStateChange,
  disableReducedMotionCheck = false,
  operationalState = 'idle',
}) => {
  // Merge user configuration with defaults
  const config = useMemo<Required<AssistantIconConfig>>(() => {
    return {
      ...DEFAULT_ASSISTANT_ICON_CONFIG,
      ...userConfig,
    };
  }, [userConfig]);

  // Current animation state: 'static' | 'hover' | 'idle'
  const [animationState, setAnimationState] = useState<AssistantAnimationState>('static');

  // Sequence cycling index for thinking state:
  // Scribble → Ask → ? → What → How → Brain → Thinking
  const [sequenceIndex, setSequenceIndex] = useState(0);

  // Internal hover/focus tracking when interacted with directly
  const [internalHover, setInternalHover] = useState(false);

  // Asset loading error fallback flags
  const [assetErrors, setAssetErrors] = useState<Record<AssistantAnimationState, boolean>>({
    static: false,
    hover: false,
    idle: false,
  });

  // Timers
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Effective hover state (either parent button hovered or component directly hovered)
  const isCurrentlyHovered = externalHover || internalHover;
  const isHoveredRef = useRef(isCurrentlyHovered);
  isHoveredRef.current = isCurrentlyHovered;

  // Reduced motion preference
  const prefersReducedMotion = useMemo(() => {
    if (disableReducedMotionCheck) return false;
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }, [disableReducedMotionCheck]);

  // Safe state transition dispatcher
  const updateState = useCallback(
    (nextState: AssistantAnimationState) => {
      setAnimationState(nextState);
      if (onStateChange) {
        onStateChange(nextState);
      }
    },
    [onStateChange]
  );

  // Clear idle countdown timer
  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  // Clear duration timer for short idle animation
  const clearDurationTimer = useCallback(() => {
    if (idleDurationTimerRef.current !== null) {
      clearTimeout(idleDurationTimerRef.current);
      idleDurationTimerRef.current = null;
    }
  }, []);

  // Clear all pending timers
  const clearAllTimers = useCallback(() => {
    clearIdleTimer();
    clearDurationTimer();
  }, [clearIdleTimer, clearDurationTimer]);

  // Start the 60,000ms idle countdown timer
  const startIdleCountdown = useCallback(() => {
    clearIdleTimer();
    // Do not schedule idle animation if hovered or reduced motion is preferred
    if (isHoveredRef.current || prefersReducedMotion) return;

    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;

      // Ensure pointer hasn't hovered since timer started
      if (isHoveredRef.current || prefersReducedMotion) return;

      // 1. Transition to 'idle' state (displays ShortAnimation)
      updateState('idle');

      // 2. Schedule completion timer for short animation duration
      clearDurationTimer();
      idleDurationTimerRef.current = setTimeout(() => {
        idleDurationTimerRef.current = null;

        // If still not hovered, return to static resting face and start fresh idle countdown
        if (!isHoveredRef.current) {
          updateState('static');
          startIdleCountdown();
        }
      }, config.shortAnimationDurationMs);
    }, config.idleTimeoutMs);
  }, [
    clearIdleTimer,
    clearDurationTimer,
    prefersReducedMotion,
    updateState,
    config.idleTimeoutMs,
    config.shortAnimationDurationMs,
  ]);

  // Handle pointer / hover changes
  useEffect(() => {
    if (prefersReducedMotion) {
      clearAllTimers();
      updateState('static');
      return;
    }

    if (isCurrentlyHovered) {
      // Mouse Enter / Focus:
      // Cancel idle timer and any pending short animation completion
      clearAllTimers();
      // Immediately display LongAnimation
      updateState('hover');
    } else {
      // Mouse Leave / Blur:
      // Cancel timers, return immediately to StaticIcon, and restart idle countdown
      clearAllTimers();
      updateState('static');
      startIdleCountdown();
    }
  }, [isCurrentlyHovered, prefersReducedMotion, clearAllTimers, updateState, startIdleCountdown]);

  // Initial mount effect & Strict Mode cleanup
  useEffect(() => {
    if (!isHoveredRef.current && !prefersReducedMotion) {
      startIdleCountdown();
    }

    return () => {
      clearAllTimers();
    };
  }, [startIdleCountdown, clearAllTimers, prefersReducedMotion]);

  // Handle asset error by falling back to static
  const handleAssetError = useCallback((failedState: AssistantAnimationState) => {
    setAssetErrors((prev) => ({ ...prev, [failedState]: true }));
  }, []);

  // Determine current asset URL based on animation state & errors
  const currentAssetUrl = useMemo(() => {
    if (prefersReducedMotion) {
      return config.staticAsset;
    }

    switch (animationState) {
      case 'hover':
        return assetErrors.hover ? config.staticAsset : config.longAnimationAsset;
      case 'idle':
        return assetErrors.idle ? config.staticAsset : config.shortAnimationAsset;
      case 'static':
      default:
        return config.staticAsset;
    }
  }, [animationState, assetErrors, config, prefersReducedMotion]);

  // Check if asset is video or image
  const isVideoAsset = useMemo(() => {
    return (
      currentAssetUrl.endsWith('.mp4') ||
      currentAssetUrl.endsWith('.webm') ||
      currentAssetUrl.endsWith('.mov')
    );
  }, [currentAssetUrl]);

  // Cycle visual sequence during thinking:
  // Scribble → Ask → ? → What → How → Brain → Thinking
  useEffect(() => {
    if (operationalState !== 'thinking' || prefersReducedMotion) {
      setSequenceIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setSequenceIndex((prev) => (prev + 1) % AI_ICON_SEQUENCE_LABELS.length);
    }, 850);
    return () => clearInterval(interval);
  }, [operationalState, prefersReducedMotion]);

  return (
    <div
      className={`animated-assistant-icon-root state-${animationState} operational-${operationalState} ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
      }}
      data-state={animationState}
      data-operational-state={operationalState}
      data-testid="animated-assistant-icon"
      onMouseEnter={() => setInternalHover(true)}
      onMouseLeave={() => setInternalHover(false)}
      onFocus={() => setInternalHover(true)}
      onBlur={() => setInternalHover(false)}
      tabIndex={-1}
      aria-hidden="true"
    >
      {isVideoAsset ? (
        <video
          key={currentAssetUrl}
          src={currentAssetUrl}
          autoPlay
          loop={animationState === 'hover'}
          muted
          playsInline
          className="animated-assistant-media"
          onError={() => handleAssetError(animationState)}
        />
      ) : (
        <img
          key={currentAssetUrl}
          src={currentAssetUrl}
          alt={alt}
          className="animated-assistant-media"
          onError={() => handleAssetError(animationState)}
          loading="eager"
          decoding="async"
          draggable={false}
        />
      )}

      {/* Operational State Badges / Sequences */}
      {operationalState === 'thinking' && !prefersReducedMotion && (
        <span className="ai-sequence-badge" aria-hidden="true">
          {AI_ICON_SEQUENCE_LABELS[sequenceIndex]}
        </span>
      )}

      {operationalState === 'typing' && !prefersReducedMotion && (
        <span className="ai-typing-badge" aria-hidden="true">
          •••
        </span>
      )}

      {operationalState === 'success' && !prefersReducedMotion && (
        <span className="ai-success-badge" aria-hidden="true">
          ✓
        </span>
      )}

      {operationalState === 'error' && (
        <span className="ai-error-badge" aria-hidden="true">
          !
        </span>
      )}
    </div>
  );
};
