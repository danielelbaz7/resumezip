// Doing what the AI assistant answered (schema.ts) to copies of the resumes,
// in order, so an action can build on the one before it. Each is checked
// against the resume it names: one that doesn't fit (a section or entry that
// isn't there, a field the section doesn't have) is skipped and said, never
// guessed at. What comes back is each changed resume's changed fields, for the
// store to save at once (ResumeStore.rewrite) and put back with Undo.

import { withBullets } from "@/components/editor/arrange"
import { PROFILE_FIELDS, SECTION_NAMES, SECTIONS, type SectionDef, type SectionName } from "@/components/editor/sections"
import { copiedSection } from "@/lib/copySection"
import { withSectionLeftOut } from "@/lib/leftOut"
import type { Entry, Resume } from "@/lib/resume"
import { extraHeading, extraKey, extraRef, extrasOf, resolveSections, type ExtraSection, type SectionRef } from "@/lib/resumeSections"
import { restyled } from "@/lib/resumeStyle"
import { TEMPLATES } from "@/lib/templates"
import { PAPERS, SCALES, withSetting, type Paper, type TuneScale } from "@/lib/tune"
import { actionOf, type Action, type Field } from "./schema"

export interface Applied {
  /** The fields each changed resume has now, by its id; a field taken away is there as undefined. */
  edits: Record<string, Partial<Resume>>
  /** What was done, a line for each action, for the person. */
  done: string[]
  /** Why each action that was skipped was, for the person. */
  failed: string[]
}

class Skipped extends Error {}
const skip = (why: string): never => {
  throw new Skipped(why)
}

const entryName = (def: SectionDef, entry: Entry) =>
  (def.card ?? def.summary).map((key) => entry[key]?.trim()).find(Boolean) ?? `the ${def.title} entry ${entry.id}`

const isBuiltIn = (ref: string | null): ref is SectionName => SECTION_NAMES.includes(ref as SectionName)

function builtIn(ref: string | null): SectionDef {
  if (isBuiltIn(ref)) return SECTIONS[ref]
  // The model may name a section by its title ("Experience") rather than its name.
  const byTitle = SECTION_NAMES.find((name) => SECTIONS[name].title.toLowerCase() === ref?.trim().toLowerCase())
  return byTitle ? SECTIONS[byTitle] : skip(`There's no section called ${ref ?? "(none)"}.`)
}

function custom(resume: Resume, ref: string | null): [string, ExtraSection] {
  const key = ref === null ? null : extraKey(ref)
  const extras = extrasOf(resume)
  return key !== null && Object.hasOwn(extras, key) ? [key, extras[key]] : skip(`There's no section ${ref ?? "(none)"}.`)
}

const entriesOf = (resume: Resume, def: SectionDef): Entry[] => resume[def.dataKey] ?? []

function entryOf(resume: Resume, def: SectionDef, id: number | null): [Entry[], number] {
  const entries = entriesOf(resume, def)
  const index = entries.findIndex((entry) => entry.id === id)
  return index >= 0 ? [entries, index] : skip(`There's no entry ${id ?? "(none)"} in ${def.title}.`)
}

/** An entry with `fields` set, a blank value clearing one; bullets get their "• " as the editor gives them. */
function withFields(def: SectionDef, entry: Entry, fields: readonly Field[]): Entry {
  const next: Entry = { ...entry }
  for (const { key, value } of fields) {
    if (key === "underlineName" && def.underlineName) {
      if (value === "true") next.underlineName = true
      else delete next.underlineName
      continue
    }
    const field = def.fields.find((option) => option.key === key) ?? skip(`${def.title} has no field called ${key}.`)
    const text = field.type === "bullets" ? withBullets(value.replace(/\r/g, "").trim()) : value.trim()
    if (text) next[field.key] = text
    else delete next[field.key]
  }
  return next
}

/** The order with `ref` in it, at the end if it wasn't. */
const withSection = (resume: Resume, ref: SectionRef): SectionRef[] => {
  const order = resolveSections(resume)
  return order.includes(ref) ? order : [...order, ref]
}

// Not Array's with and toSpliced, which Safari before 16 lacks.
const replaced = <T>(list: readonly T[], index: number, item: T) => list.map((other, at) => (at === index ? item : other))
const inserted = <T>(list: readonly T[], index: number, item: T) => [...list.slice(0, index), item, ...list.slice(index)]
const removed = <T>(list: readonly T[], index: number) => list.filter((_, at) => at !== index)

const clamp = (position: number | null, length: number) => (position === null ? length : Math.max(0, Math.min(length, position)))

function tuneValue(key: string, value: string): [TuneScale | "paper" | "onePage", number | Paper | boolean | undefined] {
  const blank = value.trim() === ""
  if (Object.hasOwn(SCALES, key)) {
    const number = Number(value)
    if (!blank && !Number.isFinite(number)) skip(`Fine-tune's ${key} has to be a number.`)
    return [key as TuneScale, blank ? undefined : number]
  }
  if (key === "paper")
    return [key, blank ? undefined : PAPERS.includes(value as Paper) ? (value as Paper) : skip(`There's no ${value} paper.`)]
  if (key === "onePage") return [key, value === "true" ? true : undefined]
  return skip(`Fine-tune has no ${key}.`)
}

/**
 * Does one action to `resumes` (the copies), and says what it did. `get`
 * gives the copy of a resume by its id.
 */
function act(action: Action, get: (id: string) => Resume | undefined, openId: string): string {
  const id = action.resume ?? openId
  const resume = get(id) ?? skip(`There's no resume ${id}.`)
  const { op, fields, value } = action

  switch (op) {
    case "set_profile": {
      const profile = { ...resume.profileSection }
      for (const { key, value: text } of fields) {
        const field = PROFILE_FIELDS.find((option) => option.key === key) ?? skip(`The profile has no field called ${key}.`)
        if (text.trim()) profile[field.key] = text.trim()
        else delete profile[field.key]
      }
      resume.profileSection = profile
      return `Changed ${fields.map(({ key }) => PROFILE_FIELDS.find((field) => field.key === key)!.label).join(", ")} in your profile.`
    }
    case "edit_entry": {
      const def = builtIn(action.section)
      const [entries, index] = entryOf(resume, def, action.entry)
      const entry = withFields(def, entries[index], fields)
      resume[def.dataKey] = replaced(entries, index, entry)
      return `Changed ${entryName(def, entry)}.`
    }
    case "add_entry": {
      const def = builtIn(action.section)
      const entries = entriesOf(resume, def)
      const entry = withFields(def, { id: Math.max(0, ...entries.map((other) => other.id)) + 1 }, fields)
      resume[def.dataKey] = inserted(entries, clamp(action.position, entries.length), entry)
      resume.sectionOrder = withSection(resume, def.name)
      return `Added ${entryName(def, entry)} to ${def.title}.`
    }
    case "delete_entry": {
      const def = builtIn(action.section)
      const [entries, index] = entryOf(resume, def, action.entry)
      resume[def.dataKey] = removed(entries, index)
      return `Deleted ${entryName(def, entries[index])}.`
    }
    case "move_entry": {
      const def = builtIn(action.section)
      const [entries, index] = entryOf(resume, def, action.entry)
      const rest = removed(entries, index)
      resume[def.dataKey] = inserted(rest, clamp(action.position, rest.length), entries[index])
      return `Moved ${entryName(def, entries[index])}.`
    }
    case "leave_out_entry":
    case "include_entry": {
      const def = builtIn(action.section)
      const [entries, index] = entryOf(resume, def, action.entry)
      const { leftOut: _, ...entry } = entries[index]
      resume[def.dataKey] = replaced(entries, index, op === "leave_out_entry" ? { ...entry, leftOut: true } : entry)
      return `${op === "leave_out_entry" ? "Left out" : "Put back"} ${entryName(def, entry)}.`
    }
    case "add_section": {
      const def = builtIn(action.section)
      resume.sectionOrder = withSection(resume, def.name)
      return `Added ${def.title}.`
    }
    case "add_custom_section": {
      const heading = value?.trim() || skip("A new section needs a heading.")
      const bullets = fields.find((field) => field.key === "bullets")
      const section: ExtraSection = bullets
        ? { kind: "list", heading, bullets: withBullets(bullets.value.trim()) }
        : { kind: "text", heading, text: fields.find((field) => field.key === "text")?.value.trim() ?? "" }
      const key = crypto.randomUUID()
      resume.extraSections = { ...extrasOf(resume), [key]: section }
      resume.sectionOrder = withSection(resume, extraRef(key))
      return `Added ${heading}.`
    }
    case "edit_custom_section": {
      const [key, before] = custom(resume, action.section)
      let section = before
      for (const { key: name, value: text } of fields) {
        if (name === "heading") section = { ...section, heading: text.trim() }
        else if (name === "text" && section.kind === "text") section = { ...section, text: text.trim() }
        else if (name === "bullets" && section.kind === "list") section = { ...section, bullets: withBullets(text.trim()) }
        else skip(`${extraHeading(before)} has no ${name}.`)
      }
      resume.extraSections = { ...extrasOf(resume), [key]: section }
      return `Changed ${extraHeading(section)}.`
    }
    case "remove_section": {
      if (!isBuiltIn(action.section) && extraKey(action.section ?? "") !== null) {
        const [key, section] = custom(resume, action.section)
        resume.extraSections = Object.fromEntries(Object.entries(extrasOf(resume)).filter(([other]) => other !== key))
        resume.sectionOrder = resolveSections(resume).filter((ref) => ref !== extraRef(key))
        return `Deleted ${extraHeading(section)}.`
      }
      const def = builtIn(action.section)
      resume.sectionOrder = resolveSections(resume).filter((ref) => ref !== def.name)
      resume[def.dataKey] = []
      resume.headings = Object.fromEntries(Object.entries(resume.headings ?? {}).filter(([key]) => key !== def.headingKey))
      return `Deleted ${def.title}.`
    }
    case "leave_out_section":
    case "include_section": {
      const leftOut = op === "leave_out_section"
      if (!isBuiltIn(action.section) && extraKey(action.section ?? "") !== null) {
        const [key, { leftOut: _, ...section }] = custom(resume, action.section)
        resume.extraSections = { ...extrasOf(resume), [key]: leftOut ? { ...section, leftOut } : section }
        return `${leftOut ? "Left out" : "Put back"} ${extraHeading(section)}.`
      }
      const def = builtIn(action.section)
      resume.leftOutSections = withSectionLeftOut(resume.leftOutSections, def.name, leftOut)
      return `${leftOut ? "Left out" : "Put back"} ${def.title}.`
    }
    case "rename_section": {
      const heading = value?.trim() ?? ""
      if (!isBuiltIn(action.section) && extraKey(action.section ?? "") !== null) {
        const [key, section] = custom(resume, action.section)
        resume.extraSections = { ...extrasOf(resume), [key]: { ...section, heading } }
        return `Renamed ${extraHeading(section)} to ${heading || "New section"}.`
      }
      const def = builtIn(action.section)
      const { [def.headingKey]: _, ...headings } = resume.headings ?? {}
      resume.headings = heading && heading !== def.title ? { ...headings, [def.headingKey]: heading } : headings
      return `Renamed ${def.title} to ${heading || def.title}.`
    }
    case "order_sections": {
      const order = resolveSections(resume)
      const named = action.targets.map((ref) => (isBuiltIn(ref) || extraKey(ref) !== null ? ref : builtIn(ref).name))
      const first = named.filter((ref, index): ref is SectionRef => order.includes(ref as SectionRef) && named.indexOf(ref) === index)
      resume.sectionOrder = [...first, ...order.filter((ref) => !first.includes(ref))]
      return "Put the sections in a new order."
    }
    case "set_choice": {
      const def = builtIn(action.section)
      const choice = def.choice ?? skip(`${def.title} has no choices.`)
      const option = choice.options.find((other) => other.value === value) ?? skip(`${def.title}'s ${choice.label} can't be ${value}.`)
      resume[choice.key] = option.value
      return `Set ${def.title}'s ${choice.label} to ${option.label}.`
    }
    case "set_template": {
      const wanted = value?.trim().toLowerCase()
      const template =
        TEMPLATES.find((option) => option.id === wanted || option.name.toLowerCase() === wanted) ?? skip(`There's no template ${value}.`)
      Object.assign(resume, restyled(resume, { template: template.id })?.changes)
      return `Changed the template to ${template.name}.`
    }
    case "set_tune": {
      let tune = resume.tune
      for (const { key, value: setting } of fields) {
        const [name, parsed] = tuneValue(key, setting)
        tune = withSetting(tune, name, parsed as never)
      }
      resume.tune = tune
      return "Changed Fine-tune."
    }
    case "copy_section": {
      const ref =
        isBuiltIn(action.section) || extraKey(action.section ?? "") !== null ? (action.section as SectionRef) : builtIn(action.section).name
      const names: string[] = []
      for (const target of action.targets) {
        const other = target === id ? undefined : get(target)
        if (!other) skip(`There's no other resume ${target} to copy to.`)
        const copy = copiedSection(resume, other!, ref, value === "replace" ? "replace" : "add")
        if (copy) Object.assign(other!, copy.changes)
        names.push(other!.resumeTitle || "Untitled resume")
      }
      return names.length > 0 ? `Copied it to ${names.join(", ")}.` : skip("Nowhere to copy it to.")
    }
    case "rename_resume": {
      resume.resumeTitle = value?.trim() || skip("A resume needs a name.")
      return `Renamed the resume ${resume.resumeTitle}.`
    }
  }
}

/** Does `actions`, as the AI answered them, to copies of `resumes`, with `openId` the resume open in the editor. */
export function applyActions(resumes: Readonly<Record<string, Resume>>, openId: string, actions: unknown): Applied {
  const copies = new Map<string, Resume>()
  const get = (id: string) => {
    if (!Object.hasOwn(resumes, id)) return undefined
    if (!copies.has(id)) copies.set(id, structuredClone(resumes[id]))
    return copies.get(id)
  }
  const done: string[] = []
  const failed: string[] = []
  for (const value of Array.isArray(actions) ? actions : []) {
    const action = actionOf(value)
    if (!action) {
      failed.push("One change wasn't one the assistant can make.")
      continue
    }
    // Done to a copy of the copy, so one skipped halfway through leaves nothing behind.
    const before = new Map([...copies].map(([id, resume]) => [id, structuredClone(resume)]))
    try {
      done.push(act(action, get, openId))
    } catch (error) {
      if (!(error instanceof Skipped)) throw error
      copies.clear()
      for (const [id, resume] of before) copies.set(id, resume)
      failed.push(error.message)
    }
  }

  const edits: Record<string, Partial<Resume>> = {}
  for (const [id, after] of copies) {
    const original: Record<string, unknown> = resumes[id]
    const changed: Record<string, unknown> = after
    const fields = new Set([...Object.keys(original), ...Object.keys(changed)])
    const edit = Object.fromEntries(
      [...fields]
        .filter((field) => JSON.stringify(original[field]) !== JSON.stringify(changed[field]))
        .map((field) => [field, changed[field]]),
    )
    if (Object.keys(edit).length > 0) edits[id] = edit as Partial<Resume>
  }
  return { edits, done, failed }
}
