import './globals.css'
import { Suspense, type ReactNode } from 'react'
import { StackProvider, StackTheme } from "@stackframe/stack";
import { stackClientApp } from "../stack/client";
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { AppShell } from '@/components/app-shell'
import { ThemeProvider } from '@/components/theme-provider'
import { CopilotKit } from '@copilotkit/react-core'
import '@copilotkit/react-ui/styles.css'
// Removed NextAuth SessionProviderComponent as NextAuth has been removed from the application
// import SessionProviderComponent from '@/components/session-provider'

const inter = Inter({ subsets: ['latin'] })

const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
const siteUrl = rawSiteUrl
  ? rawSiteUrl.startsWith('http://') || rawSiteUrl.startsWith('https://')
    ? rawSiteUrl
    : `https://${rawSiteUrl}`
  : process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://flame-sales-and-expense-tracker.bagumajonah3.workers.dev'

const appName = 'Flame Sales & Expense Tracker'
const appDescription =
  'Track sales and expenses, attach receipts, and understand profitability with organizations, projects, and cycles.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
  description: appDescription,
  applicationName: appName,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    title: appName,
    description: appDescription,
    siteName: appName,
    images: [
      {
        url: '/icons/icon-512x512.png',
        width: 512,
        height: 512,
        alt: appName,
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: appName,
    description: appDescription,
    images: ['/icons/icon-512x512.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-48x48.png', sizes: '48x48', type: 'image/png' },
      {
        url: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: appName,
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
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
                <CopilotKit runtimeUrl="/api/v1/copilotkit" agent="Flame">
                  <AppShell>{children}</AppShell>
                </CopilotKit>
              </Suspense>
            </StackTheme>
          </StackProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}