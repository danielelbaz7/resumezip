// A page's marks as the server renders them: which fade when a note is open.

import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { expect, test } from "vitest"
import { PageMarks, type Placed } from "./PageMarks"

const placed = (key: string, top: number): Placed => ({
  note: { key, ink: "look", label: null, title: key, body: null, rewrite: null, place: "", drawn: null },
  page: 1,
  scribble: { kind: "underline", boxes: [[10, top, 100, top + 10]] },
  area: [6, top - 3, 104, top + 13],
})

const marked = (open: string | null) =>
  renderToString(
    createElement(PageMarks, {
      page: 1,
      size: { width: 612, height: 792 },
      placed: [placed("check:a", 10), placed("check:b", 40)],
      open,
      onOpen: () => {},
    }),
  )

test("the other marks fade behind the open note's", () => {
  expect(marked("check:a").match(/data-quiet/g)).toHaveLength(1)
  expect(marked(null)).not.toContain("data-quiet")
})

test("a note with no mark, as a Check panel row whose finding isn't drawn, fades nothing", () => {
  expect(marked("check:c")).not.toContain("data-quiet")
})
