import {
  EventType,
  SwarmVisionClient,
  mountSwarmVisionWidget,
} from '@swarmvision/sdk'

const client = new SwarmVisionClient({
  apiBaseUrl: 'http://localhost:8012',
  tenantId: 'tenant-acme',
  appContext: {
    app_id: 'support-console',
    app_name: 'Support Console',
    environment: 'staging',
    version: '1.9.0',
  },
})

await client.connect()

client.subscribe((event) => {
  console.log('Scoped SwarmVision event', event)
}, { tenantId: 'tenant-acme', appId: 'support-console' })

await client.publishEvent({
  type: EventType.TASK_HANDOFF,
  payload: {
    source_agent_id: 'triage-agent',
    target_agent_id: 'resolver-agent',
    task_id: 'ticket-42',
    task: 'Investigate escalation',
  },
})

mountSwarmVisionWidget(document.getElementById('swarmvision-slot'), {
  baseUrl: 'http://localhost:5173',
  tenantId: 'tenant-acme',
  appId: 'support-console',
  appName: 'Support Console',
  environment: 'staging',
  version: '1.9.0',
  width: '100%',
  height: 420,
})
