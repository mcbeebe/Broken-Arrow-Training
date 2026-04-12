/**
 * Cloudflare Worker for Strava OAuth token exchange.
 *
 * Deploy this as a Cloudflare Worker (free tier).
 * Set these environment variables (secrets) in the Worker dashboard:
 *   - STRAVA_CLIENT_ID
 *   - STRAVA_CLIENT_SECRET
 *
 * Then set VITE_STRAVA_TOKEN_EXCHANGE_URL in your app's .env to this Worker's URL.
 *
 * Usage:
 *   wrangler deploy worker/strava-token-exchange.ts
 */

interface Env {
  STRAVA_CLIENT_ID: string
  STRAVA_CLIENT_SECRET: string
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
    }

    try {
      const body = await request.json() as Record<string, string>

      // Determine if this is an initial token exchange or a refresh
      const isRefresh = body.grant_type === 'refresh_token'

      const stravaParams: Record<string, string> = {
        client_id: env.STRAVA_CLIENT_ID,
        client_secret: env.STRAVA_CLIENT_SECRET,
      }

      if (isRefresh) {
        stravaParams.grant_type = 'refresh_token'
        stravaParams.refresh_token = body.refresh_token
      } else {
        stravaParams.grant_type = 'authorization_code'
        stravaParams.code = body.code
      }

      const response = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stravaParams),
      })

      const data = await response.json()

      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
      })
    } catch {
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }
  },
}
