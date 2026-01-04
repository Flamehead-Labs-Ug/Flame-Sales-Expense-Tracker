'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { AuthGuard } from '@/components/auth-guard'
import { UIResourceRenderer } from '@mcp-ui/client'

import {
  ChatHandler,
  ChatInput,
  ChatMessage,
  ChatMessages,
  ChatSection,
  Message as UiMessage,
  TextPartType,
  useChatUI,
  usePart,
} from '@llamaindex/chat-ui'

import '@llamaindex/chat-ui/styles/markdown.css'
import '@llamaindex/chat-ui/styles/pdf.css'
import '@llamaindex/chat-ui/styles/editor.css'

interface ChatSession {
  id: number
  title: string | null
  created_at: string
  updated_at: string
  last_message_at: string | null
}

interface ChatMessage {
  id: number
  session_id: number
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  created_at: string
  metadata?: any
}

type McpUiPart = {
  type: 'data-mcp_ui'
  data: any
}

type ReasoningPart = {
  type: 'data-reasoning'
  data: string
}

function splitThinkBlocks(input: string): { visible: string; reasoning: string } {
  if (!input) return { visible: '', reasoning: '' }
  const re = /<think>([\s\S]*?)<\/think>/gi
  let reasoning = ''
  let match: RegExpExecArray | null

  while ((match = re.exec(input))) {
    const chunk = (match[1] || '').trim()
    if (chunk) reasoning += (reasoning ? '\n\n' : '') + chunk
  }

  const visible = input.replace(re, '').trimEnd()
  return { visible, reasoning }
}

function McpUiPartUI() {
  const part = usePart<McpUiPart>('data-mcp_ui')
  const resource = part?.data
  if (!resource || typeof resource !== 'object') return null
  return (
    <div className="mt-3">
      <UIResourceRenderer resource={resource} />
    </div>
  )
}

function ReasoningPartUI() {
  const part = usePart<ReasoningPart>('data-reasoning')
  const text = typeof part?.data === 'string' ? part.data : ''
  if (!text.trim()) return null
  return (
    <details className="mb-2 inline-block w-fit max-w-[36rem] rounded-md border bg-muted/30 p-3 text-sm">
      <summary className="cursor-pointer select-none font-medium">Reasoning</summary>
      <div className="mt-2 whitespace-pre-wrap text-muted-foreground">{text}</div>
    </details>
  )
}

function ChatMessagesListWithMcp() {
  const scrollableRef = useRef<HTMLDivElement | null>(null)
  const { messages } = useChatUI()

  useEffect(() => {
    if (!scrollableRef.current) return
    scrollableRef.current.scrollTop = scrollableRef.current.scrollHeight
  }, [messages.length, messages[messages.length - 1]?.parts?.[0]])

  return (
    <div ref={scrollableRef} className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto">
      {messages.map((message, idx) => (
        <ChatMessage key={message.id} message={message} isLast={idx === messages.length - 1}>
          <ChatMessage.Avatar />
          <ChatMessage.Content>
            <ChatMessage.Part.File />
            <ChatMessage.Part.Event />
            <ReasoningPartUI />
            <ChatMessage.Part.Markdown />
            <McpUiPartUI />
            <ChatMessage.Part.Artifact />
            <ChatMessage.Part.Source />
            <ChatMessage.Part.Suggestion />
          </ChatMessage.Content>
          <ChatMessage.Actions />
        </ChatMessage>
      ))}
      <ChatMessages.Empty />
      <ChatMessages.Loading />
    </div>
  )
}

export default function AssistantPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [status, setStatus] = useState<'submitted' | 'streaming' | 'ready' | 'error'>('ready')

  const abortControllerRef = useRef<AbortController | null>(null)

  const activeSessionId = useMemo(() => {
    const raw = searchParams.get('session_id')
    if (!raw) return null
    const id = parseInt(raw, 10)
    return Number.isFinite(id) ? id : null
  }, [searchParams])

  const loadMessages = async (sessionId: number) => {
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/v1/assistant-chat-messages?session_id=${sessionId}&limit=500`)
      const data = await res.json()

      if (data.status !== 'success') {
        toast.error(data.message || 'Failed to load messages')
        setMessages([])
        return
      }

      setMessages((data.messages as ChatMessage[]) ?? [])
    } catch {
      toast.error('Failed to load messages')
    } finally {
      setLoadingMessages(false)
    }
  }

  const ensureDefaultSession = async () => {
    if (activeSessionId) return
    try {
      const res = await fetch('/api/v1/assistant-chat-sessions?limit=50')
      const data = await res.json().catch(() => null)
      if (!data || data.status !== 'success') return

      const sessions = (data.sessions as ChatSession[]) ?? []
      const first = sessions[0]?.id
      if (first) {
        router.replace(`/assistant?session_id=${first}`)
      }
    } catch {
      return
    }
  }

  const handler: ChatHandler = useMemo(() => {
    const uiMessages: UiMessage[] = messages.map((m) => {
      const role: 'system' | 'user' | 'assistant' =
        m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant'

      const { visible: visibleText, reasoning: parsedReasoning } = splitThinkBlocks(m.content ?? '')
      const parts: any[] = [{ type: TextPartType, text: visibleText }]

      const savedReasoning = typeof m?.metadata?.reasoning === 'string' ? m.metadata.reasoning : ''
      const reasoningText = savedReasoning || parsedReasoning
      if (reasoningText && reasoningText.trim()) {
        parts.push({ type: 'data-reasoning', data: reasoningText })
      }

      const uiResource = m?.metadata?.uiResource
      if (uiResource && typeof uiResource === 'object') {
        parts.push({ type: 'data-mcp_ui', data: uiResource })
      }

      return { id: String(m.id), role, parts }
    })

    const sendMessage: ChatHandler['sendMessage'] = async (msg) => {
      if (!activeSessionId) {
        toast.error('Create or select a conversation first')
        return
      }

      const content = msg.parts
        .filter((p: any) => p?.type === TextPartType)
        .map((p: any) => p.text)
        .join('')
        .trim()

      if (!content) return

      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller

      setStatus('submitted')

      const optimisticUser: ChatMessage = {
        id: -Date.now(),
        session_id: activeSessionId,
        role: 'user',
        content,
        created_at: new Date().toISOString(),
      }

      const optimisticAssistant: ChatMessage = {
        id: -Date.now() - 1,
        session_id: activeSessionId,
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, optimisticUser, optimisticAssistant])

      try {
        const insertRes = await fetch('/api/v1/assistant-chat-messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            session_id: activeSessionId,
            role: 'user',
            content,
          }),
        })

        const insertData = await insertRes.json().catch(() => null)
        if (!insertRes.ok || !insertData || insertData.status !== 'success') {
          toast.error(insertData?.message || 'Failed to send message')
          setStatus('error')
          await loadMessages(activeSessionId)
          return
        }

        setStatus('streaming')

        const streamRes = await fetch('/api/v1/assistant-chat-generate-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session_id: activeSessionId }),
          signal: controller.signal,
        })

        if (!streamRes.ok) {
          const err = await streamRes.json().catch(() => null)
          toast.error(err?.message || 'Failed to generate assistant reply')
          setStatus('error')
          await loadMessages(activeSessionId)
          return
        }

        if (!streamRes.body) {
          toast.error('Streaming response not available')
          setStatus('error')
          await loadMessages(activeSessionId)
          return
        }

        const reader = streamRes.body.getReader()
        const decoder = new TextDecoder()
        let full = ''

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          if (!chunk) continue
          full += chunk
          setMessages((prev) => {
            const next = [...prev]
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i]?.role === 'assistant' && next[i].id === optimisticAssistant.id) {
                next[i] = { ...next[i], content: full }
                break
              }
            }
            return next
          })
        }

        setStatus('ready')
        await loadMessages(activeSessionId)
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          setStatus('ready')
          await loadMessages(activeSessionId)
          return
        }
        toast.error('Failed to send message')
        setStatus('error')
        await loadMessages(activeSessionId)
      }
    }

    return {
      messages: uiMessages,
      status,
      sendMessage,
      stop: async () => {
        abortControllerRef.current?.abort()
      },
    }
  }, [activeSessionId, messages, status])

  useEffect(() => {
    void ensureDefaultSession()
  }, [])

  useEffect(() => {
    if (!activeSessionId) {
      setMessages([])
      return
    }

    loadMessages(activeSessionId)
  }, [activeSessionId])

  return (
    <AuthGuard>
      <div className="p-6">
        {loadingMessages ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : !activeSessionId ? (
          <div className="text-sm text-muted-foreground">Select a conversation or create a new one.</div>
        ) : (
          <div className="h-[70vh] overflow-hidden rounded-lg border bg-background">
            <ChatSection handler={handler} className="h-full">
              <ChatMessages>
                <ChatMessagesListWithMcp />
              </ChatMessages>
              <ChatInput>
                <ChatInput.Form className="w-full">
                  <ChatInput.Field placeholder="Type a message..." />
                  <ChatInput.Submit />
                </ChatInput.Form>
              </ChatInput>
            </ChatSection>
          </div>
        )}
      </div>
    </AuthGuard>
  )
}
