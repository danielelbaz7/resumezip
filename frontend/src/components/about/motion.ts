// The About page's story (AboutStory.tsx) is played by the scroll: how far down
// the story the page is, in "story vh" (100 is one screen of scrolling), and
// when each part of it happens.

export const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value))
export const lerp = (from: number, to: number, t: number) => from + (to - from) * t

/** How far `value` is through `[from, to]`, 0 to 1. */
export const span = (value: number, [from, to]: readonly [number, number]) => clamp((value - from) / (to - from))

// Easings, each from 0 to 1. `out3` starts fast and settles; `in2` starts slow;
// `inOut` and `smooth` ease both ends.
export const out3 = (t: number) => 1 - Math.pow(1 - clamp(t), 3)
export const in2 = (t: number) => clamp(t) * clamp(t)
export const inOut = (t: number) => {
  const c = clamp(t)
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2
}
export const smooth = (t: number) => {
  const c = clamp(t)
  return c * c * (3 - 2 * c)
}

/** The story's length: from the first screen at rest to the way in, at the end. */
export const STORY_LENGTH = 960

type Range = readonly [number, number]

/**
 * When each part happens, in story vh. The sky stays behind the clouds until
 * the meadow takes over; our page only rises once the clouds have gathered;
 * each promise is marked on it in turn and they hold together before it all
 * floats away; the clouds lift away slowly enough not to go all at once.
 */
export const BEATS = {
  skyPush: [0, 240] as Range,
  skyOut: [600, 660] as Range,
  golden: [60, 220] as Range,
  /** The clouds have gathered here, and drift until they part. */
  gathered: 210,
  pageIn: [236, 292] as Range,
  /** Each loop draws, then its arrow, then its note writes in. */
  marks: [
    [300, 348],
    [372, 420],
    [444, 492],
  ] as readonly Range[],
  away: [574, 634] as Range,
  part: [575, 735] as Range,
  meadow: [585, 645] as Range,
  /** The view comes down from the meadow's sky to the ground. */
  descend: [596, 800] as Range,
  grass: [716, 778] as Range,
  editor: [736, 840] as Range,
  cta: [850, 896] as Range,
}

/**
 * How far down the story the page is: 0 while the story's top is at the top of
 * the screen, STORY_LENGTH once its last screen is all that's left of it.
 */
export function storyAt(top: number, height: number, screen: number): number {
  return clamp(-top / Math.max(1, height - screen)) * STORY_LENGTH
}

/**
 * The next frame's position, eased toward where the scroll is, so a mouse
 * wheel's steps glide rather than jump. `dt` is the time since the last frame,
 * in milliseconds; it's close enough to call it there once it's under 0.05.
 */
export function glide(shown: number, target: number, dt: number): number {
  const next = shown + (target - shown) * (1 - Math.exp(-dt / 70))
  return Math.abs(target - next) < 0.05 ? target : next
}
