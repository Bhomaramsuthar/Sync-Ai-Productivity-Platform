/**
 * Configuration and asset definition for the Interactive Animated AI Assistant Icon.
 *
 * Default assets are placed in `/assets/assistant/` (under frontend/public/assets/assistant/):
 * - static.svg (or static.webp / static.gif / static.png)
 * - long-animation.svg (or long-animation.webp / long-animation.gif / long-animation.mp4)
 * - short-animation.svg (or short-animation.webp / short-animation.gif / short-animation.mp4)
 *
 * Developers can easily replace or configure these assets via custom props or by replacing files.
 */

export type AssistantAnimationState = 'static' | 'hover' | 'idle';

/** Extended operational states driven by the global assistant's lifecycle */
export type AssistantOperationalState =
  | 'idle'        // Resting — subtle or static
  | 'hover'       // User hovering/focusing the launcher
  | 'opening'     // Brief transition into the assistant drawer
  | 'typing'      // User is entering a message
  | 'thinking'    // Backend request pending
  | 'success'     // Response received
  | 'error'       // Error state
  | 'closed';     // Panel closed, stop unnecessary animations

export interface AssistantIconConfig {
  /** Default resting face asset URL or path */
  staticAsset: string;
  /** Continuous looking-around / facial morphing animation asset while hovered */
  longAnimationAsset: string;
  /** Brief side-to-side glance animation asset after idle period */
  shortAnimationAsset: string;
  /** Inactivity timer duration in ms before triggering short animation (default: 60,000ms / 60s) */
  idleTimeoutMs?: number;
  /** Duration of short animation in ms before returning to static (default: 2,400ms) */
  shortAnimationDurationMs?: number;
}

export const DEFAULT_ASSISTANT_ICON_CONFIG: Required<AssistantIconConfig> = {
  staticAsset: '/assets/assistant/static.svg',
  longAnimationAsset: '/assets/assistant/long-animation.svg',
  shortAnimationAsset: '/assets/assistant/short-animation.svg',
  idleTimeoutMs: 60000,
  shortAnimationDurationMs: 2400,
};

/**
 * Maps operational states to CSS class suffixes applied to the launcher button.
 * The CSS handles the visual behavior (pulse, shake, glow, etc.).
 */
export const OPERATIONAL_STATE_CSS_MAP: Record<AssistantOperationalState, string> = {
  idle: '',
  hover: '',
  opening: 'ai-icon-state-opening',
  typing: 'ai-icon-state-typing',
  thinking: 'ai-icon-state-thinking',
  success: 'ai-icon-state-success',
  error: 'ai-icon-state-error',
  closed: '',
};

/**
 * Sequence labels for the icon text animation:
 * Scribble → Ask → ? → What → How → Brain → Thinking
 * These cycle subtly in the icon's tooltip or aria-label when appropriate.
 */
export const AI_ICON_SEQUENCE_LABELS = [
  'Scribble',
  'Ask',
  '?',
  'What',
  'How',
  'Brain',
  'Thinking',
] as const;

