// What a tailored resume changed from the one it was tailored from, word by
// word, so the editor can light the changes up on the preview (the editor's
// ChangesContext). Only what's printed is compared: what either leaves out of
// the PDF isn't a change anyone would see.

import { PROFILE_FIELDS, SECTION_NAMES, SECTIONS, type SectionName } from "@/components/editor/sections"
import { printedResume } from "@/lib/leftOut"
import type { Entry, Resume, TailoredFrom } from "@/lib/resume"
import { extrasOf } from "@/lib/resumeSections"

/** One thing changed: where it is, as the list on the left names it, and the words added there, as printed. */
export interface Change {
  /** The section it's in, to find its words on the preview there; null for the top of the resume. */
  section: SectionName | `extra:${string}` | null
  label: string
  /** Words added or changed: each as one run of them, as the PDF prints them. */
  added: string[]
}

/** A resume's tailoredFrom, read defensively: saved data is untrusted. Null when it wasn't tailored. */
export function tailoredFromOf(resume: Resume | undefined): TailoredFrom | null {
  const from = resume?.tailoredFrom
  if (!from || typeof from !== "object") return null
  const { resumeId, title, jobId, at } = from as Partial<Record<keyof TailoredFrom, unknown>>
  if (typeof resumeId !== "string" || !resumeId) return null
  return {
    resumeId,
    title: typeof title === "string" ? title : "",
    jobId: typeof jobId === "string" ? jobId : "",
    at: typeof at === "string" && !Number.isNaN(Date.parse(at)) ? at : "",
  }
}

// Bold and italic marks and a line's bullet, which aren't printed as words.
const printed = (text: string) =>
  text
    .replace(/\*+/g, "")
    .replace(/^\s*[•○]\s*/, "")
    .trim()
// A word as words are compared: lower case, without the punctuation round it, so "Go," is "go".
const key = (word: string) => word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, "")

/**
 * The runs of words in `now` that `before` doesn't have, in order: the
 * longest common run of words is kept, by the usual dynamic program, and
 * what's left of `now` is added. Punctuation that ends a run (a list's
 * comma) is taken off it.
 */
export function addedWords(before: string, now: string): string[] {
  const a = printed(before).split(/\s+/).filter(Boolean)
  const b = printed(now).split(/\s+/).filter(Boolean)
  const keysA = a.map(key)
  const keysB = b.map(key)
  // lengths[i][j]: the longest common run of a's words from i and b's from j.
  const lengths = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = keysA[i] === keysB[j] && keysA[i] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }
  const kept = new Array<boolean>(b.length).fill(false)
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (keysA[i] === keysB[j] && keysA[i]) {
      kept[j] = true
      i++
      j++
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) i++
    else j++
  }
  const runs: string[] = []
  let run: string[] = []
  b.forEach((word, index) => {
    if (!kept[index] && key(word)) run.push(word)
    else if (kept[index] && run.length) {
      runs.push(run.join(" "))
      run = []
    }
  })
  if (run.length) runs.push(run.join(" "))
  return runs.map((words) => words.replace(/[,;:]+$/, ""))
}

const linesOf = (text: string | undefined) => (text ?? "").split("\n").map(printed).filter(Boolean)

// What a field of bullets added: each line the original doesn't have, word for word where it's like one it has.
function addedLines(before: string | undefined, now: string | undefined): string[] {
  const old = linesOf(before)
  const kept = new Set(old.map((line) => line.toLowerCase()))
  return linesOf(now).flatMap((line) => {
    if (kept.has(line.toLowerCase())) return []
    // Its closest line in the original, by how many of its words that has: a rewrite of it, if most of them are.
    const words = new Set(line.split(/\s+/).map(key))
    const closest = old
      .map((other) => ({ other, shared: other.split(/\s+/).filter((word) => words.has(key(word))).length }))
      .sort((x, y) => y.shared - x.shared)[0]
    return closest && closest.shared >= words.size / 2 ? addedWords(closest.other, line) : [line]
  })
}

const entriesOf = (value: unknown): Entry[] => (Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") : [])

/**
 * What `copy` added or changed from `original`, as printed: words added to
 * a field, lines added to its bullets, and an entry or added section that
 * the original doesn't have, all of it. What was taken out isn't listed,
 * since there's nothing on the copy's page to light up.
 */
export function changesOf(copy: Resume, original: Resume): Change[] {
  const now = printedResume(copy)
  const before = printedResume(original)
  const changes: Change[] = []
  const push = (section: Change["section"], label: string, added: string[]) => {
    const kept = added.filter((words) => words.trim())
    if (kept.length) changes.push({ section, label, added: kept })
  }

  for (const field of PROFILE_FIELDS) {
    const text = now.profileSection?.[field.key] ?? ""
    const was = before.profileSection?.[field.key] ?? ""
    if (text !== was) push(null, field.label, field.multiline ? addedLines(was, text) : addedWords(was, text))
  }

  for (const name of SECTION_NAMES) {
    const { dataKey, fields, title, card, summary } = SECTIONS[name]
    const heading = now.headings?.[SECTIONS[name].headingKey] || title
    const old = new Map(entriesOf(before[dataKey]).map((entry) => [entry.id, entry]))
    for (const entry of entriesOf(now[dataKey])) {
      const was = old.get(entry.id)
      const named = [...(card ?? summary)].map((field) => printed(entry[field] ?? "")).find(Boolean) ?? ""
      const label = named ? `${heading} · ${named}` : heading
      const added = fields.flatMap((field) => {
        const text = entry[field.key]
        const oldText = was?.[field.key]
        if ((text ?? "") === (oldText ?? "")) return []
        return field.type === "bullets" ? addedLines(oldText, text) : addedWords(oldText ?? "", text ?? "")
      })
      push(name, was ? label : `${label} (new)`, added)
    }
  }

  const oldExtras = extrasOf(before)
  for (const [id, section] of Object.entries(extrasOf(now))) {
    const was = oldExtras[id]
    const text = section.kind === "text" ? section.text : section.bullets
    const oldText = was ? (was.kind === "text" ? was.text : was.bullets) : ""
    if (text === oldText) continue
    push(`extra:${id}`, was ? section.heading || "Added section" : `${section.heading || "Added section"} (new)`, addedLines(oldText, text))
  }
  return changes
}
