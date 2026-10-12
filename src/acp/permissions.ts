import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { childVisiblePath } from './child-path.js'

export type PermissionGateLaunch = {
  args: string[]
  cleanup(): void
}

export const PERMISSION_GATE_MARKER = 'piAcpPermissionGate'

const PERMISSION_EXTENSION = `export default function permissionGate(pi) {
  const guardedTools = new Set(['bash', 'edit', 'write'])

  pi.on('tool_call', async (event, ctx) => {
    if (!guardedTools.has(event.toolName)) return
    if (!ctx.hasUI) {
      return { block: true, reason: 'Permission approval is unavailable for this tool call.' }
    }

    // The adapter recognizes this envelope and asks about the real tool call (id, kind, input).
    const detail = JSON.stringify({
      ${PERMISSION_GATE_MARKER}: 1,
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      input: event.input ?? {}
    })
    const confirmed = await ctx.ui.confirm('Allow ' + event.toolName + '?', detail)
    if (!confirmed) return { block: true, reason: 'Tool call was denied by the user.' }
  })
}
`

export function preparePermissionGateLaunch(env = process.env): PermissionGateLaunch | null {
  if (env.PI_ACP_PERMISSION_GATE !== '1') return null

  const extensionDir = mkdtempSync(join(tmpdir(), 'pi-acp-permissions-'))
  const extensionPath = join(extensionDir, 'permission-gate.ts')
  try {
    writeFileSync(extensionPath, PERMISSION_EXTENSION, 'utf8')
  } catch (error) {
    rmSync(extensionDir, { recursive: true, force: true })
    throw error
  }

  let cleaned = false
  return {
    args: ['--extension', childVisiblePath(extensionPath, env)],
    cleanup() {
      if (cleaned) return
      cleaned = true
      rmSync(extensionDir, { recursive: true, force: true })
    }
  }
}

export type PermissionGateRequest = {
  toolCallId: string
  toolName: string
  input: Record<string, unknown>
}

export function parsePermissionGateRequest(message: unknown): PermissionGateRequest | null {
  if (typeof message !== 'string') return null
  let value: unknown
  try {
    value = JSON.parse(message)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (v[PERMISSION_GATE_MARKER] !== 1) return null
  if (typeof v.toolCallId !== 'string' || !v.toolCallId) return null
  if (typeof v.toolName !== 'string' || !v.toolName) return null
  const input = v.input && typeof v.input === 'object' && !Array.isArray(v.input) ? v.input : {}
  return { toolCallId: v.toolCallId, toolName: v.toolName, input: input as Record<string, unknown> }
}
