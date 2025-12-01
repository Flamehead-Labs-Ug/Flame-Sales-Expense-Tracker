'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface Project {
  id: number
  project_name: string
  project_category_id?: number
  currency_code?: string
}

interface Cycle {
  id: number
  cycle_name: string
  project_id: number
}

interface Organization {
  id: number
  name: string
  description?: string
  country_code?: string
  currency_code?: string
  currency_symbol?: string
}

interface FilterContextType {
  selectedProject: string
  selectedCycle: string
  selectedOrganization: string
  projects: Project[]
  cycles: Cycle[]
  organizations: Organization[]
  currentCurrencyCode: string
  setSelectedProject: (projectId: string) => void
  setSelectedCycle: (cycleId: string) => void
  setSelectedOrganization: (orgId: string) => void
  loadCyclesForProject: (projectId: string) => void
  refreshProjects: () => void
  refreshCycles: () => void
  refreshOrganizations: () => void
}

const FilterContext = createContext<FilterContextType | undefined>(undefined)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [selectedCycle, setSelectedCycle] = useState<string>('')
  const [selectedOrganization, setSelectedOrganization] = useState<string>('')
  const [projects, setProjects] = useState<Project[]>([])
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])

  const currentOrg = organizations.find(org => org.id.toString() === selectedOrganization)
  const currentProject = projects.find(project => project.id.toString() === selectedProject)
  const currentCurrencyCode = (currentProject as any)?.currency_code || currentOrg?.currency_code || ''

  const loadProjects = async () => {
    try {
      const url = selectedOrganization ? `/api/projects?org_id=${selectedOrganization}` : '/api/projects'
      const response = await fetch(url)
      const data = await response.json()
      if (data.status === 'success') {
        setProjects(data.projects || [])
      }
    } catch (error) {
      console.error('Failed to load projects:', error)
    }
  }

  const loadOrganizations = async () => {
    try {
      const response = await fetch('/api/organizations/all')
      const data = await response.json()
      if (data.status === 'success') {
        setOrganizations(data.organizations || [])
        if (data.organizations.length > 0 && !selectedOrganization) {
          setSelectedOrganization(data.organizations[0].id.toString())
        }
      }
    } catch (error) {
      console.error('Failed to load organizations:', error)
    }
  }

  useEffect(() => {
    loadOrganizations()
  }, [])

  useEffect(() => {
    if (selectedOrganization) {
      loadProjects()
    }
  }, [selectedOrganization])

  const loadCyclesForProject = async (projectId: string) => {
    if (!projectId) {
      setCycles([])
      return
    }

    try {
      const url = selectedOrganization ? 
        `/api/cycles?project_id=${projectId}&org_id=${selectedOrganization}` : 
        `/api/cycles?project_id=${projectId}`
      const response = await fetch(url)
      const data = await response.json()
      
      if (data.status === 'success') {
        setCycles(data.cycles || [])
      } else {
        setCycles([])
      }
    } catch (error) {
      setCycles([])
    }
  }

  const handleSetSelectedProject = (projectId: string) => {
    setSelectedProject(projectId)
    setSelectedCycle('')
    loadCyclesForProject(projectId)
  }

  const refreshCycles = () => {
    if (selectedProject) {
      loadCyclesForProject(selectedProject)
    }
  }

  return (
    <FilterContext.Provider value={{
      selectedProject,
      selectedCycle,
      selectedOrganization,
      projects,
      cycles,
      organizations,
      currentCurrencyCode,
      setSelectedProject: handleSetSelectedProject,
      setSelectedCycle,
      setSelectedOrganization,
      loadCyclesForProject,
      refreshProjects: loadProjects,
      refreshCycles,
      refreshOrganizations: loadOrganizations
    }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilter() {
  const context = useContext(FilterContext)
  if (context === undefined) {
    throw new Error('useFilter must be used within a FilterProvider')
  }
  return context
}