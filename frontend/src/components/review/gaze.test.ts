import { expect, test } from "vitest"
import type { Line } from "@/lib/import/lines"
import { GAZE_MS, gazeOf } from "./gaze"

const LETTER = { width: 612, height: 792 }

// A printed line, as the reading gives it: where it is on page 1, and whether it's a bullet.
function line(text: string, [left, top, right, bottom]: [number, number, number, number], bullet = false, x = left): Line {
  return { parts: [], text, bullet, left, x, size: 10, bold: false, italic: false, links: [], page: 1, box: [left, top, right, bottom] }
}

// The top of Jake's template, as Marcus Bell's test resume prints.
const LINES = [
  line("Marcus Bell", [215, 33, 396, 58]),
  line("Ann Arbor, MI | (555) 013-4471 | marcus.bell@example.com", [54, 60, 558, 70]),
  line("Education", [29, 86, 91, 98]),
  line("University of Michigan Sep 2023 - May 2027", [40, 106, 578, 117]),
  line("B.S.E. in Computer Science, Minor in Mathematics Ann Arbor, MI", [40, 121, 578, 131]),
  line("Relevant Coursework: Data Structures and Algorithms, Operating Systems, Web", [57, 136, 549, 146], true, 69),
  line("Systems, Machine Learning", [69, 148, 189, 158]),
  line("Involvements: Michigan Hackers, Solar Car Team", [57, 163, 482, 173], true, 69),
  line("Experience", [29, 187, 96, 199]),
  line("Software Engineering Intern May 2026 - Aug 2026", [40, 207, 578, 218]),
  line("Google Mountain View, CA", [40, 222, 578, 232]),
  line("Responsible for working on backend services for Google Maps", [57, 237, 339, 247], true, 69),
  line("Helped the team with various tasks", [57, 252, 376, 262], true, 69),
  line("Instructional Aide, Data Structures and Algorithms Sep 2024 - Dec 2025", [40, 375, 578, 386]),
]

const stops = gazeOf(LINES, LETTER)
const on = (y0: number, y1: number) => stops.filter(({ y }) => y >= y0 && y <= y1)

test("starts on the name, read whole, and takes seven seconds in all", () => {
  expect(stops[0]).toMatchObject({ x: (215 + 396) / 2, y: 45.5 })
  expect(stops.reduce((sum, { ms }) => sum + ms, 0)).toBeCloseTo(GAZE_MS)
})

test("reads each entry from the left, glancing right at its dates", () => {
  const school = on(106, 117)
  expect(school).toHaveLength(2)
  expect(school[0].x).toBeLessThan(120)
  expect(school[1].x).toBe(578 - 36)
  // A line whose right end is a place, not dates, is read from the left alone.
  expect(on(121, 131)).toHaveLength(1)
})

test("reads only the first bullet under an entry, and passes over headings and wrapped lines", () => {
  expect(on(136, 146)).toHaveLength(1)
  expect(on(148, 158)).toHaveLength(0)
  expect(on(163, 173)).toHaveLength(0)
  expect(on(86, 98)).toHaveLength(0)
  expect(on(187, 199)).toHaveLength(0)
  expect(on(237, 247)).toHaveLength(1)
  expect(on(252, 262)).toHaveLength(0)
})

test("stays on the top of the page, where the page being read shows above the fog", () => {
  expect(on(300, 792)).toHaveLength(0)
})

test("has nowhere to look on a page with nothing printed on it", () => {
  expect(gazeOf([], LETTER)).toEqual([])
})
