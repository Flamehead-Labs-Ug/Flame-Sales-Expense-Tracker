'use client'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { useFilter } from '@/lib/context/filter-context'
import { useRouter } from 'next/navigation'
import { Navbar12 } from '@/components/ui/shadcn-io/navbar-12'
import Switcher from '@/components/ui/shadcn-io/navbar-12/Switcher'
import { useUser } from '@stackframe/stack'
import { useEffect, useState } from 'react'

import {
  LayoutDashboard,
  Bot,
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
  { name: 'Docs', href: '/docs', icon: FileText },
  { name: 'Assistant', href: '/assistant', icon: Bot },
  { name: 'Cycles', href: '/cycles', icon: Repeat },
  { name: 'Inventory', href: '/inventory', icon: Package },
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

  const user = useUser()
  const [userRole, setUserRole] = useState<string>('')

  const router = useRouter()

  useEffect(() => {
    const loadRole = async () => {
      if (!user?.primaryEmail) return
      try {
        const response = await fetch('/api/v1/users')
        const data = await response.json()
        if (data.status === 'success') {
          const found = (data.users as Array<{ email: string; user_role?: string }>).find(
            (u) => u.email === user.primaryEmail,
          )
          setUserRole(found?.user_role ?? '')
        }
      } catch {
        setUserRole('')
      }
    }

    if (user) {
      loadRole()
    }
  }, [user])

  const organizationItems = organizations.map((org) => ({
    value: org.id.toString(),
    label: org.name,
  }))

  const projectItems = projects.map((project) => ({
    value: project.id.toString(),
    label: project.project_name,
  }))

  const cycleItems = cycles.map((cycle) => ({
    value: cycle.id.toString(),
    label: cycle.cycle_name,
  }))

  return (
    <>
      <Navbar12
        className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        navigationLinks={[]}
        userName={user?.displayName ?? ''}
        userEmail={user?.primaryEmail ?? ''}
        userAvatar={user?.profileImageUrl ?? undefined}
        userRole={userRole}
        onUserItemClick={(item) => {
          if (item === 'profile') {
            router.push('/settings?section=profile')
            return
          }

          if (item === 'settings') {
            router.push('/settings')
            return
          }

          if (item === 'logout') {
            user?.signOut()
          }
        }}
        switchers={
          <>
            <SidebarTrigger />
            <div className="flex flex-wrap md:flex-nowrap items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Organization</span>
                <Switcher
                  items={organizationItems}
                  value={selectedOrganization}
                  onChange={(v) => setSelectedOrganization(v)}
                  actionLabel="+ Add organization"
                  onAction={() => router.push('/setup')}
                  placeholder="Select organization..."
                  searchPlaceholder="Search organization..."
                  emptyText="No organization found."
                  widthClassName="w-[220px]"
                  allowClear={false}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Project</span>
                <Switcher
                  items={projectItems}
                  value={selectedProject}
                  onChange={(v) => {
                    setSelectedProject(v)
                    if (!v) {
                      setSelectedCycle('')
                    }
                  }}
                  actionLabel="+ Add project"
                  onAction={() => router.push('/projects?new=1')}
                  placeholder="All projects"
                  searchPlaceholder="Search project..."
                  emptyText="No project found."
                  widthClassName="w-[220px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Cycle</span>
                <Switcher
                  items={cycleItems}
                  value={selectedCycle}
                  onChange={(v) => setSelectedCycle(v)}
                  actionLabel={selectedProject ? '+ Add cycle' : undefined}
                  onAction={
                    selectedProject
                      ? () => router.push('/cycles?new=1')
                      : undefined
                  }
                  placeholder={selectedProject ? 'All cycles' : 'Select project first'}
                  searchPlaceholder="Search cycle..."
                  emptyText="No cycle found."
                  widthClassName="w-[220px]"
                  disabled={!selectedProject}
                />
              </div>
            </div>
          </>
        }
      />
    </>
  )
}