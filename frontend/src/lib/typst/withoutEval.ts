// Typst's compiler, and typst.ts around it, make a few functions from source
// text as the compiler starts: the compiler's placeholders for reading files
// and packages, which this app gives it in other ways, and typst.ts's way of
// importing a module in Node. To the browser that's eval, which the site's
// Content-Security-Policy refuses (next.config.js), and the compiler wouldn't
// start. So the Typst worker swaps Function for one that makes these as plain
// functions. Any other source text still goes to the real Function, and to the
// policy. withoutEval.test.ts starts the compiler with no eval at all, so an
// update that makes another one fails there.

// Each function by its source text, after its parameters' names, a line each,
// as the Function constructor takes them.
const MADE = new Map<string, (...args: never[]) => unknown>([
  ["return 0", () => 0],
  ["return true", () => true],
  ["path\nreturn path", (path: unknown) => path],
  [
    "throw new Error('Dummy AccessModel, please initialize compiler with withAccessModel()')",
    () => {
      throw new Error("Dummy AccessModel, please initialize compiler with withAccessModel()")
    },
  ],
  [
    "throw new Error('Dummy Registry, please initialize compiler with withPackageRegistry()')",
    () => {
      throw new Error("Dummy Registry, please initialize compiler with withPackageRegistry()")
    },
  ],
  // Only called in Node, which has no fetch to load fonts with.
  ["m\nreturn import(m)", () => Promise.reject(new Error("typst.ts only imports modules this way in Node"))],
])

/** `real`, except that the functions above are made without it. */
export function functionWithoutEval(real: FunctionConstructor): FunctionConstructor {
  const made = (args: unknown[]) => MADE.get(args.join("\n"))
  return new Proxy(real, {
    apply: (target, self, args: unknown[]) => made(args) ?? Reflect.apply(target, self, args),
    construct: (target, args: unknown[], newTarget) => made(args) ?? Reflect.construct(target, args, newTarget),
  })
}
