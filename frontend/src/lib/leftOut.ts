// What's left out of a resume: entries, bullets and sections the person added,
// kept in the editor but not printed, so one resume can be tailored to a job
// without deleting anything. A left-out entry or section has `leftOut: true`;
// a left-out bullet starts with "○" where a printed one has "•". Older
// resumes have neither, so they print as they always have.

import { SECTION_NAMES, SECTIONS, type SectionName } from "@/components/editor/sections"
import type { Resume } from "@/lib/resume"
import { extraKey, extrasOf, sectionIncluded, type ExtraSection } from "./resumeSections"

/** What a left-out bullet starts with, instead of "•". */
export const LEFT_OUT_BULLET = "○"

/** Whether a line of a bullet field is left out. */
export const isLeftOutLine = (line: unknown) => typeof line === "string" && line.trimStart().startsWith(LEFT_OUT_BULLET)

/** Whether an entry is left out. */
export const isLeftOut = (entry: unknown) =>
  typeof entry === "object" && entry !== null && (entry as { leftOut?: unknown }).leftOut === true

// A bullet field's lines. Older resumes kept bullets as a list.
const linesOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : typeof value === "string" ? value.split("\n") : [])

// A bullet field without its left-out lines.
const printedBullets = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((line) => !isLeftOutLine(line))
    : typeof value === "string"
      ? value
          .split("\n")
          .filter((line) => !isLeftOutLine(line))
          .join("\n")
      : value

/** The editor's sections left out of the PDF, read defensively: only names of its sections, once each. */
export function leftOutSectionsOf(resume: { leftOutSections?: unknown }): SectionName[] {
  const saved = resume.leftOutSections
  return Array.isArray(saved) ? SECTION_NAMES.filter((name) => saved.includes(name)) : []
}

/** The saved left-out sections with `name` left out, or put back in, in the editor's order; null once none is. */
export function withSectionLeftOut(saved: unknown, name: SectionName, leftOut: boolean): SectionName[] | null {
  const others = leftOutSectionsOf({ leftOutSections: saved }).filter((other) => other !== name)
  const next = leftOut ? SECTION_NAMES.filter((other) => other === name || others.includes(other)) : others
  return next.length > 0 ? next : null
}

/** Whether anything in the resume is left out: a section, an entry, a bullet, or a section the person added. */
export function hasLeftOut(resume: Resume): boolean {
  if (leftOutSectionsOf(resume).length > 0) return true
  const extraLeftOut = Object.values(extrasOf(resume)).some(
    (section) => !sectionIncluded(section) || (section.kind === "list" && section.bullets.split("\n").some(isLeftOutLine)),
  )
  return (
    extraLeftOut ||
    Object.values(SECTIONS).some(({ dataKey, fields }) => {
      const entries = resume[dataKey]
      return (
        Array.isArray(entries) &&
        entries.some(
          (entry: unknown) =>
            isLeftOut(entry) ||
            (typeof entry === "object" &&
              entry !== null &&
              fields.some(
                (field) => field.type === "bullets" && linesOf((entry as Record<string, unknown>)[field.key]).some(isLeftOutLine),
              )),
        )
      )
    })
  )
}

/**
 * The resume as it's printed: without left-out sections, entries, bullets
 * and added sections. It's what the PDF shows, and all the copy of the resume inside
 * the PDF holds, since anyone who gets the PDF can read that copy.
 */
export function printedResume(resume: Resume): Resume {
  // Saved entries are only checked for shape, so they're read as unknown here.
  const printed: Record<string, unknown> = { ...resume }
  const gone = leftOutSectionsOf(resume)
  delete printed.leftOutSections
  if (gone.length > 0 && Array.isArray(printed.sectionOrder))
    printed.sectionOrder = printed.sectionOrder.filter((ref: unknown) => !gone.includes(ref as SectionName))
  for (const name of SECTION_NAMES) {
    const { dataKey, fields } = SECTIONS[name]
    if (gone.includes(name)) {
      printed[dataKey] = []
      continue
    }
    const entries: unknown = resume[dataKey]
    if (!Array.isArray(entries)) continue
    printed[dataKey] = entries
      .filter((entry: unknown) => !isLeftOut(entry))
      .map((entry: unknown) => {
        if (typeof entry !== "object" || entry === null) return entry
        const { leftOut, ...kept } = entry as Record<string, unknown>
        for (const field of fields) {
          if (field.type === "bullets" && field.key in kept) kept[field.key] = printedBullets(kept[field.key])
        }
        return kept
      })
  }
  if (resume.extraSections !== undefined) {
    const extras = Object.fromEntries(
      Object.entries(extrasOf(resume))
        .filter(([, section]) => sectionIncluded(section))
        .map(([key, section]) => {
          const { leftOut, ...kept } = section
          if (kept.kind === "list") kept.bullets = printedBullets(kept.bullets) as string
          return [key, kept as ExtraSection]
        }),
    )
    printed.extraSections = extras
    if (Array.isArray(printed.sectionOrder))
      printed.sectionOrder = printed.sectionOrder.filter(
        (ref: unknown) => typeof ref !== "string" || extraKey(ref) === null || Object.hasOwn(extras, extraKey(ref)!),
      )
  }
  return printed as Resume
}
