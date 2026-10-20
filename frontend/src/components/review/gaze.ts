// Where a recruiter's eyes go in their first seven seconds on a resume, as
// eye-tracking studies draw it: the name, then down the left edge, reading each
// entry's first words, glancing right at its dates, and the first bullet under
// it. The page being read shows a spot moving through these while the AI
// reads. It's an animation of a skim, not where the AI looked.

import type { Line } from "@/lib/import/lines"

/** A place the eyes stop, in PDF points from the page's top-left corner, and for how long. */
export interface Stop {
  x: number
  y: number
  ms: number
}

/** How long the skim takes, in ms: the review page's seven seconds. */
export const GAZE_MS = 7000
// How long the eyes take to jump to a stop, in ms, out of the time spent there.
const SACCADE = 140
// Only the top of the page is looked at: the part that shows above the fog on the page being read.
const LOWEST = 0.42
const DATED = /\b(19|20)\d{2}\b|\bpresent\b/i

type Placed = Line & { box: NonNullable<Line["box"]> }

/** The stops on page 1 of a printed resume, `size` its size in points, lasting GAZE_MS in all; none if nothing's printed there. */
export function gazeOf(lines: readonly Line[], size: { width: number; height: number }): Stop[] {
  const stops: Stop[] = []
  const placed = lines.filter((line): line is Placed => line.page === 1 && line.box !== undefined && line.text.trim() !== "")
  // Under each entry only its first bullet is read; then the eyes move on down the left edge.
  let readBullet = true
  let bullet: Placed | null = null
  placed.forEach((line, index) => {
    const [left, top, right, bottom] = line.box
    const y = (top + bottom) / 2
    if (y > size.height * LOWEST) return
    if (index === 0) {
      // The name, read whole.
      stops.push({ x: (left + right) / 2, y, ms: 900 })
      return
    }
    if (line.bullet) {
      if (!readBullet) stops.push({ x: left + Math.min((right - left) * 0.3, 90), y, ms: 650 })
      readBullet = true
      bullet = line
      return
    }
    // A bullet's wrapped line, starting under its text, or a section's heading: passed over.
    const wrapped = bullet !== null && Math.abs(line.left - bullet.x) < 1.5
    bullet = null
    if (wrapped || (line.text.trim().split(/\s+/).length <= 2 && !/\d/.test(line.text))) return
    stops.push({ x: left + Math.min((right - left) * 0.25, 70), y, ms: 520 })
    if (DATED.test(line.text) && right > size.width * 0.8) stops.push({ x: right - 36, y, ms: 420 })
    readBullet = false
  })
  const total = stops.reduce((sum, stop) => sum + stop.ms, 0)
  return stops.map((stop) => ({ ...stop, ms: (stop.ms * GAZE_MS) / total }))
}

/** How long the jump to `stop` takes: never longer than the stop, on a page with so many that each is short. */
export const glideOf = (stop: Stop) => Math.min(SACCADE, stop.ms)

/**
 * The spot's path over GAZE_MS, as keyframes for Element.animate: held at
 * each stop, then a quick glide to the next. The offsets only rise and end at
 * 1, which animate() needs, or it throws.
 */
export function pathOf(stops: readonly Stop[]): Keyframe[] {
  if (stops.length === 0) return []
  const at = (stop: Stop) => `translate(${stop.x}px, ${stop.y}px)`
  const frames: Keyframe[] = [{ offset: 0, transform: at(stops[0]) }]
  let start = stops[0].ms
  stops.slice(1).forEach((stop, index) => {
    frames.push({ offset: Math.min(1, start / GAZE_MS), transform: at(stops[index]), easing: "cubic-bezier(0.16, 1, 0.3, 1)" })
    frames.push({ offset: Math.min(1, (start + glideOf(stop)) / GAZE_MS), transform: at(stop) })
    start += stop.ms
  })
  frames.push({ offset: 1, transform: at(stops[stops.length - 1]) })
  return frames
}
