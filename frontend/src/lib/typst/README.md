# Resume PDFs (Typst)

Resumes are compiled to PDF entirely in the browser with [Typst](https://typst.app)
via [typst.ts](https://github.com/Myriad-Dreamin/typst.ts). Nothing is sent to a
server to build a PDF.

- `resumeData.ts` maps the editor's resume data to the JSON the templates read.
  Existing section arrays keep their original shape. The profile's summary is
  `summary`, paragraphs every template prints under "Summary" above the
  sections. Text and list sections a person adds are mapped into `extras`,
  keyed by their `extra:<id>` ordering reference. Empty bodies have no printable descriptor.
  Prose stays literal; custom lists use the existing bold/italic bullet runs.
  `tune` is the editor's Fine-tune settings (`src/lib/tune.ts`), every one
  there: the text size, margins and line spacing as multiples of the
  template's own (1 when unset), the paper ("" for the template's own), and
  whether to keep the resume to one page.
- `compile.ts` is what the UI calls. It runs the compiler in a Web Worker, and
  replaces the worker if it goes quiet with work to do: 30 s while the compiler
  and fonts download (each bit that arrives counts, so slow connections finish),
  20 s once it has loaded, or at once if the compiler breaks. The worker also
  checks in as each slow step starts (building the compiler, each compile), so
  the limit applies to one step at a time. A worker's memory only grows, so
  once its compiler holds over 256 MB it's replaced too, as soon as nothing is
  in flight or waiting, and the new one starts loading at once. Previews compile one at a time:
  while one runs, only the newest waits, and downloads never wait behind them. Failures say why
  (`PdfFailure`), so the page can say what to do. `loadCompiler` starts the
  download before the first PDF: "Start writing" links call it as a mouse
  rests on one or presses it (template pictures only on a press), a moment
  before the click; the editor calls it at once; and the dashboard after a
  second. On a computer, the home page calls `prefetchCompiler` a second
  after it has loaded, which only downloads the compiler, so it's in hand
  when someone starts writing (`src/components/home/PrefetchCompiler.tsx`);
  phones and tablets may be on metered data, so they skip it. Visitors
  saving data only get it once they open a resume. A new worker also opens
  the connection to jsDelivr while its own script loads.
  `compilerStatus` says how much of the compiler has arrived, which the
  preview's stand-in page shows (`src/components/editor/PrintingPage.tsx`).
  Once it all has, the preview fetches pdf.js's worker, which is otherwise
  only downloaded after the first PDF is made.
- `typst.worker.ts` loads the WebAssembly compiler and the templates once, and
  compiles each request. A resume to keep to one page that runs over is
  printed again a step tighter at a time (`fitOnePage` in `src/lib/tune.ts`):
  the space between sections first, then margins and line spacing, and the
  text only after those are at their floors. It counts the pages each time; previews
  and downloads both do it, so they match. What it took comes back with the
  PDF, and `previewFit` tells the Fine-tune panel about the preview's. Before compiling, it downloads the fonts that resume
  needs (see [Fonts](#fonts)), alongside the compiler the first time. Downloads also attach a copy of the resume to the PDF
  (see `src/lib/resumeFile.ts` and `src/lib/import/README.md`).
- `fontFiles.ts` lists the fonts, says which ones a resume needs, and gives
  them to the compiler.
- `templates/*.typ` are the resume templates (the first ones were ported from LaTeX).
  `common.typ` has the shared helpers. They are bundled as strings (see the
  `.typ` rule in `next.config.js`).
  Every template handles `extras` in its order loop with its own section and
  bullet styles. `extra-body` shares only new-kind content formatting;
  paragraphs remain breakable across pages. Omitted
  sections, entries and bullet lines never reach the template data.

## Adding a template

1. Add `templates/<id>.typ`, importing `common.typ` for the data and helpers.
   Set its page through `page-paper` and `page-margin`, its text sizes and the
   spaces around headings and entries through `sized`, the spaces between
   lines through `spaced`, and the space above each section's heading through
   `gapped`, so Fine-tune can change them; add its own text
   size, side margins and paper to `TEMPLATE_SETTINGS` in `src/lib/tune.ts`.
2. Import it in `typst.worker.ts` and add it to `SOURCES`.
3. Add it to `TEMPLATES` in `src/lib/templates.ts` with a picture of its first
   page in `public/previews/<id>.webp` (1280 px wide, from the editor's
   preview), made from its own sample resume in `preview-samples/<id>.json`,
   and its `font`: the family its `#set text(font: ...)` names, which is
   downloaded before its first PDF. A test checks the two match. Name any
   other family it sets words in as `alsoFonts`, and, when it uses only some
   of its family's weights, those as `weights`, so it downloads no more than
   it prints with. If its fonts lack letters a resume may have, like Cyrillic
   or Greek, name a fallback for them (see [Fonts](#fonts)). A template with a
   column of sections on the left names them as `firstColumn`, so the resume
   checker expects them first in the PDF. Every page that lists templates
   reads that list.
4. Write its LaTeX twin in `src/lib/latex/templates/<id>.ts`, for the LaTeX
   download, and add it to `TEMPLATES` in `src/lib/latex/index.ts`; the build
   fails without it. Mirror the `.typ`: its fonts (from TeX Live, working with
   pdfLaTeX and XeLaTeX), sizes, spaces and layout, Fine-tune's through
   `Units`. `src/lib/latex/templates/jake.ts` is the one to start from. When
   you change a template's `.typ`, change its twin too.

Templates can only use the fonts in `fonts/`, listed in `fontFiles.ts`. They're
bundled rather than kept in `public/`, so browsers can cache them for good: each
is served under a name with its content's hash, which changes when the font does.

## Fonts

| Files | Font | Source | License |
| --- | --- | --- | --- |
| `NewCM10-*.otf` | New Computer Modern | [typst-assets](https://github.com/typst/typst-assets) | GUST Font License |
| `Lato-*.ttf` | Lato 2.015 | [TeX Live's `lato`](https://ctan.org/pkg/lato), the same files as [latofonts.com](https://www.latofonts.com/)'s | SIL Open Font License 1.1 |
| `texgyreheros-*.otf` | TeX Gyre Heros | [CTAN](https://ctan.org/pkg/tex-gyre) | GUST Font License |
| `texgyretermes-*.otf` | TeX Gyre Termes | [CTAN](https://ctan.org/pkg/tex-gyre) | GUST Font License |
| `EBGaramond-*.ttf` | EB Garamond | [EBGaramond12](https://github.com/octaviopardo/EBGaramond12) | SIL Open Font License 1.1 |
| `CharisSIL-*.ttf` | Charis SIL | [Google Fonts](https://fonts.google.com/specimen/Charis+SIL) | SIL Open Font License 1.1 |
| `LinBiolinum_R.otf` | Linux Biolinum, as "Linux Biolinum O" | [CTAN](https://ctan.org/pkg/libertine) | SIL Open Font License 1.1, or GPL with the font exception |
| `IBMPlexMono-*.ttf` | IBM Plex Mono | [Google Fonts](https://fonts.google.com/specimen/IBM+Plex+Mono) | SIL Open Font License 1.1 |
| `SourceSans3-*.ttf` | Source Sans 3 | [Google Fonts](https://fonts.google.com/specimen/Source+Sans+3) | SIL Open Font License 1.1 |
| `Raleway-v4020-*.otf` | Raleway, as "Raleway-v4020" | [Raleway v4.020](https://github.com/impallari/Raleway) | SIL Open Font License 1.1 |

The compiler knows every font from the start, from what `fonts/info.json` says
about each (its family, style, which characters it has and a hash of the
file), but only reads a font when it prints with it. So `fontsFor` downloads a
resume's template's families, and, for a character they lack, the fallback the
template names (see below), which Typst tries next. Only for a character the
fallback lacks too, or when the template names none, does it download every
font that has it: Typst picks one of those for that character, as it would with
every font loaded. Either way, resumes print exactly as they would with all of
them. `fontFiles.test.ts` prints each template's sample, and text in many
scripts, both ways, and checks Typst read no font `fontsFor` didn't download.
After adding or changing a font, write `info.json` again:

```bash
UPDATE_FONT_INFO=1 npx vitest run src/lib/typst/fontFiles.test.ts
```

Where a template's fonts lack letters a resume may have, it names a fallback,
last in each of its font lists, so those letters don't come from whichever
font Typst finds, often a serif:

| Template | Its fonts | Fallback | For |
| --- | --- | --- | --- |
| Blueprint, Compact, Swiss | TeX Gyre Heros | Source Sans 3 | Cyrillic, which Heros has none of, and Greek |
| Mono | IBM Plex Mono | Source Sans 3 | Greek. No bundled monospaced font has it, and a sans sits better than a serif in a monospaced page |
| Deedy | Raleway, in roles, dates and places | Lato, its other font | Greek |
| Margin | Charis SIL, and Linux Biolinum in headings | EB Garamond, a serif | Greek |
| zero2sudo | TeX Gyre Termes | EB Garamond, a serif | Cyrillic, which Termes has none of, and Greek |

A font with only some of a script's letters would draw a word from two fonts:
Plex Mono and Raleway have only π of Greek, Charis SIL only the Greek letters
phonetics uses, and Heros's and Termes's Greek has no accented letters and is
spaced for maths. So these leave all of Greek to the fallback, with
`(name: "Charis SIL", covers: regex("\P{Greek}"))` in the font list. Linux
Biolinum has all of Greek, so keeps it. `src/lib/templates.ts` lists the fallback
in `alsoFonts`, with `fallback: true`, the weights the template prints it in,
and the script the others leave to it, as `script: "Greek"`. It's downloaded
only for a resume with a letter it prints. `fontFiles.test.ts` checks each of
a template's font lists ends with its fallback, as `fontsFor` counts on that.

New Computer Modern, TeX Gyre Heros, TeX Gyre Termes and EB Garamond are trimmed copies, keeping
what each has of Latin (with Vietnamese), Greek, Cyrillic, punctuation, currency
and common symbols, with kerning, ligatures, accents and small caps, without
hinting. That halves their size. TeX Gyre Heros and Termes never had Cyrillic,
and their Greek has no accented letters. Each trimmed font says so in its description
(name ID 10), as the GUST Font License asks. The rest are left as they were,
because their licenses reserve their names ("Lato", "Charis" and "SIL", "Plex",
"Source", "Raleway", "Biolinum") for unmodified copies. Raleway comes from its own project rather than Google
Fonts, as the copies Google Fonts serves have no small capitals. Lato is the
one TeX Live ships, which the LaTeX download prints with, rather than Google
Fonts' older Lato, which has no Vietnamese, Greek or Cyrillic. Its lightest
weight here is `Lato-Hairline.ttf`; Lato 2's Thin is a heavier one.

Modern Jake's, Ian's and Deedy were drawn with that older Lato, whose word
spaces are narrower (0.193em, where Lato 2's are 0.22em to 0.29em). So that
resumes made before keep their line breaks, each pins Lato's word spaces with
`spacing` in its `#set text`, to the width that best keeps lines breaking where
they did with the old Lato. That's a little over 0.193em, as Lato 2's letters
run a little narrower. Deedy's Raleway keeps its own spaces.

Resumes printed with the trimmed fonts are identical to ones printed with the
originals. To trim a new font the same way, with
[fontTools](https://github.com/fonttools/fonttools) installed:

```bash
pyftsubset FONT --output-file=src/lib/typst/fonts/FONT --no-hinting --notdef-outline \
  --name-IDs='*' --name-languages='*' --name-legacy \
  --layout-features=kern,liga,clig,calt,ccmp,locl,mark,mkmk,rlig,smcp,c2sc \
  --unicodes=U+0000-024F,U+02B0-036F,U+0370-03FF,U+0400-04FF,U+1E00-1EFF,U+2000-206F,U+2070-209F,U+20A0-20CF,U+2100-218F,U+2190-21FF,U+2200-22FF,U+25A0-25FF,U+2713-2717,U+FB00-FB06
```

`--name-legacy` matters: some fonts, like TeX Gyre Heros, only carry the
family name Typst looks for in their older name records.

