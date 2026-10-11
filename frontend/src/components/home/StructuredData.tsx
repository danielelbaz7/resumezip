import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site"

// Tells search engines the site's name, for their results, and that resumezip
// is a free app that runs in the browser. Google only shows an app's price in
// results next to a rating or reviews, which resumezip doesn't collect.
const DATA = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: "resumezip", url: `${SITE_URL}/` },
    {
      "@type": "WebApplication",
      name: "resumezip",
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  ],
}

/** The home page's structured data, as JSON in the page: nothing is loaded for it. */
export default function StructuredData() {
  // "<" is escaped so no text in the data can close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(DATA).replace(/</g, "\\u003c") }} />
}
