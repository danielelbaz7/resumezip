import { expect, test } from "./test"
import { saveResumes, savedResume } from "./helpers"

const resume = (id: string, resumeTitle: string, style: Record<string, unknown> = {}) => ({
  id,
  resumeTitle,
  selectedTemplate: "jake",
  profileSection: { fullName: "Ada Lovelace" },
  ...style,
})

test("Change style puts one resume's style on others at once, and Undo puts them back", async ({ page }) => {
  await saveResumes(page, [
    resume("styled", "Styled", { selectedTemplate: "swiss", tune: { size: 0.9 }, workFirst: "role" }),
    resume("one", "One"),
    resume("two", "Two"),
  ])
  await page.goto("/create/dashboard")

  await page.getByRole("button", { name: "Change style" }).click()
  const dialog = page.getByRole("dialog", { name: "Change style" })
  await dialog.getByRole("radio", { name: /The style of a resume/ }).check()
  await dialog.getByRole("combobox", { name: "Resume to copy the style of" }).selectOption({ label: "Styled" })
  // The resume it's copied from isn't one to change.
  await expect(dialog.getByRole("checkbox", { name: "Styled" })).toHaveCount(0)
  await dialog.getByRole("button", { name: "Select all" }).click()
  await dialog.getByRole("button", { name: "Change 2 resumes" }).click()
  await expect(dialog.getByRole("status")).toHaveText("Changed the style of 2 resumes.")

  for (const id of ["one", "two"])
    await expect.poll(() => savedResume(page, id)).toMatchObject({ selectedTemplate: "swiss", tune: { size: 0.9 }, workFirst: "role" })

  await dialog.getByRole("button", { name: "Undo" }).click()
  await expect(dialog.getByRole("status")).toHaveText("Put back as they were.")
  await expect.poll(async () => (await savedResume(page, "one")).selectedTemplate).toBe("jake")
  expect((await savedResume(page, "one")).workFirst).toBeUndefined()
})
