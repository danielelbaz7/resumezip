/** A page's structured data (src/lib/structuredData.ts), as JSON in the page: nothing is loaded for it. */
export default function StructuredData({ data }: { data: object }) {
  // "<" is escaped so no text in the data can close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />
}
