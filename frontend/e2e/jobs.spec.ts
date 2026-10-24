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
    // Matched newest first: the Rust resume, edited last, is r1.
    return route.fulfill({
      json: {
        match: {
          job: {
            title: "Backend Engineer",
            company: "Acme",
            location: "Remote",
            level: "mid",
            requirements: [{ name: "Rust", must: true }],
          },
          resumes: { r1: { places: ["skills"], reason: "Rust is on it." }, r2: { places: ["nowhere"], reason: "No Rust." } },
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

  await page.getByLabel("Job posting").fill("Backend Engineer at Acme. Must know Rust.")
  await page.getByLabel("Link · optional").fill("jobs.acme.com/backend")
  await page.getByRole("button", { name: "Find the best resume" }).click()

  const card = page.getByRole("listitem").filter({ hasText: "Backend Engineer" })
  await expect(card.getByText("Best fit: Rust resume · 50")).toBeVisible()
  // Open, the resumes are listed best first, with where the job's requirements show up.
  await expect(card.getByText("1 in skills")).toBeVisible()
  await expect(card.getByRole("link", { name: "Open the posting" })).toHaveAttribute("href", "https://jobs.acme.com/backend")
  await card.getByRole("button", { name: "Use this one" }).first().click()
  await card.getByLabel("Status of Backend Engineer").selectOption("applied")
  await expect(card.getByText("Sent: Rust resume · 50")).toBeVisible()

  // A second job reuses the profiles: neither resume has changed.
  await page.getByLabel("Job posting").fill("Another Rust job.")
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
  await page.getByLabel("Job posting").fill("Rust engineer")
  await page.getByRole("button", { name: "Find the best resume" }).click()
  await expect(page.getByRole("alert")).toHaveText("Matching jobs needs the AI, and it isn’t switched on here.")
  await expect(page.getByLabel("Job posting")).toHaveValue("Rust engineer")
})
