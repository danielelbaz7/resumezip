// A resume's score for a job, in layers, worked out here from what the AI
// said, so the same answer always scores the same (WEIGHTS):
// - core: the job's technical requirements, each worth more the more it
//   matters (TIER_WORTH), earning more the more directly the resume proves it
//   (STRENGTH_CREDIT): a skill only listed is weak evidence, work described
//   in a project or job is good, work with its scale and results is strong;
//   and the more jobs and projects show it, the more it earns (creditOf), so
//   two C++ projects beat one;
// - projects, experience, domain and narrative: the AI's 0 to 100 on how
//   directly the projects resemble the job's work, how well the experience
//   supports it, how the resume's fields match the job's, and whether the
//   whole resume tells a believable story for it;
// - keywords: how many of the requirements' terms are on the resume as
//   written, as hiring software reads it, checked here rather than by the AI.
// Each tier 1 (screening) requirement with no evidence at all, and a
// graduation date outside the posting's window (graduation.ts), takes a share
// off the whole (MISSING_SCREENING).

import { GROUPS, type Group } from "./profile"

export const TIERS = [1, 2, 3] as const
/** 1: must-have, screening; 2: a strong signal, emphasized in the posting; 3: nice to have. */
export type Tier = (typeof TIERS)[number]

export interface Requirement {
  name: string
  tier: Tier
  /** The term hiring software would search the resume for, as it's usually written ("C++", "Kubernetes"). */
  keyword: string
}

export const STRENGTHS = ["none", "weak", "good", "strong"] as const
/** How directly a resume proves a requirement. */
export type Strength = (typeof STRENGTHS)[number]

/** Where a requirement's best evidence is on a resume, or nowhere. */
export type Place = Group | "nowhere"

/** What the AI said of one requirement on one resume, and how many of its jobs and projects show it (examplesOf), counted here. */
export interface Evidence {
  strength: Strength
  place: Place
  examples?: number
}

// prettier-ignore
export const TIER_WORTH: Record<Tier, number> = { 1: 3, 2: 2, 3: 1 }
/** What one example of each strength earns, of a requirement's worth. */
// prettier-ignore
export const STRENGTH_CREDIT: Record<Strength, number> = { none: 0, weak: 0.4, good: 0.65, strong: 0.85 }
/** What each example past the first adds, for work shown (good or strong), up to MOST_MORE_EXAMPLES of them. */
export const EXAMPLE_CREDIT = 0.075
export const MOST_MORE_EXAMPLES = 2

/**
 * What a requirement's evidence earns, of its worth: its strength's credit,
 * and for work shown, EXAMPLE_CREDIT for each job or project past the first
 * that shows it, so three or more strong examples earn it all. A listed skill
 * has no jobs or projects to count.
 */
export function creditOf({ strength, examples = 1 }: Evidence): number {
  const base = STRENGTH_CREDIT[strength]
  if (strength !== "good" && strength !== "strong") return base
  // To three decimals, so a step's float error (0.85 + 0.075) is the credit it says.
  return Math.min(1, Math.round((base + EXAMPLE_CREDIT * Math.min(MOST_MORE_EXAMPLES, Math.max(0, examples - 1))) * 1000) / 1000)
}
/** What's left of the whole score for each tier 1 requirement with no evidence. */
export const MISSING_SCREENING = 0.8

/** What each layer counts for: a layer the job doesn't have gives its share to the others. */
// prettier-ignore
export const WEIGHTS = { core: 0.35, projects: 0.25, experience: 0.2, domain: 0.1, keywords: 0.05, narrative: 0.05 } as const
export type Layer = keyof typeof WEIGHTS

/** Each layer, 0 to 100: core and keywords are null for a job with no requirements. */
export type Parts = { core: number | null; keywords: number | null } & Record<"projects" | "experience" | "domain" | "narrative", number>

/** The requirements' layer, 0 to 100: each earns its tier's worth times its evidence's credit (creditOf); null with none. */
export function coreOf(requirements: readonly Requirement[], evidence: readonly Evidence[]): number | null {
  if (requirements.length === 0) return null
  let earned = 0
  let worth = 0
  requirements.forEach((requirement, index) => {
    worth += TIER_WORTH[requirement.tier]
    earned += TIER_WORTH[requirement.tier] * creditOf(evidence[index] ?? { strength: "none", place: "nowhere" })
  })
  return Math.round((earned / worth) * 100)
}

// Lower case, with runs of anything but letters, digits and the marks in
// names like C++, C# and .NET made one space, so "Node.js" finds "node.js".
// A full stop is only kept before a letter or digit, as in those names: one
// that ends a sentence ("with Rust.") isn't part of the word.
const normal = (text: string) =>
  ` ${text
    .toLowerCase()
    .replace(/\.(?![\p{L}\p{N}])/gu, " ")
    .replace(/[^\p{L}\p{N}+#.]+/gu, " ")
    .trim()} `

/** Whether a requirement's term is on the resume as written, whole: "Go" isn't found in "good". */
export function onResume(keyword: string, resumeText: string): boolean {
  const term = normal(keyword).trim()
  return term !== "" && normal(resumeText).includes(` ${term} `)
}

/** The keywords' layer, 0 to 100: the requirements whose terms are on the resume, by their tier's worth; null with none. */
export function keywordsOf(requirements: readonly Requirement[], resumeText: string): number | null {
  if (requirements.length === 0) return null
  let found = 0
  let worth = 0
  for (const requirement of requirements) {
    worth += TIER_WORTH[requirement.tier]
    if (onResume(requirement.keyword || requirement.name, resumeText)) found += TIER_WORTH[requirement.tier]
  }
  return Math.round((found / worth) * 100)
}

/** How many tier 1 requirements have no evidence at all on the resume. */
export const missingScreening = (requirements: readonly Requirement[], evidence: readonly Evidence[]) =>
  requirements.filter((requirement, index) => requirement.tier === 1 && (evidence[index]?.strength ?? "none") === "none").length

/**
 * The whole score, 0 to 100: the layers by WEIGHTS, those that are null
 * sharing out their weight, then MISSING_SCREENING taken off for each of
 * `missed`: the tier 1 requirements missed, and a graduation date outside
 * the posting's window.
 */
export function blendedScore(parts: Parts, missed = 0): number {
  const counted = (Object.keys(WEIGHTS) as Layer[]).filter((layer) => parts[layer] !== null)
  const weight = counted.reduce((sum, layer) => sum + WEIGHTS[layer], 0)
  const blend = counted.reduce((sum, layer) => sum + (parts[layer] ?? 0) * WEIGHTS[layer], 0) / weight
  return Math.round(blend * MISSING_SCREENING ** missed)
}

/** How many requirements have their best evidence in each group, and how many none. */
export function foundOf(evidence: readonly Evidence[]): Record<Group, number> & { missing: number } {
  const found = { experience: 0, projects: 0, skills: 0, coursework: 0, missing: 0 }
  for (const { strength, place } of evidence) {
    if (strength === "none" || place === "nowhere") found.missing++
    else found[place]++
  }
  return found
}

/** Best first: by score, then the resume edited most recently. */
export function ranked<Match extends { score: number; updatedAt?: string }>(matches: readonly Match[]): Match[] {
  const time = (match: Match) => Date.parse(match.updatedAt ?? "") || 0
  return [...matches].sort((a, b) => b.score - a.score || time(b) - time(a))
}

/** A place as the AI or storage gave it, nowhere when it isn't one. */
export const placeOf = (value: unknown): Place => (GROUPS.includes(value as Group) ? (value as Group) : "nowhere")

/** A strength as the AI or storage gave it, none when it isn't one. */
export const strengthOf = (value: unknown): Strength => (STRENGTHS.includes(value as Strength) ? (value as Strength) : "none")

/** A tier as the AI or storage gave it, read from the older must-have flag when there's none: a must-have is tier 1, the rest tier 3. */
export const tierOf = (value: unknown, must?: unknown): Tier => (TIERS.includes(value as Tier) ? (value as Tier) : must === true ? 1 : 3)

/** A 0 to 100 rating as the AI or storage gave it, 0 when it isn't a number. */
export const ratingOf = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value))) : 0
