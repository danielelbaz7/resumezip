import { describe, expect, test } from "vitest"
import { stageOf, yearsOfWork } from "./career"
import { viewOf } from "./resume"

const today = new Date(2026, 9, 13)

const job = (workStartDate: string, workEndDate: string) => ({ workRole: "Engineer", companyName: "Google", workStartDate, workEndDate })
const school = (schoolStartDate: string, schoolEndDate: string, schoolName = "University of Texas at Austin") => ({
  schoolName,
  degree: "B.S. in Computer Science",
  schoolStartDate,
  schoolEndDate,
})

const resumeWith = ({ jobs = [], schools = [] }: { jobs?: ReturnType<typeof job>[]; schools?: ReturnType<typeof school>[] }) =>
  viewOf({
    profileSection: { fullName: "Jake Ryan" },
    workExperienceSection: jobs.map((entry, i) => ({ id: i + 1, ...entry })),
    educationSection: schools.map((entry, i) => ({ id: i + 1, ...entry })),
  })

const years = (...jobs: ReturnType<typeof job>[]) => yearsOfWork(resumeWith({ jobs }), today)

describe("yearsOfWork", () => {
  test("counts the months from a job's first to its last, this month included", () => {
    // Jan 2015 to Oct 2026: 142 months.
    expect(years(job("Jan 2015", "Present"))).toBeCloseTo(142 / 12)
  })

  test("doesn't count the gaps between jobs", () => {
    // 36 months, then 70 from Jan 2021: 8.8 years, over a span of nearly 15.
    expect(years(job("Jan 2012", "Dec 2014"), job("Jan 2021", "Present"))).toBeCloseTo(106 / 12)
  })

  test("counts overlapping jobs once", () => {
    expect(years(job("Jan 2015", "Dec 2020"), job("Jan 2018", "Present"))).toBeCloseTo(142 / 12)
  })

  test("reads a year alone as the whole year, a season as its months, and no end as still going", () => {
    expect(years(job("2019", "2020"))).toBe(2)
    expect(years(job("Summer 2024", "Summer 2024"))).toBe(3 / 12)
    expect(years(job("Jan 2025", ""))).toBeCloseTo(22 / 12)
  })

  test("leaves out what hasn't happened yet: an upcoming internship, or an end after this month", () => {
    expect(years(job("Jun 2027", "Aug 2027"))).toBe(0)
    expect(years(job("Jan 2026", "Dec 2026"))).toBeCloseTo(10 / 12)
  })

  test("is nothing without dates, or with dates the wrong way round", () => {
    expect(years(job("", ""))).toBe(0)
    expect(years(job("Jan 2024", "Jan 2020"))).toBe(0)
  })
})

describe("stageOf", () => {
  test("is early in school, and for a few years after graduating", () => {
    expect(stageOf(resumeWith({ schools: [school("Aug 2023", "Expected May 2027")] }), today)).toBe("early")
    expect(stageOf(resumeWith({ schools: [school("Aug 2023", "")] }), today)).toBe("early")
    // May 2024 is 29 months ago, with 2.4 years of work since.
    expect(stageOf(resumeWith({ schools: [school("Aug 2020", "May 2024")], jobs: [job("Jun 2024", "Present")] }), today)).toBe("early")
  })

  test("is experienced over 3 years after graduating", () => {
    expect(stageOf(resumeWith({ schools: [school("Aug 2019", "May 2023")] }), today)).toBe("experienced")
  })

  test("is experienced after years of work, whenever the last degree was", () => {
    const masters = resumeWith({
      schools: [school("Aug 2024", "May 2026", "Georgia Tech"), school("Aug 2012", "May 2016")],
      jobs: [job("Jun 2016", "Aug 2024")],
    })
    expect(stageOf(masters, today)).toBe("experienced")
  })

  test("is unknown without a dated college", () => {
    expect(stageOf(resumeWith({ schools: [school("", "")] }), today)).toBeUndefined()
    expect(stageOf(resumeWith({ schools: [school("Aug 2022", "May 2026", "Westlake High School")] }), today)).toBeUndefined()
  })
})
