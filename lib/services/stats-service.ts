import { db } from '../database'

export async function getStats() {
  try {
    const [
      projectsResult,
      expensesResult,
      salesResult,
      totalExpenseResult,
      totalSaleResult
    ] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM projects'),
      db.query('SELECT COUNT(*) as count FROM expenses'),
      db.query('SELECT COUNT(*) as count FROM sales'),
      db.query('SELECT COALESCE(SUM(amount), 0) as total FROM expenses'),
      db.query('SELECT COALESCE(SUM(amount), 0) as total FROM sales')
    ])

    const totalExpenses = parseFloat(totalExpenseResult.rows[0].total) || 0
    const totalSales = parseFloat(totalSaleResult.rows[0].total) || 0

    return {
      totalExpenses,
      totalSales,
      activeProjects: parseInt(projectsResult.rows[0].count),
      netProfit: totalSales - totalExpenses
    }
  } catch (error) {
    console.error('Stats error:', error)
    throw error
  }
}

export class StatsService {
  static async getDashboardStatsByOrganization(organizationId: number) {
    try {
      const [
        usersResult,
        projectsResult,
        expensesResult,
        salesResult,
        totalExpenseResult,
        totalSaleResult
      ] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM users WHERE organization_id = $1', [organizationId]),
        db.query('SELECT COUNT(*) as count FROM projects WHERE organization_id = $1', [organizationId]),
        db.query('SELECT COUNT(*) as count FROM expenses WHERE organization_id = $1', [organizationId]),
        db.query('SELECT COUNT(*) as count FROM sales WHERE organization_id = $1', [organizationId]),
        db.query('SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE organization_id = $1', [organizationId]),
        db.query('SELECT COALESCE(SUM(amount), 0) as total FROM sales WHERE organization_id = $1', [organizationId])
      ])

      const totalExpenses = parseFloat(totalExpenseResult.rows[0].total) || 0
      const totalSales = parseFloat(totalSaleResult.rows[0].total) || 0

      return {
        users: parseInt(usersResult.rows[0].count),
        projects: parseInt(projectsResult.rows[0].count),
        expenses: parseInt(expensesResult.rows[0].count),
        sales: parseInt(salesResult.rows[0].count),
        total_expense_amount: totalExpenses,
        total_sale_amount: totalSales,
        net_profit: totalSales - totalExpenses
      }
    } catch (error) {
      console.error('Stats error:', error)
      throw error
    }
  }

  static async getDashboardStats(userId?: number) {
    try {
      const userFilter = userId ? 'WHERE created_by = $1' : ''
      const userParam = userId ? [userId] : []

      const [
        usersResult,
        projectsResult,
        expensesResult,
        salesResult,
        totalExpenseResult,
        totalSaleResult
      ] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM users'),
        db.query(`SELECT COUNT(*) as count FROM projects ${userFilter}`, userParam),
        db.query(`SELECT COUNT(*) as count FROM expenses ${userFilter}`, userParam),
        db.query(`SELECT COUNT(*) as count FROM sales ${userFilter}`, userParam),
        db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses ${userFilter}`, userParam),
        db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM sales ${userFilter}`, userParam)
      ])

      const totalExpenses = parseFloat(totalExpenseResult.rows[0].total) || 0
      const totalSales = parseFloat(totalSaleResult.rows[0].total) || 0

      return {
        status: 'success',
        stats: {
          users: parseInt(usersResult.rows[0].count),
          projects: parseInt(projectsResult.rows[0].count),
          expenses: parseInt(expensesResult.rows[0].count),
          sales: parseInt(salesResult.rows[0].count)
        },
        totals: {
          total_expense_amount: totalExpenses,
          total_sale_amount: totalSales,
          net_profit: totalSales - totalExpenses
        }
      }
    } catch (error) {
      console.error('Stats error:', error)
      return {
        status: 'error',
        message: 'Failed to get dashboard stats'
      }
    }
  }
}