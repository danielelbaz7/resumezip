import { type APIRequestContext, expect, test } from "@playwright/test"
import { pageErrors, seriousAccessibilityProblems } from "./helpers"

const PAGES = ["/", "/templates", "/templates/jakes", "/about", "/terms", "/create/dashboard", "/does-not-exist"]

test("contact, on the about page, gives the support address to write to or copy", async ({ page, context, browserName }) => {
  // Contact is part of About now; its old address still leads to it.
  await page.goto("/contact")
  await expect(page).toHaveURL(/\/about#contact$/)
  const email = page.getByRole("link", { name: "hello@tryresumezip.com", exact: true })
  await expect(email).toHaveAttribute("href", "mailto:hello@tryresumezip.com")

  // Copied for those who write from a webmail, where the link opens nothing.
  test.skip(browserName !== "chromium", "Reading the clipboard back needs Chromium's permission")
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.getByRole("button", { name: "Copy email" }).click()
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("hello@tryresumezip.com")
})

// Google's sign-in, for Save to Google Drive, links to the privacy policy this way.
test("/terms#privacy opens the privacy policy, and a tab's address opens it from the page too", async ({ page }) => {
  await page.goto("/terms#privacy")
  await expect(page.getByRole("tab", { name: "Privacy policy" })).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("tabpanel", { name: "Privacy policy" })).toContainText("save a PDF to your own Google Drive when you ask")

  await page.evaluate(() => (window.location.hash = "faq"))
  await expect(page.getByRole("tab", { name: "FAQ" })).toHaveAttribute("aria-selected", "true")
})

// What a search engine reads: the HTML as served, before any script runs. The
// same in every browser, so it's read once.
test.describe("search engines", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Reads the served HTML, which doesn't depend on the browser")

  const head = async (request: APIRequestContext, path: string) => {
    const response = await request.get(path)
    expect(response.ok()).toBe(true)
    return (await response.text()).split("</head>")[0]
  }
  const meta = (html: string, name: string) => html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`))?.[1]

  test("find every page in the sitemap, each with its own description", async ({ request }) => {
    expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap: https://www.tryresumezip.com/sitemap.xml")
    const sitemap = await (await request.get("/sitemap.xml")).text()
    const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => new URL(url).pathname)
    expect(paths).toEqual(expect.arrayContaining(["/", "/templates", "/about", "/terms"]))

    const descriptions = new Map<string, string>()
    for (const path of paths) {
      const html = await head(request, path)
      expect(meta(html, "robots"), path).toBeUndefined()
      const description = meta(html, "description")
      expect(description, path).toBeTruthy()
      expect(descriptions.get(description!), `${path} has the same description as`).toBeUndefined()
      descriptions.set(description!, path)
    }
  })

  test("are asked to leave the dashboard and the editor out", async ({ request }) => {
    for (const path of ["/create/dashboard", "/create/new/a-resume"]) {
      expect(meta(await head(request, path), "robots"), path).toBe("noindex")
    }
  })

  test("read on the home page that resumezip is a free web app", async ({ request }) => {
    const html = await (await request.get("/")).text()
    const json = html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)?.[1]
    const graph: { "@type": string; name: string; offers?: { price: string } }[] = JSON.parse(json ?? "{}")["@graph"]
    expect(graph.find((item) => item["@type"] === "WebSite")?.name).toBe("resumezip")
    expect(graph.find((item) => item["@type"] === "WebApplication")?.offers?.price).toBe("0")
  })
})

for (const path of PAGES) {
  test(`${path} loads without errors and passes accessibility checks`, async ({ page }) => {
    const errors = pageErrors(page)
    await page.goto(path)
    // The home page's looping video can keep streaming in Safari. Readiness
    // for this layout/accessibility check is visible content with fonts loaded.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await page.evaluate(() => document.fonts.ready.then(() => undefined))

    expect(await seriousAccessibilityProblems(page)).toEqual([])
    // The 404 page's own "not found" response is expected, and browsers log it.
    // Only that exact message for this page is let through.
    const ownNotFound = (error: string) =>
      path === "/does-not-exist" &&
      /^Failed to load resource: the server responded with a status of 404 \(Not Found\) \(at http:\/\/[^/]+\/does-not-exist\)$/.test(error)
    expect(errors.filter((error) => !ownNotFound(error))).toEqual([])
  })
}
