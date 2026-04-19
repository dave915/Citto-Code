import assert from 'node:assert/strict'
import http from 'node:http'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function resolveFromRoot(...segments) {
  return path.join(rootDir, ...segments)
}

function loadTsModule(filePath) {
  const source = readFileSync(filePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
  })

  const module = { exports: {} }
  const execute = new Function('exports', 'module', 'require', '__filename', '__dirname', compiled.outputText)
  execute(module.exports, module, require, filePath, path.dirname(filePath))
  return module.exports
}

async function listen(server, port = 0) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object' && typeof address.port === 'number', 'server must expose a numeric port')
  return address.port
}

async function closeServer(server) {
  if (!server.listening) return
  await new Promise((resolve) => {
    server.close(() => resolve())
  })
}

async function getFreePort() {
  const server = http.createServer()
  try {
    return await listen(server, 0)
  } finally {
    await closeServer(server)
  }
}

function createFakeSender(id = 1) {
  const listeners = new Map()
  return {
    id,
    once(eventName, listener) {
      listeners.set(eventName, listener)
    },
    destroy() {
      listeners.get('destroyed')?.()
    },
  }
}

const previewProxyServiceModulePath = resolveFromRoot('electron', 'services', 'previewProxyService.ts')
const { createPreviewProxyService } = loadTsModule(previewProxyServiceModulePath)

const targetServer = http.createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')

  if (requestUrl.pathname === '/') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    })
    response.end('<!doctype html><html><body><h1>Home</h1><a href="/about">About</a><script src="/asset.js"></script></body></html>')
    return
  }

  if (requestUrl.pathname === '/about') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    })
    response.end('<!doctype html><html><body><h1>About</h1></body></html>')
    return
  }

  if (requestUrl.pathname === '/redirect') {
    response.writeHead(302, {
      location: '/about',
      'cache-control': 'no-store',
    })
    response.end()
    return
  }

  if (requestUrl.pathname === '/asset.js') {
    response.writeHead(200, {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store',
    })
    response.end('window.__previewProxyAssetLoaded = true;')
    return
  }

  response.writeHead(404, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end('Not found')
})

const targetPort = await listen(targetServer, 0)
const proxyPort = await getFreePort()
const previewProxyService = createPreviewProxyService({ port: proxyPort })
const sender = createFakeSender()
const bridgeScript = '<script>window.__previewBridgeInjected = true;</script>'
const targetOrigin = `http://127.0.0.1:${targetPort}`

try {
  const session = await previewProxyService.start(sender, {
    targetUrl: `${targetOrigin}/`,
    bridgeScript,
  })

  assert.ok(session, 'preview proxy must create a session for a localhost target')
  assert.equal(
    session.proxyUrl,
    `http://127.0.0.1:${proxyPort}/__citto_preview/${encodeURIComponent(session.sessionId)}/`,
    'session proxy URL must expose the fixed proxy origin with a session-aware path prefix',
  )

  const rootResponse = await fetch(session.proxyUrl)
  assert.equal(rootResponse.status, 200, 'session root should proxy the target page')
  const rootHtml = await rootResponse.text()
  assert.match(rootHtml, /<h1>Home<\/h1>/, 'root HTML should come from the target server')
  assert.match(rootHtml, /window\.__previewBridgeInjected = true;/, 'bridge script must be injected into proxied HTML responses')

  const aboutResponse = await fetch(`http://127.0.0.1:${proxyPort}/__citto_preview/${encodeURIComponent(session.sessionId)}/about`)
  assert.equal(aboutResponse.status, 200, 'session-prefixed document navigation should resolve directly')
  assert.match(await aboutResponse.text(), /<h1>About<\/h1>/, 'direct session-prefixed navigation should reach the about page')

  const redirectResponse = await fetch(
    `http://127.0.0.1:${proxyPort}/__citto_preview/${encodeURIComponent(session.sessionId)}/redirect`,
    { redirect: 'manual' },
  )
  assert.equal(redirectResponse.status, 302, 'proxied redirects must preserve the redirect status')
  assert.equal(
    redirectResponse.headers.get('location'),
    `http://127.0.0.1:${proxyPort}/__citto_preview/${encodeURIComponent(session.sessionId)}/about`,
    'redirect location must stay inside the session-aware proxy URL space',
  )

  const refererRoutedAssetResponse = await fetch(`http://127.0.0.1:${proxyPort}/asset.js`, {
    headers: {
      referer: session.proxyUrl,
    },
  })
  assert.equal(refererRoutedAssetResponse.status, 200, 'asset requests without the session prefix should still route via referer')
  assert.match(
    await refererRoutedAssetResponse.text(),
    /window\.__previewProxyAssetLoaded = true;/,
    'referer-routed asset requests should reach the original target origin',
  )

  const updatedSession = previewProxyService.update({
    sessionId: session.sessionId,
    targetUrl: `${targetOrigin}/about`,
    bridgeScript,
  })
  assert.ok(updatedSession, 'existing preview sessions must support target URL updates')
  assert.equal(
    updatedSession.proxyUrl,
    `http://127.0.0.1:${proxyPort}/__citto_preview/${encodeURIComponent(session.sessionId)}/about`,
    'updated proxy session should expose the new target path on the same session-aware prefix',
  )

  const updatedResponse = await fetch(updatedSession.proxyUrl)
  assert.equal(updatedResponse.status, 200, 'updated session should serve the new target URL')
  assert.match(await updatedResponse.text(), /<h1>About<\/h1>/, 'updated session must point at the new target document')
} finally {
  previewProxyService.dispose()
  sender.destroy()
  await closeServer(targetServer)
}

console.log('Preview proxy regression check passed.')
