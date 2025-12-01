'use client'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { useFilter } from '@/lib/context/filter-context'
import {
  LayoutDashboard,
  Repeat,
  Package,
  Wallet,
  ShoppingCart,
  Users,
  FileText,
  Receipt,
  BarChart3,
  Settings,
} from 'lucide-react'

export const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Cycles', href: '/cycles', icon: Repeat },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Expenses', href: '/expenses', icon: Wallet },
  { name: 'Sales', href: '/sales', icon: ShoppingCart },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Invoices', href: '/invoices', icon: FileText },
  { name: 'Receipts', href: '/receipts', icon: Receipt },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Navigation() {
  const { selectedProject, selectedCycle, selectedOrganization, projects, cycles, organizations, setSelectedProject, setSelectedCycle, setSelectedOrganization } = useFilter()

  
  return (
    <>
      {/* Top Bar */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="w-full flex h-14 items-center px-4 gap-4">
          <SidebarTrigger />

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-1.5">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="organization-select"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Organization
                </label>
                <select
                  id="organization-select"
                  value={selectedOrganization}
                  onChange={(e) => setSelectedOrganization(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <option value="">Select Organization</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id.toString()}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="project-select"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Project
                </label>
                <select
                  id="project-select"
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <option value="">All Projects</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id.toString()}>
                      {project.project_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="cycle-select"
                  className="text-[11px] font-medium text-muted-foreground"
                >
                  Cycle
                </label>
                <select
                  id="cycle-select"
                  value={selectedCycle}
                  onChange={(e) => setSelectedCycle(e.target.value)}
                  disabled={!selectedProject}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">{selectedProject ? 'All Cycles' : 'Select project first'}</option>
                  {cycles.map((cycle) => (
                    <option key={cycle.id} value={cycle.id.toString()}>
                      {cycle.cycle_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </>
  )
}