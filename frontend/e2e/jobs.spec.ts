import { expect, test, type Page } from "./test"
import { pageErrors, previewShown, saveResumes } from "./helpers"

// The dashboard's Jobs tab (components/dashboard/JobsTab.tsx), with
// /api/jobs answered here: each resume is summed up once, while its text is
// the same, and each job is matched to the profiles and kept in a list.

const resume = (id: string, title: string, skills: string, updatedAt: string) => ({
  id,
  resumeTitle: title,
  resumeTag: "professional",
  updatedAt,
  selectedTemplate: "jake",
  sectionOrder: ["Education", "Work", "Skills", "Projects"],
  headings: {},
  profileSection: { fullName: "Ada Lovelace" },
  educationSection: [],
  workExperienceSection: [],
  projectsSection: [],
  skillsSection: [{ id: 1, skillName: "Languages", skillDetails: skills }],
})

const profile = (skills: string[]) => ({
  targets: ["Engineer"],
  level: "mid",
  summary: "",
  experience: [],
  projects: [],
  skills,
  coursework: [],
})

// Postings long enough to be ones, each with the words the answer below quotes.
const POSTING = `Backend Engineer at Acme, Remote. We run the payments platform for thousands of small shops.
You must have production experience with Rust and SQL databases, and you'll own services end to end.`
const ANOTHER = `Platform Engineer at Acme. Our ledger team is growing, and we want someone with production experience with Rust
to make settlement faster and safer across every region we serve.`

/** Answers /api/jobs as the AI would, and says what each request asked for. */
async function answerJobs(page: Page): Promise<string[]> {
  const kinds: string[] = []
  await page.route("**/api/jobs", async (route) => {
    const body = route.request().postDataJSON()
    kinds.push(body.kind)
    if (body.kind === "profiles") {
      const profiles = Object.fromEntries(
        body.resumes.map((sent: { id: string; skills: string[] }) => [
          sent.id,
          profile(sent.skills.join(" ").includes("Rust") ? ["Rust"] : ["Go"]),
        ]),
      )
      return route.fulfill({ json: { profiles } })
    }
    // Matched newest first: the Rust resume, edited last, is r1. With only a link, the route reads POSTING from it.
    return route.fulfill({
      json: {
        posting: body.posting || POSTING,
        note: "",
        match: {
          job: {
            isPosting: true,
            title: "Backend Engineer",
            company: "Acme",
            location: "Remote",
            level: "mid",
            role: "backend/product",
            domain: "payments",
            requirements: [{ name: "Rust", tier: 1, keyword: "Rust", quote: "production experience with Rust" }],
            advice: "Lead with the ledger project.",
            graduation: { asked: false, earliest: "", latest: "", quote: "" },
          },
          resumes: [
            {
              id: "r1",
              evidence: [{ strength: "weak", place: "skills" }],
              projects: 40,
              experience: 30,
              domain: 50,
              narrative: 60,
              reason: "Rust is on it.",
            },
            {
              id: "r2",
              evidence: [{ strength: "none", place: "nowhere" }],
              projects: 10,
              experience: 10,
              domain: 20,
              narrative: 20,
              reason: "No Rust.",
            },
          ],
        },
      },
    })
  })
  return kinds
}

test("the Jobs tab finds the resume that fits a posting best, and keeps the job with the one sent", async ({ page }) => {
  const errors = pageErrors(page)
  await saveResumes(page, [
    resume("go", "Go resume", "Go, Python", "2026-01-01T00:00:00.000Z"),
    resume("rust", "Rust resume", "Rust, C", "2026-06-01T00:00:00.000Z"),
  ])
  const kinds = await answerJobs(page)
  await page.goto("/create/dashboard")
  await page.getByRole("tab", { name: "Jobs" }).click()
  await expect(page).toHaveURL(/#jobs$/)

  await page.getByLabel("Job posting").fill(POSTING)
  await page.getByLabel("Link").fill("jobs.acme.com/backend")
  await page.getByRole("button", { name: "Find the best resume" }).click()

  const card = page.getByRole("listitem").filter({ hasText: "Backend Engineer" })
  await expect(card.getByText("Best fit: Rust resume · 43")).toBeVisible()
  // Open, the resumes are listed best first, with where the job's requirements show up.
  await expect(card.getByText("1 in skills")).toBeVisible()
  await expect(card.getByText("Core 40 · Projects 40 · Experience 30 · Domain 50 · Keywords 100 · Story 60")).toBeVisible()
  await expect(card.getByText("Lead with the ledger project.")).toBeVisible()
  await expect(card.getByText("Missing a must-have: Rust")).toBeVisible()
  await expect(card.getByRole("link", { name: "Open the posting" })).toHaveAttribute("href", "https://jobs.acme.com/backend")
  // Choosing the resume for a job only saved marks it applied.
  await card.getByRole("button", { name: "Use this one" }).first().click()
  await expect(card.getByLabel("Status of Backend Engineer")).toHaveValue("applied")
  await expect(card.getByText("Sent: Rust resume · 43")).toBeVisible()
  // Further along, choosing another leaves the status as it is.
  await card.getByLabel("Status of Backend Engineer").selectOption("interviewing")
  await card.getByRole("button", { name: "Use this one" }).first().click()
  await expect(card.getByLabel("Status of Backend Engineer")).toHaveValue("interviewing")

  // A second job reuses the profiles: neither resume has changed.
  await page.getByLabel("Job posting").fill(ANOTHER)
  await page.getByRole("button", { name: "Find the best resume" }).click()
  await expect(page.getByRole("heading", { name: "Jobs · 2" })).toBeVisible()
  expect(kinds).toEqual(["profiles", "match", "match"])

  // Kept over a reload, on the same tab.
  await page.reload()
  await expect(page.getByRole("tab", { name: "Jobs" })).toHaveAttribute("aria-selected", "true")
  const kept = page.getByRole("listitem").filter({ hasText: "Sent: Rust resume" })
  await expect(kept.getByLabel("Status of Backend Engineer")).toHaveValue("interviewing")
  expect(errors).toEqual([])
})

test("the Jobs tab says so when the AI isn't switched on, and keeps the posting", async ({ page }) => {
  await saveResumes(page, [resume("rust", "Rust resume", "Rust", "2026-06-01T00:00:00.000Z")])
  await page.goto("/create/dashboard#jobs")
  await page.getByLabel("Job posting").fill(POSTING)
  await page.getByRole("button", { name: "Find the best resume" }).click()
  await expect(page.getByRole("alert")).toHaveText("Matching jobs needs the AI, and it isn’t switched on here.")
  await expect(page.getByLabel("Job posting")).toHaveValue(POSTING)
})

test("the Jobs tab turns away a word as too short to be a posting, without asking the AI or saving a job", async ({ page }) => {
  await saveResumes(page, [resume("rust", "Rust resume", "Rust", "2026-06-01T00:00:00.000Z")])
  const kinds = await answerJobs(page)
  await page.goto("/create/dashboard#jobs")
  await page.getByLabel("Job posting").fill("RTX")
  await page.getByRole("button", { name: "Find the best resume" }).click()
  await expect(page.getByRole("alert")).toHaveText("That’s too short to be a job posting. Paste the job’s whole description.")
  await expect(page.getByRole("heading", { name: "No jobs yet" })).toBeVisible()
  expect(kinds).toEqual([])
})

test("the Jobs tab matches a posting from its link alone", async ({ page }) => {
  await saveResumes(page, [resume("rust", "Rust resume", "Rust", "2026-06-01T00:00:00.000Z")])
  const sent: { link?: string; posting?: string }[] = []
  page.on("request", (request) => {
    if (request.url().endsWith("/api/jobs") && request.postDataJSON()?.kind === "match") sent.push(request.postDataJSON())
  })
  await answerJobs(page)
  await page.goto("/create/dashboard#jobs")
  await page.getByLabel("Link").fill("jobs.acme.com/backend")
  await page.getByRole("button", { name: "Find the best resume" }).click()
  await expect(page.getByRole("listitem").filter({ hasText: "Backend Engineer" }).first()).toBeVisible()
  expect(sent).toEqual([expect.objectContaining({ posting: "", link: "https://jobs.acme.com/backend" })])
})

test("a job is deleted from its row in one click, without opening it", async ({ page }) => {
  const job = (id: string, title: string) => ({
    id,
    savedAt: id === "first" ? "2026-06-01T00:00:00.000Z" : "2026-06-02T00:00:00.000Z",
    link: "",
    posting: POSTING,
    title,
    company: "Acme",
    location: "",
    level: "",
    role: "backend/product",
    domain: "",
    requirements: [],
    advice: "",
    graduation: null,
    matches: [],
    chosenResumeId: null,
    status: "saved",
    appliedAt: null,
  })
  await page.addInitScript(
    (jobs) => {
      if (!sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("seeded", "yes")
        localStorage.setItem("resumezip.jobs", JSON.stringify({ version: 1, jobs }))
      }
    },
    [job("first", "Backend Engineer"), job("second", "Compiler Engineer")],
  )
  await page.goto("/create/dashboard#jobs")
  await expect(page.getByRole("heading", { name: "Jobs · 2" })).toBeVisible()

  await page.getByRole("button", { name: "Delete Backend Engineer" }).click()
  await expect(page.getByRole("heading", { name: "Jobs · 1" })).toBeVisible()
  await expect(page.getByText("Backend Engineer", { exact: true })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole("heading", { name: "Jobs · 1" })).toBeVisible()
  await expect(page.getByText("Compiler Engineer", { exact: true })).toBeVisible()
})

test("Auto-tailor makes a copy of the resume with the skills it shows, and says what's missing", async ({ page }) => {
  const errors = pageErrors(page)
  await saveResumes(page, [
    {
      ...resume("rust", "Rust resume", "Go", "2026-06-01T00:00:00.000Z"),
      workExperienceSection: [{ id: 1, workRole: "Engineer", companyName: "Stripe", workDescription: "• Built a Rust ledger" }],
    },
  ])
  await answerJobs(page)
  // Tailoring is answered here too, after answerJobs, so it's asked first.
  await page.route("**/api/jobs", async (route) => {
    const body = route.request().postDataJSON()
    // The copy is scored against the job's requirements once it's made.
    if (body.kind === "score") {
      const scored = {
        id: "r1",
        evidence: [{ strength: "good", place: "experience" }],
        projects: 60,
        experience: 70,
        domain: 50,
        narrative: 70,
      }
      return route.fulfill({ json: { resumes: [{ ...scored, reason: "Rust is shown in your work now." }] } })
    }
    if (body.kind !== "tailor") return route.fallback()
    return route.fulfill({
      json: {
        tailoring: {
          add: [{ skill: "Rust", group: "s1", newGroup: "", entry: "x1", quote: "Built a Rust ledger" }],
          gaps: [
            {
              requirement: "SQL databases",
              quote: "production experience with Rust and SQL databases",
              why: "The payments platform runs on them.",
              suggestion: "Build a small project on PostgreSQL.",
              group: "new",
              newGroup: "Databases",
            },
          ],
        },
      },
    })
  })
  await page.goto("/create/dashboard#jobs")
  await page.getByLabel("Job posting").fill(POSTING)
  await page.getByRole("button", { name: "Find the best resume" }).click()
  const card = page.getByRole("listitem").filter({ hasText: "Backend Engineer" }).first()
  await card.getByRole("button", { name: "Auto-tailor" }).click()

  await expect(card.getByText("Tailored copy:")).toBeVisible()
  // The copy has its own row and score, under the resume it was tailored from, and can be the one sent.
  const tailored = card.getByRole("listitem").filter({ hasText: "Tailored for this job" }).first()
  await expect(tailored.getByText("Rust is shown in your work now.")).toBeVisible()
  await tailored.getByRole("button", { name: "Use this one" }).click()
  await expect(card.getByText(/^Sent: Rust resume – Acme · \d+$/)).toBeVisible()
  await expect(card.getByLabel("Status of Backend Engineer")).toHaveValue("applied")
  await expect(card.getByText("Rust", { exact: true })).toBeVisible()
  await expect(card.getByText("SQL databases", { exact: true })).toBeVisible()
  await card.getByRole("button", { name: "I have this, add it" }).click()
  await expect(card.getByRole("button", { name: "Added to the copy’s Skills" })).toBeDisabled()
  // The copy changed, so its score can be had again.
  await expect(tailored.getByRole("button", { name: "Changed since: score again" })).toBeVisible()

  // The copy has Rust beside Go, and SQL databases in a group of its own; the original is as it was. Saves wait a moment.
  const skillsOf = () =>
    page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith("resume:"))
        .map((key) => JSON.parse(localStorage.getItem(key)!))
        .map((one) => ({ id: one.id, skills: one.skillsSection })),
    )
  await expect
    .poll(async () => (await skillsOf()).find((one) => one.id !== "rust")?.skills)
    .toEqual([
      { id: 1, skillName: "Languages", skillDetails: "Go, Rust" },
      { id: 2, skillName: "Databases", skillDetails: "SQL databases" },
    ])
  expect((await skillsOf()).find((one) => one.id === "rust")?.skills).toEqual([{ id: 1, skillName: "Languages", skillDetails: "Go" }])
  expect(errors).toEqual([])
})

test("a tailored resume says in the editor what it was tailored from, and lists its changes while they're shown on the preview", async ({
  page,
}) => {
  const errors = pageErrors(page)
  const original = {
    ...resume("rust", "Rust resume", "Go", "2026-06-01T00:00:00.000Z"),
    workExperienceSection: [{ id: 1, workRole: "Engineer", companyName: "Stripe", workDescription: "• Built a Rust ledger" }],
  }
  const tailored = {
    ...original,
    id: "tailored",
    resumeTitle: "Rust resume – Acme",
    skillsSection: [{ id: 1, skillName: "Languages", skillDetails: "Go, Rust" }],
    tailoredFrom: { resumeId: "rust", title: "Rust resume", jobId: "j", at: "2026-07-01T00:00:00.000Z" },
  }
  await saveResumes(page, [original, tailored])
  await page.goto("/create/new/tailored")
  await previewShown(page)
  await expect(page.getByText("From Rust resume")).toBeVisible()
  const changes = page.getByRole("button", { name: /^Changes from original/ })
  await expect(changes).toHaveText(/1$/)
  await changes.click()
  await expect(changes).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("Skills · Languages")).toBeVisible()
  await expect(page.getByRole("status").filter({ hasText: "Showing the changes in blue" })).toBeVisible()

  // The original says nothing of it.
  await page.goto("/create/new/rust")
  await previewShown(page)
  await expect(page.getByRole("button", { name: /^Changes from original/ })).toHaveCount(0)
  expect(errors).toEqual([])
})
