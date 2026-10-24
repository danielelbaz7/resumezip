import { describe, expect, test } from "vitest"
import { asSaved } from "@/lib/testResume"
import { graduationFit, graduationOf, windowText, yearMonthOf } from "./graduation"

const school = (schoolEndDate: string, leftOut?: true) => ({
  id: 1,
  schoolName: "State University",
  schoolEndDate,
  ...(leftOut && { leftOut }),
})
const resume = (...ends: string[]) => asSaved({ educationSection: ends.map((end, index) => ({ ...school(end), id: index + 1 })) })
const window = (earliest: string, latest: string) => ({ earliest, latest, quote: "" })

describe("a resume's graduation date", () => {
  test("is its latest school's end date, read as resumes write dates", () => {
    expect(graduationOf(resume("Expected May 2027"))).toBe("2027-05")
    expect(graduationOf(resume("05/2023", "Jun 2027"))).toBe("2027-06")
    expect(graduationOf(resume("2026"))).toBe("2026")
    // Spring runs to May.
    expect(graduationOf(resume("Spring 2027"))).toBe("2027-05")
  })

  test("is nothing without a date, or with Present, or only on a school left out", () => {
    expect(graduationOf(resume(""))).toBeNull()
    expect(graduationOf(resume("Present"))).toBeNull()
    expect(graduationOf(asSaved({ educationSection: [school("May 2027", true)] }))).toBeNull()
    expect(graduationOf(asSaved({}))).toBeNull()
  })
})

describe("a graduation date against a posting's window", () => {
  test("fits inside it, ends included, and not outside", () => {
    const wanted = window("2026-12", "2027-06")
    expect(["2026-12", "2027-03", "2027-06", "2026-11", "2027-07"].map((date) => graduationFit(wanted, date))).toEqual([
      "fits",
      "fits",
      "fits",
      "outside",
      "outside",
    ])
  })

  test("fits when any month a year-only date or window can mean is in it", () => {
    expect(graduationFit(window("2026-12", "2027-06"), "2027")).toBe("fits")
    expect(graduationFit(window("2027", "2027"), "2027-05")).toBe("fits")
    expect(graduationFit(window("2028", ""), "2027-12")).toBe("outside")
  })

  test("leaves an end open when the posting does", () => {
    expect(graduationFit(window("", "2027-06"), "2025-05")).toBe("fits")
    expect(graduationFit(window("2026", ""), "2030-05")).toBe("fits")
  })

  test("is unknown when the resume has no date", () => {
    expect(graduationFit(window("2026-12", "2027-06"), null)).toBe("unknown")
  })

  test("reads a year and month only as YYYY or YYYY-MM, and writes a window as the list shows it", () => {
    expect([yearMonthOf("2027-05"), yearMonthOf("2027"), yearMonthOf(""), yearMonthOf("May 2027"), yearMonthOf("2027-13")]).toEqual([
      "2027-05",
      "2027",
      "",
      null,
      null,
    ])
    expect(windowText(window("2026-12", "2027-06"))).toBe("Dec 2026 – Jun 2027")
    expect(windowText(window("", "2027-06"))).toBe("by Jun 2027")
  })
})
