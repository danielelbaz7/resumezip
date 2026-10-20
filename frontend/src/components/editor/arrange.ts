// Editing a bullets field's text, where each bullet is a line starting with
// "•", or "○" when it's left out (see lib/leftOut.ts): what Enter, typing and
// pasting do. Blank lines stay where they are. The bullets box (styledText.ts)
// does the same with bold and italic words.

import { BULLET_CHARS } from "@/lib/import/lines"
import { isLeftOutLine, LEFT_OUT_BULLET } from "@/lib/leftOut"

export interface BulletLine {
  /** Its line in the text, from 0. */
  line: number
  /** Its words, without the "•" or "○". */
  words: string
  leftOut: boolean
}

const wordsOf = (line: string) => line.trim().replace(/^[•○]\s*/, "")

/**
 * The text as the text box shows it: every non-empty line starts with "• ",
 * so it reads like the PDF, or "○ " for a bullet that's left out. A bullet
 * set in from the left, or followed by a tab (as lists pasted from Word
 * are), counts the same, so "  ○ Fed the cat" and "○\tFed the cat" stay left
 * out. Otherwise only a missing space after the bullet is added, so nothing
 * moves under the cursor while typing.
 */
export function withBullets(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line
      const unindented = /^\s+[•○]/.test(line) ? line.trimStart() : line
      if (unindented === "•" || unindented === "○") return unindented
      if (/^[•○]([^\s]|$)/.test(unindented)) return unindented.replace(/^([•○])/, "$1 ")
      // A bullet with any space after it is kept as typed.
      return /^[•○]/.test(unindented) ? unindented : `• ${unindented}`
    })
    .join("\n")
}

/**
 * Where a cursor at `at` in `text` goes once `withBullets` has given its lines
 * their bullets. Bullets only change the start of a line: past that, the
 * cursor moves along with the words, so it ends up after a bullet added at
 * the start of its line. Within it, it stays where it was, so it's never moved
 * by what changes after it.
 */
export function cursorWithBullets(text: string, at: number): number {
  const before = text.slice(0, at).split("\n")
  const line = before.length - 1
  const column = before[line].length
  const typed = text.split("\n")[line]
  const lines = withBullets(text).split("\n")
  const shown = lines[line]
  // How much of the line's end is as typed: the rest is its start, changed.
  const same = sameEnd(typed, shown)
  const start = offsetOfLine(lines, line)
  return start + (column >= typed.length - same ? column + shown.length - typed.length : Math.min(column, shown.length - same))
}

// A list marker at the start of a line, as lists copied from elsewhere have:
// a symbol from BULLET_CHARS, like "●", "▪", the "○" of Google Docs'
// sub-bullets or Word's "", or "- ", "* ", "– ", "— ", "1. " or "1) ", up to
// "999. ". Not "-5%", "*bold*", "1.5x", or a year, as in "2019. Promoted". No
// word starts with one of the symbols, so they can touch their words.
const LIST_MARKER = new RegExp(String.raw`^\s*(?:[${BULLET_CHARS}]\s*|(?:[-–—*]|\d{1,3}[.)])\s+)`)

/**
 * The line a list is pasted into, up to the cursor (`before`), with `text`
 * pasted after it: a bullet in place of each list marker that starts a line,
 * so a pasted list gets one bullet per line, not two. After a bullet in
 * `before`, the first line's marker just goes; after words, it isn't at the
 * start of a line, so it stays.
 *
 * A "○" pasted from elsewhere is a sub-bullet, so it's printed. Text copied
 * from a bullets box (`copiedHere`) keeps its own bullets instead, so a
 * left-out one cut and pasted stays left out, even onto a new line's "• ".
 */
export function pastedList(text: string, before: string, copiedHere = false): string {
  const own = (line: string) => copiedHere && /^\s*[•○]/.test(line)
  const listed = (line: string) => (own(line) ? line : line.replace(LIST_MARKER, "• "))
  const [first, ...rest] = text.split("\n")
  let head = before + first
  if (!before.trim()) head = before + listed(first)
  else if (/^\s*[•○]\s*$/.test(before)) head = own(first) ? first : before + first.replace(LIST_MARKER, "")
  return [head, ...rest.map(listed)].join("\n")
}

// A bullet, then "- " or "* " (or "– ", "— "), up to the cursor.
const TYPED_MARKER = /^([•○])[^\S\n]*[-–—*][^\S\n]$/

/**
 * The line up to the cursor (`before`), with `typed` typed after it. "- " or
 * "* " at the start of a line starts a list in other editors, but here the
 * line has its bullet already, so the marker goes once the space after it is
 * typed. Only then, so "-5%" stays as typed.
 */
export const typedList = (before: string, typed: string) => (before + typed).replace(TYPED_MARKER, "$1 ")

/** The bullets in a field's text, in order. */
export function bulletLines(text: string): BulletLine[] {
  return text.split("\n").flatMap((line, index) => {
    const words = wordsOf(line)
    return words ? [{ line: index, words, leftOut: isLeftOutLine(line) }] : []
  })
}

/** Where the line with `at` in it starts. */
export const lineStartOf = (text: string, at: number) => (at > 0 ? text.lastIndexOf("\n", at - 1) + 1 : 0)

/** Where line `index` (from 0) starts in the text that was split into `lines`. */
export const offsetOfLine = (lines: readonly string[], index: number) =>
  lines.slice(0, index).reduce((total, line) => total + line.length + 1, 0)

/** How many characters at the end of `a` are the same as at the end of `b`: the length of their common suffix. */
export function sameEnd(a: string, b: string): number {
  let same = 0
  while (same < a.length && same < b.length && a[a.length - 1 - same] === b[b.length - 1 - same]) same++
  return same
}

/** Text with the cursor, or a selection, in it. */
export interface Edited {
  text: string
  start: number
  end: number
}

/**
 * What Enter does, with the cursor (or a selection) from start to end: the
 * words after the cursor go on a new bullet below. They stay left out if
 * their bullet was, so no part of a left-out bullet gets printed, but a
 * bullet with no words yet is printed. At the start of a line, it adds none.
 */
export function newBullet(text: string, start: number, end = start): Edited {
  const from = lineStartOf(text, start)
  if (start === from) return { text: text.slice(0, start) + text.slice(end), start, end: start }
  const head = text.slice(from, start)
  const rest = text.slice(end).replace(/^[^\S\n]+/, "")
  const leftOut = isLeftOutLine(head)
  const bullet = leftOut && wordsOf(rest.split("\n")[0]) ? LEFT_OUT_BULLET : "•"
  // A left-out bullet that's left with no words is a new one now.
  const kept = leftOut && !wordsOf(head) ? `•${head.slice(1)}` : head
  const cursor = start + 3
  return { text: `${text.slice(0, from)}${kept}\n${bullet} ${rest}`, start: cursor, end: cursor }
}
