import { expect, test, type Page } from "./test"
import { openFile, pageErrors, preview, saveResumes, savedResume } from "./helpers"
import { MARA } from "./resumes"

/** Opens Mara's resume in the editor, saved before the page opens, as an earlier visit would have. */
async function openMara(page: Page) {
  await saveResumes(page, [MARA])
  await page.goto("/create/new/mara")
  await expect(
    preview(page)
      .getByText(/Mara Lin/i)
      .first(),
  ).toBeVisible()
}

test("a resume downloaded as Word from the ▾ menu opens in another browser as its PDF does", async ({ page, browser }, testInfo) => {
  const errors = pageErrors(page)
  await openMara(page)

  // Choosing Word saves "<name>.docx", and the keyboard goes back to the ▾.
  const more = page.getByRole("button", { name: "More formats" })
  await more.click()
  const downloading = page.waitForEvent("download")
  await page.getByRole("menuitem", { name: /^Word/ }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe("Mara at Stripe.docx")
  await expect(more).toBeFocused()
  await expect(page.getByRole("status").filter({ hasText: "Word file downloaded" })).toBeAttached()
  // Saved under its own name, which a resume opened from it is named after.
  const file = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(file)

  // Opened in another browser, it's the resume as printed, as from its PDF: what's left out isn't in it.
  const elsewhere = await browser.newContext()
  const other = await elsewhere.newPage()
  const otherErrors = pageErrors(other)
  await other.goto("/create/dashboard")
  await openFile(other.getByRole("button", { name: "Open a file" }).first(), file)
  await expect(other).toHaveURL(/\/create\/new\/mara$/)
  await expect(other.getByLabel("Resume name")).toHaveValue("Mara at Stripe")
  const opened = await savedResume(other, "mara")
  expect(opened).toMatchObject({
    selectedTemplate: "modernjack",
    sectionOrder: ["Work", "Education", "Skills"],
    profileSection: MARA.profileSection,
    educationSection: [MARA.educationSection[0]],
    workExperienceSection: [{ ...MARA.workExperienceSection[0], workDescription: "• Built **payments** search for R&D" }],
    skillsSection: MARA.skillsSection,
  })
  expect(opened.workExperienceSection).toHaveLength(1)
  await elsewhere.close()

  expect(errors).toEqual([])
  expect(otherErrors).toEqual([])
})

test("a Word file that can't be made says so, and trying again downloads it", async ({ page }) => {
  const errors = pageErrors(page)
  await openMara(page)

  // Word's code downloads when it's first chosen; here, the download fails.
  const failed = page.getByRole("alert").filter({ hasText: "Download failed" })
  await page.route("**/_next/static/chunks/**", (route) => route.abort())
  await page.getByRole("button", { name: "More formats" }).click()
  await page.getByRole("menuitem", { name: /^Word/ }).click()
  await expect(failed).toContainText("Couldn't make your Word file.")

  // The PDF downloading meanwhile doesn't make the Word file, so its failure stays.
  await page.unroute("**/_next/static/chunks/**")
  const pdf = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download PDF" }).click()
  expect((await pdf).suggestedFilename()).toBe("Mara at Stripe.pdf")
  await expect(page.getByRole("button", { name: "Downloaded" })).toBeVisible()
  await expect(failed).toContainText("Couldn't make your Word file.")

  const downloading = page.waitForEvent("download")
  await failed.getByRole("button", { name: "Try again" }).click()
  expect((await downloading).suggestedFilename()).toBe("Mara at Stripe.docx")
  await expect(failed).toHaveCount(0)

  // Only the failure, as the editor logs it, and the download it stopped.
  expect(errors.filter((error) => !/^Error downloading the Word file:|^Failed to load resource/.test(error))).toEqual([])
})
