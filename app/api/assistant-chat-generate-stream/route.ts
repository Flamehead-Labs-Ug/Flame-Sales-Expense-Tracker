import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/database'
import { getApiOrSessionUser } from '@/lib/api-auth-keys'
import { generateApiKey } from '@/lib/api-keys'

export const dynamic = 'force-dynamic'

function extractGroqDeltaText(data: any): string {
  const delta = data?.choices?.[0]?.delta
  const text = delta?.content
  return typeof text === 'string' ? text : ''
}

function bytesToBase64(bytes: Uint8Array): string {
  // Works in both Node and Workers
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function getCrypto(): Crypto {
  // In Workers, globalThis.crypto is WebCrypto; in Node 18+/Next it is also available.
  const c = (globalThis as any).crypto as Crypto | undefined
  if (!c?.subtle) throw new Error('WebCrypto is not available in this runtime')
  return c
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Some TS libs type Uint8Array.buffer as ArrayBufferLike (can include SharedArrayBuffer).
  // WebCrypto expects a real ArrayBuffer, so we copy.
  return new Uint8Array(bytes).buffer
}

async function sha256Bytes(input: Uint8Array): Promise<Uint8Array> {
  const digest = await getCrypto().subtle.digest('SHA-256', toArrayBuffer(input))
  return new Uint8Array(digest)
}

async function deriveAesGcmKey(secret: string): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(secret)
  const keyBytes = await sha256Bytes(secretBytes)
  return getCrypto().subtle.importKey('raw', toArrayBuffer(keyBytes), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

async function encryptWithAesGcm(plaintext: string, secret: string): Promise<string> {
  const key = await deriveAesGcmKey(secret)
  const iv = getCrypto().getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(plaintext)
  const encrypted = await getCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(data),
  )

  const payload = {
    v: 1,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  }

  const payloadJson = JSON.stringify(payload)
  return bytesToBase64(new TextEncoder().encode(payloadJson))
}

async function decryptWithAesGcm(encrypted: string, secret: string): Promise<string> {
  const key = await deriveAesGcmKey(secret)
  const payloadJson = new TextDecoder().decode(base64ToBytes(encrypted))
  const payload = JSON.parse(payloadJson) as { iv: string; data: string }
  const iv = base64ToBytes(payload.iv)
  const data = base64ToBytes(payload.data)

  const decrypted = await getCrypto().subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(data),
  )
  return new TextDecoder().decode(new Uint8Array(decrypted))
}

async function getOrCreateAssistantMcpApiKey(opts: {
  userId: number
  organizationId: number | null
}): Promise<string> {
  const encryptionSecret = process.env.ASSISTANT_MCP_KEY_ENCRYPTION_SECRET
  if (!encryptionSecret) {
    throw new Error('ASSISTANT_MCP_KEY_ENCRYPTION_SECRET environment variable is not set')
  }

  const existing = await db.query(
    `
    SELECT encrypted_key
      FROM assistant_mcp_keys
     WHERE user_id = $1
       AND revoked_at IS NULL
     LIMIT 1
    `,
    [opts.userId],
  )

  const encryptedExisting = existing.rows[0]?.encrypted_key
  if (typeof encryptedExisting === 'string' && encryptedExisting.trim()) {
    return await decryptWithAesGcm(encryptedExisting, encryptionSecret)
  }

  const { fullKey, prefix, hash } = generateApiKey('read_write')

  const created = await db.query(
    `
    INSERT INTO api_keys (user_id, organization_id, name, key_prefix, key_hash, scope, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6, NULL)
    RETURNING id
    `,
    [opts.userId, opts.organizationId, 'Assistant MCP', prefix, hash, 'read_write'],
  )

  const apiKeyId = created.rows[0]?.id
  const encrypted = await encryptWithAesGcm(fullKey, encryptionSecret)

  await db.query(
    `
    INSERT INTO assistant_mcp_keys (user_id, api_key_id, encrypted_key, created_at, updated_at, revoked_at)
    VALUES ($1, $2, $3, NOW(), NOW(), NULL)
    ON CONFLICT (user_id)
    DO UPDATE SET api_key_id = EXCLUDED.api_key_id,
                  encrypted_key = EXCLUDED.encrypted_key,
                  updated_at = NOW(),
                  revoked_at = NULL
    `,
    [opts.userId, apiKeyId ?? null, encrypted],
  )

  return fullKey
}

type JsonRpcSuccess = { jsonrpc: '2.0'; id: string | number; result: any }
type JsonRpcError = { jsonrpc: '2.0'; id?: string | number | null; error: any }

async function callMcpTool(opts: {
  baseUrl: string
  toolName: string
  toolArgs: Record<string, unknown>
  authHeader?: string | null
}): Promise<{ result: any; sessionId?: string | null }> {
  const mcpUrl = new URL('/mcp', opts.baseUrl)

  const headers: Record<string, string> = {
    'content-type': 'application/json',
  }

  if (opts.authHeader) {
    headers.authorization = opts.authHeader
  }

  const initRes = await fetch(mcpUrl.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        clientInfo: { name: 'flame-app-assistant', version: '1.0.0' },
        capabilities: {},
      },
    }),
  })

  const initJson = (await initRes.json().catch(() => null)) as JsonRpcSuccess | JsonRpcError | null
  if (!initRes.ok || !initJson || 'error' in initJson) {
    const msg = (initJson as any)?.error?.message || 'Failed to initialize MCP session'
    throw new Error(msg)
  }

  const sessionId = initRes.headers.get('mcp-session-id')

  const callHeaders: Record<string, string> = { ...headers }
  if (sessionId) callHeaders['mcp-session-id'] = sessionId

  const toolRes = await fetch(mcpUrl.toString(), {
    method: 'POST',
    headers: callHeaders,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: opts.toolName,
        arguments: opts.toolArgs,
      },
    }),
  })

  const toolJson = (await toolRes.json().catch(() => null)) as JsonRpcSuccess | JsonRpcError | null
  if (!toolRes.ok || !toolJson || 'error' in toolJson) {
    const msg = (toolJson as any)?.error?.message || 'MCP tool call failed'
    throw new Error(msg)
  }

  return { result: (toolJson as JsonRpcSuccess).result, sessionId }
}

function extractUiResourceFromToolResult(toolResult: any): any | null {
  const content = toolResult?.content
  if (!Array.isArray(content)) return null

  for (const item of content) {
    if (!item || typeof item !== 'object') continue
    if (item.resource) return item.resource
    if (item.type === 'resource' && item.uri) return item
    if (item.type === 'ui' && item.resource) return item.resource
  }

  return null
}

function parseAssistantNaturalToolIntent(input: string):
  | { toolName: string; toolArgs: Record<string, unknown>; message: string }
  | null {
  const raw = input.trim().toLowerCase()
  if (!raw) return null

  const normalized = raw.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  const startsWithAny = (prefixes: string[]) => prefixes.some((p) => normalized.startsWith(p))

  if (
    normalized === 'dashboard' ||
    normalized === 'show dashboard' ||
    startsWithAny(['open dashboard', 'view dashboard']) ||
    normalized.includes('show dashboard')
  ) {
    return { toolName: 'show_dashboard', toolArgs: {}, message: 'Opening Dashboard…' }
  }

  if (
    normalized === 'reports' ||
    normalized === 'show reports' ||
    startsWithAny(['open reports', 'view reports']) ||
    normalized.includes('show reports')
  ) {
    return { toolName: 'show_reports', toolArgs: {}, message: 'Opening Reports…' }
  }

  if (
    normalized === 'projects' ||
    normalized === 'project' ||
    normalized === 'show projects' ||
    normalized === 'list projects' ||
    normalized.includes('which projects') ||
    normalized.includes('my projects') ||
    normalized.includes('projects in my organisation') ||
    normalized.includes('projects in my organization') ||
    /\bproje\w*\b/i.test(normalized)
  ) {
    return { toolName: 'show_projects', toolArgs: {}, message: 'Opening Projects…' }
  }

  if (
    normalized === 'expenses' ||
    normalized === 'show expenses' ||
    normalized === 'list expenses' ||
    normalized.includes('expenses')
  ) {
    const projectMatch = normalized.match(/project\s*(?:id)?\s*[=:]?\s*(\d+)/i)
    const cycleMatch = normalized.match(/cycle\s*(?:id)?\s*[=:]?\s*(\d+)/i)
    const toolArgs: Record<string, unknown> = {}
    if (projectMatch?.[1]) toolArgs.projectId = projectMatch[1]
    if (cycleMatch?.[1]) toolArgs.cycleId = cycleMatch[1]
    return { toolName: 'show_expenses', toolArgs, message: 'Opening Expenses…' }
  }

  return null
}

function createThinkStripper() {
  let inThink = false
  let carry = ''
  return {
    consume(delta: string) {
      carry += delta
      let visible = ''
      let reasoning = ''

      while (carry.length) {
        if (!inThink) {
          const start = carry.indexOf('<think>')
          if (start === -1) {
            visible += carry
            carry = ''
            break
          }

          visible += carry.slice(0, start)
          carry = carry.slice(start + '<think>'.length)
          inThink = true
          continue
        }

        const end = carry.indexOf('</think>')
        if (end === -1) {
          reasoning += carry
          carry = ''
          break
        }

        reasoning += carry.slice(0, end)
        carry = carry.slice(end + '</think>'.length)
        inThink = false
      }

      return { visible, reasoning }
    },
    flush() {
      if (!carry) return { visible: '', reasoning: '' }
      const rest = carry
      carry = ''
      if (inThink) return { visible: '', reasoning: rest }
      return { visible: rest, reasoning: '' }
    },
  }
}

function parseAssistantSlashCommand(input: string):
  | { toolName: string; toolArgs: Record<string, unknown>; message: string }
  | null {
  const raw = input.trim()

  if (/^\/show\s+projects\b/i.test(raw)) {
    return { toolName: 'show_projects', toolArgs: {}, message: 'Opening Projects…' }
  }

  if (/^\/show\s+dashboard\b/i.test(raw)) {
    return { toolName: 'show_dashboard', toolArgs: {}, message: 'Opening Dashboard…' }
  }

  if (/^\/show\s+reports\b/i.test(raw)) {
    return { toolName: 'show_reports', toolArgs: {}, message: 'Opening Reports…' }
  }

  const expensesMatch = raw.match(/^\/show\s+expenses(?:\s+project=(\S+))?(?:\s+cycle=(\S+))?\s*$/i)
  if (expensesMatch) {
    const projectId = expensesMatch[1]
    const cycleId = expensesMatch[2]
    const toolArgs: Record<string, unknown> = {}
    if (projectId) toolArgs.projectId = projectId
    if (cycleId) toolArgs.cycleId = cycleId
    return { toolName: 'show_expenses', toolArgs, message: 'Opening Expenses…' }
  }

  return null
}

export async function POST(request: NextRequest) {
  try {
    const user = await getApiOrSessionUser(request)
    if (!user?.id) {
      return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { status: 'error', message: 'GROQ_API_KEY environment variable is not set' },
        { status: 500 },
      )
    }

    const body = (await request.json().catch(() => ({}))) as {
      session_id?: number | string
    }

    const sessionId =
      typeof body.session_id === 'number'
        ? body.session_id
        : typeof body.session_id === 'string'
          ? parseInt(body.session_id, 10)
          : NaN

    if (!Number.isFinite(sessionId)) {
      return NextResponse.json({ status: 'error', message: 'session_id is required' }, { status: 400 })
    }

    const session = await db.query(
      'SELECT id FROM assistant_chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, user.id],
    )

    if (!session.rows.length) {
      return NextResponse.json({ status: 'error', message: 'Forbidden' }, { status: 403 })
    }

    const history = await db.query(
      `
      SELECT role, content
        FROM assistant_chat_messages
       WHERE session_id = $1
       ORDER BY created_at ASC, id ASC
       LIMIT 50
      `,
      [sessionId],
    )

    const lastMessage = history.rows[history.rows.length - 1] as any
    const lastRole = typeof lastMessage?.role === 'string' ? lastMessage.role : null
    const lastContent = typeof lastMessage?.content === 'string' ? lastMessage.content : ''

    const mcpWorkerBaseUrl = process.env.MCP_WORKER_BASE_URL
    const slashCmd = lastRole === 'user' ? parseAssistantSlashCommand(lastContent) : null
    const naturalCmd = lastRole === 'user' ? parseAssistantNaturalToolIntent(lastContent) : null
    const toolCmd = slashCmd || naturalCmd

    if (toolCmd) {
      if (!mcpWorkerBaseUrl) {
        return NextResponse.json(
          { status: 'error', message: 'MCP_WORKER_BASE_URL environment variable is not set' },
          { status: 500 },
        )
      }

      const encoder = new TextEncoder()
      const text = toolCmd.message

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            controller.enqueue(encoder.encode(text))

            let authHeader: string | null = null
            try {
              const fullKey = await getOrCreateAssistantMcpApiKey({
                userId: user.id,
                organizationId: user.organizationId ?? null,
              })
              authHeader = `Bearer ${fullKey}`
            } catch (error) {
              console.error('Failed to get or create Assistant MCP API key:', error)
              authHeader = null
            }

            if (!authHeader) {
              const help =
                'Assistant MCP is not configured yet. Ensure the database migration for assistant_mcp_keys has been applied and ASSISTANT_MCP_KEY_ENCRYPTION_SECRET is set, then try again.'
              await db.query(
                `
                INSERT INTO assistant_chat_messages (session_id, role, content, metadata)
                VALUES ($1, 'assistant', $2, $3)
                `,
                [sessionId, help, null],
              )
              controller.enqueue(encoder.encode(`\n\n${help}`))
              controller.close()
              return
            }

            const { result } = await callMcpTool({
              baseUrl: mcpWorkerBaseUrl,
              toolName: toolCmd.toolName,
              toolArgs: toolCmd.toolArgs,
              authHeader,
            })

            const uiResource = extractUiResourceFromToolResult(result)

            await db.query(
              `
              INSERT INTO assistant_chat_messages (session_id, role, content, metadata)
              VALUES ($1, 'assistant', $2, $3)
              `,
              [sessionId, text, uiResource ? { uiResource } : null],
            )

            await db.query(
              `
              UPDATE assistant_chat_sessions
                 SET last_message_at = NOW(),
                     updated_at = NOW()
               WHERE id = $1
              `,
              [sessionId],
            )

            controller.close()
          } catch (error) {
            console.error('Assistant MCP tool call error:', error)
            controller.error(error)
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
        },
      })
    }

    const model = process.env.GROQ_MODEL || 'qwen/qwen3-32b'

    const messages = history.rows
      .map((m: any) => {
        const roleRaw = typeof m.role === 'string' ? m.role : 'user'
        const content = typeof m.content === 'string' ? m.content : ''
        if (!content.trim()) return null

        const role =
          roleRaw === 'assistant'
            ? 'assistant'
            : roleRaw === 'system'
              ? 'system'
              : roleRaw === 'tool'
                ? 'tool'
                : 'user'

        return { role, content }
      })
      .filter(Boolean) as Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>

    const systemPrefix =
      'For every reply: write your reasoning inside <think>...</think> first, then write the final answer for the user. The host will hide the <think> block by default, so keep it useful but not excessively long.'

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrefix }, ...messages],
        temperature: 0.6,
        top_p: 0.95,
        max_completion_tokens: 4096,
        stream: true,
      }),
    })

    if (!groqRes.ok || !groqRes.body) {
      const raw = await groqRes.text().catch(() => '')
      let details: any = null
      try {
        details = raw ? JSON.parse(raw) : null
      } catch {
        details = { raw }
      }

      const groqMessage =
        details?.error?.message || details?.message || groqRes.statusText || 'Groq request failed'

      console.error('Groq request failed:', {
        status: groqRes.status,
        statusText: groqRes.statusText,
        details,
      })

      return NextResponse.json(
        {
          status: 'error',
          message: `Groq request failed (${groqRes.status}): ${groqMessage}`,
          details,
        },
        { status: 502 },
      )
    }

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    let fullText = ''
    let reasoningText = ''
    let buffer = ''

    const thinkStripper = createThinkStripper()

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const reader = groqRes.body!.getReader()

          while (true) {
            const { value, done } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            let sepIndex = buffer.indexOf('\n\n')
            while (sepIndex !== -1) {
              const rawEvent = buffer.slice(0, sepIndex)
              buffer = buffer.slice(sepIndex + 2)

              const lines = rawEvent.split('\n')
              for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed.startsWith('data:')) continue

                const payload = trimmed.slice('data:'.length).trim()
                if (!payload || payload === '[DONE]') continue

                let json: any
                try {
                  json = JSON.parse(payload)
                } catch {
                  continue
                }

                const delta = extractGroqDeltaText(json)
                if (!delta) continue

                const { visible, reasoning } = thinkStripper.consume(delta)
                if (reasoning) reasoningText += reasoning
                if (!visible) continue

                fullText += visible
                controller.enqueue(encoder.encode(visible))
              }

              sepIndex = buffer.indexOf('\n\n')
            }
          }

          const flushed = thinkStripper.flush()
          if (flushed.reasoning) reasoningText += flushed.reasoning
          if (flushed.visible) {
            fullText += flushed.visible
            controller.enqueue(encoder.encode(flushed.visible))
          }

          if (fullText.trim()) {
            await db.query(
              `
              INSERT INTO assistant_chat_messages (session_id, role, content, metadata)
              VALUES ($1, 'assistant', $2, $3)
              `,
              [sessionId, fullText, reasoningText.trim() ? { reasoning: reasoningText.trim() } : null],
            )

            await db.query(
              `
              UPDATE assistant_chat_sessions
                 SET last_message_at = NOW(),
                     updated_at = NOW()
               WHERE id = $1
              `,
              [sessionId],
            )
          }

          controller.close()
        } catch (error) {
          console.error('Assistant chat generate stream error:', error)
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    })
  } catch (error) {
    console.error('Assistant chat generate stream POST error:', error)
    return NextResponse.json(
      {
        status: 'error',
        message: 'Failed to generate assistant reply',
      },
      { status: 500 },
    )
  }
}
