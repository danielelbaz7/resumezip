import { expect, test, type Page } from "./test"
import { pageErrors, saveResumes } from "./helpers"

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
  await card.getByRole("button", { name: "Use this one" }).first().click()
  await card.getByLabel("Status of Backend Engineer").selectOption("applied")
  await expect(card.getByText("Sent: Rust resume · 43")).toBeVisible()

  // A second job reuses the profiles: neither resume has changed.
  await page.getByLabel("Job posting").fill(ANOTHER)
  await page.getByRole("button", { name: "Find the best resume" }).click()
  await expect(page.getByRole("heading", { name: "Jobs · 2" })).toBeVisible()
  expect(kinds).toEqual(["profiles", "match", "match"])

  // Kept over a reload, on the same tab.
  await page.reload()
  await expect(page.getByRole("tab", { name: "Jobs" })).toHaveAttribute("aria-selected", "true")
  const kept = page.getByRole("listitem").filter({ hasText: "Sent: Rust resume" })
  await expect(kept.getByLabel("Status of Backend Engineer")).toHaveValue("applied")
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

test("a job is deleted from its row, without opening it, once Delete is pressed a second time", async ({ page }) => {
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

  // Asking first, the focus on Keep, which keeps it.
  await page.getByRole("button", { name: "Delete Backend Engineer" }).click()
  await expect(page.getByRole("button", { name: "Keep" })).toBeFocused()
  await page.getByRole("button", { name: "Keep" }).click()
  await expect(page.getByRole("heading", { name: "Jobs · 2" })).toBeVisible()

  await page.getByRole("button", { name: "Delete Backend Engineer" }).click()
  await page.getByRole("button", { name: "Delete", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Jobs · 1" })).toBeVisible()
  await expect(page.getByText("Backend Engineer", { exact: true })).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole("heading", { name: "Jobs · 1" })).toBeVisible()
  await expect(page.getByText("Compiler Engineer", { exact: true })).toBeVisible()
})
