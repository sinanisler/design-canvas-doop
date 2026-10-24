import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client, startServer, type Server } from './harness.ts'

/**
 * Baseline security headers, checked against the REAL server (see ./harness.ts)
 * over HTTP, the same surface a browser or a scanner sees.
 */

let server: Server

beforeAll(async () => {
  server = await startServer()
}, 70_000)

afterAll(() => server?.stop())

describe('baseline security headers', () => {
  it('sends nosniff, SAMEORIGIN framing and a strict referrer policy on every response', async () => {
    const res = await new Client(server).get('/healthz')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
  })

  it('does not advertise the framework', async () => {
    const res = await new Client(server).get('/healthz')
    expect(res.headers.get('x-powered-by')).toBeNull()
  })
})
