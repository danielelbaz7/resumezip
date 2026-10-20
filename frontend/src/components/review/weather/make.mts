// Makes pictures.ts, the AI notes' two tiles' pictures in text: the storm
// (red flags) and the sun (done well), from the pictures beside this file.
// The page ships the text, not the pictures. Only needed to change one; needs
// Playwright's Chromium, for its canvas. Run it from frontend/:
//
//   node src/components/review/weather/make.mts
//
// Set CHROMIUM to a Chromium executable to use that instead of Playwright's.

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { chromium } from "@playwright/test"
import { format, resolveConfig } from "prettier"

const here = import.meta.dirname

interface Settings {
  file: string
  name: string
  /** The part of the picture drawn, as fractions of it: left, top, width, height. */
  crop: [number, number, number, number]
  /** Below this ink (after the curve), a cell is left empty. */
  cut: number
  /** Below this ink (before the curve), a cell is left empty: the faint haze round a pale picture. */
  rawCut: number
  /** Over 1 lifts the pale parts, as the sun's white cloud needs. */
  gamma: number
}

// prettier-ignore
const PICTURES: Settings[] = [
  { file: "storm.webp", name: "STORM", crop: [0.07, 0.07, 0.87, 0.62], cut: 0.06, rawCut: 0, gamma: 1.5 },
  { file: "sun.webp", name: "SUN", crop: [0.06, 0.12, 0.9, 0.62], cut: 0, rawCut: 0.04, gamma: 2.6 },
]
const COLUMNS = 74
/** A glyph's width over its line height, in Geist Mono set solid. */
const ASPECT = 0.6
const RAMP = " .:-=+*#%@"
/** How many colors each picture is drawn in: one layer of text each. */
const INKS = 8

type Cell = { glyph: string; rgb: [number, number, number] } | null

// Runs in the page: samples the picture 2 × 2 per cell on a canvas, and gives
// each cell a glyph for how far it is from the white behind it and a color
// from the picture, deepened so its pale parts still show on white.
function cellsOf({
  src,
  crop,
  cut,
  rawCut,
  gamma,
  cols,
  aspect,
  ramp,
}: Omit<Settings, "file" | "name"> & { src: string; cols: number; aspect: number; ramp: string }) {
  return new Promise<Cell[][]>((resolve, reject) => {
    const img = new Image()
    img.onerror = reject
    img.onload = () => {
      const [cx, cy, cw, ch] = crop
      const sw = img.naturalWidth * cw
      const sh = img.naturalHeight * ch
      const rows = Math.round((cols * aspect * sh) / sw)
      const canvas = document.createElement("canvas")
      canvas.width = cols * 2
      canvas.height = rows * 2
      const g = canvas.getContext("2d")!
      g.imageSmoothingQuality = "high"
      g.drawImage(img, img.naturalWidth * cx, img.naturalHeight * cy, sw, sh, 0, 0, canvas.width, canvas.height)
      const d = g.getImageData(0, 0, canvas.width, canvas.height).data
      const raw = []
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          let ink = 0
          const rgb = [0, 0, 0]
          for (let j = 0; j < 2; j++)
            for (let i = 0; i < 2; i++) {
              const at = ((r * 2 + j) * canvas.width + c * 2 + i) * 4
              ink += Math.hypot(255 - d[at], 255 - d[at + 1], 255 - d[at + 2]) / 441 / 4
              for (let k = 0; k < 3; k++) rgb[k] += d[at + k] / 4
            }
          raw.push({ r, c, ink, rgb })
        }
      // The 98th percentile of ink counts as full, so the picture fills the ramp.
      const sorted = raw.map(({ ink }) => ink).sort((a, b) => a - b)
      const top = sorted[Math.floor(sorted.length * 0.98)] || 1
      const cells: Cell[][] = Array.from({ length: rows }, () => Array<Cell>(cols).fill(null))
      for (const { r, c, ink, rgb } of raw) {
        const level = Math.min(1, ink / top)
        const v = Math.pow(level, 1 / gamma)
        if (v < cut || level < rawCut || v === 0) continue
        const glyph = ramp[Math.max(1, Math.round(v * (ramp.length - 1)))]
        // Deepened and more saturated, then laid on white at 60–100% for how much ink the cell has.
        const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
        const avg = (rgb[0] + rgb[1] + rgb[2]) / 3
        const k = Math.min(1, 0.78 / Math.max(0.01, lum)) * 0.9
        const alpha = 0.6 + 0.4 * v
        const color = rgb.map((x) => 255 + (Math.max(0, Math.min(255, (avg + (x - avg) * 1.6) * k)) - 255) * alpha)
        cells[r][c] = { glyph, rgb: color as [number, number, number] }
      }
      resolve(cells)
    }
    img.src = src
  })
}

// Groups the cells' colors into a few inks (k-means, started from the
// lightest to the darkest), so the picture is a few layers of text.
function inksOf(cells: Cell[][]): { palette: string[]; of: Map<Cell, number> } {
  const all = cells.flat().filter((cell): cell is NonNullable<Cell> => cell !== null)
  const lum = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  const byLum = [...all].sort((a, b) => lum(b.rgb) - lum(a.rgb))
  let centers = Array.from({ length: INKS }, (_, i) => byLum[Math.floor(((i + 0.5) / INKS) * byLum.length)].rgb.slice())
  const nearest = (rgb: number[]) => {
    let best = 0
    for (let i = 1; i < centers.length; i++)
      if (Math.hypot(...rgb.map((x, k) => x - centers[i][k])) < Math.hypot(...rgb.map((x, k) => x - centers[best][k]))) best = i
    return best
  }
  for (let round = 0; round < 12; round++) {
    const sums = centers.map(() => [0, 0, 0, 0])
    for (const cell of all) {
      const sum = sums[nearest(cell.rgb)]
      cell.rgb.forEach((x, k) => (sum[k] += x))
      sum[3]++
    }
    centers = centers.map((center, i) => (sums[i][3] ? sums[i].slice(0, 3).map((x) => x / sums[i][3]) : center))
  }
  centers.sort((a, b) => lum(b) - lum(a))
  const palette = centers.map((rgb) => "#" + rgb.map((x) => Math.round(x).toString(16).padStart(2, "0")).join(""))
  return { palette, of: new Map(all.map((cell) => [cell, nearest(cell.rgb)])) }
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
const page = await browser.newPage()
const out: string[] = []
for (const { file, name, ...settings } of PICTURES) {
  const src = `data:image/webp;base64,${readFileSync(path.join(here, file)).toString("base64")}`
  const cells = await page.evaluate(cellsOf, { src, ...settings, cols: COLUMNS, aspect: ASPECT, ramp: RAMP })
  const { palette, of } = inksOf(cells)
  const glyphs = cells.map((row) => row.map((cell) => cell?.glyph ?? " ").join(""))
  const inks = cells.map((row) => row.map((cell) => (cell ? String(of.get(cell)) : " ")).join(""))
  out.push(`export const ${name}: Picture = ${JSON.stringify({ palette, glyphs, inks })}`)
}
await browser.close()

const target = path.join(here, "pictures.ts")
const source = `// Made by make.mts from storm.webp and sun.webp: change those, or make.mts, and run it again.

/**
 * A picture in text: \`glyphs\` and \`inks\` are its rows, a glyph and the index
 * of its color in \`palette\` (lightest first) for each cell, a space where it's empty.
 */
export interface Picture {
  palette: string[]
  glyphs: string[]
  inks: string[]
}

${out.join("\n\n")}
`
writeFileSync(target, await format(source, { ...(await resolveConfig(target)), filepath: target }))
console.log(`Wrote ${path.relative(process.cwd(), target)}`)
