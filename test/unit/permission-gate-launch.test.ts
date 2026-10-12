import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import {
  PERMISSION_GATE_MARKER,
  parsePermissionGateRequest,
  preparePermissionGateLaunch
} from '../../src/acp/permissions.js'

test('preparePermissionGateLaunch is opt-in', () => {
  assert.equal(preparePermissionGateLaunch({}), null)
})

test('preparePermissionGateLaunch materializes and cleans up the extension', () => {
  const launch = preparePermissionGateLaunch({ PI_ACP_PERMISSION_GATE: '1' })
  assert.ok(launch)
  assert.equal(launch.args[0], '--extension')

  const extensionPath = launch.args[1]!
  assert.equal(existsSync(extensionPath), true)
  const source = readFileSync(extensionPath, 'utf8')
  assert.match(source, /tool_call/)
  assert.match(source, /ctx\.ui\.confirm/)
  assert.match(source, /'bash', 'edit', 'write'/)

  launch.cleanup()
  assert.equal(existsSync(extensionPath), false)
  launch.cleanup()
})

test('preparePermissionGateLaunch maps its guest path for an AgentOS child', () => {
  const launch = preparePermissionGateLaunch({
    PI_ACP_PERMISSION_GATE: '1',
    AGENTOS_SANDBOX_ROOT: '/host/shadow'
  })
  assert.ok(launch)
  assert.match(launch.args[1]!, /^\/host\/shadow\/tmp\/pi-acp-permissions-/)
  launch.cleanup()
})

test('the gate extension sends the structured envelope the adapter parses', () => {
  const launch = preparePermissionGateLaunch({ PI_ACP_PERMISSION_GATE: '1' })
  assert.ok(launch)
  const source = readFileSync(launch.args[1]!, 'utf8')
  assert.match(source, new RegExp(`${PERMISSION_GATE_MARKER}: 1`))
  assert.match(source, /toolCallId: event\.toolCallId/)
  assert.doesNotMatch(source, /slice\(0, 4000\)/)
  launch.cleanup()
})

test('parsePermissionGateRequest accepts only the gate envelope', () => {
  const input = { command: 'x'.repeat(10_000) }
  assert.deepEqual(
    parsePermissionGateRequest(
      JSON.stringify({ [PERMISSION_GATE_MARKER]: 1, toolCallId: 'call_1', toolName: 'bash', input })
    ),
    { toolCallId: 'call_1', toolName: 'bash', input }
  )
  assert.equal(parsePermissionGateRequest('All messages will be lost.'), null)
  assert.equal(parsePermissionGateRequest(JSON.stringify({ toolCallId: 'call_1', toolName: 'bash' })), null)
  assert.equal(
    parsePermissionGateRequest(JSON.stringify({ [PERMISSION_GATE_MARKER]: 1, toolCallId: '', toolName: 'bash' })),
    null
  )
  assert.equal(parsePermissionGateRequest(undefined), null)
})
