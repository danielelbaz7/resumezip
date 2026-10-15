import { expect, test, type Page } from "./test"

/** How many elements, with their ::before and ::after, draw a backdrop filter. */
const blurred = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("*")].filter((element) =>
        [null, "::before", "::after"].some((pseudo) => {
          const style = getComputedStyle(element, pseudo)
          const filter = style.getPropertyValue("backdrop-filter") || style.getPropertyValue("-webkit-backdrop-filter")
          return filter !== "" && filter !== "none"
        }),
      ).length,
  )

// e2e/test.ts: the blur makes CI's WebKit slow to draw. Chromium's count shows the page still has glass to check.
test("WebKit's tests draw the glass without its blur, in a context a test opens too, and Chromium's with it", async ({
  page,
  browser,
  browserName,
}) => {
  const elsewhere = await browser.newContext()
  const other = await elsewhere.newPage()
  for (const tab of [page, other]) {
    await tab.goto("/templates")
    await expect(tab.getByRole("searchbox", { name: "Search templates" })).toBeVisible()
    if (browserName === "webkit") expect(await blurred(tab)).toBe(0)
    else expect(await blurred(tab)).toBeGreaterThan(0)
  }
  await elsewhere.close()
})
