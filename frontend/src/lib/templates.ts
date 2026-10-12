// Every resume template, in the order they're shown. The home page, the
// templates page, the editor's template picker and the dashboard all read
// this list, and each id needs a matching src/lib/typst/templates/<id>.typ
// and a picture of its first page in public/previews/<id>.webp, made from
// the sample resume in src/lib/typst/preview-samples/<id>.json. `font` is
// the family its text is set in, `weights` the weights of it the template
// uses when its family has more, and `alsoFonts` any other family it sets
// some words in; they're downloaded before its first PDF. One of `alsoFonts`
// may be its fallback (see FontUse), downloaded only for a resume with a
// letter it prints. `firstColumn` names the sections a template prints in a
// column of its own on the left, which its PDF holds before the rest; keep it
// in step with the template.
// `added` is the day it reached the site (the first four were there by
// 2025-04-20), which marks the newest as new for a while: see newTemplate.
// `tags` are what the templates page filters by, and must be true of the
// template's .typ file.

/** What the templates page filters by. A tag that fits every template, or none, filters nothing, so isn't one. */
// prettier-ignore
export const TEMPLATE_TAGS = [
  "Serif",          // Computer Modern, Garamond, Charis, Termes
  "Sans-serif",     // Lato, Heros, Source Sans
  "Color headings", // headings printed in a color
  "Fits a lot",     // 10pt text or smaller, on margins of half an inch or less
  "LaTeX look",     // set in Computer Modern, as LaTeX prints
  "Students",       // a format career offices give students
] as const

export type TemplateTag = (typeof TEMPLATE_TAGS)[number]

interface TemplateInfo {
  id: string
  name: string
  image: string
  font: string
  weights?: readonly number[]
  alsoFonts?: readonly (string | FontUse)[]
  firstColumn?: readonly string[]
  /** YYYY-MM-DD. */
  added: string
  tags: readonly TemplateTag[]
}

// For TeX Gyre Heros, which has no Cyrillic, and for Greek, which it and IBM
// Plex Mono have little of. Their templates print at 400, and at 600 to 900,
// for which Typst picks Source Sans 3's Regular and Bold, never its Light.
const SOURCE_SANS_FALLBACK = { family: "Source Sans 3", weights: [400, 700], fallback: true, script: "Greek" } as const

export const TEMPLATES = [
  {
    id: "jake",
    name: "Jake's",
    image: "/previews/jake.webp",
    font: "New Computer Modern",
    added: "2025-04-20",
    tags: ["Serif", "LaTeX look"],
  },
  {
    id: "modernjack",
    name: "Modern Jake's",
    image: "/previews/modernjack.webp",
    font: "Lato",
    weights: [400, 700],
    added: "2025-04-20",
    tags: ["Sans-serif"],
  },
  {
    id: "levelsfyi",
    name: "Blueprint",
    image: "/previews/levelsfyi.webp",
    font: "TeX Gyre Heros",
    alsoFonts: [SOURCE_SANS_FALLBACK],
    added: "2025-04-20",
    tags: ["Sans-serif", "Color headings", "Fits a lot"],
  },
  {
    id: "referme",
    name: "Compact",
    image: "/previews/referme.webp",
    font: "TeX Gyre Heros",
    alsoFonts: [SOURCE_SANS_FALLBACK],
    added: "2025-04-20",
    tags: ["Sans-serif", "Fits a lot"],
  },
  {
    id: "ian",
    name: "Ian's",
    image: "/previews/ian.webp",
    font: "Lato",
    weights: [400, 700],
    added: "2026-10-05",
    tags: ["Sans-serif", "Color headings", "Fits a lot"],
  },
  {
    id: "resumeworded",
    name: "Harvard",
    image: "/previews/resumeworded.webp",
    font: "EB Garamond",
    added: "2026-10-05",
    tags: ["Serif", "Students"],
  },
  {
    id: "margin",
    name: "Margin",
    image: "/previews/margin.webp",
    font: "Charis SIL",
    alsoFonts: ["Linux Biolinum O", { family: "EB Garamond", fallback: true, script: "Greek" }],
    added: "2026-10-10",
    tags: ["Serif"],
  },
  {
    id: "swiss",
    name: "Swiss",
    image: "/previews/swiss.webp",
    font: "TeX Gyre Heros",
    alsoFonts: [SOURCE_SANS_FALLBACK],
    added: "2026-10-10",
    tags: ["Sans-serif"],
  },
  {
    id: "mono",
    name: "Mono",
    image: "/previews/mono.webp",
    font: "IBM Plex Mono",
    alsoFonts: [SOURCE_SANS_FALLBACK],
    added: "2026-10-10",
    tags: [],
  },
  {
    id: "accent",
    name: "Accent",
    image: "/previews/accent.webp",
    font: "Source Sans 3",
    added: "2026-10-10",
    tags: ["Sans-serif", "Color headings"],
  },
  {
    id: "deedy",
    name: "Deedy",
    image: "/previews/deedy.webp",
    font: "Lato",
    alsoFonts: ["Raleway-v4020", { family: "Lato", fallback: true, script: "Greek" }],
    firstColumn: ["Education", "Skills"],
    added: "2026-10-10",
    tags: ["Sans-serif"],
  },
  {
    id: "zero2sudo",
    name: "zero2sudo",
    image: "/previews/zero2sudo.webp",
    font: "TeX Gyre Termes",
    alsoFonts: [{ family: "EB Garamond", weights: [400, 700], fallback: true, script: "Greek" }],
    added: "2026-10-12",
    tags: ["Serif"],
  },
] as const satisfies readonly TemplateInfo[]

export type Template = (typeof TEMPLATES)[number]
export type TemplateId = Template["id"]

export const DEFAULT_TEMPLATE: TemplateId = "jake"

/** A font family a template prints in, and the weights of it it uses when not all of them. */
export interface FontUse {
  family: string
  weights?: readonly number[]
  /**
   * Whether it's the template's fallback: the family each of its font lists
   * ends with, which prints the letters the fonts before it lack.
   */
  fallback?: boolean
  /**
   * A script, such as "Greek", that the fonts before the fallback leave to it
   * with `covers`, even the letters they have, so a word isn't drawn from two fonts.
   */
  script?: string
}

/** Every font family a template prints in: its text's first. */
export function fontsOf(template: Template): FontUse[] {
  const also: readonly (string | FontUse)[] = "alsoFonts" in template ? template.alsoFonts : []
  return [
    "weights" in template ? { family: template.font, weights: template.weights } : { family: template.font },
    ...also.map((font) => (typeof font === "string" ? { family: font } : font)),
  ]
}

/** The sections a template prints in a column on the left, before the rest. */
export const firstColumnOf = (template: Template): readonly string[] => ("firstColumn" in template ? template.firstColumn : [])

/** The template with this id, falling back to the default. */
export function templateById(id: unknown): Template {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0]
}

/**
 * The last part of the template's page's address, from its name: "jakes"
 * for Jake's. Never its id, which can be an older name kept for saved
 * resumes: Blueprint's is levelsfyi.
 */
export const templateSlug = (template: Template): string =>
  template.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f'’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

/** The template's own page, e.g. /templates/jakes. */
export const templatePath = (template: Template): string => `/templates/${templateSlug(template)}`

/** The template whose page's address ends in `slug`, if there's one. */
export const templateBySlug = (slug: string): Template | undefined => TEMPLATES.find((template) => templateSlug(template) === slug)

/** How long the newest template is marked as new. */
const NEW_FOR_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The template added last, while it's under NEW_FOR_DAYS old at `now` (ms
 * since 1970). Of two added the same day, the later in the list.
 */
export function newTemplate(now: number): Template | undefined {
  const newest = TEMPLATES.reduce<Template>((last, template) => (template.added >= last.added ? template : last), TEMPLATES[0])
  return now - Date.parse(newest.added) < NEW_FOR_DAYS * DAY_MS ? newest : undefined
}

// Leaves out case, accents and apostrophes, and splits words at hyphens, so
// "jakes" finds "Jake's". Sans-serif stays one word, or "serif" would find it.
const words = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f'’]/g, "")
    .toLowerCase()
    .replace(/sans[\s-]*serif/g, "sansserif")
    .split(/[\s-]+/)
    .filter(Boolean)

/**
 * Whether a template is one the templates page's search and tag pick out:
 * each word searched for starts a word of its name, font or tags.
 */
export function templateMatches(template: Template, search: string, tag?: TemplateTag): boolean {
  const tags: readonly TemplateTag[] = template.tags
  if (tag && !tags.includes(tag)) return false
  const own = words([template.name, template.font, ...tags].join(" "))
  return words(search).every((word) => own.some((its) => its.startsWith(word)))
}
