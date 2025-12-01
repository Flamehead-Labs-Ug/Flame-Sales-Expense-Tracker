import { db } from '../database'
import { User } from '../types'

export class UserService {
  static async createFromOAuth(
    email: string,
    name: string,
    keycloakUserId: string,
    oauthSub: string
  ): Promise<User> {
    const result = await db.query(
      `INSERT INTO users (email, employee_name, keycloak_user_id, oauth_sub, user_role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
         keycloak_user_id = EXCLUDED.keycloak_user_id,
         oauth_sub = EXCLUDED.oauth_sub
       RETURNING *`,
      [email, name, keycloakUserId, oauthSub, 'user']
    )
    return result.rows[0]
  }

  static async findByOAuthSub(oauthSub: string): Promise<User | null> {
    const result = await db.query(
      'SELECT * FROM users WHERE oauth_sub = $1',
      [oauthSub]
    )
    return result.rows[0] || null
  }

  static async getAll(limit = 50): Promise<User[]> {
    const result = await db.query(
      'SELECT * FROM users ORDER BY employee_name LIMIT $1',
      [limit]
    )
    return result.rows
  }
}