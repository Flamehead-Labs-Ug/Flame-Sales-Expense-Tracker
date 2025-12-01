"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export type ChartConfig = Record<
  string,
  {
    label?: string
    /**
     * Optional icon component to use in legends or labels.
     */
    icon?: React.ComponentType<{ className?: string }>
    /**
     * Color token for this series, e.g. `hsl(var(--chart-1))` or `var(--chart-1)`.
     * When provided, it will be exposed as a CSS variable `--color-${key}` on the container.
     */
    color?: string
  }
>

interface ChartContextValue {
  config?: ChartConfig
}

const ChartContext = React.createContext<ChartContextValue | null>(null)

export function useChart() {
  const ctx = React.useContext(ChartContext)
  if (!ctx) return { config: undefined }
  return ctx
}

export interface ChartContainerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional configuration describing the series in the chart. */
  config?: ChartConfig
}

/**
 * Lightweight container used to host Recharts charts.
 *
 * - Provides a reasonable minimum height so charts are responsive.
 * - Optionally exposes `config` colors as CSS variables like `--color-desktop`.
 * - Designed to be used inside cards or layout blocks.
 */
export const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ className, style, children, config, ...props }, ref) => {
    const cssVars: React.CSSProperties = {}

    if (config) {
      for (const [key, value] of Object.entries(config)) {
        if (value?.color) {
          // Expose a CSS variable that charts can reference via `var(--color-${key})`.
          ;(cssVars as any)[`--color-${key}`] = value.color
        }
      }
    }

    return (
      <ChartContext.Provider value={{ config }}>
        <div
          ref={ref}
          className={cn(
            "relative flex min-h-[200px] w-full flex-1 flex-col justify-center",
            className,
          )}
          style={{ ...cssVars, ...style }}
          {...props}
        >
          {children}
        </div>
      </ChartContext.Provider>
    )
  },
)
ChartContainer.displayName = "ChartContainer"
