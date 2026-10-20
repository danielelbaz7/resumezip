import { expect, test } from "vitest"
import { STORM, SUN } from "./pictures"

test("each picture's rows line up, and every glyph has a color of its own and every blank none", () => {
  for (const { palette, glyphs, inks } of [STORM, SUN]) {
    expect(inks).toHaveLength(glyphs.length)
    const width = glyphs[0].length
    glyphs.forEach((row, r) => {
      expect(row).toHaveLength(width)
      expect(inks[r]).toHaveLength(width)
      ;[...row].forEach((glyph, c) => {
        const ink = inks[r][c]
        if (glyph === " ") expect(ink).toBe(" ")
        else expect(Number(ink)).toBeLessThan(palette.length)
      })
    })
  }
})
