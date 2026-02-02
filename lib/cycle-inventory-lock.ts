import { db } from '@/lib/database'

type QueryFn = (text: string, params?: any[]) => Promise<{ rows: any[] }>

let hasLockColumnCache: boolean | null = null

async function hasLockColumn(queryFn: QueryFn): Promise<boolean> {
  if (hasLockColumnCache !== null) return hasLockColumnCache

  const res = await queryFn(
    "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cycles' AND column_name = 'inventory_locked_at' LIMIT 1",
  )
  hasLockColumnCache = res.rows.length > 0
  return hasLockColumnCache
}

export class CycleInventoryLockedError extends Error {
  code = 'CYCLE_INVENTORY_LOCKED'

  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export function isCycleInventoryLockedError(err: unknown): err is CycleInventoryLockedError {
  return Boolean(err && typeof err === 'object' && (err as any).code === 'CYCLE_INVENTORY_LOCKED')
}

export async function assertCycleNotInventoryLocked(
  queryFn: QueryFn,
  cycleId: number | null | undefined,
  organizationId: number,
): Promise<void> {
  if (!cycleId) return

  const supported = await hasLockColumn(queryFn)
  if (!supported) return

  const { rows } = await queryFn(
    'SELECT inventory_locked_at FROM cycles WHERE id = $1 AND organization_id = $2',
    [cycleId, organizationId],
  )

  if (!rows.length) return

  if (rows[0]?.inventory_locked_at) {
    throw new CycleInventoryLockedError(
      'This cycle is locked because inventory was carried forward. Create an adjustment in the current cycle instead.',
    )
  }
}

export async function getDefaultPreviousCycleId(
  organizationId: number,
  projectId: number,
  excludeCycleId?: number | null,
): Promise<number | null> {
  const params: any[] = [organizationId, projectId]
  let i = 2
  let where = ''

  if (excludeCycleId) {
    i += 1
    where = ` AND id <> $${i}`
    params.push(excludeCycleId)
  }

  const { rows } = await db.query(
    `
    SELECT id
      FROM cycles
     WHERE organization_id = $1
       AND project_id = $2
       ${where}
     ORDER BY
       end_date DESC NULLS LAST,
       start_date DESC NULLS LAST,
       cycle_number DESC NULLS LAST,
       id DESC
     LIMIT 1
    `,
    params,
  )

  return rows[0]?.id ?? null
}

export async function getDefaultPreviousCycleIdWithQuery(
  queryFn: QueryFn,
  organizationId: number,
  projectId: number,
  excludeCycleId?: number | null,
): Promise<number | null> {
  const params: any[] = [organizationId, projectId]
  let i = 2
  let where = ''

  if (excludeCycleId) {
    i += 1
    where = ` AND id <> $${i}`
    params.push(excludeCycleId)
  }

  const { rows } = await queryFn(
    `
    SELECT id
      FROM cycles
     WHERE organization_id = $1
       AND project_id = $2
       ${where}
     ORDER BY
       end_date DESC NULLS LAST,
       start_date DESC NULLS LAST,
       cycle_number DESC NULLS LAST,
       id DESC
     LIMIT 1
    `,
    params,
  )

  return rows[0]?.id ?? null
}
