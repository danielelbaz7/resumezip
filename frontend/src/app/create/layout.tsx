import type React from "react"
import type { Metadata } from "next"
import { FormProvider } from "@/context/ResumeContext"

// The app itself, not a page anyone searches for: each visitor's own resumes,
// or an empty editor to a crawler. Every page under /create inherits this.
export const metadata: Metadata = { robots: { index: false } }

// The dashboard and the editor read the saved resumes as they load. Other
// pages read them only when one may be added, by the review's "Fix it in the
// editor" or a link that starts a new resume (components/site/StartWriting.tsx);
// until then, such a link checks that there are some by their keys alone.
export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return <FormProvider>{children}</FormProvider>
}
