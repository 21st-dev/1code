export type LocalBrowserUrlErrorCode =
  | "empty"
  | "invalid"
  | "unsupported-scheme"
  | "remote-host"
  | "credentials"

export type LocalBrowserUrlResult =
  | { ok: true; url: string; protocol: "http:" | "https:" | "file:" }
  | { ok: false; code: LocalBrowserUrlErrorCode; message: string }

export type LocalBrowserConsoleLevel = "debug" | "log" | "info" | "warning" | "error"

export interface LocalBrowserConsoleMessage {
  level: LocalBrowserConsoleLevel
  text: string
  source?: string
  line?: number
  timestamp: string
}

export interface LocalBrowserLoadFailure {
  url: string
  reason: string
  code?: number
  timestamp: string
}

export interface LocalBrowserDomSummary {
  title?: string
  url?: string
  activeElement?: string | null
  headings: string[]
  buttons: string[]
  links: string[]
  inputs: string[]
  textSample?: string
}

export interface LocalBrowserCaptureReportInput {
  url: string
  title?: string
  viewport: {
    mode: "desktop" | "mobile"
    width: number
    height: number
    scale: number
  }
  capturedAt: string
  screenshotCaptured: boolean
  note?: string
  selectedElement?: string | null
  domSummary?: LocalBrowserDomSummary | null
  consoleMessages?: LocalBrowserConsoleMessage[]
  loadFailures?: LocalBrowserLoadFailure[]
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])
const MAX_TEXT_LENGTH = 240
const MAX_LIST_ITEMS = 8
const MAX_REPORT_EVENTS = 6

export function normalizeLocalBrowserUrl(input: string): LocalBrowserUrlResult {
  const trimmed = input.trim()
  if (!trimmed) {
    return {
      ok: false,
      code: "empty",
      message: "Enter a localhost, loopback, or file URL.",
    }
  }

  const candidate = withDefaultScheme(trimmed)
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return {
      ok: false,
      code: "invalid",
      message: "Enter a valid local URL.",
    }
  }

  if (url.username || url.password) {
    return {
      ok: false,
      code: "credentials",
      message: "Local previews cannot include embedded credentials.",
    }
  }

  if (url.protocol === "file:") {
    return { ok: true, url: url.href, protocol: "file:" }
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      code: "unsupported-scheme",
      message: "Only local http, https, and file URLs are supported.",
    }
  }

  if (!LOCAL_HOSTS.has(url.hostname)) {
    return {
      ok: false,
      code: "remote-host",
      message: "Local Browser Workbench only opens localhost, 127.0.0.1, [::1], or file URLs.",
    }
  }

  return { ok: true, url: url.href, protocol: url.protocol }
}

export function isAllowedLocalBrowserUrl(input: string): boolean {
  return normalizeLocalBrowserUrl(input).ok
}

export function buildLocalBrowserReport(input: LocalBrowserCaptureReportInput): string {
  const lines: string[] = [
    "Local Browser Workbench report",
    "",
    `URL: ${input.url}`,
    input.title ? `Title: ${boundText(input.title)}` : null,
    `Captured: ${input.capturedAt}`,
    `Viewport: ${input.viewport.mode} ${input.viewport.width}x${input.viewport.height} @ ${input.viewport.scale}%`,
    `Screenshot: ${input.screenshotCaptured ? "captured locally in the workbench" : "not captured"}`,
  ].filter((line): line is string => line !== null)

  if (input.note?.trim()) {
    lines.push("", "User note:", boundText(input.note))
  }

  if (input.selectedElement?.trim()) {
    lines.push("", "Selected element:", boundText(input.selectedElement))
  }

  if (input.domSummary) {
    lines.push("", "DOM summary:")
    appendBoundedList(lines, "Headings", input.domSummary.headings)
    appendBoundedList(lines, "Buttons", input.domSummary.buttons)
    appendBoundedList(lines, "Inputs", input.domSummary.inputs)
    appendBoundedList(lines, "Links", input.domSummary.links)
    if (input.domSummary.activeElement) {
      lines.push(`- Active element: ${boundText(input.domSummary.activeElement)}`)
    }
    if (input.domSummary.textSample) {
      lines.push(`- Text sample: ${boundText(input.domSummary.textSample)}`)
    }
  }

  const consoleMessages = (input.consoleMessages ?? []).slice(-MAX_REPORT_EVENTS)
  if (consoleMessages.length > 0) {
    lines.push("", "Recent console messages:")
    for (const message of consoleMessages) {
      const location = message.source
        ? ` (${message.source}${message.line ? `:${message.line}` : ""})`
        : ""
      lines.push(`- ${message.level}${location}: ${boundText(message.text)}`)
    }
  }

  const failures = (input.loadFailures ?? []).slice(-MAX_REPORT_EVENTS)
  if (failures.length > 0) {
    lines.push("", "Recent load/network failures:")
    for (const failure of failures) {
      const code = typeof failure.code === "number" ? ` [${failure.code}]` : ""
      lines.push(`- ${boundText(failure.url)}${code}: ${boundText(failure.reason)}`)
    }
  }

  return lines.join("\n")
}

export function createLocalBrowserDomSummaryScript(): string {
  return `(() => {
    const textOf = (element) => (element.innerText || element.textContent || element.getAttribute("aria-label") || element.getAttribute("title") || "").replace(/\\s+/g, " ").trim().slice(0, 160);
    const collect = (selector, limit) => Array.from(document.querySelectorAll(selector)).map(textOf).filter(Boolean).slice(0, limit);
    const active = document.activeElement && document.activeElement !== document.body ? textOf(document.activeElement) || document.activeElement.tagName.toLowerCase() : null;
    return {
      title: document.title || "",
      url: location.href,
      activeElement: active,
      headings: collect("h1, h2, h3", 12),
      buttons: collect("button, [role='button']", 12),
      links: Array.from(document.querySelectorAll("a")).map((element) => {
        const label = textOf(element);
        const href = element.getAttribute("href") || "";
        return label ? href ? label + " -> " + href : label : href;
      }).filter(Boolean).slice(0, 12),
      inputs: Array.from(document.querySelectorAll("input, textarea, select")).map((element) => {
        const label = element.getAttribute("aria-label") || element.getAttribute("placeholder") || element.getAttribute("name") || element.id || element.tagName.toLowerCase();
        return String(label).replace(/\\s+/g, " ").trim().slice(0, 160);
      }).filter(Boolean).slice(0, 12),
      textSample: (document.body ? document.body.innerText : "").replace(/\\s+/g, " ").trim().slice(0, 600),
    };
  })()`
}

export function createLocalBrowserClickTrackerScript(): string {
  return `(() => {
    if (window.__LOCUS_LOCAL_BROWSER_CLICK_TRACKER__) return true;
    window.__LOCUS_LOCAL_BROWSER_CLICK_TRACKER__ = true;
    const describe = (node) => {
      const element = node && node.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      if (!element) return null;
      const parts = [element.tagName.toLowerCase()];
      const id = element.getAttribute("id");
      if (id) parts.push("#" + id);
      const testId = element.getAttribute("data-testid");
      if (testId) parts.push("[data-testid='" + testId + "']");
      const role = element.getAttribute("role");
      if (role) parts.push("[role='" + role + "']");
      const label = element.getAttribute("aria-label") || element.getAttribute("title") || element.innerText || element.textContent || "";
      const text = String(label).replace(/\\s+/g, " ").trim().slice(0, 140);
      return text ? parts.join("") + " - " + text : parts.join("");
    };
    document.addEventListener("click", (event) => {
      window.__LOCUS_LAST_CLICKED_ELEMENT__ = describe(event.target);
    }, true);
    return true;
  })()`
}

function withDefaultScheme(input: string): string {
  if (/^\d{2,5}$/.test(input)) return `http://localhost:${input}`
  if (input.startsWith("[::1]") || input.startsWith("localhost") || input.startsWith("127.0.0.1")) {
    return `http://${input}`
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(input)) return input
  return `http://${input}`
}

function appendBoundedList(lines: string[], label: string, values: string[]) {
  if (!values.length) return
  const bounded = values.slice(0, MAX_LIST_ITEMS).map(boundText)
  lines.push(`- ${label}: ${bounded.join(" | ")}`)
}

function boundText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= MAX_TEXT_LENGTH) return normalized
  return `${normalized.slice(0, MAX_TEXT_LENGTH - 1)}...`
}
