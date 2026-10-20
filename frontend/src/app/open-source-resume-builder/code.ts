import { REPO_URL } from "@/lib/site"

// The parts of the code the site's pages point to (the open-source page, and
// how the templates read), from the repository's root; a folder's ends in "/".
// code.test.ts checks each is still there, so a move doesn't leave a page
// linking to nothing.
export const CODE = {
  storage: "frontend/src/lib/resumeStorage.ts",
  pdf: "frontend/src/lib/typst/typst.worker.ts",
  sites: "frontend/next.config.js",
  templates: "frontend/src/lib/typst/templates/",
  checks: "frontend/src/lib/check/",
  license: "LICENSE",
  readingTest: "frontend/src/lib/import/readsCleanly.test.ts",
}

/** A file's page on GitHub, or a folder's. */
export const onGitHub = (path: string) => `${REPO_URL}/${path.endsWith("/") ? "tree" : "blob"}/main/${path}`
