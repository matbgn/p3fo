import '@testing-library/jest-dom/vitest'

const originalFetch = globalThis.fetch
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('/api/') || url.startsWith('/v1/traces')) {
    return Promise.resolve(new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
  }
  return originalFetch(input, init)
}) as typeof globalThis.fetch

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  url: string
  readyState = MockWebSocket.CONNECTING
  onopen: ((ev: Event) => void) | null = null
  onclose: ((ev: CloseEvent) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  constructor(url: string) {
    this.url = url
  }
  send() {}
  close() { this.readyState = MockWebSocket.CLOSED }
  addEventListener() {}
  removeEventListener() {}
}
globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket
