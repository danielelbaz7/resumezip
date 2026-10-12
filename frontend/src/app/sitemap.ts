import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/site"
import { TEMPLATES, templatePath } from "@/lib/templates"

// The pages people search for, with each template's own. The editor, the
// dashboard and the Google Drive sign-in page say noindex instead, and
// /contact redirects to About.
const PAGES = ["/", "/templates", ...TEMPLATES.map(templatePath), "/templates/how-they-read", "/about", "/terms"]

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({ url: new URL(path, SITE_URL).href }))
}
