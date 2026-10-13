import { LINKEDIN_URL, LOGO_IMAGE, REPO_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site"

// What search engines read about a page, as schema.org JSON in it. Each fact
// has to be true of the page it's on, or of the app.

const at = (path: string) => new URL(path, SITE_URL).href

const ORGANIZATION = `${SITE_URL}/#organization`

/**
 * The home page's: the site's name, and the domain it also goes by; who makes
 * it, with its logo and its pages elsewhere; and that it's a free app that runs
 * in the browser. Google only shows an app's price in results next to a rating
 * or reviews, which resumezip doesn't collect.
 */
export const HOME_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: SITE_NAME,
      // Google asks for the domain here when the name isn't the domain.
      alternateName: ["tryresumezip", "tryresumezip.com"],
      url: at("/"),
      publisher: { "@id": ORGANIZATION },
    },
    {
      "@type": "Organization",
      "@id": ORGANIZATION,
      name: SITE_NAME,
      url: at("/"),
      logo: { "@type": "ImageObject", url: at(LOGO_IMAGE.url), width: LOGO_IMAGE.width, height: LOGO_IMAGE.height },
      sameAs: [REPO_URL, LINKEDIN_URL],
    },
    {
      "@type": "WebApplication",
      name: SITE_NAME,
      url: at("/"),
      description: SITE_DESCRIPTION,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      publisher: { "@id": ORGANIZATION },
    },
  ],
}

interface Crumb {
  name: string
  path: string
}

export const TEMPLATES_CRUMB: Crumb = { name: "Templates", path: "/templates" }

/** Where a page sits under the home page, e.g. Home › Templates › Jake's resume template: `trail` ends with the page itself. */
export function breadcrumbs(trail: readonly Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...trail].map(({ name, path }, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: at(path),
    })),
  }
}
