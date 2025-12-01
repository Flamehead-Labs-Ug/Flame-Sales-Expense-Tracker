import { db } from '@/lib/database'
import { convertAmount } from '@/lib/currency-api'

export async function computeAmountInOrgCurrency(
  organizationId: number,
  projectId: number | null | undefined,
  amount: number,
): Promise<number> {
  const value = typeof amount === 'number' ? amount : Number(amount || 0)
  if (!value) return 0

  const orgRes = await db.query('SELECT currency_code FROM organizations WHERE id = $1', [organizationId])
  const orgCurrency: string | null = orgRes.rows[0]?.currency_code ?? null
  if (!orgCurrency) return value

  let projectCurrency: string | null = null
  if (projectId) {
    const projRes = await db.query('SELECT currency_code FROM projects WHERE id = $1', [projectId])
    projectCurrency = projRes.rows[0]?.currency_code ?? null
  }

  const fromCurrency = projectCurrency || orgCurrency
  const toCurrency = orgCurrency

  if (!fromCurrency || fromCurrency === toCurrency) return value

  const converted = await convertAmount(value, fromCurrency, toCurrency)
  return converted
}
