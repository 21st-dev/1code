/**
 * DrawerContent Component (GENERIC)
 * Feature: 004-customizable-sidebars
 *
 * Renders the content inside a drawer associated with any icon bar.
 * Includes:
 * - Drawer header with bar label and close button
 * - Page navigation tabs (if multiple icons in same drawer)
 * - Active page content with React Suspense for lazy loading
 *
 * Design: Works with ANY icon bar through configuration, not hardcoded.
 */

import { Suspense } from 'react'
import { Cross2Icon } from '@radix-ui/react-icons'
import { Button } from '../../../components/ui/button'
import { cn } from '../../../lib/utils'
import type { DrawerContentProps } from '../types/icon-bar.types'
import { getIcon } from '../constants/icon-registry'

/**
 * Loading fallback for lazy-loaded pages
 */
function PageLoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
        <p className="text-sm text-gray-500">Loading page...</p>
      </div>
    </div>
  )
}

/**
 * Drawer header with title and close button
 */
function DrawerHeader({
  title,
  onClose,
}: {
  title: string
  onClose: () => void
}) {
  return (
    <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        className="h-6 w-6 p-0 hover:bg-gray-100"
        aria-label="Close drawer"
      >
        <Cross2Icon className="h-4 w-4" />
      </Button>
    </div>
  )
}

/**
 * Page navigation tabs (optional, if multiple icons can share same drawer)
 * Currently not implemented - each drawer shows one page at a time
 * This is a placeholder for future enhancement (US1-008, US1-009)
 */
function PageNavigation({
  icons,
  activeIconId,
  onPageChange,
}: {
  icons: DrawerContentProps['icons']
  activeIconId: string | null
  onPageChange: (iconId: string) => void
}) {
  if (icons.length <= 1) return null

  return (
    <div className="flex items-center gap-1 border-b border-gray-200 px-4 py-2">
      {icons.map((icon) => {
        const iconDef = getIcon(icon.id)
        if (!iconDef) return null

        const isActive = icon.id === activeIconId
        const IconComponent = iconDef.icon

        return (
          <button
            key={icon.id}
            onClick={() => onPageChange(icon.id)}
            className={cn(
              'flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors',
              isActive
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
            )}
            aria-label={iconDef.label}
            aria-current={isActive ? 'page' : undefined}
          >
            {typeof IconComponent === 'function' ? (
              <IconComponent className="h-4 w-4" />
            ) : (
              IconComponent
            )}
            <span>{iconDef.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * COMP-004: DrawerContent component
 *
 * Main component that renders drawer header, navigation, and active page.
 *
 * @example
 * <DrawerContent
 *   bar={{ id: 'top', label: 'Top Action Bar', ... }}
 *   activeIconId="settings"
 *   icons={[settingsIcon, terminalIcon]}
 *   onPageChange={(iconId) => console.log('Switch to', iconId)}
 *   onClose={() => console.log('Close drawer')}
 *   workspaceId="main"
 * />
 */
export function DrawerContent({
  bar,
  activeIconId,
  icons,
  onPageChange,
  onClose,
  workspaceId,
}: DrawerContentProps) {
  // Get the active icon definition
  const activeIcon = activeIconId ? getIcon(activeIconId) : null

  // If no active icon, show empty state
  if (!activeIcon) {
    return (
      <div className="flex h-full flex-col">
        <DrawerHeader title={bar.label} onClose={onClose} />
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-gray-500">No page selected</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" data-drawer-bar-id={bar.id}>
      {/* Header with close button */}
      <DrawerHeader title={bar.label} onClose={onClose} />

      {/* Page navigation tabs (future enhancement) */}
      {/* <PageNavigation
        icons={icons}
        activeIconId={activeIconId}
        onPageChange={onPageChange}
      /> */}

      {/* Active page content */}
      <div className="flex-1 overflow-auto">
        <Suspense fallback={<PageLoadingFallback />}>
          {/* Render the active icon's page component */}
          {activeIcon.page}
        </Suspense>
      </div>
    </div>
  )
}
