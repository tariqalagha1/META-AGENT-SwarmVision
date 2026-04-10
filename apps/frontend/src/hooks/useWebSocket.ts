/**
 * useWebSocket - React Hook for WebSocket Connection
 * 
 * Manages WebSocket connection lifecycle, event subscription, and auto-reconnect
 */

import { useEffect, useRef, useState, useCallback } from 'react'

export interface WebSocketEvent {
  id: string
  type: string
  timestamp: string
  source: string
  payload: Record<string, unknown>
  context?: {
    tenant_id?: string
    app_id?: string
    app_name?: string
    environment?: string
    version?: string
  }
}

export interface UseWebSocketOptions {
  url: string
  reconnectAttempts?: number
  reconnectDelay?: number
  autoConnect?: boolean
  onEvent?: (event: WebSocketEvent) => void
}

export interface UseWebSocketState {
  connected: boolean
  error: string | null
  eventCount: number
  lastEvent: WebSocketEvent | null
  reconnectAttempts: number
}

/**
 * Hook for managing WebSocket connections
 */
export function useWebSocket(options: UseWebSocketOptions) {
  const {
    url,
    reconnectAttempts = 5,
    reconnectDelay = 3000,
    autoConnect = true,
    onEvent,
  } = options

  const ws = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [state, setState] = useState<UseWebSocketState>({
    connected: false,
    error: null,
    eventCount: 0,
    lastEvent: null,
    reconnectAttempts: 0,
  })

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected')
      return
    }

    console.log(`Connecting to WebSocket: ${url}`)
    
    try {
      ws.current = new WebSocket(url)

      ws.current.onopen = () => {
        console.log('WebSocket connected')
        setState((prev) => ({
          ...prev,
          connected: true,
          error: null,
          reconnectAttempts: 0,
        }))
        reconnectAttemptsRef.current = 0

        // Start heartbeat ping
        pingIntervalRef.current = setInterval(() => {
          if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'ping' }))
          }
        }, 30000)
      }

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WebSocketEvent
          
          // Skip ping/pong messages in event count
          if (data.type && !data.type.includes('ping') && !data.type.includes('ACKNOWLEDGED')) {
            setState((prev) => ({
              ...prev,
              eventCount: prev.eventCount + 1,
              lastEvent: data,
            }))
            
            onEvent?.(data)
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err)
        }
      }

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        setState((prev) => ({
          ...prev,
          error: 'WebSocket connection error',
        }))
      }

      ws.current.onclose = () => {
        console.log('WebSocket disconnected')
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
          pingIntervalRef.current = null
        }

        setState((prev) => ({
          ...prev,
          connected: false,
        }))

        // Attempt to reconnect
        if (reconnectAttemptsRef.current < reconnectAttempts) {
          reconnectAttemptsRef.current++
          const delay = reconnectDelay * Math.pow(1.5, reconnectAttemptsRef.current - 1)
          
          console.log(
            `Attempting to reconnect... (${reconnectAttemptsRef.current}/${reconnectAttempts}) in ${Math.round(delay)}ms`
          )
          
          setState((prev) => ({
            ...prev,
            reconnectAttempts: reconnectAttemptsRef.current,
          }))

          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, delay)
        } else {
          setState((prev) => ({
            ...prev,
            error: `Failed to connect after ${reconnectAttempts} attempts`,
          }))
        }
      }
    } catch (err) {
      console.error('Failed to create WebSocket:', err)
      setState((prev) => ({
        ...prev,
        error: 'Failed to create WebSocket connection',
      }))
    }
  }, [url, reconnectAttempts, reconnectDelay, onEvent])

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    console.log('Disconnecting WebSocket')
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
    }

    if (ws.current) {
      ws.current.close()
      ws.current = null
    }

    setState({
      connected: false,
      error: null,
      eventCount: 0,
      lastEvent: null,
      reconnectAttempts: 0,
    })
  }, [])

  // Send message through WebSocket
  const send = useCallback((data: unknown) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected')
      return false
    }
    
    try {
      ws.current.send(JSON.stringify(data))
      return true
    } catch (err) {
      console.error('Failed to send WebSocket message:', err)
      return false
    }
  }, [])

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect()
    }

    // Cleanup on unmount
    return () => {
      disconnect()
    }
  }, [autoConnect, connect, disconnect])

  return {
    state,
    connect,
    disconnect,
    send,
    ws: ws.current,
  }
}
