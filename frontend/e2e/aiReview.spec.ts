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
    await route.fulfill({ json: { notes: NOTES, model: "GPT-5 mini" } })
  })
  await reviewed(page)
  // Nothing goes to the AI until the person asks.
  expect(sent).toBeNull()
  await expect(page.getByText("This sends your resume’s text to GPT-5 mini")).toBeVisible()

  await page.getByRole("button", { name: "Get AI notes" }).click()
  await expect(page.getByRole("heading", { name: "Red flags 2" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Green flags 1" })).toBeVisible()
  // The lines, numbered, and nothing else: not the file, not its name.
  const lines = (sent as { lines: { id: string; text: string; bullet: boolean }[] }).lines
  expect(Object.keys(sent as object)).toEqual(["lines"])
  expect(lines[0]).toEqual({ id: "u1", text: "Mara Lin", bullet: false })
  expect(lines.map(({ text }) => text)).toContain("Responsible for testing the checkout service")

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
    else await route.fulfill({ json: { notes: NOTES.slice(0, 1), model: "GPT-5 mini" } })
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
