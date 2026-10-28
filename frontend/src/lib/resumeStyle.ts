// A resume's style: how it prints rather than what it says. That's its
// template, Fine-tune's settings, and the sections' print choices (Experience's
// "Print first", Projects' "Links"). The dashboard's Change style puts one on
// several resumes at once (RestyleModal.tsx), and can put each back as it was.

import { SECTION_NAMES, SECTIONS, type ChoiceKey } from "@/components/editor/sections"
import type { Resume } from "@/lib/resume"
import { changedPaths } from "@/lib/resumeStorage"
import { templateById, type TemplateId } from "@/lib/templates"
import { readTune, TEMPLATE_SETTINGS, withPaper, type Tune } from "@/lib/tune"

export const CHOICE_KEYS: readonly ChoiceKey[] = SECTION_NAMES.flatMap((name) => {
  const choice = SECTIONS[name].choice
  return choice ? [choice.key] : []
})

/** What a style change sets. What it leaves out stays as each resume has it. */
export interface StyleChange {
  template?: string
  /** Fine-tune's settings; null for the template's own. */
  tune?: Tune | null
  /** Each choice, or undefined for the section's first option. */
  choices?: { [Key in ChoiceKey]?: string | undefined }
}

/** All of a resume's style, to put on others or to put back. */
export interface ResumeStyle extends Required<StyleChange> {
  template: TemplateId
}

export function styleOf(resume: Resume): ResumeStyle {
  return {
    template: templateById(resume.selectedTemplate).id,
    tune: readTune(resume.tune).tune,
    choices: Object.fromEntries(CHOICE_KEYS.map((key) => [key, typeof resume[key] === "string" ? resume[key] : undefined])),
  }
}

/**
 * The fields of `resume` that `change` sets, and their paths for the store,
 * or null when it has that style already. A new template alone keeps the
 * resume's Fine-tune, on the paper it printed on.
 */
export function restyled(resume: Resume, change: StyleChange): { changes: Partial<Resume>; paths: string[] } | null {
  const before = styleOf(resume)
  const changes: Partial<Resume> = {}
  const template = change.template === undefined ? before.template : templateById(change.template).id
  if (template !== before.template) changes.selectedTemplate = template
  const paper = before.tune?.paper ?? TEMPLATE_SETTINGS[before.template].paper
  const tune = change.tune !== undefined ? readTune(change.tune).tune : withPaper(before.tune, template, paper)
  if (JSON.stringify(tune) !== JSON.stringify(before.tune)) changes.tune = tune
  for (const key of CHOICE_KEYS) {
    if (!change.choices || !(key in change.choices)) continue
    if (change.choices[key] !== before.choices[key]) changes[key] = change.choices[key]
  }
  const fields = Object.keys(changes) as (keyof Resume)[]
  if (fields.length === 0) return null
  return { changes, paths: fields.flatMap((field) => changedPaths(field, resume[field], changes[field])) }
}
