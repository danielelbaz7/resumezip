// Tailoring a resume for a job: the AI reads the resume's whole printed text
// and the posting, and says which skills the job wants that the resume's
// jobs and projects already show but its Skills section doesn't list, and
// what the job asks for that the resume doesn't show at all (gaps). Only
// what the resume proves is added, each with the resume's words that prove
// it; a gap is only added when the person says they have it. The skills go
// into a copy of the resume (JobsTab), so the original is never changed.

import { printedResume } from "@/lib/leftOut"
import type { Entry, Resume } from "@/lib/resume"
import { entryId, ENTRY_GROUPS, profileSourceOf, type SourceEntry } from "./profile"
import { MOST_TAILOR_ADDED, MOST_TAILOR_GAPS } from "./prompt"
import { inPosting, workName } from "./request"
import { onResume, TIERS, type Requirement, type Tier } from "./score"

/** A skill group as the AI is sent it: its place on the resume ("s1"), its category and its skills. */
export interface SkillGroup {
  /** The skill entry's id on the resume, so a skill goes into the right group of the copy. */
  entryId: number
  name: string
  details: string
}

/** What the AI is sent of the resume to tailor it: all its printed jobs, projects, skill groups and coursework. */
export interface TailorSource {
  experience: SourceEntry[]
  projects: SourceEntry[]
  skillGroups: SkillGroup[]
  coursework: string[]
}

const MOST_TEXT_CHARS = 300

/** The id a skill group goes by in the request: "s1" for the first. */
export const groupId = (index: number) => `s${index + 1}`

/** What's sent of `resume` to tailor it: only what its PDF prints. */
export function tailorSourceOf(saved: Resume): TailorSource {
  const resume = printedResume(saved)
  const { experience, projects, coursework } = profileSourceOf(saved)
  const groups: Entry[] = Array.isArray(resume.skillsSection) ? resume.skillsSection : []
  return {
    experience,
    projects,
    skillGroups: groups
      .map((group) => ({ entryId: group.id, name: (group.skillName ?? "").trim(), details: (group.skillDetails ?? "").trim() }))
      .filter((group) => group.name || group.details),
    coursework,
  }
}

/** A skill to add, as the AI answers it: in a group the resume has ("s1"), or in a new one. */
export interface AddedSkill {
  skill: string
  group: string
  /** The new group's name, when `group` is "new". */
  newGroup: string
  /** The job or project that shows it ("x1", "p2"), and its words that do. */
  entry: string
  quote: string
}

/** Something the job asks for that the resume doesn't show, as the AI answers it. */
export interface Gap {
  requirement: string
  /** The posting's words that ask for it. */
  quote: string
  why: string
  suggestion: string
  /** Where it would go in Skills, if the person has it. */
  group: string
  newGroup: string
}

export interface TailorAnswer {
  add: AddedSkill[]
  gaps: Gap[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
const text = (value: unknown, most = MOST_TEXT_CHARS) => (typeof value === "string" ? value.trim().slice(0, most) : "")

/** The job or project an id names, or null. */
export function entryOf(source: TailorSource, id: string): SourceEntry | null {
  for (const group of ENTRY_GROUPS) {
    const index = source[group].findIndex((_, at) => entryId(group, at) === id)
    if (index >= 0) return source[group][index]
  }
  return null
}

/** The skill group an id names, or null. */
export const skillGroupOf = (source: TailorSource, id: string): SkillGroup | null =>
  source.skillGroups.find((_, at) => groupId(at) === id) ?? null

/** Whether the resume's Skills section lists `skill` already, whole and whatever its case. */
export const listed = (source: TailorSource, skill: string) => source.skillGroups.some((group) => onResume(skill, group.details))

// A group as the AI gave it: one the resume has, or "new" with a name.
const placed = (source: TailorSource, group: string, newGroup: string) =>
  group === "new" ? newGroup.trim() !== "" : skillGroupOf(source, group) !== null

/**
 * The tailoring in an answer, checked against what was sent: null when it
 * isn't whole (a list or a field missing or in the wrong shape), so nothing
 * is filled in. What isn't grounded is dropped, not filled in either: a
 * skill whose quote isn't in its job or project word for word, one already
 * listed, or one with no group; a gap whose quote isn't in the posting, or
 * that's about hiring rather than the work (workName). In the AI's shape,
 * so the page reads the route's answer with it too.
 */
export function tailorAnswerOf(answer: unknown, source: TailorSource, posting: string): TailorAnswer | null {
  if (!isRecord(answer) || !Array.isArray(answer.add) || !Array.isArray(answer.gaps)) return null
  const strings = (item: unknown, keys: string[]): item is Record<string, string> =>
    isRecord(item) && keys.every((key) => typeof item[key] === "string")
  if (!answer.add.every((item) => strings(item, ["skill", "group", "newGroup", "entry", "quote"]))) return null
  if (!answer.gaps.every((item) => strings(item, ["requirement", "quote", "why", "suggestion", "group", "newGroup"]))) return null

  const add: AddedSkill[] = []
  for (const item of answer.add as Record<string, string>[]) {
    const skill = text(item.skill, 80)
    const entry = entryOf(source, item.entry)
    const quote = text(item.quote)
    const shown = entry && inPosting(quote, [entry.title, ...entry.lines].join("\n"))
    const twice = add.some((added) => added.skill.toLowerCase() === skill.toLowerCase())
    if (!skill || !shown || twice || listed(source, skill) || !placed(source, item.group, item.newGroup)) continue
    add.push({ skill, group: item.group, newGroup: text(item.newGroup, 80), entry: item.entry, quote })
  }

  const gaps: Gap[] = []
  for (const item of answer.gaps as Record<string, string>[]) {
    const requirement = workName(text(item.requirement, 80))
    const quote = text(item.quote)
    if (!requirement || !inPosting(quote, posting) || gaps.some((gap) => gap.requirement === requirement)) continue
    // A gap the resume's Skills already list isn't one.
    if (listed(source, requirement)) continue
    gaps.push({
      requirement,
      quote,
      why: text(item.why),
      suggestion: text(item.suggestion),
      group: placed(source, item.group, item.newGroup) ? item.group : "new",
      newGroup: placed(source, item.group, item.newGroup) ? text(item.newGroup, 80) : "Skills",
    })
  }
  return { add: add.slice(0, MOST_TAILOR_ADDED), gaps: gaps.slice(0, MOST_TAILOR_GAPS) }
}

/** A skill to put in Skills: in the group with that entry id, or in a new group with that name. */
export interface SkillPlace {
  skill: string
  entryId: number | null
  newGroup: string
}

/** Where an answered skill or gap goes, as the copy's Skills has it. */
export const placeOf = (source: TailorSource, skill: string, group: string, newGroup: string): SkillPlace => ({
  skill,
  entryId: group === "new" ? null : (skillGroupOf(source, group)?.entryId ?? null),
  newGroup: group === "new" ? newGroup : "",
})

/**
 * A Skills section with skills added: each after the others in its group,
 * or in a new group at the end, one per new name, whatever its case. A
 * skill the section lists already isn't added again.
 */
export function withSkills(section: readonly Entry[], places: readonly SkillPlace[]): Entry[] {
  const next = section.map((entry) => ({ ...entry }))
  let nextId = next.reduce((most, entry) => Math.max(most, entry.id), 0) + 1
  for (const { skill, entryId, newGroup } of places) {
    if (next.some((entry) => onResume(skill, entry.skillDetails ?? ""))) continue
    const name = newGroup.trim() || "Skills"
    let group = entryId === null ? undefined : next.find((entry) => entry.id === entryId)
    group ??= next.find((entry) => (entry.skillName ?? "").trim().toLowerCase() === name.toLowerCase())
    if (!group) {
      group = { id: nextId++, skillName: name, skillDetails: "" }
      next.push(group)
    }
    const details = (group.skillDetails ?? "").trim()
    group.skillDetails = details ? `${details}, ${skill}` : skill
  }
  return next
}

/** A request to tailor a resume: the posting matched, its requirements, and the resume. */
export interface TailorRequest {
  kind: "tailor"
  posting: string
  requirements: Requirement[]
  resume: TailorSource
}

const MOST_TAILOR_POSTING_CHARS = 40_000
const MOST_ENTRIES = 30
const MOST_LINES_EACH = 60
const MOST_LINE_CHARS = 1_000
const MOST_TITLE_CHARS = 200
const MOST_GROUPS = 30
const MOST_DETAILS_CHARS = 2_000
const MOST_RESUME_CHARS = 40_000

/**
 * The resume cut to what a tailoring request may hold (tailorRequestOf), so
 * a long one is sent in part rather than turned away: at most MOST_ENTRIES
 * jobs and projects, each line to its length, and lines past the resume's
 * length left off.
 */
export function sendableTailor(source: TailorSource): TailorSource {
  let left = MOST_RESUME_CHARS
  const cut = (line: string, most: number) => {
    const kept = line.slice(0, Math.min(most, Math.max(0, left)))
    left -= kept.length
    return kept
  }
  const entries = (list: SourceEntry[]) =>
    list.map((entry) => ({
      title: cut(entry.title, MOST_TITLE_CHARS),
      lines: entry.lines
        .slice(0, MOST_LINES_EACH)
        .map((line) => cut(line, MOST_LINE_CHARS))
        .filter(Boolean),
    }))
  const experience = entries(source.experience.slice(0, MOST_ENTRIES))
  return {
    experience,
    projects: entries(source.projects.slice(0, Math.max(0, MOST_ENTRIES - experience.length))),
    skillGroups: source.skillGroups
      .slice(0, MOST_GROUPS)
      .map((group) => ({ ...group, name: cut(group.name, MOST_TITLE_CHARS), details: cut(group.details, MOST_DETAILS_CHARS) })),
    coursework: source.coursework
      .slice(0, MOST_GROUPS)
      .map((line) => cut(line, MOST_LINE_CHARS))
      .filter(Boolean),
  }
}

const isText = (value: unknown, most: number): value is string => typeof value === "string" && value.length <= most

/** A tailoring request's body as the route takes it, or null if it isn't one the page would send. */
export function tailorRequestOf(body: unknown): TailorRequest | null {
  if (!isRecord(body) || body.kind !== "tailor" || !isRecord(body.resume)) return null
  const { posting, requirements, resume } = body
  if (!isText(posting, MOST_TAILOR_POSTING_CHARS) || !posting.trim()) return null
  if (!Array.isArray(requirements) || requirements.length > 15) return null
  const read: Requirement[] = []
  for (const item of requirements) {
    if (!isRecord(item) || !isText(item.name, 80) || !TIERS.includes(item.tier as Tier) || !isText(item.keyword, 80)) return null
    read.push({ name: item.name, tier: item.tier as Tier, keyword: item.keyword })
  }
  const { experience, projects, skillGroups, coursework } = resume
  if (![experience, projects, skillGroups, coursework].every(Array.isArray)) return null
  const entries = [...(experience as unknown[]), ...(projects as unknown[])]
  const isEntry = (entry: unknown): entry is SourceEntry =>
    isRecord(entry) &&
    isText(entry.title, MOST_TITLE_CHARS) &&
    Array.isArray(entry.lines) &&
    entry.lines.length <= MOST_LINES_EACH &&
    entry.lines.every((line) => isText(line, MOST_LINE_CHARS))
  const isGroup = (group: unknown): group is SkillGroup =>
    isRecord(group) && Number.isInteger(group.entryId) && isText(group.name, MOST_TITLE_CHARS) && isText(group.details, MOST_DETAILS_CHARS)
  if (entries.length > MOST_ENTRIES || !entries.every(isEntry)) return null
  if ((skillGroups as unknown[]).length > MOST_GROUPS || !(skillGroups as unknown[]).every(isGroup)) return null
  if ((coursework as unknown[]).length > MOST_GROUPS || !(coursework as unknown[]).every((line) => isText(line, MOST_LINE_CHARS)))
    return null
  const source = { experience, projects, skillGroups, coursework } as TailorSource
  const chars =
    entries.reduce((sum: number, entry) => sum + entry.title.length + entry.lines.join("").length, 0) +
    source.skillGroups.reduce((sum, group) => sum + group.name.length + group.details.length, 0) +
    source.coursework.join("").length
  return chars > MOST_RESUME_CHARS ? null : { kind: "tailor", posting, requirements: read, resume: source }
}

/** A tailoring as a job keeps it, for the list to show (storage.ts). */
export interface Tailoring {
  /** The resume tailored, and the copy made of it with the skills added. */
  fromResumeId: string
  copyId: string
  copyTitle: string
  madeAt: string
  /** Each skill added: the group it went in, and the job or project that shows it, with its words. */
  added: { skill: string; group: string; from: string; quote: string }[]
  /** What the job asks for that the resume doesn't show, and where in Skills it goes if the person says they have it. */
  gaps: { requirement: string; quote: string; why: string; suggestion: string; place: SkillPlace; added: boolean }[]
}

/** The places in Skills an answer's skills go, in its order. */
export const addedPlaces = (answer: TailorAnswer, source: TailorSource): SkillPlace[] =>
  answer.add.map((added) => placeOf(source, added.skill, added.group, added.newGroup))

/** A tailoring to keep with a job, from the answer and the copy made with its skills. */
export function tailoringOf(
  answer: TailorAnswer,
  source: TailorSource,
  { fromResumeId, copyId, copyTitle, now = new Date() }: { fromResumeId: string; copyId: string; copyTitle: string; now?: Date },
): Tailoring {
  const groupName = (group: string, newGroup: string) => (group === "new" ? newGroup : (skillGroupOf(source, group)?.name ?? newGroup))
  return {
    fromResumeId,
    copyId,
    copyTitle,
    madeAt: now.toISOString(),
    added: answer.add.map((added) => ({
      skill: added.skill,
      group: groupName(added.group, added.newGroup) || "Skills",
      from: entryOf(source, added.entry)?.title ?? "",
      quote: added.quote,
    })),
    gaps: answer.gaps.map((gap) => ({
      requirement: gap.requirement,
      quote: gap.quote,
      why: gap.why,
      suggestion: gap.suggestion,
      place: placeOf(source, gap.requirement, gap.group, gap.newGroup),
      added: false,
    })),
  }
}

/** A tailoring as storage has it, read defensively; null when it has no copy to point at. */
export function savedTailoringOf(value: unknown): Tailoring | null {
  if (!isRecord(value) || typeof value.fromResumeId !== "string" || typeof value.copyId !== "string") return null
  const list = (items: unknown) => (Array.isArray(items) ? items.filter(isRecord) : [])
  return {
    fromResumeId: value.fromResumeId,
    copyId: value.copyId,
    copyTitle: text(value.copyTitle, 200),
    madeAt: typeof value.madeAt === "string" && !Number.isNaN(Date.parse(value.madeAt)) ? value.madeAt : new Date(0).toISOString(),
    added: list(value.added)
      .map((item) => ({ skill: text(item.skill, 80), group: text(item.group, 80), from: text(item.from, 200), quote: text(item.quote) }))
      .filter((item) => item.skill)
      .slice(0, MOST_TAILOR_ADDED),
    gaps: list(value.gaps)
      .map((item) => {
        const place = isRecord(item.place) ? item.place : {}
        return {
          requirement: text(item.requirement, 80),
          quote: text(item.quote),
          why: text(item.why),
          suggestion: text(item.suggestion),
          place: {
            skill: text(place.skill, 80) || text(item.requirement, 80),
            entryId: Number.isInteger(place.entryId) ? (place.entryId as number) : null,
            newGroup: text(place.newGroup, 80),
          },
          added: item.added === true,
        }
      })
      .filter((item) => item.requirement)
      .slice(0, MOST_TAILOR_GAPS),
  }
}
