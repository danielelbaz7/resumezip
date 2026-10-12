import { describe, expect, test } from "vitest"
import {
  newTemplate,
  TEMPLATE_TAGS,
  TEMPLATES,
  templateById,
  templateBySlug,
  templateMatches,
  templatePath,
  templateSlug,
} from "./templates"

const DAY_MS = 24 * 60 * 60 * 1000
const names = (search: string, tag?: (typeof TEMPLATE_TAGS)[number]) =>
  TEMPLATES.filter((template) => templateMatches(template, search, tag)).map((template) => template.name)

describe("the templates page's search", () => {
  test("finds a template by its name, font or tags, in any case", () => {
    expect(names("harvard")).toEqual(["Harvard"])
    expect(names("GARAMOND")).toEqual(["Harvard"])
    expect(names("color")).toEqual(["Blueprint", "Ian's", "Accent"])
  })

  test("needs every word, wherever each is", () => {
    expect(names("lato blue")).toEqual([])
    expect(names("lato color")).toEqual(["Ian's"])
  })

  test("doesn't mind apostrophes, accents or hyphens", () => {
    expect(names("jakes")).toEqual(["Jake's", "Modern Jake's"])
    expect(names("Hárvard")).toEqual(["Harvard"])
    expect(names("sans serif")).toEqual(["Modern Jake's", "Blueprint", "Compact", "Ian's", "Swiss", "Accent", "Deedy"])
    expect(names("sansserif")).toEqual(names("Sans-serif"))
  })

  test("finds the starts of words, so serif isn't sans-serif", () => {
    expect(names("serif")).toEqual(["Jake's", "Harvard", "Margin", "zero2sudo"])
    expect(names("gar")).toEqual(["Harvard"])
    expect(names("arvard")).toEqual([])
  })

  test("with nothing typed, shows every template, or every one with the tag picked", () => {
    expect(names("")).toHaveLength(TEMPLATES.length)
    expect(names("  ")).toHaveLength(TEMPLATES.length)
    expect(names("", "Serif")).toEqual(["Jake's", "Harvard", "Margin", "zero2sudo"])
    expect(names("jake", "Sans-serif")).toEqual(["Modern Jake's"])
  })
})

test("each tag picks out some templates, not all of them", () => {
  for (const tag of TEMPLATE_TAGS) {
    expect(names("", tag).length, tag).toBeGreaterThan(0)
    expect(names("", tag).length, tag).toBeLessThan(TEMPLATES.length)
  }
})

describe("the template marked new", () => {
  const added = Date.parse(templateById("zero2sudo").added)

  test("is the one added last", () => {
    expect(newTemplate(added + DAY_MS)?.id).toBe("zero2sudo")
  })

  test("isn't new for ever", () => {
    expect(newTemplate(added + 59 * DAY_MS)?.id).toBe("zero2sudo")
    expect(newTemplate(added + 60 * DAY_MS)).toBeUndefined()
  })
})

describe("each template's page", () => {
  test("is named after the template, never after an id that differs from its name", () => {
    expect(templatePath(templateById("jake"))).toBe("/templates/jakes")
    expect(templatePath(templateById("modernjack"))).toBe("/templates/modern-jakes")
    expect(templatePath(templateById("levelsfyi"))).toBe("/templates/blueprint")
    expect(templatePath(templateById("resumeworded"))).toBe("/templates/harvard")
    const ids: readonly string[] = TEMPLATES.map((template) => template.id)
    for (const template of TEMPLATES) {
      const slug = templateSlug(template)
      if (slug !== template.id) expect(ids, `${template.name}'s page`).not.toContain(slug)
    }
  })

  test("has an address of its own, in plain letters and hyphens", () => {
    const slugs = TEMPLATES.map(templateSlug)
    expect(new Set(slugs).size).toBe(TEMPLATES.length)
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  test("leads back to its template, and an id isn't an address", () => {
    for (const template of TEMPLATES) expect(templateBySlug(templateSlug(template))).toBe(template)
    expect(templateBySlug("levelsfyi")).toBeUndefined()
  })
})
