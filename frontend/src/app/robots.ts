import type { MetadataRoute } from "next"
import { SITE_URL } from "@/lib/site"

// Nothing is disallowed. The pages kept out of search results say noindex,
// and a crawler only reads that on a page it's allowed to fetch: one blocked
// here can still be listed, without a description, from links to it.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", SITE_URL).href,
  }
}
