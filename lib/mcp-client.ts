export interface MCPResponse<T = any> {
  status: 'success' | 'error'
  message?: string
  data?: T
  [key: string]: any
}

export class MCPClient {
  private baseUrl: string

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl
  }

  async callTool<T = any>(toolName: string, params: Record<string, any> = {}): Promise<MCPResponse<T>> {
    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tool: toolName,
          params,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('MCP call failed:', error)
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  // Users are now managed by Keycloak

  // Project operations
  async getProjects(projectCategoryId?: number, limit: number = 50) {
    const keycloakUserId = typeof window !== 'undefined' ? localStorage.getItem('keycloak_user_id') : null
    return this.callTool('get_projects', { 
      current_user_id: keycloakUserId, 
      project_category_id: projectCategoryId, 
      limit 
    })
  }

  async addProject(projectData: {
    project_name: string
    project_category_id?: number
    category_id?: number
    vendor_id?: number
    department?: string
    budget_allotment?: number
  }) {
    const keycloakUserId = typeof window !== 'undefined' ? localStorage.getItem('keycloak_user_id') : null
    return this.callTool('add_project', { ...projectData, current_user_id: keycloakUserId })
  }

  // Category operations
  async getProjectCategories() {
    return this.callTool('get_project_categories_tool')
  }

  async getExpenseCategories() {
    return this.callTool('get_expense_categories_tool')
  }

  // Expense operations
  async getExpenses(limit: number = 10, projectId?: number, categoryId?: number) {
    const keycloakUserId = typeof window !== 'undefined' ? localStorage.getItem('keycloak_user_id') : null
    return this.callTool('list_expenses', {
      current_user_id: keycloakUserId,
      limit,
      project_id: projectId,
      category_id: categoryId
    })
  }

  async addExpense(expenseData: {
    project_id: number
    category_id: number
    vendor_id?: number
    payment_method_id?: number
    description?: string
    amount: number
    cycle_id?: number
  }) {
    const keycloakUserId = typeof window !== 'undefined' ? localStorage.getItem('keycloak_user_id') : null
    return this.callTool('add_expense', { ...expenseData, current_user_id: keycloakUserId })
  }

  // Database stats
  async getDatabaseStats() {
    return this.callTool('get_database_stats_tool')
  }
}

export const mcpClient = new MCPClient()