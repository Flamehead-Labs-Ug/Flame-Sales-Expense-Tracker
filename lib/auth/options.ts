import type { DefaultSession, NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { db } from '@/lib/database'

type DbUser = {
  id: number
  user_role: string | null
  organization_id: number | null
}

async function upsertOAuthUser(
  provider: string,
  sub: string,
  email?: string | null,
  name?: string | null
): Promise<DbUser | null> {
  const existing = await db.query<DbUser>(
    'SELECT id, user_role, organization_id FROM users WHERE oauth_provider = $1 AND oauth_sub = $2',
    [provider, sub]
  )

  if (existing.rowCount && existing.rows[0]) {
    await db.query(
      'UPDATE users SET email = $1, employee_name = $2 WHERE oauth_provider = $3 AND oauth_sub = $4',
      [email ?? null, name ?? null, provider, sub]
    )
    return existing.rows[0]
  }

  const countResult = await db.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users')
  const isFirstUser = countResult.rows[0]?.count === '0'
  const userRole = isFirstUser ? 'admin' : 'user'

  const created = await db.query<DbUser>(
    `INSERT INTO users (oauth_provider, oauth_sub, email, employee_name, user_role, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id, user_role, organization_id`,
    [provider, sub, email ?? null, name ?? null, userRole]
  )

  return created.rows[0] ?? null
}

async function getOAuthUser(provider: string, sub: string): Promise<DbUser | null> {
  const result = await db.query<DbUser>(
    'SELECT id, user_role, organization_id FROM users WHERE oauth_provider = $1 AND oauth_sub = $2',
    [provider, sub]
  )
  return result.rows[0] ?? null
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
          prompt: 'consent',
          access_type: 'offline',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const provider = account.provider
        const sub = profile.sub ?? account.providerAccountId ?? token.sub
        if (!sub) return token

        token.oauthProvider = provider
        token.oauthSub = sub
        const dbUser = await upsertOAuthUser(provider, sub, token.email, profile.name ?? token.name ?? null)
        if (dbUser) {
          token.userId = dbUser.id
          token.role = dbUser.user_role
          token.organizationId = dbUser.organization_id
        }
        return token
      }

      const provider = (token.oauthProvider as string) || 'google'
      const sub = (token.oauthSub as string) || (token.sub as string)
      if (!sub) return token

      const dbUser = await getOAuthUser(provider, sub)
      if (dbUser) {
        token.userId = dbUser.id
        token.role = dbUser.user_role
        token.organizationId = dbUser.organization_id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as number | undefined
        session.user.role = (token.role as string | null | undefined) ?? null
        session.user.organizationId = (token.organizationId as number | null | undefined) ?? null
        session.user.oauthProvider = (token.oauthProvider as string | undefined) ?? 'google'
        session.user.oauthSub = (token.oauthSub as string | undefined) ?? (token.sub as string | undefined)
      }
      return session
    },
  },
}

declare module 'next-auth' {
  interface Session {
    user: {
      id?: number
      role?: string | null
      organizationId?: number | null
      oauthProvider?: string
      oauthSub?: string
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: number
    role?: string | null
    organizationId?: number | null
    oauthProvider?: string
    oauthSub?: string
  }
}
