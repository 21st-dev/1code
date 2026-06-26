import createDOMPurify, { type Config } from "dompurify"

export const MERMAID_SECURITY_LEVEL = "strict" as const

export const MERMAID_SVG_SANITIZE_CONFIG: Config = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ["script", "foreignObject"],
  FORBID_ATTR: [
    "href",
    "xlink:href",
    "onclick",
    "ondblclick",
    "onerror",
    "onfocus",
    "onload",
    "onmousedown",
    "onmouseenter",
    "onmouseleave",
    "onmousemove",
    "onmouseout",
    "onmouseover",
    "onmouseup",
  ],
  ALLOW_DATA_ATTR: false,
  RETURN_TRUSTED_TYPE: false,
}

type DomPurifyInstance = ReturnType<typeof createDOMPurify>

let browserPurifier: DomPurifyInstance | null = null

function isUnsafeMermaidSvgAttribute(attrName: string, attrValue: string) {
  const name = attrName.toLowerCase()
  const normalizedValue = attrValue
    .replace(/[\u0000-\u001f\u007f\s]+/g, "")
    .toLowerCase()

  return (
    name.startsWith("on") ||
    name === "href" ||
    name === "xlink:href" ||
    normalizedValue.startsWith("javascript:")
  )
}

function hardenMermaidSvgAttributes(purifier: DomPurifyInstance) {
  purifier.addHook("uponSanitizeAttribute", (_node, data) => {
    if (isUnsafeMermaidSvgAttribute(data.attrName, data.attrValue)) {
      data.keepAttr = false
    }
  })
}

function removeUnsafeMermaidSvgAttributes(svg: string): string {
  const parser = new window.DOMParser()
  const document = parser.parseFromString(svg, "image/svg+xml")
  const root = document.documentElement

  if (!root || root.nodeName.toLowerCase() === "parsererror") {
    return svg
  }

  for (const element of Array.from(document.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      if (isUnsafeMermaidSvgAttribute(attribute.name, attribute.value)) {
        element.removeAttribute(attribute.name)
      }
    }
  }

  return new window.XMLSerializer().serializeToString(root)
}

function getBrowserPurifier(): DomPurifyInstance {
  if (typeof window === "undefined") {
    throw new Error("Mermaid SVG sanitization requires a browser window")
  }

  if (!browserPurifier) {
    browserPurifier = createDOMPurify(window)
    hardenMermaidSvgAttributes(browserPurifier)
  }

  return browserPurifier
}

export function sanitizeMermaidSvg(svg: string): string {
  const sanitized = getBrowserPurifier().sanitize(
    svg,
    MERMAID_SVG_SANITIZE_CONFIG,
  )
  return removeUnsafeMermaidSvgAttributes(sanitized)
}
