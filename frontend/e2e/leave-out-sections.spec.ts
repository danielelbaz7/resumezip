import { expect, test, type Page } from "./test"
import { previewShown, printed, saveResumes, savedResume } from "./helpers"

const master = {
  id: "master",
  resumeTitle: "Master",
  selectedTemplate: "jake",
  profileSection: { fullName: "Ada Lovelace" },
  sectionOrder: ["Education", "Work", "Skills", "Projects"],
  sectionsChosen: true,
  projectsSection: [{ id: 1, projectName: "Analytical Engine Notes" }],
  skillsSection: [{ id: 1, skillName: "Languages", skillDetails: "Go" }],
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Sections" })

test("a whole section is left out of the PDF and put back, keeping its entries", async ({ page }) => {
  await saveResumes(page, [master])
  await page.goto("/create/new/master")
  await previewShown(page)
  await expect.poll(() => printed(page)).toContain("Analytical Engine Notes")

  await nav(page).getByRole("button", { name: "Projects", exact: true }).click()
  await page.getByRole("checkbox", { name: "Include section in the PDF" }).uncheck()
  await expect(nav(page).getByRole("button", { name: "Projects, left out of the PDF" })).toBeVisible()
  // Printed text is "" while the preview is redrawn, so it's the rest being there that says it's drawn.
  await expect
    .poll(async () => {
      const text = await printed(page)
      return text.includes("Languages") && !text.includes("Analytical Engine Notes")
    })
    .toBe(true)
  await expect.poll(async () => (await savedResume(page, "master")).leftOutSections).toEqual(["Projects"])
  expect((await savedResume(page, "master")).projectsSection).toHaveLength(1)

  await page.getByRole("checkbox", { name: "Include section in the PDF" }).check()
  await expect.poll(() => printed(page)).toContain("Analytical Engine Notes")
  await expect.poll(async () => (await savedResume(page, "master")).leftOutSections).toBeNull()
})

test("one project is left out of the PDF from its card while it's open, keeping the rest", async ({ page }) => {
  await saveResumes(page, [{ ...master, projectsSection: [...master.projectsSection, { id: 2, projectName: "Difference Engine" }] }])
  await page.goto("/create/new/master")
  await previewShown(page)
  await nav(page).getByRole("button", { name: "Projects", exact: true }).click()
  await page.getByRole("button", { name: "Edit Analytical Engine Notes" }).click()
  await page.getByRole("checkbox", { name: "Include Analytical Engine Notes in the PDF" }).uncheck()
  await expect
    .poll(async () => {
      const text = await printed(page)
      return text.includes("Difference Engine") && !text.includes("Analytical Engine Notes")
    })
    .toBe(true)
  await expect.poll(async () => (await savedResume(page, "master")).projectsSection[0].leftOut).toBe(true)
})
