import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { INK_PILL, OUTLINE_PILL } from "@/components/pills"
import SiteFooter from "@/components/site/SiteFooter"
import SiteHeader from "@/components/site/SiteHeader"
import { SHEET } from "@/components/site/sheet"
import { StartWritingLink } from "@/components/site/StartWriting"
import { fontsOf, TEMPLATES, templateBySlug, templatePath, templateSlug } from "@/lib/templates"
import { ABOUT } from "./about"

// A page for each template, built ahead of time; any other address is a 404.
export const dynamicParams = false

export function generateStaticParams() {
  return TEMPLATES.map((template) => ({ template: templateSlug(template) }))
}

interface TemplatePageProps {
  params: Promise<{ template: string }>
}

export async function generateMetadata({ params }: TemplatePageProps): Promise<Metadata> {
  const template = templateBySlug((await params).template)
  if (!template) return {}
  return { title: `${template.name} resume template`, description: ABOUT[template.id].description }
}

// Names in the template list are typed with straight apostrophes; a heading gets the curly one.
const curly = (text: string) => text.replace(/'/g, "’")

const LEDGER_ROW = "flex justify-between gap-6 border-t border-rule py-3"

export default async function TemplatePage({ params }: TemplatePageProps) {
  const template = templateBySlug((await params).template)
  if (!template) notFound()
  const about = ABOUT[template.id]
  const tags: readonly string[] = template.tags

  return (
    <div className="desk flex min-h-screen flex-col">
      <SiteHeader />

      <main className={`${SHEET} flex flex-col gap-16`}>
        <div className="grid gap-10 md:grid-cols-2 md:gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
          <div className="flex flex-col gap-6 md:sticky md:top-28 md:self-start">
            <Link href="/templates" className="label-mono self-start text-ink-2 underline-offset-4 hover:text-ink hover:underline">
              Templates
            </Link>
            <h1 className="text-balance font-serif text-5xl leading-[1.02] tracking-[-0.035em] md:text-[64px] md:leading-[0.98]">
              {curly(template.name)} resume <em className="text-accent">template</em>
            </h1>
            {about.text.map((paragraph) => (
              <p key={paragraph} className="text-pretty text-[17px] leading-relaxed text-ink-2">
                {paragraph}
              </p>
            ))}
            {about.latex && (
              <p className="text-pretty text-[17px] leading-relaxed text-ink-2">
                You don’t need LaTeX or Overleaf: fill in the form and your browser makes the PDF. To keep editing in Overleaf too, download
                a LaTeX file from the editor.
              </p>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <StartWritingLink template={template.id} className={INK_PILL} preloadOnHover>
                Use this template
              </StartWritingLink>
              <Link href="/templates" className={OUTLINE_PILL}>
                See all templates
              </Link>
            </div>

            <dl className="label-mono mt-2 border-b border-rule text-ink-2">
              <div className={LEDGER_ROW}>
                <dt>Set in</dt>
                <dd className="text-right text-ink">{fontsOf(template)[0].family}</dd>
              </div>
              {tags.length > 0 && (
                <div className={LEDGER_ROW}>
                  <dt>Style</dt>
                  <dd className="text-right text-ink">{tags.join(" · ")}</dd>
                </div>
              )}
              <div className={LEDGER_ROW}>
                <dt>Price</dt>
                <dd className="text-right text-ink">Free, no sign-up</dd>
              </div>
            </dl>
            <p className="text-[15px] leading-relaxed text-ink-2">Switch templates any time; your writing stays put.</p>
          </div>

          {/* The template's own picture, made from its sample resume. */}
          <div className="relative aspect-[1280/1656] w-full overflow-hidden bg-sheet shadow-[0_1px_2px_rgb(17_19_24/0.08),0_28px_44px_-22px_rgb(30_40_90/0.5)]">
            <Image
              src={template.image}
              alt={`A sample resume in the ${template.name} template`}
              fill
              priority
              sizes="(min-width: 1024px) 55vw, (min-width: 768px) 50vw, 100vw"
              className="object-cover object-top"
            />
          </div>
        </div>

        <nav aria-labelledby="other-templates" className="flex flex-col gap-5 border-t border-ink pt-6">
          <h2 id="other-templates" className="font-serif text-[28px] leading-[1.15] tracking-[-0.02em] md:text-[32px]">
            Other templates
          </h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-3 text-[17px]">
            {TEMPLATES.filter((other) => other.id !== template.id).map((other) => (
              <li key={other.id}>
                <Link
                  href={templatePath(other)}
                  className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                >
                  {other.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </main>

      <SiteFooter />
    </div>
  )
}
