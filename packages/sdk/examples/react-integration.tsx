import { useEffect } from 'react'
import {
  EventType,
  SwarmVisionClient,
  SwarmVisionWidget,
} from '@swarmvision/sdk'

const client = new SwarmVisionClient({
  apiBaseUrl: 'http://localhost:8012',
  tenantId: 'tenant-acme',
  appContext: {
    app_id: 'orders-ui',
    app_name: 'Orders Console',
    environment: 'production',
    version: '3.2.1',
  },
})

export function OrdersDashboard() {
  useEffect(() => {
    void client.connect()

    const unsubscribe = client.subscribe((event) => {
      console.log('SwarmVision event', event.type, event.context)
    })

    void client.publishEvent({
      type: EventType.TASK_START,
      payload: {
        agent_id: 'agent-orders',
        task_id: 'task-1234',
        task: 'Reconcile order backlog',
      },
    })

    return () => {
      unsubscribe()
      client.disconnect()
    }
  }, [])

  return (
    <SwarmVisionWidget
      baseUrl="http://localhost:5173"
      tenantId="tenant-acme"
      appId="orders-ui"
      appName="Orders Console"
      environment="production"
      version="3.2.1"
      height={460}
    />
  )
}
