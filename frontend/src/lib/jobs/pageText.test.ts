import { describe, expect, test } from "vitest"
import { decodeEntities, htmlToText, jobPostingData, postingFromHtml } from "./pageText"

const jsonLd = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`

describe("a posting's page", () => {
  test("is read from its JobPosting data first, its HTML description as text", () => {
    const html = `<html><head><title>Careers</title>${jsonLd({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Systems Engineer",
      hiringOrganization: { "@type": "Organization", name: "Northwind" },
      jobLocation: { "@type": "Place", address: { addressLocality: "Austin", addressRegion: "TX" } },
      description:
        "&lt;p&gt;You&amp;rsquo;ll build a storage engine.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;C++&lt;/li&gt;&lt;li&gt;Linux&lt;/li&gt;&lt;/ul&gt;",
    })}</head><body><nav>Jobs · About</nav><main>Apply now</main></body></html>`
    expect(postingFromHtml(html)).toBe(
      ["Systems Engineer", "Company: Northwind", "Location: Austin, TX", "You’ll build a storage engine.", "• C++", "• Linux"].join("\n"),
    )
  })

  test("finds a JobPosting inside a @graph or a list, among other data", () => {
    const html = `${jsonLd({ "@type": "WebSite", name: "Board" })}${jsonLd({
      "@graph": [{ "@type": "BreadcrumbList" }, { "@type": ["JobPosting"], title: "Data Engineer", description: "Spark and SQL." }],
    })}`
    expect(jobPostingData(html)).toBe("Data Engineer\nSpark and SQL.")
  })

  test("without that data, is its title and main text, without scripts, styles, menus or the footer", () => {
    const body = "We build compilers. ".repeat(30)
    const html = `<html><head><title>Compiler Engineer – Acme</title><style>p{}</style></head><body>
      <nav>Home · Careers</nav><main><h1>Compiler Engineer</h1><p>${body}</p><script>track()</script></main>
      <footer>© Acme</footer></body></html>`
    const text = postingFromHtml(html)
    expect(text.split("\n").slice(0, 2)).toEqual(["Compiler Engineer – Acme", "Compiler Engineer"])
    expect(text).toContain("We build compilers.")
    expect(text).not.toMatch(/track\(\)|Home · Careers|© Acme|p\{\}/)
  })

  test("is nothing when it has no text", () => {
    expect(postingFromHtml("<html><head><script>app()</script></head><body><div id=root></div></body></html>")).toBe("")
  })

  test("skips JSON-LD that isn't JSON", () => {
    expect(jobPostingData('<script type="application/ld+json">{ not json</script>')).toBe("")
  })
})

describe("HTML as text", () => {
  test("has a line per block, list items bulleted, and entities read", () => {
    expect(htmlToText("<h2>About&nbsp;us</h2><p>We&#39;re   hiring.<br>Now.</p><ul><li>Go</li><li></li></ul>")).toBe(
      "About us\nWe're hiring.\nNow.\n• Go",
    )
    expect(decodeEntities("&#x1F680; &amp;&unknown;")).toBe("🚀 &&unknown;")
  })
})
