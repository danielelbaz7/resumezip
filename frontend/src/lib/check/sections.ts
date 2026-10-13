// Sections & entries (S1–S9 in issue #58, and S10–S12): what the resume has,
// whether each entry says what it is and where it was, and what's worth
// saying in the summary, skills and education.

import { SECTIONS, type FieldKey, type FieldKeyOf, type SectionName } from "@/components/editor/sections"
import { BUZZ } from "./bullets"
import { stageOf } from "./career"
import type { Problem, Rule } from "./engine"
import { LOCATION_FIELDS, type Place } from "./places"
import { datesOf } from "./readDate"
import { textsOf, type Entry, type ResumeView } from "./resume"
import {
  COLLEGE_DEGREE,
  COLLEGE_NAME,
  EARLY_CAREER_YEARS,
  FRESHMAN_YEARS_LEFT,
  GPA_CUTOFF,
  GPA_SCALE,
  GPA_SCALE_WITH_PLUS,
  HIGH_SCHOOL_NAME,
  INTERESTS_GROUP,
  MAX_COURSES,
  MAX_SKILLS_PER_LINE,
  OBJECTIVE_HEADING,
  OBJECTIVE_PHRASE,
  REFERENCES_ON_REQUEST,
  SCHOOL_YEAR_STARTS,
  SKILL_RATING,
  SOFT_SKILLS,
  SUMMARY_WORDS,
} from "./settings"

const at = (entry: Entry, field?: FieldKey): Place => ({ kind: "entry", section: entry.section, entry: entry.index, field })

const filled = (entries: Entry[]) => entries.filter((entry) => !entry.blank)

// The sections that show what the person has done.
const EXPERIENCE: SectionName[] = ["Work", "Projects", "Leadership", "Volunteership"]

// What says what an entry is: its role and company, its school and degree.
const NAMED_BY: { [Section in SectionName]?: FieldKeyOf<Section>[] } = {
  Education: ["schoolName", "degree"],
  Work: ["workRole", "companyName"],
  Projects: ["projectName"],
  Publications: ["publicationTitle"],
  Volunteership: ["volunteerRole", "volunteerOrg"],
  Leadership: ["leadershipRole", "leadershipOrg"],
  Awards: ["awardName"],
}

const labelOf = (section: SectionName, field: FieldKey) => SECTIONS[section].fields.find((def) => def.key === field)?.label ?? field

/**
 * The items in a list typed with commas, semicolons or bars, leaving those
 * inside brackets alone: "Excel (pivot tables, VLOOKUP)" is one item.
 */
export function listOf(text: string): string[] {
  const items: string[] = []
  let item = ""
  let depth = 0
  for (const char of text) {
    if (char === "(" || char === "[") depth++
    else if ((char === ")" || char === "]") && depth > 0) depth--
    else if (depth === 0 && /[,;|•·]/.test(char)) {
      items.push(item)
      item = ""
      continue
    }
    item += char
  }
  items.push(item)
  return items.map((each) => each.trim()).filter(Boolean)
}

// The latest year in a date, like 2027 in "Expected May 2027".
function yearOf(date: string): number | null {
  const years = (date.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number)
  return years.length ? Math.max(...years) : null
}

const experience: Rule = {
  id: "S1",
  category: "sections",
  level: "fix",
  reads: "form",
  title: "Experience, projects, leadership or volunteering",
  why: "It's what a recruiter reads most closely: what you've done.",
  check: ({ resume }) => {
    const entries = EXPERIENCE.flatMap((section) => filled(resume.sections[section]))
    // Titles, tools and links identify an entry, but don't describe what the
    // person did. Only printed descriptions can satisfy this essential check.
    if (entries.some((entry) => entry.bullets.some((bullet) => /\p{L}/u.test(bullet.text)))) return { checked: 1, problems: [] }
    const first = entries[0]
    const description = first && SECTIONS[first.section].fields.find((field) => field.type === "bullets")?.key
    return {
      checked: 1,
      problems: [
        {
          place: first ? at(first, description) : { kind: "section", section: "Work" },
          message: first ? "Describe what you did in an experience or project" : "Add experience, projects, leadership or volunteering",
          suggestion: "Describe a contribution in a job, class project, club, leadership role or volunteer experience.",
        },
      ],
    }
  },
}

/**
 * Whether the earliest year on any job, project, leadership or volunteer role
 * (its start, or its end when it has no start) is less than
 * EARLY_CAREER_YEARS ago, or none of them says: early in a career, a missing
 * school or skills is a gap recruiters notice, while later the work can speak
 * for itself. A student's old project or volunteer role counts too, so this
 * reads a career as longer than career.ts's stageOf does.
 */
function earlyCareer(resume: ResumeView, today: Date): boolean {
  const years = EXPERIENCE.flatMap((section) => resume.sections[section]).flatMap((entry) => {
    const { start, end } = datesOf(entry)
    const date = (start ?? end)?.date
    return date && !date.present && date.year !== undefined ? [date.year] : []
  })
  return years.length === 0 || today.getFullYear() - Math.min(...years) < EARLY_CAREER_YEARS
}

const education: Rule = {
  id: "S2",
  category: "sections",
  level: "look",
  reads: "form",
  title: "Your education",
  why: "Most job posts ask for a degree or school, so recruiters look for it.",
  check: ({ resume, today }) => ({
    checked: 1,
    problems:
      filled(resume.sections.Education).length > 0
        ? []
        : [
            {
              place: { kind: "section", section: "Education" },
              message: "Add your education",
              ...(earlyCareer(resume, today) && { level: "fix" as const }),
            },
          ],
  }),
}

const named: Rule = {
  id: "S3",
  category: "sections",
  level: "look",
  reads: "form",
  title: "Each entry has its role, company, school or degree",
  why: "Without it, a recruiter can't tell what the entry is.",
  check: ({ resume }) => {
    let checked = 0
    const problems: Problem[] = []
    for (const section of resume.order) {
      const fields = NAMED_BY[section] ?? []
      for (const entry of filled(resume.sections[section])) {
        checked += fields.length
        for (const field of fields.filter((key) => !entry.values[key])) {
          // An explicitly independent role already explains why there is no
          // single employer. Ordinary job titles still need an organization.
          if (
            section === "Work" &&
            field === "companyName" &&
            /\b(?:freelanc(?:e|er)|self[ -]employed|independent contractor)\b/i.test(entry.values.workRole)
          )
            continue
          problems.push({
            place: at(entry, field),
            message: `No ${labelOf(section, field).toLowerCase()}`,
            ...(section === "Work" && { level: "fix" as const }),
            ...(section === "Work" &&
              field === "companyName" && { suggestion: "Name the employer, or identify the work as self-employed or freelance." }),
          })
        }
      }
    }
    return checked ? { checked, problems } : null
  },
}

const located: Rule = {
  id: "S10",
  category: "sections",
  level: "look",
  reads: "form",
  title: "Every job, school and role has its location",
  why: "Recruiters look at where you worked and studied, and some jobs need someone nearby.",
  check: ({ resume }) => {
    let checked = 0
    const problems: Problem[] = []
    for (const section of resume.order) {
      const field = LOCATION_FIELDS[section]
      if (!field) continue
      for (const entry of filled(resume.sections[section])) {
        checked++
        if (!entry.values[field])
          problems.push({ place: at(entry, field), message: "No location", suggestion: "Add the city, like “Austin, TX”, or “Remote”." })
      }
    }
    return checked ? { checked, problems } : null
  },
}

const blank: Rule = {
  id: "S4",
  category: "sections",
  level: "look",
  reads: "form",
  title: "No empty entries",
  why: "An entry that was added but never filled in leaves a gap on the page.",
  check: ({ resume }) => {
    const entries = resume.order.flatMap((section) => resume.sections[section])
    if (entries.length === 0) return null
    return {
      checked: entries.length,
      problems: entries
        .filter((entry) => entry.blank)
        .map((entry) => ({ place: at(entry), message: "Empty entry", suggestion: "Fill it in or delete it." })),
    }
  },
}

const skills: Rule = {
  id: "S5",
  category: "sections",
  level: "look",
  reads: "form",
  title: "Your skills, in short lines, each listed once",
  why: "Recruiters and hiring software look for skills by name, and skim long lists.",
  check: ({ resume, today }) => {
    const entries = filled(resume.sections.Skills)
    if (entries.length === 0) {
      const level = earlyCareer(resume, today) ? ("fix" as const) : undefined
      return {
        checked: 1,
        problems: [{ place: { kind: "section", section: "Skills" }, message: "Add your skills", ...(level && { level }) }],
      }
    }
    let checked = 0
    const problems: Problem[] = []
    const seen = new Set<string>()
    for (const entry of entries) {
      const items = listOf(entry.values.skillDetails)
      // A group with a category but no skills prints as "Languages:" and nothing more.
      if (items.length === 0) {
        checked += 1
        problems.push({ place: at(entry, "skillDetails"), message: "No skills in this group" })
        continue
      }
      checked += items.length
      if (items.length >= MAX_SKILLS_PER_LINE) {
        problems.push({
          place: at(entry, "skillDetails"),
          message: `${items.length} skills on one line`,
          suggestion: "Split them into groups, like Languages and Tools.",
        })
      }
      // Interests are about the person, so soft skills can go there.
      const interests = INTERESTS_GROUP.test(entry.values.skillName)
      for (const item of items) {
        const same = item.toLowerCase().replace(/\s+/g, " ")
        if (seen.has(same)) {
          problems.push({ place: at(entry, "skillDetails"), message: `“${item}” is listed twice`, text: item })
        }
        seen.add(same)
        if (!interests && SOFT_SKILLS.includes(same)) {
          problems.push({
            advisory: true,
            place: at(entry, "skillDetails"),
            message: `“${item}” is a soft skill`,
            text: item,
            suggestion: "Show it in a bullet instead, with what you did.",
          })
        }
        if (SKILL_RATING.test(item)) {
          problems.push({
            advisory: true,
            place: at(entry, "skillDetails"),
            message: `“${item}” rates the skill`,
            text: item,
            suggestion: "Leave the rating off: list only what you could be interviewed on, most relevant first.",
          })
        }
      }
    }
    return { checked, problems }
  },
}

const projects: Rule = {
  id: "S6",
  category: "sections",
  level: "look",
  reads: "form",
  title: "Each project has a link or its tech stack",
  why: "A link or the tools it's built with shows the project is real.",
  check: ({ resume }) => {
    const entries = filled(resume.sections.Projects)
    if (entries.length === 0) return null
    return {
      checked: entries.length,
      problems: entries
        .filter(({ values }) => !values.projectGithub && !values.additionalLink && !values.techStack)
        .map((entry) => ({
          place: at(entry, "techStack"),
          message: "No link or tech stack",
          suggestion: "Add what it's built with, or a link to it.",
        })),
    }
  },
}

const highSchool: Rule = {
  id: "S7",
  category: "sections",
  level: "look",
  reads: "form",
  title: "No high school once you're past your first year of college",
  why: "Recruiters look at your latest school, and high school takes room from it.",
  check: ({ resume, today }) => {
    const schools = filled(resume.sections.Education)
    const isHighSchool = ({ values }: Entry) => HIGH_SCHOOL_NAME.test(values.schoolName) || HIGH_SCHOOL_NAME.test(values.degree)
    const high = schools.filter(isHighSchool)
    const college = schools.filter(
      (entry) => !isHighSchool(entry) && (COLLEGE_DEGREE.test(entry.values.degree) || COLLEGE_NAME.test(entry.values.schoolName)),
    )
    if (high.length === 0 || college.length === 0) return null
    // A freshman can keep high school: college ends 3 or more school years
    // from the one under way, which ends the June after August.
    const schoolYear = today.getFullYear() + (today.getMonth() >= SCHOOL_YEAR_STARTS ? 1 : 0)
    const freshman = college.some((entry) => (yearOf(entry.values.schoolEndDate) ?? 0) - schoolYear >= FRESHMAN_YEARS_LEFT)
    return {
      checked: high.length,
      problems: freshman
        ? []
        : high.map((entry) => ({
            place: at(entry),
            message: "High school next to college",
            suggestion: "Leave it off after your first year of college.",
          })),
    }
  },
}

const coursework: Rule = {
  id: "S8",
  category: "sections",
  level: "look",
  reads: "form",
  title: "Short coursework lists",
  why: "A long list of courses buries the ones that matter.",
  check: ({ resume, today }) => {
    const entries = filled(resume.sections.Education).filter(({ values }) => values.coursework)
    if (entries.length === 0) return null
    // Courses show what a student knows; a few years on, the work does.
    const experienced = stageOf(resume, today) === "experienced"
    return {
      checked: entries.length,
      problems: entries.flatMap((entry): Problem[] => {
        const courses = listOf(entry.values.coursework).length
        return [
          ...(courses > MAX_COURSES
            ? [{ place: at(entry, "coursework"), message: `${courses} courses listed`, suggestion: "Keep the few that fit the job best." }]
            : []),
          ...(experienced
            ? [
                {
                  advisory: true,
                  place: at(entry, "coursework"),
                  message: "Coursework, years after school",
                  suggestion: "Coursework helps while you're in school or just out; now your work says more.",
                },
              ]
            : []),
        ]
      }),
    }
  },
}

const references: Rule = {
  id: "S9",
  category: "sections",
  level: "look",
  reads: "form",
  title: "No “References available upon request”",
  why: "Recruiters ask for references when they want them, so the line takes room for nothing.",
  check: ({ resume }) => ({
    checked: 1,
    problems: textsOf(resume).flatMap(({ place, text }) => {
      const found = REFERENCES_ON_REQUEST.exec(text)
      return found ? [{ place, message: "Leave off “References available upon request”", text: found[0] }] : []
    }),
  }),
}

const objective: Rule = {
  id: "S11",
  category: "sections",
  level: "look",
  reads: "form",
  title: "A summary of what you offer, not what you want",
  why: "Recruiters read the top to see what you offer; an objective tells them what you want.",
  check: ({ resume }) => {
    const texts = textsOf(resume).filter(
      ({ place }) =>
        (place.kind === "profile" && place.field === "summary") ||
        place.kind === "heading" ||
        place.kind === "extra-heading" ||
        (place.kind === "extra-text" && place.field === "text"),
    )
    if (texts.length === 0) return null
    return {
      checked: texts.length,
      problems: texts.flatMap(({ place, text }): Problem[] => {
        if (place.kind === "heading" || place.kind === "extra-heading") {
          return OBJECTIVE_HEADING.test(text)
            ? [
                {
                  place,
                  message: "An objective section",
                  suggestion: "Make it a short summary: what you do, for how long, and what you're best at.",
                },
              ]
            : []
        }
        const problems: Problem[] = []
        if (OBJECTIVE_PHRASE.test(text)) {
          problems.push({
            place,
            message: "Reads as an objective",
            suggestion: "Say what you do, for how long, and what you're best at, in 2–3 sentences.",
          })
        }
        if (place.kind !== "profile") return problems
        const buzzword = BUZZ.exec(text)?.[1]
        if (buzzword) {
          const word = buzzword[0].toUpperCase() + buzzword.slice(1)
          problems.push({
            place,
            text: buzzword,
            message: `“${word}” says little on its own`,
            suggestion: "Say what you've done that shows it.",
          })
        }
        const words = text.split(/\s+/).filter(Boolean).length
        if (words > SUMMARY_WORDS) {
          problems.push({ advisory: true, place, message: `${words} words`, suggestion: "Keep it to 2–3 sentences, so it's read." })
        }
        return problems
      }),
    }
  },
}

// "3.6 / 4.0", "3.6 out of 4", "4.3 on a 5.0 scale": a GPA and the scale it's out of.
const GPA_OUT_OF = /(\d+(?:\.\d+)?)\s*(?:\/|out of|on an?)\s*(\d+(?:\.\d+)?)/i

/** A GPA as typed, and its scale: 4.0 when none is given and it could be out of 4. Null when it can't be read, as a percentage can't. */
function gpaOf(text: string): { value: number; scale: number } | null {
  if (/%/.test(text)) return null
  const outOf = GPA_OUT_OF.exec(text)
  const value = Number(outOf?.[1] ?? /\d+(?:\.\d+)?/.exec(text)?.[0])
  const scale = outOf ? Number(outOf[2]) : GPA_SCALE
  return Number.isFinite(value) && scale > 0 && value <= scale ? { value, scale } : null
}

const gpa: Rule = {
  id: "S12",
  category: "sections",
  level: "look",
  advisory: true,
  reads: "form",
  title: "Your GPA, when it helps",
  why: "A GPA under 3.5 out of 4.0 rarely helps, unless the job asks for one.",
  check: ({ resume }) => {
    const entries = filled(resume.sections.Education).filter(({ values }) => values.gpa)
    if (entries.length === 0) return null
    return {
      checked: entries.length,
      problems: entries.flatMap((entry): Problem[] => {
        const found = gpaOf(entry.values.gpa)
        if (!found) return []
        // On a 4-point scale an A is 4.0, even where an A+ is more; elsewhere the same share of the top.
        const fourPoint = found.scale >= GPA_SCALE && found.scale <= GPA_SCALE_WITH_PLUS
        const low = fourPoint ? found.value < GPA_CUTOFF : found.value / found.scale < GPA_CUTOFF / GPA_SCALE
        return low
          ? [
              {
                place: at(entry, "gpa"),
                message: `A GPA of ${entry.values.gpa}`,
                suggestion: "Many leave a GPA under 3.5 out of 4.0 off, unless the job asks for it.",
              },
            ]
          : []
      }),
    }
  },
}

export const SECTION_RULES: readonly Rule[] = [
  experience,
  education,
  named,
  blank,
  skills,
  projects,
  highSchool,
  coursework,
  references,
  located,
  objective,
  gpa,
]
