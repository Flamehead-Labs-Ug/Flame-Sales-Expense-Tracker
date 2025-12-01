'use client'

import { useUser, useStackApp } from '@stackframe/stack'
import { Button } from '@/components/ui/button'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const user = useUser()
  const app = useStackApp()

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Authentication Required</h1>
            <p className="text-muted-foreground mt-2">Please sign in to access this page</p>
          </div>

          <div className="space-y-3">
            <Button onClick={() => app.signInWithOAuth('google')} className="w-full">
              Sign In with Google
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}