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

/** What the AI is sent of a resume: its printed text in the four groups, a line per item. */
export type ProfileSource = Record<Group, string[]>

/** A concrete claim from a job or project, with its scale and results, as evidence a requirement is met. */
export interface Highlight {
  group: "experience" | "projects"
  text: string
}

export type ResumeProfile = {
  /** Job titles the resume suits, up to MOST_TARGETS. */
  targets: string[]
  level: Level
  /** One line on who the resume shows. */
  summary: string
  /** The fields its work is in ("finance", "compilers"), up to MOST_DOMAINS. */
  domains: string[]
  /** Its strongest evidence, up to MOST_HIGHLIGHTS, so a job can be matched on how directly it's proven. */
  highlights: Highlight[]
} & Record<Group, string[]>

export const MOST_TARGETS = 5
/** Skills and fields kept per group. */
export const MOST_TERMS = 25
export const MOST_TERM_CHARS = 80
export const MOST_SUMMARY_CHARS = 300
export const MOST_DOMAINS = 5
export const MOST_HIGHLIGHTS = 15
export const MOST_HIGHLIGHT_CHARS = 160

/**
 * Goes into each profile's fingerprint, so profiles made for an earlier
 * version of what a profile holds are made again: 2 added domains and
 * highlights.
 */
export const PROFILE_VERSION = 2

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
  return {
    experience: entriesOf(resume.workExperienceSection).flatMap((job) => [
      joined(field(job, "workRole"), field(job, "companyName")),
      ...linesOf(job.workDescription),
    ]),
    projects: entriesOf(resume.projectsSection).flatMap((project) => [
      joined(field(project, "projectName"), field(project, "techStack")),
      ...linesOf(project.projectDescription),
    ]),
    skills: entriesOf(resume.skillsSection).map((group) => joined(field(group, "skillName"), field(group, "skillDetails"))),
    coursework: entriesOf(resume.educationSection).map((school) => joined(field(school, "schoolName"), field(school, "coursework"))),
  }
}

/** Whether a resume has anything to match a job on. */
export const hasSource = (source: ProfileSource) => GROUPS.some((group) => source[group].some(Boolean))

/**
 * A fingerprint of what a profile was made from (cyrb53, a fast 53-bit
 * string hash), so a saved profile is known to be out of date once the
 * resume's text changes. Not for security: only to tell texts apart.
 */
export function fingerprintOf(source: ProfileSource): string {
  const text = JSON.stringify([PROFILE_VERSION, ...GROUPS.map((group) => source[group].filter(Boolean))])
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
    highlights: (Array.isArray(item.highlights) ? item.highlights : [])
      .filter((highlight): highlight is Record<string, unknown> => !!highlight && typeof highlight === "object")
      .map((highlight) => ({
        group: highlight.group === "projects" ? ("projects" as const) : ("experience" as const),
        text: typeof highlight.text === "string" ? highlight.text.trim().slice(0, MOST_HIGHLIGHT_CHARS) : "",
      }))
      .filter((highlight) => highlight.text)
      .slice(0, MOST_HIGHLIGHTS),
    experience: strings(item.experience, MOST_TERMS, MOST_TERM_CHARS),
    projects: strings(item.projects, MOST_TERMS, MOST_TERM_CHARS),
    skills: strings(item.skills, MOST_TERMS, MOST_TERM_CHARS),
    coursework: strings(item.coursework, MOST_TERMS, MOST_TERM_CHARS),
  }
}
