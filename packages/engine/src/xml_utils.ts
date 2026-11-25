import { DOMParser, XMLSerializer, type Document, type Element } from "@xmldom/xmldom"
import { strFromU8, strToU8 } from "fflate"

export const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
export const PPR_ORDER = [
  "pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl", "numPr",
  "suppressLineNumbers", "pBdr", "shd", "tabs", "suppressAutoHyphens", "kinsoku", "wordWrap",
  "overflowPunct", "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd",
  "snapToGrid", "spacing", "ind", "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc",
  "textDirection", "textAlignment", "textboxTightWrap", "outlineLvl", "divId", "cnfStyle",
  "rPr", "sectPr", "pPrChange",
]
export const RPR_ORDER = [
  "rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps", "strike", "dstrike",
  "outline", "shadow", "emboss", "imprint", "noProof", "snapToGrid", "vanish", "webHidden",
  "color", "spacing", "w", "kern", "position", "sz", "szCs", "highlight", "u", "effect",
  "bdr", "shd", "fitText", "vertAlign", "rtl", "cs", "em", "lang", "eastAsianLayout",
  "specVanish", "oMath", "rPrChange",
]
export const SECTPR_ORDER = [
  "headerReference", "footerReference", "footnotePr", "endnotePr", "type", "pgSz", "pgMar",
  "paperSrc", "pgBorders", "lnNumType", "pgNumType", "cols", "formProt", "vAlign",
  "noEndnote", "titlePg", "textDirection", "bidi", "rtlGutter", "docGrid", "printerSettings", "sectPrChange",
]

export function parseXml(bytes: Uint8Array) {
  return new DOMParser().parseFromString(strFromU8(bytes), "application/xml")
}

export function xmlBytes(document: Document) {
  return strToU8(new XMLSerializer().serializeToString(document))
}

export function children(parent: Element, name?: string) {
  return Array.from(parent.childNodes).filter((node): node is Element =>
    node.nodeType === 1 && (node as Element).namespaceURI === W &&
    (!name || (node as Element).localName === name))
}

export function insertInSchemaOrder(parent: Element, element: Element, order: string[]) {
  const rank = order.indexOf(element.localName!)
  const next = children(parent).find(child => order.indexOf(child.localName!) > rank)
  const node = element.ownerDocument === parent.ownerDocument
    ? element
    : parent.ownerDocument!.importNode(element, true)
  return parent.insertBefore(node, next ?? null)
}

export function wordElement(document: Document, name: string, attrs: Record<string, string | number> = {}) {
  const element = document.createElementNS(W, "w:" + name)
  for (const [key, value] of Object.entries(attrs)) element.setAttributeNS(W, "w:" + key, String(value))
  return element
}
