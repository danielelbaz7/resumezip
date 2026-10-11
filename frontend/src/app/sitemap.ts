import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/site"

// The pages people search for. The editor, the dashboard and the Google Drive
// sign-in page say noindex instead, and /contact redirects to About.
const PAGES = ["/", "/templates", "/about", "/terms"]

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({ url: new URL(path, SITE_URL).href }))
}
