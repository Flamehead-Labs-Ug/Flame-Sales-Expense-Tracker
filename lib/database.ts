import { neon } from '@neondatabase/serverless'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set')
}

const sql = neon(connectionString)

type QueryResult = { rows: any[] }

async function query(text: string, params?: any[]): Promise<QueryResult> {
  // The Neon serverless driver now requires function-style calls to use
  // sql.query("SELECT $1", [value]) instead of sql("SELECT $1", [value]).
  // We keep a pg-like db.query(text, params) API and adapt under the hood.
  const result = params && params.length > 0
    ? await (sql as any).query(text, params)
    : await (sql as any).query(text)

  // Normalize different possible return shapes into a simple { rows } object
  const rows = Array.isArray(result) ? result : (result?.rows ?? [])
  return { rows }
}

async function transaction<T>(fn: (tx: { query: typeof query }) => Promise<T>): Promise<T> {
  const sqlAny = sql as any

  if (typeof sqlAny.transaction === 'function') {
    try {
      return await sqlAny.transaction(async (trx: any) => {
        const txQuery = async (text: string, params?: any[]): Promise<QueryResult> => {
          const result = params && params.length > 0
            ? await trx.query(text, params)
            : await trx.query(text)

          const rows = Array.isArray(result) ? result : (result?.rows ?? [])
          return { rows }
        }

        return await fn({ query: txQuery })
      })
    } catch {
      // Some Neon serverless driver versions only support array-of-queries transactions.
      // In that case we fall back to non-transactional execution.
      return await fn({ query })
    }
  }

  return await fn({ query })
}

export const db = { query, transaction }

export interface Project {
  id: number
  project_name: string
  project_category_id?: number
  category_id?: number
  vendor_id?: number
  department?: string
  created_datetime?: string
  created_by: string
}

export interface Expense {
  id: number
  project_id: number
  cycle_id?: number
  category_id: number
  vendor_id?: number
  payment_method_id?: number
  description?: string
  amount: number
  date_time_created?: string
  created_by: string
}