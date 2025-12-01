"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <Button
      variant="outline"
      size="icon"
      className={cn("relative h-8 w-8 border-sidebar-border", "bg-background text-foreground")}
      onClick={toggleTheme}
      aria-label="Toggle theme"
   >
      <Sun
        className={cn(
          "h-4 w-4 rotate-0 scale-100 transition-all",
          isDark && "-rotate-90 scale-0 opacity-0"
        )}
      />
      <Moon
        className={cn(
          "absolute h-4 w-4 rotate-90 scale-0 opacity-0 transition-all",
          isDark && "rotate-0 scale-100 opacity-100"
        )}
      />
    </Button>
  )
}
