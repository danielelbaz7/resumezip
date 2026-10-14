// Our resume standing in its manila folder, marked by hand with what resumezip
// promises (AboutStory.tsx). Worked out here, in pixels, so the page only has
// to place it: on a wide screen on a 1440 × 900 frame the page scales to fit,
// with notes in the margins and arrows to the marks; on a phone at the
// screen's own size, with the notes written on the folder's front.
import { type Point, type Stroke, arrowStrokes, loopStroke, underStroke } from "./pen"

/** The frame a wide screen's layout is made on, then scaled to the screen. */
export const FRAME = { width: 1440, height: 900 }

// The page is public/about/own-resume.webp: our resume in Jake's template, as
// Typst prints it, cropped under its last line. Positions on it are in its
// width's thousandths (1000 across), where a letter page is 1294 tall.
const PAGE_WIDTH = 1000
const LETTER_HEIGHT = 1294
/** The folder's front flap covers the page from here down: a little under its last written line. */
const FLAP_ON_PAGE = 582
// public/about/manila-folder.webp: 1041 × 640, its front flap's edge 79 down.
// The page is 79% of the folder's width, as it stands on the live page.
const FOLDER = { width: 1041, height: 640, flap: 79 }
/** How far down the folder picture its front flap's edge is, as a share of its height. */
export const FLAP_SHARE = FOLDER.flap / FOLDER.height
const PAGE_SHARE = 0.79

type Box = readonly [left: number, top: number, right: number, bottom: number]

/** What's marked on the page, and the note each mark has. Measured on the page, at 1000 across. */
export const MARKS: readonly {
  loop?: { box: Box; turns: number; tilt: number }
  under?: readonly [number, number, number]
  note: readonly string[]
}[] = [
  // A loop round "free", in "…with every template free".
  { loop: { box: [688, 224, 716, 237], turns: 1.14, tilt: 0.04 }, note: ["every template,", "free"] },
  // A loop round "0 copies", in "Kept 0 copies of anyone's resume…".
  { loop: { box: [151, 248, 207, 261], turns: 1.18, tilt: -0.03 }, note: ["0 copies kept —", "there’s no server"] },
  // A line under "Open source (MIT license)", in "Promises: …": from x, to x, at y.
  { under: [248, 444, 511], note: ["MIT, all on GitHub"] },
]

export interface FolderLayout {
  width: number
  height: number
  page: { left: number; top: number; width: number; height: number }
  folder: { left: number; top: number; width: number }
  /** Where the folder's front flap meets the page, and where the folder ends. */
  flap: number
  foot: number
  headline: { left: number; top: number; width: number; size: number }
  /** Each mark's strokes, in the order they're drawn: the mark, then its arrow, if it has one. */
  strokes: Stroke[][]
  notes: { left: number; top: number; size: number; turn: number; lines: readonly string[] }[]
}

// Where the notes sit on a wide screen's frame, and how far each is turned, in degrees.
const MARGIN_NOTES = [
  [1160, 232, -3],
  [120, 268, -2],
  [1160, 456, -2.5],
] as const

/**
 * Lays out our page in its folder on a screen `width` × `height` (the frame,
 * on a wide screen). `centred` sets a phone's folder in the middle of the
 * screen below the header, as the story shows it; otherwise it starts under
 * the header, as a still section does.
 */
export function layoutFolder(phone: boolean, width: number, height: number, centred = true): FolderLayout {
  // A page opened in a hidden tab can be told the window has no size yet; it's
  // laid out for a small phone then, until the window has one.
  const W = Math.max(width, 320)
  const H = Math.max(height, 560)
  // On a phone the folder fits the screen with a little sky on either side.
  const pageWidth = phone ? Math.min((W - 20) * PAGE_SHARE, 560) : 700
  const s = pageWidth / PAGE_WIDTH
  const folderWidth = pageWidth / PAGE_SHARE
  const folderHeight = (folderWidth * FOLDER.height) / FOLDER.width
  const belowFlap = (folderHeight * (FOLDER.height - FOLDER.flap)) / FOLDER.height
  const top = phone ? (centred ? Math.max(96, 70 + (H - 70 - (FLAP_ON_PAGE * s + belowFlap)) / 2) : 96) : 111
  const left = phone ? (W - pageWidth) / 2 : 400
  const X = (x: number) => left + x * s
  const Y = (y: number) => top + y * s

  const flap = Y(FLAP_ON_PAGE)
  const folderTop = flap - (folderHeight * FOLDER.flap) / FOLDER.height
  const foot = folderTop + folderHeight
  const folderLeft = left + pageWidth / 2 - folderWidth / 2

  const pen = phone ? 2.4 : 3.7
  const strokes = MARKS.map((mark) => {
    if (mark.loop) {
      const [x0, y0, x1, y1] = mark.loop.box
      return [loopStroke([X(x0), Y(y0), X(x1), Y(y1)], mark.loop.turns, mark.loop.tilt, pen)]
    }
    const [x0, x1, y] = mark.under!
    return [underStroke(X(x0), X(x1), Y(y) + (1.5 * s) / 0.7, pen)]
  })
  if (!phone) {
    const arrow = (from: Point, to: Point, bend: number) => arrowStrokes(from, to, bend, pen)
    strokes[0].push(...arrow([1150, 268], [X(716) + 24, Y(237) - 1], -18))
    // It points at the line from the page's margin, so its head doesn't sit on the words.
    strokes[1].push(...arrow([300, 284], [X(84), (Y(248) + Y(261)) / 2 + 1], -10))
    strokes[2].push(...arrow([1150, 476], [X(444) + 18, Y(511) - 5], 10))
  }

  const headlineSize = phone ? Math.min(46, (W - 32) / 8) : 92
  return {
    width: W,
    height: H,
    page: { left, top, width: pageWidth, height: Math.min(LETTER_HEIGHT * s, foot - 6 - top) },
    folder: { left: folderLeft, top: folderTop, width: folderWidth },
    flap,
    foot,
    headline: phone
      ? { left: 16, top: foot - headlineSize * 1.1 - 18, width: W - 32, size: headlineSize }
      : { left: folderLeft, top: flap + 100, width: folderWidth, size: headlineSize },
    strokes,
    notes: MARKS.map((mark, i) => {
      const [x, y, turn] = phone ? [left + 4, flap + 16 + i * 33, -1.5] : MARGIN_NOTES[i]
      return { left: x, top: y, size: phone ? 21 : 34, turn, lines: mark.note }
    }),
  }
}

/**
 * How much of mark i's drawing each of its strokes takes: the mark itself the
 * most, its arrow's curve some, the arrow's head a moment. Returned as each
 * stroke's [from, to] share of the pen's time.
 */
export function strokeTimes(count: number): [number, number][] {
  const weights = Array.from({ length: count }, (_, j) => (j === 0 ? 0.6 : j === 1 ? 0.3 : 0.05))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let at = 0
  return weights.map((weight) => {
    const from = at
    at += weight / total
    return [from, at]
  })
}
