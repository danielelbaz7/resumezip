import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { LOGO_IMAGE } from "@/lib/site"
import { HOME_DATA } from "./structuredData"

describe("the home page's structured data", () => {
  // Google skips an organization's logo under 112 px square.
  test("gives a logo that's a PNG at least 112 px square, at the size it says", () => {
    const png = readFileSync(path.join(import.meta.dirname, "../../public", LOGO_IMAGE.url))
    expect(png.subarray(1, 4).toString()).toBe("PNG")
    // Width and height are the first two numbers of a PNG's header chunk.
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([LOGO_IMAGE.width, LOGO_IMAGE.height])
    expect(Math.min(LOGO_IMAGE.width, LOGO_IMAGE.height)).toBeGreaterThanOrEqual(112)
  })

  test("only points at things it has", () => {
    const ids = HOME_DATA["@graph"].flatMap((item) => ("@id" in item ? [item["@id"]] : []))
    const pointedAt = [...JSON.stringify(HOME_DATA).matchAll(/\{"@id":"([^"]+)"\}/g)].map(([, id]) => id)
    expect(pointedAt.length).toBeGreaterThan(0)
    for (const id of pointedAt) expect(ids).toContain(id)
  })
})
