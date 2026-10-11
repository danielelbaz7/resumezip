import type React from "react"
import type { Metadata } from "next"
import { FormProvider } from "@/context/ResumeContext"

// The app itself, not a page anyone searches for: each visitor's own resumes,
// or an empty editor to a crawler. Every page under /create inherits this.
export const metadata: Metadata = { robots: { index: false } }

// Only the dashboard and the editor read the saved resumes. Other pages'
// links to them check that there are some by their keys alone
// (components/site/StartWriting.tsx).
export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return <FormProvider>{children}</FormProvider>
}
