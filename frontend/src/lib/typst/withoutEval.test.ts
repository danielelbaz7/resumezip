import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { CompileFormatEnum, createTypstCompiler } from "@myriaddreamin/typst.ts/compiler"
import { loadFonts } from "@myriaddreamin/typst.ts/options.init"
import { expect, test } from "vitest"
import { lazyFonts } from "./fontFiles"
import { toTemplateData } from "./resumeData"
import { functionWithoutEval } from "./withoutEval"

const TYPST = path.resolve("src/lib/typst")
const WASM = path.resolve("node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm")

// What the site's Content-Security-Policy leaves of eval: nothing.
const refuse = () => {
  throw new EvalError("Refused to evaluate a string as JavaScript")
}
const refusing = new Proxy(Function, { apply: refuse, construct: refuse })

test("the PDF engine starts and prints a resume without eval, as the Typst worker starts it", async () => {
  const { Function: real, eval: realEval } = globalThis
  globalThis.Function = functionWithoutEval(refusing)
  globalThis.eval = refuse
  try {
    // As typst.worker.ts does.
    const compiler = createTypstCompiler()
    await compiler.init({
      getModule: () => readFileSync(WASM),
      beforeBuild: [
        loadFonts(
          lazyFonts((file) => new Uint8Array(readFileSync(path.join(TYPST, "fonts", file)))),
          { assets: false },
        ),
      ],
    })
    for (const file of readdirSync(path.join(TYPST, "templates"))) {
      compiler.addSource(`/${file}`, readFileSync(path.join(TYPST, "templates", file), "utf8"))
    }
    const sample = JSON.parse(readFileSync(path.join(TYPST, "preview-samples", "jake.json"), "utf8"))
    compiler.mapShadow("/resume.json", new TextEncoder().encode(JSON.stringify(toTemplateData(sample))))
    const { result, diagnostics } = await compiler.compile({
      mainFilePath: "/jake.typ",
      format: CompileFormatEnum.pdf,
      diagnostics: "unix",
    })
    if (!result) throw new Error(diagnostics?.join("\n") || "Typst produced no output")
    expect(new TextDecoder().decode(result.subarray(0, 5))).toBe("%PDF-")
  } finally {
    globalThis.Function = real
    globalThis.eval = realEval
  }
})
