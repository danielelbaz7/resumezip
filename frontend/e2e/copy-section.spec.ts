import { expect, test, type Page } from "./test"
import { saveResumes, savedResume } from "./helpers"

const from = {
  id: "from",
  resumeTitle: "Backend",
  selectedTemplate: "jake",
  profileSection: { fullName: "Ada Lovelace" },
  projectsSection: [
    { id: 1, projectName: "Ledger", techStack: "Go" },
    { id: 2, projectName: "Gitlytics", techStack: "Next.js" },
  ],
}
const to = {
  id: "to",
  resumeTitle: "Frontend",
  selectedTemplate: "jake",
  profileSection: { fullName: "Ada Lovelace" },
  projectsSection: [{ id: 1, projectName: "Portfolio" }],
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Sections" })

test("a section's entries are copied into another resume, or moved there", async ({ page }) => {
  await saveResumes(page, [from, to])
  await page.goto("/create/new/from")
  await nav(page)
    .getByRole("button", { name: /^Projects/ })
    .click()

  await page.getByRole("button", { name: "Copy to other resumes" }).click()
  const dialog = page.getByRole("dialog", { name: "Copy Projects" })
  await dialog.getByRole("checkbox", { name: /^Ledger/ }).uncheck()
  await expect(dialog.getByRole("button", { name: "Copy", exact: true })).toBeDisabled()
  await dialog.getByRole("checkbox", { name: "Frontend" }).check()
  await dialog.getByRole("checkbox", { name: /move it/ }).check()
  await dialog.getByRole("button", { name: "Move", exact: true }).click()
  await expect(dialog.getByRole("status")).toHaveText("Moved 1 entry to Frontend.")
  await dialog.getByRole("button", { name: "Done" }).click()

  await expect
    .poll(async () => (await savedResume(page, "to")).projectsSection.map((entry: { projectName: string }) => entry.projectName))
    .toEqual(["Portfolio", "Gitlytics"])
  await expect
    .poll(async () => (await savedResume(page, "from")).projectsSection.map((entry: { projectName: string }) => entry.projectName))
    .toEqual(["Ledger"])
})
