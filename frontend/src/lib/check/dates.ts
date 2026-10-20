// Dates (D1–D9 in issue #58): that each entry has them, that they make sense,
// that they're written one way, and that jobs and graduations give the month.

import type { FieldKey, SectionName } from "@/components/editor/sections"
import { isHighSchool, stageOf } from "./career"
import type { Problem, Rule } from "./engine"
import { entryPlace } from "./places"
import { compareDates, datesOf, DATE_FIELDS, hasEnded, monthName, type EntryDates, type ResumeDate, type Written } from "./readDate"
import type { ResumeView } from "./resume"
import { EXPECTED_WORDS } from "./settings"
import { escaped, mostCommon } from "./text"

// Jobs, schools and roles: what has a start and an end.
const SPANS: SectionName[] = ["Work", "Education", "Leadership", "Volunteership"]

/** The dates of each entry with something in it, section by section, in the order they're printed. */
const allDates = (resume: ResumeView, sections: readonly SectionName[] = resume.order) =>
  resume.order
    .filter((section) => sections.includes(section))
    .map((section) => resume.sections[section].filter((entry) => !entry.blank).map(datesOf))

const writtenIn = (dates: EntryDates) => [dates.start, dates.end].filter((date): date is Written => date !== undefined)

const noDates: Rule = {
  id: "D1",
  category: "dates",
  level: "fix",
  reads: "form",
  title: "Every job, school and role has dates",
  why: "Recruiters read dates to see how long you did something, and how recently.",
  check: ({ resume }) => {
    const entries = allDates(resume, SPANS).flat()
    if (entries.length === 0) return null
    return {
      checked: entries.length,
      problems: entries
        .filter((dates) => dates.filled === 0)
        .map(({ entry }) => {
          const fields = DATE_FIELDS[entry.section] as { start: FieldKey }
          return { place: entryPlace(entry, fields.start), message: "No dates", suggestion: "Add when it started and ended." }
        }),
    }
  },
}

const backwards: Rule = {
  id: "D2",
  category: "dates",
  level: "fix",
  reads: "form",
  title: "Nothing ends before it starts",
  why: "Swapped dates leave a recruiter guessing which one is right.",
  check: ({ resume }) => {
    const both = allDates(resume)
      .flat()
      .filter((dates) => dates.start && dates.end)
    if (both.length === 0) return null
    return {
      checked: both.length,
      problems: both
        .filter(({ start, end }) => compareDates(end!.date, start!.date) < 0)
        .map(({ entry, end }) => ({ place: entryPlace(entry, end!.field), message: "Ends before it starts" })),
    }
  },
}

const unreadable: Rule = {
  id: "D3",
  category: "dates",
  level: "look",
  reads: "form",
  title: "Every date can be read",
  why: "Hiring software reads dates to count your experience, and may skip one it can't read.",
  check: ({ resume }) => {
    const entries = allDates(resume).flat()
    const filled = entries.reduce((total, dates) => total + dates.filled, 0)
    if (filled === 0) return null
    return {
      checked: filled,
      problems: entries.flatMap(({ entry, unreadable }) =>
        unreadable.map(({ field }) => ({
          place: entryPlace(entry, field),
          message: "Can't read this date",
          suggestion: "Write it like “Jan 2024”, or “Present” if it hasn't ended.",
        })),
      ),
    }
  },
}

// How the resume writes months, from what most of its dates do.
interface HouseStyle {
  numbers?: boolean
  long?: boolean
  dotted?: boolean
  sept?: boolean
}

type MonthDate = Written & { date: Extract<ResumeDate, { present: false }> }

const isName = (written: MonthDate) => written.date.style.kind === "name"
const spellingOf = (written: MonthDate) => (written.date.style.kind === "name" ? written.date.style.spelling : "")
// May, June and July are written the same way short or long.
const lengthOf = (written: MonthDate) => {
  const spelling = spellingOf(written)
  const full = monthName(written.date.month!, { long: true }).toLowerCase()
  return spelling === full && spelling.length <= 4 ? undefined : spelling.length >= 5 ? "long" : "short"
}
const isShortened = (written: MonthDate) =>
  isName(written) && spellingOf(written) !== monthName(written.date.month!, { long: true }).toLowerCase()
const isDotted = (written: MonthDate) => written.date.style.kind === "name" && written.date.style.dotted

function houseStyle(dates: MonthDate[]): HouseStyle {
  const names = dates.filter(isName)
  const shortened = names.filter(isShortened)
  const september = shortened.filter((written) => written.date.month === 9)
  return {
    numbers: mostCommon(dates.filter((written) => written.date.style.kind !== "season").map((written) => !isName(written))),
    long: mostCommon(
      names
        .map(lengthOf)
        .filter((length) => length !== undefined)
        .map((length) => length === "long"),
    ),
    dotted: mostCommon(shortened.map(isDotted)),
    sept: mostCommon(september.map((written) => spellingOf(written) === "sept")),
  }
}

// Whether a date's month is written the resume's usual way.
function followsHouse(written: MonthDate, house: HouseStyle): boolean {
  if (written.date.style.kind === "season") return true
  if (house.numbers !== undefined && house.numbers !== !isName(written)) return false
  if (!isName(written)) return true
  const length = lengthOf(written)
  if (house.long !== undefined && length !== undefined && house.long !== (length === "long")) return false
  if (isShortened(written) && house.dotted !== undefined && house.dotted !== isDotted(written)) return false
  if (isShortened(written) && written.date.month === 9 && house.sept !== undefined && house.sept !== (spellingOf(written) === "sept"))
    return false
  return true
}

// A date written the resume's usual way, for the suggestion. A range's first
// month keeps going without its year, as "Sep" in "Sep – Dec 2025".
function rewrite({ date, text }: MonthDate, house: HouseStyle): string {
  if (house.numbers) return `${String(date.month).padStart(2, "0")}/${date.year}`
  const year = /\d/.test(text) ? ` ${date.year}` : ""
  return `${monthName(date.month!, { long: house.long, dotted: house.dotted, sept: house.sept })}${year}`
}

const mixedFormats: Rule = {
  id: "D4",
  category: "dates",
  level: "look",
  reads: "form",
  title: "Dates written one way",
  why: "Dates written the same way read as careful work.",
  check: ({ resume, today }) => {
    // Publications follow their citation style, as IEEE's “Aug. 2023”.
    const entryDates = allDates(
      resume,
      resume.order.filter((section) => section !== "Publications"),
    )
    const sections = entryDates.map((entries) =>
      entries.flatMap(writtenIn).filter((written): written is MonthDate => !written.date.present),
    )
    const dates = sections.flat()
    // D9 asks for a graduation date's month early in a career, so that's left to it here.
    const graduations = new Set(
      stageOf(resume, today) === "early"
        ? entryDates
            .flat()
            .filter((dates) => dates.entry.section === "Education" && !isHighSchool(dates.entry))
            .map((dates) => dates.end)
        : [],
    )
    if (dates.length < 2) return null
    const problems = new Map<string, Problem>()
    const flag = (written: Written, problem: Omit<Problem, "place" | "text">) => {
      const key = `${written.entry.section}.${written.entry.index}.${written.field}|${written.text}`
      if (!problems.has(key)) problems.set(key, { place: entryPlace(written.entry, written.field), text: written.text, ...problem })
    }
    // Years on their own, or with months: one way within a section, so
    // projects can go by year while jobs have months. Jobs always need their
    // months (D8), and a school is never told to drop one.
    for (const written of sections) {
      const section = written[0]?.entry.section
      if (section === "Work") continue
      const hasMonth = (date: MonthDate) => date.date.month !== undefined
      const withMonths = written.filter(hasMonth).length
      const yearsOnly = written.length - withMonths
      if (withMonths === 0 || yearsOnly === 0) continue
      for (const date of written) {
        if (yearsOnly <= withMonths && !hasMonth(date)) {
          if (graduations.has(date)) continue
          flag(date, {
            message: "No month, unlike the rest of this section",
            suggestion: "Add the month, or use only years in this section.",
          })
        } else if (yearsOnly > withMonths && hasMonth(date) && section !== "Education") {
          flag(date, { message: "Has a month, unlike the rest of this section", suggestion: `Write just the year: “${date.date.year}”.` })
        }
      }
    }
    // Months, one way across the resume: names or numbers, short or long, with or without a dot.
    const months = dates.filter((written) => written.date.month !== undefined)
    const house = houseStyle(months)
    for (const written of months) {
      if (!followsHouse(written, house)) {
        flag(written, { message: "Not written like your other dates", suggestion: `Write it like “${rewrite(written, house)}”.` })
      }
    }
    return { checked: dates.length, problems: [...problems.values()] }
  },
}

const presentWords: Rule = {
  id: "D5",
  category: "dates",
  level: "look",
  reads: "form",
  title: "“Present” written one way",
  why: "One word for what you're still doing reads as careful work.",
  check: ({ resume }) => {
    const present = allDates(resume)
      .flat()
      .flatMap(writtenIn)
      .filter((written) => written.date.present)
    if (present.length < 2) return null
    const word = (written: Written) => (written.date.present ? written.date.word : "")
    const house = mostCommon(present.map((written) => word(written).toLowerCase()))
    const usual = present.find((written) => word(written).toLowerCase() === house)!
    return {
      checked: present.length,
      problems: present
        .filter((written) => word(written).toLowerCase() !== house)
        .map((written) => ({
          place: entryPlace(written.entry, written.field),
          text: written.text,
          message: `“${word(written)}” here, “${word(usual)}” elsewhere`,
          suggestion: `Use “${word(usual)}” everywhere.`,
        })),
    }
  },
}

const newestFirst: Rule = {
  id: "D6",
  category: "dates",
  level: "look",
  reads: "form",
  title: "Newest entries first",
  why: "Recruiters expect your latest work first.",
  check: ({ resume }) => {
    let checked = 0
    const problems: Problem[] = []
    for (const entries of allDates(resume, SPANS)) {
      const dated = entries.filter((dates) => dates.start || dates.end)
      for (let i = 1; i < dated.length; i++) {
        const [above, below] = [dated[i - 1], dated[i]]
        // Only one that's newer by every date both have: overlapping roles
        // can go either way, as an upcoming internship above a campus job.
        const sides = (["start", "end"] as const).filter((side) => above[side] && below[side])
        if (sides.length === 0) continue
        checked++
        const order = sides.map((side) => compareDates(below[side]!.date, above[side]!.date))
        if (order.some((difference) => difference > 0) && order.every((difference) => difference >= 0)) {
          const date = below.end ?? below.start!
          problems.push({
            place: entryPlace(below.entry, date.field),
            message: "Newer than the entry above",
            suggestion: "List the newest first.",
          })
        }
      }
    }
    return checked ? { checked, problems } : null
  },
}

const apostropheYears: Rule = {
  id: "D7",
  category: "dates",
  level: "look",
  reads: "form",
  title: "Whole years, without an apostrophe",
  why: "A whole year is clearer, to people and to hiring software.",
  check: ({ resume }) => {
    const dates = allDates(resume).flat().flatMap(writtenIn)
    if (dates.length === 0) return null
    return {
      checked: dates.length,
      problems: dates.flatMap((written) => {
        const year = written.text.match(/['’‘]\d{2}\b/)?.[0]
        if (written.date.present || !written.date.shortYear || !year) return []
        return [
          {
            place: entryPlace(written.entry, written.field),
            text: written.text,
            message: `Year written as “${year}”`,
            suggestion: `Write the whole year: “${written.date.year}”.`,
          },
        ]
      }),
    }
  },
}

const jobMonths: Rule = {
  id: "D8",
  category: "dates",
  level: "look",
  reads: "form",
  title: "Month and year on every job",
  why: "A year alone could mean one month or twelve, so recruiters can't tell how long you were there.",
  check: ({ resume }) => {
    const dates = allDates(resume, ["Work"])
      .flat()
      .flatMap(writtenIn)
      .filter((written): written is MonthDate => !written.date.present)
    if (dates.length === 0) return null
    return {
      checked: dates.length,
      problems: dates
        .filter((written) => written.date.month === undefined)
        .map((written) => ({
          place: entryPlace(written.entry, written.field),
          text: written.text,
          message: "No month",
          suggestion: `Add the month, like “Jun ${written.date.year}”.`,
        })),
    }
  },
}

// "Expected May 2027", "May 2027 (Expected)": a date that hasn't come yet, as written.
const EXPECTED_WORD = EXPECTED_WORDS.map(escaped).join("|")
const EXPECTED = new RegExp(String.raw`^(?:${EXPECTED_WORD})(?=[\s:]|$)|\((?:${EXPECTED_WORD})\)$`, "i")

const graduationMonth: Rule = {
  id: "D9",
  category: "dates",
  level: "look",
  reads: "form",
  title: "Month and year on your graduation date",
  why: "Recruiters read the month to see which internships and new-grad roles you can apply for.",
  check: ({ resume, today }) => {
    const schools = allDates(resume, ["Education"])
      .flat()
      .filter((dates) => dates.filled > 0 && !isHighSchool(dates.entry))
    if (schools.length === 0) return null
    // Later in a career a year is enough ("B.S., 2012"); the month matters while internships and new-grad roles do.
    const early = stageOf(resume, today) === "early"
    const endField = (DATE_FIELDS.Education as { end: FieldKey }).end
    const problems = schools.flatMap(({ entry, end }): Problem[] => {
      if (!end) {
        // Unreadable is D3's to say.
        return early && entry.values[endField] === ""
          ? [
              {
                place: entryPlace(entry, endField),
                message: "No graduation date",
                suggestion: "Add when you graduate, like “Expected May 2027”.",
              },
            ]
          : []
      }
      const place = entryPlace(entry, end.field)
      if (end.date.present) {
        return early
          ? [
              {
                place,
                text: end.text,
                message: "No graduation date",
                suggestion: "Write when you expect to graduate, like “Expected May 2027”.",
              },
            ]
          : []
      }
      if (EXPECTED.test(end.text.trim()) && hasEnded(entry, today)) {
        return [
          {
            place,
            text: end.text,
            message: "This date has passed",
            suggestion: "Update it to when you graduated, or your new expected date.",
          },
        ]
      }
      if (early && end.date.month === undefined) {
        const year = end.date.year!
        const suggestion = year > today.getFullYear() ? `Write it like “Expected May ${year}”.` : `Add the month, like “May ${year}”.`
        return [{ place, text: end.text, message: "No month", suggestion }]
      }
      return []
    })
    return { checked: schools.length, problems }
  },
}

export const DATE_RULES: readonly Rule[] = [
  noDates,
  backwards,
  unreadable,
  mixedFormats,
  presentWords,
  newestFirst,
  apostropheYears,
  jobMonths,
  graduationMonth,
]
