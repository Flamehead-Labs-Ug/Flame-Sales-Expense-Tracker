'use client'

import * as React from 'react'
import { AuthGuard } from '@/components/auth-guard'
import { CopilotChat } from '@copilotkit/react-ui'
import { useFrontendTool } from '@copilotkit/react-core'
import { UIResourceRenderer } from '@mcp-ui/client'

interface MCPToolCallProps {
  status: 'complete' | 'inProgress' | 'executing'
  name?: string
  args?: any
  result?: any
}

function MCPToolCall({ status, name = '', args, result }: MCPToolCallProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const format = (content: any): string => {
    if (!content) return ''
    const text = typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content)
    return text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }

  return (
    <div className="bg-[#1e2738] rounded-lg overflow-hidden w-full">
      <div className="p-3 flex items-center cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <span className="text-white text-sm overflow-hidden text-ellipsis">{name || 'MCP Tool Call'}</span>
        <div className="ml-auto">
          <div
            className={`w-2 h-2 rounded-full ${
              status === 'complete'
                ? 'bg-gray-300'
                : status === 'inProgress' || status === 'executing'
                  ? 'bg-gray-500 animate-pulse'
                  : 'bg-gray-700'
            }`}
          />
        </div>
      </div>

      {isOpen && (
        <div className="px-4 pb-4 text-gray-300 font-mono text-xs">
          {args && (
            <div className="mb-4">
              <div className="text-gray-400 mb-2">Parameters:</div>
              <pre className="whitespace-pre-wrap max-h-[200px] overflow-auto">{format(args)}</pre>
            </div>
          )}

          {status === 'complete' && result && (
            <div>
              <div className="text-gray-400 mb-2">Result:</div>
              <pre className="whitespace-pre-wrap max-h-[200px] overflow-auto">{format(result)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AssistantPage() {
  const recentToolCallsRef = React.useRef(new Map<string, number>())

  const shouldDedupe = (name: string, args: unknown, windowMs = 2000) => {
    const key = `${name}:${JSON.stringify(args ?? {})}`
    const now = Date.now()
    const last = recentToolCallsRef.current.get(key)
    if (last && now - last < windowMs) return true
    recentToolCallsRef.current.set(key, now)
    return false
  }

  useFrontendTool(
    {
      name: 'mcp_tool',
      description:
        'Call any MCP worker tool by name. Use this for non-UI tools too. If the result includes an MCP-UI resource, it will be rendered.',
      parameters: [
        { name: 'toolName', type: 'string', required: true },
        { name: 'toolArgs', type: 'object', required: false },
      ],
      handler: async (args) => {
        const toolNameRaw = String((args as any)?.toolName ?? '').trim()
        const toolArgsRaw = (args as any)?.toolArgs
        const toolArgs =
          toolArgsRaw && typeof toolArgsRaw === 'object' && !Array.isArray(toolArgsRaw) ? toolArgsRaw : {}

        const toolName = toolNameRaw
          .replace(/_organisations\b/g, '_organizations')
          .replace(/_organisation\b/g, '_organization')

        if (toolName.startsWith('show_') && shouldDedupe(toolName, toolArgs)) {
          return { toolResult: `Ignored duplicate UI open: ${toolName}` }
        }

        const res = await fetch('/api/v1/assistant-mcp-ui', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ toolName, toolArgs }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json || json.status !== 'success') {
          throw new Error(json?.message || `Failed to call MCP tool: ${toolName}`)
        }

        if (toolName.startsWith('show_') && json.uiResource) {
          return { uiResource: json.uiResource ?? null, toolResult: `Opened UI: ${toolName}` }
        }

        return { toolResult: json.toolResult ?? null, uiResource: json.uiResource ?? null }
      },
      render: ({ status, args, result }) => {
        const toolName = (args as any)?.toolName

        if (status !== 'complete') {
          return (
            <div className="mt-3">
              <MCPToolCall status={status as any} name={toolName || 'mcp_tool'} args={args} />
            </div>
          )
        }

        const uiResource = (result as any)?.uiResource

        return (
          <div className="mt-3 space-y-3">
            <MCPToolCall status="complete" name={toolName || 'mcp_tool'} args={args} result={result} />
            {uiResource && typeof uiResource === 'object' && <UIResourceRenderer resource={uiResource} />}
          </div>
        )
      },
    },
    [],
  )

  useFrontendTool(
    {
      name: 'show_organizations',
      description: 'Open the Flame organizations UI.',
      parameters: [],
      handler: async () => {
        if (shouldDedupe('show_organizations', {})) {
          return { toolResult: 'Organizations UI already open.' }
        }
        const res = await fetch('/api/v1/assistant-mcp-ui', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ toolName: 'show_organizations', toolArgs: {} }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json || json.status !== 'success') {
          throw new Error(json?.message || 'Failed to open organizations')
        }
        return { uiResource: json.uiResource ?? null, toolResult: 'Opened Organizations UI.' }
      },
      render: ({ status, args, result }) => {
        if (status !== 'complete') {
          return (
            <div className="mt-3">
              <MCPToolCall status={status as any} name="show_organizations" args={args} />
            </div>
          )
        }
        const uiResource = (result as any)?.uiResource
        if (!uiResource || typeof uiResource !== 'object') return <></>
        return (
          <div className="mt-3 space-y-3">
            <MCPToolCall status="complete" name="show_organizations" args={args} result={result} />
            <UIResourceRenderer resource={uiResource} />
          </div>
        )
      },
    },
    [],
  )

  useFrontendTool(
    {
      name: 'list_organizations',
      description: 'List organizations visible to current user.',
      parameters: [],
      handler: async () => {
        const res = await fetch('/api/v1/assistant-mcp-ui', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ toolName: 'list_organizations', toolArgs: {} }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json || json.status !== 'success') {
          throw new Error(json?.message || 'Failed to list organizations')
        }
        return { toolResult: json.toolResult ?? null }
      },
      render: ({ status, args, result }) => {
        return (
          <div className="mt-3">
            <MCPToolCall status={status as any} name="list_organizations" args={args} result={status === 'complete' ? result : undefined} />
          </div>
        )
      },
    },
    [],
  )

  useFrontendTool(
    {
      name: 'show_dashboard',
      description: 'Open the Flame dashboard UI.',
      parameters: [],
      handler: async () => {
        const res = await fetch('/api/v1/assistant-mcp-ui', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ toolName: 'show_dashboard', toolArgs: {} }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json || json.status !== 'success') {
          throw new Error(json?.message || 'Failed to open dashboard')
        }
        return { uiResource: json.uiResource ?? null, toolResult: 'Opened Dashboard UI.' }
      },
      render: ({ status, args, result }) => {
        if (status !== 'complete') {
          return (
            <div className="mt-3">
              <MCPToolCall status={status as any} name="show_dashboard" args={args} />
            </div>
          )
        }
        const uiResource = (result as any)?.uiResource
        if (!uiResource || typeof uiResource !== 'object') return <></>
        return (
          <div className="mt-3 space-y-3">
            <MCPToolCall status="complete" name="show_dashboard" args={args} result={result} />
            <UIResourceRenderer resource={uiResource} />
          </div>
        )
      },
    },
    [],
  )

  useFrontendTool(
    {
      name: 'show_reports',
      description: 'Open the Flame reports UI.',
      parameters: [],
      handler: async () => {
        const res = await fetch('/api/v1/assistant-mcp-ui', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ toolName: 'show_reports', toolArgs: {} }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json || json.status !== 'success') {
          throw new Error(json?.message || 'Failed to open reports')
        }
        return { uiResource: json.uiResource ?? null, toolResult: 'Opened Reports UI.' }
      },
      render: ({ status, args, result }) => {
        if (status !== 'complete') {
          return (
            <div className="mt-3">
              <MCPToolCall status={status as any} name="show_reports" args={args} />
            </div>
          )
        }
        const uiResource = (result as any)?.uiResource
        if (!uiResource || typeof uiResource !== 'object') return <></>
        return (
          <div className="mt-3 space-y-3">
            <MCPToolCall status="complete" name="show_reports" args={args} result={result} />
            <UIResourceRenderer resource={uiResource} />
          </div>
        )
      },
    },
    [],
  )

  useFrontendTool(
    {
      name: 'show_projects',
      description: 'Open the Flame projects UI.',
      parameters: [],
      handler: async () => {
        const res = await fetch('/api/v1/assistant-mcp-ui', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ toolName: 'show_projects', toolArgs: {} }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json || json.status !== 'success') {
          throw new Error(json?.message || 'Failed to open projects')
        }
        return { uiResource: json.uiResource ?? null, toolResult: 'Opened Projects UI.' }
      },
      render: ({ status, args, result }) => {
        if (status !== 'complete') {
          return (
            <div className="mt-3">
              <MCPToolCall status={status as any} name="show_projects" args={args} />
            </div>
          )
        }
        const uiResource = (result as any)?.uiResource
        if (!uiResource || typeof uiResource !== 'object') return <></>
        return (
          <div className="mt-3 space-y-3">
            <MCPToolCall status="complete" name="show_projects" args={args} result={result} />
            <UIResourceRenderer resource={uiResource} />
          </div>
        )
      },
    },
    [],
  )

  useFrontendTool(
    {
      name: 'show_expenses',
      description: 'Open the Flame expenses UI (optionally filtered by projectId/cycleId).',
      parameters: [
        { name: 'projectId', type: 'string', required: false },
        { name: 'cycleId', type: 'string', required: false },
      ],
      handler: async (args) => {
        const toolArgs: Record<string, unknown> = {}
        if (args?.projectId) toolArgs.projectId = args.projectId
        if (args?.cycleId) toolArgs.cycleId = args.cycleId

        const res = await fetch('/api/v1/assistant-mcp-ui', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ toolName: 'show_expenses', toolArgs }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json || json.status !== 'success') {
          throw new Error(json?.message || 'Failed to open expenses')
        }
        const suffix =
          args?.projectId || args?.cycleId ? ` (projectId=${args?.projectId ?? '-'}, cycleId=${args?.cycleId ?? '-'})` : ''
        return { uiResource: json.uiResource ?? null, toolResult: `Opened Expenses UI${suffix}.` }
      },
      render: ({ status, args, result }) => {
        if (status !== 'complete') {
          return (
            <div className="mt-3">
              <MCPToolCall status={status as any} name="show_expenses" args={args} />
            </div>
          )
        }
        const uiResource = (result as any)?.uiResource
        if (!uiResource || typeof uiResource !== 'object') return <></>
        return (
          <div className="mt-3 space-y-3">
            <MCPToolCall status="complete" name="show_expenses" args={args} result={result} />
            <UIResourceRenderer resource={uiResource} />
          </div>
        )
      },
    },
    [],
  )

  return (
    <AuthGuard>
      <div className="h-[100dvh] w-full">
        <CopilotChat
          className="h-full w-full"
          instructions={
            'You are Flame, an assistant for a sales & expense tracking app. Help the user navigate organizations, projects, cycles, sales, expenses, invoices, receipts, customers, vendors, and reports. When asked to show a UI page, call the matching show_* tool exactly once, then respond with a short confirmation.'
          }
          labels={{
            title: 'Flame Assistant',
            initial: 'Hi! How can I help you today?',
          }}
        />
      </div>
    </AuthGuard>
  )
}
