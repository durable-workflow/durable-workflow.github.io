#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const capability = JSON.parse(fs.readFileSync(
  path.join(root, 'static', 'workflow-stream-capabilities.json'),
  'utf8',
))
const scenarios = JSON.parse(fs.readFileSync(
  path.join(root, 'static', 'platform-conformance', 'workflow-stream-runtime-scenarios.json'),
  'utf8',
))

const requiredOperations = ['list', 'describe', 'subscribe', 'append', 'close', 'error']
const requiredSdks = ['php', 'python', 'rust']

if (capability.schema !== 'durable-workflow.v2.workflow-stream-capabilities' || capability.version !== 1) {
  throw new Error('Workflow Stream capability manifest schema/version mismatch')
}
if (capability.contract !== 'durable-workflow.v2.workflow-streams.contract@1') {
  throw new Error('Workflow Stream service contract identity mismatch')
}
for (const sdk of requiredSdks) {
  const support = capability.sdk_support[sdk]
  if (!support || support.workflow_authoring !== true) {
    throw new Error(`${sdk} must declare workflow authoring support`)
  }
  if (JSON.stringify(support.operations) !== JSON.stringify(requiredOperations)) {
    throw new Error(`${sdk} operation list must exactly match the service contract`)
  }
  if (typeof support.cancellation !== 'string' || typeof support.external_payload_references !== 'string') {
    throw new Error(`${sdk} must declare cancellation and external-reference behavior`)
  }
}
if (scenarios.schema !== 'durable-workflow.v2.platform-conformance.runtime-scenarios') {
  throw new Error('Workflow Stream conformance scenario schema mismatch')
}
const scenarioIds = new Set(scenarios.scenarios.map((scenario) => scenario.id))
for (const scenario of capability.conformance.required_scenarios) {
  if (!scenarioIds.has(scenario)) {
    throw new Error(`Missing Workflow Stream conformance scenario: ${scenario}`)
  }
}
if (capability.waterline.service_mode.inbound_workflow_messaging !== false
  || capability.waterline.service_mode.continue_as_new_cursor_transfer !== false
  || capability.waterline.embedded_mode.inbound_workflow_messaging !== true
  || capability.waterline.embedded_mode.continue_as_new_cursor_transfer !== true) {
  throw new Error('Workflow Stream and embedded MessageStream semantics are conflated')
}

console.log('Workflow Stream capability manifest and conformance scenarios are valid.')
