import { readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { SITE_URL } from "@/lib/site"
import { TEMPLATES, templatePath } from "@/lib/templates"
import robots from "./robots"
import sitemap from "./sitemap"

// Pages left out of the sitemap, and why. Every other page has to be in it.
const LEFT_OUT: Record<string, string> = {
  "/create/dashboard": "the app: says noindex",
  "/create/editor": "the app: says noindex",
  "/google-drive": "only opened by Google's sign-in: says noindex",
}

// The addresses each page with a [name] in its path is built for.
const BUILT_FOR: Record<string, string[]> = {
  "/templates/[template]": TEMPLATES.map(templatePath),
}

/** Every page's address, from the page.tsx files under src/app. */
function pagePaths(): string[] {
  const app = import.meta.dirname
  return readdirSync(app, { recursive: true, encoding: "utf8" })
    .filter((file) => path.basename(file) === "page.tsx")
    .map((file) => `/${path.dirname(file).split(path.sep).join("/")}`.replace(/^\/\.$/, "/"))
    .flatMap((page) => (page.includes("[") ? (BUILT_FOR[page] ?? [page]) : [page]))
    .sort()
}

const sitemapPaths = () => sitemap().map(({ url }) => new URL(url).pathname)

describe("the sitemap", () => {
  test("lists every page people can land on, and nothing from the app", () => {
    const expected = pagePaths().filter((page) => !(page in LEFT_OUT))
    expect(sitemapPaths().sort()).toEqual(expected)
    expect(sitemapPaths().filter((page) => page.startsWith("/create"))).toEqual([])
  })

  test("gives addresses on the live site", () => {
    for (const { url } of sitemap()) expect(new URL(url).origin).toBe(SITE_URL)
  })

  test("leaves out only pages that are there", () => {
    const pages = pagePaths()
    for (const page of Object.keys(LEFT_OUT)) expect(pages).toContain(page)
  })
})

describe("robots.txt", () => {
  test("points to the sitemap", () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`)
  })

  // A noindex page that crawlers can't fetch can still be listed from links to it.
  test("lets crawlers fetch every page, so they read the noindex pages' noindex", () => {
    expect(robots().rules).toEqual({ userAgent: "*", allow: "/" })
  })
})
