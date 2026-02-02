/**
 * OverviewSection Component
 *
 * Displays the overview section of the Spec plan page.
 * Contains the constitution section and features list.
 *
 * @see specs/001-speckit-ui-integration/tasks.md T158
 */

import { memo } from "react"
import { ConstitutionSection } from "./constitution-section"
import { FeaturesTable } from "./features-table"

interface OverviewSectionProps {
  /** Project path (required) */
  projectPath: string
  /** Callback to open workflow modal */
  onOpenWorkflow?: () => void
}

/**
 * OverviewSection - Displays constitution and features list
 *
 * This section is always visible and provides an overview of:
 * - Project constitution with principles
 * - All previous features with their artifacts
 */
export const OverviewSection = memo(function OverviewSection({
  projectPath,
  onOpenWorkflow,
}: OverviewSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Constitution Section */}
      <ConstitutionSection projectPath={projectPath} />

      {/* Features List */}
      <FeaturesTable
        projectPath={projectPath}
        onNewFeature={onOpenWorkflow}
      />
    </div>
  )
})
