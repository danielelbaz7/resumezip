// A resume's score for a job, worked out here from where the AI said each of
// the job's requirements shows up in it, so the same answer always scores the
// same. Experience counts most, then projects, then skills, then coursework.

import { GROUPS, type Group } from "./profile"

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
