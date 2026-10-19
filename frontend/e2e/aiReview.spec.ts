import { expect, test } from "./test"
import { textPdf } from "../src/lib/import/testFiles"
import { pageErrors, seriousAccessibilityProblems } from "./helpers"

// The AI's notes, with /api/review answered here: tests never ask a real AI.

const RESUME = [
  "Mara Lin",
  "mara@example.com | (555) 010-2020 | Seattle, WA",
  "EXPERIENCE",
  "Software Engineer, Acme Corp",
  "Jan 2024 - Present",
  "- Responsible for testing the checkout service",
  "- Built a deploy tool that cut release time from two hours to ten minutes for 40 engineers",
  "EDUCATION",
  "State University",
  "B.S. in Computer Science, 2019 - 2023",
]
const pdf = { name: "Mara Lin.pdf", mimeType: "application/pdf", buffer: textPdf([RESUME]) }

// The line ids are left wrong on purpose: the page places a note by its quote.
const NOTES = [
  {
    tone: "red",
    line: "u99",
    quote: "Responsible for testing",
    title: "Says what you did, not what changed",
    why: "A recruiter can't tell what your testing caught.",
    suggestion: "Tested the checkout service, catching [number] bugs before release",
  },
  {
    tone: "green",
    line: "u98",
    quote: "cut release time from two hours to ten minutes",
    title: "A result anyone can picture",
    why: "Before and after, with who it helped.",
    suggestion: null,
  },
  {
    tone: "red",
    line: "u97",
    quote: "nowhere on this resume",
    title: "Add a summary",
    why: "It says who you are at a glance.",
    suggestion: null,
  },
]

async function reviewed(page: import("@playwright/test").Page) {
  await page.goto("/review")
  await page.locator('input[type="file"]').setInputFiles(pdf)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Your resume is/, { timeout: 90_000 })
  await expect(page.getByRole("img", { name: "Page 1 of your resume, with the notes marked" })).toBeVisible()
}

test("AI notes are asked for with a button, sent as the printed lines, and drawn in red and green with their lists", async ({ page }) => {
  const errors = pageErrors(page)
  let sent: unknown = null
  await page.route("**/api/review", async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({ json: { notes: NOTES } })
  })
  await reviewed(page)
  // Nothing goes to the AI until the person asks.
  expect(sent).toBeNull()
  await expect(page.getByText("This sends your resume’s text to GPT-5.4 mini")).toBeVisible()

  await page.getByRole("button", { name: "Get AI notes" }).click()
  await expect(page.getByRole("heading", { name: "Red flags 2" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Green flags 1" })).toBeVisible()
  // The lines, numbered, and nothing else: not the file, not its name.
  const lines = (sent as { lines: { id: string; text: string; bullet: boolean }[] }).lines
  expect(Object.keys(sent as object)).toEqual(["lines"])
  expect(lines[0]).toEqual({ id: "u1", text: "Mara Lin", bullet: false })
  expect(lines.map(({ text }) => text)).toContain("Responsible for testing the checkout service")

  // The page is marked with the AI's notes alone, and the checks are a switch away.
  await expect(page.getByRole("button", { name: "AI notes", pressed: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "“Responsible for” is a weak start" })).toHaveCount(0)
  await page.getByRole("button", { name: "Checks" }).click()
  await expect(page.getByRole("button", { name: "“Responsible for” is a weak start" })).toBeAttached()
  await expect(page.getByRole("button", { name: "Red flag: Says what you did, not what changed" })).toHaveCount(0)
  await page.getByRole("button", { name: "AI notes" }).click()

  // Each flag is drawn on its line, and pointing at it in the list shows its note there.
  const red = page.getByRole("button", { name: "Red flag: Says what you did, not what changed" })
  await expect(red).toBeAttached()
  await expect(page.getByRole("button", { name: "Green flag: A result anyone can picture" })).toBeAttached()
  await page.locator(".review-flag", { hasText: "Says what you did, not what changed" }).hover()
  const tip = page.getByRole("tooltip")
  await expect(tip).toContainText("Red flag")
  await expect(tip).toContainText("Tested the checkout service, catching [number] bugs before release")
  await page.keyboard.press("Escape")
  await expect(tip).toBeHidden()
  // Picking one brings its mark into focus, which shows its note.
  await page.locator(".review-flag", { hasText: "A result anyone can picture" }).click()
  await expect(page.getByRole("button", { name: "Green flag: A result anyone can picture" })).toBeFocused()
  await expect(tip).toContainText("Before and after, with who it helped.")
  // A note whose words aren't on the resume is listed under the page instead.
  await expect(page.getByRole("listitem").filter({ hasText: "Red flag: Add a summary" })).toBeVisible()

  expect(await seriousAccessibilityProblems(page)).toEqual([])
  expect(errors).toEqual([])
})

test("when the AI can't answer, the page says why and it can be asked again", async ({ page }) => {
  const errors = pageErrors(page)
  let calls = 0
  await page.route("**/api/review", async (route) => {
    calls++
    if (calls === 1) await route.fulfill({ status: 429, json: { error: "limit" } })
    else await route.fulfill({ json: { notes: NOTES.slice(0, 1) } })
  })
  await reviewed(page)
  await page.getByRole("button", { name: "Get AI notes" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "You’ve asked for a lot of AI notes in a short time" })).toBeVisible()
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByRole("heading", { name: "Red flags 1" })).toBeVisible()
  await expect(page.getByText("None stood out.")).toBeVisible()
  // The browser logs the refused request itself; nothing else went wrong.
  expect(errors.filter((error) => !error.includes("status of 429"))).toEqual([])
})

test("AI notes are kept in the browser: the same resume shows them again without asking, and the editor lists them", async ({ page }) => {
  const errors = pageErrors(page)
  let calls = 0
  await page.route("**/api/review", async (route) => {
    calls++
    await route.fulfill({ json: { notes: NOTES } })
  })
  await reviewed(page)
  await page.getByRole("button", { name: "Get AI notes" }).click()
  await expect(page.getByRole("heading", { name: "Red flags 2" })).toBeVisible()

  // Reviewed again, as a file with another name: the same notes, with no call.
  await page.reload()
  await page.locator('input[type="file"]').setInputFiles({ ...pdf, name: "Mara Lin (2).pdf" })
  await expect(page.getByRole("heading", { name: "Red flags 2" })).toBeVisible({ timeout: 90_000 })
  expect(calls).toBe(1)

  // In the editor, the Check tab opens on them and lists them, and they're marked on the preview.
  await page.getByRole("button", { name: "Fix it in the editor" }).click()
  await expect(page).toHaveURL(/\/create\/new\//)
  await expect(page.getByRole("button", { name: "AI notes", pressed: true })).toBeVisible()
  const notes = page.getByRole("region", { name: "AI notes" })
  await expect(notes.getByRole("region", { name: "Red flags, 2" })).toBeVisible()
  await expect(notes.getByRole("region", { name: "Green flags, 1" })).toBeVisible()
  const mark = page.getByRole("button", { name: "Red flag: Says what you did, not what changed" })
  await expect(mark).toBeAttached({ timeout: 60_000 })
  // Pointing at its row shows its note on the preview.
  const row = notes.getByRole("button", { name: /Says what you did, not what changed/ })
  await row.hover()
  await expect(page.getByRole("tooltip")).toContainText("Tested the checkout service, catching [number] bugs before release")
  // Choosing it opens the words it's about, which say the note to a screen reader, not under the field.
  await row.click()
  await expect(page.locator(":focus")).toHaveAccessibleDescription(/Red flag: Says what you did, not what changed/)
  // The note whose words aren't on the resume can't be opened.
  await expect(notes.getByText("Changed since the notes")).toBeVisible()
  // The checks' marks are a switch away, and never drawn with the AI's.
  await page.getByRole("button", { name: "ATS checks" }).click()
  await expect(page.getByRole("button", { name: "“Responsible for” is a weak start", exact: true })).toBeAttached()
  await expect(mark).toHaveCount(0)
  expect(calls).toBe(1)
  expect(errors).toEqual([])
})
