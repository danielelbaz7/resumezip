// Renders each template's sample resume to PDF with the real Typst templates,
// reads the PDF back the way "Open a file" does for PDFs from elsewhere (no
// resumezip attachment), and checks it prints the same resume.

import { describe, expect, test } from "vitest"
import { cleanResume } from "@/lib/resumeFile"
import { toTemplateData } from "@/lib/typst/resumeData"
import { differences, readBack, render, samples } from "./testRender"

/**
 * Fields each template's sample doesn't read back yet, as paths into the
 * printed data. Fix one in parse.ts, then delete it here; anything that
 * starts differing and isn't listed fails the test.
 */
const KNOWN_GAPS: Record<string, string[]> = {
  // Roles and degrees are printed in capitals, so their original case can't be read back.
  accent: [
    "education[0].degree",
    "education[1].degree",
    "leadership[0].role",
    "volunteer[0].role",
    "work[0].role",
    "work[1].role",
    "work[2].role",
  ],
  // Names of schools, employers, groups and projects, and skill categories,
  // are printed in capitals, so their original case can't be read back.
  deedy: [
    "education[0].school",
    "leadership[0].organization",
    "projects[0].name",
    "projects[1].name",
    "skills[0].name",
    "skills[1].name",
    "skills[2].name",
    "work[1].company",
    "work[2].company",
  ],
  ian: [],
  // A comma inside an award's name reads as the start of the organization.
  jake: ["awards[0].name", "awards[0].organization"],
  levelsfyi: [],
  margin: [],
  modernjack: [],
  mono: [],
  // "Organization, City, ST" on one line all reads as the location, and a
  // comma or dash inside an award's name reads as the start of the organization.
  referme: [
    "education[0].school",
    "education[0].location",
    "work[0].company",
    "work[0].location",
    "work[2].company",
    "work[2].location",
    "volunteer[0].organization",
    "volunteer[0].location",
    "awards[0].name",
    "awards[0].organization",
    "awards[1].name",
    "awards[1].organization",
  ],
  // Names of schools, employers, groups and projects are printed in capitals,
  // so their original case can't be read back.
  resumeworded: [
    "education[0].school",
    "education[1].school",
    "leadership[0].organization",
    "projects[0].name",
    "projects[1].name",
    "work[0].company",
    "work[1].company",
    "work[2].company",
  ],
  swiss: [],
  zero2sudo: [],
}

// What a resume prints, minus differences that print the same or are
// deliberate: the parser writes GPAs without spaces ("3.9/4.0").
function printed(resume: Record<string, unknown>) {
  const data = toTemplateData(resume)
  for (const school of data.education) school.gpa = school.gpa.replace(/\s+/g, "")
  return data
}

describe.each(samples.map((sample) => [sample.selectedTemplate as string, sample]))("the %s sample", (template, sample) => {
  test("reads back as it was printed", async () => {
    const { parsed, resume } = await readBack(await render(sample))
    const want = printed(cleanResume(sample))
    const got = printed(resume)

    expect(parsed.unplaced).toEqual([])
    // Sections are found in the order they're printed; empty ones aren't printed.
    expect(got.order.filter((name) => parsed.sections.some((section) => section.name === name))).toEqual(
      want.order.filter((name) => parsed.sections.some((section) => section.name === name)),
    )
    expect(differences({ ...want, order: [] }, { ...got, order: [] }).sort()).toEqual([...(KNOWN_GAPS[template] ?? [])].sort())
  })
})

test("every template's sample is checked", () => {
  expect(samples.map((sample) => sample.selectedTemplate).sort()).toEqual(Object.keys(KNOWN_GAPS).sort())
})

test("a school with its place on the right starts a new entry, even right after another school", async () => {
  // In the Harvard layout a school's dates are on its second line, and a
  // school with no details is followed straight away by the next one.
  const sample = samples.find((resume) => resume.selectedTemplate === "resumeworded")
  const [first, second] = sample.educationSection
  const resume = { ...sample, educationSection: [{ ...first, gpa: "", coursework: "", involvement: "" }, second] }
  const { resume: got } = await readBack(await render(resume))
  expect(got.educationSection?.map((school) => school.schoolLocation)).toEqual([first.schoolLocation, second.schoolLocation])
  expect(got.educationSection?.map((school) => school.schoolName?.toLowerCase())).toEqual([
    first.schoolName.toLowerCase(),
    second.schoolName.toLowerCase(),
  ])
})

// Mono sets a school's name in bold, as it does its headings, which are in
// capitals; Blueprint (levelsfyi) sets "**Degree,** School" and the dates on one line.
test.each(["mono", "levelsfyi"])("in %s, a school with no dates and no word for one in its name is read whole", async (template) => {
  const sample = samples.find((resume) => resume.selectedTemplate === template)
  const ucla = { id: 9, schoolName: "UCLA", degree: "B.A. in Economics" }
  for (const educationSection of [
    [ucla, ...sample.educationSection],
    [...sample.educationSection, ucla],
  ]) {
    const { parsed, resume: got } = await readBack(await render({ ...sample, educationSection }))
    expect(parsed.unplaced).toEqual([])
    const read = got.educationSection?.map(({ schoolName, degree, schoolEndDate }) => ({ schoolName, degree, schoolEndDate }))
    expect(read).toEqual(educationSection.map(({ schoolName, degree, schoolEndDate = "" }) => ({ schoolName, degree, schoolEndDate })))
  }
})

test.each(["levelsfyi", "referme"])(
  "in %s, an entry with no date stays apart from one whose date ends in a typed comma",
  async (template) => {
    // A title line ending in a comma may have wrapped, but not when the comma is after a date set apart on the right.
    const sample = samples.find((resume) => resume.selectedTemplate === template)
    const comma = { id: 1, companyName: "NVIDIA", workRole: "Intern", workStartDate: "May 2025", workEndDate: "Aug 2025," }
    const undated = { id: 2, companyName: "Microsoft", workRole: "Intern", workDescription: "• Built a reviewer suggester" }
    const { resume: got } = await readBack(await render({ ...sample, sectionOrder: ["Work"], workExperienceSection: [comma, undated] }))
    expect(got.workExperienceSection?.map((job) => job.companyName)).toEqual(["NVIDIA", "Microsoft"])
  },
)

test("bold and italic words in bullets come back marked, in every template", async () => {
  const bullet = "Led **Project Atlas** to a *record* quarter with ***zero*** outages, plus a plain ending"
  for (const sample of samples) {
    const [first, ...rest] = sample.workExperienceSection
    const resume = { ...sample, workExperienceSection: [{ ...first, workDescription: `• ${bullet}` }, ...rest] }
    const { resume: got } = await readBack(await render(resume))
    expect(got.workExperienceSection?.[0].workDescription, sample.selectedTemplate).toBe(`• ${bullet}`)
  }
})

test("bold and italic words in the summary come back marked, in every template", async () => {
  // Long enough to wrap, so its lines are joined back up with their styles.
  const summary =
    "Builds **fast**, reliable tools in *Rust* for teams that ship every day, with ***care for the people*** who use them and the engineers who keep them running."
  for (const sample of samples) {
    const { resume: got } = await readBack(await render({ ...sample, profileSection: { ...sample.profileSection, summary } }))
    expect(got.profileSection?.summary, sample.selectedTemplate).toBe(summary)
  }
})

test("a phone number with a plus written apart keeps the plus", async () => {
  const sample = samples.find((resume) => resume.selectedTemplate === "ian")
  const resume = { ...sample, profileSection: { ...sample.profileSection, phoneNumber: "+ (352) 284-0205" } }
  const { parsed, resume: got } = await readBack(await render(resume))
  expect(got.profileSection?.phoneNumber).toBe("+ (352) 284-0205")
  expect(parsed.unplaced).toEqual([])
})

test("a DOI or link holding a year keeps it, and the citation's own date is found", async () => {
  const sample = samples.find((resume) => resume.selectedTemplate === "levelsfyi")
  const resume = {
    ...sample,
    publicationsSection: [
      { ...sample.publicationsSection[0], publicationLink: "10.1109/CVPR.2016.90", publicationDate: "June 2016" },
      { ...sample.publicationsSection[1], publicationLink: "arxiv.org/abs/2023.01234", publicationDate: "Mar. 2024" },
    ],
  }
  const got = printed((await readBack(await render(resume))).resume).publications
  expect(got.map(({ doi, link, date }) => ({ doi, link, date }))).toEqual([
    { doi: "10.1109/CVPR.2016.90", link: "", date: "June 2016" },
    { doi: "", link: "arxiv.org/abs/2023.01234", date: "Mar. 2024" },
  ])
})
