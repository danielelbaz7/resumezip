// What the Jobs tab sends /api/jobs and what comes back, checked where it's
// read: the route checks requests, since anyone can send anything there, and
// the page checks answers, which come from an AI. Resumes go by ids made for
// the request ("r1", "r2"), not their own, which can be any text.

import { yearMonthOf, type GraduationWindow } from "./graduation"
import { GROUPS, LEVELS, MOST_TERM_CHARS, readProfile, type Level, type ProfileSource, type ResumeProfile } from "./profile"
import { MOST_REQUIREMENTS, ROLE_KINDS } from "./prompt"
import {
  onResume,
  placeOf,
  ratingOf,
  STRENGTHS,
  strengthOf,
  TIERS,
  tierOf,
  type Evidence,
  type Requirement,
  type Strength,
  type Tier,
} from "./score"

export type RoleKind = (typeof ROLE_KINDS)[number]

/** Resumes summed up in one request; more are sent in several. */
export const MOST_PER_PROFILES = 5
/** Profiles a posting is matched against at once. */
export const MOST_PROFILES = 50
export const MOST_POSTING_CHARS = 20_000
export const MOST_LINK_CHARS = 2_000
// A long resume's four groups are about 80 lines and 6,000 characters.
const MOST_LINES = 150
const MOST_LINE_CHARS = 1_000
const MOST_RESUME_CHARS = 16_000
const MOST_REASON_CHARS = 300

/**
 * A resume's groups cut to what a request may hold (sourceOf), so a long
 * resume is sent in part rather than turned away: each line to its length,
 * and lines past the resume's length left off, the later groups' first.
 */
export function sendable(source: ProfileSource): ProfileSource {
  let left = MOST_RESUME_CHARS
  const sent = {} as ProfileSource
  for (const group of GROUPS) {
    sent[group] = []
    for (const line of source[group].slice(0, MOST_LINES)) {
      const cut = line.slice(0, Math.min(MOST_LINE_CHARS, left))
      if (!cut) break
      sent[group].push(cut)
      left -= cut.length
    }
  }
  return sent
}

/** The id a resume goes by in a request: its place in it, from 1. */
export const wireId = (index: number) => `r${index + 1}`
const WIRE_ID = /^r\d{1,3}$/

export type ProfilesRequest = { kind: "profiles"; resumes: ({ id: string } & ProfileSource)[] }
/** A posting to match: the text pasted, its link, or both, at least one of them; "" for the one not given. */
export type MatchRequest = { kind: "match"; posting: string; link: string; profiles: ({ id: string } & ResumeProfile)[] }

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)

function sourceOf(value: unknown): ({ id: string } & ProfileSource) | null {
  if (!isRecord(value) || typeof value.id !== "string" || !WIRE_ID.test(value.id)) return null
  let chars = 0
  const source = { id: value.id } as { id: string } & ProfileSource
  for (const group of GROUPS) {
    const lines = value[group]
    if (!Array.isArray(lines) || lines.length > MOST_LINES) return null
    for (const line of lines) {
      if (typeof line !== "string" || line.length > MOST_LINE_CHARS) return null
      chars += line.length
    }
    if (chars > MOST_RESUME_CHARS) return null
    source[group] = lines as string[]
  }
  return source
}

/** A request's body as the route takes it, or null if it isn't one the page would send. */
export function jobsRequestOf(body: unknown): ProfilesRequest | MatchRequest | null {
  if (!isRecord(body)) return null
  if (body.kind === "profiles") {
    const resumes = Array.isArray(body.resumes) ? body.resumes.map(sourceOf) : null
    if (!resumes || resumes.length === 0 || resumes.length > MOST_PER_PROFILES || resumes.some((resume) => !resume)) return null
    return { kind: "profiles", resumes: resumes as ProfilesRequest["resumes"] }
  }
  if (body.kind === "match") {
    const { posting = "", link = "", profiles } = body
    if (typeof posting !== "string" || posting.length > MOST_POSTING_CHARS) return null
    if (typeof link !== "string" || link.length > MOST_LINK_CHARS) return null
    if (!posting.trim() && !link.trim()) return null
    if (!Array.isArray(profiles) || profiles.length === 0 || profiles.length > MOST_PROFILES) return null
    const read: MatchRequest["profiles"] = []
    for (const item of profiles) {
      // A profile is cut to its limits as it's read, so it can't be made long.
      const profile = readProfile(item)
      if (!profile || !isRecord(item) || typeof item.id !== "string" || !WIRE_ID.test(item.id)) return null
      read.push({ id: item.id, ...profile })
    }
    return { kind: "match", posting, link: link.trim(), profiles: read }
  }
  return null
}

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string")

// A profile in the AI's answer, with every field the schema asks for in its
// shape. One that isn't makes the whole answer incomplete: nothing's filled in.
function isAnsweredProfile(item: unknown): item is Record<string, unknown> {
  return (
    isRecord(item) &&
    isStrings(item.targets) &&
    LEVELS.includes(item.level as Level) &&
    typeof item.summary === "string" &&
    isStrings(item.domains) &&
    Array.isArray(item.highlights) &&
    item.highlights.every(
      (highlight) =>
        isRecord(highlight) && (highlight.group === "experience" || highlight.group === "projects") && typeof highlight.text === "string",
    ) &&
    GROUPS.every((group) => isStrings(item[group]))
  )
}

/**
 * The profiles in an answer, by the request's ids, cut to their limits; null
 * when it leaves one out or has one that isn't whole, so a resume is never
 * matched on a profile made up of what wasn't said.
 */
export function profilesAnswerOf(answer: unknown, ids: readonly string[]): Record<string, ResumeProfile> | null {
  const items = isRecord(answer) && Array.isArray(answer.profiles) ? answer.profiles : null
  if (!items) return null
  const profiles: Record<string, ResumeProfile> = {}
  for (const id of ids) {
    const item = items.find((given) => isRecord(given) && given.id === id)
    if (!isAnsweredProfile(item)) return null
    profiles[id] = readProfile(item)!
  }
  return profiles
}

/**
 * A link as typed made a web address, with https:// before it when it has no
 * scheme ("jobs.acme.com/1"); null when it can't be one. "" for none.
 */
export function linkOf(typed: string): string | null {
  const link = typed.trim()
  if (!link) return ""
  const address = /^[a-z][a-z\d+.-]*:\/\//i.test(link) ? link : `https://${link}`
  if (!URL.canParse(address)) return null
  const url = new URL(address)
  return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".") ? url.href : null
}

/** The most of a pasted posting and its page's text, together, that's matched. */
export const MOST_MATCHED_CHARS = MOST_POSTING_CHARS * 2

/** Fewer words than this isn't a job posting, and isn't sent to the AI. */
export const LEAST_POSTING_WORDS = 25

const wordsIn = (text: string) => text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length

/** Why `text` can't be matched as a job posting: "short" with too few words to be one; null when it can. */
export const postingProblem = (text: string): "short" | null => (wordsIn(text) < LEAST_POSTING_WORDS ? "short" : null)

// Requirements about hiring rather than the work, which a resume doesn't
// prove and so every resume would miss: the prompt tells the AI to leave
// them out, and one it gives anyway is dropped by its name. The soft skills
// and work arrangements are matched whole, so "high availability",
// "inter-process communication" and "hybrid cloud" stay.
// prettier-ignore
const NOT_THE_WORK = new RegExp(
  [
    // Education.
    "\\bgraduat", "\\bdegree\\b", "\\bbachelor", "\\bmaster'?s\\b", "\\bph\\.?\\s?d\\b", "\\bgpa\\b", "\\bcoursework in\\b",
    // "BS in Computer Science", "M.S. degree", but not "MS Excel".
    "^(b|m)\\.?\\s?(s|a|sc|eng)\\.?\\s+(in|degree)\\b",
    // Availability.
    "\\bfull[- ]?time\\b", "\\bpart[- ]?time\\b", "^availab", "\\bavailab\\w* (to|for|from|during|in)\\b", "\\bstart date\\b",
    "\\binternship (term|period|dates?|length)\\b",
    // Where and whether they can work.
    "\\brelocat", "\\bon[- ]?site\\b", "\\bin[- ]office\\b", "^hybrid( work| schedule)?$", "^remote( work)?$", "\\btravel\\b",
    "\\bwork(ing)? authori[sz]", "\\bauthori[sz]ed to work\\b", "\\bsponsorship\\b", "\\bvisa\\b", "\\bcitizenship\\b", "\\bcitizen\\b",
    "\\bsecurity clearance\\b", "^clearance$",
    // A count of years alone, and soft skills.
    "^years( of)?( experience)?$", "^(strong |excellent |good |written |verbal |written and verbal )?communication( skills)?$",
    "^team ?work$", "^teamwork skills$", "^passion\\b", "^work ethic$",
  ].join("|"),
  "i",
)

/**
 * A requirement's name, without a count of years before it ("3+ years of
 * C++" is C++); "" when it's about hiring rather than the work: a degree,
 * availability, location, authorization and the like, or a soft skill.
 */
export function workName(name: string): string {
  const work = name
    .trim()
    .replace(
      /^\d+\s*(\+|-\s*\d+)?\s*(years?|yrs?)\b(\s+of)?(\s+(professional|hands-on|industry))?(\s+experience)?(\s+(with|in|using))?\s*/i,
      "",
    )
    .trim()
  return !work || NOT_THE_WORK.test(work) ? "" : work
}

/** Whether `phrase` is in the posting, word for word, whatever its case and spacing: what the AI says of a job must be. */
export const inPosting = (phrase: string, posting: string) => phrase.trim() !== "" && onResume(phrase, posting)

export interface PostedJob {
  title: string
  company: string
  location: string
  /** "" when the posting doesn't say. */
  level: Level | ""
  /** The kind of role it is, one of ROLE_KINDS. */
  role: RoleKind
  /** The field the work is in; "" when it isn't clear. */
  domain: string
  /** Each with the posting's words it comes from (quote). */
  requirements: (Requirement & { quote: string })[]
  /** Which projects, from any resume, would make the strongest lineup; "" when one resume already is. */
  advice: string
  /** When the posting asks people to graduate; null when it doesn't say (graduation.ts). */
  graduation: GraduationWindow | null
}

/** What the AI said of one resume for the job: its evidence for each requirement, in their order, and its other layers (score.ts). */
export interface ResumeAnswer {
  evidence: Evidence[]
  projects: number
  experience: number
  domain: number
  narrative: number
  reason: string
}

export interface MatchAnswer {
  /** Whether the text is a job posting at all, as the AI read it. */
  isPosting: boolean
  job: PostedJob
  /** By the request's ids. */
  resumes: Record<string, ResumeAnswer>
}

/**
 * A match as the route hands it back: in the shape the AI answers in, a list
 * of resumes each with its id, so the page reads it with matchAnswerOf too.
 */
export const answerShapeOf = (match: MatchAnswer) => ({
  job: {
    isPosting: match.isPosting,
    ...match.job,
    graduation: match.job.graduation ? { asked: true, ...match.job.graduation } : { asked: false, earliest: "", latest: "", quote: "" },
  },
  resumes: Object.entries(match.resumes).map(([id, resume]) => ({ id, ...resume })),
})

const text = (value: unknown, most: number) => (typeof value === "string" ? value.trim().slice(0, most) : "")

/** A requirement as storage has it, read defensively; one with no name is nothing. */
export function requirementOf(value: unknown): (Requirement & { quote: string }) | null {
  if (!isRecord(value)) return null
  const name = text(value.name, MOST_TERM_CHARS)
  return name
    ? {
        name,
        tier: tierOf(value.tier, value.must),
        keyword: text(value.keyword, MOST_TERM_CHARS),
        quote: text(value.quote, MOST_QUOTE_CHARS),
      }
    : null
}

const MOST_QUOTE_CHARS = 300
const isRating = (value: unknown) => typeof value === "number" && Number.isFinite(value)

/**
 * The job and the matches in an answer, checked against `posting`, the text
 * they were made from. Null when the answer isn't whole: a field missing or
 * in the wrong shape, a resume sent and left out, or a resume's evidence not
 * one for each requirement. Nothing's filled in for what wasn't said. What
 * isn't in the posting is dropped: a requirement whose quote isn't there
 * word for word, and a title, company or location that isn't either.
 */
export function matchAnswerOf(answer: unknown, ids: readonly string[], posting: string): MatchAnswer | null {
  if (!isRecord(answer) || !isRecord(answer.job) || !Array.isArray(answer.resumes)) return null
  const { job } = answer
  if (typeof job.isPosting !== "boolean" || !Array.isArray(job.requirements)) return null
  if (!["title", "company", "location", "domain", "advice"].every((key) => typeof job[key] === "string")) return null
  const graduation = graduationAnswerOf(job.graduation, posting)
  if (graduation === undefined) return null
  if (!(LEVELS.includes(job.level as Level) || job.level === "unknown") || !ROLE_KINDS.includes(job.role as RoleKind)) return null
  const asked = job.requirements
  if (
    !asked.every(
      (item) =>
        isRecord(item) &&
        typeof item.name === "string" &&
        TIERS.includes(item.tier as Tier) &&
        typeof item.keyword === "string" &&
        typeof item.quote === "string",
    )
  )
    return null
  // The requirements the posting says, in order, each by where it was in the answer.
  const kept = (asked as Record<string, unknown>[])
    .map((item, at) => ({ item, at }))
    .filter(({ item }) => workName(text(item.name, MOST_TERM_CHARS)) && inPosting(item.quote as string, posting))
    .slice(0, MOST_REQUIREMENTS)
  const resumes: MatchAnswer["resumes"] = {}
  for (const id of ids) {
    const item = answer.resumes.find((given) => isRecord(given) && given.id === id)
    if (!isRecord(item) || !Array.isArray(item.evidence) || item.evidence.length !== asked.length) return null
    const evidence = item.evidence
    // placeOf gives back a place it knows as it is, "nowhere" included.
    if (
      !evidence.every((given) => isRecord(given) && STRENGTHS.includes(given.strength as Strength) && placeOf(given.place) === given.place)
    )
      return null
    if (!["projects", "experience", "domain", "narrative"].every((key) => isRating(item[key])) || typeof item.reason !== "string")
      return null
    resumes[id] = {
      evidence: kept.map(({ at }) => ({ strength: strengthOf(evidence[at].strength), place: placeOf(evidence[at].place) })),
      projects: ratingOf(item.projects),
      experience: ratingOf(item.experience),
      domain: ratingOf(item.domain),
      narrative: ratingOf(item.narrative),
      reason: text(item.reason, MOST_REASON_CHARS),
    }
  }
  const written = (value: unknown) => {
    const given = text(value, 200)
    return inPosting(given, posting) ? given : ""
  }
  return {
    isPosting: job.isPosting,
    job: {
      title: written(job.title),
      company: written(job.company),
      location: written(job.location),
      level: LEVELS.includes(job.level as Level) ? (job.level as Level) : "",
      role: job.role as RoleKind,
      domain: text(job.domain, 200),
      requirements: kept.map(({ item }) => ({
        name: workName(text(item.name, MOST_TERM_CHARS)),
        tier: item.tier as Tier,
        keyword: text(item.keyword, MOST_TERM_CHARS),
        quote: text(item.quote, MOST_QUOTE_CHARS),
      })),
      advice: text(job.advice, 500),
      graduation,
    },
    resumes,
  }
}

/**
 * The posting's graduation window from the answer: null when it asks for
 * none, or its quote isn't in the posting word for word; undefined when the
 * answer's isn't whole.
 */
function graduationAnswerOf(value: unknown, posting: string): GraduationWindow | null | undefined {
  if (!isRecord(value) || typeof value.asked !== "boolean" || typeof value.quote !== "string") return undefined
  const earliest = yearMonthOf(value.earliest)
  const latest = yearMonthOf(value.latest)
  if (earliest === null || latest === null) return undefined
  if (!value.asked || (!earliest && !latest) || !inPosting(value.quote, posting)) return null
  // An answer that has them the wrong way round means the same window.
  const [from, to] = earliest && latest && earliest > latest ? [latest, earliest] : [earliest, latest]
  return { earliest: from, latest: to, quote: text(value.quote, MOST_QUOTE_CHARS) }
}

/** A kind of role as storage has it, "other" when it isn't one. */
export const roleKindOf = (value: unknown): RoleKind => (ROLE_KINDS.includes(value as RoleKind) ? (value as RoleKind) : "other")
