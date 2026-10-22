import React from 'react';
import { ThinkingOrb, type OrbState, type OrbSize, type OrbTheme } from 'thinking-orbs';
import './ThinkingLoader.css';

/**
 * Standard application activity verbs mapped to documented thinking-orbs states:
 * - General loading: 'working'
 * - Fetching or finding info: 'searching'
 * - AI reasoning or processing: 'solving'
 * - Audio transcription: 'listening'
 * - Connecting to a meeting: 'connecting'
 * - Generating summaries or notes: 'composing'
 */
export const APP_ORB_STATES = {
  general: 'working',
  fetching: 'searching',
  reasoning: 'solving',
  transcription: 'listening',
  meeting_connect: 'connecting',
  summarizing: 'composing',
} as const satisfies Record<string, OrbState>;

export interface ThinkingLoaderProps {
  /**
   * The documented orb state. Accepts any valid state from thinking-orbs:
   * 'working' | 'searching' | 'solving' | 'listening' | 'connecting' |
   * 'weaving' | 'composing' | 'breathing' | 'shaping'
   *
   * Defaults to 'working'.
   */
  state?: OrbState;
  /** Size preset supported by thinking-orbs: 64 | 32 | 20. Defaults to 64 (or 20 if inline). */
  size?: OrbSize;
  /** Theme mode: 'auto' (default), 'dark', or 'light'. */
  theme?: OrbTheme;
  /** Primary status message. */
  message?: React.ReactNode;
  /** Optional secondary explanatory text. */
  description?: React.ReactNode;
  /** Whether to render as a full-screen overlay. */
  fullscreen?: boolean;
  /** Whether to render in a compact inline layout (e.g. within buttons, bars, or list rows). */
  inline?: boolean;
  /** Additional CSS class names. */
  className?: string;
  /** Inline style overrides. */
  style?: React.CSSProperties;
  /** Animation speed multiplier (default 1). */
  speed?: number;
  /** Accessibility aria-label override for screen readers. */
  ariaLabel?: string;
}

export const ThinkingLoader: React.FC<ThinkingLoaderProps> = ({
  state = 'working',
  size,
  theme = 'auto',
  message,
  description,
  fullscreen = false,
  inline = false,
  className = '',
  style,
  speed = 1,
  ariaLabel,
}) => {
  // Use 20 for inline by default, otherwise 64
  const resolvedSize: OrbSize = size ?? (inline ? 20 : 64);

  const containerClasses = [
    'thinking-loader-container',
    fullscreen ? 'fullscreen' : '',
    inline ? 'inline' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const accessibleLabel =
    ariaLabel ||
    (typeof message === 'string' ? message : `Thinking orb in ${state} state`);

  return (
    <div
      className={containerClasses}
      style={style}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="thinking-loader-orb-wrap">
        <ThinkingOrb
          state={state}
          size={resolvedSize}
          theme={theme}
          speed={speed}
          aria-label={accessibleLabel}
        />
      </div>

      {(message || description) && (
        <div className="thinking-loader-text-group">
          {message && (
            <div className={inline ? 'thinking-loader-inline-text' : 'thinking-loader-message'}>
              {message}
            </div>
          )}
          {!inline && description && (
            <div className="thinking-loader-desc">{description}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default ThinkingLoader;
