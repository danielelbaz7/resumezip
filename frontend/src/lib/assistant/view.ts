// A resume as the AI assistant is shown it: its sections by the names the
// actions use (schema.ts), with every entry, left-out ones too, so it can put
// them back. Not the checker's state, the tailoring, or when it was saved.

import { SECTION_NAMES, SECTIONS } from "@/components/editor/sections"
import { leftOutSectionsOf } from "@/lib/leftOut"
import type { Resume } from "@/lib/resume"
import { extrasOf, resolveSections } from "@/lib/resumeSections"
import { templateById } from "@/lib/templates"

export function assistantView(resume: Resume) {
  const order = resolveSections(resume)
  const sections = Object.fromEntries(
    SECTION_NAMES.filter((name) => order.includes(name)).map((name) => {
      const def = SECTIONS[name]
      return [
        name,
        {
          heading: resume.headings?.[def.headingKey] ?? null,
          ...(def.choice && { choice: resume[def.choice.key] ?? def.choice.options[0].value }),
          entries: resume[def.dataKey] ?? [],
        },
      ]
    }),
  )
  const extras = extrasOf(resume)
  return {
    name: resume.resumeTitle ?? "",
    template: templateById(resume.selectedTemplate).id,
    fineTune: resume.tune ?? {},
    profile: resume.profileSection ?? {},
    sectionOrder: order,
    sectionsLeftOut: leftOutSectionsOf(resume),
    sections,
    customSections: Object.fromEntries(Object.entries(extras).map(([key, section]) => [`extra:${key}`, section])),
  }
}
