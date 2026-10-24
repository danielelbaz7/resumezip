// A resume's score for a job, worked out here from what the AI said, so the
// same answer always scores the same. Most of it is the job's requirements,
// by where each shows up: experience counts most, then projects, then skills,
// then coursework. The rest is how the resume fits the job beyond them: its
// role, its level and the AI's overall read (WEIGHTS).

import { GROUPS, LEVELS, type Group, type Level } from "./profile"

export interface Requirement {
  name: string
  /** A must-have, rather than nice to have. */
  must: boolean
}

/** Where a requirement shows up in a resume: the group that counts most, or nowhere. */
export type Place = Group | "nowhere"

/** How much of a requirement's worth each place earns. */
// prettier-ignore
export const CREDIT: Record<Place, number> = { experience: 1, projects: 0.75, skills: 0.5, coursework: 0.25, nowhere: 0 }
export const MUST_WORTH = 2
export const NICE_WORTH = 1

export interface Scored {
  /** 0 to 100. */
  score: number
  /** How many requirements show up in each group, and how many nowhere. */
  found: Record<Group, number> & { missing: number }
  matched: string[]
  missing: string[]
}

/**
 * Scores a resume: each requirement earns its worth (MUST_WORTH or
 * NICE_WORTH) times the CREDIT of where it shows up, and the score is what
 * they all earn out of what they're worth. `places` is in the requirements'
 * order; a place that's missing is nowhere. A job with no requirements
 * scores 0, since there's nothing to show a fit.
 */
export function scoreOf(requirements: readonly Requirement[], places: readonly Place[]): Scored {
  const found: Scored["found"] = { experience: 0, projects: 0, skills: 0, coursework: 0, missing: 0 }
  const matched: string[] = []
  const missing: string[] = []
  let earned = 0
  let worth = 0
  requirements.forEach((requirement, index) => {
    const place = places[index] ?? "nowhere"
    const value = requirement.must ? MUST_WORTH : NICE_WORTH
    worth += value
    earned += value * CREDIT[place]
    if (place === "nowhere") {
      found.missing++
      missing.push(requirement.name)
    } else {
      found[place]++
      matched.push(requirement.name)
    }
  })
  return { score: worth === 0 ? 0 : Math.round((earned / worth) * 100), found, matched, missing }
}

/** Best first: by score, then the resume edited most recently. */
export function ranked<Match extends { score: number; updatedAt?: string }>(matches: readonly Match[]): Match[] {
  const time = (match: Match) => Date.parse(match.updatedAt ?? "") || 0
  return [...matches].sort((a, b) => b.score - a.score || time(b) - time(a))
}

/** A place as the AI or storage gave it, nowhere when it isn't one. */
export const placeOf = (value: unknown): Place => (GROUPS.includes(value as Group) ? (value as Group) : "nowhere")

/** How a resume fits a job beyond its requirements, each 0 to 100. */
export interface Fit {
  /** How close its target titles and kind of work are to the job's title, as the AI judged. */
  role: number
  /** Its level against the job's (levelFitOf); null when the job doesn't say. */
  level: number | null
  /** How well it comes across as who the posting describes, as the AI judged. */
  overall: number
}

/** What each part counts for in the score: a part that's missing gives its share to the others. */
// prettier-ignore
export const WEIGHTS = { requirements: 0.7, role: 0.1, level: 0.1, overall: 0.1 } as const

/** A level fit by how many levels apart the resume and the job are: the same, one apart, and so on. */
const LEVEL_FIT = [100, 70, 35, 10, 0]

/** The resume's level against the job's, 0 to 100; null when the job doesn't say its level. */
export function levelFitOf(resume: Level, job: Level | ""): number | null {
  if (!job) return null
  return LEVEL_FIT[Math.abs(LEVELS.indexOf(resume) - LEVELS.indexOf(job))] ?? 0
}

/**
 * The score, 0 to 100: the requirements' score (scoreOf) and the fit, by
 * WEIGHTS. `requirements` is null for a job with none, and the fit's level
 * null for one that doesn't say its level; either way the other parts share
 * its weight.
 */
export function blendedScore(requirements: number | null, fit: Fit): number {
  const parts: [number | null, number][] = [
    [requirements, WEIGHTS.requirements],
    [fit.role, WEIGHTS.role],
    [fit.level, WEIGHTS.level],
    [fit.overall, WEIGHTS.overall],
  ]
  const counted = parts.filter((part): part is [number, number] => part[0] !== null)
  const weight = counted.reduce((sum, [, share]) => sum + share, 0)
  return Math.round(counted.reduce((sum, [value, share]) => sum + value * share, 0) / weight)
}

/** A 0 to 100 rating as the AI or storage gave it, 0 when it isn't a number. */
export const ratingOf = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value))) : 0
