// Each template's picture was named by its template's id, some of which are
// other products' names, until the pictures were named after their pages
// (src/lib/templates.ts). Search engines list them under the old names, so
// those send them on to the new ones for good.
// prettier-ignore
const RENAMED_PICTURES = {
  jake: "jakes", modernjack: "modern-jakes", levelsfyi: "blueprint", referme: "compact", ian: "ians", resumeworded: "harvard",
  margin: "margin", swiss: "swiss", mono: "mono", accent: "accent", deedy: "deedy", zero2sudo: "zero2sudo",
}

module.exports = {
  webpack(config) {
    // Typst resume templates are imported as source strings (src/lib/typst).
    config.module.rules.push({ test: /\.typ$/, type: "asset/source" })
    return config
  },
  // Every resume's address gets the same editor page, built once. Resumes
  // only exist in the visitor's browser, so there's nothing for a server to
  // render per id, and a dynamic /create/new/[id] page ran a server function
  // on every visit. The page reads the id from the address. `+` takes the
  // rest of the path: an id kept from an opened PDF can have a "/" in it.
  async rewrites() {
    return [{ source: "/create/new/:id+", destination: "/create/editor" }]
  },
  // Contact is part of About now. Old links, and messages already sent with
  // this address, still land on its form. Here rather than in a page, whose
  // redirect() answers 307 (temporary), so search engines list About instead.
  async redirects() {
    return [
      { source: "/contact", destination: "/about#contact", permanent: true },
      ...Object.entries(RENAMED_PICTURES).map(([id, page]) => ({
        source: `/previews/${id}.webp`,
        destination: `/previews/${page}-resume-template.webp`,
        permanent: true,
      })),
    ]
  },
  // Files in public/ are otherwise checked with the server every time they're
  // shown. These keep their names when they change (e.g. a template's new
  // picture), so browsers keep them for a day rather than for good.
  async headers() {
    return ["/previews/:file*", "/video/:file*", "/how-it-works/:file*", "/backgrounds/:file*"].map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
    }))
  },
}
