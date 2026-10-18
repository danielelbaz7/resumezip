// Hand-drawn marks as SVG paths: a pen's circle round a word, a box, a line
// through, a bracket, an underline gone over twice, and a highlighter's
// stroke. Drawn rather than taken from a package (rough-notation), as each is
// a few lines. The wobble comes from a seeded random, so a mark looks the same
// on every render.

import type { Box } from "@/lib/review/marks"

export type { Box }

/** The same numbers for the same seed (Park–Miller). */
export function seeded(seed: number): () => number {
  let state = Math.abs(Math.round(seed)) % 2147483647 || 1
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

// A smooth curve through the points (Catmull-Rom, as cubic Béziers).
function smooth(points: [number, number][]): string {
  const [first] = points
  let d = `M${first[0].toFixed(1)} ${first[1].toFixed(1)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

// A pen's straight line from one point to another: its ends a little off, and bowed a little.
function stroke([x0, y0]: [number, number], [x1, y1]: [number, number], random: () => number, jitter: number): string {
  const off = () => (random() - 0.5) * 2 * jitter
  return smooth([
    [x0 + off(), y0 + off()],
    [(x0 + x1) / 2 + off(), (y0 + y1) / 2 + off()],
    [x1 + off(), y1 + off()],
  ])
}

/** A box round `box`, gone over twice, its corners overshot. */
export function rectangle([left, top, right, bottom]: Box, seed: number, pad = 2.5): string {
  const random = seeded(seed)
  const [l, t, r, b] = [left - pad, top - pad * 0.6, right + pad, bottom + pad * 0.6]
  return [0, 1]
    .flatMap(() => [
      stroke([l - 1, t], [r + 1.5, t], random, 0.8),
      stroke([r, t - 1], [r, b + 1.5], random, 0.8),
      stroke([r + 1, b], [l - 1.5, b], random, 0.8),
      stroke([l, b + 1], [l, t - 1.5], random, 0.8),
    ])
    .join(" ")
}

/** A line through the middle of `box`, gone over twice. */
export function strike([left, top, right, bottom]: Box, seed: number): string {
  const random = seeded(seed)
  // Through the lowercase letters, which sit a little below the box's middle.
  const y = top + (bottom - top) * 0.56
  return [0, 1].map(() => stroke([left - 2, y], [right + 2, y], random, 0.9)).join(" ")
}

/** A bracket down the left of `boxes`, from the first's top to the last's bottom. */
export function bracket(boxes: readonly Box[], seed: number): string {
  const random = seeded(seed)
  const x = Math.min(...boxes.map(([left]) => left)) - 6
  const top = boxes[0][1] - 1
  const bottom = boxes[boxes.length - 1][3] + 1
  return [0, 1]
    .map(() =>
      [
        stroke([x + 5, top], [x, top + 1], random, 0.5),
        stroke([x, top], [x, bottom], random, 0.7),
        stroke([x, bottom - 1], [x + 5, bottom], random, 0.5),
      ].join(" "),
    )
    .join(" ")
}

/** A loop round `box`, going a little past where it started, as a pen does. */
export function circle([left, top, right, bottom]: Box, seed: number, pad = 4): string {
  const random = seeded(seed)
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  const rx = (right - left) / 2 + pad + 2
  const ry = (bottom - top) / 2 + pad
  const start = -Math.PI * (0.55 + random() * 0.2)
  const turn = Math.PI * 2 * (1.08 + random() * 0.08)
  const steps = 22
  return smooth(
    Array.from({ length: steps + 1 }, (_, i) => {
      const angle = start + (turn * i) / steps
      const wobble = 1 + (random() - 0.5) * 0.06 + (i / steps) * 0.05
      return [cx + Math.cos(angle) * rx * wobble, cy + Math.sin(angle) * ry * wobble]
    }),
  )
}

/** A line under `box`, gone over twice. */
export function underline([left, , right, bottom]: Box, seed: number, jitter = 1): string {
  const random = seeded(seed)
  const steps = Math.max(3, Math.round((right - left) / 60))
  return [0, 1]
    .map((pass) =>
      smooth(
        Array.from({ length: steps + 1 }, (_, i) => [
          left - 2 + ((right - left + 4) * i) / steps + (random() - 0.5) * 2 * jitter,
          bottom + 1.5 + (random() - 0.5) * 2 * jitter + pass * 1.4 * jitter,
        ]),
      ),
    )
    .join(" ")
}

/** A highlighter's stroke over `box`, its edges a little uneven. */
export function highlight([left, top, right, bottom]: Box, seed: number): string {
  const random = seeded(seed)
  const j = () => (random() - 0.5) * 2.4
  const y0 = top + (bottom - top) * 0.1
  const y1 = top + (bottom - top) * 0.95
  const w = right - left
  return (
    `M${left - 3 + j()} ${y0 + j()} C${left + w * 0.3} ${y0 - 1.5 + j()} ${left + w * 0.7} ${y0 + 1.5 + j()} ${right + 3 + j()} ${y0 + j()}` +
    ` L${right + 2 + j()} ${y1 + j()} C${left + w * 0.6} ${y1 + 1.5 + j()} ${left + w * 0.3} ${y1 - 1 + j()} ${left - 2 + j()} ${y1 + j()} Z`
  )
}
