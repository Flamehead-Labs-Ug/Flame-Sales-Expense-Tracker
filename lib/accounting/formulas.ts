export type SaleStatus = 'pending' | 'completed'

export interface SaleLike {
  quantity: number
  price: number
  status?: string | null
}

export interface ProjectCategoryLike {
  id: number
  category_name: string
}

export interface ExpenseCategoryLike {
  id: number
  project_category_id?: number | null
}

export interface ExpenseLike {
  amount: number
  category_id?: number | null
}

export type InventoryTransactionType =
  | 'PURCHASE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'SALE'
  | 'SALE_REVERSAL'
  | string

export interface InventoryTransactionLike {
  type: InventoryTransactionType
  quantity_delta: number
  unit_cost?: number | null
  created_at?: string | Date
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  const d = new Date(String(value))
  return Number.isFinite(d.getTime()) ? d : null
}

export function calcSaleTotal(quantity: unknown, price: unknown): number {
  return toNumber(quantity) * toNumber(price)
}

export function calcSaleCost(quantity: unknown, unitCost: unknown): number {
  return toNumber(quantity) * toNumber(unitCost)
}

export function calcSaleProfit(quantity: unknown, price: unknown, unitCost: unknown): number {
  return calcSaleTotal(quantity, price) - calcSaleCost(quantity, unitCost)
}

export function calcNetSalesFromSales(sales: SaleLike[]): number {
  return (sales || []).reduce((sum, s) => {
    if (String(s.status || '').toLowerCase() !== 'completed') return sum
    return sum + calcSaleTotal(s.quantity, s.price)
  }, 0)
}

export function calcBalance(totalAmount: unknown, cashAtHand: unknown): number {
  return toNumber(totalAmount) - toNumber(cashAtHand)
}

export function calcSaleStatusFromBalance(balance: unknown): SaleStatus {
  return toNumber(balance) > 0 ? 'pending' : 'completed'
}

export function calcNetProfit(totalRevenue: unknown, totalExpenses: unknown): number {
  return toNumber(totalRevenue) - toNumber(totalExpenses)
}

export function calcGrossProfit(netSales: unknown, cogs: unknown): number {
  return toNumber(netSales) - toNumber(cogs)
}

export function calcNetProfitFromGrossProfit(grossProfit: unknown, operatingExpenses: unknown): number {
  return toNumber(grossProfit) - toNumber(operatingExpenses)
}

export function calcRemainingBudget(totalBudgetAllotment: unknown, totalExpenses: unknown): number {
  return toNumber(totalBudgetAllotment) - toNumber(totalExpenses)
}

function normalizeCategoryName(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

export function getProjectCategoryIdByName(
  projectCategories: ProjectCategoryLike[],
  name: string,
): number | undefined {
  const target = normalizeCategoryName(name)

  return (projectCategories || []).find((pc) => {
    const candidate = normalizeCategoryName(pc.category_name)
    // Allow labels like "COGS (Cost of Goods Sold)" or "EXPENSES (Operating Expenses)"
    // to match the short keys used by the calculations.
    return (
      candidate === target ||
      candidate.startsWith(`${target} `) ||
      candidate.startsWith(`${target}(`) ||
      candidate.includes(target)
    )
  })?.id
}

export function calcExpenseTotalsByProjectCategory(
  expenses: ExpenseLike[],
  categories: ExpenseCategoryLike[],
  projectCategories: ProjectCategoryLike[],
): { totalCogs: number; totalOperatingExpenses: number } {
  const cogsProjectCategoryId = getProjectCategoryIdByName(projectCategories, 'cogs')
  const operatingExpensesProjectCategoryId = getProjectCategoryIdByName(projectCategories, 'operating expenses')

  const categoryById = new Map<number, ExpenseCategoryLike>()
  for (const c of categories || []) {
    if (typeof c?.id === 'number') categoryById.set(c.id, c)
  }

  let totalCogs = 0
  let totalOperatingExpenses = 0

  for (const e of expenses || []) {
    const amt = toNumber(e.amount)
    if (!amt) continue
    const catId = e.category_id ?? null
    if (!catId) continue

    const cat = categoryById.get(Number(catId))
    if (!cat) continue

    const pcId = cat.project_category_id ?? null
    if (cogsProjectCategoryId && pcId === cogsProjectCategoryId) {
      totalCogs += amt
    }
    if (operatingExpensesProjectCategoryId && pcId === operatingExpensesProjectCategoryId) {
      totalOperatingExpenses += amt
    }
  }

  return { totalCogs, totalOperatingExpenses }
}

// COGS = Beginning Inventory + Purchases during the period − Ending Inventory
export function calcCOGS(
  beginningInventoryValue: unknown,
  purchasesDuringPeriodValue: unknown,
  endingInventoryValue: unknown,
): number {
  return toNumber(beginningInventoryValue) + toNumber(purchasesDuringPeriodValue) - toNumber(endingInventoryValue)
}

export function calcCOGSForPeriodFromTransactions(
  beginningInventoryValue: unknown,
  endingInventoryValue: unknown,
  transactions: InventoryTransactionLike[],
  periodStart: Date,
  periodEnd: Date,
): number {
  const purchases = calcPurchasesValueFromTransactions(transactions, periodStart, periodEnd)
  return calcCOGS(beginningInventoryValue, purchases, endingInventoryValue)
}

export function isTransactionInPeriod(
  createdAt: string | Date | undefined,
  periodStart: Date,
  periodEnd: Date,
): boolean {
  const d = toDate(createdAt)
  if (!d) return false
  return d.getTime() >= periodStart.getTime() && d.getTime() <= periodEnd.getTime()
}

// Purchases during period (P): sum(qty * unit_cost) for PURCHASE transactions inside the period.
// If unit_cost is missing, that transaction contributes 0 to the purchase value.
export function calcPurchasesValueFromTransactions(
  transactions: InventoryTransactionLike[],
  periodStart: Date,
  periodEnd: Date,
): number {
  return (transactions || []).reduce((sum, t) => {
    if (String(t.type).toUpperCase() !== 'PURCHASE') return sum
    if (!isTransactionInPeriod(t.created_at, periodStart, periodEnd)) return sum

    const qty = toNumber(t.quantity_delta)
    const unitCost = toNumber(t.unit_cost)
    if (qty <= 0 || unitCost <= 0) return sum

    return sum + qty * unitCost
  }, 0)
}
