import type { Metadata } from "next"
import Link from "next/link"
import SiteFooter from "@/components/site/SiteFooter"
import SiteHeader from "@/components/site/SiteHeader"
import { newTemplate, TEMPLATES } from "@/lib/templates"
import TemplateGallery from "./TemplateGallery"
import { SHEET } from "@/components/site/sheet"

export const metadata: Metadata = {
  title: "Templates",
  description:
    "Free resume templates made for the hiring software (ATS) that reads them. Pick one, write in your browser, and download the PDF.",
}

export default function TemplatesPage() {
  // The page is built ahead of time, so the newest template is marked new until a build after it's no longer new.
  const marked = newTemplate(Date.now())

  return (
    <div className="desk flex min-h-screen flex-col">
      <SiteHeader />

      <main className={`${SHEET} flex flex-col gap-10`}>
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-10">
          <div className="flex flex-col gap-4">
            <span className="label-mono text-ink-2">Templates · {TEMPLATES.length}, all free</span>
            <h1 className="font-serif text-5xl leading-[1.02] tracking-[-0.035em] md:text-[96px] md:leading-[0.95]">
              Pick a <em className="text-accent">template</em>.
            </h1>
          </div>
          <div className="flex max-w-[340px] flex-col gap-2 text-[17px] leading-relaxed text-ink-2 md:items-end md:pb-3 md:text-right">
            <p>Switch any time; your writing stays put.</p>
            <Link
              href="/templates/how-they-read"
              className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink"
            >
              How they read as plain text
            </Link>
          </div>
        </div>

        <TemplateGallery newId={marked?.id} />
      </main>

      <SiteFooter />
    </div>
  )
}
