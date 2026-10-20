import { describe, expect, test } from "vitest"
import type { Resume } from "@/lib/resume"
import type { ExtraSection } from "@/lib/resumeSections"
import { asSaved } from "@/lib/testResume"
import { readForChecks } from "@/lib/import/read"
import { viewOf, textsOf } from "./resume"
import { hasEnoughToCheck, describePlace } from "./labels"
import { findingKey, placeExists, textAt, type Place } from "./places"
import { grammarTexts } from "./spelling"
import { matchExtraPdf, pdfLayoutOf } from "./extraPdf"
import { line, reading } from "./testPdf"
import { runChecks } from "./engine"
import { RULES } from "./rules"
import { printedLayoutBullets } from "./pdf"

const first = "11111111-1111-4111-8111-111111111111"
const second = "22222222-2222-4222-8222-222222222222"
const third = "33333333-3333-4333-8333-333333333333"
const about = { kind: "text", heading: "About", text: "Literal **prose**.\n\nAnother paragraph." } as const satisfies ExtraSection
const interests = {
  kind: "list",
  heading: "Interests",
  bullets: "○ Secret\n\n• **Reading** fiction\n• Hiking",
} as const satisfies ExtraSection
const hidden = { kind: "text", heading: "Private", text: "Hidden", leftOut: true } as const satisfies ExtraSection
const resume: Resume = {
  profileSection: { fullName: "Ada Lovelace" },
  extraSections: { [third]: about, [first]: interests, [second]: hidden },
  sectionOrder: [`extra:${first}`, `extra:${third}`],
}

describe("the sections the person added", () => {
  test("are kept apart from the editor's sections, without what's left out of the PDF, and each bullet keeps its line", () => {
    const view = viewOf(resume)
    expect(view.order.every((name) => !name.startsWith("extra:"))).toBe(true)
    expect(hasEnoughToCheck(view)).toBe(true)
    expect(view.extras[first].bullets.map(({ line, number, text }) => ({ line, number, text }))).toEqual([
      { line: 2, number: 2, text: "Reading fiction" },
      { line: 3, number: 3, text: "Hiking" },
    ])
    expect(
      textsOf(view)
        .map(({ text }) => text)
        .join(" "),
    ).not.toMatch(/Secret|Hidden|Private/)
    expect(JSON.stringify(runChecks(resume).view)).not.toMatch(/Secret|Hidden|Private/)
    // A text section's words as printed, without the marks that make them bold or italic.
    expect(textsOf(view).find(({ place }) => place.kind === "extra-text" && place.sectionId === third)?.text).toBe(
      "Literal prose.\n\nAnother paragraph.",
    )
    expect(hasEnoughToCheck(viewOf({ profileSection: resume.profileSection, extraSections: { [second]: hidden } }))).toBe(false)
  })

  test("can be pointed at down to a bullet, but not at what's left out, and a finding there keeps its key when they move", () => {
    const view = viewOf(resume)
    const place: Place = { kind: "extra-text", sectionId: first, field: "bullets", line: 2 }
    expect(placeExists(view, place)).toBe(true)
    expect(textAt(view, place)).toBe("**Reading** fiction")
    expect(describePlace(view, place)).toBe("Interests · bullet 2")
    expect(placeExists(view, { ...place, line: 0 })).toBe(false)
    expect(placeExists(view, { ...place, sectionId: second })).toBe(false)
    const moved = viewOf({ ...resume, sectionOrder: [`extra:${third}`, `extra:${first}`] })
    expect(findingKey("G1", place, textAt(view, place))).toBe(findingKey("G1", place, textAt(moved, place)))
  })

  test("are checked for spelling and grammar, but get none of the advice for a job's bullets", () => {
    const texts = grammarTexts(viewOf(resume))
    expect(texts.some(({ place }) => place.kind === "extra-text" && place.sectionId === third)).toBe(true)
    expect(texts.some(({ place }) => place.kind === "extra-text" && place.field === "bullets")).toBe(true)
    const report = runChecks(resume, { rules: RULES.filter(({ id }) => /^(B|P)[0-9]/.test(id)) })
    expect(report.findings.filter(({ place }) => "sectionId" in place)).toEqual([])
  })
})

describe("finding the sections the person added in the PDF", () => {
  test("pairs two sections with the same title and text in order", () => {
    const source: Resume = {
      extraSections: {
        [first]: { kind: "text", heading: "Interests", text: "Reading fiction" },
        [second]: { kind: "text", heading: "Interests", text: "Reading fiction" },
      },
    }
    const result = matchExtraPdf(
      [line("Interests"), line("Reading fiction"), line("Interests"), line("Reading fiction")],
      pdfLayoutOf(viewOf(source)),
    )
    expect(result.sections.map(({ sectionId, status }) => ({ sectionId, status }))).toEqual([
      { sectionId: first, status: "matched" },
      { sectionId: second, status: "matched" },
    ])
    // In the sections' order: the first's lines, then the second's.
    expect(result.excludedLines).toEqual([0, 1, 2, 3])
  })

  test("flags a section whose text is missing or changed, and only makes R3 partial when it can't tell which title is its own", () => {
    const source: Resume = { extraSections: { [first]: { kind: "text", heading: "Interests", text: "Reading fiction" } } }
    for (const lines of [
      [line("Interests"), line("Unexpected text")],
      [line("Interests"), line("Reading fiction"), line("Interests"), line("Reading fiction")],
      [],
    ]) {
      const result = readForChecks(lines, pdfLayoutOf(viewOf(source)))
      expect(result.extras.excludedLines).toEqual([])
      const report = runChecks(source, { rules: RULES.filter(({ id }) => id === "R3"), pdf: { ...reading(lines), ...result } })
      const ambiguous = result.extras.sections[0].status === "ambiguous"
      expect(!!report.results[0].partial).toBe(ambiguous)
      expect(report.findings.map(({ place }) => place)).toEqual(ambiguous ? [] : [{ kind: "extra-heading", sectionId: first }])
    }
  })

  test("isn't sure of either section when their titles are read out of order", () => {
    const source: Resume = {
      extraSections: {
        [first]: { kind: "text", heading: "First", text: "One" },
        [second]: { kind: "text", heading: "Second", text: "Two" },
      },
    }
    const result = matchExtraPdf([line("Second"), line("Two"), line("First"), line("One")], pdfLayoutOf(viewOf(source)))
    expect(result.sections.map(({ status }) => status)).toEqual(["ambiguous", "ambiguous"])
    expect(result.excludedLines).toEqual([])
  })

  test("finds a section whose text has one of the editor's titles on a line of its own", () => {
    const source = asSaved({
      extraSections: { [first]: { kind: "text", heading: "Interests", text: "Reading fiction\nAwards\nMore prose" } },
      awardsSection: [{ awardName: "Prize" }],
      sectionOrder: [`extra:${first}`, "Awards"],
      headings: { awards: "Awards" },
    })
    const result = matchExtraPdf(
      [line("Interests"), line("Reading fiction"), line("Awards"), line("More prose"), line("Awards"), line("Prize")],
      pdfLayoutOf(viewOf(source)),
    )
    expect(result.sections[0].status).toBe("matched")
    expect(result.excludedLines).toEqual([0, 1, 2, 3])
  })

  test("isn't sure of a section whose text ends with the only Awards title, which Awards needs", () => {
    const source = asSaved({
      extraSections: { [first]: { kind: "text", heading: "Interests", text: "Reading fiction\nAwards\nPrize" } },
      awardsSection: [{ awardName: "Prize" }],
      sectionOrder: [`extra:${first}`, "Awards"],
      headings: { awards: "Awards" },
    })
    const result = matchExtraPdf([line("Interests"), line("Reading fiction"), line("Awards"), line("Prize")], pdfLayoutOf(viewOf(source)))
    expect(result.sections[0].status).toBe("ambiguous")
    expect(result.excludedLines).toEqual([])
  })

  test("ends an added section's text at the title of the editor's section after it, in any template", () => {
    for (const selectedTemplate of ["jake", "referme", "ian"]) {
      const source = asSaved({
        selectedTemplate,
        extraSections: { [first]: { kind: "text", heading: "Interests", text: "Reading fiction" } },
        leadershipExperienceSection: [{ leadershipRole: "President", leadershipOrg: "Student Council" }],
        sectionOrder: [`extra:${first}`, "Leadership"],
      })
      const result = matchExtraPdf(
        [line("Interests"), line("Reading fiction"), line("Leadership"), line("Student Council"), line("President")],
        pdfLayoutOf(viewOf(source)),
      )
      expect(result.sections[0].status).toBe("matched")
    }
  })

  test("flags nothing in Experience while an added section also called Experience isn't found, and checks only part", () => {
    const source = asSaved({
      extraSections: { [first]: { kind: "text", heading: "Experience", text: "Personal interests" } },
      workExperienceSection: [{ workRole: "Engineer", companyName: "Example" }],
      sectionOrder: [`extra:${first}`, "Work"],
    })
    const lines = [
      line("Experience", { size: 14 }),
      line("Wrong extracted text"),
      line("Experience", { size: 14 }),
      line("Engineer, Example"),
    ]
    const result = readForChecks(lines, pdfLayoutOf(viewOf(source)))
    const report = runChecks(source, {
      rules: RULES.filter(({ id }) => ["R2", "R3", "R4"].includes(id)),
      pdf: { ...reading(lines), ...result },
    })
    expect(report.findings.every(({ place }) => place.kind !== "entry" && place.kind !== "heading" && place.kind !== "section")).toBe(true)
    expect(report.results.filter(({ rule }) => ["R2", "R3", "R4"].includes(rule.id)).every(({ partial }) => partial)).toBe(true)
  })

  test("doesn't count Experience's entries while an added Work Experience section isn't found", () => {
    const source = asSaved({
      profileSection: { fullName: "Ada Lovelace" },
      extraSections: { [first]: { kind: "text", heading: "Work Experience", text: "Reading fiction" } },
      workExperienceSection: [{ workRole: "Engineer", companyName: "Acme" }],
      sectionOrder: [`extra:${first}`, "Work"],
    })
    const lines = [
      line("Ada Lovelace", { size: 20 }),
      line("Work Experience", { size: 14 }),
      line("Reader, Library"),
      line("Experience", { size: 14 }),
      line("Engineer, Acme"),
    ]
    const result = readForChecks(lines, pdfLayoutOf(viewOf(source)))
    const report = runChecks(source, { rules: RULES.filter(({ id }) => ["R2", "R3"].includes(id)), pdf: { ...reading(lines), ...result } })
    expect(report.findings.map(({ place }) => place)).toEqual([{ kind: "extra-heading", sectionId: first }])
    expect(report.results.every(({ partial }) => partial)).toBe(true)
  })

  test("doesn't read an added Experience section as a job, and keeps every other line's place in the PDF", () => {
    const source = asSaved({
      profileSection: { fullName: "Ada Lovelace" },
      extraSections: { [first]: { kind: "text", heading: "Experience", text: "My personal interests" } },
      sectionOrder: [`extra:${first}`, "Work"],
      workExperienceSection: [{ companyName: "Example", workRole: "Engineer" }],
    })
    const lines = [
      line("Ada Lovelace", { size: 20 }),
      line("Experience", { size: 14 }),
      line("My personal interests"),
      line("Experience", { size: 14 }),
      line("Engineer, Example"),
      line("2024 - Present"),
    ]
    const result = readForChecks(lines, pdfLayoutOf(viewOf(source)))
    expect(result.extras.sections[0].status).toBe("matched")
    expect(result.parsed.lines).toHaveLength(lines.length)
    expect(result.parsed.sections.find(({ name }) => name === "Work")?.entries).toHaveLength(1)
    expect(result.parsed.sections.flatMap(({ entries }) => entries.flatMap(({ lines }) => lines))).not.toContain(2)
    expect(result.parsed.sections.flatMap(({ entries }) => entries.flatMap(({ lines }) => lines))).toContain(4)
    const report = runChecks(source, { rules: RULES.filter(({ id }) => id === "R4"), pdf: { ...reading(lines), ...result } })
    expect(report.findings.some(({ text }) => text.includes("personal interests"))).toBe(false)
  })

  test("keeps the editor's line for an added list's bullet that wraps in the PDF", () => {
    const source: Resume = {
      extraSections: { [first]: { kind: "list", heading: "Interests", bullets: "○ Secret\n• Reading classic fiction" } },
    }
    const lines = [line("Interests"), line("Reading classic"), line("fiction")]
    const result = readForChecks(lines, pdfLayoutOf(viewOf(source)))
    const bullets = printedLayoutBullets(viewOf(source), { ...reading(lines), ...result })
    expect(bullets[0].place).toEqual({ kind: "extra-text", sectionId: first, field: "bullets", line: 1 })
    expect(bullets[0].printed.lines.map(({ text }) => text)).toEqual(["Reading classic", "fiction"])
  })
})
