import { NextRequest } from 'next/server'
import { db } from '@/lib/database'
import { stackServerApp } from '@/stack/server'

export interface SessionUser {
  id: number
  role: string | null
  organizationId: number | null
  email?: string | null
}

export async function getSessionUser(_request?: NextRequest): Promise<SessionUser | null> {
  const currentUser = await stackServerApp.getUser()
  if (!currentUser) {
    return null
  }

  const provider = 'stack'
  const externalId = currentUser.id

  const existing = await db.query(
    'SELECT id, user_role, organization_id, email FROM users WHERE oauth_provider = $1 AND oauth_sub = $2',
    [provider, externalId]
  )

  let dbUser = existing.rows[0]

  if (!dbUser) {
    const countResult = await db.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users')
    const isFirstUser = countResult.rows[0]?.count === '0'
    const userRole = isFirstUser ? 'admin' : 'user'

    const created = await db.query(
      `INSERT INTO users (oauth_provider, oauth_sub, email, employee_name, user_role, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, user_role, organization_id, email`,
      [
        provider,
        externalId,
        currentUser.primaryEmail ?? null,
        currentUser.displayName ?? null,
        userRole,
      ]
    )

    dbUser = created.rows[0]
  }

  if (!dbUser) {
    return null
  }

  return {
    id: dbUser.id,
    role: dbUser.user_role ?? null,
    organizationId: dbUser.organization_id ?? null,
    email: dbUser.email ?? currentUser.primaryEmail ?? null,
  }
}

export async function getUserOrganizationId(request?: NextRequest): Promise<number | null> {
  const user = await getSessionUser(request)
  return user?.organizationId ?? null
}

export async function isUserMidSetup(request?: NextRequest): Promise<boolean> {
  const user = await getSessionUser(request)
  if (!user) {
    return false
  }
  return !!user.id && !user.organizationId
}