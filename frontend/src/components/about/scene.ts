// The About story's camera (AboutStory.tsx): where its pictures are on the
// screen as it plays, worked out here so the page only has to apply it.
import { BEATS, clamp, inOut, lerp, out3, smooth, span } from "./motion"

export interface Size {
  width: number
  height: number
}

/** A picture laid out to cover the screen: its size and where its top left corner is. */
export interface Cover extends Size {
  left: number
  top: number
}

/** Where a picture is drawn: moved by x and y, then scaled about its top left corner. */
export interface Shot {
  x: number
  y: number
  scale: number
}

/**
 * A picture covering the screen, centred across and with its foot at the
 * screen's foot: both scenes have their ground (the sky's cloud deck, the
 * meadow's hills) at the bottom.
 */
export function cover(picture: Size, screen: Size): Cover {
  const k = Math.max(screen.width / picture.width, screen.height / picture.height)
  const width = picture.width * k
  const height = picture.height * k
  return { width, height, left: (screen.width - width) / 2, top: screen.height - height }
}

/**
 * The camera on a covering picture: scaled by `scale` about its foot's middle,
 * then moved down `pan` pixels, never so far that the screen sees past its
 * edges. `lift` lets its foot rise that far above the screen's, where something
 * in front covers it.
 */
export function camera(picture: Cover, screen: Size, scale: number, pan = 0, lift = 0): Shot {
  const footX = picture.left + picture.width / 2
  const footY = picture.top + picture.height
  return {
    x: clamp(footX + scale * (picture.left - footX), screen.width - scale * picture.width, 0),
    y: clamp(footY + scale * (picture.top - footY) + pan, screen.height - scale * picture.height - lift, 0),
    scale,
  }
}

/** The camera sinks toward the sky's cloud deck as the story starts, until the meadow takes over. */
export const skyAt = (v: number) => ({ scale: 1 + 0.3 * inOut(span(v, BEATS.skyPush)), opacity: 1 - smooth(span(v, BEATS.skyOut)) })

/** Where a cloud is: its middle at (x, y), as shares of the screen, and how many base widths wide. */
export type CloudPoint = readonly [x: number, y: number, k: number]

export interface Cloud {
  /** Where it starts, below the screen, and where it has gathered. */
  gather: readonly [CloudPoint, CloudPoint]
  /** When it starts to rise in, in story vh. */
  start: number
  /** How far it drifts while our page plays out, added to where it gathered. */
  drift: CloudPoint
  /** Where it ends, up and away, as we drop below the clouds. */
  part: CloudPoint
}

/**
 * The three clouds, each on one unbroken path: up from below the screen and
 * together, a slow drift while our page and its promises play out, then up and
 * away as the story drops below them. Each leg eases in and out, so they never
 * jump or start at full speed.
 */
export const CLOUDS = {
  bank: {
    gather: [
      [0.5, 1.72, 1.25],
      [0.5, 0.66, 2.9],
    ],
    start: 0,
    drift: [0, -0.03, 0.12],
    part: [0.5, -1.7, 3.3],
  },
  tower: {
    gather: [
      [0.95, 1.78, 1.1],
      [0.7, 0.46, 3.2],
    ],
    start: 12,
    drift: [0.03, -0.02, 0.1],
    part: [1.2, -1.6, 3.4],
  },
  puff: {
    gather: [
      [0.05, 1.66, 0.95],
      [0.3, 0.5, 3.4],
    ],
    start: 24,
    drift: [-0.03, -0.02, 0.1],
    part: [-0.2, -1.6, 3.6],
  },
} satisfies Record<string, Cloud>

const mix = (a: CloudPoint, b: CloudPoint, t: number): CloudPoint => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/**
 * Where a cloud is at `v`, and how much of it shows. It fades up as it rises
 * in; on the way out it rises out of the frame and fading is only a last touch,
 * as fading it in place reads as a see-through sheet.
 */
export function cloudAt(cloud: Cloud, v: number): { at: CloudPoint; opacity: number } {
  const [from, gathered] = cloud.gather
  const held: CloudPoint = [gathered[0] + cloud.drift[0], gathered[1] + cloud.drift[1], gathered[2] + cloud.drift[2]]
  const at =
    v < BEATS.gathered
      ? mix(from, gathered, smooth(span(v, [cloud.start, BEATS.gathered])))
      : v < BEATS.part[0]
        ? mix(gathered, held, smooth(span(v, [BEATS.gathered, BEATS.part[0]])))
        : mix(held, cloud.part, inOut(span(v, BEATS.part)))
  const opacity = smooth(span(v, [cloud.start, cloud.start + 24])) * (1 - smooth(span(v, [BEATS.part[0] + 110, BEATS.part[1]])))
  return { at, opacity }
}

/**
 * The grass in front of the meadow: the share of its picture's height from
 * its top to where its blades meet (measured on public/about/grass.webp), and
 * how far below the screen's foot its own foot sits, as a share of its height.
 */
export const GRASS_SOLID = 0.82
export const GRASS_SINK = 0.085

/** How far the grass is below where it ends up: it rises in front of everything as the meadow settles. */
export const grassDropAt = (v: number, grassHeight: number) => (1 - out3(span(v, BEATS.grass))) * grassHeight * 0.55

/**
 * The camera on the meadow. Out of the cloud base, its sky takes over from
 * ours and the view starts up in it, then comes down to the grass and the hills
 * as it settles. Its hills are at its picture's foot, where the grass would
 * cover them, so it rises with the grass, never ahead of it: its foot stays
 * behind the grass where the blades meet, and nothing behind them shows.
 */
export function meadowAt(v: number, meadow: Cover, screen: Size, grassHeight: number): Shot & { opacity: number } {
  const descent = inOut(span(v, BEATS.descend))
  const scale = lerp(1.3, 1.18, descent)
  const up = Math.max(0, scale * meadow.height - screen.height)
  const lift = grassHeight * GRASS_SINK
  const rise = clamp(lift - grassDropAt(v, grassHeight), 0, lift)
  return { ...camera(meadow, screen, scale, up * (1 - descent) - rise, lift), opacity: smooth(span(v, BEATS.meadow)) }
}
