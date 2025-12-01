import './globals.css'
import { Suspense } from 'react'
import { StackProvider, StackTheme } from "@stackframe/stack";
import { stackClientApp } from "../stack/client";
import { Inter } from 'next/font/google'
import { Navigation } from '@/components/navigation'
import { FilterProvider } from '@/lib/context/filter-context'
import { Toaster } from 'sonner'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { ThemeProvider } from '@/components/theme-provider'
import SessionProviderComponent from '@/components/session-provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Flame Expense Tracker',
  description: 'Comprehensive expense and sales tracking application',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <StackProvider app={stackClientApp}>
            <StackTheme>
              <Suspense fallback={null}>
                <SidebarProvider>
                  <AppSidebar />
                  <SidebarInset>
                    <div className="min-h-screen bg-background">
                      <SessionProviderComponent>
                        <FilterProvider>
                          <Navigation />
                          <main className="w-full px-4 py-6">
                            {children}
                          </main>
                        </FilterProvider>
                      </SessionProviderComponent>
                      <Toaster />
                    </div>
                  </SidebarInset>
                </SidebarProvider>
              </Suspense>
            </StackTheme>
          </StackProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}