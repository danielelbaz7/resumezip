import { describe, expect, it } from "vitest"
import { FRAME, MARKS, layoutFolder, strokeTimes } from "./folder"

const PHONES = [
  [320, 568],
  [375, 667],
  [390, 844],
  [430, 932],
  [489, 701],
  [699, 1000],
] as const

describe("our page in its folder, on a phone", () => {
  it("fits the folder on the screen with a little sky either side", () => {
    for (const [width, height] of PHONES) {
      const { folder } = layoutFolder(true, width, height)
      expect(folder.left, `${width}px`).toBeGreaterThanOrEqual(8)
      expect(folder.left + folder.width, `${width}px`).toBeLessThanOrEqual(width - 8)
    }
  })

  it("stands the page in the folder: narrower than it, its foot hidden under the front flap", () => {
    for (const [width, height] of PHONES) {
      const { page, folder, flap, foot } = layoutFolder(true, width, height)
      expect(page.left).toBeGreaterThan(folder.left)
      expect(page.left + page.width).toBeLessThan(folder.left + folder.width)
      expect(page.top + page.height).toBeLessThan(foot)
      expect(flap).toBeGreaterThan(page.top)
    }
  })

  it("writes the notes and the headline on the folder's front, the headline under the notes", () => {
    for (const [width, height] of PHONES) {
      const { notes, headline, flap, foot } = layoutFolder(true, width, height)
      for (const note of notes) expect(note.top).toBeGreaterThan(flap)
      const lastNote = notes.at(-1)!
      expect(headline.top).toBeGreaterThan(lastNote.top + lastNote.size)
      expect(headline.top + headline.size * 1.1).toBeLessThan(foot)
    }
  })

  it("sits below the header, in the middle of the screen", () => {
    const { page, foot } = layoutFolder(true, 390, 844)
    expect(page.top).toBeGreaterThanOrEqual(96)
    expect(Math.abs(page.top - 70 - (844 - foot))).toBeLessThan(30)
  })

  it("is laid out for a small phone when the window has no size yet", () => {
    const layout = layoutFolder(true, 0, 0)
    expect(layout.width).toBe(320)
    expect(Number.isFinite(layout.foot)).toBe(true)
  })
})

describe("our page in its folder, on a wide screen", () => {
  it("writes the notes in the margins, beside the page rather than on it", () => {
    const { notes, page } = layoutFolder(false, FRAME.width, FRAME.height)
    for (const note of notes) {
      const beside = note.left < page.left - 100 || note.left > page.left + page.width
      expect(beside).toBe(true)
    }
  })

  it("draws an arrow to each mark from its note", () => {
    const { strokes } = layoutFolder(false, FRAME.width, FRAME.height)
    expect(strokes.map((list) => list.length)).toEqual(MARKS.map(() => 4))
  })

  it("keeps the folder on the frame, under the header", () => {
    const { folder, page } = layoutFolder(false, FRAME.width, FRAME.height)
    expect(folder.left).toBeGreaterThan(0)
    expect(folder.left + folder.width).toBeLessThan(FRAME.width)
    expect(page.top).toBeGreaterThan(90)
  })
})

describe("a mark's strokes", () => {
  it("are drawn one after another, the whole of the pen's time", () => {
    const times = strokeTimes(4)
    expect(times[0][0]).toBe(0)
    expect(times.at(-1)![1]).toBeCloseTo(1)
    times.slice(1).forEach(([from], i) => expect(from).toBeCloseTo(times[i][1]))
  })
})
