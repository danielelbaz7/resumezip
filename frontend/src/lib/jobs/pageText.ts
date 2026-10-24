// A job posting's text from a page fetched at its link (fetchPosting.ts).
// Most job boards (Greenhouse, Lever, Ashby, Workday) put the posting in the
// page as schema.org JobPosting data, which is read first: it's the posting
// alone. Otherwise it's the page's main text, without its scripts, styles,
// menus and footer.

/** The most of a page's text kept as a posting. */
export const MOST_PAGE_CHARS = 20_000

// prettier-ignore
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", hellip: "…", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™",
}

/** Text with its HTML entities read: named ones it knows, and every numbered one. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity
    }
    return NAMED[code.toLowerCase()] ?? entity
  })
}

const dropped = (html: string, tag: string) => html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, "gi"), " ")

/** HTML as plain text: a line per block, list items bulleted, blank lines and runs of spaces taken out. */
export function htmlToText(html: string): string {
  let text = html.replace(/<!--[\s\S]*?-->/g, " ")
  for (const tag of ["script", "style", "noscript", "svg", "template", "head", "nav", "footer", "iframe"]) text = dropped(text, tag)
  text = text
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|ul|ol|table|header|main|blockquote|dd|dt)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && line !== "•")
    .join("\n")
}

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value])
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)

// Every object in some JSON-LD, inside lists and @graph too.
function* objectsIn(value: unknown): Generator<Record<string, unknown>> {
  for (const item of asList(value)) {
    if (!isRecord(item)) continue
    yield item
    if (item["@graph"]) yield* objectsIn(item["@graph"])
  }
}

const isJobPosting = (item: Record<string, unknown>) => asList(item["@type"]).some((type) => type === "JobPosting")

// A field that's text, HTML, or a list or object of them, as plain text.
function fieldText(value: unknown): string {
  return asList(value)
    .map((item) => {
      if (typeof item === "string") return htmlToText(/<[a-z][\s\S]*>/i.test(decodeEntities(item)) ? decodeEntities(item) : item)
      if (isRecord(item)) return fieldText(item.name ?? item.description ?? item.value)
      return ""
    })
    .filter(Boolean)
    .join("\n")
}

function placeText(value: unknown): string {
  return asList(value)
    .map((place) => {
      const address = isRecord(place) && isRecord(place.address) ? place.address : {}
      return ["addressLocality", "addressRegion", "addressCountry"]
        .map((key) => fieldText(address[key]))
        .filter(Boolean)
        .join(", ")
    })
    .filter(Boolean)
    .join("; ")
}

/** The posting in a page's schema.org JobPosting data, as text; "" when it has none. */
export function jobPostingData(html: string): string {
  for (const [, json] of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    let data: unknown
    try {
      data = JSON.parse(json.trim())
    } catch {
      continue
    }
    for (const item of objectsIn(data)) {
      if (!isJobPosting(item)) continue
      const company = isRecord(item.hiringOrganization) ? fieldText(item.hiringOrganization.name) : fieldText(item.hiringOrganization)
      const lines = [
        fieldText(item.title),
        company && `Company: ${company}`,
        placeText(item.jobLocation) && `Location: ${placeText(item.jobLocation)}`,
        fieldText(item.employmentType) && `Employment: ${fieldText(item.employmentType)}`,
        fieldText(item.description),
        ...["responsibilities", "qualifications", "skills", "experienceRequirements", "educationRequirements"].map((key) =>
          fieldText(item[key]),
        ),
      ]
      const text = lines.filter(Boolean).join("\n")
      if (text) return text.slice(0, MOST_PAGE_CHARS)
    }
  }
  return ""
}

const between = (html: string, tag: string) => html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}\\s*>`, "i"))?.[1] ?? ""

/**
 * A posting's text from its page: its JobPosting data, or else its main
 * content (its <main>, <article> or <body>, the first that has much in it),
 * after the page's title. "" when there's none.
 */
export function postingFromHtml(html: string): string {
  const data = jobPostingData(html)
  if (data) return data
  const title = htmlToText(between(html, "title"))
  const main = [between(html, "main"), between(html, "article"), between(html, "body"), html]
    .map(htmlToText)
    .find((text) => text.length >= 500)
  const body = main ?? htmlToText(between(html, "body") || html)
  return [title && !body.startsWith(title) ? title : "", body].filter(Boolean).join("\n").slice(0, MOST_PAGE_CHARS)
}
