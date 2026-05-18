import { useEffect, useRef } from "react"

type DiffDisplayMode = "side-peek" | "center-peek" | "full-page"

export function useAgentPanelConflicts({
  isDetailsSidebarOpen,
  isPlanSidebarOpen,
  currentPlanPath,
  isTerminalSidebarOpen,
  terminalDisplayMode,
  isDiffSidebarOpen,
  diffDisplayMode,
  setIsDetailsSidebarOpen,
  setIsPlanSidebarOpen,
  setIsTerminalSidebarOpen,
  setIsDiffSidebarOpen,
}: {
  isDetailsSidebarOpen: boolean
  isPlanSidebarOpen: boolean
  currentPlanPath: string | null | undefined
  isTerminalSidebarOpen: boolean
  terminalDisplayMode: string
  isDiffSidebarOpen: boolean
  diffDisplayMode: DiffDisplayMode
  setIsDetailsSidebarOpen: (open: boolean) => void
  setIsPlanSidebarOpen: (open: boolean) => void
  setIsTerminalSidebarOpen: (open: boolean) => void
  setIsDiffSidebarOpen: (open: boolean) => void
}) {
  const autoClosedStateRef = useRef<{
    detailsClosedBy: "plan" | "terminal" | "diff" | null
    planClosedByDetails: boolean
    terminalClosedByDetails: boolean
    diffClosedByDetails: boolean
  }>({
    detailsClosedBy: null,
    planClosedByDetails: false,
    terminalClosedByDetails: false,
    diffClosedByDetails: false,
  })

  const prevSidebarStatesRef = useRef({
    details: isDetailsSidebarOpen,
    plan: isPlanSidebarOpen && !!currentPlanPath,
    terminal: isTerminalSidebarOpen,
  })

  useEffect(() => {
    const prev = prevSidebarStatesRef.current
    const auto = autoClosedStateRef.current
    const isPlanOpen = isPlanSidebarOpen && !!currentPlanPath

    const detailsJustOpened = isDetailsSidebarOpen && !prev.details
    const detailsJustClosed = !isDetailsSidebarOpen && prev.details
    const planJustOpened = isPlanOpen && !prev.plan
    const planJustClosed = !isPlanOpen && prev.plan
    const terminalJustOpened = isTerminalSidebarOpen && !prev.terminal
    const terminalJustClosed = !isTerminalSidebarOpen && prev.terminal
    const terminalConflictsWithDetails = terminalDisplayMode === "side-peek"

    if (detailsJustOpened) {
      if (isPlanOpen) {
        auto.planClosedByDetails = true
        setIsPlanSidebarOpen(false)
      }
      if (isTerminalSidebarOpen && terminalConflictsWithDetails) {
        auto.terminalClosedByDetails = true
        setIsTerminalSidebarOpen(false)
      }
    } else if (detailsJustClosed) {
      if (auto.planClosedByDetails) {
        auto.planClosedByDetails = false
        setIsPlanSidebarOpen(true)
      }
      if (auto.terminalClosedByDetails) {
        auto.terminalClosedByDetails = false
        setIsTerminalSidebarOpen(true)
      }
    } else if (planJustOpened && isDetailsSidebarOpen) {
      auto.detailsClosedBy = "plan"
      setIsDetailsSidebarOpen(false)
    } else if (planJustClosed && auto.detailsClosedBy === "plan") {
      auto.detailsClosedBy = null
      setIsDetailsSidebarOpen(true)
    } else if (
      terminalJustOpened &&
      isDetailsSidebarOpen &&
      terminalConflictsWithDetails
    ) {
      auto.detailsClosedBy = "terminal"
      setIsDetailsSidebarOpen(false)
    } else if (terminalJustClosed && auto.detailsClosedBy === "terminal") {
      auto.detailsClosedBy = null
      setIsDetailsSidebarOpen(true)
    }

    prevSidebarStatesRef.current = {
      details: isDetailsSidebarOpen,
      plan: isPlanOpen,
      terminal: isTerminalSidebarOpen,
    }
  }, [
    isDetailsSidebarOpen,
    isPlanSidebarOpen,
    currentPlanPath,
    isTerminalSidebarOpen,
    terminalDisplayMode,
    setIsDetailsSidebarOpen,
    setIsPlanSidebarOpen,
    setIsTerminalSidebarOpen,
  ])

  const prevDiffStateRef = useRef<{
    isOpen: boolean
    mode: DiffDisplayMode
    detailsOpen: boolean
  }>({
    isOpen: isDiffSidebarOpen,
    mode: diffDisplayMode,
    detailsOpen: isDetailsSidebarOpen,
  })
  const isRestoringDiffRef = useRef(false)

  useEffect(() => {
    const prev = prevDiffStateRef.current
    const auto = autoClosedStateRef.current
    const isNowSidePeek = isDiffSidebarOpen && diffDisplayMode === "side-peek"
    const wasSidePeek = prev.isOpen && prev.mode === "side-peek"
    const detailsJustOpened = isDetailsSidebarOpen && !prev.detailsOpen
    const detailsJustClosed = !isDetailsSidebarOpen && prev.detailsOpen
    const diffSidePeekJustClosed = wasSidePeek && !isNowSidePeek

    if (isNowSidePeek && isDetailsSidebarOpen) {
      if (detailsJustOpened) {
        auto.diffClosedByDetails = true
        setIsDiffSidebarOpen(false)
      } else if (!prev.isOpen && !isRestoringDiffRef.current) {
        auto.detailsClosedBy = "diff"
        setIsDetailsSidebarOpen(false)
      } else if (prev.isOpen && prev.mode !== "side-peek") {
        auto.detailsClosedBy = "diff"
        setIsDetailsSidebarOpen(false)
      }
    } else if (diffSidePeekJustClosed && auto.detailsClosedBy === "diff") {
      auto.detailsClosedBy = null
      setIsDetailsSidebarOpen(true)
    } else if (detailsJustClosed && auto.diffClosedByDetails) {
      auto.diffClosedByDetails = false
      isRestoringDiffRef.current = true
      setIsDiffSidebarOpen(true)
      requestAnimationFrame(() => {
        isRestoringDiffRef.current = false
      })
    }

    prevDiffStateRef.current = {
      isOpen: isDiffSidebarOpen,
      mode: diffDisplayMode,
      detailsOpen: isDetailsSidebarOpen,
    }
  }, [
    isDiffSidebarOpen,
    diffDisplayMode,
    isDetailsSidebarOpen,
    setIsDetailsSidebarOpen,
    setIsDiffSidebarOpen,
  ])
}
