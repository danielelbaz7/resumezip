// Files for tests to open, made in memory the way another app would make
// them. Used by the import tests here and the browser tests in e2e/.

import { crc32, deflateRawSync } from "node:zlib"

/**
 * A PDF with a page per list, and a line of text per entry, in Helvetica of
 * `size` points. pdf.js leaves out text that runs off the page, so the more
 * text a page needs, the smaller it has to be.
 */
export function textPdf(pages: string[][], { size = 12 } = {}): Buffer {
  return pdfOf(
    pages.map((lines) => {
      const text = lines.map((line) => `(${line.replace(/[\\()]/g, "\\$&")}) Tj 0 -${(size * 4) / 3} Td`).join(" ")
      return `BT /F1 ${size} Tf 72 720 Td ${text} ET`
    }),
  )
}

/** A PDF of pages drawn by `contents`, each a page's content stream, with Helvetica as /F1. */
export function pdfOf(contents: string[]): Buffer {
  // The catalog, the page list (filled in once the pages are numbered) and the font come first.
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
  const kids: string[] = []
  for (const content of contents) {
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length} 0 R >>`,
    )
    kids.push(`${objects.length} 0 R`)
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${contents.length} >>`

  let pdf = "%PDF-1.4\n"
  const offsets = objects.map((object, index) => {
    const offset = pdf.length
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, "latin1")
}

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const RELATIONSHIPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
// The namespaces Word declares for what a header can hold, text boxes included.
const NAMESPACES = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  `xmlns:r="${RELATIONSHIPS}"`,
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
  'xmlns:v="urn:schemas-microsoft-com:vml"',
].join(" ")

/** A paragraph of plain text, with Word's tab where the text has one. */
const paragraph = (text: string) =>
  `<w:p><w:r>${text
    .split("\t")
    .map((piece) => `<w:t xml:space="preserve">${escapeXml(piece)}</w:t>`)
    .join("<w:tab/>")}</w:r></w:p>`

const relationships = (list: { id: string; type: string; target: string; external?: boolean }[]) =>
  `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
    .map(
      ({ id, type, target, external }) =>
        `<Relationship Id="${id}" Type="${RELATIONSHIPS}/${type}" Target="${escapeXml(target)}"${external ? ' TargetMode="External"' : ""}/>`,
    )
    .join("")}</Relationships>`

/** A page header or footer: a paragraph per entry, or the XML inside it as it is. */
type HeaderOrFooter = string[] | string

/** Headers or footers by the pages they're on. Only a file with `titlePage` sets "first" on its first page. */
type ByPage = Partial<Record<"default" | "first" | "even", HeaderOrFooter>>

/**
 * A Word (.docx) file with a paragraph per entry. `padding` adds that many
 * spaces to its XML, which zip squeezes down to almost nothing: a small file
 * that unzips to a lot. `header` and `footer` are set at the top and bottom
 * of its pages, and their links go to `links`, by relationship ID.
 */
export function wordFile(
  paragraphs: string[],
  {
    padding = 0,
    header = {},
    footer = {},
    titlePage = false,
    links = {},
  }: { padding?: number; header?: ByPage; footer?: ByPage; titlePage?: boolean; links?: Record<string, string> } = {},
): Buffer {
  // Each header and footer is a part of its own, which the document's section names.
  const parts = (["header", "footer"] as const).flatMap((kind) =>
    Object.entries(kind === "header" ? header : footer).map(([type, content], index) => {
      const root = kind === "header" ? "w:hdr" : "w:ftr"
      const inside = typeof content === "string" ? content : content.map(paragraph).join("")
      return { kind, type, id: `${kind}-${type}`, name: `${kind}${index + 1}.xml`, xml: `${XML}<${root} ${NAMESPACES}>${inside}</${root}>` }
    }),
  )
  const references = parts.map(({ kind, type, id }) => `<w:${kind}Reference w:type="${type}" r:id="${id}"/>`).join("")
  const section = parts.length || titlePage ? `<w:sectPr>${references}${titlePage ? "<w:titlePg/>" : ""}</w:sectPr>` : ""
  const types = parts
    .map(
      ({ kind, name }) =>
        `<Override PartName="/word/${name}" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.${kind}+xml"/>`,
    )
    .join("")
  const files: Record<string, string> = {
    "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>${types}</Types>`,
    "_rels/.rels": relationships([{ id: "rId1", type: "officeDocument", target: "word/document.xml" }]),
    "word/document.xml": `${XML}<w:document ${NAMESPACES}><w:body>${paragraphs.map(paragraph).join("")}${section}</w:body>${" ".repeat(padding)}</w:document>`,
  }
  if (parts.length)
    files["word/_rels/document.xml.rels"] = relationships(parts.map(({ kind, id, name }) => ({ id, type: kind, target: name })))
  const hyperlinks = Object.entries(links).map(([id, target]) => ({ id, type: "hyperlink", target, external: true }))
  for (const { name, xml } of parts) {
    files[`word/${name}`] = xml
    if (hyperlinks.length) files[`word/_rels/${name}.rels`] = relationships(hyperlinks)
  }
  return zip(files)
}

/** A zip file holding `files`, compressed. */
function zip(files: Record<string, string>): Buffer {
  const entries: Buffer[] = []
  const directory: Buffer[] = []
  let offset = 0
  for (const [path, text] of Object.entries(files)) {
    const name = Buffer.from(path)
    const data = Buffer.from(text)
    const packed = deflateRawSync(data)
    // Both headers share these fields: version 2.0, no flags, deflated, no date, then the sizes.
    const fields = Buffer.alloc(26)
    fields.writeUInt16LE(20, 0)
    fields.writeUInt16LE(8, 4)
    fields.writeUInt32LE(crc32(data), 10)
    fields.writeUInt32LE(packed.length, 14)
    fields.writeUInt32LE(data.length, 18)
    fields.writeUInt16LE(name.length, 22)

    const local = Buffer.alloc(4)
    local.writeUInt32LE(0x04034b50)
    entries.push(local, fields, name, packed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    fields.copy(central, 6)
    central.writeUInt32LE(offset, 42)
    directory.push(central, name)
    offset += 30 + name.length + packed.length
  }

  const list = Buffer.concat(directory)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(list.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...entries, list, end])
}
