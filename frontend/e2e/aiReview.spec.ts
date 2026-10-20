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

test("AI notes are asked for once the resume is read, sent as the printed lines, and drawn in red and blue, with a tile for each", async ({
  page,
}) => {
  const errors = pageErrors(page)
  let sent: unknown = null
  await page.route("**/api/review", async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({ json: { notes: NOTES } })
  })
  await page.goto("/review")
  // The page says, before a file is chosen, that the resume goes to an AI.
  await expect(page.getByText("Resume is sent to AI for review. Nothing is kept.")).toBeVisible()
  await reviewed(page)
  // A tile for each kind, the red flags pressed and listed.
  await expect(page.getByRole("button", { name: "Red flags, 2", pressed: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Done well, 1", pressed: false })).toBeVisible()
  // The lines, numbered, and nothing else: not the file, not its name.
  const lines = (sent as { lines: { id: string; text: string; bullet: boolean }[] }).lines
  expect(Object.keys(sent as object)).toEqual(["lines"])
  expect(lines[0]).toEqual({ id: "u1", text: "Mara Lin", bullet: false })
  expect(lines.map(({ text }) => text)).toContain("Responsible for testing the checkout service")

  // The page is marked with the AI's notes alone, and the checks are a switch away.
  await expect(page.getByRole("button", { name: "AI notes", pressed: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "“Responsible for” is a weak start" })).toHaveCount(0)
  await page.getByRole("button", { name: "ATS checks" }).click()
  await expect(page.getByRole("button", { name: "“Responsible for” is a weak start" })).toBeAttached()
  await expect(page.getByRole("button", { name: "Red flag: Says what you did, not what changed" })).toHaveCount(0)
  await page.getByRole("button", { name: "AI notes" }).click()

  // Each flag is drawn on its line, and pointing at it in the list shows its note there.
  const red = page.getByRole("button", { name: "Red flag: Says what you did, not what changed" })
  await expect(red).toBeAttached()
  await expect(page.getByRole("button", { name: "Done well: A result anyone can picture" })).toBeAttached()
  // The list's rows are named by their titles alone; the marks say which flag they are first.
  await page.getByRole("button", { name: "Says what you did, not what changed", exact: true }).hover()
  const tip = page.getByRole("tooltip")
  await expect(tip).toContainText("Red flag")
  await expect(tip).toContainText("Tested the checkout service, catching [number] bugs before release")
  await page.keyboard.press("Escape")
  await expect(tip).toBeHidden()
  // The other tile lists what's done well instead, and picking one brings its mark into focus, which shows its note.
  await page.getByRole("button", { name: "Done well, 1" }).click()
  await expect(page.getByRole("button", { name: "Done well, 1", pressed: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Says what you did, not what changed", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "A result anyone can picture", exact: true }).click()
  await expect(page.getByRole("button", { name: "Done well: A result anyone can picture" })).toBeFocused()
  await expect(tip).toContainText("Before and after, with who it helped.")
  // A note whose words aren't on the resume is listed under the page instead.
  await expect(page.getByRole("listitem").filter({ hasText: "Red flag: Add a summary" })).toBeVisible()

  expect(await seriousAccessibilityProblems(page)).toEqual([])
  expect(errors).toEqual([])
})

test("when the AI turns a review away, the page shows the checks and says why, and it can be asked again", async ({ page }) => {
  const errors = pageErrors(page)
  let calls = 0
  await page.route("**/api/review", async (route) => {
    calls++
    // The firewall's answer: no { error } body.
    if (calls === 1) await route.fulfill({ status: 429, contentType: "text/plain", body: "Too Many Requests" })
    else await route.fulfill({ json: { notes: NOTES.slice(0, 1) } })
  })
  await reviewed(page)
  await expect(page.getByRole("status").filter({ hasText: "AI notes are paused for a few minutes" })).toBeVisible()
  await expect(page.getByRole("button", { name: "ATS checks", pressed: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "“Responsible for” is a weak start" })).toBeAttached()
  await expect(page.getByText("Give it a few minutes.")).toBeVisible()
  await page.getByRole("button", { name: "OK" }).click()
  await expect(page.getByText("AI notes are paused for a few minutes")).toHaveCount(0)

  // Back on the drop zone in this tab, the pause is said before a file is chosen, and another resume doesn't ask.
  await page.reload()
  await expect(page.getByRole("status").filter({ hasText: "AI notes are paused for a few minutes" })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({ ...pdf, buffer: textPdf([[...RESUME, "Volunteer tutor, 2022"]]) })
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Your resume is/, { timeout: 90_000 })
  await expect(page.getByText("Give it a few minutes.")).toBeVisible()
  expect(calls).toBe(1)

  // Asked again, it answers, and the pause is over.
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByRole("button", { name: "Red flags, 1" })).toBeVisible()
  await page.getByRole("button", { name: "Done well, 0" }).click()
  await expect(page.getByText("None stood out.")).toBeVisible()
  await expect(page.getByRole("button", { name: "AI notes", pressed: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole("button", { name: "Review my resume" })).toBeVisible()
  await expect(page.getByText("AI notes are paused for a few minutes")).toHaveCount(0)
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
  await expect(page.getByRole("button", { name: "Red flags, 2" })).toBeVisible()

  // Reviewed again, as a file with another name: the same notes, with no call.
  await page.reload()
  await page.locator('input[type="file"]').setInputFiles({ ...pdf, name: "Mara Lin (2).pdf" })
  await expect(page.getByRole("button", { name: "Red flags, 2" })).toBeVisible({ timeout: 90_000 })
  expect(calls).toBe(1)

  // In the editor, the Check tab opens on them and lists them, and they're marked on the preview.
  await page.getByRole("button", { name: "Fix it in the editor" }).click()
  await expect(page).toHaveURL(/\/create\/new\//)
  await expect(page.getByRole("button", { name: "AI notes", pressed: true })).toBeVisible()
  const notes = page.getByRole("region", { name: "AI notes" })
  await expect(notes.getByRole("region", { name: "Red flags, 2" })).toBeVisible()
  await expect(notes.getByRole("region", { name: "Done well, 1" })).toBeVisible()
  const mark = page.getByRole("button", { name: "Red flag: Says what you did, not what changed" })
  await expect(mark).toBeAttached({ timeout: 60_000 })
  // Pointing at its row shows its note on the preview.
  const row = notes.getByRole("button", { name: /Says what you did, not what changed/ })
  await row.hover()
  await expect(page.getByRole("tooltip")).toContainText("Tested the checkout service, catching [number] bugs before release")
  // Choosing it opens the words it's about, which say the note to a screen reader, not under the field.
  await row.click()
  const bullets = page.getByLabel(/^What you did/)
  await expect(bullets).toBeFocused()
  await expect(bullets).toHaveAccessibleDescription(/Red flag: Says what you did, not what changed/)
  // The note that was never on a line is about the whole resume, and has nothing to open.
  await expect(notes.getByText("On your resume")).toBeVisible()
  await expect(notes.getByText("Changed since the notes")).toHaveCount(0)
  // Once its words are rewritten, a note says so, and its mark goes from the preview.
  await bullets.fill(
    "• Responsible for the checkout service, catching 12 bugs before release\n• Built a deploy tool that cut release time from two hours to ten minutes for 40 engineers",
  )
  await expect(notes.getByText("Changed since the notes")).toBeVisible({ timeout: 60_000 })
  await expect(mark).toHaveCount(0, { timeout: 60_000 })
  await expect(page.getByRole("button", { name: "Done well: A result anyone can picture" })).toBeAttached()
  // The checks' marks are a switch away, and never drawn with the AI's.
  await page.getByRole("button", { name: "ATS checks" }).click()
  await expect(page.getByRole("button", { name: "“Responsible for” is a weak start", exact: true })).toBeAttached()
  await expect(mark).toHaveCount(0)
  expect(calls).toBe(1)
  expect(errors).toEqual([])
})

test("a review that found nothing can be asked again from the editor", async ({ page }) => {
  const errors = pageErrors(page)
  let calls = 0
  await page.route("**/api/review", async (route) => {
    calls++
    await route.fulfill({ json: { notes: calls === 1 ? [] : NOTES } })
  })
  await reviewed(page)
  await expect(page.getByText("None found. Nice.")).toBeVisible()

  await page.getByRole("button", { name: "Fix it in the editor" }).click()
  await expect(page).toHaveURL(/\/create\/new\//)
  await page.getByRole("button", { name: "AI notes", pressed: false }).click()
  // Its empty review isn't taken for an answer: the AI is asked.
  const ask = page.getByRole("button", { name: "Get AI notes" })
  await expect(ask).toBeEnabled({ timeout: 60_000 })
  await ask.click()
  await expect(page.getByRole("region", { name: "AI notes" }).getByRole("region", { name: "Red flags, 2" })).toBeVisible()
  expect(calls).toBe(2)
  expect(errors).toEqual([])
})

/** Answers /api/review only once `answer()` is called; `asked` settles when the page has asked. */
async function heldAnswer(page: import("@playwright/test").Page) {
  let ask = () => {}
  const asked = new Promise<void>((resolve) => (ask = resolve))
  let answer = () => {}
  const answered = new Promise<void>((resolve) => (answer = resolve))
  await page.route("**/api/review", async (route) => {
    ask()
    await answered
    await route.fulfill({ json: { notes: NOTES } })
  })
  return { asked, answer }
}

test("the AI is asked as soon as the resume is printed, and the result waits for its notes while a recruiter's seconds count on the page", async ({
  page,
}) => {
  const errors = pageErrors(page)
  const { asked, answer } = await heldAnswer(page)
  await page.goto("/review")
  await page.locator('input[type="file"]').setInputFiles(pdf)
  await asked
  // Asked before there's a result: the page is still being read, its own page counting a recruiter's seven seconds.
  await expect(page.getByRole("heading", { level: 1, name: "Reading it like a recruiter…" })).toBeVisible()
  await expect(page.getByText(/^\d\.\d seconds$/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("status").getByText("Getting notes from AI")).toBeVisible()
  answer()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Your resume is/, { timeout: 90_000 })
  // It opens with the notes in: nothing says they're on their way.
  await expect(page.getByRole("button", { name: "Red flags, 2" })).toBeVisible()
  await expect(page.getByText("Getting notes from AI")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Red flag: Says what you did, not what changed" })).toBeAttached()
  expect(errors).toEqual([])
})

test("when the AI is long coming, the result opens without its notes, and a view chosen meanwhile stays when they arrive", async ({
  page,
}) => {
  const errors = pageErrors(page)
  await page.clock.install()
  const { asked, answer } = await heldAnswer(page)
  await page.goto("/review")
  await page.locator('input[type="file"]').setInputFiles(pdf)
  await asked
  await page.clock.fastForward(26_000)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Your resume is/, { timeout: 90_000 })
  await expect(page.getByRole("status").filter({ hasText: "Getting notes from AI" })).toBeVisible()
  await page.getByRole("button", { name: "ATS checks" }).click()
  answer()
  await expect(page.getByRole("button", { name: "Red flags, 2" })).toBeVisible()
  await expect(page.getByRole("button", { name: "ATS checks", pressed: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "“Responsible for” is a weak start" })).toBeAttached()
  expect(errors).toEqual([])
})

test("a page that never finishes drawing doesn't hold the result: after the wait it opens with the notes listed", async ({ page }) => {
  const errors = pageErrors(page)
  await page.clock.install()
  // A browser whose pictures never come back.
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.toBlob = () => {}
  })
  let ask = () => {}
  const asked = new Promise<void>((resolve) => (ask = resolve))
  await page.route("**/api/review", async (route) => {
    ask()
    await route.fulfill({ json: { notes: NOTES } })
  })
  await page.goto("/review")
  await page.locator('input[type="file"]').setInputFiles(pdf)
  await asked
  await page.clock.fastForward(26_000)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Your resume is/, { timeout: 90_000 })
  await expect(page.getByRole("listitem").filter({ hasText: "Red flag: Says what you did, not what changed" })).toBeVisible()
  expect(errors).toEqual([])
})

test("where the lines can't be hashed, the AI is still asked and its notes shown, just not kept", async ({ page }) => {
  const errors = pageErrors(page)
  // Only the lines' hash fails: Next.js hashes with it too, as it prefetches links.
  await page.addInitScript(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    crypto.subtle.digest = (algorithm: AlgorithmIdentifier, data: BufferSource) =>
      new TextDecoder().decode(data).startsWith('[["u1"') ? Promise.reject(new Error("No digest for the lines")) : digest(algorithm, data)
  })
  await page.route("**/api/review", (route) => route.fulfill({ json: { notes: NOTES } }))
  await reviewed(page)
  await expect(page.getByRole("button", { name: "Red flags, 2" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Red flag: Says what you did, not what changed" })).toBeAttached()
  expect(errors).toEqual([])
})

test("the drop zone's note that AI notes are paused goes when the pause is over", async ({ page }) => {
  await page.clock.install()
  await page.goto("/review")
  await page.evaluate(() => sessionStorage.setItem("resumezip.aiPausedUntil", String(Date.now() + 60_000)))
  await page.reload()
  const note = page.getByRole("status").filter({ hasText: "AI notes are paused for a few minutes" })
  await expect(note).toBeVisible()
  await page.clock.fastForward(61_000)
  await expect(note).toHaveCount(0)
})
