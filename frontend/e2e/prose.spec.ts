import { expect, test, type Page } from "./test"
import { expectText, pageErrors, previewShown, printed, saveResumes, savedResume, selectInBox } from "./helpers"

// The summary and a text section show bold and italic words as they print,
// without their marks, as bullets do, and are saved with them. Their lines
// have no bullets, and Enter starts a new line.

const notes = "33333333-3333-4333-8333-333333333333"
const RESUME = {
  id: "prose",
  resumeTitle: "Prose",
  resumeTag: "professional",
  updatedAt: "2026-10-12T12:00:00.000Z",
  selectedTemplate: "jake",
  sectionOrder: ["Work", `extra:${notes}`],
  headings: {},
  profileSection: { fullName: "Ada Lovelace", summary: "Builds **fast** tools.\n\nWrites *docs*." },
  workExperienceSection: [{ id: 1, workRole: "Engineer", companyName: "Google", workDescription: "• Built the search index" }],
  extraSections: { [notes]: { kind: "text", heading: "Notes", text: "Speaks **French**." } },
}

async function open(page: Page) {
  await saveResumes(page, [RESUME])
  await page.goto(`/create/new/${RESUME.id}`)
  // The preview first, so the PDF compiler's download isn't cut off, which Safari logs as an error.
  await previewShown(page)
}

test("the summary shows bold and italic words as they print, and keeps their marks when it's saved", async ({ page }) => {
  const errors = pageErrors(page)
  await open(page)
  const box = page.getByRole("textbox", { name: "Summary", exact: true })
  await expect(box.getByRole("strong")).toHaveText("fast")
  await expect(box.getByRole("emphasis")).toHaveText("docs")
  await expectText(box, "Builds fast tools.\n\nWrites docs.")
  // It says how, as a bullets box does.
  await expect(box).toHaveAccessibleDescription(/bold.*italic/)

  // ⌘B bolds the words selected.
  await box.focus()
  await selectInBox(box, "Builds fast ".length, "Builds fast tools".length)
  await page.keyboard.press("ControlOrMeta+b")
  await expect(box.getByRole("strong")).toHaveText(["fast", "tools"])
  await expect
    .poll(async () => (await savedResume(page, RESUME.id)).profileSection.summary)
    .toBe("Builds **fast** **tools**.\n\nWrites *docs*.")

  // Enter starts a line with no bullet, and marks typed as words turn bold.
  await selectInBox(box, "Builds fast tools.\n\nWrites docs.".length)
  await page.keyboard.press("Enter")
  await page.keyboard.type("Ships **often**.")
  await expectText(box, "Builds fast tools.\n\nWrites docs.\nShips often.")
  await expect
    .poll(async () => (await savedResume(page, RESUME.id)).profileSection.summary)
    .toBe("Builds **fast** **tools**.\n\nWrites *docs*.\nShips **often**.")
  // The PDF prints the words, not the marks.
  await expect.poll(() => printed(page)).toContain("Ships often.")
  expect(await printed(page)).not.toContain("*")
  // Undone in one go, as typing is.
  await page.keyboard.press("ControlOrMeta+z")
  await expectText(box, "Builds fast tools.\n\nWrites docs.\n")

  expect(errors).toEqual([])
})

test("a text section shows bold and italic words as they print, and keeps their marks when it's saved", async ({ page }) => {
  const errors = pageErrors(page)
  await open(page)
  await page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("button", { name: /^Notes$/ })
    .click()
  const box = page.getByRole("textbox", { name: "Text", exact: true })
  await expect(box.getByRole("strong")).toHaveText("French")
  await expectText(box, "Speaks French.")

  // After a bold word, ⌘B stops the bold, and a word typed in single marks turns italic.
  await box.focus()
  await selectInBox(box, "Speaks French".length)
  await page.keyboard.press("ControlOrMeta+b")
  await page.keyboard.type(" and *Spanish*")
  await expect(box.getByRole("emphasis")).toHaveText("Spanish")
  await expect.poll(async () => (await savedResume(page, RESUME.id)).extraSections[notes].text).toBe("Speaks **French** and *Spanish*.")
  await expect.poll(() => printed(page)).toContain("Speaks French and Spanish.")

  // Typed among bold words, it's bold and italic, and saved so the PDF reads it that way.
  await selectInBox(box, "Speaks French and Spanish.".length)
  await page.keyboard.press("ControlOrMeta+b")
  await page.keyboard.type(" Also *German*")
  await expect(box.getByRole("emphasis")).toHaveText(["Spanish", "German"])
  await expect
    .poll(async () => (await savedResume(page, RESUME.id)).extraSections[notes].text)
    .toBe("Speaks **French** and *Spanish*. **Also** ***German***")

  expect(errors).toEqual([])
})
