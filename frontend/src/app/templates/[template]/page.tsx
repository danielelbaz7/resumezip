import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight, BookOpen, Check, X } from "lucide-react"
import { BLUE_PILL, sheetPill } from "@/components/pills"
import SiteFooter from "@/components/site/SiteFooter"
import SiteHeader from "@/components/site/SiteHeader"
import { PAPER_FRAME } from "@/components/site/sheet"
import { StartWritingLink } from "@/components/site/StartWriting"
import StructuredData from "@/components/site/StructuredData"
import { pageMetadata, SHARE_IMAGE_SIZE } from "@/lib/site"
import { breadcrumbs, TEMPLATES_CRUMB } from "@/lib/structuredData"
import {
  fontsOf,
  printedName,
  type Template,
  TEMPLATES,
  templateBySlug,
  templateImageAlt,
  templatePath,
  templateSlug,
} from "@/lib/templates"
import { checksPassed, READING_CHECKS, READING_RESULTS, WHY_NOT } from "../how-they-read/checks"
import { ABOUT } from "./about"

// A page for each template, built ahead of time; any other address is a 404.
export const dynamicParams = false

export function generateStaticParams() {
  return TEMPLATES.map((template) => ({ template: templateSlug(template) }))
}

interface TemplatePageProps {
  params: Promise<{ template: string }>
}

const titleOf = (template: Template) => `${template.name} resume template`

export async function generateMetadata({ params }: TemplatePageProps): Promise<Metadata> {
  const template = templateBySlug((await params).template)
  if (!template) return {}
  return pageMetadata({
    path: templatePath(template),
    title: titleOf(template),
    description: ABOUT[template.id].description,
    // Drawn by opengraph-image.tsx beside it.
    image: { url: `${templatePath(template)}/opengraph-image`, ...SHARE_IMAGE_SIZE, alt: templateImageAlt(template) },
  })
}

/**
 * A template's own page, on the sheet the templates page is on: its page big
 * on a card, what it's like and Use, which starts a resume with it, how it
 * reads as plain text, and the other templates.
 */
export default async function TemplatePage({ params }: TemplatePageProps) {
  const template = templateBySlug((await params).template)
  if (!template) notFound()
  const about = ABOUT[template.id]
  const tags: readonly string[] = template.tags
  const why = WHY_NOT[template.id]

  return (
    <div className="desk desk-bright flex min-h-screen flex-col">
      <SiteHeader />
      <StructuredData data={breadcrumbs([TEMPLATES_CRUMB, { name: titleOf(template), path: templatePath(template) }])} />

      <div className={PAPER_FRAME}>
        <main className="paper paper-sky flex flex-1 flex-col px-4 pb-10 pt-4 sm:px-6 sm:pt-6 md:px-9 md:pb-12 md:pt-[30px]">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-3 text-[15px]">
              <Link href="/templates" className="group inline-flex items-center gap-3 text-ink-3 hover:text-ink">
                <span className="white-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink">
                  <ArrowLeft className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                Templates
              </Link>
              <span aria-hidden="true" className="text-ink-3">
                /
              </span>
              <span aria-current="page" className="truncate text-ink">
                {template.name}
              </span>
            </nav>
            <div className="flex items-center gap-2.5 max-sm:w-full max-sm:[&>*]:flex-1">
              <Link href="/templates/how-they-read" className={sheetPill("white")}>
                <BookOpen aria-hidden="true" />
                How it reads
              </Link>
              <StartWritingLink template={template.id} className={BLUE_PILL} preloadOnHover>
                Use {template.name}
                <ArrowRight aria-hidden="true" />
              </StartWritingLink>
            </div>
          </div>

          <div className="mt-[30px] grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
            {/* The template's own picture, made from its sample resume. */}
            <div className="tile self-start md:sticky md:top-28">
              <div className="tile-page rounded-[23px] max-sm:rounded-[17px]">
                <Image
                  src={template.image}
                  alt={templateImageAlt(template)}
                  fill
                  priority
                  sizes="(min-width: 1024px) 45vw, (min-width: 768px) 45vw, 100vw"
                  className="object-cover object-top"
                />
              </div>
            </div>

            <div className="flex min-w-0 flex-col md:pt-2">
              <span className="label-mono text-ink-3">{[...tags, "Free"].join(" · ")}</span>
              <h1 className="mt-3.5 text-balance font-serif text-[44px] leading-[1.02] tracking-[-0.035em] sm:text-[56px] lg:text-[64px]">
                {printedName(template)} resume <em className="pr-[0.04em] text-accent">template</em>
              </h1>
              <p className="mt-3 text-[16px] text-ink-3">Set in {fontsOf(template)[0].family} · Letter or A4</p>
              {about.text.map((paragraph) => (
                <p key={paragraph} className="mt-4 max-w-[620px] text-pretty text-[16px] leading-relaxed text-ink-2">
                  {paragraph}
                </p>
              ))}
              {about.latex && (
                <p className="mt-4 max-w-[620px] text-pretty text-[16px] leading-relaxed text-ink-2">
                  You don’t need LaTeX or Overleaf: fill in the form and your browser makes the PDF. To keep editing in Overleaf too,
                  download a LaTeX file from the editor.
                </p>
              )}

              <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
                <StartWritingLink
                  template={template.id}
                  className={sheetPill("blue", "h-[46px] px-[22px] text-[16px] font-medium")}
                  preloadOnHover
                >
                  Use {template.name}
                  <ArrowRight aria-hidden="true" />
                </StartWritingLink>
                <span className="text-[14px] text-ink-3">Switch any time; your writing stays put.</span>
              </div>

              <section aria-labelledby="reads" className="mt-10">
                <div className="flex items-baseline justify-between gap-4 border-b border-hairline pb-3">
                  <h2 id="reads" className="label-mono text-ink-3">
                    How it reads as plain text
                  </h2>
                  <Link
                    href="/templates/how-they-read"
                    className="text-[14px] text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
                  >
                    {checksPassed(template.id).length} of {READING_CHECKS.length} checks
                  </Link>
                </div>
                <ul>
                  {READING_CHECKS.map((check) => {
                    const reads = READING_RESULTS[template.id][check.id].length === 0
                    return (
                      <li key={check.id} className="flex items-center justify-between gap-4 border-b border-hairline py-3 text-[15px]">
                        <span className={reads ? "text-ink-2" : "text-ink"}>{check.name}</span>
                        {reads ? (
                          <span className="shrink-0">
                            <Check className="h-[18px] w-[18px] text-ink" strokeWidth={2.25} aria-hidden="true" />
                            <span className="sr-only">Reads as typed</span>
                          </span>
                        ) : (
                          <span className="shrink-0">
                            <X className="h-[18px] w-[18px] text-ink-3" strokeWidth={2.25} aria-hidden="true" />
                            <span className="sr-only">Doesn’t read as typed</span>
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {why && <p className="mt-3 max-w-[620px] text-pretty text-[14px] leading-relaxed text-ink-3">{why}</p>}
              </section>
            </div>
          </div>

          <nav aria-labelledby="other-templates" className="mt-14 flex flex-col gap-4">
            <h2 id="other-templates" className="label-mono text-ink-3">
              Other templates
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-6">
              {TEMPLATES.filter((other) => other.id !== template.id).map((other) => (
                <li key={other.id} className="min-w-0">
                  <Link href={templatePath(other)} className="tile">
                    <span className="tile-stage">
                      <span className="tile-page block">
                        <Image
                          src={other.image}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 200px, (min-width: 640px) 30vw, 50vw"
                          className="object-cover object-top"
                        />
                      </span>
                    </span>
                    <span className="tile-text truncate px-3.5 py-2.5 text-[14px] font-medium tracking-[-0.01em]">{other.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </main>
      </div>

      <SiteFooter />
    </div>
  )
}
