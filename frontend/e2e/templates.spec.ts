import { expect, test, type Page } from "@playwright/test"
import { countSlides, inkCovers, pageErrors } from "./helpers"

// The templates page's search and style chips. Each card is a link that starts a resume with its template.

const cards = (page: Page) => page.getByRole("main").getByRole("link", { name: / template/ })

test("/ goes to the search, which finds templates by name, font or style", async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto("/templates")
  const search = page.getByRole("searchbox", { name: "Search templates" })
  await expect(cards(page).first()).toBeVisible()
  const every = await cards(page).count()

  // The cards are in the page's HTML, so they show before its script runs, and "/" does nothing
  // until it has. Pressed again until it goes to the search, which then holds no "/".
  await expect(async () => {
    await page.keyboard.press("/")
    await expect(search).toBeFocused({ timeout: 1_000 })
  }).toPass()
  await expect(search).toHaveValue("")

  await page.keyboard.type("garamond")
  await expect(cards(page)).toHaveCount(1)
  await expect(cards(page)).toHaveAccessibleName(/^Harvard template/)

  await search.fill("serif")
  await expect(cards(page)).toHaveCount(3)
  await expect(cards(page).first()).toHaveAccessibleName(/^Jake's template/)

  // Escape clears it.
  await search.press("Escape")
  await expect(search).toHaveValue("")
  await expect(cards(page)).toHaveCount(every)
  expect(errors).toEqual([])
})

test("a chip shows the templates with that style, and says it's picked", async ({ page }) => {
  await page.goto("/templates")
  const chips = page.getByRole("group", { name: "Filter by style" })
  const all = chips.getByRole("button", { name: "All" })
  await expect(all).toHaveAttribute("aria-pressed", "true")
  const every = await cards(page).count()

  await chips.getByRole("button", { name: "Color headings" }).click()
  await expect(chips.getByRole("button", { name: "Color headings" })).toHaveAttribute("aria-pressed", "true")
  await expect(all).toHaveAttribute("aria-pressed", "false")
  await expect(cards(page)).toHaveCount(3)
  await expect(page.getByRole("status")).toHaveText("Showing Blueprint, Ian's, and Accent.")

  await all.click()
  await expect(cards(page)).toHaveCount(every)
})

test("the picked chip's ink slides across to the next one picked, or jumps there with less motion", async ({ page }) => {
  await page.goto("/templates")
  const chips = page.getByRole("group", { name: "Filter by style" })
  await expect.poll(() => inkCovers(chips, chips.getByRole("button", { name: "All" }))).toBe(true)
  const slides = await countSlides(chips)

  const latex = chips.getByRole("button", { name: "LaTeX look" })
  await latex.click()
  await expect.poll(() => inkCovers(chips, latex)).toBe(true)
  expect(await slides()).toBe(1)

  // It's there as soon as it's picked, so there was nothing to slide.
  await page.emulateMedia({ reducedMotion: "reduce" })
  const serif = chips.getByRole("button", { name: "Serif", exact: true })
  await serif.click()
  await expect.poll(() => inkCovers(chips, serif)).toBe(true)
  expect(await slides()).toBe(1)
})

test("when nothing matches, it says so, and one click shows every template again", async ({ page }) => {
  await page.goto("/templates")
  const every = await cards(page).count()
  await page.getByRole("searchbox", { name: "Search templates" }).fill("zebra")
  await expect(cards(page)).toHaveCount(0)
  await expect(page.getByText("No template matches that.")).toBeVisible()
  await expect(page.getByRole("status")).toHaveText("No template matches.")

  await page.getByRole("button", { name: "Show every template" }).click()
  await expect(cards(page)).toHaveCount(every)
  await expect(page.getByRole("searchbox", { name: "Search templates" })).toBeFocused()
})

test("what's typed in the search before the page's script has run still searches", async ({ page }) => {
  const errors = pageErrors(page)
  // The script held back until it's typed, as on a slow connection.
  let typed!: () => void
  const held = new Promise<void>((done) => (typed = done))
  await page.route("**/_next/static/chunks/**", async (route) => {
    await held
    await route.continue()
  })
  await page.goto("/templates", { waitUntil: "domcontentloaded" })
  await page.getByRole("searchbox", { name: "Search templates" }).fill("zebra")
  typed()
  await expect(page.getByText("No template matches that.")).toBeVisible()
  await expect(cards(page)).toHaveCount(0)
  await expect(page.getByRole("searchbox", { name: "Search templates" })).toHaveValue("zebra")
  expect(errors).toEqual([])
})

test("/ typed in the search is part of the search", async ({ page }) => {
  await page.goto("/templates")
  const search = page.getByRole("searchbox", { name: "Search templates" })
  await search.click()
  await page.keyboard.type("a/b")
  await expect(search).toHaveValue("a/b")
})

test("at most one template is marked new", async ({ page }) => {
  await page.goto("/templates")
  await expect(cards(page).first()).toBeVisible()
  expect(await page.getByRole("main").getByText("New", { exact: true }).count()).toBeLessThanOrEqual(1)
})

test("each template's page links to the others, and only those first made in LaTeX say it isn't needed", async ({ page }) => {
  await page.goto("/templates/jakes")
  await expect(page.getByText("You don’t need LaTeX or Overleaf")).toBeVisible()
  const others = page.getByRole("navigation", { name: "Other templates" })
  await expect(others.getByRole("link", { name: "Jake's", exact: true })).toHaveCount(0)
  await others.getByRole("link", { name: "Blueprint" }).click()

  await expect(page).toHaveURL(/\/templates\/blueprint$/)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Blueprint resume template")
  await expect(page.getByText("You don’t need LaTeX or Overleaf")).toHaveCount(0)
})

test("a template's page is at its name, not its id", async ({ request }) => {
  expect((await request.get("/templates/blueprint")).status()).toBe(200)
  expect((await request.get("/templates/levelsfyi")).status()).toBe(404)
})
