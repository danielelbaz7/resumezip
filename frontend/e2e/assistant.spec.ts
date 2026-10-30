import { expect, test } from "./test"
import { previewShown, printed, saveResumes, savedResume } from "./helpers"

const master = {
  id: "master",
  resumeTitle: "Master",
  selectedTemplate: "jake",
  profileSection: { fullName: "Ada Lovelace" },
  sectionOrder: ["Education", "Work", "Skills", "Projects"],
  sectionsChosen: true,
  workExperienceSection: [{ id: 1, companyName: "Babbage & Co", workRole: "Analyst", workDescription: "• Wrote notes on 3 engines" }],
}

test("the AI assistant changes the resume as it answers, and Undo puts it back", async ({ page }) => {
  await saveResumes(page, [master])
  // The AI's answer, so no AI is asked.
  let sent: { messages: { from: string; text: string }[] } | null = null
  await page.route("**/api/assist", async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({
      json: {
        actions: [
          {
            op: "edit_entry",
            resume: null,
            section: "Work",
            entry: 1,
            fields: [{ key: "workDescription", value: "• Wrote notes on **3** engines" }],
            value: null,
            position: null,
            targets: [],
          },
          { op: "leave_out_section", resume: null, section: "Skills", entry: null, fields: [], value: null, position: null, targets: [] },
        ],
        reply: "Bolded the number.",
      },
    })
  })
  await page.goto("/create/new/master")
  await previewShown(page)

  await page.getByRole("button", { name: "Ask AI" }).click()
  const assistant = page.getByRole("region", { name: "AI assistant" })
  await assistant.getByRole("textbox", { name: "Ask the AI to change your resume" }).fill("Bold the numbers")
  await assistant.getByRole("textbox", { name: "Ask the AI to change your resume" }).press("Enter")

  const log = assistant.getByRole("log", { name: "Conversation" })
  await expect(log.getByText("Bolded the number.")).toBeVisible()
  await expect(log.getByText("Changed Babbage & Co.")).toBeVisible()
  expect(sent!.messages).toEqual([{ from: "person", text: "Bold the numbers" }])
  await expect
    .poll(async () => (await savedResume(page, "master")).workExperienceSection[0].workDescription)
    .toBe("• Wrote notes on **3** engines")
  expect((await savedResume(page, "master")).leftOutSections).toEqual(["Skills"])
  await expect.poll(() => printed(page)).toContain("Wrote notes on 3 engines")

  await log.getByRole("button", { name: "Undo" }).click()
  await expect(log.getByText("Undone.")).toBeVisible()
  await expect
    .poll(async () => (await savedResume(page, "master")).workExperienceSection[0].workDescription)
    .toBe("• Wrote notes on 3 engines")
  expect((await savedResume(page, "master")).leftOutSections).toBeUndefined()

  // Closing it shows the form again.
  await assistant.getByRole("button", { name: "Close the AI assistant" }).click()
  await expect(assistant).toBeHidden()
})

test("the AI assistant says why when it can't answer", async ({ page }) => {
  await saveResumes(page, [master])
  await page.route("**/api/assist", (route) => route.fulfill({ status: 503, json: { error: "busy" } }))
  await page.goto("/create/new/master")
  await page.getByRole("button", { name: "Ask AI" }).click()
  await page.getByRole("button", { name: "Make it fit on one page" }).click()
  await expect(page.getByText("The AI is busy right now. Try again in a minute.")).toBeVisible()
  expect((await savedResume(page, "master")).tune).toBeUndefined()
})
