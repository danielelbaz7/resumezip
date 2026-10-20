// How the Check panel says where a finding is ("Experience → Google ·
// bullet 2"), what the form calls a field, and whether there's enough of a
// resume to check yet.

import { PROFILE_FIELDS, SECTION_NAMES, SECTIONS, type FieldKey, type FieldKeyOf, type SectionName } from "@/components/editor/sections"
import { entryPlace, textAt, type Place } from "./places"
import { entryAt, type Entry, type ResumeView } from "./resume"

/**
 * A name and at least one entry with something in it. Until then the
 * checker would only list what's missing, so the panel asks for that instead.
 */
export function hasEnoughToCheck(view: ResumeView): boolean {
  return (
    view.profile.fullName !== "" &&
    (SECTION_NAMES.some((section) => view.sections[section].some((entry) => !entry.blank)) ||
      Object.values(view.extras).some((extra) => !extra.blank))
  )
}

/** A field's label in the form ("Role"), or its key if the section has no such field. */
export const labelOf = (section: SectionName, field: FieldKey) => SECTIONS[section].fields.find((def) => def.key === field)?.label ?? field

// What an entry is best known by in a short label: its company, school or
// project, rather than a role that several entries can share.
const NAME_FIELD: { [Section in SectionName]: FieldKeyOf<Section> } = {
  Education: "schoolName",
  Work: "companyName",
  Skills: "skillName",
  Projects: "projectName",
  Publications: "publicationTitle",
  Volunteership: "volunteerOrg",
  Leadership: "leadershipOrg",
  Awards: "awardName",
}

// An entry by that name, or as the editor shows it collapsed, or by its number.
function entryName(view: ResumeView, entry: Entry | undefined, index: number): string {
  if (!entry) return `Entry ${index + 1}`
  return entry.values[NAME_FIELD[entry.section]] || textAt(view, entryPlace(entry)) || `Entry ${index + 1}`
}

/**
 * Where a finding is, in a few words: "Profile → Email", "Education",
 * "Experience → Google · bullet 2", "Page 2".
 */
export function describePlace(view: ResumeView, place: Place): string {
  switch (place.kind) {
    case "extra-heading":
      return `${view.extras[place.sectionId]?.heading ?? "Section"} → Section title`
    case "extra-text": {
      const extra = view.extras[place.sectionId]
      const bullet = extra?.bullets.find((bullet) => bullet.line === place.line)
      return `${extra?.heading ?? "Section"}${bullet ? ` · bullet ${bullet.number}` : ""}`
    }
    case "profile":
      return `Profile → ${PROFILE_FIELDS.find((field) => field.key === place.field)?.label ?? place.field}`
    case "heading":
      return `${view.printedHeadings[place.section]} → Section title`
    case "section":
      return view.printedHeadings[place.section]
    case "entry": {
      const entry = entryAt(view, place.section, place.entry)
      const label = `${view.printedHeadings[place.section]} → ${entryName(view, entry, place.entry)}`
      if (place.line !== undefined) {
        const bullet = entry?.bullets.find((bullet) => bullet.field === place.field && bullet.line === place.line)
        return bullet ? `${label} · bullet ${bullet.number}` : label
      }
      const field = SECTIONS[place.section].fields.find((field) => field.key === place.field)
      return field ? `${label} · ${field.label}` : label
    }
    case "page":
      return place.page === undefined ? "The PDF" : `Page ${place.page}`
  }
}
