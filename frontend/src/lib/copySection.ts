// A section of one resume copied into others, from the editor's section
// heading (CopySection.tsx). The store commits what this works out
// (resumeStore.ts copySection), so another tab's change to a different
// section of the same resume is kept.

import { SECTION_NAMES, SECTIONS, type SectionName } from "@/components/editor/sections"
import type { Entry, Resume } from "@/lib/resume"
import { changedPaths } from "@/lib/resumeStorage"
import { extraKey, extraRef, extrasOf, resolveSections, type ExtraSection, type ExtraSections, type SectionRef } from "@/lib/resumeSections"

/** "add": after what the other resume has in that section; "replace": in its place. */
export type CopyMode = "add" | "replace"

export interface SectionCopy {
  changes: Partial<Resume>
  /** What changed, as the store's commit and mergeResume take them. */
  paths: string[]
}

const sameHeading = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * `source`'s section `ref` put into `target`. An editor section's entries
 * (only those with ids in `only`, when it's given) get ids of their own there,
 * and its renamed heading and choice go with them where the target has none,
 * or replaces its own. A section the person added is copied into the one of
 * the same kind and heading, or added as a new one. Null when there's nothing
 * to copy.
 */
export function copiedSection(
  source: Resume,
  target: Resume,
  ref: SectionRef,
  mode: CopyMode,
  only?: readonly number[],
): SectionCopy | null {
  const key = extraKey(ref)
  if (key !== null) return copiedExtra(source, target, key, mode)
  if (!SECTION_NAMES.includes(ref as SectionName)) return null
  const section = SECTIONS[ref as SectionName]
  const { dataKey, headingKey } = section
  const theirs: Entry[] = Array.isArray(source[dataKey]) ? source[dataKey] : []
  const chosen = only ? theirs.filter((entry) => only.includes(entry.id)) : theirs
  if (chosen.length === 0) return null

  const own: Entry[] = Array.isArray(target[dataKey]) ? target[dataKey] : []
  let next = Math.max(0, ...own.map((entry) => entry.id)) + 1
  const copied = chosen.map((entry) => ({ ...structuredClone(entry), id: next++ }))
  const changes: Partial<Resume> = { [dataKey]: mode === "add" ? [...own, ...copied] : copied }
  const paths: string[] = [dataKey]

  const order = resolveSections(target)
  if (!order.includes(ref)) {
    changes.sectionOrder = [...order, ref]
    paths.push("sectionOrder")
  }

  const heading = source.headings?.[headingKey]
  if (heading && (mode === "replace" || !target.headings?.[headingKey])) {
    const headings = { ...target.headings, [headingKey]: heading }
    changes.headings = headings
    paths.push(...changedPaths("headings", target.headings, headings))
  }

  const choice = section.choice?.key
  if (choice && source[choice] !== undefined && (mode === "replace" || target[choice] === undefined)) {
    changes[choice] = source[choice]
    paths.push(choice)
  }
  return { changes, paths }
}

function copiedExtra(source: Resume, target: Resume, key: string, mode: CopyMode): SectionCopy | null {
  const section = extrasOf(source)[key]
  if (!section) return null
  const extras: ExtraSections = target.extraSections ?? {}
  const match = Object.entries(extrasOf(target)).find(([, own]) => own.kind === section.kind && sameHeading(own.heading, section.heading))
  if (match) {
    const [ownKey, own] = match
    const joined = (mine: string, copied: string, gap: string) => (mode === "replace" || !mine.trim() ? copied : `${mine}${gap}${copied}`)
    const after: ExtraSection =
      own.kind === "list" && section.kind === "list"
        ? { ...own, bullets: joined(own.bullets, section.bullets, "\n") }
        : own.kind === "text" && section.kind === "text"
          ? { ...own, text: joined(own.text, section.text, "\n\n") }
          : own
    return { changes: { extraSections: { ...extras, [ownKey]: after } }, paths: [`extraSections.${ownKey}`] }
  }
  const added = crypto.randomUUID()
  return {
    changes: {
      extraSections: { ...extras, [added]: structuredClone(section) },
      sectionOrder: [...resolveSections(target), extraRef(added)],
    },
    paths: [`extraSections.${added}`, "sectionOrder"],
  }
}
