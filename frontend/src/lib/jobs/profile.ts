// A resume's profile for the Jobs tab: what the AI made of its experience,
// projects, skills and coursework, saved so a new job posting is matched
// against it without asking the AI to read the resume again. It's made again
// only when the text it was made from changes (see fingerprintOf).

import { printedResume } from "@/lib/leftOut"
import type { Entry, Resume } from "@/lib/resume"

/** The parts of a resume a job is matched on, in the order they count for (see score.ts). */
export const GROUPS = ["experience", "projects", "skills", "coursework"] as const
export type Group = (typeof GROUPS)[number]

export const LEVELS = ["intern", "entry", "mid", "senior", "lead"] as const
export type Level = (typeof LEVELS)[number]

/** A job or a project as the AI is sent it: its title as printed ("Engineer · Stripe", "Atlas · Go") and its bullets. */
export interface SourceEntry {
  title: string
  lines: string[]
}

/** The groups that are jobs and projects, each sent and summed up one entry at a time. */
export const ENTRY_GROUPS = ["experience", "projects"] as const
export type EntryGroup = (typeof ENTRY_GROUPS)[number]

/**
 * What the AI is sent of a resume: its jobs and projects, each with its
 * title and bullets, and its skill groups and coursework, a line each.
 */
export type ProfileSource = Record<EntryGroup, SourceEntry[]> & Record<"skills" | "coursework", string[]>

/**
 * One job or project as its profile keeps it: its title, copied from the
 * resume rather than the AI's, the themes and skills the AI read in it, and
 * its strongest claim, whose numbers are all in its own text (groundedClaim).
 */
export interface ProfileEntry {
  group: EntryGroup
  title: string
  /** The kinds of work it is: "distributed systems", "low-latency trading", up to MOST_THEMES. */
  themes: string[]
  skills: string[]
  /** "" when it has none worth keeping, or the AI's had a number its text doesn't. */
  claim: string
}

export type ResumeProfile = {
  /** Job titles the resume suits, up to MOST_TARGETS. */
  targets: string[]
  level: Level
  /** One line on who the resume shows. */
  summary: string
  /** The fields its work is in ("finance", "compilers"), up to MOST_DOMAINS. */
  domains: string[]
  /** Each of its jobs and projects, in the resume's order, so a job is matched on what each one shows. */
  entries: ProfileEntry[]
} & Record<Group, string[]>

export const MOST_TARGETS = 5
/** Skills and fields kept per group. */
export const MOST_TERMS = 25
export const MOST_TERM_CHARS = 80
export const MOST_SUMMARY_CHARS = 300
export const MOST_DOMAINS = 5
/** Jobs and projects kept per resume, and what each keeps. */
export const MOST_ENTRIES = 30
export const MOST_THEMES = 5
export const MOST_ENTRY_SKILLS = 10
export const MOST_CLAIM_CHARS = 160

/**
 * Goes into each profile's fingerprint, so profiles made for an earlier
 * version of what a profile holds are made again: 2 added domains and
 * highlights; 3 made them a profile per job and project, with its themes.
 */
export const PROFILE_VERSION = 3

// Bold and italic marks, which the AI doesn't need, and the bullet a line starts with.
const plain = (text: string) =>
  text
    .replace(/\*+/g, "")
    .replace(/^\s*[•○]\s*/, "")
    .trim()
const field = (entry: Entry, key: keyof Entry) => (typeof entry[key] === "string" ? plain(entry[key]) : "")
const linesOf = (text: string | undefined) => (typeof text === "string" ? text.split("\n").map(plain).filter(Boolean) : [])
const entriesOf = (value: unknown): Entry[] => (Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") : [])
const joined = (...parts: string[]) => parts.filter(Boolean).join(" · ")

/** What's sent of `resume` to make its profile: only what its PDF prints. */
export function profileSourceOf(saved: Resume): ProfileSource {
  const resume = printedResume(saved)
  const entry = (title: string, description: string | undefined): SourceEntry => ({ title, lines: linesOf(description) })
  const kept = (entry: SourceEntry) => entry.title || entry.lines.length > 0
  return {
    experience: entriesOf(resume.workExperienceSection)
      .map((job) => entry(joined(field(job, "workRole"), field(job, "companyName")), job.workDescription))
      .filter(kept),
    projects: entriesOf(resume.projectsSection)
      .map((project) => entry(joined(field(project, "projectName"), field(project, "techStack")), project.projectDescription))
      .filter(kept),
    skills: entriesOf(resume.skillsSection)
      .map((group) => joined(field(group, "skillName"), field(group, "skillDetails")))
      .filter(Boolean),
    coursework: entriesOf(resume.educationSection)
      .map((school) => joined(field(school, "schoolName"), field(school, "coursework")))
      .filter(Boolean),
  }
}

/** A group's text as lines: each job or project's title and bullets, or the group's own lines. */
export const groupLines = (source: ProfileSource, group: Group): string[] =>
  group === "experience" || group === "projects" ? source[group].flatMap((entry) => [entry.title, ...entry.lines]) : source[group]

/** The id each job and project goes by in a profiles request: "x1" for the first job, "p1" for the first project. */
export const entryId = (group: EntryGroup, index: number) => `${group === "experience" ? "x" : "p"}${index + 1}`

// The digits in a claim, each run of them, with thousands separators taken out: "100,000+ ops/s" has "100000".
const digitRuns = (text: string) => text.replace(/(\d),(?=\d{3}\b)/g, "$1").match(/\d+/g) ?? []

/**
 * A claim the AI wrote of a job or project, kept only when every number in it
 * is in that job or project's own text ("100K" for "100K+ ops/s" or for
 * "100,000"): a number the AI made up drops it. "" when it's dropped.
 */
export function groundedClaim(claim: string, entry: SourceEntry): string {
  const text = [entry.title, ...entry.lines].join("\n")
  const runs = digitRuns(text)
  const written = claim.trim().slice(0, MOST_CLAIM_CHARS)
  return digitRuns(written).every((run) => runs.some((there) => there.includes(run))) ? written : ""
}

/**
 * Each job and project on the resume as printed, as one text: its role and
 * company, or name and tech stack, and its bullets. What a requirement's
 * examples are counted in (match.ts).
 */
export function examplesTextOf(saved: Resume): string[] {
  const resume = printedResume(saved)
  const jobs = entriesOf(resume.workExperienceSection).map((job) =>
    [field(job, "workRole"), field(job, "companyName"), ...linesOf(job.workDescription)].join("\n"),
  )
  const projects = entriesOf(resume.projectsSection).map((project) =>
    [field(project, "projectName"), field(project, "techStack"), ...linesOf(project.projectDescription)].join("\n"),
  )
  return [...jobs, ...projects].filter((text) => text.trim())
}

/** Whether a resume has anything to match a job on. */
export const hasSource = (source: ProfileSource) => GROUPS.some((group) => groupLines(source, group).some(Boolean))

/**
 * A fingerprint of what a profile was made from (cyrb53, a fast 53-bit
 * string hash), so a saved profile is known to be out of date once the
 * resume's text changes. Not for security: only to tell texts apart.
 */
export function fingerprintOf(source: ProfileSource): string {
  const text = JSON.stringify([PROFILE_VERSION, ...GROUPS.map((group) => source[group])])
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const strings = (value: unknown, most: number, chars: number): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim().slice(0, chars))
            .filter(Boolean),
        ),
      ].slice(0, most)
    : []

/**
 * A profile as the AI or storage gave it, read defensively: either is
 * untrusted. Lists are cut to their limits, and an unknown level is "entry".
 * Null when it isn't an object.
 */
export function readProfile(value: unknown): ResumeProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const item = value as Record<string, unknown>
  const level = LEVELS.includes(item.level as Level) ? (item.level as Level) : "entry"
  return {
    targets: strings(item.targets, MOST_TARGETS, MOST_TERM_CHARS),
    level,
    summary: typeof item.summary === "string" ? item.summary.trim().slice(0, MOST_SUMMARY_CHARS) : "",
    domains: strings(item.domains, MOST_DOMAINS, MOST_TERM_CHARS),
    // A profile saved before it had them has none, and is made again (PROFILE_VERSION).
    entries: (Array.isArray(item.entries) ? item.entries : [])
      .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
      .map((entry) => ({
        group: entry.group === "projects" ? ("projects" as const) : ("experience" as const),
        title: typeof entry.title === "string" ? entry.title.trim().slice(0, 200) : "",
        themes: strings(entry.themes, MOST_THEMES, MOST_TERM_CHARS),
        skills: strings(entry.skills, MOST_ENTRY_SKILLS, MOST_TERM_CHARS),
        claim: typeof entry.claim === "string" ? entry.claim.trim().slice(0, MOST_CLAIM_CHARS) : "",
      }))
      .filter((entry) => entry.title)
      .slice(0, MOST_ENTRIES),
    experience: strings(item.experience, MOST_TERMS, MOST_TERM_CHARS),
    projects: strings(item.projects, MOST_TERMS, MOST_TERM_CHARS),
    skills: strings(item.skills, MOST_TERMS, MOST_TERM_CHARS),
    coursework: strings(item.coursework, MOST_TERMS, MOST_TERM_CHARS),
  }
}
