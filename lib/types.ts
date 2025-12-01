export interface Project {
  id: number
  project_name: string
  project_category_id?: number
  category_id?: number
  vendor_id?: number
  department?: string
  budget_allotment?: number
  created_datetime?: string
  created_by: string
}

export interface ProjectCategory {
  id: number
  category_name: string
  description?: string
  is_custom: number
}

export interface ExpenseCategory {
  id: number
  category_name: string
}

export interface Vendor {
  id: number
  category_id?: number
  vendor_name: string
  contact_info?: string
  notes?: string
}

export interface PaymentMethod {
  id: number
  payment_method: string
  type?: string
}

export interface Cycle {
  id: number
  project_id: number
  cycle_number: number
  cycle_name?: string
  start_date?: string
  end_date?: string
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

export interface Sale {
  id: number
  project_id: number
  cycle_id?: number
  date?: string
  customer: string
  quantity: number
  unit_cost: number
  price: number
  cash_at_hand?: number
  status?: string
  balance?: number
  created_by: string
}

export interface User {
  id: number
  email: string
  employee_name: string
  user_role?: string
  phone_number?: string
  keycloak_user_id?: string
  oauth_sub?: string
  created_at?: string
}