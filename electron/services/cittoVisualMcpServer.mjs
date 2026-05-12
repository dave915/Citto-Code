import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { appendFile, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const SERVER_NAME = 'citto-visual-use'
const DEFAULT_OCR_LANGUAGES = ['ko-KR', 'en-US']
const MAX_IMAGE_CONTENT_BYTES = 8 * 1024 * 1024

const NATIVE_LIST_APPS_SWIFT_SOURCE = `
import Foundation
import AppKit

struct AppInfo: Encodable {
  let app_name: String?
  let bundle_id: String?
  let pid: Int
  let is_active: Bool
  let is_hidden: Bool
}

struct Output: Encodable {
  let apps: [AppInfo]
}

let apps = NSWorkspace.shared.runningApplications
  .filter { $0.activationPolicy == .regular }
  .map { app in
    AppInfo(
      app_name: app.localizedName,
      bundle_id: app.bundleIdentifier,
      pid: Int(app.processIdentifier),
      is_active: app.isActive,
      is_hidden: app.isHidden
    )
  }

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
let data = try encoder.encode(Output(apps: apps))
print(String(data: data, encoding: .utf8)!)
`

const NATIVE_ACTIVATE_APP_SWIFT_SOURCE = `
import Foundation
import AppKit

let pidArg = CommandLine.arguments.count > 1 ? Int32(CommandLine.arguments[1]) : nil
let bundleId = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : ""
let appName = CommandLine.arguments.count > 3 ? CommandLine.arguments[3] : ""

let apps = NSWorkspace.shared.runningApplications
let app = pidArg.flatMap { pid_t($0) }.flatMap { pid in
  apps.first { $0.processIdentifier == pid }
} ?? apps.first { app in
  !bundleId.isEmpty && app.bundleIdentifier == bundleId
} ?? apps.first { app in
  !appName.isEmpty && app.localizedName == appName
}

guard let target = app else {
  fputs("target app not found\\n", stderr)
  exit(1)
}

target.unhide()
target.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
usleep(280_000)
print("{\\"ok\\":true,\\"driver\\":\\"native\\",\\"pid\\":\\(target.processIdentifier)}")
`

const NATIVE_LIST_WINDOWS_SWIFT_SOURCE = `
import Foundation
import CoreGraphics

struct Bounds: Encodable {
  let x: Int
  let y: Int
  let width: Int
  let height: Int
}

struct Window: Encodable {
  let app_name: String?
  let title: String?
  let pid: Int
  let window_id: Int
  let bounds: Bounds
  let is_on_screen: Bool
  let on_current_space: Bool
}

struct Output: Encodable {
  let windows: [Window]
}

let includeHidden = CommandLine.arguments.count > 1 && CommandLine.arguments[1] == "all"
let options: CGWindowListOption = includeHidden ? [.optionAll, .excludeDesktopElements] : [.optionOnScreenOnly, .excludeDesktopElements]
let infoList = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []

let windows = infoList.compactMap { info -> Window? in
  guard let windowId = info[kCGWindowNumber as String] as? Int,
        let pid = info[kCGWindowOwnerPID as String] as? Int,
        let boundsDict = info[kCGWindowBounds as String] as? [String: Any],
        let bounds = CGRect(dictionaryRepresentation: boundsDict as CFDictionary) else {
    return nil
  }

  let layer = info[kCGWindowLayer as String] as? Int ?? 0
  if layer != 0 { return nil }
  if bounds.width <= 1 || bounds.height <= 1 { return nil }

  return Window(
    app_name: info[kCGWindowOwnerName as String] as? String,
    title: info[kCGWindowName as String] as? String,
    pid: pid,
    window_id: windowId,
    bounds: Bounds(
      x: Int(bounds.origin.x.rounded()),
      y: Int(bounds.origin.y.rounded()),
      width: Int(bounds.width.rounded()),
      height: Int(bounds.height.rounded())
    ),
    is_on_screen: info[kCGWindowIsOnscreen as String] as? Bool ?? false,
    on_current_space: info[kCGWindowIsOnscreen as String] as? Bool ?? false
  )
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
let data = try encoder.encode(Output(windows: windows))
print(String(data: data, encoding: .utf8)!)
`

const NATIVE_MOUSE_SWIFT_SOURCE = `
import Foundation
import CoreGraphics
import AppKit

let pid = pid_t(Int32(CommandLine.arguments[1])!)
let x = Double(CommandLine.arguments[2])!
let y = Double(CommandLine.arguments[3])!
let count = Int(CommandLine.arguments[4])!
let delayMicros = useconds_t(85_000)
let point = CGPoint(x: x, y: y)
let source = CGEventSource(stateID: .hidSystemState)

if let app = NSRunningApplication(processIdentifier: pid) {
  app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
  usleep(260_000)
}

CGWarpMouseCursorPosition(point)
usleep(40_000)

for index in 1...max(1, count) {
  guard let down = CGEvent(
    mouseEventSource: source,
    mouseType: .leftMouseDown,
    mouseCursorPosition: point,
    mouseButton: .left
  ), let up = CGEvent(
    mouseEventSource: source,
    mouseType: .leftMouseUp,
    mouseCursorPosition: point,
    mouseButton: .left
  ) else {
    fputs("failed to create mouse events\\n", stderr)
    exit(1)
  }

  down.setIntegerValueField(.mouseEventClickState, value: Int64(index))
  up.setIntegerValueField(.mouseEventClickState, value: Int64(index))
  down.post(tap: .cghidEventTap)
  usleep(delayMicros)
  up.post(tap: .cghidEventTap)
  usleep(delayMicros)
}

print("{\\"ok\\":true,\\"driver\\":\\"native\\",\\"foreground\\":true}")
`

const NATIVE_TYPE_TEXT_SWIFT_SOURCE = `
import Foundation
import CoreGraphics
import AppKit

let pid = pid_t(Int32(CommandLine.arguments[1])!)
let text = CommandLine.arguments[2]
let source = CGEventSource(stateID: .hidSystemState)
let pasteboard = NSPasteboard.general
let previousItems = pasteboard.pasteboardItems?.map { item -> NSPasteboardItem in
  let copy = NSPasteboardItem()
  for type in item.types {
    if let data = item.data(forType: type) {
      copy.setData(data, forType: type)
    }
  }
  return copy
} ?? []

if let app = NSRunningApplication(processIdentifier: pid) {
  app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
  usleep(160_000)
}

pasteboard.clearContents()
pasteboard.setString(text, forType: .string)

guard let down = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: true),
      let up = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: false) else {
  fputs("failed to create paste key events\\n", stderr)
  exit(1)
}

down.flags = .maskCommand
up.flags = .maskCommand
down.post(tap: .cghidEventTap)
usleep(20_000)
up.post(tap: .cghidEventTap)
usleep(140_000)

pasteboard.clearContents()
if !previousItems.isEmpty {
  pasteboard.writeObjects(previousItems)
}

print("{\\"ok\\":true,\\"driver\\":\\"native\\",\\"foreground\\":true}")
`

const NATIVE_KEY_SWIFT_SOURCE = `
import Foundation
import CoreGraphics
import AppKit

let keyCodes: [String: CGKeyCode] = [
  "return": 36,
  "enter": 36,
  "tab": 48,
  "space": 49,
  "delete": 51,
  "backspace": 51,
  "escape": 53,
  "esc": 53,
  "left": 123,
  "right": 124,
  "down": 125,
  "up": 126,
  "a": 0,
  "s": 1,
  "d": 2,
  "f": 3,
  "h": 4,
  "g": 5,
  "z": 6,
  "x": 7,
  "c": 8,
  "v": 9,
  "b": 11,
  "q": 12,
  "w": 13,
  "e": 14,
  "r": 15,
  "y": 16,
  "t": 17,
  "1": 18,
  "2": 19,
  "3": 20,
  "4": 21,
  "6": 22,
  "5": 23,
  "=": 24,
  "9": 25,
  "7": 26,
  "-": 27,
  "8": 28,
  "0": 29,
  "]": 30,
  "o": 31,
  "u": 32,
  "[": 33,
  "i": 34,
  "p": 35,
  "l": 37,
  "j": 38,
  "'": 39,
  "k": 40,
  ";": 41,
  "\\\\": 42,
  ",": 43,
  "/": 44,
  "n": 45,
  "m": 46,
  ".": 47
]

let pid = pid_t(Int32(CommandLine.arguments[1])!)
let key = CommandLine.arguments[2].lowercased()
let modifierNames = CommandLine.arguments.count > 3
  ? CommandLine.arguments[3].split(separator: ",").map { String($0).lowercased() }
  : []

guard let keyCode = keyCodes[key] else {
  fputs("unsupported key: \\\\(key)\\n", stderr)
  exit(1)
}

var flags = CGEventFlags()
for modifier in modifierNames {
  if modifier == "command" || modifier == "cmd" || modifier == "meta" {
    flags.insert(.maskCommand)
  } else if modifier == "shift" {
    flags.insert(.maskShift)
  } else if modifier == "option" || modifier == "alt" {
    flags.insert(.maskAlternate)
  } else if modifier == "control" || modifier == "ctrl" {
    flags.insert(.maskControl)
  }
}

let source = CGEventSource(stateID: .hidSystemState)
if let app = NSRunningApplication(processIdentifier: pid) {
  app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
  usleep(120_000)
}

guard let down = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: true),
      let up = CGEvent(keyboardEventSource: source, virtualKey: keyCode, keyDown: false) else {
  fputs("failed to create key events\\n", stderr)
  exit(1)
}
down.flags = flags
up.flags = flags
down.post(tap: .cghidEventTap)
usleep(12_000)
up.post(tap: .cghidEventTap)
print("{\\"ok\\":true,\\"driver\\":\\"native\\",\\"foreground\\":true}")
`

const OCR_SWIFT_SOURCE = `
import Foundation
import Vision
import ImageIO

struct OcrLine: Encodable {
  let text: String
  let confidence: Float
  let left: Double
  let top: Double
  let width: Double
  let height: Double
  let centerX: Double
  let centerY: Double
}

struct OcrOutput: Encodable {
  let width: Int
  let height: Int
  let lines: [OcrLine]
}

let imagePath = CommandLine.arguments[1]
let languages = CommandLine.arguments.count > 2
  ? Array(CommandLine.arguments.dropFirst(2))
  : ["ko-KR", "en-US"]

let url = URL(fileURLWithPath: imagePath)
guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
  fputs("failed to load image\\n", stderr)
  exit(1)
}

let imageWidth = image.width
let imageHeight = image.height
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = languages

let handler = VNImageRequestHandler(cgImage: image, options: [:])
try handler.perform([request])

let lines = (request.results ?? []).compactMap { observation -> OcrLine? in
  guard let candidate = observation.topCandidates(1).first else { return nil }
  let box = observation.boundingBox
  let left = Double(box.minX) * Double(imageWidth)
  let top = (1.0 - Double(box.minY) - Double(box.height)) * Double(imageHeight)
  let width = Double(box.width) * Double(imageWidth)
  let height = Double(box.height) * Double(imageHeight)
  return OcrLine(
    text: candidate.string,
    confidence: candidate.confidence,
    left: left,
    top: top,
    width: width,
    height: height,
    centerX: left + width / 2.0,
    centerY: top + height / 2.0
  )
}.sorted {
  if abs($0.top - $1.top) > 6.0 { return $0.top < $1.top }
  return $0.left < $1.left
}

let output = OcrOutput(width: imageWidth, height: imageHeight, lines: lines)
let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
let data = try encoder.encode(output)
print(String(data: data, encoding: .utf8)!)
`

const TOOLS = [
  {
    name: 'list_apps',
    description: 'List running regular macOS applications using native NSWorkspace. Use this in native mode before activating an app.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'launch_app',
    description: 'Launch a macOS app by app_name, bundle_id, or app_path, then bring it foreground. Native mode uses the macOS open command and returns the running app info.',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'App display name, for example Visual Studio Code.' },
        bundle_id: { type: 'string', description: 'App bundle identifier, for example com.microsoft.VSCode.' },
        app_path: { type: 'string', description: 'Optional absolute .app path.' },
      },
    },
  },
  {
    name: 'activate_app',
    description: 'Bring a running macOS app foreground by pid, bundle_id, or app_name. Native foreground mode uses this when the target app or window is hidden or behind other apps.',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: 'Target process id.' },
        bundle_id: { type: 'string', description: 'Target bundle identifier.' },
        app_name: { type: 'string', description: 'Target app localized name.' },
      },
    },
  },
  {
    name: 'list_windows',
    description: 'List visible macOS windows without reading accessibility trees. Native mode uses CoreGraphics; Cua mode uses Cua Driver. Use this before visual capture or coordinate actions.',
    inputSchema: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'Optional exact app name filter.' },
        pid: { type: 'number', description: 'Optional process id filter from list_apps.' },
        visible_only: { type: 'boolean', description: 'Only include on-screen windows. Defaults to true.' },
      },
    },
  },
  {
    name: 'capture_window_ocr',
    description: 'Capture one macOS window with screencapture and return OCR lines in window-local top-left pixel coordinates. This avoids Cua screenshot/get_window_state hangs.',
    inputSchema: {
      type: 'object',
      properties: {
        window_id: { type: 'number', description: 'The macOS window_id from list_windows.' },
        languages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Vision OCR recognition language tags. Defaults to ko-KR and en-US.',
        },
        include_image: {
          type: 'boolean',
          description: 'Also return the PNG as MCP image content when OCR is not enough. Defaults to false.',
        },
      },
      required: ['window_id'],
    },
  },
  {
    name: 'click_window',
    description: 'Click a window-local pixel coordinate without taking a debug screenshot. Native mode brings the target app foreground, maps capture pixels to screen points, then posts a real HID click; Cua mode uses Cua Driver. Coordinates match capture_window_ocr output.',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: 'Target app pid from list_windows.' },
        window_id: { type: 'number', description: 'Optional target window_id. Required in native mode.' },
        x: { type: 'number', description: 'Window-local x coordinate in pixels from the top-left.' },
        y: { type: 'number', description: 'Window-local y coordinate in pixels from the top-left.' },
        image_width: { type: 'number', description: 'Optional capture_window_ocr image width. Native mode uses this to map pixels to screen points.' },
        image_height: { type: 'number', description: 'Optional capture_window_ocr image height. Native mode uses this to map pixels to screen points.' },
        count: { type: 'number', description: 'Click count. Defaults to 1.' },
      },
      required: ['pid', 'x', 'y'],
    },
  },
  {
    name: 'double_click_window',
    description: 'Double-click a window-local pixel coordinate to open list rows, files, conversations, or other items. Native mode brings the target app foreground before posting the real HID double-click. Coordinates match capture_window_ocr output.',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: 'Target app pid from list_windows.' },
        window_id: { type: 'number', description: 'Optional target window_id. Required in native mode.' },
        x: { type: 'number', description: 'Window-local x coordinate in pixels from the top-left.' },
        y: { type: 'number', description: 'Window-local y coordinate in pixels from the top-left.' },
        image_width: { type: 'number', description: 'Optional capture_window_ocr image width. Native mode uses this to map pixels to screen points.' },
        image_height: { type: 'number', description: 'Optional capture_window_ocr image height. Native mode uses this to map pixels to screen points.' },
      },
      required: ['pid', 'x', 'y'],
    },
  },
  {
    name: 'type_text',
    description: 'Type text into the currently focused control for the foreground target app. Native mode activates the app and posts real keyboard events; Cua mode uses Cua Driver.',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: 'Target app pid from list_windows.' },
        text: { type: 'string', description: 'Text to type.' },
      },
      required: ['pid', 'text'],
    },
  },
  {
    name: 'press_key',
    description: 'Press one key in the foreground target app. Native mode activates the app and posts real keyboard events; Cua mode uses Cua Driver.',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: 'Target app pid from list_windows.' },
        key: { type: 'string', description: 'Key name to press, for example return, escape, tab, down, up.' },
        modifiers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional modifier keys such as command, shift, option, control.',
        },
      },
      required: ['pid', 'key'],
    },
  },
  {
    name: 'hotkey',
    description: 'Press a key chord in the foreground target app. Native mode activates the app and posts real keyboard events; Cua mode uses Cua Driver.',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: 'Target app pid from list_windows.' },
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keys in the chord, for example ["command", "l"].',
        },
      },
      required: ['pid', 'keys'],
    },
  },
]

let inputBuffer = Buffer.alloc(0)
let outputMode = 'line'
let pendingCalls = 0
let messageQueue = Promise.resolve()
let stdinEnded = false

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function expandHome(path) {
  return path.replace(/^~(?=$|\/)/, homedir())
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function useNativeDriver() {
  const driver = (process.env.CITTO_VISUAL_USE_DRIVER ?? 'native').trim().toLowerCase()
  return driver !== 'cua' && driver !== 'cua-driver'
}

async function emitComputerUseEvent(event) {
  const eventFile = process.env.CITTO_VISUAL_EVENT_FILE
  if (!eventFile) return
  const payload = {
    createdAt: Date.now(),
    provider: SERVER_NAME,
    driver: useNativeDriver() ? 'native' : 'cua-driver',
    ...event,
  }
  await appendFile(eventFile, `${JSON.stringify(payload)}\n`, 'utf-8').catch(() => undefined)
}

function findCuaDriverCommand() {
  const pathCandidates = (process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .map((entry) => join(entry, 'cua-driver'))

  const candidates = unique([
    process.env.CUA_DRIVER_COMMAND,
    process.env.CUA_DRIVER_PATH,
    '~/.local/bin/cua-driver',
    '/usr/local/bin/cua-driver',
    '/opt/homebrew/bin/cua-driver',
    ...pathCandidates,
  ]).map(expandHome)

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function asObject(value) {
  return isRecord(value) ? value : {}
}

function getNumber(input, key) {
  const value = input[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number.`)
  }
  return value
}

function getString(input, key) {
  const value = input[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be a non-empty string.`)
  }
  return value
}

function getStringArray(input, key, fallback = []) {
  const value = input[key]
  if (value === undefined) return fallback
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${key} must be an array of non-empty strings.`)
  }
  return value.map((item) => item.trim())
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeWindow(window) {
  return {
    app_name: window.app_name ?? null,
    title: window.title ?? null,
    pid: window.pid ?? null,
    window_id: window.window_id ?? null,
    bounds: window.bounds ?? null,
    is_on_screen: Boolean(window.is_on_screen),
    on_current_space: Boolean(window.on_current_space),
  }
}

async function runCuaCall(toolName, payload, timeout = 10_000) {
  const command = findCuaDriverCommand()
  if (!command) {
    throw new Error('cua-driver command was not found. Install Cua Driver or set CUA_DRIVER_COMMAND.')
  }

  const result = await execFileAsync(command, [
    'call',
    toolName,
    JSON.stringify(payload),
    '--compact',
  ], {
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      CUA_DRIVER_TELEMETRY_ENABLED: process.env.CUA_DRIVER_TELEMETRY_ENABLED ?? '0',
    },
  })

  const output = result.stdout.trim()
  if (!output) return { ok: true, output: '', parsed: null }

  try {
    return { ok: true, output, parsed: JSON.parse(output) }
  } catch {
    return { ok: true, output, parsed: null }
  }
}

async function runSwiftSource(source, args = [], timeout = 10_000) {
  const workDir = await mkdtemp(join(tmpdir(), 'citto-visual-swift-'))
  const scriptPath = join(workDir, 'script.swift')
  await writeFile(scriptPath, source, 'utf-8')

  try {
    const result = await execFileAsync('/usr/bin/xcrun', ['swift', scriptPath, ...args], {
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    })
    return result.stdout.trim()
  } finally {
    await unlink(scriptPath).catch(() => undefined)
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function runNativeListWindows() {
  const stdout = await runSwiftSource(NATIVE_LIST_WINDOWS_SWIFT_SOURCE, ['all'], 10_000)
  return JSON.parse(stdout)
}

async function runNativeListApps() {
  const stdout = await runSwiftSource(NATIVE_LIST_APPS_SWIFT_SOURCE, [], 10_000)
  return JSON.parse(stdout)
}

async function openNativeAppWindow({ pid, bundleId, appName }) {
  const candidates = []
  if (bundleId) candidates.push(['-b', bundleId])
  if (appName) candidates.push(['-a', appName])

  if (pid) {
    const apps = await runNativeListApps().catch(() => ({ apps: [] }))
    const app = Array.isArray(apps.apps)
      ? apps.apps.find((candidate) => candidate.pid === pid)
      : null
    if (app?.bundle_id) candidates.push(['-b', app.bundle_id])
    if (app?.app_name) candidates.push(['-a', app.app_name])
  }

  const seen = new Set()
  for (const args of candidates) {
    const key = args.join('\0')
    if (seen.has(key)) continue
    seen.add(key)
    try {
      await execFileAsync('/usr/bin/open', args, {
        timeout: 5000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      })
      await delay(500)
      return { ok: true, command: 'open', args }
    } catch {
      // Try the next identifier. Some localized app names are not accepted by `open -a`.
    }
  }

  return { ok: false }
}

function nativeAppMatches(app, { pid = null, bundleId = '', appName = '' }) {
  if (bundleId) return app.bundle_id === bundleId
  if (pid !== null) return app.pid === pid
  if (!appName) return false

  const normalizedActual = String(app.app_name ?? '').trim().toLowerCase()
  const normalizedExpected = appName.trim().toLowerCase()
  return normalizedActual === normalizedExpected
    || (normalizedExpected.length >= 5 && normalizedActual.includes(normalizedExpected))
}

async function waitForNativeApp(target, timeout = 10_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const apps = await runNativeListApps().catch(() => ({ apps: [] }))
    const app = Array.isArray(apps.apps)
      ? apps.apps.find((candidate) => nativeAppMatches(candidate, target))
      : null
    if (app) return app
    await delay(250)
  }
  return null
}

async function launchApp(input) {
  if (!useNativeDriver()) return await runCuaCall('launch_app', input, 10_000)

  const appName = typeof input.app_name === 'string' ? input.app_name.trim() : ''
  const bundleId = typeof input.bundle_id === 'string' ? input.bundle_id.trim() : ''
  const appPath = typeof input.app_path === 'string' ? input.app_path.trim() : ''
  if (!appName && !bundleId && !appPath) throw new Error('app_name, bundle_id, or app_path is required.')

  const vscodeAliasBundleId = /^(code|vscode|vs code|visual studio code)$/i.test(appName)
    ? 'com.microsoft.VSCode'
    : ''
  const targetBundleId = bundleId || vscodeAliasBundleId
  const candidates = []
  if (bundleId) candidates.push(['-b', bundleId])
  if (vscodeAliasBundleId) {
    candidates.push(['-b', 'com.microsoft.VSCode'])
    candidates.push(['-a', 'Visual Studio Code'])
  }
  if (appName) candidates.push(['-a', appName])
  if (appPath) candidates.push([appPath])

  const seen = new Set()
  let lastError = null
  for (const args of candidates) {
    const key = args.join('\0')
    if (seen.has(key)) continue
    seen.add(key)
    try {
      await execFileAsync('/usr/bin/open', args, {
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      })
      const launched = await waitForNativeApp({ bundleId: targetBundleId, appName }, 10_000)
      if (launched) {
        const openResult = await openNativeAppWindow({
          pid: launched.pid,
          bundleId: launched.bundle_id ?? targetBundleId,
          appName: launched.app_name ?? appName,
        })
        const refreshed = await waitForNativeApp({
          bundleId: launched.bundle_id ?? targetBundleId,
          appName: launched.app_name ?? appName,
        }, 5000) ?? launched
        await emitComputerUseEvent({
          type: 'launch_app',
          message: '대상 앱을 실행하고 앞으로 가져왔습니다.',
          cursor: {
            visible: true,
            x: 48,
            y: 42,
            label: '앱 실행',
            targetLabel: refreshed.app_name ?? appName ?? bundleId,
            mode: 'moving',
          },
        })
        return {
          ok: true,
          driver: 'native',
          foreground: true,
          launched_app: refreshed,
          opened_window: openResult,
          open_args: args,
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError ?? new Error(`failed to launch app: ${appName || bundleId || appPath}`)
}

async function listApps() {
  if (!useNativeDriver()) return await runCuaCall('list_apps', {}, 5000)
  return {
    ...await runNativeListApps(),
    driver: 'native',
  }
}

async function listWindows(input) {
  const visibleOnly = input.visible_only !== false
  const appName = typeof input.app_name === 'string' && input.app_name.trim()
    ? input.app_name.trim()
    : null
  const pid = typeof input.pid === 'number' && Number.isFinite(input.pid)
    ? Math.round(input.pid)
    : null
  const result = useNativeDriver() ? await runNativeListWindows() : (await runCuaCall('list_windows', {}, 5000)).parsed
  const windows = Array.isArray(result?.windows)
    ? result.windows.filter(isRecord).map(normalizeWindow)
    : []
  const filtered = windows.filter((window) => {
    if (visibleOnly && !window.is_on_screen) return false
    if (pid !== null && window.pid !== pid) return false
    if (appName && window.app_name !== appName) return false
    return true
  })

  return {
    windows: filtered,
    coordinate_note: 'Use window-local top-left pixel coordinates from capture_window_ocr for click_window.',
    driver: useNativeDriver() ? 'native' : 'cua-driver',
  }
}

async function activateApp(input) {
  const pid = typeof input.pid === 'number' && Number.isFinite(input.pid) ? String(Math.round(input.pid)) : ''
  const bundleId = typeof input.bundle_id === 'string' ? input.bundle_id.trim() : ''
  const appName = typeof input.app_name === 'string' ? input.app_name.trim() : ''
  if (!pid && !bundleId && !appName) throw new Error('pid, bundle_id, or app_name is required.')
  const stdout = await runSwiftSource(NATIVE_ACTIVATE_APP_SWIFT_SOURCE, [pid, bundleId, appName], 10_000)
  const activated = JSON.parse(stdout)
  const activatedPid = typeof activated.pid === 'number' ? activated.pid : Number(pid)
  const openResult = await openNativeAppWindow({
    pid: Number.isFinite(activatedPid) ? activatedPid : null,
    bundleId,
    appName,
  })
  const visibleWindows = Number.isFinite(activatedPid)
    ? (await listWindows({ pid: activatedPid, visible_only: true })).windows
    : []
  await emitComputerUseEvent({
    type: 'activate_app',
    message: '대상 앱을 앞으로 가져왔습니다.',
    cursor: {
      visible: true,
      x: 48,
      y: 42,
      label: '앱 전면',
      targetLabel: appName || bundleId || `pid ${pid}`,
      mode: 'moving',
    },
  })
  return {
    ...activated,
    foreground: true,
    opened_window: openResult,
    visible_windows: visibleWindows,
  }
}

async function runVisionOcr(imagePath, languages) {
  const stdout = await runSwiftSource(OCR_SWIFT_SOURCE, [imagePath, ...languages], 30_000)
  return JSON.parse(stdout)
}

async function captureWindowOcr(input) {
  const windowId = getNumber(input, 'window_id')
  const languages = getStringArray(input, 'languages', DEFAULT_OCR_LANGUAGES)
  const includeImage = input.include_image === true
  const imagePath = join(
    tmpdir(),
    `citto-window-${windowId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`,
  )

  try {
    await execFileAsync('/usr/sbin/screencapture', ['-x', '-l', String(windowId), imagePath], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
    const ocr = await runVisionOcr(imagePath, languages)
    const payload = {
      window_id: windowId,
      image: {
        width: ocr.width,
        height: ocr.height,
        coordinate_origin: 'top-left',
      },
      languages,
      lines: Array.isArray(ocr.lines) ? ocr.lines : [],
      coordinate_note: 'For click_window, use the returned centerX/centerY or another point in this same top-left pixel coordinate space.',
      driver: useNativeDriver() ? 'native' : 'cua-driver',
    }
    await emitComputerUseEvent({
      type: 'capture_window_ocr',
      message: '화면을 캡처하고 OCR로 읽었습니다.',
      cursor: {
        visible: true,
        x: 46,
        y: 42,
        label: '화면 읽기',
        targetLabel: `window ${windowId}`,
        mode: 'waiting',
      },
    })

    const content = [{ type: 'text', text: JSON.stringify(payload, null, 2) }]
    if (includeImage) {
      const image = await readFile(imagePath)
      if (image.byteLength <= MAX_IMAGE_CONTENT_BYTES) {
        content.push({ type: 'image', data: image.toString('base64'), mimeType: 'image/png' })
      } else {
        content.push({
          type: 'text',
          text: `PNG image content was ${image.byteLength} bytes, above the ${MAX_IMAGE_CONTENT_BYTES} byte return limit.`,
        })
      }
    }
    return { content }
  } finally {
    await unlink(imagePath).catch(() => undefined)
  }
}

async function getWindowCaptureSize(windowId) {
  const imagePath = join(
    tmpdir(),
    `citto-window-size-${windowId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`,
  )

  try {
    await execFileAsync('/usr/sbin/screencapture', ['-x', '-l', String(windowId), imagePath], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
    const result = await execFileAsync('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', imagePath], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    })
    const width = Number(result.stdout.match(/pixelWidth:\\s*(\\d+)/)?.[1])
    const height = Number(result.stdout.match(/pixelHeight:\\s*(\\d+)/)?.[1])
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error('failed to read captured window pixel size.')
    }
    return { width, height }
  } finally {
    await unlink(imagePath).catch(() => undefined)
  }
}

async function mapWindowPoint(input, x, y) {
  if (typeof input.window_id !== 'number' || !Number.isFinite(input.window_id)) return null
  const windowId = input.window_id
  const windows = await runNativeListWindows()
  const window = windows.windows.find((candidate) => candidate.window_id === windowId)
  if (!window?.bounds) throw new Error(`window_id ${windowId} was not found.`)

  const captureSize = typeof input.image_width === 'number' && typeof input.image_height === 'number'
    ? { width: input.image_width, height: input.image_height }
    : await getWindowCaptureSize(windowId)

  return {
    window_id: windowId,
    image: captureSize,
    bounds: window.bounds,
    global_x: window.bounds.x + (x * window.bounds.width / captureSize.width),
    global_y: window.bounds.y + (y * window.bounds.height / captureSize.height),
  }
}

async function nativeClickWindow(input, count) {
  const pid = getNumber(input, 'pid')
  const x = getNumber(input, 'x')
  const y = getNumber(input, 'y')
  getNumber(input, 'window_id')
  const mapped = await mapWindowPoint(input, x, y)
  if (!mapped) throw new Error('window_id is required in native mode.')
  const stdout = await runSwiftSource(
    NATIVE_MOUSE_SWIFT_SOURCE,
    [String(pid), String(mapped.global_x), String(mapped.global_y), String(count)],
    10_000,
  )
  await emitComputerUseEvent({
    type: count > 1 ? 'double_click_window' : 'click_window',
    message: count > 1 ? '대상 좌표를 더블클릭했습니다.' : '대상 좌표를 클릭했습니다.',
    screen: {
      x: mapped.global_x,
      y: mapped.global_y,
    },
    cursor: {
      visible: true,
      x: Math.max(0, Math.min(100, x * 100 / mapped.image.width)),
      y: Math.max(0, Math.min(100, y * 100 / mapped.image.height)),
      label: count > 1 ? '더블클릭' : '클릭',
      targetLabel: `window ${mapped.window_id}`,
      mode: 'clicking',
    },
  })
  return {
    ok: true,
    driver: 'native',
    output: stdout,
    mapped,
  }
}

async function clickWindow(input) {
  if (useNativeDriver()) return await nativeClickWindow(input, 1)

  const pid = getNumber(input, 'pid')
  const x = getNumber(input, 'x')
  const y = getNumber(input, 'y')
  const count = typeof input.count === 'number' && Number.isFinite(input.count)
    ? Math.max(1, Math.round(input.count))
    : 1
  const result = await runCuaCall('click', { pid, x, y, count }, 10_000)
  const mapped = await mapWindowPoint(input, x, y).catch(() => null)
  await emitComputerUseEvent({
    type: count > 1 ? 'double_click_window' : 'click_window',
    message: count > 1 ? '대상 좌표를 더블클릭했습니다.' : '대상 좌표를 클릭했습니다.',
    ...(mapped ? { screen: { x: mapped.global_x, y: mapped.global_y } } : {}),
    cursor: {
      visible: true,
      x: mapped ? Math.max(0, Math.min(100, x * 100 / mapped.image.width)) : 54,
      y: mapped ? Math.max(0, Math.min(100, y * 100 / mapped.image.height)) : 44,
      label: count > 1 ? '더블클릭' : '클릭',
      targetLabel: mapped ? `window ${mapped.window_id}` : `pid ${pid}`,
      mode: 'clicking',
    },
  })
  return mapped ? { ...result, mapped } : result
}

async function doubleClickWindow(input) {
  if (useNativeDriver()) return await nativeClickWindow(input, 2)

  const pid = getNumber(input, 'pid')
  const x = getNumber(input, 'x')
  const y = getNumber(input, 'y')
  const result = await runCuaCall('click', { pid, x, y, count: 2 }, 10_000)
  const mapped = await mapWindowPoint(input, x, y).catch(() => null)
  await emitComputerUseEvent({
    type: 'double_click_window',
    message: '대상 좌표를 더블클릭했습니다.',
    ...(mapped ? { screen: { x: mapped.global_x, y: mapped.global_y } } : {}),
    cursor: {
      visible: true,
      x: mapped ? Math.max(0, Math.min(100, x * 100 / mapped.image.width)) : 54,
      y: mapped ? Math.max(0, Math.min(100, y * 100 / mapped.image.height)) : 44,
      label: '더블클릭',
      targetLabel: mapped ? `window ${mapped.window_id}` : `pid ${pid}`,
      mode: 'clicking',
    },
  })
  return mapped ? { ...result, mapped } : result
}

async function typeText(input) {
  if (useNativeDriver()) {
    const pid = getNumber(input, 'pid')
    const text = getString(input, 'text')
    const stdout = await runSwiftSource(NATIVE_TYPE_TEXT_SWIFT_SOURCE, [String(pid), text], 30_000)
    await emitComputerUseEvent({
      type: 'type_text',
      message: '텍스트를 입력했습니다.',
      cursor: {
        visible: true,
        x: 58,
        y: 68,
        label: '입력',
        targetLabel: `pid ${pid}`,
        mode: 'typing',
      },
    })
    return { ok: true, driver: 'native', output: stdout }
  }

  const pid = getNumber(input, 'pid')
  const text = getString(input, 'text')
  return await runCuaCall('type_text', { pid, text }, 30_000)
}

async function pressKey(input) {
  if (useNativeDriver()) {
    const pid = getNumber(input, 'pid')
    const key = getString(input, 'key')
    const modifiers = getStringArray(input, 'modifiers', [])
    const stdout = await runSwiftSource(NATIVE_KEY_SWIFT_SOURCE, [String(pid), key, modifiers.join(',')], 10_000)
    await emitComputerUseEvent({
      type: 'press_key',
      message: `${key} 키를 입력했습니다.`,
      cursor: {
        visible: true,
        x: 60,
        y: 62,
        label: '키 입력',
        targetLabel: key,
        mode: 'typing',
      },
    })
    return { ok: true, driver: 'native', output: stdout }
  }

  const pid = getNumber(input, 'pid')
  const key = getString(input, 'key')
  const modifiers = getStringArray(input, 'modifiers', [])
  return await runCuaCall('press_key', modifiers.length ? { pid, key, modifiers } : { pid, key }, 10_000)
}

async function hotkey(input) {
  if (useNativeDriver()) {
    const pid = getNumber(input, 'pid')
    const keys = getStringArray(input, 'keys')
    const key = keys[keys.length - 1]
    const modifiers = keys.slice(0, -1)
    const stdout = await runSwiftSource(NATIVE_KEY_SWIFT_SOURCE, [String(pid), key, modifiers.join(',')], 10_000)
    await emitComputerUseEvent({
      type: 'hotkey',
      message: `${keys.join('+')} 단축키를 입력했습니다.`,
      cursor: {
        visible: true,
        x: 60,
        y: 62,
        label: '단축키',
        targetLabel: keys.join('+'),
        mode: 'typing',
      },
    })
    return { ok: true, driver: 'native', output: stdout }
  }

  const pid = getNumber(input, 'pid')
  const keys = getStringArray(input, 'keys')
  return await runCuaCall('hotkey', { pid, keys }, 10_000)
}

async function callTool(name, input) {
  const args = asObject(input)
  if (name === 'list_apps') return await listApps(args)
  if (name === 'launch_app') return await launchApp(args)
  if (name === 'activate_app') return await activateApp(args)
  if (name === 'list_windows') return await listWindows(args)
  if (name === 'capture_window_ocr') return await captureWindowOcr(args)
  if (name === 'click_window') return await clickWindow(args)
  if (name === 'double_click_window') return await doubleClickWindow(args)
  if (name === 'type_text') return await typeText(args)
  if (name === 'press_key') return await pressKey(args)
  if (name === 'hotkey') return await hotkey(args)
  throw new Error(`Unknown tool: ${name}`)
}

function writeMessage(message) {
  const json = JSON.stringify(message)
  if (outputMode === 'header') {
    process.stdout.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`)
  } else {
    process.stdout.write(`${json}\n`)
  }
}

function writeResult(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result })
}

function writeError(id, code, message) {
  writeMessage({ jsonrpc: '2.0', id, error: { code, message } })
}

async function handleMessage(message) {
  if (!isRecord(message) || typeof message.method !== 'string') {
    if (isRecord(message) && 'id' in message) writeError(message.id, -32600, 'Invalid request.')
    return
  }

  const id = message.id
  const hasId = id !== undefined && id !== null

  try {
    if (message.method === 'initialize') {
      if (hasId) {
        writeResult(id, {
          protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: '0.1.0' },
        })
      }
      return
    }

    if (message.method === 'notifications/initialized') return

    if (message.method === 'tools/list') {
      if (hasId) writeResult(id, { tools: TOOLS })
      return
    }

    if (message.method === 'tools/call') {
      const params = asObject(message.params)
      const name = typeof params.name === 'string' ? params.name : ''
      const toolResult = await callTool(name, params.arguments)
      if (!hasId) return
      if (Array.isArray(toolResult.content)) {
        writeResult(id, { content: toolResult.content })
      } else {
        writeResult(id, {
          content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
        })
      }
      return
    }

    if (hasId) writeError(id, -32601, `Method not found: ${message.method}`)
  } catch (error) {
    if (hasId) writeError(id, -32000, error instanceof Error ? error.message : String(error))
  }
}

function scheduleMessage(message) {
  pendingCalls += 1
  messageQueue = messageQueue
    .catch(() => undefined)
    .then(() => handleMessage(message))
    .finally(() => {
      pendingCalls -= 1
      if (stdinEnded && pendingCalls === 0) process.exit(0)
    })
  void messageQueue
}

function parseHeaderMessage() {
  const latin = inputBuffer.toString('latin1')
  const headerEnd = latin.indexOf('\r\n\r\n') >= 0 ? latin.indexOf('\r\n\r\n') : latin.indexOf('\n\n')
  if (headerEnd < 0) return null

  const separatorLength = latin.startsWith('\r\n\r\n', headerEnd) ? 4 : 2
  const headerText = inputBuffer.subarray(0, headerEnd).toString('utf8')
  const match = headerText.match(/content-length:\s*(\d+)/i)
  if (!match) throw new Error('Missing Content-Length header.')

  const length = Number(match[1])
  const bodyStart = headerEnd + separatorLength
  if (inputBuffer.length < bodyStart + length) return null

  const body = inputBuffer.subarray(bodyStart, bodyStart + length).toString('utf8')
  inputBuffer = inputBuffer.subarray(bodyStart + length)
  return JSON.parse(body)
}

function parseLineMessage() {
  const newlineIndex = inputBuffer.indexOf(10)
  if (newlineIndex < 0) return null
  const line = inputBuffer.subarray(0, newlineIndex).toString('utf8').trim()
  inputBuffer = inputBuffer.subarray(newlineIndex + 1)
  return line ? JSON.parse(line) : undefined
}

function drainInput() {
  while (inputBuffer.length > 0) {
    try {
      const prefix = inputBuffer.subarray(0, Math.min(inputBuffer.length, 32)).toString('latin1')
      const message = /^Content-Length:/i.test(prefix)
        ? (outputMode = 'header', parseHeaderMessage())
        : parseLineMessage()

      if (message === null) return
      if (message !== undefined) scheduleMessage(message)
    } catch (error) {
      writeError(null, -32700, error instanceof Error ? error.message : String(error))
      inputBuffer = Buffer.alloc(0)
      return
    }
  }
}

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk])
  drainInput()
})

process.stdin.on('end', () => {
  stdinEnded = true
  if (pendingCalls === 0) process.exit(0)
})

process.on('uncaughtException', (error) => {
  writeError(null, -32603, error instanceof Error ? error.message : String(error))
})

process.on('unhandledRejection', (error) => {
  writeError(null, -32603, error instanceof Error ? error.message : String(error))
})
