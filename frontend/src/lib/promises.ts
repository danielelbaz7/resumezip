/** A page about one thing resumezip promises, for the search that asks for it (components/site/PromisePage.tsx). */
export interface PromiseInfo {
  path: string
  /** Its link's words in the footer and under the other promises. */
  name: string
  /** One line on what it promises, under the other promises' pages. */
  summary: string
}

// Each is linked from the footer and from the end of the others, in this order.
export const PROMISES: readonly PromiseInfo[] = [
  {
    path: "/no-sign-up-resume-builder",
    name: "No sign-up",
    summary: "No account, no email and no card, now or when you download.",
  },
]
