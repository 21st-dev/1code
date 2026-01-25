"use client"

import React, { useState, useMemo } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "./command"

interface SearchComboboxProps<T> {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  trigger: React.ReactNode
  items: T[]
  onSelect: (item: T) => void
  placeholder?: string
  emptyMessage?: string
  getItemValue: (item: T) => string
  renderItem: (item: T) => React.ReactNode
  width?: string
  align?: "start" | "center" | "end"
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
  alignOffset?: number
  collisionPadding?:
    | number
    | { top?: number; right?: number; bottom?: number; left?: number }
  maxHeight?: string
}

export function SearchCombobox<T>({
  isOpen,
  onOpenChange,
  trigger,
  items,
  onSelect,
  placeholder = "Search...",
  emptyMessage = "No results found.",
  getItemValue,
  renderItem,
  width = "w-64",
  align = "end",
  side = "bottom",
  sideOffset = 4,
  alignOffset,
  collisionPadding = 8,
  maxHeight = "max-h-[300px]",
}: SearchComboboxProps<T>) {
  const [search, setSearch] = useState("")

  // Filter items ourselves instead of relying on cmdk's built-in filter
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items
    const lowerSearch = search.toLowerCase()
    return items.filter((item) =>
      getItemValue(item).toLowerCase().includes(lowerSearch),
    )
  }, [items, search, getItemValue])

  // Reset search when popover closes
  const handleOpenChange = (open: boolean) => {
    if (!open) setSearch("")
    onOpenChange(open)
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      {trigger}
      <PopoverContent
        className={`${width} p-0`}
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className={`${maxHeight} overflow-y-auto scrollbar-thin`}>
            {filteredItems.length === 0 && (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            )}
            <CommandGroup>
              {filteredItems.map((item, index) => (
                <CommandItem
                  key={index}
                  value={getItemValue(item)}
                  onSelect={() => onSelect(item)}
                >
                  {renderItem(item)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
