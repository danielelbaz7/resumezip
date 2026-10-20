import { expect, test, type Page } from "./test"
import { wordFile, textPdf } from "../src/lib/import/testFiles"
import { openFile, pageErrors, seriousAccessibilityProblems } from "./helpers"

const WORDS = [
  "Mara Lin",
  "SUMMARY",
  "First paragraph.",
  "PROFESSIONAL SUMMARY",
  "Second paragraph.",
  "PRESENTATIONS",
  "First talk",
  "PRESENTATIONS",
  "Second talk",
]

/** Every resume saved in this browser. */
const savedResumes = (page: Page) =>
  page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith("resume:"))
      .map(([, value]) => JSON.parse(value)),
  )

test("the review joins a file's two summaries, and keeps two groups under a heading it doesn't know as two added sections", async ({
  page,
}) => {
  const errors = pageErrors(page)
  await page.goto("/create/dashboard")
  await openFile(page.getByRole("button", { name: "Open a file" }), {
    name: "Flexible.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: wordFile(WORDS),
  })
  const review = page.getByRole("dialog", { name: "Here's what we found" })
  await expect(review).toContainText("These 2 go together in your profile's summary")
  const choices = review.getByRole("combobox")
  await expect(choices).toHaveCount(2)
  await expect(choices.nth(0)).toHaveValue("")
  await expect(choices.nth(1)).toHaveValue("")
  await choices.nth(0).selectOption("text")
  await choices.nth(1).selectOption("list")
  expect(await seriousAccessibilityProblems(page)).toEqual([])
  await review.getByRole("button", { name: "Create resume", exact: true }).click()
  await expect(review).toBeHidden()
  await expect.poll(() => savedResumes(page)).toHaveLength(1)
  const [saved] = await savedResumes(page)
  expect(saved.profileSection.summary).toBe("First paragraph.\n\nSecond paragraph.")
  const custom = Object.entries(saved.extraSections)
  expect(custom.map(([, value]) => value)).toEqual([
    { kind: "text", heading: "Presentations", text: "First talk" },
    { kind: "list", heading: "Presentations", bullets: "• Second talk" },
  ])
  expect(new Set(custom.map(([key]) => key)).size).toBe(2)
  expect(errors).toEqual([])
})

test("a group that couldn't be placed has its choice beside its heading, not under a label repeating it", async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto("/create/dashboard")
  await openFile(page.getByRole("button", { name: "Open a file" }), {
    name: "Flexible.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: wordFile(WORDS),
  })
  const unplaced = page.getByRole("dialog", { name: "Here's what we found" }).getByRole("region", { name: /^Couldn't place/ })
  const choice = unplaced.getByRole("combobox", { name: "Keep Presentations, group 1" })
  await expect(choice).toHaveValue("")
  // The heading says which group it is, so the choice's name is for screen readers.
  await expect(unplaced.getByText("Keep Presentations, group 1")).toHaveCount(0)
  const heading = (await unplaced.getByText("Presentations", { exact: true }).first().boundingBox())!
  const box = (await choice.boundingBox())!
  expect(box.y + box.height / 2).toBeGreaterThan(heading.y)
  expect(box.y + box.height / 2).toBeLessThan(heading.y + heading.height)
  expect(errors).toEqual([])
})

test("on a phone, a PDF's review downloads the text left out and the text it couldn't place, and the resume gets neither", async ({
  page,
}) => {
  const errors = pageErrors(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/create/dashboard")
  await openFile(page.getByRole("button", { name: "Open a file" }), {
    name: "Flexible.pdf",
    mimeType: "application/pdf",
    buffer: textPdf([["Mara Lin", "SUMMARY", "Private draft paragraph.", "PRESENTATIONS", "Talk on accessible software"]]),
  })
  const review = page.getByRole("dialog", { name: "Here's what we found" })
  await expect(review.getByRole("combobox")).toHaveValue("")
  await review.getByRole("checkbox", { name: "Include SUMMARY, group 1" }).uncheck()
  const downloading = page.waitForEvent("download")
  await review.getByRole("button", { name: "Download", exact: true }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe("Flexible-review-text.txt")
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const text = Buffer.concat(chunks).toString("utf8")
  expect(text).toContain("Private draft paragraph.")
  expect(text).toContain("Talk on accessible software")
  await review.getByRole("button", { name: "Create resume", exact: true }).click()
  await expect(review).toBeHidden()
  const [saved] = await savedResumes(page)
  expect(saved.extraSections ?? {}).toEqual({})
  expect(saved.profileSection.summary).toBe("")
  expect(errors).toEqual([])
})
