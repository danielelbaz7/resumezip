// The rules a review runs. A PDF reviewed as it came is judged on its own
// printing, so the rule about what resumezip's templates can print (R8: their
// fonts lack some characters) says nothing about it, and is left out.

import type { Rule } from "@/lib/check/engine"
import { RULES } from "@/lib/check/rules"

const ABOUT_THE_TEMPLATES = new Set(["R8"])

export function reviewRules(asIs: boolean): readonly Rule[] {
  return asIs ? RULES.filter((rule) => !ABOUT_THE_TEMPLATES.has(rule.id)) : RULES
}
