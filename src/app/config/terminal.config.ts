/**
 * Typing cadence for the terminal. The DOM hero card and the 3D screen run
 * the same screen-text machine; these are the only places its speed is set.
 */
export interface TypingConfig {
  readonly charsPerSecond: number;
  readonly linePauseMs: number;
}

/** The DOM card in the CSS fallback. */
export const HERO_TYPING: TypingConfig = { charsPerSecond: 45, linePauseMs: 320 };

/** The VT100's screen texture. Same cadence, so the two paths read alike. */
export const SCENE_TYPING: TypingConfig = HERO_TYPING;
