import { describe, expect, it } from "vitest"
import { BEATS, STORY_LENGTH } from "./motion"
import { CLOUDS, GRASS_SINK, GRASS_SOLID, camera, cloudAt, cover, grassDropAt, meadowAt } from "./scene"

const MEADOW = { width: 1672, height: 941 }
const GRASS_RATIO = 941 / 1672

describe("a picture covering the screen", () => {
  it("fills it, centred across, with its foot at the screen's foot", () => {
    for (const screen of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const c = cover(MEADOW, screen)
      expect(c.width).toBeGreaterThanOrEqual(screen.width - 0.01)
      expect(c.height).toBeGreaterThanOrEqual(screen.height - 0.01)
      expect(c.left + c.width / 2).toBeCloseTo(screen.width / 2)
      expect(c.top + c.height).toBeCloseTo(screen.height)
    }
  })

  it("is never moved so far that the screen sees past its edges", () => {
    const screen = { width: 1440, height: 900 }
    const c = cover(MEADOW, screen)
    for (const pan of [-2000, 0, 2000]) {
      const shot = camera(c, screen, 1.2, pan)
      expect(shot.y).toBeLessThanOrEqual(0)
      expect(shot.y + c.height * shot.scale).toBeGreaterThanOrEqual(screen.height - 0.01)
      expect(shot.x).toBeLessThanOrEqual(0)
      expect(shot.x + c.width * shot.scale).toBeGreaterThanOrEqual(screen.width - 0.01)
    }
  })
})

describe("the clouds", () => {
  it("start below the screen and out of sight, and end above it", () => {
    for (const cloud of Object.values(CLOUDS)) {
      const start = cloudAt(cloud, 0)
      expect(start.at[1]).toBeGreaterThan(1)
      expect(cloudAt(cloud, cloud.start).opacity).toBe(0)
      expect(cloudAt(cloud, BEATS.part[1]).at[1]).toBeLessThan(0)
    }
  })

  it("move a little at a time all the way, never jumping between frames", () => {
    for (const cloud of Object.values(CLOUDS)) {
      let last = cloudAt(cloud, 0)
      for (let v = 1; v <= STORY_LENGTH; v++) {
        const now = cloudAt(cloud, v)
        expect(Math.abs(now.at[1] - last.at[1]), `at ${v}`).toBeLessThan(0.05)
        expect(Math.abs(now.opacity - last.opacity), `at ${v}`).toBeLessThan(0.1)
        last = now
      }
    }
  })
})

describe("the meadow and the grass in front of it", () => {
  // Where the meadow's foot is, and where the grass's blades meet, at v.
  const edges = (v: number, screen: { width: number; height: number }) => {
    const grassHeight = Math.max(screen.width, screen.width < 700 ? 760 : 0) * GRASS_RATIO
    const meadow = cover(MEADOW, screen)
    const shot = meadowAt(v, meadow, screen, grassHeight)
    const grassTop = screen.height - grassHeight + grassHeight * GRASS_SINK + grassDropAt(v, grassHeight)
    return { meadowFoot: shot.y + meadow.height * shot.scale, grassSolid: grassTop + grassHeight * GRASS_SOLID }
  }

  // The meadow lifts to show its hills over the grass; when it lifted ahead of the grass, a band of
  // plain blue showed under it as the grass came up.
  it("never lifts the meadow's foot above where the grass's blades meet", () => {
    for (const screen of [
      { width: 1440, height: 900 },
      { width: 1280, height: 620 },
      { width: 390, height: 844 },
      { width: 489, height: 701 },
      { width: 768, height: 1024 },
    ]) {
      for (let v = BEATS.meadow[0]; v <= STORY_LENGTH; v += 2) {
        const { meadowFoot, grassSolid } = edges(v, screen)
        expect(meadowFoot, `${screen.width}×${screen.height} at ${v}`).toBeGreaterThanOrEqual(Math.min(grassSolid, screen.height) - 0.5)
      }
    }
  })

  it("lifts the meadow over the grass by the end, so its hills show", () => {
    const screen = { width: 1440, height: 900 }
    expect(edges(STORY_LENGTH, screen).meadowFoot).toBeLessThan(screen.height)
  })
})
