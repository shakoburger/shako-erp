"use client"

import * as React from "react"
import { useState, useMemo, useRef, useEffect } from "react"
import { Check, ChevronDown, Search, X } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface PickerOption {
  value: string
  label: string
}

export interface SearchablePickerProps {
  value: string
  onChange: (value: string) => void
  options: (string | PickerOption)[]
  label?: string
  color?: string
  disabled?: boolean
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  dir?: "rtl" | "ltr"
}

function normalizeArabic(text: string): string {
  if (!text) return ""
  return text
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/[ةه]/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "") // remove tashkeel/diacritics
    .trim()
}

export function SearchablePicker({
  value,
  onChange,
  options,
  label,
  color,
  disabled = false,
  placeholder = "اختر",
  searchPlaceholder = "بحث في الحسابات والخيارات...",
  className,
  dir = "rtl",
}: SearchablePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const searchInputRef = useRef<HTMLInputElement>(null)

  const normalizedOptions: PickerOption[] = useMemo(() => {
    return options.map((o) => {
      if (typeof o === "string") {
        return { value: o, label: o }
      }
      return o
    })
  }, [options])

  const selectedOption = normalizedOptions.find((o) => o.value === value)
  const displayLabel = selectedOption?.label || placeholder

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return normalizedOptions
    const q = normalizeArabic(search)
    return normalizedOptions.filter((o) => {
      const matchLabel = normalizeArabic(o.label).includes(q)
      const matchVal = normalizeArabic(o.value).includes(q)
      return matchLabel || matchVal
    })
  }, [normalizedOptions, search])

  // Focus search input when popover opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    } else {
      setSearch("")
    }
  }, [open])

  return (
    <div className={cn("input-group", className)} dir={dir}>
      {label && (
        <span
          style={{
            background: color,
            opacity: disabled ? 0.6 : 1,
            direction: "rtl",
            textAlign: "right",
          }}
        >
          {label}
        </span>
      )}
      <Popover open={open && !disabled} onOpenChange={(v) => !disabled && setOpen(v)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label={label || placeholder}
            disabled={disabled}
            className="group-select searchable-picker-trigger"
            style={disabled ? { opacity: 0.6, cursor: "not-allowed", background: "#f1f5f9" } : undefined}
          >
            <span className="searchable-picker-label truncate" dir="auto">
              {displayLabel}
            </span>
            <ChevronDown size={15} className="searchable-picker-chevron" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="searchable-picker-popover"
          style={{ zIndex: 120 }}
          dir="rtl"
        >
          <div className="searchable-picker-search-bar">
            <Search size={14} className="searchable-picker-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="searchable-picker-input"
              dir="auto"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  if (filteredOptions.length > 0) {
                    onChange(filteredOptions[0].value)
                    setOpen(false)
                    setSearch("")
                  }
                } else if (e.key === "Escape") {
                  setOpen(false)
                }
              }}
            />
            {search && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearch("")}
                aria-label="مسح البحث"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="searchable-picker-list" role="listbox">
            {filteredOptions.length === 0 ? (
              <div className="searchable-picker-empty">
                لا توجد نتائج مطابقة للبحث
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value
                return (
                  <button
                    type="button"
                    key={opt.value + "_" + opt.label}
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      "searchable-picker-item",
                      isSelected && "selected"
                    )}
                    onClick={() => {
                      onChange(opt.value)
                      setOpen(false)
                      setSearch("")
                    }}
                  >
                    <span className="item-label truncate" dir="auto">{opt.label}</span>
                    {isSelected && <Check size={15} className="item-check" />}
                  </button>
                )
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
