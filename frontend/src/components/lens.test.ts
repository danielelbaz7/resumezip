import { describe, expect, test } from "vitest"
import { rimShift } from "./lens"

// A capsule 200 × 60, its ends round (radius 30), bending 20px in from the rim.
const W = 200
const H = 60
const { dx, dy, most } = rimShift(W, H, 30, 20)
const at = (x: number, y: number) => ({ x: dx[y * W + x], y: dy[y * W + x] })

describe("rimShift", () => {
  test("leaves the middle as it is", () => {
    expect(at(100, 30)).toEqual({ x: 0, y: 0 })
    expect(at(60, 30)).toEqual({ x: 0, y: 0 })
  })

  test("draws the rim from further in: down at the top edge, up at the foot, right at the left end", () => {
    expect(at(100, 2).y).toBeGreaterThan(0)
    expect(Math.abs(at(100, 2).x)).toBeLessThan(1e-6)
    expect(at(100, H - 3).y).toBeLessThan(0)
    expect(at(2, 30).x).toBeGreaterThan(0)
  })

  test("leaves what's outside the rounded ends alone", () => {
    expect(at(0, 0)).toEqual({ x: 0, y: 0 })
    expect(at(W - 1, 0)).toEqual({ x: 0, y: 0 })
  })

  test("moves no pixel past the band, or by more than it reports", () => {
    expect(most).toBeGreaterThan(0)
    expect(most).toBeLessThanOrEqual(20 / 4 + 1e-6)
    for (let i = 0; i < W * H; i++) expect(Math.hypot(dx[i], dy[i])).toBeLessThanOrEqual(most + 1e-4)
  })

  test("bends more with more strength, and not at all with none", () => {
    expect(rimShift(W, H, 30, 20, 2).most).toBeCloseTo(most * 2)
    expect(rimShift(W, H, 30, 20, 0).most).toBe(0)
  })
})
