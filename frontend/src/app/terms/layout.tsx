import type React from "react"
import type { Metadata } from "next"

// The page is a client component, so its tab title and description are set here.
export const metadata: Metadata = {
  title: "Terms & privacy",
  description:
    "resumezip’s terms, privacy policy and FAQ in plain words. Your resume is saved only in your browser, and we don’t store it.",
}

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children
}
