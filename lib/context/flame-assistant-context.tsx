'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCoAgent, useCopilotAction, useCopilotAdditionalInstructions } from '@copilotkit/react-core';
import { useUser } from '@stackframe/stack';

// Agent state shape matching the Python agent
export interface FlameAssistantState {
  userContext: string;
  activeOrganizationId: string;
  activeProjectId: string;
  activeCycleId: string;
  currentView: string;
  lastAction: string;
  itemsCreated: number;
  planSteps: Array<{ title: string; status: string; note?: string }>;
  currentStepIndex: number;
  planStatus: string;
}

const initialState: FlameAssistantState = {
  userContext: '',
  activeOrganizationId: '',
  activeProjectId: '',
  activeCycleId: '',
  currentView: '',
  lastAction: '',
  itemsCreated: 0,
  planSteps: [],
  currentStepIndex: -1,
  planStatus: '',
};

type FlameAssistantContextType = {
  state: FlameAssistantState;
  setState: (newState: FlameAssistantState | ((prev: FlameAssistantState) => FlameAssistantState)) => void;
  refreshContext: () => Promise<void>;
};

const FlameAssistantContext = React.createContext<FlameAssistantContextType | undefined>(undefined);

export function FlameAssistantProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useUser();

  // CoAgent syncs state with the Python LangGraph agent
  const { state, setState } = useCoAgent<FlameAssistantState>({
    name: 'flame_assistant',
    initialState,
  });

  // Fetch current context from APIs
  const refreshContext = React.useCallback(async () => {
    try {
      // Get user's organization
      const orgResponse = await fetch('/api/v1/organizations');
      const orgData = await orgResponse.json();

      let activeOrgId = '';
      let activeProjId = '';
      let activeCycId = '';

      if (orgData.status === 'success' && orgData.organizations?.length > 0) {
        activeOrgId = String(orgData.organizations[0].id);

        // Get projects for this org
        const projResponse = await fetch(`/api/v1/projects?org_id=${activeOrgId}`);
        const projData = await projResponse.json();

        if (projData.status === 'success' && projData.projects?.length > 0) {
          activeProjId = String(projData.projects[0].id);

          // Get cycles for this project
          const cycleResponse = await fetch(`/api/v1/cycles?project_id=${activeProjId}`);
          const cycleData = await cycleResponse.json();

          if (cycleData.status === 'success' && cycleData.cycles?.length > 0) {
            activeCycId = String(cycleData.cycles[0].id);
          }
        }
      }

      const userContext = user
        ? `User: ${user.displayName || user.primaryEmail || 'Unknown'}`
        : 'Not authenticated';

      setState((prev) => ({
        ...(prev ?? initialState),
        userContext,
        activeOrganizationId: activeOrgId,
        activeProjectId: activeProjId,
        activeCycleId: activeCycId,
        currentView: pathname || '/',
        lastAction: prev?.lastAction ?? '',
        itemsCreated: prev?.itemsCreated ?? 0,
        planSteps: prev?.planSteps ?? [],
        currentStepIndex: prev?.currentStepIndex ?? -1,
        planStatus: prev?.planStatus ?? '',
      }));
    } catch (error) {
      console.error('Failed to refresh assistant context:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, pathname]);

  // Refresh context on mount and when user/path changes
  React.useEffect(() => {
    refreshContext();
  }, [refreshContext]);

  // Provide additional instructions to the agent about current state
  const s = state ?? initialState;
  useCopilotAdditionalInstructions({
    instructions: [
      'CURRENT FLAME CONTEXT (authoritative):',
      `User: ${s.userContext || 'Unknown'}`,
      `Active Organization ID: ${s.activeOrganizationId || 'None'}`,
      `Active Project ID: ${s.activeProjectId || 'None'}`,
      `Active Cycle ID: ${s.activeCycleId || 'None'}`,
      `Current View: ${s.currentView || 'Unknown'}`,
      `Last Action: ${s.lastAction || 'None'}`,
      '',
      'QUERY TOOLS (Read):',
      '- listOrganizations: List all organizations',
      '- listProjects [organization_id?]: List projects',
      '- listCycles [project_id?]: List cycles for a project',
      '- listSales [project_id?, cycle_id?]: List sales',
      '- listExpenses [project_id?, cycle_id?]: List expenses',
      '- getCurrentContext: Get active org/project/cycle details',
      '',
      'DETAIL VIEW TOOLS:',
      '- viewOrganizationDetails(id): View organization details',
      '- viewProjectDetails(id): View project details',
      '- viewCycleDetails(id): View cycle details page',
      '- viewSaleDetails(id): View sale details',
      '- viewExpenseDetails(id): View expense details page',
      '- viewCustomerDetails(id): View customer details',
      '',
      'EDIT TOOLS (open edit forms):',
      '- editOrganization(id): Open organization edit form',
      '- editProject(id): Open project edit form',
      '- editCycle(id): Open cycle edit form',
      '- editSale(id): Open sale edit form',
      '- editExpense(id): Open expense edit form',
      '',
      'CREATE TOOLS:',
      '- createOrganization(name, [countryCode], [currencyCode], [currencySymbol])',
      '- createProject(project_name, project_category_id, [organization_id])',
      '- createCycle(cycle_number, [cycle_name], [start_date], [end_date], [budget_allotment])',
      '- recordSale(quantity, price, [customer], [product_id], [cycle_id])',
      '- logExpense(amount, [description], [category_id], [vendor_id], [cycle_id])',
      '- generateInvoice(sale_ids): Generate invoice for sales',
      '',
      'UPDATE TOOLS:',
      '- updateOrganization(id, name, [countryCode], [currencyCode], [currencySymbol])',
      '- updateProject(id, project_name, [project_category_id], [currency_code])',
      '- updateCycle(id, [cycle_name], [cycle_number], [start_date], [end_date], [budget_allotment])',
      '- updateSale(id, [quantity], [price], [customer], [status], [sale_date])',
      '- updateExpense(id, [amount], [description], [expense_name], [expense_date])',
      '',
      'DELETE TOOLS:',
      '- deleteProject(id)',
      '- deleteCycle(id)',
      '- deleteSale(id)',
      '- deleteExpense(id)',
      '',
      'NAVIGATION:',
      '- navigateWorkspace(path): Navigate to a view',
    ].join('\n'),
  });

  // ============================================
  // COPILOT ACTIONS
  // ============================================

  // ACTION: createOrganization
  useCopilotAction({
    name: 'createOrganization',
    description: 'Create a new organization and assign the current user as admin. Requires organization name. Navigates to workspace management and opens the create form.',
    available: 'remote',
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Name of the organization' },
      { name: 'countryCode', type: 'string', required: false, description: 'Country code (e.g., UG, US)' },
      { name: 'currencyCode', type: 'string', required: false, description: 'Currency code (e.g., UGX, USD)' },
      { name: 'currencySymbol', type: 'string', required: false, description: 'Currency symbol (e.g., USh, $)' },
    ],
    handler: async ({ name, countryCode, currencyCode, currencySymbol }) => {
      try {
        // Navigate to workspace management with create form open
        router.push('/workspace-management?tab=organizations&action=new');

        const response = await fetch('/api/v1/organizations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, countryCode, currencyCode, currencySymbol }),
        });
        const data = await response.json();

        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            userContext: prev?.userContext ?? '',
            activeOrganizationId: String(data.organization.id),
            activeProjectId: prev?.activeProjectId ?? '',
            activeCycleId: prev?.activeCycleId ?? '',
            currentView: '/workspace-management?tab=organizations',
            lastAction: `created:organization:${data.organization.id}`,
            itemsCreated: (prev?.itemsCreated ?? 0) + 1,
            planSteps: prev?.planSteps ?? [],
            currentStepIndex: prev?.currentStepIndex ?? -1,
            planStatus: prev?.planStatus ?? '',
          }));
          return { success: true, organization: data.organization };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: createProject
  useCopilotAction({
    name: 'createProject',
    description: 'Create a new project in the active organization. Requires project name and category ID. Navigates to workspace management and opens the create form.',
    available: 'remote',
    parameters: [
      { name: 'project_name', type: 'string', required: true, description: 'Name of the project' },
      { name: 'project_category_id', type: 'number', required: true, description: 'ID of the project category' },
      { name: 'currency_code', type: 'string', required: false, description: 'Currency code for the project' },
    ],
    handler: async ({ project_name, project_category_id, currency_code }) => {
      try {
        // Navigate to workspace management with create form open
        router.push('/workspace-management?tab=projects&action=new');

        const response = await fetch('/api/v1/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_name, project_category_id, currency_code }),
        });
        const data = await response.json();

        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            userContext: prev?.userContext ?? '',
            activeOrganizationId: prev?.activeOrganizationId ?? '',
            activeProjectId: String(data.project.id),
            activeCycleId: prev?.activeCycleId ?? '',
            currentView: '/workspace-management?tab=projects',
            lastAction: `created:project:${data.project.id}`,
            itemsCreated: (prev?.itemsCreated ?? 0) + 1,
            planSteps: prev?.planSteps ?? [],
            currentStepIndex: prev?.currentStepIndex ?? -1,
            planStatus: prev?.planStatus ?? '',
          }));
          return { success: true, project: data.project };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: createCycle
  useCopilotAction({
    name: 'createCycle',
    description: 'Create a new cycle in a project. Requires cycle number. Navigates to workspace management and opens the create form.',
    available: 'remote',
    parameters: [
      { name: 'project_id', type: 'number', required: false, description: 'Project ID (defaults to active project)' },
      { name: 'cycle_number', type: 'number', required: true, description: 'Cycle number (e.g., 1, 2, 3)' },
      { name: 'cycle_name', type: 'string', required: false, description: 'Optional cycle name' },
      { name: 'start_date', type: 'string', required: false, description: 'Start date (YYYY-MM-DD)' },
      { name: 'end_date', type: 'string', required: false, description: 'End date (YYYY-MM-DD)' },
      { name: 'budget_allotment', type: 'number', required: false, description: 'Budget allotment amount' },
    ],
    handler: async ({ project_id, cycle_number, cycle_name, start_date, end_date, budget_allotment }) => {
      try {
        // Navigate to workspace management with create form open
        router.push('/workspace-management?tab=cycles&action=new');

        const s = state ?? initialState;
        const targetProjectId = project_id ?? (s.activeProjectId ? parseInt(s.activeProjectId, 10) : null);

        if (!targetProjectId) {
          return { success: false, error: 'No active project. Please specify project_id or create a project first.' };
        }

        const response = await fetch('/api/v1/cycles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: targetProjectId,
            cycle_number,
            cycle_name,
            start_date,
            end_date,
            budget_allotment,
          }),
        });
        const data = await response.json();

        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            userContext: prev?.userContext ?? '',
            activeOrganizationId: prev?.activeOrganizationId ?? '',
            activeProjectId: prev?.activeProjectId ?? '',
            activeCycleId: String(data.cycle.id),
            currentView: '/workspace-management?tab=cycles',
            lastAction: `created:cycle:${data.cycle.id}`,
            itemsCreated: (prev?.itemsCreated ?? 0) + 1,
            planSteps: prev?.planSteps ?? [],
            currentStepIndex: prev?.currentStepIndex ?? -1,
            planStatus: prev?.planStatus ?? '',
          }));
          return { success: true, cycle: data.cycle };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: recordSale
  useCopilotAction({
    name: 'recordSale',
    description: 'Record a new sale. Requires quantity and price. Navigates to sales management page and opens the add sale form.',
    available: 'remote',
    parameters: [
      { name: 'quantity', type: 'number', required: true, description: 'Quantity sold' },
      { name: 'price', type: 'number', required: true, description: 'Price per unit' },
      { name: 'customer', type: 'string', required: false, description: 'Customer name' },
      { name: 'product_id', type: 'number', required: false, description: 'Product ID' },
      { name: 'variant_id', type: 'number', required: false, description: 'Product variant ID' },
      { name: 'cycle_id', type: 'number', required: false, description: 'Cycle ID (defaults to active cycle)' },
      { name: 'project_id', type: 'number', required: false, description: 'Project ID (defaults to active project)' },
      { name: 'sale_date', type: 'string', required: false, description: 'Sale date (YYYY-MM-DD)' },
      { name: 'status', type: 'string', required: false, description: 'Sale status (completed, pending, cancelled)' },
    ],
    handler: async (params) => {
      try {
        // Navigate to sales management with add form open
        router.push('/sales-management?action=add-sale');

        const s = state ?? initialState;
        const body = {
          ...params,
          cycle_id: params.cycle_id ?? (s.activeCycleId ? parseInt(s.activeCycleId, 10) : null),
          project_id: params.project_id ?? (s.activeProjectId ? parseInt(s.activeProjectId, 10) : null),
        };

        const response = await fetch('/api/v1/sales', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json();

        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            userContext: prev?.userContext ?? '',
            activeOrganizationId: prev?.activeOrganizationId ?? '',
            activeProjectId: prev?.activeProjectId ?? '',
            activeCycleId: prev?.activeCycleId ?? '',
            currentView: '/sales-management?action=add-sale',
            lastAction: `created:sale:${data.sale.id}`,
            itemsCreated: (prev?.itemsCreated ?? 0) + 1,
            planSteps: prev?.planSteps ?? [],
            currentStepIndex: prev?.currentStepIndex ?? -1,
            planStatus: prev?.planStatus ?? '',
          }));
          return { success: true, sale: data.sale };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: logExpense
  useCopilotAction({
    name: 'logExpense',
    description: 'Log a new expense. Requires amount. Navigates to expense management page and opens the add expense form.',
    available: 'remote',
    parameters: [
      { name: 'amount', type: 'number', required: true, description: 'Expense amount' },
      { name: 'description', type: 'string', required: false, description: 'Expense description' },
      { name: 'expense_name', type: 'string', required: false, description: 'Expense name/title' },
      { name: 'category_id', type: 'number', required: false, description: 'Expense category ID' },
      { name: 'vendor_id', type: 'number', required: false, description: 'Vendor ID' },
      { name: 'cycle_id', type: 'number', required: false, description: 'Cycle ID (defaults to active cycle)' },
      { name: 'project_id', type: 'number', required: false, description: 'Project ID (defaults to active project)' },
      { name: 'expense_date', type: 'string', required: false, description: 'Expense date (YYYY-MM-DD)' },
      { name: 'payment_method_id', type: 'number', required: false, description: 'Payment method ID' },
    ],
    handler: async (params) => {
      try {
        // Navigate to expense management with add form open
        router.push('/expense-management?action=add-expense');

        const s = state ?? initialState;
        const body = {
          ...params,
          cycle_id: params.cycle_id ?? (s.activeCycleId ? parseInt(s.activeCycleId, 10) : null),
          project_id: params.project_id ?? (s.activeProjectId ? parseInt(s.activeProjectId, 10) : null),
        };

        const response = await fetch('/api/v1/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json();

        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            userContext: prev?.userContext ?? '',
            activeOrganizationId: prev?.activeOrganizationId ?? '',
            activeProjectId: prev?.activeProjectId ?? '',
            activeCycleId: prev?.activeCycleId ?? '',
            currentView: '/expense-management?action=add-expense',
            lastAction: `created:expense:${data.expense.id}`,
            itemsCreated: (prev?.itemsCreated ?? 0) + 1,
            planSteps: prev?.planSteps ?? [],
            currentStepIndex: prev?.currentStepIndex ?? -1,
            planStatus: prev?.planStatus ?? '',
          }));
          return { success: true, expense: data.expense };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: generateInvoice
  useCopilotAction({
    name: 'generateInvoice',
    description: 'Generate an invoice for one or more sales. Requires array of sale IDs.',
    available: 'remote',
    parameters: [
      { name: 'sale_ids', type: 'object', required: true, description: 'Array of sale IDs to include in invoice (as JSON array)' },
      { name: 'customer_id', type: 'number', required: false, description: 'Customer ID' },
      { name: 'due_date', type: 'string', required: false, description: 'Invoice due date (YYYY-MM-DD)' },
    ],
    handler: async ({ sale_ids, customer_id, due_date }) => {
      try {
        const response = await fetch('/api/v1/invoices/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sale_ids, customer_id, due_date }),
        });
        const data = await response.json();

        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            userContext: prev?.userContext ?? '',
            activeOrganizationId: prev?.activeOrganizationId ?? '',
            activeProjectId: prev?.activeProjectId ?? '',
            activeCycleId: prev?.activeCycleId ?? '',
            currentView: prev?.currentView ?? '',
            lastAction: `created:invoice:${data.invoice?.id || 'generated'}`,
            itemsCreated: prev?.itemsCreated ?? 0,
            planSteps: prev?.planSteps ?? [],
            currentStepIndex: prev?.currentStepIndex ?? -1,
            planStatus: prev?.planStatus ?? '',
          }));
          return { success: true, invoice: data.invoice };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: listOrganizations
  useCopilotAction({
    name: 'listOrganizations',
    description: 'List all organizations the user has access to. Returns organization details including id, name, and creation date. Navigates to workspace management.',
    available: 'remote',
    parameters: [],
    handler: async () => {
      try {
        // Navigate to workspace management organizations tab
        router.push('/workspace-management?tab=organizations');

        const response = await fetch('/api/v1/organizations/all');
        const data = await response.json();

        if (data.status === 'success') {
          const orgs = data.organizations || [];
          // Update state with first org as active if none selected
          if (orgs.length > 0) {
            const s = state ?? initialState;
            if (!s.activeOrganizationId) {
              setState((prev) => ({
                ...(prev ?? initialState),
                userContext: prev?.userContext ?? '',
                activeOrganizationId: String(orgs[0].id),
                activeProjectId: prev?.activeProjectId ?? '',
                activeCycleId: prev?.activeCycleId ?? '',
                currentView: '/workspace-management?tab=organizations',
                lastAction: 'listed:organizations',
                itemsCreated: prev?.itemsCreated ?? 0,
                planSteps: prev?.planSteps ?? [],
                currentStepIndex: prev?.currentStepIndex ?? -1,
                planStatus: prev?.planStatus ?? '',
              }));
            }
          }
          return {
            success: true,
            organizations: orgs.map((org: { id: number; name: string; created_at?: string }) => ({
              id: org.id,
              name: org.name,
              created_at: org.created_at,
            })),
            count: orgs.length
          };
        }
        return { success: false, error: data.message, organizations: [] };
      } catch (error) {
        return { success: false, error: String(error), organizations: [] };
      }
    },
  });

  // ACTION: listProjects
  useCopilotAction({
    name: 'listProjects',
    description: 'List all projects, optionally filtered by organization. Returns project details including id, name, category, and dates. Navigates to workspace management.',
    available: 'remote',
    parameters: [
      { name: 'organization_id', type: 'number', required: false, description: 'Organization ID to filter projects by (defaults to active organization)' },
    ],
    handler: async ({ organization_id }) => {
      try {
        // Navigate to workspace management projects tab
        router.push('/workspace-management?tab=projects');

        const s = state ?? initialState;
        const orgId = organization_id ?? (s.activeOrganizationId ? parseInt(s.activeOrganizationId, 10) : null);

        const url = orgId ? `/api/v1/projects?org_id=${orgId}` : '/api/v1/projects';
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'success') {
          const projects = data.projects || [];
          setState((prev) => ({
            ...(prev ?? initialState),
            currentView: '/workspace-management?tab=projects',
            lastAction: 'listed:projects',
          }));
          return {
            success: true,
            projects: projects.map((p: { id: number; project_name: string; project_category_id?: number; start_date?: string; end_date?: string; created_at?: string }) => ({
              id: p.id,
              project_name: p.project_name,
              project_category_id: p.project_category_id,
              start_date: p.start_date,
              end_date: p.end_date,
              created_at: p.created_at,
            })),
            count: projects.length,
            organization_id: orgId,
          };
        }
        return { success: false, error: data.message, projects: [] };
      } catch (error) {
        return { success: false, error: String(error), projects: [] };
      }
    },
  });

  // ACTION: listCycles
  useCopilotAction({
    name: 'listCycles',
    description: 'List all cycles, optionally filtered by project. Returns cycle details including id, name, number, dates, and budget. Navigates to workspace management.',
    available: 'remote',
    parameters: [
      { name: 'project_id', type: 'number', required: false, description: 'Project ID to filter cycles by (defaults to active project)' },
    ],
    handler: async ({ project_id }) => {
      try {
        // Navigate to workspace management cycles tab
        router.push('/workspace-management?tab=cycles');

        const s = state ?? initialState;
        const projId = project_id ?? (s.activeProjectId ? parseInt(s.activeProjectId, 10) : null);

        if (!projId) {
          return { success: false, error: 'No project specified and no active project selected', cycles: [] };
        }

        const response = await fetch(`/api/v1/cycles?project_id=${projId}`);
        const data = await response.json();

        if (data.status === 'success') {
          const cycles = data.cycles || [];
          setState((prev) => ({
            ...(prev ?? initialState),
            currentView: '/workspace-management?tab=cycles',
            lastAction: 'listed:cycles',
          }));
          return {
            success: true,
            cycles: cycles.map((c: { id: number; cycle_name?: string; cycle_number: number; start_date?: string; end_date?: string; budget_allotment?: number }) => ({
              id: c.id,
              cycle_name: c.cycle_name,
              cycle_number: c.cycle_number,
              start_date: c.start_date,
              end_date: c.end_date,
              budget_allotment: c.budget_allotment,
            })),
            count: cycles.length,
            project_id: projId,
          };
        }
        return { success: false, error: data.message, cycles: [] };
      } catch (error) {
        return { success: false, error: String(error), cycles: [] };
      }
    },
  });

  // ACTION: getCurrentContext
  useCopilotAction({
    name: 'getCurrentContext',
    description: 'Get the current Flame context including active organization, project, cycle, and user information. Use this to understand what the user is currently working with.',
    available: 'remote',
    parameters: [],
    handler: async () => {
      try {
        const s = state ?? initialState;

        // Fetch fresh data
        const [orgRes, projRes, cycleRes] = await Promise.all([
          fetch('/api/v1/organizations/all'),
          s.activeOrganizationId ? fetch(`/api/v1/projects?org_id=${s.activeOrganizationId}`) : null,
          s.activeProjectId ? fetch(`/api/v1/cycles?project_id=${s.activeProjectId}`) : null,
        ]);

        const orgData = orgRes ? await orgRes.json() : null;
        const projData = projRes ? await projRes.json() : null;
        const cycleData = cycleRes ? await cycleRes.json() : null;

        const activeOrg = orgData?.organizations?.find((o: { id: number }) => String(o.id) === s.activeOrganizationId);
        const activeProj = projData?.projects?.find((p: { id: number }) => String(p.id) === s.activeProjectId);
        const activeCycle = cycleData?.cycles?.find((c: { id: number }) => String(c.id) === s.activeCycleId);

        return {
          success: true,
          context: {
            user: s.userContext,
            activeOrganization: activeOrg ? { id: activeOrg.id, name: activeOrg.name } : null,
            activeProject: activeProj ? { id: activeProj.id, name: activeProj.project_name } : null,
            activeCycle: activeCycle ? { id: activeCycle.id, name: activeCycle.cycle_name, number: activeCycle.cycle_number } : null,
            currentView: s.currentView,
            lastAction: s.lastAction,
          },
          counts: {
            organizations: orgData?.organizations?.length ?? 0,
            projects: projData?.projects?.length ?? 0,
            cycles: cycleData?.cycles?.length ?? 0,
          },
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: updateOrganization
  useCopilotAction({
    name: 'updateOrganization',
    description: 'Update an existing organization. Requires organization ID and name.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Organization ID to update' },
      { name: 'name', type: 'string', required: true, description: 'New organization name' },
      { name: 'countryCode', type: 'string', required: false, description: 'Country code (e.g., UG, US)' },
      { name: 'currencyCode', type: 'string', required: false, description: 'Currency code (e.g., UGX, USD)' },
      { name: 'currencySymbol', type: 'string', required: false, description: 'Currency symbol (e.g., USh, $)' },
    ],
    handler: async ({ id, name, countryCode, currencyCode, currencySymbol }) => {
      try {
        const response = await fetch('/api/v1/organizations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name, countryCode, currencyCode, currencySymbol }),
        });
        const data = await response.json();
        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            userContext: prev?.userContext ?? '',
            activeOrganizationId: prev?.activeOrganizationId ?? '',
            activeProjectId: prev?.activeProjectId ?? '',
            activeCycleId: prev?.activeCycleId ?? '',
            currentView: prev?.currentView ?? '',
            lastAction: `updated:organization:${id}`,
            itemsCreated: prev?.itemsCreated ?? 0,
            planSteps: prev?.planSteps ?? [],
            currentStepIndex: prev?.currentStepIndex ?? -1,
            planStatus: prev?.planStatus ?? '',
          }));
          return { success: true, organization: data.organization };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: updateProject
  useCopilotAction({
    name: 'updateProject',
    description: 'Update an existing project. Requires project ID and name.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Project ID to update' },
      { name: 'project_name', type: 'string', required: true, description: 'New project name' },
      { name: 'project_category_id', type: 'number', required: false, description: 'Project category ID' },
      { name: 'currency_code', type: 'string', required: false, description: 'Currency code for the project' },
    ],
    handler: async ({ id, project_name, project_category_id, currency_code }) => {
      try {
        const response = await fetch('/api/v1/projects', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, project_name, project_category_id, currency_code }),
        });
        const data = await response.json();
        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            lastAction: `updated:project:${id}`,
          }));
          return { success: true, project: data.project };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: deleteProject
  useCopilotAction({
    name: 'deleteProject',
    description: 'Delete a project by ID. Requires project ID.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Project ID to delete' },
    ],
    handler: async ({ id }) => {
      try {
        const response = await fetch(`/api/v1/projects?id=${id}`, {
          method: 'DELETE',
        });
        const data = await response.json();
        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            lastAction: `deleted:project:${id}`,
            activeProjectId: prev?.activeProjectId === String(id) ? '' : prev?.activeProjectId ?? '',
          }));
          return { success: true, deletedId: id };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: updateCycle
  useCopilotAction({
    name: 'updateCycle',
    description: 'Update an existing cycle. Requires cycle ID.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Cycle ID to update' },
      { name: 'cycle_name', type: 'string', required: false, description: 'Cycle name' },
      { name: 'cycle_number', type: 'number', required: false, description: 'Cycle number' },
      { name: 'start_date', type: 'string', required: false, description: 'Start date (YYYY-MM-DD)' },
      { name: 'end_date', type: 'string', required: false, description: 'End date (YYYY-MM-DD)' },
      { name: 'budget_allotment', type: 'number', required: false, description: 'Budget allotment amount' },
    ],
    handler: async ({ id, cycle_name, cycle_number, start_date, end_date, budget_allotment }) => {
      try {
        const response = await fetch('/api/v1/cycles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, cycle_name, cycle_number, start_date, end_date, budget_allotment }),
        });
        const data = await response.json();
        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            lastAction: `updated:cycle:${id}`,
          }));
          return { success: true, cycle: data.cycle };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: deleteCycle
  useCopilotAction({
    name: 'deleteCycle',
    description: 'Delete a cycle by ID. Requires cycle ID.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Cycle ID to delete' },
    ],
    handler: async ({ id }) => {
      try {
        const response = await fetch(`/api/v1/cycles?id=${id}`, {
          method: 'DELETE',
        });
        const data = await response.json();
        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            lastAction: `deleted:cycle:${id}`,
            activeCycleId: prev?.activeCycleId === String(id) ? '' : prev?.activeCycleId ?? '',
          }));
          return { success: true, deletedId: id };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: listSales
  useCopilotAction({
    name: 'listSales',
    description: 'List sales, optionally filtered by project or cycle. Returns sale details. Navigates to sales management.',
    available: 'remote',
    parameters: [
      { name: 'project_id', type: 'number', required: false, description: 'Project ID filter' },
      { name: 'cycle_id', type: 'number', required: false, description: 'Cycle ID filter' },
    ],
    handler: async ({ project_id, cycle_id }) => {
      try {
        // Navigate to sales management
        router.push('/sales-management');

        const s = state ?? initialState;
        const projId = project_id ?? (s.activeProjectId ? parseInt(s.activeProjectId, 10) : null);
        const cycId = cycle_id ?? (s.activeCycleId ? parseInt(s.activeCycleId, 10) : null);

        const params = new URLSearchParams();
        if (projId) params.append('project_id', String(projId));
        if (cycId) params.append('cycle_id', String(cycId));

        const response = await fetch(`/api/v1/sales?${params.toString()}`);
        const data = await response.json();

        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            currentView: '/sales-management',
            lastAction: 'listed:sales',
          }));
          return { success: true, sales: data.sales || [], count: (data.sales || []).length };
        }
        return { success: false, error: data.message, sales: [] };
      } catch (error) {
        return { success: false, error: String(error), sales: [] };
      }
    },
  });

  // ACTION: updateSale
  useCopilotAction({
    name: 'updateSale',
    description: 'Update an existing sale. Requires sale ID.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Sale ID to update' },
      { name: 'quantity', type: 'number', required: false, description: 'Quantity sold' },
      { name: 'price', type: 'number', required: false, description: 'Price per unit' },
      { name: 'customer', type: 'string', required: false, description: 'Customer name' },
      { name: 'status', type: 'string', required: false, description: 'Sale status (e.g., completed, pending)' },
      { name: 'sale_date', type: 'string', required: false, description: 'Sale date (YYYY-MM-DD)' },
    ],
    handler: async ({ id, quantity, price, customer, status, sale_date }) => {
      try {
        const response = await fetch('/api/v1/sales', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, quantity, price, customer, status, sale_date }),
        });
        const data = await response.json();
        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            lastAction: `updated:sale:${id}`,
          }));
          return { success: true, sale: data.sale };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: deleteSale
  useCopilotAction({
    name: 'deleteSale',
    description: 'Delete a sale by ID. Requires sale ID.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Sale ID to delete' },
    ],
    handler: async ({ id }) => {
      try {
        const response = await fetch(`/api/v1/sales?id=${id}`, {
          method: 'DELETE',
        });
        const data = await response.json();
        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            lastAction: `deleted:sale:${id}`,
          }));
          return { success: true, deletedId: id };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: listExpenses
  useCopilotAction({
    name: 'listExpenses',
    description: 'List expenses, optionally filtered by project or cycle. Returns expense details. Navigates to expense management.',
    available: 'remote',
    parameters: [
      { name: 'project_id', type: 'number', required: false, description: 'Project ID filter' },
      { name: 'cycle_id', type: 'number', required: false, description: 'Cycle ID filter' },
    ],
    handler: async ({ project_id, cycle_id }) => {
      try {
        // Navigate to expense management
        router.push('/expense-management');

        const s = state ?? initialState;
        const projId = project_id ?? (s.activeProjectId ? parseInt(s.activeProjectId, 10) : null);
        const cycId = cycle_id ?? (s.activeCycleId ? parseInt(s.activeCycleId, 10) : null);

        const params = new URLSearchParams();
        if (projId) params.append('project_id', String(projId));
        if (cycId) params.append('cycle_id', String(cycId));

        const response = await fetch(`/api/v1/expenses?${params.toString()}`);
        const data = await response.json();

        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            currentView: '/expense-management',
            lastAction: 'listed:expenses',
          }));
          return { success: true, expenses: data.expenses || [], count: (data.expenses || []).length };
        }
        return { success: false, error: data.message, expenses: [] };
      } catch (error) {
        return { success: false, error: String(error), expenses: [] };
      }
    },
  });

  // ACTION: updateExpense
  useCopilotAction({
    name: 'updateExpense',
    description: 'Update an existing expense. Requires expense ID.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Expense ID to update' },
      { name: 'amount', type: 'number', required: false, description: 'Expense amount' },
      { name: 'description', type: 'string', required: false, description: 'Expense description' },
      { name: 'expense_name', type: 'string', required: false, description: 'Expense name' },
      { name: 'expense_date', type: 'string', required: false, description: 'Expense date (YYYY-MM-DD)' },
    ],
    handler: async ({ id, amount, description, expense_name, expense_date }) => {
      try {
        const response = await fetch('/api/v1/expenses', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, amount, description, expense_name, expense_date }),
        });
        const data = await response.json();
        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            lastAction: `updated:expense:${id}`,
          }));
          return { success: true, expense: data.expense };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: deleteExpense
  useCopilotAction({
    name: 'deleteExpense',
    description: 'Delete an expense by ID. Requires expense ID.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Expense ID to delete' },
    ],
    handler: async ({ id }) => {
      try {
        const response = await fetch(`/api/v1/expenses?id=${id}`, {
          method: 'DELETE',
        });
        const data = await response.json();
        if (data.status === 'success') {
          setState((prev) => ({
            ...(prev ?? initialState),
            lastAction: `deleted:expense:${id}`,
          }));
          return { success: true, deletedId: id };
        }
        return { success: false, error: data.message };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: navigateWorkspace
  useCopilotAction({
    name: 'navigateWorkspace',
    description: 'Navigate to a different view/page in the Flame application.',
    available: 'remote',
    parameters: [
      { name: 'path', type: 'string', required: true, description: 'Path to navigate to (e.g., "/", "/sales-management", "/expense-management", "/reports", "/inventory")' },
    ],
    handler: async ({ path }) => {
      try {
        // Validate path is relative and safe
        if (!path.startsWith('/')) {
          return { success: false, error: 'Path must start with "/"' };
        }

        router.push(path);

        setState((prev) => ({
          ...(prev ?? initialState),
          userContext: prev?.userContext ?? '',
          activeOrganizationId: prev?.activeOrganizationId ?? '',
          activeProjectId: prev?.activeProjectId ?? '',
          activeCycleId: prev?.activeCycleId ?? '',
          currentView: path,
          lastAction: `navigated:${path}`,
          itemsCreated: prev?.itemsCreated ?? 0,
          planSteps: prev?.planSteps ?? [],
          currentStepIndex: prev?.currentStepIndex ?? -1,
          planStatus: prev?.planStatus ?? '',
        }));

        return { success: true, navigatedTo: path };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ============================================
  // OPEN FORM ACTIONS (New)
  // ============================================

  // ACTION: openExpenseForm
  useCopilotAction({
    name: 'openExpenseForm',
    description: 'Open the UI form for the user to add a new Expense.',
    available: 'remote',
    handler: async () => {
      router.push('/expense-management?action=add-expense');
      return { success: true };
    },
  });

  // ACTION: openVendorForm
  useCopilotAction({
    name: 'openVendorForm',
    description: 'Open the UI form for the user to add a new Vendor.',
    available: 'remote',
    handler: async () => {
      router.push('/expense-management?tab=vendors&action=add-vendor');
      return { success: true };
    },
  });

  // ACTION: openPaymentMethodForm
  useCopilotAction({
    name: 'openPaymentMethodForm',
    description: 'Open the UI form for the user to add a new Payment Method.',
    available: 'remote',
    handler: async () => {
      router.push('/expense-management?tab=payment-methods&action=add-payment-method');
      return { success: true };
    },
  });

  // ACTION: openSaleForm
  useCopilotAction({
    name: 'openSaleForm',
    description: 'Open the UI form for the user to record a new Sale.',
    available: 'remote',
    handler: async () => {
      router.push('/sales-management?action=add-sale');
      return { success: true };
    },
  });

  // ACTION: openInvoiceForm
  useCopilotAction({
    name: 'openInvoiceForm',
    description: 'Open the UI form for the user to create a new Invoice.',
    available: 'remote',
    handler: async () => {
      router.push('/sales-management?tab=invoices&action=create-invoice');
      return { success: true };
    },
  });

  // ACTION: openCustomerForm
  useCopilotAction({
    name: 'openCustomerForm',
    description: 'Open the UI form for the user to add a new Customer.',
    available: 'remote',
    handler: async () => {
      router.push('/sales-management?tab=customers&action=add-customer');
      return { success: true };
    },
  });

  // ACTION: openProjectForm
  useCopilotAction({
    name: 'openProjectForm',
    description: 'Open the UI form for the user to create a new Project.',
    available: 'remote',
    handler: async () => {
      router.push('/workspace-management?tab=projects&action=new');
      return { success: true };
    },
  });

  // ACTION: openOrganizationForm
  useCopilotAction({
    name: 'openOrganizationForm',
    description: 'Open the UI form for the user to create a new Organization.',
    available: 'remote',
    handler: async () => {
      router.push('/workspace-management?tab=organizations&action=new');
      return { success: true };
    },
  });

  // ACTION: openCycleForm
  useCopilotAction({
    name: 'openCycleForm',
    description: 'Open the UI form for the user to create a new financial Cycle.',
    available: 'remote',
    handler: async () => {
      router.push('/workspace-management?tab=cycles&action=new');
      return { success: true };
    },
  });

  // ACTION: openInventoryForm
  useCopilotAction({
    name: 'openInventoryForm',
    description: 'Open the UI form for the user to add a new Inventory Item.',
    available: 'remote',
    handler: async () => {
      router.push('/inventory?action=add-inventory');
      return { success: true };
    },
  });

  // ACTION: editOrganization
  useCopilotAction({
    name: 'editOrganization',
    description: 'Open the edit form for an organization. Navigates to workspace management with edit mode active.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Organization ID to edit' },
    ],
    handler: async ({ id }) => {
      try {
        // Navigate to workspace management with edit form open
        router.push(`/workspace-management?tab=organizations&action=edit&org_id=${id}`);

        setState((prev) => ({
          ...(prev ?? initialState),
          activeOrganizationId: String(id),
          currentView: `/workspace-management?tab=organizations&action=edit&org_id=${id}`,
          lastAction: `editing:organization:${id}`,
        }));

        return { success: true, organizationId: id };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: editProject
  useCopilotAction({
    name: 'editProject',
    description: 'Open the edit form for a project. Navigates to workspace management with edit mode active.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Project ID to edit' },
    ],
    handler: async ({ id }) => {
      try {
        // Navigate to workspace management with edit form open
        router.push(`/workspace-management?tab=projects&action=edit&project_id=${id}`);

        setState((prev) => ({
          ...(prev ?? initialState),
          activeProjectId: String(id),
          currentView: `/workspace-management?tab=projects&action=edit&project_id=${id}`,
          lastAction: `editing:project:${id}`,
        }));

        return { success: true, projectId: id };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: editCycle
  useCopilotAction({
    name: 'editCycle',
    description: 'Open the edit form for a cycle. Navigates to workspace management with edit mode active.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Cycle ID to edit' },
    ],
    handler: async ({ id }) => {
      try {
        // Navigate to workspace management with edit form open
        router.push(`/workspace-management?tab=cycles&action=edit&cycle_id=${id}`);

        setState((prev) => ({
          ...(prev ?? initialState),
          activeCycleId: String(id),
          currentView: `/workspace-management?tab=cycles&action=edit&cycle_id=${id}`,
          lastAction: `editing:cycle:${id}`,
        }));

        return { success: true, cycleId: id };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: editSale
  useCopilotAction({
    name: 'editSale',
    description: 'Open the edit form for a sale. Navigates to sales management with edit mode active.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Sale ID to edit' },
    ],
    handler: async ({ id }) => {
      try {
        // Navigate to sales management with edit form open
        router.push(`/sales-management?action=edit&sale_id=${id}`);

        setState((prev) => ({
          ...(prev ?? initialState),
          currentView: `/sales-management?action=edit&sale_id=${id}`,
          lastAction: `editing:sale:${id}`,
        }));

        return { success: true, saleId: id };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: editExpense
  useCopilotAction({
    name: 'editExpense',
    description: 'Open the edit form for an expense. Navigates to expense management with edit mode active.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Expense ID to edit' },
    ],
    handler: async ({ id }) => {
      try {
        // Navigate to expense management with edit form open
        router.push(`/expense-management?action=edit&expense_id=${id}`);

        setState((prev) => ({
          ...(prev ?? initialState),
          currentView: `/expense-management?action=edit&expense_id=${id}`,
          lastAction: `editing:expense:${id}`,
        }));

        return { success: true, expenseId: id };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: viewOrganizationDetails
  useCopilotAction({
    name: 'viewOrganizationDetails',
    description: 'View details of a specific organization. Navigates to workspace management with the organization selected.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Organization ID to view' },
    ],
    handler: async ({ id }) => {
      try {
        // Navigate to workspace management with organization selected
        router.push(`/workspace-management?tab=organizations&org_id=${id}`);

        setState((prev) => ({
          ...(prev ?? initialState),
          activeOrganizationId: String(id),
          currentView: `/workspace-management?tab=organizations&org_id=${id}`,
          lastAction: `viewed:organization:${id}`,
        }));

        return { success: true, organizationId: id };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: viewProjectDetails
  useCopilotAction({
    name: 'viewProjectDetails',
    description: 'View details of a specific project. Navigates to workspace management with the project selected.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Project ID to view' },
    ],
    handler: async ({ id }) => {
      try {
        // Navigate to workspace management with project selected
        router.push(`/workspace-management?tab=projects&project_id=${id}`);

        setState((prev) => ({
          ...(prev ?? initialState),
          activeProjectId: String(id),
          currentView: `/workspace-management?tab=projects&project_id=${id}`,
          lastAction: `viewed:project:${id}`,
        }));

        return { success: true, projectId: id };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: viewCycleDetails
  useCopilotAction({
    name: 'viewCycleDetails',
    description: 'View details of a specific cycle including sales, expenses, and budget. Navigates to the cycle detail page.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Cycle ID to view' },
    ],
    handler: async ({ id }) => {
      try {
        // Navigate to cycle detail page
        router.push(`/cycles/${id}`);

        setState((prev) => ({
          ...(prev ?? initialState),
          activeCycleId: String(id),
          currentView: `/cycles/${id}`,
          lastAction: `viewed:cycle:${id}`,
        }));

        return { success: true, cycleId: id };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: viewSaleDetails
  useCopilotAction({
    name: 'viewSaleDetails',
    description: 'View details of a specific sale. Navigates to sales management with the sale highlighted.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Sale ID to view' },
    ],
    handler: async ({ id }) => {
      try {
        // Navigate to sales management with sale selected
        router.push(`/sales-management?sale_id=${id}`);

        setState((prev) => ({
          ...(prev ?? initialState),
          currentView: `/sales-management?sale_id=${id}`,
          lastAction: `viewed:sale:${id}`,
        }));

        return { success: true, saleId: id };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: viewExpenseDetails
  useCopilotAction({
    name: 'viewExpenseDetails',
    description: 'View details of a specific expense including receipt and payment info. Navigates to the expense detail page.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Expense ID to view' },
    ],
    handler: async ({ id }) => {
      try {
        // Navigate to expense detail page
        router.push(`/expenses/${id}`);

        setState((prev) => ({
          ...(prev ?? initialState),
          currentView: `/expenses/${id}`,
          lastAction: `viewed:expense:${id}`,
        }));

        return { success: true, expenseId: id };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // ACTION: viewCustomerDetails
  useCopilotAction({
    name: 'viewCustomerDetails',
    description: 'View details of a specific customer including their sales history. Navigates to the customer detail page.',
    available: 'remote',
    parameters: [
      { name: 'id', type: 'number', required: true, description: 'Customer ID to view' },
    ],
    handler: async ({ id }) => {
      try {
        // Navigate to customer detail page
        router.push(`/customers/${id}`);

        setState((prev) => ({
          ...(prev ?? initialState),
          currentView: `/customers/${id}`,
          lastAction: `viewed:customer:${id}`,
        }));

        return { success: true, customerId: id };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  // Wrap setState to ensure it always receives a defined state
  const setFlameState = React.useCallback(
    (newState: FlameAssistantState | ((prev: FlameAssistantState) => FlameAssistantState)) => {
      setState((prev) => {
        const prevDefined = prev ?? initialState;
        return typeof newState === 'function'
          ? (newState as (p: FlameAssistantState) => FlameAssistantState)(prevDefined)
          : newState;
      });
    },
    [setState]
  );

  return (
    <FlameAssistantContext.Provider value={{ state: state ?? initialState, setState: setFlameState, refreshContext }}>
      {children}
    </FlameAssistantContext.Provider>
  );
}

export function useFlameAssistant() {
  const context = React.useContext(FlameAssistantContext);
  if (context === undefined) {
    throw new Error('useFlameAssistant must be used within a FlameAssistantProvider');
  }
  return context;
}
