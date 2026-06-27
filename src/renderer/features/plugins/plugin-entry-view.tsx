"use client"

import type { CSSProperties, KeyboardEvent, ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MessageCircle,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react"
import computerUsePluginIcon from "../../assets/app-icons/computer-use-plugin-icon.png"
import activelyMarketplaceTile from "../../assets/plugin-icons/codex-marketplace-actively.png"
import connectedChromeTile from "../../assets/plugin-icons/codex-connected-chrome.png"
import connectedCodexLabsTile from "../../assets/plugin-icons/codex-connected-codex-labs.png"
import connectedCursorTile from "../../assets/plugin-icons/codex-connected-cursor.png"
import connectedDocsTile from "../../assets/plugin-icons/codex-connected-docs.png"
import connectedGmailTile from "../../assets/plugin-icons/codex-connected-gmail.png"
import connectedHuggingFaceTile from "../../assets/plugin-icons/codex-connected-huggingface.png"
import connectedLinearTile from "../../assets/plugin-icons/codex-connected-linear.png"
import connectedMoreTile from "../../assets/plugin-icons/codex-connected-more.png"
import connectedPluginGridTile from "../../assets/plugin-icons/codex-connected-plugin-grid.png"
import connectedPluginStoreTile from "../../assets/plugin-icons/codex-connected-plugin-store.png"
import connectedPurpleDotsTile from "../../assets/plugin-icons/codex-connected-purple-dots.png"
import connectedSheetsTile from "../../assets/plugin-icons/codex-connected-sheets.png"
import connectedSlidesTile from "../../assets/plugin-icons/codex-connected-slides.png"
import connectedStripedTile from "../../assets/plugin-icons/codex-connected-striped.png"
import pluginDetailGradient from "../../assets/plugin-icons/codex-plugin-detail-gradient.png"
import recordReplayPluginIcon from "../../assets/plugin-icons/codex-record-replay-plugin-icon.png"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { useI18n } from "../../lib/i18n"
import { trpc } from "../../lib/trpc"
import { cn } from "../../lib/utils"
import { PluginAgentSupportPills } from "./plugin-agent-support"
import {
  agentsSidebarOpenAtom,
  desktopViewAtom,
  pendingPluginActionAtom,
  pluginEntryNavigationNonceAtom,
  selectedAgentChatIdAtom,
  selectedDraftIdAtom,
  selectedProjectAtom,
  showNewChatFormAtom,
} from "../agents/atoms"
import { buildPluginDeepLinkUrl } from "../../../shared/plugin-deep-link"
import { generateDraftId, saveNewChatDraft } from "../agents/lib/drafts"
import {
  buildPluginBrowseRoute,
  cancelPluginUninstallRoute,
  closePluginOverlayRoute,
  finishPluginInstallRoute,
  finishPluginUninstallRoute,
  getPluginRouteDialogKind,
  getPluginRouteOrigin,
  getPluginRouteOriginFromState,
  openPluginResourceRoute,
  openPluginDetailRoute,
  requestPluginUninstallRoute,
  serializePluginRouteOrigin,
  serializePluginRouteState,
  startPluginInstallRoute,
  startPluginTryInChatRoute,
  startPluginUninstallRoute,
  type PluginEntryMode,
  type PluginManageTabId,
  type PluginRouteState,
  type PluginTopTabId,
} from "./plugin-route-state"
import {
  BUSINESS_PLUGINS,
  CATALOG_PLUGIN_DETAILS,
  CONNECTED_PLUGINS,
  FEATURED_PLUGINS,
  MARKETPLACE_PLUGINS,
  PRODUCTIVITY_PLUGINS,
  RECOMMENDED_SKILLS,
  buildPluginOnboardingSuggestions,
  findCatalogPluginById,
  findRuntimePluginForCatalog,
  formatRuntimeLabel,
  canRunManagedResourceAction,
  getCatalogPluginDetail,
  getManagedResourceRouteTarget,
  getManagedResourcesForTab,
  getPluginManageTabs,
  getRuntimePluginResourceCount,
  getRuntimeSkillLogo,
  type CatalogPlugin,
  type ConnectedPlugin,
  type ManagedResource,
  type PluginLogoId,
  type PluginOnboardingRoleId,
  type PluginOnboardingRoleSuggestion,
  type RuntimePluginData,
  type RuntimeSkillData,
} from "./plugin-resource-model"
import {
  buildPluginEntrySurfaceRoute,
  coercePluginManageTabForSurface,
  getPluginEntrySurfaceDefaults,
  getPluginEntrySurfaceManageTabIds,
  type PluginEntrySurface,
} from "./plugin-entry-surfaces"

const APP_PROTOCOL = import.meta.env.DEV
  ? "twentyfirst-agents-dev"
  : "twentyfirst-agents"

function getCatalogPluginLink(plugin: CatalogPlugin) {
  return buildPluginDeepLinkUrl({
    pluginId: plugin.id,
    protocol: APP_PROTOCOL,
  })
}

async function writeClipboardText(text: string) {
  if (window.desktopApi?.clipboardWrite) {
    await window.desktopApi.clipboardWrite(text)
    return
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Electron CDP can reject Clipboard API writes when the document is not focused.
      // Fall through to the selection-based copy path used by desktop shells.
    }
  }

  const textArea = document.createElement("textarea")
  textArea.value = text
  textArea.setAttribute("readonly", "true")
  textArea.style.position = "fixed"
  textArea.style.left = "-9999px"
  textArea.style.top = "0"
  document.body.append(textArea)
  textArea.select()

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy command failed")
    }
  } finally {
    textArea.remove()
  }
}

function waitForPluginMutationFrame() {
  return new Promise((resolve) => window.setTimeout(resolve, 450))
}

const CODEX_2026_GOOGLE_LOGO_SVGS: Partial<Record<PluginLogoId, string>> = {
  docs: `<svg width="192" height="192" viewBox="0 0 192 192" fill="none" xmlns="http://www.w3.org/2000/svg"><mask id="google-docs-2026-mask0_37242_8762" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="32" y="8" width="128" height="176"><path d="M130.334 184L61.6 184C52.6565 184 48.1848 184 44.6375 182.596C39.5029 180.563 35.4374 176.497 33.4045 171.362C32 167.815 32 163.343 32 154.4L32 37.6C32 28.6565 32 24.1848 33.4045 20.6375C35.4374 15.5029 39.5029 11.4374 44.6375 9.40447C48.1848 8 52.6565 8 61.6 8L100 8L154.793 62.7933L154.793 62.7934C156.454 64.4543 157.285 65.2848 157.923 66.2239C158.845 67.5811 159.479 69.1131 159.785 70.725C159.997 71.8404 159.997 73.0264 159.995 75.3985C159.96 124.317 159.938 124.799 159.937 154.366C159.937 163.332 159.937 167.816 158.532 171.363C156.499 176.498 152.434 180.562 147.299 182.596C143.752 184 139.279 184 130.334 184Z" fill="#3186FF"/></mask><g mask="url(#google-docs-2026-mask0_37242_8762)"><path d="M159.94 184L31.9999 184L31.9999 8.00001L99.9999 8L159.999 68L159.94 184Z" fill="#3186FF"/><g filter="url(#google-docs-2026-filter0_f_37242_8762)"><path d="M43 192H149V70.2271V20H43V192Z" fill="url(#google-docs-2026-paint0_linear_37242_8762)"/></g></g><path d="M154.995 62.9951C152.489 61.1143 149.375 60 146 60H112.8C105.731 60 100 54.2692 100 47.2002V8L154.995 62.9951Z" fill="#76BBFF"/><rect x="64.001" y="114" width="64" height="12" rx="6" fill="white"/><rect x="64.001" y="143" width="48" height="12" rx="6" fill="white"/><defs><filter id="google-docs-2026-filter0_f_37242_8762" x="31" y="8" width="130" height="196" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur stdDeviation="6" result="effect1_foregroundBlur_37242_8762"/></filter><linearGradient id="google-docs-2026-paint0_linear_37242_8762" x1="96" y1="59.2839" x2="54.6124" y2="171.338" gradientUnits="userSpaceOnUse"><stop offset="0.33" stop-color="#3186FF"/><stop offset="1" stop-color="#A9A8FF"/></linearGradient></defs></svg>`,
  sheets: `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" fill="none" viewBox="0 0 192 192"><path fill="#009954" d="M8 74.6c0-8.943 0-13.415 1.404-16.962a20 20 0 0 1 11.234-11.233C24.185 45 28.656 45 37.6 45h60.8c8.943 0 13.415 0 16.962 1.404a20 20 0 0 1 11.234 11.234C128 61.185 128 65.656 128 74.6v42.8c0 8.943 0 13.415-1.404 16.962a20 20 0 0 1-11.234 11.234C111.815 147 107.343 147 98.4 147H37.6c-8.943 0-13.415 0-16.963-1.404a20 20 0 0 1-11.233-11.234C8 130.815 8 126.343 8 117.4z"/><mask id="google-sheets-2026-a" width="160" height="128" x="24" y="32" maskUnits="userSpaceOnUse" style="mask-type:alpha"><rect width="160" height="128" x="24" y="32" fill="#0ebc5f" rx="20"/></mask><g mask="url(#google-sheets-2026-a)"><path fill="#0ebc5f" d="M24 32h160v128H24z"/><g filter="url(#google-sheets-2026-b)"><rect width="144" height="102" fill="url(#google-sheets-2026-c)" rx="25.6" transform="matrix(1 0 0 -1 8 147)"/></g></g><path stroke="#fff" stroke-linecap="round" stroke-width="12" d="M80 121h84m-20 19V76"/><defs><linearGradient id="google-sheets-2026-c" x1="122.24" x2="20.76" y1="43.31" y2="43.31" gradientUnits="userSpaceOnUse"><stop stop-color="#0ebc5f"/><stop offset=".95" stop-color="#78c9ff"/></linearGradient><filter id="google-sheets-2026-b" width="168" height="126" x="-4" y="33" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_37435_8174" stdDeviation="6"/></filter></defs></svg>`,
  slides: `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" fill="none" viewBox="0 0 192 192"><path fill="url(#google-slides-2026-a)" d="M12.591 63.318c-2.493-15.262 7.858-29.655 23.12-32.148l96.724-15.8c15.262-2.492 29.655 7.859 32.148 23.12l14.732 90.189c2.493 15.262-7.858 29.655-23.12 32.148l-96.724 15.8c-15.262 2.493-29.655-7.858-32.148-23.12z"/><path fill="url(#google-slides-2026-b)" d="M12 61.6c0-8.943 0-13.415 1.405-16.962a20 20 0 0 1 11.233-11.233C28.185 32 32.656 32 41.6 32h108.8c8.943 0 13.415 0 16.962 1.404a20 20 0 0 1 11.234 11.234C180 48.185 180 52.657 180 61.6v68.8c0 8.943 0 13.415-1.404 16.962a20 20 0 0 1-11.234 11.234C163.815 160 159.343 160 150.4 160H41.6c-8.943 0-13.415 0-16.963-1.404a20 20 0 0 1-11.232-11.234C12 143.815 12 139.343 12 130.4z"/><mask id="google-slides-2026-e" width="168" height="128" x="12" y="32" maskUnits="userSpaceOnUse" style="mask-type:alpha"><path fill="#fec700" d="M12 61.6c0-8.943 0-13.415 1.405-16.962a20 20 0 0 1 11.233-11.233C28.185 32 32.656 32 41.6 32h108.8c8.943 0 13.415 0 16.962 1.404a20 20 0 0 1 11.234 11.234C180 48.185 180 52.657 180 61.6v68.8c0 8.943 0 13.415-1.404 16.962a20 20 0 0 1-11.234 11.234C163.815 160 159.343 160 150.4 160H41.6c-8.943 0-13.415 0-16.963-1.404a20 20 0 0 1-11.232-11.234C12 143.815 12 139.343 12 130.4z"/></mask><g filter="url(#google-slides-2026-c)" mask="url(#google-slides-2026-e)"><path fill="#ffbe00" d="m33.74 191.516 144.396-21.58L153.304 3.781 8.907 25.361z"/><path fill="url(#google-slides-2026-f)" d="m33.74 191.516 144.396-21.58L153.304 3.781 8.907 25.361z"/></g><path fill="#fff" fill-rule="evenodd" d="M148 58a6 6 0 0 1 6 6v64a6 6 0 0 1-6 6H44l-.309-.008A6 6 0 0 1 38 128V64a6 6 0 0 1 5.691-5.992L44 58zm-98 64h92V70H50z" clip-rule="evenodd"/><defs><linearGradient id="google-slides-2026-a" x1="84.07" x2="157.2" y1="23.27" y2="160.82" gradientUnits="userSpaceOnUse"><stop offset=".2" stop-color="#ffdb0f"/><stop offset=".67" stop-color="#ffbe00"/><stop offset=".91" stop-color="#ffa8e3"/></linearGradient><linearGradient id="google-slides-2026-b" x1="96" x2="96" y1="32" y2="160" gradientUnits="userSpaceOnUse"><stop stop-color="#ffbe00"/><stop offset="1" stop-color="#fec700"/></linearGradient><linearGradient id="google-slides-2026-f" x1="108.52" x2="83.96" y1="168.16" y2="25.27" gradientUnits="userSpaceOnUse"><stop offset=".07" stop-color="#fff549"/><stop offset=".78" stop-color="#ffbe00" stop-opacity="0"/></linearGradient><filter id="google-slides-2026-c" width="193.23" height="211.73" x="-3.09" y="-8.22" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_37552_9023" stdDeviation="6"/></filter></defs></svg>`,
  gmail: `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" fill="none" viewBox="0 0 192 192"><path fill="url(#gmail-2026-a)" d="M146 44h38v110c0 6.627-5.373 12-12 12h-20a6 6 0 0 1-6-6z"/><path fill="#fc413d" d="M46 44H8v110c0 6.627 5.373 12 12 12h20a6 6 0 0 0 6-6z"/><path fill="url(#gmail-2026-b)" d="M39.226 30.456c-8.033-6.752-20.018-5.714-26.77 2.319-6.752 8.032-5.714 20.017 2.319 26.77l76.078 63.949a8 8 0 0 0 10.295 0l76.078-63.95c8.032-6.752 9.07-18.737 2.318-26.77-6.752-8.032-18.737-9.07-26.769-2.318L96 78.18z"/><defs><linearGradient id="gmail-2026-a" x1="165" x2="165" y1="44" y2="166" gradientUnits="userSpaceOnUse"><stop stop-color="#60d673"/><stop offset=".17" stop-color="#42c868"/><stop offset=".39" stop-color="#0ebc5f"/><stop offset=".62" stop-color="#00a9bb"/><stop offset=".86" stop-color="#3c90ff"/><stop offset="1" stop-color="#3186ff"/></linearGradient><linearGradient id="gmail-2026-b" x1="8" x2="184" y1="46.13" y2="46.13" gradientUnits="userSpaceOnUse"><stop offset=".08" stop-color="#ff63a0"/><stop offset=".3" stop-color="#fc413d"/><stop offset=".5" stop-color="#fc413d"/><stop offset=".65" stop-color="#fc413d"/><stop offset=".72" stop-color="#fc5c30"/><stop offset=".86" stop-color="#feb10c"/><stop offset=".91" stop-color="#fec700"/><stop offset=".96" stop-color="#ffdb0f"/></linearGradient></defs></svg>`,
  calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192" fill="none"><path fill="#bbe2ff" d="M32 36.8C32 20.894 44.894 8 60.8 8h70.4C147.106 8 160 20.894 160 36.8v30.4c0 15.906-12.894 28.8-28.8 28.8H60.8C44.894 96 32 83.106 32 67.2z"/><path fill="#3c90ff" d="M19.867 49.392C17.818 33.82 29.94 20 45.645 20h100.71c15.706 0 27.827 13.82 25.778 29.392L166 96l6.133 46.608C174.182 158.18 162.061 172 146.355 172H45.645c-15.706 0-27.827-13.82-25.778-29.392L26 96z"/><mask id="google-calendar-2026-a" width="154" height="152" x="19" y="20" maskUnits="userSpaceOnUse" style="mask-type:alpha"><path fill="#3c90ff" d="M19.867 49.392C17.818 33.82 29.94 20 45.645 20h100.71c15.706 0 27.827 13.82 25.778 29.392L166 96l6.133 46.608C174.182 158.18 162.061 172 146.355 172H45.645c-15.706 0-27.827-13.82-25.778-29.392L26 96z"/></mask><g mask="url(#google-calendar-2026-a)"><path fill="url(#google-calendar-2026-b)" d="M0 0h166v76H0z" transform="matrix(1 0 0 -1 13 172)"/></g><mask id="google-calendar-2026-c" width="154" height="152" x="19" y="20" maskUnits="userSpaceOnUse" style="mask-type:alpha"><path fill="#3186ff" d="M19.867 49.392C17.818 33.82 29.94 20 45.645 20h100.71c15.706 0 27.827 13.82 25.778 29.392L166 96l6.133 46.608C174.182 158.18 162.061 172 146.355 172H45.645c-15.706 0-27.827-13.82-25.778-29.392L26 96z"/></mask><g mask="url(#google-calendar-2026-c)"><path fill="url(#google-calendar-2026-d)" d="M32 27.2C32 16.596 40.596 8 51.2 8h89.6c10.604 0 19.2 8.596 19.2 19.2V96H32z" filter="url(#google-calendar-2026-e)"/></g><path fill="#fff" d="M75.353 133.336q-6.282 0-10.777-2.043t-7.61-5.465q-3.065-3.474-4.342-6.793T51.603 115a2.07 2.07 0 0 1 1.021-1.124l5.67-2.247q.714-.357 1.43-.102.714.204 1.685 2.349 1.022 2.145 2.86 4.546a14.3 14.3 0 0 0 4.495 3.728q2.606 1.328 6.435 1.328 6.18 0 9.807-3.575 3.677-3.575 3.677-9.091 0-5.976-3.882-9.194-3.881-3.269-10.266-3.269h-5.362a1.9 1.9 0 0 1-1.328-.51q-.51-.562-.511-1.277v-5.465q0-.767.51-1.277a1.82 1.82 0 0 1 1.329-.562h4.647q5.721 0 9.194-3.116t3.473-8.07q0-4.902-3.116-7.916t-8.58-3.014q-3.065 0-5.312 1.022a11.5 11.5 0 0 0-3.882 2.86 22.7 22.7 0 0 0-2.809 3.78q-1.174 1.941-1.89 2.145-.714.153-1.379-.255l-5.363-2.605q-.664-.358-.868-1.124t1.226-3.575q1.481-2.86 4.494-5.823a21 21 0 0 1 7.049-4.597q4.035-1.635 9.398-1.634 9.96 0 15.782 5.26 5.823 5.21 5.823 13.791 0 5.925-2.86 10.266-2.81 4.34-7.968 6.13v.204q6.231 1.838 9.806 6.741 3.627 4.853 3.626 11.594 0 9.654-6.742 15.834-6.74 6.18-17.57 6.18zm51.25-1.175q-.868 0-1.533-.664a2.25 2.25 0 0 1-.612-1.583V73.118l-11.492 8.274q-.614.46-1.431.307a1.96 1.96 0 0 1-1.225-.766l-3.32-4.7a1.98 1.98 0 0 1-.358-1.43q.153-.816.817-1.276l20.379-14.557q.256-.204.562-.306.307-.153.715-.153h4.291q.868 0 1.379.613.562.56.562 1.43v69.36q0 .92-.664 1.583a2 2 0 0 1-1.533.664z"/><defs><linearGradient id="google-calendar-2026-b" x1="83" x2="83" y1="76" gradientUnits="userSpaceOnUse"><stop stop-color="#4fa0ff"/><stop offset="1" stop-color="#3186ff"/></linearGradient><linearGradient id="google-calendar-2026-d" x1="89.06" x2="89.06" y1="21.75" y2="96.39" gradientUnits="userSpaceOnUse"><stop stop-color="#a9a8ff"/><stop offset=".8" stop-color="#3c90ff"/></linearGradient><filter id="google-calendar-2026-e" width="152" height="112" x="20" y="-4" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_37330_7673" stdDeviation="6"/></filter></defs></svg>`,
  drive: `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192" fill="none"><mask id="google-drive-2026-a" width="168" height="154" x="12" y="18" maskUnits="userSpaceOnUse" style="mask-type:alpha"><path fill="#b43333" d="M63.09 37c14.626-25.333 51.193-25.334 65.819 0l45.033 78c14.626 25.334-3.657 57.001-32.91 57.001H50.967c-29.253 0-47.536-31.667-32.91-57.001z"/></mask><g mask="url(#google-drive-2026-a)"><path fill="url(#google-drive-2026-b)" d="M206.905 172.02h-91.888l-19.015-32.934 45.944-79.578z"/><path fill="url(#google-drive-2026-c)" d="M-14.919 172.006 50.04 59.494v.002L31.032 92.422h38.02L115 172.004l-129.918.001z"/><path fill="url(#google-drive-2026-d)" d="M96.007-20.085 141.954 59.5l-19.011 32.928H31.048z"/></g><defs><linearGradient id="google-drive-2026-b" x1="193.6" x2="103.09" y1="165.6" y2="111.21" gradientUnits="userSpaceOnUse"><stop offset=".09" stop-color="#ffe921"/><stop offset="1" stop-color="#fec700"/></linearGradient><linearGradient id="google-drive-2026-c" x1="114.4" x2="15.53" y1="181.61" y2="121.8" gradientUnits="userSpaceOnUse"><stop offset=".15" stop-color="#a9a8ff"/><stop offset=".33" stop-color="#6d97ff"/><stop offset=".48" stop-color="#3186ff"/></linearGradient><linearGradient id="google-drive-2026-d" x1="128.88" x2="28.7" y1="37.88" y2="84.64" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="#0ebc5f"/><stop offset=".85" stop-color="#78c9ff"/></linearGradient></defs></svg>`,
}

const CODEX_2026_GOOGLE_LOGO_DATA_URIS = new Map<PluginLogoId, string>()
const INLINE_GOOGLE_DOCUMENT_LOGOS = new Set<PluginLogoId>(["docs", "sheets", "slides"])
const CODEX_CONNECTED_TILE_IMAGES: Partial<Record<PluginLogoId, string>> = {
  chrome: connectedChromeTile,
  "codex-labs": connectedCodexLabsTile,
  cursor: connectedCursorTile,
  docs: connectedDocsTile,
  gmail: connectedGmailTile,
  huggingface: connectedHuggingFaceTile,
  linear: connectedLinearTile,
  "plugin-grid": connectedPluginGridTile,
  "plugin-store": connectedPluginStoreTile,
  "purple-dots": connectedPurpleDotsTile,
  sheets: connectedSheetsTile,
  slides: connectedSlidesTile,
  striped: connectedStripedTile,
}

function PluginFilterIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path
        d="M1.2 4.2h13.6M3.4 8h9.2M5.6 11.8h4.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="butt"
        strokeWidth="1.2"
      />
    </svg>
  )
}

function getCodex2026GoogleLogoDataUri(id: PluginLogoId) {
  if (INLINE_GOOGLE_DOCUMENT_LOGOS.has(id)) {
    return null
  }

  const cachedLogo = CODEX_2026_GOOGLE_LOGO_DATA_URIS.get(id)
  if (cachedLogo) {
    return cachedLogo
  }

  const source = CODEX_2026_GOOGLE_LOGO_SVGS[id]
  if (!source) {
    return null
  }

  const frame = id === "docs"
    ? { x: 0, y: 0, size: 192 }
    : { x: 24, y: 24, size: 144 }
  const innerLogo = source
    .trim()
    .replace(
      /^<svg\b[^>]*>/u,
      `<svg x="${frame.x}" y="${frame.y}" width="${frame.size}" height="${frame.size}" viewBox="0 0 192 192">`,
    )
  const dataUri = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="#fff"/>${innerLogo}</svg>`,
  )}`
  CODEX_2026_GOOGLE_LOGO_DATA_URIS.set(id, dataUri)
  return dataUri
}

function PluginLogo({ id }: { id: PluginLogoId }) {
  const codex2026GoogleLogo = getCodex2026GoogleLogoDataUri(id)
  if (codex2026GoogleLogo) {
    return (
      <span className={`codex-plugin-logo codex-plugin-logo-${id}`} aria-hidden="true">
        <img className="codex-plugin-logo-image" src={codex2026GoogleLogo} alt="" draggable={false} />
      </span>
    )
  }

  if (id === "github") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-github" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          className="h-[23.55px] w-[23.55px]"
          style={{ transform: "translate(0.1px, -0.1px)" }}
        >
          <path
            d="M12 2.3a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.2-3.4-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.7.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-4.9 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.5 9.5 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.8-2.3 4.6-4.6 4.9.4.3.7.9.7 1.8v2.7c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.3Z"
            fill="currentColor"
          />
        </svg>
      </span>
    )
  }

  if (id === "slack") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-slack" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-[26px] w-[26px]">
          <path d="M8.2 4.3a2 2 0 1 1 4 0v4h-4z" fill="#36C5F0" />
          <path d="M4.3 11.8a2 2 0 1 1 0-4h4v4z" fill="#36C5F0" />
          <path d="M19.7 8.2a2 2 0 1 1 0 4h-4v-4z" fill="#2EB67D" />
          <path d="M11.8 19.7a2 2 0 1 1-4 0v-4h4z" fill="#2EB67D" />
          <path d="M4.3 15.8a2 2 0 1 1 4 0v4h-4z" fill="#E01E5A" />
          <path d="M15.8 4.3a2 2 0 1 1 4 0v4h-4z" fill="#ECB22E" />
          <path d="M19.7 15.8a2 2 0 1 1-4 0v-4h4z" fill="#ECB22E" />
        </svg>
      </span>
    )
  }

  if (id === "gmail") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-gmail" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <rect width="40" height="40" rx="8" fill="#fff" />
          <defs>
            <linearGradient id="codexPluginGmailGreenBlue" x1="29.5" y1="11.5" x2="29.5" y2="30.5">
              <stop stopColor="#60d673" />
              <stop offset="0.46" stopColor="#0ebc5f" />
              <stop offset="1" stopColor="#3186ff" />
            </linearGradient>
            <linearGradient id="codexPluginGmailChevron" x1="8.5" y1="12" x2="31.5" y2="12">
              <stop stopColor="#ff63a0" />
              <stop offset="0.3" stopColor="#fc413d" />
              <stop offset="0.72" stopColor="#fc5c30" />
              <stop offset="1" stopColor="#ffdb0f" />
            </linearGradient>
          </defs>
          <path d="M28 13h6v17.2c0 1.1-.9 2-2 2h-3c-.6 0-1-.4-1-1Z" fill="url(#codexPluginGmailGreenBlue)" />
          <path d="M12 13H6v17.2c0 1.1.9 2 2 2h3c.6 0 1-.4 1-1Z" fill="#fc413d" />
          <path
            d="M10.8 10.8a3.5 3.5 0 0 0-4.5 5.4l12 10.1a2.5 2.5 0 0 0 3.3 0l12.1-10.1a3.5 3.5 0 1 0-4.5-5.4L20 18.2Z"
            fill="url(#codexPluginGmailChevron)"
          />
        </svg>
      </span>
    )
  }

  if (id === "drive") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-drive" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <rect width="40" height="40" rx="8" fill="#fff" />
          <defs>
            <linearGradient id="codexPluginDriveYellow" x1="34" y1="31" x2="21" y2="23">
              <stop stopColor="#ffe921" />
              <stop offset="1" stopColor="#fec700" />
            </linearGradient>
            <linearGradient id="codexPluginDriveBlue" x1="22" y1="32" x2="7" y2="23">
              <stop stopColor="#a9a8ff" />
              <stop offset="0.32" stopColor="#6d97ff" />
              <stop offset="1" stopColor="#3186ff" />
            </linearGradient>
            <linearGradient id="codexPluginDriveGreen" x1="27" y1="10" x2="10" y2="18">
              <stop stopColor="#0ebc5f" />
              <stop offset="1" stopColor="#78c9ff" />
            </linearGradient>
          </defs>
          <path d="M14.8 9.8c2.4-4.2 8.4-4.2 10.8 0l7.4 12.9c2.4 4.1-.6 9.3-5.4 9.3H12.4c-4.8 0-7.8-5.2-5.4-9.3Z" fill="#fff" />
          <path d="M32.8 32H21.3l-3.1-5.4 7.4-13Z" fill="url(#codexPluginDriveYellow)" />
          <path d="M7.2 32 17.7 13.6l-3.1 5.4h6.2L28.2 32Z" fill="url(#codexPluginDriveBlue)" />
          <path d="M20 0 27.5 13.6 24.4 19H14.7Z" transform="translate(0 5.8)" fill="url(#codexPluginDriveGreen)" />
        </svg>
      </span>
    )
  }

  if (id === "docs") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-docs" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <rect width="40" height="40" rx="8" fill="#fff" />
          <defs>
            <linearGradient id="codexPluginDocsGradient" x1="20" y1="10" x2="11" y2="34">
              <stop offset="0.33" stopColor="#3186ff" />
              <stop offset="1" stopColor="#a9a8ff" />
            </linearGradient>
          </defs>
          <path d="M11.7 8.5h12.1l5.7 5.8v15.9c0 1.6-.9 2.5-2.5 2.5H11.7c-1.6 0-2.5-.9-2.5-2.5V11c0-1.6.9-2.5 2.5-2.5Z" fill="url(#codexPluginDocsGradient)" />
          <path d="M23.8 8.5v3.8c0 1.3.8 2.1 2.1 2.1h3.6Z" fill="#76bbff" />
          <path
            d="M14.2 22.4h10.9M14.2 26.7h8.1"
            stroke="#fff"
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
      </span>
    )
  }

  if (id === "sheets") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-sheets" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <rect width="40" height="40" rx="8" fill="#fff" />
          <defs>
            <linearGradient id="codexPluginSheetsGradient" x1="25" y1="10" x2="13" y2="33">
              <stop stopColor="#169f48" />
              <stop offset="1" stopColor="#0b7f3b" />
            </linearGradient>
          </defs>
          <path
            d="M11.7 8.6h12.1l5.7 5.7v15.9c0 1.6-.9 2.5-2.5 2.5H11.7c-1.6 0-2.5-.9-2.5-2.5V11.1c0-1.6.9-2.5 2.5-2.5Z"
            fill="url(#codexPluginSheetsGradient)"
          />
          <path d="M23.8 8.6v3.8c0 1.3.8 2.1 2.1 2.1h3.6Z" fill="#7fd892" />
          <rect x="15" y="18.2" width="11.8" height="10" rx="1" fill="none" stroke="#fff" strokeWidth="1.7" />
          <path
            d="M21 18.3v9.9M15.3 23.2h11.4"
            stroke="#fff"
            strokeWidth="1.7"
          />
        </svg>
      </span>
    )
  }

  if (id === "slides") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-slides" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <rect width="40" height="40" rx="8" fill="#fff" />
          <defs>
            <linearGradient id="codexPluginSlidesBack" x1="25" y1="9" x2="12" y2="34">
              <stop stopColor="#f5b63c" />
              <stop offset="1" stopColor="#d99018" />
            </linearGradient>
          </defs>
          <path
            d="M11.7 8.6h12.1l5.7 5.7v15.9c0 1.6-.9 2.5-2.5 2.5H11.7c-1.6 0-2.5-.9-2.5-2.5V11.1c0-1.6.9-2.5 2.5-2.5Z"
            fill="url(#codexPluginSlidesBack)"
          />
          <path d="M23.8 8.6v3.8c0 1.3.8 2.1 2.1 2.1h3.6Z" fill="#ffd27a" />
          <rect
            x="15.1"
            y="19"
            width="11.8"
            height="8"
            rx="1.3"
            fill="none"
            stroke="#fff"
            strokeWidth="1.8"
          />
        </svg>
      </span>
    )
  }

  if (id === "chrome") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-chrome" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-[26px] w-[26px]">
          <path
            d="M12 2.5a9.5 9.5 0 0 1 8.3 4.9H12a4.7 4.7 0 0 0-4.1 2.4L5.4 5.4A9.5 9.5 0 0 1 12 2.5Z"
            fill="#EA4335"
          />
          <path
            d="M3.7 7.4 8 14.8a4.7 4.7 0 0 1-.8-2.8c0-.8.2-1.6.6-2.3L5.4 5.4a9.5 9.5 0 0 0-1.7 2Z"
            fill="#FBBC05"
          />
          <path
            d="M12 21.5a9.5 9.5 0 0 1-8.3-14.1L8 14.8a4.8 4.8 0 0 0 4 2h.1l-2.5 4.3c.8.3 1.6.4 2.4.4Z"
            fill="#34A853"
          />
          <path
            d="M20.3 7.4A9.5 9.5 0 0 1 12 21.5c-.8 0-1.6-.1-2.4-.4l4.2-7.2a4.7 4.7 0 0 0 .1-3.8 4.8 4.8 0 0 0-1.9-2.7Z"
            fill="#4285F4"
          />
          <circle cx="12" cy="12" r="4.4" fill="#fff" />
          <circle cx="12" cy="12" r="2.9" fill="#4285F4" />
          <rect
            x="14.8"
            y="14.8"
            width="7"
            height="6.4"
            rx="1.4"
            fill="#fff"
            stroke="#c7cbd1"
            strokeWidth="0.9"
          />
          <path
            d="M16.9 17.2h2.9M18.4 15.8v2.8"
            stroke="#5f6368"
            strokeLinecap="round"
            strokeWidth="0.9"
          />
        </svg>
      </span>
    )
  }

  if (id === "cursor") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-cursor" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <path
            d="M19.1 29.1h-6.8c-3.7 0-6.3-2.6-6.3-6.3v-9c0-3.7 2.6-6.3 6.3-6.3h15.4c3.7 0 6.3 2.6 6.3 6.3v7.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.75"
          />
          <circle cx="15.3" cy="16.1" r="1.45" fill="currentColor" />
          <path
            d="M20.2 16.1h8.1"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.35"
          />
          <path
            d="M20.8 20.8 34.9 25.8 29.1 27.9 26.5 35 24.1 34 26.7 27.7 20.8 30Z"
            fill="#fff"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
            paintOrder="stroke fill"
          />
        </svg>
      </span>
    )
  }

  if (id === "linear") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-linear" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <defs>
            <linearGradient id="codexPluginLinearBg" x1="6" y1="36" x2="34" y2="5">
              <stop stopColor="#f2b6ee" />
              <stop offset="0.38" stopColor="#a5c7ff" />
              <stop offset="1" stopColor="#65aefa" />
            </linearGradient>
            <linearGradient id="codexPluginLinearBar" x1="14" y1="30" x2="28" y2="11">
              <stop stopColor="#dff1ff" />
              <stop offset="1" stopColor="#ffffff" />
            </linearGradient>
          </defs>
          <rect width="40" height="40" rx="8" fill="url(#codexPluginLinearBg)" />
          <rect x="12.2" y="21.2" width="4.4" height="8.8" rx="1.2" fill="#eef8ff" />
          <rect x="18.3" y="15.4" width="4.4" height="14.6" rx="1.2" fill="url(#codexPluginLinearBar)" />
          <rect x="24.4" y="9.8" width="4.4" height="20.2" rx="1.2" fill="#ffffff" />
        </svg>
      </span>
    )
  }

  if (id === "codex-labs") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-codex-labs" aria-hidden="true">
        <img className="codex-plugin-logo-image" src={computerUsePluginIcon} alt="" draggable={false} />
      </span>
    )
  }

  if (id === "record-replay") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-record-replay" aria-hidden="true">
        <img className="codex-plugin-logo-image" src={recordReplayPluginIcon} alt="" draggable={false} />
      </span>
    )
  }

  if (id === "skill") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-skill" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <path d="M20 4.5 32.6 11.7 20 18.9 7.4 11.7Z" fill="#ffce6c" />
          <path d="M7.4 11.7 20 18.9v16.6L7.4 28.3Z" fill="#ff8f6d" />
          <path d="M32.6 11.7 20 18.9v16.6l12.6-7.2Z" fill="#8a7bff" />
          <path d="M20 4.5 32.6 11.7 20 18.9 7.4 11.7Z" fill="none" stroke="rgb(255 255 255 / 0.35)" strokeWidth="1.2" />
        </svg>
      </span>
    )
  }

  if (id === "purple-dots") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-purple-dots" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <defs>
            <linearGradient id="codexPluginDotsBg" x1="6" y1="34" x2="34" y2="6">
              <stop stopColor="#eebaff" />
              <stop offset="0.45" stopColor="#9c6af5" />
              <stop offset="1" stopColor="#7d5af2" />
            </linearGradient>
            <radialGradient id="codexPluginDotsLeftGlow" cx="0" cy="0" r="1" gradientTransform="matrix(21 -9 8 19 8 29)">
              <stop stopColor="#f4b8ff" stopOpacity="0.62" />
              <stop offset="1" stopColor="#f4b8ff" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="codexPluginDotsGlow" cx="0" cy="0" r="1" gradientTransform="matrix(16 -10 10 16 34 7)">
              <stop stopColor="#ffb3df" stopOpacity="0.9" />
              <stop offset="1" stopColor="#f4a0ff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="40" height="40" rx="8" fill="url(#codexPluginDotsBg)" />
          <rect width="40" height="40" rx="8" fill="url(#codexPluginDotsLeftGlow)" />
          <rect width="40" height="40" rx="8" fill="url(#codexPluginDotsGlow)" />
          <circle cx="31.4" cy="10" r="3.3" fill="#ffb7dc" opacity="0.3" />
          <path
            d="M9.1 23.2c-.7-5.8 4.2-11.5 11.2-12.7 7.5-1.4 13.2 2.8 13.3 8.6.1 5.5-5.3 9.7-11.5 9.9-2.3 3.1-7.3 3.5-9.2.9-1-1.4-.8-3.1.7-4.8-2.7-.1-4.3-.8-4.5-1.9Z"
            fill="#d7c4ff"
            opacity="0.95"
          />
          <circle cx="17.6" cy="19.7" r="1.55" fill="#fff" opacity="0.94" />
          <circle cx="21.4" cy="16.6" r="1.55" fill="#fff" opacity="0.94" />
          <circle cx="26.4" cy="15.8" r="1.7" fill="#fff" opacity="0.96" />
          <circle cx="28" cy="21.1" r="1.65" fill="#fff" opacity="0.94" />
          <circle cx="23.9" cy="25.1" r="1.75" fill="#fff" opacity="0.96" />
        </svg>
      </span>
    )
  }

  if (id === "calendar") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-calendar" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <rect width="40" height="40" rx="8" fill="#fff" />
          <defs>
            <linearGradient id="codexPluginCalendarBlue" x1="20" y1="25" x2="20" y2="34">
              <stop stopColor="#4fa0ff" />
              <stop offset="1" stopColor="#3186ff" />
            </linearGradient>
            <linearGradient id="codexPluginCalendarTop" x1="20" y1="9" x2="20" y2="25">
              <stop stopColor="#a9a8ff" />
              <stop offset="1" stopColor="#3c90ff" />
            </linearGradient>
          </defs>
          <path d="M10 11.2C10 8.3 12.3 6 15.2 6h9.6c2.9 0 5.2 2.3 5.2 5.2v5.1c0 2.9-2.3 5.2-5.2 5.2h-9.6c-2.9 0-5.2-2.3-5.2-5.2Z" fill="#bbe2ff" />
          <path d="M7.8 13.6C7.4 10.8 9.6 8.2 12.4 8.2h15.2c2.8 0 5 2.6 4.6 5.4L31 21l1.2 8.4c.4 2.8-1.8 5.4-4.6 5.4H12.4c-2.8 0-5-2.6-4.6-5.4L9 21Z" fill="#3c90ff" />
          <path d="M6.5 35h27V21h-27Z" fill="url(#codexPluginCalendarBlue)" />
          <path d="M10 9.2c0-2 1.6-3.6 3.6-3.6h12.8c2 0 3.6 1.6 3.6 3.6V21H10Z" fill="url(#codexPluginCalendarTop)" />
          <path
            d="M14.3 27.1c.4 1.1 1.3 1.8 2.7 1.8 1.8 0 3-.9 3-2.5 0-1.7-1.2-2.6-3.1-2.6h-1.5v-2.1h1.3c1.6 0 2.7-.8 2.7-2.1 0-1.3-1-2.1-2.5-2.1-1.3 0-2.2.6-2.8 1.8l-2.1-1.1c.9-1.9 2.6-2.9 5-2.9 3 0 5 1.6 5 4 0 1.6-.8 2.8-2.3 3.4 1.9.5 3 1.9 3 3.8 0 2.8-2.2 4.6-5.6 4.6-2.8 0-4.7-1.2-5.5-3.3Zm11.5 3.7V19.2l-2.3 1.7-1.1-1.8 4.1-3h2v14.7Z"
            fill="#fff"
            transform="scale(.72) translate(7.6 6.2)"
          />
        </svg>
      </span>
    )
  }

  if (id === "notion") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-notion" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-[25px] w-[25px]">
          <path
            d="M5.2 4.7 16.3 3.9c1.3-.1 2.5.9 2.5 2.3v12.1c0 1.2-.9 2.2-2.1 2.3l-11.1.8c-1.3.1-2.5-.9-2.5-2.3V7c0-1.2.9-2.2 2.1-2.3Z"
            fill="#fff"
            stroke="#111"
            strokeWidth="1.35"
          />
          <path
            d="M7.2 8.2h2.6l4.6 7.2V8.2h2v8.9h-2.5l-4.7-7.2v7.2h-2Z"
            fill="#111"
          />
        </svg>
      </span>
    )
  }

  if (id === "actively") {
    return (
      <span
        className="codex-plugin-logo codex-plugin-logo-reference-tile codex-plugin-logo-actively"
        aria-hidden="true"
      >
        <img
          className="codex-plugin-logo-image"
          src={activelyMarketplaceTile}
          alt=""
          draggable={false}
        />
      </span>
    )
  }

  if (id === "apollo") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-apollo" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-[28px] w-[28px]">
          <path
            d="m12 1.9 1.9 6.6 5.8-3.7-3.7 5.8 6.6 1.4-6.6 1.4 3.7 5.8-5.8-3.7L12 22.1l-1.9-6.6-5.8 3.7 3.7-5.8L1.4 12l6.6-1.4-3.7-5.8 5.8 3.7Z"
            fill="currentColor"
          />
        </svg>
      </span>
    )
  }

  if (id === "salesforce") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-salesforce" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-[27px] w-[27px]">
          <path
            d="M9.2 15.8c-.7.7-1.7 1.1-2.8 1.1A4.4 4.4 0 0 1 6 8.1a5.3 5.3 0 0 1 9.1-2 4.2 4.2 0 0 1 5 4.1c0 2.4-1.9 4.3-4.3 4.3-.5 0-.9-.1-1.3-.2a4.7 4.7 0 0 1-5.3 1.5Z"
            fill="currentColor"
          />
        </svg>
      </span>
    )
  }

  if (id === "hubspot") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-hubspot" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-[27px] w-[27px]">
          <path
            d="M8.2 8.5 12 11.3m4-6.3v4.8m-4 4.2-3.7 2.7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
          />
          <circle cx="16" cy="4.4" r="2.2" fill="currentColor" />
          <circle cx="12" cy="12" r="3.4" fill="currentColor" />
          <circle cx="6.8" cy="7.6" r="2" fill="currentColor" />
          <circle cx="7" cy="18.2" r="2" fill="currentColor" />
        </svg>
      </span>
    )
  }

  if (id === "huggingface") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-huggingface" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <rect width="40" height="40" rx="8" fill="#ffd21e" />
          <path
            d="M9.5 24.5c-2.4.3-4.5-1.4-4.8-3.9-.2-1.9.7-3.6 2.1-4.3 1.2 2.3 2.9 4.3 5.1 5.8-.5 1.3-1.3 2.1-2.4 2.4Z"
            fill="#f5a400"
          />
          <path
            d="M30.5 24.5c2.4.3 4.5-1.4 4.8-3.9.2-1.9-.7-3.6-2.1-4.3-1.2 2.3-2.9 4.3-5.1 5.8.5 1.3 1.3 2.1 2.4 2.4Z"
            fill="#f5a400"
          />
          <path
            d="M10.2 19.7c0-6.2 4.3-10.9 9.8-10.9s9.8 4.7 9.8 10.9c0 6.4-4.2 10.7-9.8 10.7s-9.8-4.3-9.8-10.7Z"
            fill="#ffd21e"
          />
          <circle cx="16.1" cy="18.3" r="2" fill="#6b3f00" />
          <circle cx="23.9" cy="18.3" r="2" fill="#6b3f00" />
          <path
            d="M15.4 23.3c1.4 1.7 2.9 2.5 4.6 2.5s3.2-.8 4.6-2.5"
            fill="none"
            stroke="#6b3f00"
            strokeLinecap="round"
            strokeWidth="2.2"
          />
        </svg>
      </span>
    )
  }

  if (id === "plugin-store") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-plugin-store" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <rect width="40" height="40" rx="8" fill="#0f8f4d" />
          <rect x="8.2" y="13.8" width="23.6" height="14.7" rx="2.8" fill="#dff6e6" />
          <path
            d="M9.6 12.1h20.8l2 5.5H7.6Z"
            fill="#ffffff"
          />
          <path
            d="M11 12.1h4.2v5.5H9Zm7 0h4.1v5.5H18Zm6.9 0H29l2 5.5h-6.1Z"
            fill="#77c98e"
            opacity="0.88"
          />
          <path
            d="M8.5 17.1c1.2 1.7 3.8 1.7 5 0 1.3 1.7 3.9 1.7 5.1 0 1.3 1.7 3.9 1.7 5.2 0 1.2 1.7 3.8 1.7 5 0 1 1.4 2.8 1.6 4.1.6v1.1c0 1.1-.9 2-2 2H9.1c-1.1 0-2-.9-2-2v-1.1c.5.4 1 .5 1.4-.6Z"
            fill="#ffffff"
          />
          <rect x="13" y="22" width="14" height="5.2" rx="1.4" fill="#0f8f4d" opacity="0.86" />
        </svg>
      </span>
    )
  }

  if (id === "striped") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-striped" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <defs>
            <clipPath id="codexPluginStripedMarkClip">
              <rect x="10.2" y="9.2" width="19.6" height="21.6" rx="9.8" />
            </clipPath>
          </defs>
          <rect width="40" height="40" rx="8" fill="#111111" />
          <g clipPath="url(#codexPluginStripedMarkClip)">
            <rect x="10.2" y="9.2" width="19.6" height="21.6" fill="#eeeeee" />
            <path
              d="M5.5 9.2 29.8 33.5M10.2 5.6l24.3 24.3M14.9 2l24.3 24.3M1 13.8l24.3 24.3"
              stroke="#111111"
              strokeWidth="4"
            />
          </g>
          <rect
            x="10.2"
            y="9.2"
            width="19.6"
            height="21.6"
            rx="9.8"
            fill="none"
            stroke="#f2f2f2"
            strokeOpacity="0.35"
            strokeWidth="0.8"
          />
        </svg>
      </span>
    )
  }

  if (id === "plugin-grid") {
    return (
      <span className="codex-plugin-logo codex-plugin-logo-plugin-grid" aria-hidden="true">
        <svg viewBox="0 0 40 40" className="h-full w-full">
          <rect width="40" height="40" rx="8" fill="#ad48f5" />
          <g transform="translate(8 8) scale(1.2)">
            <path
              d="M7.45996 14.375C7.45996 13.3616 6.63844 12.54 5.625 12.54C4.61156 12.54 3.79004 13.3616 3.79004 14.375C3.79004 15.3884 4.61156 16.21 5.625 16.21C6.63844 16.21 7.45996 15.3884 7.45996 14.375ZM16.21 14.375C16.21 13.3616 15.3884 12.54 14.375 12.54C13.3616 12.54 12.54 13.3616 12.54 14.375C12.54 15.3884 13.3616 16.21 14.375 16.21C15.3884 16.21 16.21 15.3884 16.21 14.375ZM7.45996 5.625C7.45996 4.61156 6.63844 3.79004 5.625 3.79004C4.61156 3.79004 3.79004 4.61156 3.79004 5.625C3.79004 6.63844 4.61156 7.45996 5.625 7.45996C6.63844 7.45996 7.45996 6.63844 7.45996 5.625ZM16.21 5.625C16.21 4.61156 15.3884 3.79004 14.375 3.79004C13.3616 3.79004 12.54 4.61156 12.54 5.625C12.54 6.63844 13.3616 7.45996 14.375 7.45996C15.3884 7.45996 16.21 6.63844 16.21 5.625ZM17.54 14.375C17.54 16.123 16.123 17.54 14.375 17.54C12.627 17.54 11.21 16.123 11.21 14.375C11.21 12.627 12.627 11.21 14.375 11.21C16.123 11.21 17.54 12.627 17.54 14.375ZM8.79004 5.625C8.79004 7.37298 7.37298 8.79004 5.625 8.79004C3.87702 8.79004 2.45996 7.37298 2.45996 5.625C2.45996 3.87702 3.87702 2.45996 5.625 2.45996C7.37298 2.45996 8.79004 3.87702 8.79004 5.625ZM17.54 5.625C17.54 7.37298 16.123 8.79004 14.375 8.79004C13.7416 8.79004 13.153 8.60173 12.6582 8.28125L8.28125 12.6582C8.60173 13.153 8.79004 13.7416 8.79004 14.375C8.79004 16.123 7.37298 17.54 5.625 17.54C3.87702 17.54 2.45996 16.123 2.45996 14.375C2.45996 12.627 3.87702 11.21 5.625 11.21C6.25794 11.21 6.84623 11.3977 7.34082 11.7178L11.7178 7.34082C11.3977 6.84623 11.21 6.25794 11.21 5.625C11.21 3.87702 12.627 2.45996 14.375 2.45996C16.123 2.45996 17.54 3.87702 17.54 5.625Z"
              fill="#fff"
            />
          </g>
        </svg>
      </span>
    )
  }

  const label = {
    "codex-labs": "",
    figma: "F",
    "purple-dots": "",
  }[id]

  return (
    <span className={`codex-plugin-logo codex-plugin-logo-${id}`} aria-hidden="true">
      {label}
    </span>
  )
}

function PluginConnectedLogo({ id }: { id: PluginLogoId }) {
  const referenceTile = CODEX_CONNECTED_TILE_IMAGES[id]

  if (referenceTile) {
    return (
      <span
        className={`codex-plugin-logo codex-plugin-logo-reference-tile codex-plugin-logo-${id}`}
        aria-hidden="true"
      >
        <img className="codex-plugin-logo-image" src={referenceTile} alt="" draggable={false} />
      </span>
    )
  }

  return <PluginLogo id={id} />
}

function CatalogPluginRow({
  isInstalled,
  plugin,
  onAdd,
  onOpen,
  onTryInChat,
}: {
  isInstalled?: boolean
  plugin: CatalogPlugin
  onAdd: () => void
  onOpen: () => void
  onTryInChat?: () => void
}) {
  const { t } = useI18n()
  const actionLabel = isInstalled
    ? t("pluginsPage.detail.tryInChat")
    : t("pluginsPage.add")

  return (
    <div
      className="codex-plugin-list-row"
      data-plugin-catalog-id={plugin.id}
      data-plugin-catalog-installed={isInstalled ? "true" : "false"}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <PluginLogo id={plugin.logo} />
      <div className="codex-plugin-row-copy">
        <div className="codex-plugin-row-title">{t(plugin.titleKey)}</div>
        <div className="codex-plugin-row-description">
          {t(plugin.descriptionKey)}
        </div>
        <PluginAgentSupportPills idPrefix={`catalog-${plugin.id}`} compact />
      </div>
      <button
        type="button"
        className="codex-plugin-add-button"
        data-plugin-catalog-action={isInstalled ? "try-in-chat" : "detail"}
        onClick={(event) => {
          event.stopPropagation()
          if (isInstalled && onTryInChat) {
            onTryInChat()
            return
          }
          onAdd()
        }}
      >
        {actionLabel}
      </button>
    </div>
  )
}

function ManagedResourceRow({
  resource,
  onAction,
}: {
  resource: ManagedResource
  onAction?: (resource: ManagedResource) => void
}) {
  const { t } = useI18n()
  const actionTarget = getManagedResourceRouteTarget(resource)
  const actionEnabled = canRunManagedResourceAction(resource)

  return (
    <div
      className="codex-plugin-list-row codex-plugin-manage-list-row"
      data-plugin-resource-action={resource.actionId}
      data-plugin-resource-capabilities={resource.capabilityIds?.join(",") ?? undefined}
      data-plugin-resource-connection-state={resource.connectionState}
      data-plugin-resource-id={resource.id}
      data-plugin-resource-kind={resource.kind}
      data-plugin-resource-target={actionTarget}
    >
      <PluginLogo id={resource.logo} />
      <div className="codex-plugin-row-copy">
        <div className="codex-plugin-row-title">{resource.title}</div>
        <div className="codex-plugin-row-description">
          {t(resource.descriptionKey)}
        </div>
        <PluginAgentSupportPills idPrefix={`resource-${resource.id}`} compact />
      </div>
      <span className="codex-plugin-status-pill">
        {t(resource.statusKey)}
      </span>
      <button
        type="button"
        className="codex-plugin-add-button codex-plugin-row-action"
        data-plugin-resource-action-button={resource.actionId}
        disabled={!actionEnabled}
        onClick={onAction && actionEnabled ? () => onAction(resource) : undefined}
      >
        {t(resource.actionKey)}
      </button>
    </div>
  )
}

function ConnectedPluginRow({ plugin }: { plugin: ConnectedPlugin }) {
  const { t } = useI18n()

  return (
    <div className="codex-plugin-list-row codex-plugin-manage-list-row">
      <PluginLogo id={plugin.logo} />
      <div className="codex-plugin-row-copy">
        <div className="codex-plugin-row-title">{plugin.label}</div>
        <div className="codex-plugin-row-description">
          {t("pluginsPage.manage.connectedDescription")}
        </div>
        <PluginAgentSupportPills idPrefix={`connected-${plugin.id}`} compact />
      </div>
      <span className="codex-plugin-status-pill">
        {t("pluginsPage.status.connected")}
      </span>
      <button
        type="button"
        className="codex-plugin-add-button codex-plugin-row-action"
      >
        {t("pluginsPage.manage")}
      </button>
    </div>
  )
}

function RuntimePluginManageRow({
  catalogPlugin,
  onOpenCatalogPlugin,
  runtimePlugin,
}: {
  catalogPlugin?: CatalogPlugin | null
  onOpenCatalogPlugin?: (plugin: CatalogPlugin) => void
  runtimePlugin: RuntimePluginData
}) {
  const { t } = useI18n()
  const title = catalogPlugin
    ? t(catalogPlugin.titleKey)
    : formatRuntimeLabel(runtimePlugin.name)
  const statusKey = runtimePlugin.isDisabled
    ? "pluginsPage.status.disabled"
    : "pluginsPage.status.enabled"
  const resourceCount = getRuntimePluginResourceCount(runtimePlugin)

  return (
    <div className="codex-plugin-list-row codex-plugin-manage-list-row">
      <PluginLogo id={catalogPlugin?.logo ?? "plugin-store"} />
      <div className="codex-plugin-row-copy">
        <div className="codex-plugin-row-title">{title}</div>
        <div className="codex-plugin-row-description">
          {runtimePlugin.description || t("pluginsPage.resources", { count: resourceCount })}
        </div>
        <PluginAgentSupportPills idPrefix={`runtime-plugin-${runtimePlugin.source}`} compact />
      </div>
      <span
        className="codex-plugin-status-pill codex-plugin-runtime-status-pill"
        data-state={runtimePlugin.isDisabled ? "disabled" : "enabled"}
      >
        {t(statusKey)}
      </span>
      <button
        type="button"
        className="codex-plugin-add-button codex-plugin-row-action"
        onClick={
          catalogPlugin && onOpenCatalogPlugin
            ? () => onOpenCatalogPlugin(catalogPlugin)
            : undefined
        }
      >
        {catalogPlugin && runtimePlugin.isDisabled
          ? t("pluginsPage.add")
          : t("pluginsPage.manage")}
      </button>
    </div>
  )
}

function RuntimeSkillRow({
  catalogPlugin,
  onTryInChat,
  skill,
}: {
  catalogPlugin?: CatalogPlugin | null
  onTryInChat: (skill: RuntimeSkillData) => void
  skill: RuntimeSkillData
}) {
  const { t } = useI18n()
  const title = formatRuntimeLabel(skill.name)
  const description =
    skill.description || skill.path || t("pluginsPage.skills.noDescription")

  return (
    <div
      className="codex-plugin-list-row codex-plugin-manage-list-row"
      data-plugin-runtime-skill="true"
      data-plugin-runtime-skill-action="try-in-chat"
      data-plugin-runtime-skill-path={skill.path}
      data-plugin-runtime-skill-source={skill.source}
    >
      <PluginLogo id={getRuntimeSkillLogo(skill, catalogPlugin)} />
      <div className="codex-plugin-row-copy">
        <div className="codex-plugin-row-title">{title}</div>
        <div className="codex-plugin-row-description">
          {description}
        </div>
        <PluginAgentSupportPills idPrefix={`runtime-skill-${skill.path}`} compact />
      </div>
      <span className="codex-plugin-status-pill">
        {t("pluginsPage.status.enabled")}
      </span>
      <button
        type="button"
        className="codex-plugin-add-button codex-plugin-row-action"
        data-plugin-runtime-skill-action-button="try-in-chat"
        onClick={() => onTryInChat(skill)}
      >
        {t("pluginsPage.skills.try")}
      </button>
    </div>
  )
}

function RuntimeSkillEmptyRow({ isLoading }: { isLoading: boolean }) {
  const { t } = useI18n()

  return (
    <div className="codex-plugin-list-row codex-plugin-empty-list-row">
      <PluginLogo id="plugin-store" />
      <div className="codex-plugin-row-copy">
        <div className="codex-plugin-row-title">
          {isLoading
            ? t("pluginsPage.skills.loading")
            : t("pluginsPage.skills.empty.title")}
        </div>
        <div className="codex-plugin-row-description">
          {isLoading
            ? t("pluginsPage.skills.loadingDescription")
            : t("pluginsPage.skills.empty.description")}
        </div>
      </div>
    </div>
  )
}

function PluginDetailResourceSection({
  disabledItems,
  descriptions,
  id,
  items,
  logo,
  onMcpConfigure,
  onResourceOpen,
  onSkillToggle,
  statusLabel,
  title,
  variant = "default",
}: {
  disabledItems?: ReadonlySet<string>
  descriptions?: Record<string, string>
  id: string
  items: string[]
  logo: PluginLogoId
  onMcpConfigure?: () => void
  onResourceOpen?: (item: string) => void
  onSkillToggle?: (item: string, nextEnabled: boolean) => void
  statusLabel?: string
  title: string
  variant?: "apps" | "default" | "mcps" | "skills"
}) {
  const { t } = useI18n()

  if (items.length === 0) return null

  return (
    <section className="codex-plugin-detail-section codex-plugin-detail-resource-section">
      <div className="codex-plugin-detail-section-title-row">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      <div className="codex-plugin-detail-resource-list">
        {items.map((item) => {
          const description = descriptions?.[item]
          const skillEnabled = !disabledItems?.has(item)
          const resourceCopyProps =
            variant === "skills" && onResourceOpen
              ? {
                  onClick: () => onResourceOpen(item),
                  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    onResourceOpen(item)
                  },
                  role: "button",
                  tabIndex: 0,
                }
              : {}

          return (
            <div
              key={`${id}-${item}`}
              className="codex-plugin-detail-resource-row"
            >
              <PluginLogo id={variant === "skills" ? "skill" : logo} />
              <div
                className="codex-plugin-detail-resource-copy"
                {...resourceCopyProps}
              >
                <div className="codex-plugin-detail-resource-title">{item}</div>
                {description ? (
                  <p>{description}</p>
                ) : null}
              </div>
            {statusLabel ? (
              <span className="codex-plugin-status-pill">{statusLabel}</span>
            ) : variant === "mcps" ? (
              <button
                type="button"
                className="codex-plugin-detail-resource-icon-button"
                aria-label={t("pluginsPage.detail.configureMcp")}
                data-plugin-detail-resource-action="configure-mcp"
                onClick={onMcpConfigure}
              >
                <Settings className="h-4 w-4" />
              </button>
            ) : variant === "skills" ? (
              <button
                type="button"
                className="codex-plugin-detail-resource-toggle"
                aria-checked={skillEnabled}
                aria-label={t(
                  skillEnabled
                    ? "pluginsPage.detail.disableSkill"
                    : "pluginsPage.detail.enableSkill",
                )}
                data-plugin-detail-resource-action="toggle-skill"
                data-state={skillEnabled ? "checked" : "unchecked"}
                onClick={() => onSkillToggle?.(item, !skillEnabled)}
                role="switch"
              >
                <span className="sr-only">
                  {t(
                    skillEnabled
                      ? "pluginsPage.detail.disableSkill"
                      : "pluginsPage.detail.enableSkill",
                  )}
                </span>
                <span
                  className="codex-plugin-detail-resource-toggle-knob"
                  data-state={skillEnabled ? "checked" : "unchecked"}
                  aria-hidden="true"
                />
              </button>
            ) : null}
          </div>
          )
        })}
      </div>
    </section>
  )
}

function PluginDetailInfoRow({
  children,
  label,
  value,
}: {
  children?: ReactNode
  label: string
  value?: string | null
}) {
  if (!children && !value) return null

  return (
    <div className="codex-plugin-detail-info-row">
      <span>{label}</span>
      <strong>{children ?? value}</strong>
    </div>
  )
}

function PluginDetailInfoExternalLink({
  href,
  label,
}: {
  href?: string | null
  label: string
}) {
  if (!href) return null

  return (
    <a
      aria-label={label}
      className="codex-plugin-detail-info-external-link"
      href={href}
    >
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
    </a>
  )
}

function PluginDetailPage({
  copiedLink,
  disabledSkillNames,
  installed,
  installing,
  mutationError,
  onClose,
  onConfigureMcp,
  onCopyLink,
  onOpenSkills,
  onInstall,
  onStartPrompt,
  onToggleSkill,
  onTryInChat,
  onUninstall,
  plugin,
  runtimePlugin,
  uninstalling,
}: {
  copiedLink: boolean
  disabledSkillNames?: ReadonlySet<string>
  installed: boolean
  installing: boolean
  mutationError?: string | null
  onClose: () => void
  onConfigureMcp: () => void
  onCopyLink: () => void
  onOpenSkills: () => void
  onInstall: () => void
  onStartPrompt: (promptKey: string) => void
  onToggleSkill: (skillName: string, nextEnabled: boolean) => void
  onTryInChat: () => void
  onUninstall: () => void
  plugin: CatalogPlugin
  runtimePlugin?: RuntimePluginData | null
  uninstalling: boolean
}) {
  const { t } = useI18n()
  const setSidebarOpen = useSetAtom(agentsSidebarOpenAtom)
  const detail = getCatalogPluginDetail(plugin, runtimePlugin)
  const title = t(plugin.titleKey)
  const promptExampleKeys =
    detail.promptExampleKeys && detail.promptExampleKeys.length > 0
      ? detail.promptExampleKeys
      : [detail.promptKey]
  const longDescription = detail.longDescriptionKey
    ? t(detail.longDescriptionKey)
    : t(plugin.descriptionKey)

  return (
    <section
      aria-labelledby="codex-plugin-detail-heading"
      className="codex-plugin-detail-page"
      data-plugin-detail-id={plugin.id}
      data-plugin-detail-installed={installed ? "true" : "false"}
      data-plugin-detail-installing={installing ? "true" : "false"}
      data-plugin-detail-uninstalling={uninstalling ? "true" : "false"}
    >
      <header className="codex-plugin-detail-shell-header">
        <div className="codex-plugin-detail-shell-nav">
          <button
            type="button"
            className="codex-plugin-detail-shell-button"
            aria-label={t("sidebar.hideSidebar")}
            title={t("sidebar.hideSidebar")}
            onClick={() => setSidebarOpen(false)}
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="codex-plugin-detail-shell-button"
            aria-label={t("common.back")}
            title={t("common.back")}
            onClick={onClose}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="codex-plugin-detail-shell-button"
            aria-label={t("common.forward")}
            title={t("common.forward")}
            disabled
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div
          className="codex-plugin-detail-shell-context"
          data-testid="app-shell-header-context-menu-surface"
        >
          <nav
            aria-label={t("pluginsPage.detail.breadcrumbNavigation")}
            className="codex-plugin-detail-breadcrumb"
          >
            <button type="button" onClick={onClose}>
              {t("pluginsPage.title")}
            </button>
            <span>{title}</span>
          </nav>
        </div>
      </header>

      <div className="codex-plugin-detail-body">
      <div className="codex-plugin-detail-topbar">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="codex-plugin-detail-icon-action"
              aria-label={t("pluginsPage.detail.moreActions")}
              disabled={uninstalling}
              data-plugin-detail-action-button="more-actions"
              data-plugin-detail-copy-state={copiedLink ? "copied" : "idle"}
              title={t("pluginsPage.detail.moreActions")}
            >
              {copiedLink ? (
                <Check className="h-4 w-4" />
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[150px]">
            <DropdownMenuItem onSelect={onCopyLink}>
              {copiedLink
                ? t("pluginsPage.detail.copiedLink")
                : t("pluginsPage.detail.copyLink")}
            </DropdownMenuItem>
            {installed ? (
              <DropdownMenuItem
                disabled={uninstalling}
                onSelect={onUninstall}
              >
                {uninstalling
                  ? t("pluginsPage.detail.removingFromCodex")
                  : t("pluginsPage.detail.removeFromCodex")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          className="codex-plugin-detail-primary"
          disabled={uninstalling || installing}
          data-plugin-detail-action-button={installed ? "try-in-chat" : "install"}
          onClick={
            installed
              ? onTryInChat
              : () => {
                  onInstall()
                }
          }
        >
          {installed ? <MessageCircle className="h-4 w-4" /> : null}
          {installed
            ? t("pluginsPage.detail.tryInChat")
            : installing
              ? t("pluginsPage.detail.addingToCodex")
              : t("pluginsPage.detail.addToCodex")}
        </button>
      </div>

      <div className="codex-plugin-detail-page-hero">
        <PluginLogo id={plugin.logo} />
        <h2 id="codex-plugin-detail-heading">{title}</h2>
        <p>{t(plugin.descriptionKey)}</p>
      </div>

      <div
        className="codex-plugin-detail-prompt-panel"
        style={
          {
            "--codex-plugin-detail-gradient-image": `url(${pluginDetailGradient})`,
          } as CSSProperties
        }
      >
        {promptExampleKeys.map((promptKey) => (
          <button
            key={`${plugin.id}-${promptKey}`}
            type="button"
            aria-label={`${title}${t(promptKey)}`}
            className="codex-plugin-detail-prompt-row"
            data-plugin-detail-prompt-key={promptKey}
            onClick={() => onStartPrompt(promptKey)}
          >
            <span className="codex-plugin-detail-prompt-copy">
              <span className="codex-plugin-detail-prompt-brand">
                <PluginLogo id={plugin.logo} />
                <span>{title}</span>
              </span>
              <strong>{t(promptKey)}</strong>
            </span>
            <span className="codex-plugin-detail-prompt-arrow" aria-hidden="true">
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        ))}
      </div>

      <p className="codex-plugin-detail-description">
        {longDescription}
      </p>

      {mutationError ? (
        <div className="codex-plugin-detail-error" role="alert">
          {mutationError}
        </div>
      ) : null}

      <PluginDetailResourceSection
        descriptions={detail.componentDescriptions?.apps}
        id={`${plugin.id}-apps`}
        items={detail.apps}
        logo={plugin.logo}
        statusLabel={t("pluginsPage.status.connected")}
        title={t("pluginsPage.detail.includes.apps")}
        variant="apps"
      />
      <PluginDetailResourceSection
        descriptions={detail.componentDescriptions?.mcps}
        id={`${plugin.id}-mcps`}
        items={detail.mcps}
        logo={plugin.logo}
        onMcpConfigure={onConfigureMcp}
        title={t("pluginsPage.detail.includes.mcps")}
        variant="mcps"
      />
      <PluginDetailResourceSection
        disabledItems={disabledSkillNames}
        descriptions={detail.componentDescriptions?.skills}
        id={`${plugin.id}-skills`}
        items={detail.skills}
        logo={plugin.logo}
        onResourceOpen={onOpenSkills}
        onSkillToggle={onToggleSkill}
        title={t("pluginsPage.detail.includes.skills")}
        variant="skills"
      />

      <section className="codex-plugin-detail-section codex-plugin-detail-info-section">
        <h3>{t("pluginsPage.detail.info")}</h3>
        <div className="codex-plugin-detail-info-list">
          <PluginDetailInfoRow
            label={t("pluginsPage.detail.developer")}
            value={detail.developer}
          />
          <PluginDetailInfoRow
            label={t("pluginsPage.detail.category")}
            value={detail.category}
          />
          <PluginDetailInfoRow label={t("pluginsPage.detail.website")}>
            <PluginDetailInfoExternalLink
              href={detail.website}
              label={t("pluginsPage.detail.website")}
            />
          </PluginDetailInfoRow>
          <PluginDetailInfoRow
            label={t("pluginsPage.detail.version")}
            value={detail.version}
          />
          <PluginDetailInfoRow label={t("pluginsPage.detail.privacyPolicy")}>
            <PluginDetailInfoExternalLink
              href={detail.privacyPolicy}
              label={t("pluginsPage.detail.privacyPolicy")}
            />
          </PluginDetailInfoRow>
          <PluginDetailInfoRow label={t("pluginsPage.detail.termsOfService")}>
            <PluginDetailInfoExternalLink
              href={detail.termsOfService}
              label={t("pluginsPage.detail.termsOfService")}
            />
          </PluginDetailInfoRow>
        </div>
      </section>

      </div>
    </section>
  )
}

function PluginUninstallDialog({
  mutationError,
  onCancel,
  onConfirm,
  plugin,
  runtimePlugin,
  uninstalling,
}: {
  mutationError?: string | null
  onCancel: () => void
  onConfirm: () => void
  plugin: CatalogPlugin
  runtimePlugin?: RuntimePluginData | null
  uninstalling: boolean
}) {
  const { t } = useI18n()
  const detail = getCatalogPluginDetail(plugin, runtimePlugin)
  const title = t(plugin.titleKey)
  const impactItems = [
    {
      key: "apps",
      label: t("pluginsPage.uninstall.apps"),
      value: detail.apps.join(", "),
    },
    {
      key: "skills",
      label: t("pluginsPage.uninstall.skills"),
      value: detail.skills.join(", "),
    },
    {
      key: "mcps",
      label: t("pluginsPage.uninstall.mcps"),
      value: detail.mcps.join(", "),
    },
  ].filter((item) => item.value.length > 0)

  return (
    <div
      className="codex-plugin-detail-backdrop codex-plugin-uninstall-backdrop"
      onMouseDown={() => {
        if (!uninstalling) onCancel()
      }}
    >
      <section
        aria-labelledby="codex-plugin-uninstall-heading"
        aria-modal="true"
        className="codex-plugin-uninstall-dialog codex-shell-dialog"
        data-plugin-uninstall-id={plugin.id}
        data-plugin-uninstall-status={uninstalling ? "pending" : "confirming"}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="codex-plugin-uninstall-heading">
          <PluginLogo id={plugin.logo} />
          <div>
            <h2 id="codex-plugin-uninstall-heading">
              {t("pluginsPage.uninstall.title", { plugin: title })}
            </h2>
            <p>
              {t("pluginsPage.uninstall.body", { plugin: title })}
            </p>
          </div>
        </div>

        <div className="codex-plugin-uninstall-impact">
          <div className="codex-plugin-uninstall-impact-title">
            {t("pluginsPage.uninstall.impact")}
          </div>
          <div className="codex-plugin-uninstall-impact-list">
            {impactItems.map((item) => (
              <div key={item.key} className="codex-plugin-uninstall-impact-row">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>

        {mutationError ? (
          <div className="codex-plugin-detail-error" role="alert">
            {mutationError}
          </div>
        ) : null}

        <div className="codex-plugin-uninstall-actions">
          <button
            type="button"
            className="codex-plugin-detail-secondary"
            disabled={uninstalling}
            data-plugin-uninstall-action-button="cancel"
            onClick={onCancel}
          >
            {t("pluginsPage.uninstall.cancel")}
          </button>
          <button
            type="button"
            className="codex-plugin-detail-danger"
            disabled={uninstalling}
            data-plugin-uninstall-action-button="confirm"
            onClick={onConfirm}
          >
            {uninstalling
              ? t("pluginsPage.uninstall.removing")
              : t("pluginsPage.uninstall.confirm")}
          </button>
        </div>
      </section>
    </div>
  )
}

interface PluginEntryViewProps {
  ariaLabel?: string
  className?: string
  surface?: PluginEntrySurface
}

function getPluginSurfaceTitleKey(surface: PluginEntrySurface) {
  if (surface === "skills") return "pluginsPage.skills"
  if (surface === "mcp-settings") return "pluginsPage.manage.mcps"
  return "pluginsPage.title"
}

function getPluginSurfaceSubtitleKey(
  surface: PluginEntrySurface,
  entryMode: PluginEntryMode,
) {
  if (surface === "skills") return "pluginsPage.skills.subtitle"
  if (surface === "mcp-settings") return "pluginsPage.mcp.subtitle"
  if (entryMode === "manage") return "pluginsPage.manage.subtitle"
  return "pluginsPage.subtitle"
}

function getPluginSurfaceSearchKey(surface: PluginEntrySurface) {
  if (surface === "skills") return "pluginsPage.skills.search"
  if (surface === "mcp-settings") return "pluginsPage.mcp.search"
  return "pluginsPage.catalogSearch"
}

function getDetailSkillKey(pluginId: string, skillName: string) {
  return `${pluginId}::${skillName}`
}

export function PluginEntryView({
  ariaLabel = "Plugin entry page",
  className,
  surface = "plugins",
}: PluginEntryViewProps) {
  const surfaceDefaults = getPluginEntrySurfaceDefaults(surface)
  const [pageTab, setPageTab] = useState<PluginTopTabId>(
    () => surfaceDefaults.pageTab,
  )
  const [entryMode, setEntryMode] = useState<PluginEntryMode>(
    () => surfaceDefaults.entryMode,
  )
  const [manageTab, setManageTab] = useState<PluginManageTabId>(
    () => surfaceDefaults.manageTab,
  )
  const [pluginRouteState, setPluginRouteState] = useState<PluginRouteState>(
    () => buildPluginEntrySurfaceRoute(surface),
  )
  const [selectedPlugin, setSelectedPlugin] = useState<CatalogPlugin | null>(null)
  const [installedPluginIds, setInstalledPluginIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [installingPluginId, setInstallingPluginId] = useState<string | null>(
    null,
  )
  const [uninstallCandidate, setUninstallCandidate] =
    useState<CatalogPlugin | null>(null)
  const [uninstallingPluginId, setUninstallingPluginId] = useState<
    string | null
  >(null)
  const [pluginMutationError, setPluginMutationError] = useState<string | null>(
    null,
  )
  const [copiedPluginLinkId, setCopiedPluginLinkId] = useState<string | null>(
    null,
  )
  const [disabledDetailSkillKeys, setDisabledDetailSkillKeys] = useState<
    Set<string>
  >(() => new Set())
  const catalogMainRef = useRef<HTMLDivElement | null>(null)
  const [selectedOnboardingRoleId, setSelectedOnboardingRoleId] =
    useState<PluginOnboardingRoleId>("developer")
  const { t } = useI18n()
  const selectedProject = useAtomValue(selectedProjectAtom)
  const pluginEntryNavigationNonce = useAtomValue(pluginEntryNavigationNonceAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSelectedDraftId = useSetAtom(selectedDraftIdAtom)
  const setShowNewChatForm = useSetAtom(showNewChatFormAtom)
  const [pendingPluginAction, setPendingPluginAction] = useAtom(
    pendingPluginActionAtom,
  )
  const {
    data: runtimePlugins = [],
    isFetching: isFetchingRuntimePlugins,
    refetch: refetchRuntimePlugins,
  } = trpc.plugins.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  })
  const {
    data: runtimeSkills = [],
    isFetching: isFetchingRuntimeSkills,
    refetch: refetchRuntimeSkills,
  } = trpc.skills.list.useQuery(
    selectedProject?.path ? { cwd: selectedProject.path } : undefined,
    {
      staleTime: 5 * 60 * 1000,
    },
  )
  const setPluginEnabledMutation =
    trpc.claudeSettings.setPluginEnabled.useMutation()
  const runtimePluginByCatalogId = useMemo(() => {
    const next = new Map<string, RuntimePluginData>()

    for (const plugin of MARKETPLACE_PLUGINS) {
      const runtimePlugin = findRuntimePluginForCatalog(plugin, runtimePlugins)
      if (runtimePlugin) next.set(plugin.id, runtimePlugin)
    }

    return next
  }, [runtimePlugins])
  const catalogPluginByRuntimeSource = useMemo(() => {
    const next = new Map<string, CatalogPlugin>()

    for (const [catalogPluginId, runtimePlugin] of runtimePluginByCatalogId) {
      const catalogPlugin = findCatalogPluginById(catalogPluginId)
      if (catalogPlugin) next.set(runtimePlugin.source, catalogPlugin)
    }

    return next
  }, [runtimePluginByCatalogId])
  const effectiveInstalledPluginIds = useMemo(() => {
    const next = new Set(installedPluginIds)

    for (const plugin of CONNECTED_PLUGINS) {
      next.add(plugin.id)
    }

    for (const [pluginId, runtimePlugin] of runtimePluginByCatalogId) {
      if (!runtimePlugin.isDisabled) next.add(pluginId)
    }

    return next
  }, [installedPluginIds, runtimePluginByCatalogId])
  const selectedPluginRuntimePlugin = selectedPlugin
    ? runtimePluginByCatalogId.get(selectedPlugin.id) ?? null
    : null
  const selectedPluginDisabledSkillNames = useMemo(() => {
    const next = new Set<string>()
    if (!selectedPlugin) return next

    const detail = getCatalogPluginDetail(selectedPlugin, selectedPluginRuntimePlugin)
    for (const skillName of detail.skills) {
      if (disabledDetailSkillKeys.has(getDetailSkillKey(selectedPlugin.id, skillName))) {
        next.add(skillName)
      }
    }
    return next
  }, [disabledDetailSkillKeys, selectedPlugin, selectedPluginRuntimePlugin])
  const uninstallCandidateRuntimePlugin = uninstallCandidate
    ? runtimePluginByCatalogId.get(uninstallCandidate.id) ?? null
    : null
  const pluginManageTabs = useMemo(
    () =>
      getPluginManageTabs({
        runtimePluginCount: runtimePlugins.length,
        runtimeSkillCount: runtimeSkills.length,
      }),
    [runtimePlugins.length, runtimeSkills.length],
  )
  const allowedManageTabIds = useMemo(
    () => getPluginEntrySurfaceManageTabIds(surface),
    [surface],
  )
  const visiblePluginManageTabs = useMemo(
    () => pluginManageTabs.filter((tab) => allowedManageTabIds.includes(tab.id)),
    [allowedManageTabIds, pluginManageTabs],
  )
  const pluginOnboardingSuggestions = useMemo(
    () => buildPluginOnboardingSuggestions(),
    [],
  )
  const selectedOnboardingRole =
    pluginOnboardingSuggestions.find(
      (suggestion) => suggestion.id === selectedOnboardingRoleId,
    ) ?? pluginOnboardingSuggestions[0]
  const isRefreshingRuntime = isFetchingRuntimePlugins || isFetchingRuntimeSkills
  const showOnboardingSuggestions = false

  const resetPluginEntrySurface = useCallback(() => {
    const nextDefaults = getPluginEntrySurfaceDefaults(surface)
    setPageTab(nextDefaults.pageTab)
    setEntryMode(nextDefaults.entryMode)
    setManageTab(nextDefaults.manageTab)
    setSelectedPlugin(null)
    setUninstallCandidate(null)
    setCopiedPluginLinkId(null)
    setPluginMutationError(null)
    setPluginRouteState(buildPluginEntrySurfaceRoute(surface))
  }, [surface])

  useEffect(() => {
    resetPluginEntrySurface()
  }, [resetPluginEntrySurface])

  useEffect(() => {
    resetPluginEntrySurface()
  }, [pluginEntryNavigationNonce, resetPluginEntrySurface])

  useEffect(() => {
    if (
      pluginRouteState.surface !== "detail" &&
      pluginRouteState.surface !== "install" &&
      pluginRouteState.surface !== "uninstall"
    ) {
      setSelectedPlugin(null)
      return
    }

    const plugin = findCatalogPluginById(pluginRouteState.pluginId)
    if (!plugin) return

    setSelectedPlugin((current) =>
      current?.id === plugin.id ? current : plugin,
    )

    if (pluginRouteState.surface === "uninstall") {
      setUninstallCandidate((current) =>
        current?.id === plugin.id ? current : plugin,
      )
    }
  }, [pluginRouteState])

  useEffect(() => {
    if (!selectedPlugin) return
    catalogMainRef.current?.scrollTo({ top: 0 })
  }, [selectedPlugin])

  const openPluginManage = () => {
    const nextManageTab = coercePluginManageTabForSurface(surface, "plugins")
    setPageTab("plugins")
    setEntryMode("manage")
    setManageTab(nextManageTab)
    setPluginRouteState(
      buildPluginBrowseRoute({
        pageTab: "plugins",
        entryMode: "manage",
        manageTab: nextManageTab,
      }),
    )
  }

  const openPluginManageTab = (tab: PluginManageTabId) => {
    const nextManageTab = coercePluginManageTabForSurface(surface, tab)
    setManageTab(nextManageTab)
    setPluginRouteState(
      buildPluginBrowseRoute({
        pageTab: "plugins",
        entryMode: "manage",
        manageTab: nextManageTab,
      }),
    )
  }

  const openPluginTopTab = (tab: PluginTopTabId) => {
    if (tab === "skills") {
      setPageTab("skills")
      setEntryMode("browse")
      setManageTab("skills")
      setPluginRouteState(
        buildPluginBrowseRoute({
          pageTab: "skills",
          entryMode: "browse",
          manageTab: "skills",
        }),
      )
      return
    }

    setPageTab("plugins")
    setEntryMode("browse")
    setManageTab("plugins")
    setPluginRouteState(
      buildPluginBrowseRoute({
        pageTab: "plugins",
        entryMode: "browse",
        manageTab: "plugins",
      }),
    )
  }

  const getActivePluginRouteOrigin = () =>
    getPluginRouteOriginFromState(pluginRouteState)

  const closeCatalogPluginDetail = () => {
    setSelectedPlugin(null)
    setCopiedPluginLinkId(null)
    setPluginMutationError(null)
    setPluginRouteState(closePluginOverlayRoute(pluginRouteState))
  }

  const toggleCatalogPluginSkill = (
    plugin: CatalogPlugin,
    skillName: string,
    nextEnabled: boolean,
  ) => {
    setPluginMutationError(null)
    setDisabledDetailSkillKeys((current) => {
      const next = new Set(current)
      const key = getDetailSkillKey(plugin.id, skillName)
      if (nextEnabled) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const startNewChatWithText = (prompt: string) => {
    const draftId = generateDraftId()
    saveNewChatDraft(draftId, prompt)
    setSelectedChatId(null)
    setSelectedDraftId(draftId)
    setShowNewChatForm(false)
    setDesktopView(null)
  }

  const startNewChatWithPrompt = (promptKey: string) => {
    startNewChatWithText(t(promptKey))
  }

  const startRuntimeSkillChat = (skill: RuntimeSkillData) => {
    startNewChatWithText(
      t("pluginsPage.skills.runtimePrompt", {
        skill: formatRuntimeLabel(skill.name),
      }),
    )
  }

  const startNewSkillChat = () => {
    startNewChatWithPrompt("pluginsPage.skills.createPrompt")
  }

  const startOnboardingRoleChat = (
    role: PluginOnboardingRoleSuggestion,
  ) => {
    setPluginMutationError(null)
    startNewChatWithPrompt(role.starterPromptKey)
  }

  const handleManagedResourceAction = (resource: ManagedResource) => {
    const targetId = getManagedResourceRouteTarget(resource)
    setPluginMutationError(null)
    setPluginRouteState(
      openPluginResourceRoute({
        actionId: resource.actionId,
        origin: getActivePluginRouteOrigin(),
        promptKey: resource.promptKey,
        resourceId: resource.id,
        resourceKind: resource.kind,
        targetId,
      }),
    )

    if (resource.actionId === "try-in-chat" && resource.promptKey) {
      startNewChatWithPrompt(resource.promptKey)
    }
  }

  const openCatalogPluginDetail = (plugin: CatalogPlugin) => {
    setPluginMutationError(null)
    setPluginRouteState(openPluginDetailRoute(plugin.id, getActivePluginRouteOrigin()))
    setSelectedPlugin(plugin)
  }

  useEffect(() => {
    if (!pendingPluginAction) return

    const plugin = findCatalogPluginById(pendingPluginAction.pluginId)
    setPendingPluginAction(null)

    if (!plugin) return

    const origin = getPluginRouteOrigin({
      pageTab: "plugins",
      entryMode: "browse",
      manageTab: "plugins",
    })

    setPluginMutationError(null)
    setCopiedPluginLinkId(null)
    setPageTab("plugins")
    setEntryMode("browse")
    setManageTab("plugins")

    if (pendingPluginAction.action === "try-in-chat") {
      const detail = CATALOG_PLUGIN_DETAILS[plugin.id]
      setSelectedPlugin(null)
      setPluginRouteState(
        startPluginTryInChatRoute(plugin.id, origin, detail.promptKey),
      )
      startNewChatWithPrompt(detail.promptKey)
      return
    }

    setPluginRouteState(
      openPluginDetailRoute(plugin.id, origin),
    )
    setSelectedPlugin(plugin)
  }, [pendingPluginAction, setPendingPluginAction])

  const startCatalogPluginChat = (plugin: CatalogPlugin) => {
    const detail = CATALOG_PLUGIN_DETAILS[plugin.id]
    setPluginRouteState(
      startPluginTryInChatRoute(
        plugin.id,
        getActivePluginRouteOrigin(),
        detail.promptKey,
      ),
    )
    startNewChatWithPrompt(detail.promptKey)
  }

  const installCatalogPlugin = async (plugin: CatalogPlugin) => {
    const title = t(plugin.titleKey)
    const runtimePlugin = runtimePluginByCatalogId.get(plugin.id) ?? null
    const origin = getActivePluginRouteOrigin()
    setPluginMutationError(null)
    setInstallingPluginId(plugin.id)
    setPluginRouteState(startPluginInstallRoute(plugin.id, origin))

    try {
      await waitForPluginMutationFrame()

      if (runtimePlugin) {
        await setPluginEnabledMutation.mutateAsync({
          pluginSource: runtimePlugin.source,
          enabled: true,
        })
        await refetchRuntimePlugins()
      } else {
        setInstalledPluginIds((current) => {
          const next = new Set(current)
          next.add(plugin.id)
          return next
        })
      }
      setPluginRouteState(finishPluginInstallRoute(plugin.id, origin, "success"))
    } catch {
      setPluginMutationError(
        t("pluginsPage.detail.installFailed", { plugin: title }),
      )
      setPluginRouteState(finishPluginInstallRoute(plugin.id, origin, "error"))
    } finally {
      setInstallingPluginId(null)
    }
  }

  const uninstallCatalogPlugin = (plugin: CatalogPlugin) => {
    setPluginMutationError(null)
    setPluginRouteState(
      requestPluginUninstallRoute(plugin.id, getActivePluginRouteOrigin()),
    )
    setUninstallCandidate(plugin)
  }

  const confirmUninstallCatalogPlugin = async (plugin: CatalogPlugin) => {
    const title = t(plugin.titleKey)
    const runtimePlugin = runtimePluginByCatalogId.get(plugin.id) ?? null
    const origin = getActivePluginRouteOrigin()
    setPluginMutationError(null)
    setUninstallingPluginId(plugin.id)
    setPluginRouteState(startPluginUninstallRoute(plugin.id, origin))

    try {
      await waitForPluginMutationFrame()

      if (runtimePlugin) {
        await setPluginEnabledMutation.mutateAsync({
          pluginSource: runtimePlugin.source,
          enabled: false,
        })
        await refetchRuntimePlugins()
      } else {
        setInstalledPluginIds((current) => {
          const next = new Set(current)
          next.delete(plugin.id)
          return next
        })
      }

      setUninstallCandidate(null)
      setPluginRouteState(
        finishPluginUninstallRoute(plugin.id, origin, "success"),
      )
    } catch {
      setPluginMutationError(
        t("pluginsPage.detail.uninstallFailed", { plugin: title }),
      )
      setPluginRouteState(finishPluginUninstallRoute(plugin.id, origin, "error"))
    } finally {
      setUninstallingPluginId(null)
    }
  }

  const copyCatalogPluginLink = async (plugin: CatalogPlugin) => {
    const title = t(plugin.titleKey)
    setPluginMutationError(null)

    try {
      await writeClipboardText(getCatalogPluginLink(plugin))
      setCopiedPluginLinkId(plugin.id)
      window.setTimeout(() => {
        setCopiedPluginLinkId((current) =>
          current === plugin.id ? null : current,
        )
      }, 1600)
    } catch {
      setPluginMutationError(
        t("pluginsPage.detail.copyLinkFailed", { plugin: title }),
      )
    }
  }

  const cancelUninstallCatalogPlugin = () => {
    if (uninstallingPluginId) return
    if (uninstallCandidate) {
      setPluginRouteState(
        cancelPluginUninstallRoute(
          uninstallCandidate.id,
          getActivePluginRouteOrigin(),
        ),
      )
    }
    setPluginMutationError(null)
    setUninstallCandidate(null)
  }

  const isSkillsPage = surface === "skills" || pageTab === "skills"
  const isMcpSettingsPage = surface === "mcp-settings"
  const surfaceTitleKey = getPluginSurfaceTitleKey(surface)
  const surfaceSubtitleKey = getPluginSurfaceSubtitleKey(surface, entryMode)
  const surfaceSearchKey = getPluginSurfaceSearchKey(surface)

  return (
    <div
      aria-label={selectedPlugin ? undefined : ariaLabel}
      className={cn(
        "codex-shell-page codex-plugin-entry-page h-full min-h-0 overflow-hidden bg-background",
        className,
      )}
      data-codex-plugin-surface={surface}
      data-plugin-route-dialog={getPluginRouteDialogKind(pluginRouteState) ?? undefined}
      data-plugin-route-origin={serializePluginRouteOrigin(
        getPluginRouteOriginFromState(pluginRouteState),
      )}
      data-plugin-route-state={serializePluginRouteState(pluginRouteState)}
      data-plugin-route-surface={pluginRouteState.surface}
    >
      {!selectedPlugin ? (
        <header className="codex-plugin-page-toolbar">
          <div
            className="codex-plugin-page-surface-title"
            data-codex-plugin-page-title={surface}
          >
            {t(surfaceTitleKey)}
          </div>
          {!isMcpSettingsPage ? (
            <div className="codex-plugin-mode-tabs" role="tablist" aria-label={t("pluginsPage.modeTabs")}>
              <button
                type="button"
                className="codex-plugin-mode-tab"
                data-active={pageTab === "plugins" ? "true" : "false"}
                data-plugin-mode-tab="plugins"
                role="tab"
                aria-selected={pageTab === "plugins"}
                onClick={() => openPluginTopTab("plugins")}
              >
                {t("pluginsPage.title")}
              </button>
              <button
                type="button"
                className="codex-plugin-mode-tab"
                data-active={pageTab === "skills" ? "true" : "false"}
                data-plugin-mode-tab="skills"
                role="tab"
                aria-selected={pageTab === "skills"}
                onClick={() => openPluginTopTab("skills")}
              >
                {t("pluginsPage.skills")}
              </button>
            </div>
          ) : null}
          <div className="codex-plugin-toolbar-actions">
            {!isMcpSettingsPage ? (
              <button
                type="button"
                className="codex-plugin-toolbar-button codex-plugin-toolbar-add"
                aria-label={isSkillsPage ? t("pluginsPage.skills.createSkill") : t("pluginsPage.add")}
                onClick={isSkillsPage ? startNewSkillChat : openPluginManage}
              >
                <Plus className="h-4 w-4" />
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              className="codex-plugin-toolbar-button"
              aria-label={t("pluginsPage.refresh")}
              aria-busy={isRefreshingRuntime}
              disabled={isRefreshingRuntime}
              onClick={() => {
                void refetchRuntimePlugins()
                void refetchRuntimeSkills()
              }}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </header>
      ) : null}

      <div
        className="codex-plugin-catalog-main"
        data-plugin-catalog-mode={selectedPlugin ? "detail" : "browse"}
        ref={catalogMainRef}
      >
        <main
          className="codex-plugin-catalog-frame"
          data-codex-static-anchors="codex-shell-row codex-shell-input"
        >
          {selectedPlugin ? (
            <PluginDetailPage
              copiedLink={copiedPluginLinkId === selectedPlugin.id}
              disabledSkillNames={selectedPluginDisabledSkillNames}
              installed={effectiveInstalledPluginIds.has(selectedPlugin.id)}
              installing={installingPluginId === selectedPlugin.id}
              mutationError={pluginMutationError}
              plugin={selectedPlugin}
              onClose={closeCatalogPluginDetail}
              onConfigureMcp={() => openPluginManageTab("mcps")}
              onCopyLink={() => copyCatalogPluginLink(selectedPlugin)}
              onOpenSkills={() => openPluginManageTab("skills")}
              onInstall={() => {
                void installCatalogPlugin(selectedPlugin)
              }}
              onStartPrompt={startNewChatWithPrompt}
              onToggleSkill={(skillName, nextEnabled) =>
                toggleCatalogPluginSkill(selectedPlugin, skillName, nextEnabled)
              }
              onTryInChat={() => startCatalogPluginChat(selectedPlugin)}
              onUninstall={() => uninstallCatalogPlugin(selectedPlugin)}
              runtimePlugin={selectedPluginRuntimePlugin}
              uninstalling={uninstallingPluginId === selectedPlugin.id}
            />
          ) : (
            <>
          <h1 className="codex-plugin-catalog-title">
            {t(surfaceTitleKey)}
          </h1>
          <p className="codex-plugin-catalog-subtitle">
            {t(surfaceSubtitleKey)}
          </p>

          <div className="codex-plugin-search-row">
            <label className="codex-plugin-search-field">
              <Search className="h-4 w-4" aria-hidden="true" />
              <input
                aria-label={t(surfaceSearchKey)}
                placeholder={t(surfaceSearchKey)}
                readOnly
                type="search"
              />
            </label>
            <button
              type="button"
              className="codex-plugin-filter-button"
              aria-label={t("pluginsPage.filter")}
            >
              <PluginFilterIcon />
            </button>
          </div>

          {isSkillsPage ? (
            <>
              <section className="codex-plugin-list-section codex-plugin-manage-section" aria-labelledby="codex-plugin-skills-installed-heading">
                <h2 id="codex-plugin-skills-installed-heading" className="codex-plugin-list-heading">
                  {t("pluginsPage.skills.installed")}
                </h2>
                <div className="codex-plugin-list">
                  {runtimeSkills.length > 0 ? (
                    runtimeSkills.map((skill) => (
                      <RuntimeSkillRow
                        key={`${skill.source}:${skill.pluginName ?? "local"}:${skill.name}:${skill.path}`}
                        catalogPlugin={
                          skill.pluginName
                            ? catalogPluginByRuntimeSource.get(skill.pluginName)
                            : null
                        }
                        skill={skill}
                        onTryInChat={startRuntimeSkillChat}
                      />
                    ))
                  ) : (
                    <RuntimeSkillEmptyRow isLoading={isFetchingRuntimeSkills} />
                  )}
                </div>
              </section>

              <section className="codex-plugin-list-section codex-plugin-business-section" aria-labelledby="codex-plugin-skills-recommended-heading">
                <div className="codex-plugin-section-heading-row">
                  <h2 id="codex-plugin-skills-recommended-heading">
                    {t("pluginsPage.skills.recommended")}
                  </h2>
                  <button
                    type="button"
                    className="codex-plugin-more-link"
                    onClick={startNewSkillChat}
                  >
                    {t("pluginsPage.skills.createSkill")}
                  </button>
                </div>
                <div className="codex-plugin-list">
                  {RECOMMENDED_SKILLS.map((resource) => (
                    <ManagedResourceRow
                      key={resource.id}
                      resource={resource}
                      onAction={handleManagedResourceAction}
                    />
                  ))}
                </div>
              </section>
            </>
          ) : entryMode === "manage" ? (
            <>
              {visiblePluginManageTabs.length > 1 ? (
                <div className="codex-plugin-manage-tabs" role="tablist" aria-label={t("pluginsPage.manage.tabsLabel")}>
                  {visiblePluginManageTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className="codex-plugin-manage-tab"
                      data-active={manageTab === tab.id ? "true" : "false"}
                      data-plugin-manage-tab={tab.id}
                      role="tab"
                      aria-selected={manageTab === tab.id}
                      onClick={() => openPluginManageTab(tab.id)}
                    >
                      <span>{t(tab.labelKey)}</span>
                      <span className="codex-plugin-manage-count">{tab.count}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {manageTab === "plugins" && (
                <section className="codex-plugin-list-section codex-plugin-manage-section" aria-labelledby="codex-plugin-installed-heading">
                  <div className="codex-plugin-section-heading-row">
                    <h2 id="codex-plugin-installed-heading">
                      {t("pluginsPage.manage.installed")}
                    </h2>
                    <button
                      type="button"
                      className="codex-plugin-more-link"
                      onClick={() => openPluginManageTab("marketplace")}
                    >
                      {t("pluginsPage.manage.browseMarketplace")}
                    </button>
                  </div>
                  <div className="codex-plugin-list">
                    {runtimePlugins.length > 0
                      ? runtimePlugins.map((runtimePlugin) => (
                          <RuntimePluginManageRow
                            key={runtimePlugin.source}
                            catalogPlugin={catalogPluginByRuntimeSource.get(
                              runtimePlugin.source,
                            )}
                            runtimePlugin={runtimePlugin}
                            onOpenCatalogPlugin={openCatalogPluginDetail}
                          />
                        ))
                      : CONNECTED_PLUGINS.map((plugin) => (
                          <ConnectedPluginRow key={plugin.id} plugin={plugin} />
                        ))}
                  </div>
                </section>
              )}

              {manageTab === "apps" && (
                <section className="codex-plugin-list-section codex-plugin-manage-section" aria-labelledby="codex-plugin-apps-heading">
                  <h2 id="codex-plugin-apps-heading" className="codex-plugin-list-heading">
                    {t("pluginsPage.manage.apps")}
                  </h2>
                  <div className="codex-plugin-list">
                    {getManagedResourcesForTab("apps").map((resource) => (
                      <ManagedResourceRow
                        key={resource.id}
                        resource={resource}
                        onAction={handleManagedResourceAction}
                      />
                    ))}
                  </div>
                </section>
              )}

              {manageTab === "mcps" && (
                <section className="codex-plugin-list-section codex-plugin-manage-section" aria-labelledby="codex-plugin-mcps-heading">
                  <h2 id="codex-plugin-mcps-heading" className="codex-plugin-list-heading">
                    {t("pluginsPage.manage.mcps")}
                  </h2>
                  <div className="codex-plugin-list">
                    {getManagedResourcesForTab("mcps").map((resource) => (
                      <ManagedResourceRow
                        key={resource.id}
                        resource={resource}
                        onAction={handleManagedResourceAction}
                      />
                    ))}
                  </div>
                </section>
              )}

              {manageTab === "skills" && (
                <section className="codex-plugin-list-section codex-plugin-manage-section" aria-labelledby="codex-plugin-skills-heading">
                  <h2 id="codex-plugin-skills-heading" className="codex-plugin-list-heading">
                    {t("pluginsPage.manage.skills")}
                  </h2>
                  <div className="codex-plugin-list">
                    {runtimeSkills.length > 0 ? (
                      runtimeSkills.map((skill) => (
                        <RuntimeSkillRow
                          key={`${skill.source}:${skill.pluginName ?? "local"}:${skill.name}:${skill.path}`}
                          catalogPlugin={
                            skill.pluginName
                              ? catalogPluginByRuntimeSource.get(
                                  skill.pluginName,
                                )
                              : null
                          }
                          skill={skill}
                          onTryInChat={startRuntimeSkillChat}
                        />
                      ))
                    ) : !isFetchingRuntimeSkills ? (
                      getManagedResourcesForTab("skills").map((resource) => (
                        <ManagedResourceRow
                          key={resource.id}
                          resource={resource}
                          onAction={handleManagedResourceAction}
                        />
                      ))
                    ) : (
                      <RuntimeSkillEmptyRow isLoading={isFetchingRuntimeSkills} />
                    )}
                  </div>
                </section>
              )}

              {manageTab === "marketplace" && (
                <section className="codex-plugin-list-section codex-plugin-manage-section" aria-labelledby="codex-plugin-marketplace-heading">
                  <h2 id="codex-plugin-marketplace-heading" className="codex-plugin-list-heading">
                    {t("pluginsPage.manage.marketplace")}
                  </h2>
                  <div className="codex-plugin-list">
                    {MARKETPLACE_PLUGINS.map((plugin) => (
                      <CatalogPluginRow
                        key={plugin.id}
                        isInstalled={effectiveInstalledPluginIds.has(plugin.id)}
                        plugin={plugin}
                        onAdd={() => openCatalogPluginDetail(plugin)}
                        onOpen={() => openCatalogPluginDetail(plugin)}
                        onTryInChat={() => startCatalogPluginChat(plugin)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <>
              {showOnboardingSuggestions && selectedOnboardingRole ? (
                <section
                  className="codex-plugin-list-section codex-plugin-onboarding-section"
                  aria-labelledby="codex-plugin-onboarding-heading"
                  data-plugin-onboarding-selected-role={selectedOnboardingRole.id}
                  data-plugin-onboarding-suggestions
                >
                  <div className="codex-plugin-section-heading-row">
                    <div>
                      <h2 id="codex-plugin-onboarding-heading">
                        {t("pluginsPage.onboarding.title")}
                      </h2>
                      <p className="codex-plugin-catalog-subtitle">
                        {t("pluginsPage.onboarding.description")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="codex-plugin-more-link"
                      data-plugin-onboarding-starter-prompt={selectedOnboardingRole.id}
                      onClick={() => startOnboardingRoleChat(selectedOnboardingRole)}
                    >
                      {t("pluginsPage.onboarding.start")}
                    </button>
                  </div>

                  <div
                    className="codex-plugin-manage-tabs"
                    role="tablist"
                    aria-label={t("pluginsPage.onboarding.rolesLabel")}
                  >
                    {pluginOnboardingSuggestions.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        className="codex-plugin-manage-tab"
                        data-active={
                          selectedOnboardingRole.id === role.id ? "true" : "false"
                        }
                        data-plugin-onboarding-role={role.id}
                        role="tab"
                        aria-selected={selectedOnboardingRole.id === role.id}
                        onClick={() => setSelectedOnboardingRoleId(role.id)}
                      >
                        <span>{t(role.titleKey)}</span>
                      </button>
                    ))}
                  </div>

                  <p className="codex-plugin-catalog-subtitle">
                    {t(selectedOnboardingRole.descriptionKey)}
                  </p>
                  <div
                    className="codex-plugin-list"
                    data-plugin-onboarding-resources={selectedOnboardingRole.id}
                  >
                    {selectedOnboardingRole.resources.map((resource) => (
                      <ManagedResourceRow
                        key={resource.id}
                        resource={resource}
                        onAction={handleManagedResourceAction}
                      />
                    ))}
                    {selectedOnboardingRole.catalogPlugins.map((plugin) => (
                      <CatalogPluginRow
                        key={plugin.id}
                        isInstalled={effectiveInstalledPluginIds.has(plugin.id)}
                        plugin={plugin}
                        onAdd={() => openCatalogPluginDetail(plugin)}
                        onOpen={() => openCatalogPluginDetail(plugin)}
                        onTryInChat={() => startCatalogPluginChat(plugin)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="codex-plugin-source-tabs" role="tablist" aria-label={t("pluginsPage.sourceTabs")}>
                <button
                  type="button"
                  className="codex-plugin-source-tab"
                  data-active="true"
                  role="tab"
                  aria-selected="true"
                >
                  {t("pluginsPage.source.openai")}
                </button>
                <button
                  type="button"
                  className="codex-plugin-source-tab"
                  data-active="false"
                  role="tab"
                  aria-selected="false"
                >
                  {t("pluginsPage.source.workspace")}
                </button>
                <button
                  type="button"
                  className="codex-plugin-source-tab"
                  data-active="false"
                  role="tab"
                  aria-selected="false"
                >
                  {t("pluginsPage.source.personal")}
                </button>
              </div>

              <section className="codex-plugin-connected-section" aria-labelledby="codex-plugin-connected-heading">
                <div className="codex-plugin-section-heading-row">
                  <h2 id="codex-plugin-connected-heading">
                    {t("pluginsPage.connected")}
                  </h2>
                  <button
                    type="button"
                    className="codex-plugin-manage-button"
                    onClick={openPluginManage}
                  >
                    {t("pluginsPage.manage")}
                  </button>
                </div>
                <div className="codex-plugin-connected-strip" aria-label={t("pluginsPage.connected")}>
                  {CONNECTED_PLUGINS.map((plugin) => (
                    <span
                      key={plugin.id}
                      className="codex-plugin-connected-icon"
                      title={plugin.label}
                    >
                      <PluginConnectedLogo id={plugin.logo} />
                    </span>
                  ))}
                  <span
                    className="codex-plugin-connected-more codex-plugin-connected-more-reference"
                    title={t("pluginsPage.connectedMore")}
                  >
                    <img className="codex-plugin-connected-more-image" src={connectedMoreTile} alt="" draggable={false} />
                    <span className="sr-only">{t("pluginsPage.connectedMore")}</span>
                  </span>
                </div>
              </section>

              <section className="codex-plugin-list-section" aria-labelledby="codex-plugin-featured-heading">
                <h2 id="codex-plugin-featured-heading" className="codex-plugin-list-heading">
                  {t("pluginsPage.featured")}
                </h2>
                <div className="codex-plugin-list">
                  {FEATURED_PLUGINS.map((plugin) => (
                    <CatalogPluginRow
                      key={plugin.id}
                      isInstalled={effectiveInstalledPluginIds.has(plugin.id)}
                      plugin={plugin}
                        onAdd={() => openCatalogPluginDetail(plugin)}
                        onOpen={() => openCatalogPluginDetail(plugin)}
                        onTryInChat={() => startCatalogPluginChat(plugin)}
                      />
                    ))}
                </div>
                <button
                  type="button"
                  className="codex-plugin-more-link codex-plugin-featured-more-link"
                  onClick={openPluginManage}
                >
                  {t("pluginsPage.viewMoreFeatured")}
                </button>
              </section>

              <section
                className="codex-plugin-list-section codex-plugin-productivity-section"
                aria-labelledby="codex-plugin-productivity-heading"
              >
                <h2 id="codex-plugin-productivity-heading" className="codex-plugin-list-heading">
                  {t("pluginsPage.productivity")}
                </h2>
                <div className="codex-plugin-list">
                  {PRODUCTIVITY_PLUGINS.map((plugin) => (
                    <CatalogPluginRow
                      key={plugin.id}
                      isInstalled={effectiveInstalledPluginIds.has(plugin.id)}
                      plugin={plugin}
                      onAdd={() => openCatalogPluginDetail(plugin)}
                      onOpen={() => openCatalogPluginDetail(plugin)}
                      onTryInChat={() => startCatalogPluginChat(plugin)}
                    />
                  ))}
                </div>
              </section>

              <section
                className="codex-plugin-list-section codex-plugin-business-section codex-plugin-marketplace-business-section"
                aria-labelledby="codex-plugin-business-heading"
              >
                <h2 id="codex-plugin-business-heading" className="codex-plugin-list-heading">
                  {t("pluginsPage.business")}
                </h2>
                <div className="codex-plugin-list">
                  {BUSINESS_PLUGINS.map((plugin) => (
                    <CatalogPluginRow
                      key={plugin.id}
                      isInstalled={effectiveInstalledPluginIds.has(plugin.id)}
                      plugin={plugin}
                      onAdd={() => openCatalogPluginDetail(plugin)}
                      onOpen={() => openCatalogPluginDetail(plugin)}
                      onTryInChat={() => startCatalogPluginChat(plugin)}
                    />
                  ))}
                </div>
              </section>
            </>
          )}
            </>
          )}
        </main>
      </div>
      {uninstallCandidate ? (
        <PluginUninstallDialog
          mutationError={pluginMutationError}
          plugin={uninstallCandidate}
          runtimePlugin={uninstallCandidateRuntimePlugin}
          uninstalling={uninstallingPluginId === uninstallCandidate.id}
          onCancel={cancelUninstallCatalogPlugin}
          onConfirm={() => {
            void confirmUninstallCatalogPlugin(uninstallCandidate)
          }}
        />
      ) : null}
    </div>
  )
}

export function SkillsEntryView() {
  return <PluginEntryView surface="skills" />
}

export function McpSettingsEntryView() {
  return <PluginEntryView surface="mcp-settings" />
}
