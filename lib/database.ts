import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || '5432'),
      database: process.env.PG_DATABASE || 'expense-tracker',
      user: process.env.PG_USER || 'postgres',
      password: String(process.env.PG_PASSWORD || ''),
      ssl: process.env.PGSSLMODE === 'require'
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })

export { pool as db }

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