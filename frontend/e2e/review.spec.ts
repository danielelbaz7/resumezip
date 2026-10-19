import { expect, test } from "./test"
import { textPdf } from "../src/lib/import/testFiles"
import { pageErrors, seriousAccessibilityProblems } from "./helpers"

// A resume from elsewhere: plain text, with a bullet that's a duty rather than a contribution.
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
const pdf = (lines: string[]) => ({ name: "Mara Lin.pdf", mimeType: "application/pdf", buffer: textPdf([lines]) })

test("reviews a resume in the browser, scribbles its notes on the page, and opens it in Check with the same score", async ({ page }) => {
  const errors = pageErrors(page)
  // Nothing is sent anywhere: the review only downloads what it needs.
  const sent: string[] = []
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.method() !== "HEAD") sent.push(`${request.method()} ${request.url()}`)
  })

  await page.goto("/review")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Your resume has 7 seconds/)
  await expect(page.getByRole("button", { name: "Review my resume" })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles(pdf(RESUME))

  // The first review downloads the PDF engine and the grammar checker.
  const verdict = page.getByRole("heading", { level: 1 })
  await expect(verdict).toHaveText(/^Your resume is (ready to send|almost there|back to drafts)$/, { timeout: 90_000 })
  await expect(page.getByRole("img", { name: "Page 1 of your resume, with the notes marked" })).toBeVisible()
  // Pointing at a scribble shows its note, and Esc puts it away.
  const scribble = page.getByRole("button", { name: "“Responsible for” is a weak start" })
  await scribble.hover()
  await expect(page.getByRole("tooltip")).toContainText("Name your own contribution")
  await expect(scribble).toHaveAccessibleDescription(/Name your own contribution/)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("tooltip")).toBeHidden()
  const reviewed = (await page.getByText(/^\d+\/100$/).innerText()).replace("/100", "")
  expect(await seriousAccessibilityProblems(page)).toEqual([])
  expect(sent).toEqual([])

  // Fix it in the editor: the resume is added, and opens in Check, scored the same.
  await page.getByRole("button", { name: "Fix it in the editor" }).click()
  await expect(page).toHaveURL(/\/create\/new\//)
  await expect(page.getByRole("tablist", { name: "Write, check or style" }).getByRole("tab", { name: /^Check/ })).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await expect(page.getByRole("region", { name: "Resume score" }).getByText(/^\d+$/)).toHaveText(reviewed)
  expect(errors).toEqual([])
})

test("when the resume can't be drawn, every note is listed under where it would be", async ({ page }) => {
  const errors = pageErrors(page)
  // A browser that can't turn the drawn page into a picture.
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      callback(null)
    }
  })
  await page.goto("/review")
  await page.locator('input[type="file"]').setInputFiles(pdf(RESUME))
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Your resume is/, { timeout: 90_000 })
  await expect(page.getByRole("listitem").filter({ hasText: "“Responsible for” is a weak start" })).toBeVisible()
  await expect(page.getByRole("img", { name: /^Page 1 of your resume/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test("a file with no resume in it says so, and another can be tried", async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto("/review")
  await page.locator('input[type="file"]').setInputFiles(pdf(["Groceries", "Eggs", "Milk", "Bread"]))
  await expect(
    page.getByRole("alert").filter({ hasText: "There’s no name and no section in this file to check. Is it a resume?" }),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Try another file" })).toBeVisible()
  expect(errors).toEqual([])
})

test("the headline is in the home page's headline face", async ({ page }) => {
  const face = async (path: string) => {
    await page.goto(path)
    return page.getByRole("heading", { level: 1 }).evaluate((heading) => getComputedStyle(heading).fontFamily.split(",")[0])
  }
  const home = await face("/")
  expect(home).toMatch(/Instrument Serif/)
  expect(await face("/review")).toBe(home)
})
