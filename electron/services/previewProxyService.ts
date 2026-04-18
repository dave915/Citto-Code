import http, { ServerResponse, type IncomingMessage, type Server } from 'http'
import type { Socket } from 'net'
import type { AddressInfo } from 'net'
import type { WebContents } from 'electron'
import httpProxy from 'http-proxy'

export type PreviewProxySession = {
  sessionId: string
  proxyUrl: string
  targetUrl: string
}

type PreviewProxyState = {
  id: string
  sender: WebContents
  server: Server
  proxy: httpProxy
  port: number
  targetUrl: string
  bridgeScript: string
}

const STRIPPED_RESPONSE_HEADERS = new Set([
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
])

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

function isLocalPreviewHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1' || hostname === '[::1]') {
    return true
  }

  return /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

function normalizeTargetUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim())
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!isLocalPreviewHost(parsed.hostname)) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function buildProxyOrigin(port: number): string {
  return `http://127.0.0.1:${port}`
}

function buildProxyUrl(targetUrl: string, port: number): string {
  const parsed = new URL(targetUrl)
  const pathname = parsed.pathname || '/'
  return `${buildProxyOrigin(port)}${pathname}${parsed.search}${parsed.hash}`
}

function buildTargetOrigin(targetUrl: string): string {
  const parsed = new URL(targetUrl)
  return `${parsed.protocol}//${parsed.host}`
}

function injectBridgeScript(html: string, bridgeScript: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${bridgeScript}\n</body>`)
  }

  return `${html}\n${bridgeScript}`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isHtmlResponse(contentType: string | string[] | undefined): boolean {
  const normalized = Array.isArray(contentType) ? contentType.join(';') : contentType ?? ''
  return normalized.includes('text/html') || normalized.includes('application/xhtml+xml')
}

function looksLikeHtmlNavigation(request: IncomingMessage): boolean {
  const acceptHeader = Array.isArray(request.headers.accept)
    ? request.headers.accept.join(',')
    : request.headers.accept ?? ''
  if (acceptHeader.includes('text/html') || acceptHeader.includes('application/xhtml+xml')) {
    return true
  }

  const destination = Array.isArray(request.headers['sec-fetch-dest'])
    ? request.headers['sec-fetch-dest'][0]
    : request.headers['sec-fetch-dest']
  return destination === 'document' || destination === 'iframe'
}

function hasFileExtension(pathname: string): boolean {
  const lastSegment = pathname.split('/').filter(Boolean).pop() ?? ''
  return lastSegment.includes('.')
}

function buildFallbackCandidateUrl(state: PreviewProxyState, pathname: string, search: string): string {
  return new URL(`${pathname}${search}`, buildTargetOrigin(state.targetUrl)).toString()
}

function rewriteLocationHeader(location: string, state: PreviewProxyState): string {
  try {
    const resolved = new URL(location, state.targetUrl)
    if (!isLocalPreviewHost(resolved.hostname)) return location
    return buildProxyUrl(resolved.toString(), state.port)
  } catch {
    return location
  }
}

function buildForwardedHeaders(
  proxyRes: IncomingMessage,
  state: PreviewProxyState,
  options: { dropContentLength: boolean },
) {
  const headers: Record<string, string | string[]> = {}

  for (const [name, value] of Object.entries(proxyRes.headers)) {
    if (value === undefined) continue

    const normalizedName = name.toLowerCase()
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(normalizedName)) continue
    if (STRIPPED_RESPONSE_HEADERS.has(normalizedName)) continue
    if (options.dropContentLength && normalizedName === 'content-length') continue

    if (normalizedName === 'location') {
      const locationValue = Array.isArray(value) ? value[0] : value
      if (locationValue) {
        headers[name] = rewriteLocationHeader(locationValue, state)
      }
      continue
    }

    headers[name] = value
  }

  return headers
}

function writeProxyFailure(
  response: ServerResponse,
  targetUrl: string,
  bridgeScript: string,
  message: string,
  statusCode = 502,
) {
  if (response.headersSent) return

  const body = injectBridgeScript(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Preview unavailable</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #111316;
        color: #e7eaee;
        display: grid;
        place-items: center;
      }
      main {
        width: min(680px, calc(100vw - 32px));
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        background: #171a1e;
        padding: 20px;
        box-sizing: border-box;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 16px;
        line-height: 1.4;
      }
      p {
        margin: 0 0 14px;
        color: #a9b3bd;
        font-size: 13px;
        line-height: 1.5;
      }
      code, pre {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        border-radius: 6px;
        background: #0f1114;
        padding: 12px;
        color: #d3d9df;
        font-size: 12px;
        line-height: 1.45;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Local preview proxy could not reach the target</h1>
      <p>${escapeHtml(targetUrl)}</p>
      <pre>${escapeHtml(message)}</pre>
    </main>
  </body>
</html>`, bridgeScript)

  response.writeHead(statusCode, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(body)
}

function buildForwardedHeadersFromFetch(headers: Headers, options: { dropContentLength: boolean }) {
  const nextHeaders: Record<string, string> = {}

  for (const [name, value] of headers.entries()) {
    const normalizedName = name.toLowerCase()
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(normalizedName)) continue
    if (STRIPPED_RESPONSE_HEADERS.has(normalizedName)) continue
    if (options.dropContentLength && normalizedName === 'content-length') continue
    if (normalizedName === 'location') continue
    nextHeaders[name] = value
  }

  return nextHeaders
}

async function tryHtmlNavigationFallback(
  request: IncomingMessage,
  state: PreviewProxyState,
): Promise<
  | { kind: 'response'; statusCode: number; headers: Record<string, string>; html: string | null }
  | { kind: 'redirect'; location: string }
  | null
> {
  if (!looksLikeHtmlNavigation(request)) return null

  const method = request.method?.toUpperCase() ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD') return null

  const requestUrl = new URL(request.url ?? '/', buildTargetOrigin(state.targetUrl))
  if (requestUrl.pathname === '/' || hasFileExtension(requestUrl.pathname)) return null

  const fetchHtmlCandidate = async (candidateUrl: string) => {
    const candidateResponse = await fetch(candidateUrl, {
      method,
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Encoding': 'identity',
        'X-Citto-Preview-Proxy': '1',
      },
    }).catch(() => null)

    if (!candidateResponse?.ok) return null
    if (!isHtmlResponse(candidateResponse.headers.get('content-type') ?? undefined)) return null

    return {
      statusCode: candidateResponse.status,
      headers: buildForwardedHeadersFromFetch(candidateResponse.headers, {
        dropContentLength: true,
      }),
      html: method === 'HEAD' ? null : await candidateResponse.text(),
    }
  }

  if (requestUrl.pathname.endsWith('/')) {
    return fetchHtmlCandidate(buildFallbackCandidateUrl(state, `${requestUrl.pathname}index.html`, requestUrl.search))
      .then((result) => (result ? { kind: 'response', ...result } : null))
  }

  const htmlFileFallback = await fetchHtmlCandidate(
    buildFallbackCandidateUrl(state, `${requestUrl.pathname}.html`, requestUrl.search),
  )
  if (htmlFileFallback) {
    return { kind: 'response', ...htmlFileFallback }
  }

  const indexFileFallback = await fetchHtmlCandidate(
    buildFallbackCandidateUrl(state, `${requestUrl.pathname}/index.html`, requestUrl.search),
  )
  if (!indexFileFallback) return null

  return {
    kind: 'redirect',
    location: `${requestUrl.pathname}/${requestUrl.search}`,
  }
}

async function handleProxyResponse(
  proxyRes: IncomingMessage,
  request: IncomingMessage,
  response: ServerResponse,
  state: PreviewProxyState,
) {
  const statusCode = proxyRes.statusCode ?? 200
  if (!isHtmlResponse(proxyRes.headers['content-type'])) {
    response.writeHead(statusCode, buildForwardedHeaders(proxyRes, state, { dropContentLength: false }))
    proxyRes.pipe(response)
    return
  }

  const chunks: Buffer[] = []
  proxyRes.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  })
  proxyRes.on('end', async () => {
    if (statusCode === 404) {
      const fallback = await tryHtmlNavigationFallback(request, state)
      if (fallback?.kind === 'redirect') {
        response.writeHead(302, {
          location: fallback.location,
          'cache-control': 'no-store',
        })
        response.end()
        return
      }

      if (fallback?.kind === 'response') {
        response.writeHead(fallback.statusCode, fallback.headers)
        response.end(
          fallback.html === null
            ? undefined
            : injectBridgeScript(fallback.html, state.bridgeScript),
        )
        return
      }
    }

    const html = Buffer.concat(chunks).toString('utf8')
    const injectedHtml = injectBridgeScript(html, state.bridgeScript)
    response.writeHead(statusCode, buildForwardedHeaders(proxyRes, state, { dropContentLength: true }))
    response.end(injectedHtml)
  })
  proxyRes.on('error', (error) => {
    writeProxyFailure(response, state.targetUrl, state.bridgeScript, String(error))
  })
}

async function closeServer(server: Server) {
  if (!server.listening) return

  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
}

export function createPreviewProxyService() {
  const sessions = new Map<string, PreviewProxyState>()
  const sessionIdsBySenderId = new Map<number, Set<string>>()
  const observedSenderIds = new Set<number>()
  let nextSessionId = 1

  function cleanupSession(sessionId: string) {
    const state = sessions.get(sessionId)
    if (!state) return

    sessions.delete(sessionId)
    const senderSessionIds = sessionIdsBySenderId.get(state.sender.id)
    if (senderSessionIds) {
      senderSessionIds.delete(sessionId)
      if (senderSessionIds.size === 0) {
        sessionIdsBySenderId.delete(state.sender.id)
      }
    }

    try {
      state.proxy.close()
    } catch {
      // Ignore close errors during teardown.
    }
    void closeServer(state.server)
  }

  function cleanupSender(senderId: number) {
    const sessionIds = [...(sessionIdsBySenderId.get(senderId) ?? [])]
    for (const sessionId of sessionIds) {
      cleanupSession(sessionId)
    }
    observedSenderIds.delete(senderId)
  }

  function observeSender(sender: WebContents) {
    if (observedSenderIds.has(sender.id)) return

    observedSenderIds.add(sender.id)
    sender.once('destroyed', () => {
      cleanupSender(sender.id)
    })
  }

  function toSessionInfo(state: PreviewProxyState): PreviewProxySession {
    return {
      sessionId: state.id,
      proxyUrl: buildProxyUrl(state.targetUrl, state.port),
      targetUrl: state.targetUrl,
    }
  }

  async function start(
    sender: WebContents,
    params: { targetUrl: string; bridgeScript: string },
  ): Promise<PreviewProxySession | null> {
    const normalizedTargetUrl = normalizeTargetUrl(params.targetUrl)
    if (!normalizedTargetUrl) return null

    const sessionId = `preview-proxy-${nextSessionId++}`
    const proxy = httpProxy.createProxyServer({
      changeOrigin: true,
      secure: false,
      ws: true,
      xfwd: true,
    })

    const server = http.createServer((request, response) => {
      proxy.web(request, response, {
        changeOrigin: true,
        ignorePath: false,
        secure: false,
        selfHandleResponse: true,
        target: buildTargetOrigin(state.targetUrl),
        xfwd: true,
      })
    })

    const state: PreviewProxyState = {
      id: sessionId,
      sender,
      server,
      proxy,
      port: 0,
      targetUrl: normalizedTargetUrl,
      bridgeScript: params.bridgeScript,
    }

    proxy.on('proxyReq', (proxyReq) => {
      proxyReq.setHeader('accept-encoding', 'identity')
      proxyReq.setHeader('x-citto-preview-proxy', '1')
    })

    proxy.on('proxyRes', (proxyRes, _request, response) => {
      void handleProxyResponse(proxyRes, _request, response as ServerResponse, state)
    })

    proxy.on('error', (error, _request, response) => {
      if (response instanceof ServerResponse) {
        writeProxyFailure(response, state.targetUrl, state.bridgeScript, String(error))
      }
    })

    server.on('upgrade', (request, socket, head) => {
      proxy.ws(request, socket, head, {
        changeOrigin: true,
        ignorePath: false,
        secure: false,
        target: buildTargetOrigin(state.targetUrl),
        xfwd: true,
      })
    })

    server.on('clientError', (_error, socket: Socket) => {
      if (!socket.destroyed) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
      }
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    }).catch((error) => {
      try {
        proxy.close()
      } catch {
        // Ignore close errors during failed startup.
      }
      throw error
    })

    const address = server.address()
    state.port = typeof address === 'object' && address ? (address as AddressInfo).port : 0
    if (!state.port) {
      cleanupSession(sessionId)
      return null
    }

    observeSender(sender)
    const senderSessionIds = sessionIdsBySenderId.get(sender.id) ?? new Set<string>()
    senderSessionIds.add(sessionId)
    sessionIdsBySenderId.set(sender.id, senderSessionIds)
    sessions.set(sessionId, state)

    return toSessionInfo(state)
  }

  function update(params: { sessionId: string; targetUrl: string; bridgeScript: string }): PreviewProxySession | null {
    const state = sessions.get(params.sessionId)
    if (!state) return null

    const normalizedTargetUrl = normalizeTargetUrl(params.targetUrl)
    if (!normalizedTargetUrl) return null

    state.targetUrl = normalizedTargetUrl
    state.bridgeScript = params.bridgeScript
    return toSessionInfo(state)
  }

  function stop(sessionId: string) {
    cleanupSession(sessionId)
  }

  function dispose() {
    for (const sessionId of [...sessions.keys()]) {
      cleanupSession(sessionId)
    }
  }

  return {
    start,
    update,
    stop,
    dispose,
  }
}
