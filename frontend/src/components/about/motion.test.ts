import { describe, expect, it } from "vitest"
import { BEATS, STORY_LENGTH, glide, inOut, out3, smooth, span, storyAt } from "./motion"

describe("the story's easings", () => {
  it("run from 0 to 1, and hold there outside it", () => {
    for (const ease of [out3, inOut, smooth]) {
      expect(ease(-1)).toBe(0)
      expect(ease(0)).toBe(0)
      expect(ease(1)).toBe(1)
      expect(ease(2)).toBe(1)
    }
  })

  it("say how far a point is through a range", () => {
    expect(span(250, [200, 300])).toBe(0.5)
    expect(span(100, [200, 300])).toBe(0)
    expect(span(400, [200, 300])).toBe(1)
  })
})

describe("the story's beats", () => {
  it("raise our page only once the clouds have gathered", () => {
    expect(BEATS.pageIn[0]).toBeGreaterThan(BEATS.gathered)
  })

  it("mark the promises one after another, after the page is in and before it floats away", () => {
    const [first, , last] = BEATS.marks
    expect(first[0]).toBeGreaterThanOrEqual(BEATS.pageIn[1])
    BEATS.marks.slice(1).forEach((mark, i) => expect(mark[0]).toBeGreaterThanOrEqual(BEATS.marks[i][1]))
    expect(BEATS.away[0]).toBeGreaterThan(last[1])
  })

  it("bring the editor up out of the grass, and the way in last, within the story", () => {
    expect(BEATS.editor[0]).toBeGreaterThan(BEATS.grass[0])
    expect(BEATS.cta[0]).toBeGreaterThanOrEqual(BEATS.editor[1])
    expect(BEATS.cta[1]).toBeLessThanOrEqual(STORY_LENGTH)
  })
})

describe("where the story is", () => {
  it("runs from the story's top at the top of the screen to its last screen", () => {
    expect(storyAt(0, 5000, 1000)).toBe(0)
    expect(storyAt(-2000, 5000, 1000)).toBe(STORY_LENGTH / 2)
    expect(storyAt(-4000, 5000, 1000)).toBe(STORY_LENGTH)
    expect(storyAt(-6000, 5000, 1000)).toBe(STORY_LENGTH)
  })

  it("glides toward the scroll, and stops there once it's close", () => {
    const next = glide(0, 100, 16)
    expect(next).toBeGreaterThan(0)
    expect(next).toBeLessThan(100)
    expect(glide(99.99, 100, 16)).toBe(100)
  })

  // The first screen's words move with the scroll; the pictures used to take a fifth of a second
  // to catch up, and the story felt slow to answer.
  it("catches up with the scroll within a tenth of a second", () => {
    let shown = 0
    for (let frame = 0; frame < 6; frame++) shown = glide(shown, 100, 1000 / 60)
    expect(shown).toBeGreaterThan(95)
  })
})
