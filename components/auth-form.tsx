'use client'

import { Button } from '@/components/ui/button'
import { useStackApp } from '@stackframe/stack'

type AuthFormProps = {
  title?: string
}

export function AuthForm({ title = 'Flame Expense Tracker' }: AuthFormProps) {
  const app = useStackApp()

  const handleSignIn = () => {
    app.signInWithOAuth('google')
  }

  const handleSignUp = () => {
    app.signInWithOAuth('google')
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">
          Sign in with your workspace credentials
        </p>
      </div>

      <div className="space-y-3">
        <Button className="w-full" onClick={handleSignIn}>
          Continue to Sign In
        </Button>
        <Button
          variant="outline"
          className="w-full font-semibold"
          onClick={handleSignUp}
        >
          Create an Account
        </Button>
      </div>
    </div>
  )
}
