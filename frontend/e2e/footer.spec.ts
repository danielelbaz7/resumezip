import { expect, test } from "./test"
import { pageErrors } from "./helpers"

test("the footer is a wordmark and its links to a screen reader", async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto("/")
  const footer = page.getByRole("contentinfo")

  await expect(footer.getByRole("link", { name: "resumezip" })).toHaveAttribute("href", "/")
  await expect(footer.getByRole("navigation", { name: "Footer" }).getByRole("link")).toHaveText(["Terms & privacy", "Contact"])
  expect(errors).toEqual([])
})

// The wordmark's link box reaches well past its letters: above them, where the font's ascent spills over its tight line,
// and below, in the room left for the p's tail. Only the letters should light it up.
test("the footer's wordmark is hovered over its letters, not the space round them", async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto("/templates")
  const wordmark = page.getByRole("contentinfo").getByRole("link", { name: "resumezip" })
  await wordmark.scrollIntoViewIfNeeded()
  const box = await wordmark.boundingBox()
  const em = await wordmark.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  // Points in em from the start of the wordmark's line, whose baseline is at 0.74em.
  const hoveredAt = async (x: number, y: number) => {
    await page.mouse.move(box!.x + x * em, box!.y + y * em)
    return wordmark.evaluate((el) => el.matches(":hover"))
  }

  expect(await hoveredAt(1, 0.5), "on the u").toBe(true)
  expect(await hoveredAt(3.45, 0.1), "on the i's dot").toBe(true)
  expect(await hoveredAt(3.7, 0.88), "on the p's tail").toBe(true)
  expect(await hoveredAt(1, -0.15), "above the link").toBe(false)
  expect(await hoveredAt(1, 0.1), "above the u").toBe(false)
  expect(await hoveredAt(1, 0.95), "below the u").toBe(false)
  expect(errors).toEqual([])
})

// The zipper is drawn shut and stays that way: reaching the footer starts nothing in it.
test("the footer's zipper stays still as the page is scrolled to it and away", async ({ page }) => {
  const errors = pageErrors(page)
  await page.addInitScript(() => {
    for (const type of ["transitionrun", "animationstart"]) {
      window.addEventListener(
        type,
        (event) => {
          if ((event.target as Element).closest("footer")) document.documentElement.dataset.footerMoved = "yes"
        },
        true,
      )
    }
  })
  await page.goto("/")
  await page.keyboard.press("End")
  await page.keyboard.press("Home")
  await page.keyboard.press("End")
  // A fixed wait: proving nothing starts in it once it's been scrolled to.
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => document.documentElement.dataset.footerMoved)).toBeUndefined()
  expect(errors).toEqual([])
})
