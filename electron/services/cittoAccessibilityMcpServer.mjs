import { execFile } from 'node:child_process'
import { appendFile, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const SERVER_NAME = 'citto-accessibility-use'
const DEFAULT_MAX_DEPTH = 8
const DEFAULT_MAX_NODES = 600

const AX_SWIFT_SOURCE = `
import Foundation
import AppKit
import ApplicationServices

struct Bounds: Codable {
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

struct AppInfo: Codable {
  let app_name: String?
  let bundle_id: String?
  let pid: Int
  let is_active: Bool
  let is_hidden: Bool
}

struct UINode: Codable {
  let id: String
  let role: String
  let name: String?
  let value: String?
  let description: String?
  let enabled: Bool
  let focused: Bool
  let bounds: Bounds?
  let actions: [String]
  let children: [UINode]?
}

struct TreeOutput: Codable {
  let ok: Bool
  let driver: String
  let snapshot_id: String
  let accessibility_trusted: Bool
  let app: AppInfo
  let root: UINode
  let node_count: Int
  let max_depth: Int
  let max_nodes: Int
  let truncated: Bool
}

struct AppListOutput: Codable {
  let ok: Bool
  let driver: String
  let accessibility_trusted: Bool
  let apps: [AppInfo]
}

struct ActivateOutput: Codable {
  let ok: Bool
  let driver: String
  let foreground: Bool
  let app: AppInfo
}

struct ActionOutput: Codable {
  let ok: Bool
  let driver: String
  let action: String
  let element_id: String
  let snapshot_id: String?
  let bounds: Bounds?
  let accessibility_trusted: Bool
}

let command = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
let payloadPath = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : ""
let payloadData = payloadPath.isEmpty
  ? Data("{}".utf8)
  : (try? Data(contentsOf: URL(fileURLWithPath: payloadPath))) ?? Data("{}".utf8)
let payload = ((try? JSONSerialization.jsonObject(with: payloadData)) as? [String: Any]) ?? [:]

func writeJSON<T: Encodable>(_ value: T) throws {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.sortedKeys]
  let data = try encoder.encode(value)
  print(String(data: data, encoding: .utf8)!)
}

func intPayload(_ key: String) -> Int? {
  if let number = payload[key] as? NSNumber { return number.intValue }
  if let string = payload[key] as? String { return Int(string) }
  return nil
}

func stringPayload(_ key: String) -> String {
  if let string = payload[key] as? String { return string.trimmingCharacters(in: .whitespacesAndNewlines) }
  return ""
}

func appInfo(_ app: NSRunningApplication) -> AppInfo {
  AppInfo(
    app_name: app.localizedName,
    bundle_id: app.bundleIdentifier,
    pid: Int(app.processIdentifier),
    is_active: app.isActive,
    is_hidden: app.isHidden
  )
}

func regularApps() -> [NSRunningApplication] {
  NSWorkspace.shared.runningApplications.filter { $0.activationPolicy == .regular }
}

func selectApp() -> NSRunningApplication? {
  let apps = regularApps()
  if let pid = intPayload("pid") {
    if let app = apps.first(where: { Int($0.processIdentifier) == pid }) { return app }
  }

  let bundleId = stringPayload("bundle_id")
  if !bundleId.isEmpty {
    if let app = apps.first(where: { $0.bundleIdentifier == bundleId }) { return app }
  }

  let appName = stringPayload("app_name")
  if !appName.isEmpty {
    let expected = appName.lowercased()
    return apps.first { app in
      let actual = (app.localizedName ?? "").lowercased()
      return actual == expected || (expected.count >= 5 && actual.contains(expected))
    }
  }

  return NSWorkspace.shared.frontmostApplication.flatMap { frontmost in
    apps.first { $0.processIdentifier == frontmost.processIdentifier }
  }
}

func copyAttribute(_ element: AXUIElement, _ attribute: CFString) -> CFTypeRef? {
  var value: CFTypeRef?
  let error = AXUIElementCopyAttributeValue(element, attribute, &value)
  return error == .success ? value : nil
}

func stringAttribute(_ element: AXUIElement, _ attribute: CFString) -> String? {
  guard let value = copyAttribute(element, attribute) else { return nil }
  if let string = value as? String {
    let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
  if let attributed = value as? NSAttributedString {
    let trimmed = attributed.string.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }
  if let number = value as? NSNumber {
    return number.stringValue
  }
  return nil
}

func boolAttribute(_ element: AXUIElement, _ attribute: CFString, defaultValue: Bool) -> Bool {
  guard let value = copyAttribute(element, attribute) else { return defaultValue }
  if let bool = value as? Bool { return bool }
  if let number = value as? NSNumber { return number.boolValue }
  return defaultValue
}

func boundsForElement(_ element: AXUIElement) -> Bounds? {
  guard let positionRef = copyAttribute(element, kAXPositionAttribute as CFString),
        let sizeRef = copyAttribute(element, kAXSizeAttribute as CFString),
        CFGetTypeID(positionRef) == AXValueGetTypeID(),
        CFGetTypeID(sizeRef) == AXValueGetTypeID() else {
    return nil
  }

  let positionValue = positionRef as! AXValue
  let sizeValue = sizeRef as! AXValue
  var point = CGPoint.zero
  var size = CGSize.zero
  guard AXValueGetType(positionValue) == .cgPoint,
        AXValueGetType(sizeValue) == .cgSize,
        AXValueGetValue(positionValue, .cgPoint, &point),
        AXValueGetValue(sizeValue, .cgSize, &size),
        size.width > 0,
        size.height > 0 else {
    return nil
  }

  return Bounds(
    x: Double(point.x),
    y: Double(point.y),
    width: Double(size.width),
    height: Double(size.height)
  )
}

func elementArrayAttribute(_ element: AXUIElement, _ attribute: CFString) -> [AXUIElement] {
  guard let value = copyAttribute(element, attribute) else { return [] }
  return (value as? [AXUIElement]) ?? []
}

func childrenForTraversal(_ element: AXUIElement) -> [AXUIElement] {
  let children = elementArrayAttribute(element, kAXChildrenAttribute as CFString)
  if !children.isEmpty { return children }
  return elementArrayAttribute(element, "AXWindows" as CFString)
}

func normalizeRole(_ raw: String?) -> String {
  guard let raw = raw, !raw.isEmpty else { return "unknown" }
  let map: [String: String] = [
    "AXApplication": "application",
    "AXWindow": "window",
    "AXDialog": "dialog",
    "AXSheet": "sheet",
    "AXButton": "button",
    "AXCheckBox": "checkbox",
    "AXRadioButton": "radio button",
    "AXTextField": "text field",
    "AXTextArea": "text area",
    "AXSearchField": "searchbox",
    "AXComboBox": "combo box",
    "AXPopUpButton": "popup button",
    "AXMenuButton": "menu button",
    "AXStaticText": "static text",
    "AXImage": "image",
    "AXGroup": "group",
    "AXScrollArea": "scroll area",
    "AXTable": "table",
    "AXRow": "row",
    "AXCell": "cell",
    "AXList": "list",
    "AXOutline": "outline",
    "AXTabGroup": "tab group",
    "AXToolbar": "toolbar",
    "AXMenu": "menu",
    "AXMenuItem": "menu item",
    "AXSlider": "slider",
    "AXValueIndicator": "value indicator"
  ]
  if let mapped = map[raw] { return mapped }
  if raw.hasPrefix("AX") {
    return String(raw.dropFirst(2)).lowercased()
  }
  return raw.lowercased()
}

func normalizeAction(_ raw: String) -> String {
  let map: [String: String] = [
    "AXPress": "press",
    "AXConfirm": "confirm",
    "AXCancel": "cancel",
    "AXIncrement": "increment",
    "AXDecrement": "decrement",
    "AXShowMenu": "showMenu",
    "AXPick": "pick",
    "AXRaise": "raise"
  ]
  if let mapped = map[raw] { return mapped }
  if raw.hasPrefix("AX") { return String(raw.dropFirst(2)).lowercased() }
  return raw
}

func actionNames(_ element: AXUIElement) -> [String] {
  var namesRef: CFArray?
  let error = AXUIElementCopyActionNames(element, &namesRef)
  guard error == .success, let names = namesRef as? [String] else { return [] }
  return names.map(normalizeAction).sorted()
}

func normalizeTree(root: AXUIElement, maxDepth: Int, maxNodes: Int) -> (UINode, Int, Bool) {
  var nodeCount = 0
  var truncated = false

  func walk(_ element: AXUIElement, id: String, depth: Int) -> UINode {
    nodeCount += 1
    let role = normalizeRole(stringAttribute(element, kAXRoleAttribute as CFString))
    let name = stringAttribute(element, kAXTitleAttribute as CFString)
    let value = stringAttribute(element, kAXValueAttribute as CFString)
    let description = stringAttribute(element, kAXDescriptionAttribute as CFString)
    let enabled = boolAttribute(element, kAXEnabledAttribute as CFString, defaultValue: true)
    let focused = boolAttribute(element, kAXFocusedAttribute as CFString, defaultValue: false)
    let bounds = boundsForElement(element)
    let actions = actionNames(element)

    var normalizedChildren: [UINode] = []
    if depth < maxDepth && nodeCount < maxNodes {
      let children = childrenForTraversal(element)
      for (index, child) in children.enumerated() {
        if nodeCount >= maxNodes {
          truncated = true
          break
        }
        normalizedChildren.append(walk(child, id: "\\(id).\\(index)", depth: depth + 1))
      }
    } else if depth >= maxDepth {
      if !childrenForTraversal(element).isEmpty { truncated = true }
    }

    return UINode(
      id: id,
      role: role,
      name: name,
      value: value,
      description: description,
      enabled: enabled,
      focused: focused,
      bounds: bounds,
      actions: actions,
      children: normalizedChildren.isEmpty ? nil : normalizedChildren
    )
  }

  return (walk(root, id: "0", depth: 0), nodeCount, truncated)
}

func actionTarget(root: AXUIElement, id: String) -> AXUIElement? {
  let parts = id.split(separator: ".").compactMap { Int($0) }
  guard parts.first == 0 else { return nil }
  var element = root
  for index in parts.dropFirst() {
    let children = childrenForTraversal(element)
    guard index >= 0 && index < children.count else { return nil }
    element = children[index]
  }
  return element
}

func errorMessage(_ error: AXError) -> String {
  switch error {
  case .success: return "success"
  case .failure: return "failure"
  case .illegalArgument: return "illegalArgument"
  case .invalidUIElement: return "invalidUIElement"
  case .invalidUIElementObserver: return "invalidUIElementObserver"
  case .cannotComplete: return "cannotComplete"
  case .attributeUnsupported: return "attributeUnsupported"
  case .actionUnsupported: return "actionUnsupported"
  case .notificationUnsupported: return "notificationUnsupported"
  case .notImplemented: return "notImplemented"
  case .notificationAlreadyRegistered: return "notificationAlreadyRegistered"
  case .notificationNotRegistered: return "notificationNotRegistered"
  case .apiDisabled: return "apiDisabled"
  case .noValue: return "noValue"
  case .parameterizedAttributeUnsupported: return "parameterizedAttributeUnsupported"
  case .notEnoughPrecision: return "notEnoughPrecision"
  @unknown default: return "AXError(\\(error.rawValue))"
  }
}

func buildTreeOutput(app: NSRunningApplication) throws -> TreeOutput {
  let maxDepth = max(1, min(16, intPayload("max_depth") ?? ${DEFAULT_MAX_DEPTH}))
  let maxNodes = max(1, min(2000, intPayload("max_nodes") ?? ${DEFAULT_MAX_NODES}))
  let root = AXUIElementCreateApplication(app.processIdentifier)
  let (tree, nodeCount, truncated) = normalizeTree(root: root, maxDepth: maxDepth, maxNodes: maxNodes)
  let snapshotId = "ax-\\(Int(app.processIdentifier))-\\(Int(Date().timeIntervalSince1970 * 1000))"
  return TreeOutput(
    ok: true,
    driver: "native-ax",
    snapshot_id: snapshotId,
    accessibility_trusted: AXIsProcessTrusted(),
    app: appInfo(app),
    root: tree,
    node_count: nodeCount,
    max_depth: maxDepth,
    max_nodes: maxNodes,
    truncated: truncated
  )
}

func performAction(app: NSRunningApplication) throws -> ActionOutput {
  let elementId = stringPayload("element_id")
  guard !elementId.isEmpty else {
    throw NSError(domain: "CittoAX", code: 1, userInfo: [NSLocalizedDescriptionKey: "element_id is required."])
  }
  let action = stringPayload("action")
  guard !action.isEmpty else {
    throw NSError(domain: "CittoAX", code: 2, userInfo: [NSLocalizedDescriptionKey: "action is required."])
  }

  let root = AXUIElementCreateApplication(app.processIdentifier)
  guard let element = actionTarget(root: root, id: elementId) else {
    throw NSError(domain: "CittoAX", code: 3, userInfo: [NSLocalizedDescriptionKey: "element_id was not found in the current AX tree."])
  }

  var error: AXError = .success
  if action == "setText" || action == "set_text" {
    let text = stringPayload("value")
    let focused: CFBoolean = kCFBooleanTrue
    _ = AXUIElementSetAttributeValue(element, kAXFocusedAttribute as CFString, focused)
    error = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, text as NSString)
  } else if action == "press" {
    error = AXUIElementPerformAction(element, kAXPressAction as CFString)
  } else if action == "focus" {
    let focused: CFBoolean = kCFBooleanTrue
    error = AXUIElementSetAttributeValue(element, kAXFocusedAttribute as CFString, focused)
  } else if action == "increment" {
    error = AXUIElementPerformAction(element, kAXIncrementAction as CFString)
  } else if action == "decrement" {
    error = AXUIElementPerformAction(element, kAXDecrementAction as CFString)
  } else {
    throw NSError(domain: "CittoAX", code: 4, userInfo: [NSLocalizedDescriptionKey: "unsupported action: \\(action)"])
  }

  guard error == .success else {
    throw NSError(domain: "CittoAX", code: Int(error.rawValue), userInfo: [NSLocalizedDescriptionKey: "AX action failed: \\(errorMessage(error))"])
  }

  usleep(120_000)
  return ActionOutput(
    ok: true,
    driver: "native-ax",
    action: action,
    element_id: elementId,
    snapshot_id: stringPayload("snapshot_id").isEmpty ? nil : stringPayload("snapshot_id"),
    bounds: boundsForElement(element),
    accessibility_trusted: AXIsProcessTrusted()
  )
}

if command == "list_apps" {
  try writeJSON(AppListOutput(
    ok: true,
    driver: "native-ax",
    accessibility_trusted: AXIsProcessTrusted(),
    apps: regularApps().map(appInfo)
  ))
} else if command == "activate_app" {
  guard let app = selectApp() else {
    throw NSError(domain: "CittoAX", code: 10, userInfo: [NSLocalizedDescriptionKey: "target app not found."])
  }
  app.unhide()
  app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
  usleep(280_000)
  try writeJSON(ActivateOutput(
    ok: true,
    driver: "native-ax",
    foreground: true,
    app: appInfo(app)
  ))
} else if command == "get_ui_tree" {
  guard let app = selectApp() else {
    throw NSError(domain: "CittoAX", code: 11, userInfo: [NSLocalizedDescriptionKey: "target app not found."])
  }
  try writeJSON(buildTreeOutput(app: app))
} else if command == "perform_ui_action" {
  guard let app = selectApp() else {
    throw NSError(domain: "CittoAX", code: 12, userInfo: [NSLocalizedDescriptionKey: "target app not found."])
  }
  try writeJSON(performAction(app: app))
} else {
  throw NSError(domain: "CittoAX", code: 13, userInfo: [NSLocalizedDescriptionKey: "unknown command: \\(command)"])
}
`

const TOOLS = [
  {
    name: 'list_apps',
    description: 'List running regular macOS apps using NSWorkspace. Use this before selecting an app for accessibility automation.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'activate_app',
    description: 'Bring a running macOS app foreground by pid, bundle_id, or app_name. This does not move the user cursor.',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: 'Target process id.' },
        bundle_id: { type: 'string', description: 'Target bundle identifier.' },
        app_name: { type: 'string', description: 'Target localized app name.' },
      },
    },
  },
  {
    name: 'get_ui_tree',
    description: 'Read and normalize a macOS Accessibility UI tree. Node ids are path-based and valid for the current app tree snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: 'Target process id.' },
        bundle_id: { type: 'string', description: 'Target bundle identifier.' },
        app_name: { type: 'string', description: 'Target localized app name.' },
        max_depth: { type: 'number', description: 'Traversal depth limit. Defaults to 8.' },
        max_nodes: { type: 'number', description: 'Traversal node limit. Defaults to 600.' },
      },
    },
  },
  {
    name: 'find_ui_targets',
    description: 'Rank normalized accessibility elements using profile target hints. Use this before perform_ui_action.',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: 'Target process id.' },
        bundle_id: { type: 'string', description: 'Target bundle identifier.' },
        app_name: { type: 'string', description: 'Target localized app name.' },
        intent: { type: 'string', description: 'Profile intent key. Defaults to send_message.' },
        targets: { type: 'object', description: 'Target hints keyed by logical target name.' },
        target_hints: { type: 'object', description: 'Alias for targets.' },
        profile: { type: 'object', description: 'Optional automation profile containing intents.*.targets.' },
        max_depth: { type: 'number', description: 'Traversal depth limit. Defaults to 8.' },
        max_nodes: { type: 'number', description: 'Traversal node limit. Defaults to 600.' },
      },
    },
  },
  {
    name: 'perform_ui_action',
    description: 'Run a non-coordinate AX action on an element id: press, setText, focus, increment, or decrement. Prefer this over visual coordinate clicking.',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: 'Target process id.' },
        bundle_id: { type: 'string', description: 'Target bundle identifier.' },
        app_name: { type: 'string', description: 'Target localized app name.' },
        snapshot_id: { type: 'string', description: 'Optional snapshot id from get_ui_tree/find_ui_targets for logging.' },
        element_id: { type: 'string', description: 'Path-based accessibility node id.' },
        action: { type: 'string', enum: ['press', 'setText', 'focus', 'increment', 'decrement'] },
        value: { type: 'string', description: 'Text value for setText.' },
      },
      required: ['element_id', 'action'],
    },
  },
  {
    name: 'verify_ui_state',
    description: 'Check the current accessibility tree for target existence or visible text. Use it after element actions before reporting success.',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: 'Target process id.' },
        bundle_id: { type: 'string', description: 'Target bundle identifier.' },
        app_name: { type: 'string', description: 'Target localized app name.' },
        rules: { type: 'array', items: { type: 'object' }, description: 'Verification rules. Supports type textVisible, messageVisible, targetExists.' },
        rule: { type: 'object', description: 'Single verification rule.' },
        targets: { type: 'object', description: 'Target hints for targetExists rules.' },
        slots: { type: 'object', description: 'Slot values used to resolve {{message}} or other placeholders.' },
        max_depth: { type: 'number', description: 'Traversal depth limit. Defaults to 8.' },
        max_nodes: { type: 'number', description: 'Traversal node limit. Defaults to 600.' },
      },
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

function asObject(value) {
  return isRecord(value) ? value : {}
}

function getString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function getFiniteNumber(value) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function clampPercent(value, fallback) {
  const number = getFiniteNumber(value)
  return number === null ? fallback : Math.max(0, Math.min(100, number))
}

function boundsCenter(bounds) {
  if (!isRecord(bounds)) return null
  const x = getFiniteNumber(bounds.x)
  const y = getFiniteNumber(bounds.y)
  const width = getFiniteNumber(bounds.width)
  const height = getFiniteNumber(bounds.height)
  if (x === null || y === null || width === null || height === null) return null
  return {
    x: x + width / 2,
    y: y + height / 2,
  }
}

function compactNode(node) {
  return {
    id: node.id,
    role: node.role,
    name: node.name ?? undefined,
    value: node.value ?? undefined,
    description: node.description ?? undefined,
    enabled: node.enabled,
    focused: node.focused,
    bounds: node.bounds ?? undefined,
    actions: Array.isArray(node.actions) ? node.actions : [],
  }
}

async function emitComputerUseEvent(event) {
  const eventFile = process.env.CITTO_VISUAL_EVENT_FILE || process.env.CITTO_COMPUTER_USE_EVENT_FILE
  if (!eventFile) return
  const payload = {
    createdAt: Date.now(),
    provider: SERVER_NAME,
    driver: 'native-ax',
    ...event,
  }
  await appendFile(eventFile, `${JSON.stringify(payload)}\n`, 'utf-8').catch(() => undefined)
}

async function runSwiftCommand(command, payload = {}, timeout = 15_000) {
  const workDir = await mkdtemp(join(tmpdir(), 'citto-ax-swift-'))
  const scriptPath = join(workDir, 'script.swift')
  const payloadPath = join(workDir, 'payload.json')
  await writeFile(scriptPath, AX_SWIFT_SOURCE, 'utf-8')
  await writeFile(payloadPath, JSON.stringify(payload), 'utf-8')

  try {
    const result = await execFileAsync('/usr/bin/xcrun', ['swift', scriptPath, command, payloadPath], {
      timeout,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    })
    const output = result.stdout.trim()
    return output ? JSON.parse(output) : {}
  } finally {
    await unlink(scriptPath).catch(() => undefined)
    await unlink(payloadPath).catch(() => undefined)
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function listApps(input) {
  return await runSwiftCommand('list_apps', input, 10_000)
}

async function activateApp(input) {
  const result = await runSwiftCommand('activate_app', input, 10_000)
  await emitComputerUseEvent({
    type: 'activate_app',
    message: '접근성 대상 앱을 앞으로 가져왔습니다.',
    cursor: {
      visible: true,
      x: 48,
      y: 42,
      label: '앱 전면',
      targetLabel: result?.app?.app_name ?? input.app_name ?? input.bundle_id ?? `pid ${input.pid ?? ''}`,
      mode: 'moving',
    },
  })
  return result
}

async function getUiTree(input) {
  const result = await runSwiftCommand('get_ui_tree', input, 20_000)
  await emitComputerUseEvent({
    type: 'get_ui_tree',
    message: `접근성 트리를 읽었습니다. node ${result.node_count ?? 0}개.`,
    cursor: {
      visible: true,
      x: 46,
      y: 42,
      label: 'AX 읽기',
      targetLabel: result?.app?.app_name ?? input.app_name ?? input.bundle_id ?? '앱',
      mode: 'waiting',
    },
  })
  return result
}

function flattenTree(root) {
  const nodes = []
  const visit = (node) => {
    if (!isRecord(node)) return
    nodes.push(node)
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child)
    }
  }
  visit(root)
  return nodes
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase()
}

function nodeSearchText(node) {
  return [
    node.name,
    node.value,
    node.description,
    node.role,
  ].map(normalizeText).filter(Boolean).join(' ')
}

function normalizeRole(value) {
  return normalizeText(value).replace(/^ax/, '').replace(/[_-]+/g, ' ')
}

function asStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => getString(item)).filter(Boolean)
}

function getTargetHints(input) {
  const directTargets = isRecord(input.targets) ? input.targets : isRecord(input.target_hints) ? input.target_hints : null
  if (directTargets) return directTargets

  const profile = asObject(input.profile)
  const intents = asObject(profile.intents)
  const intentName = getString(input.intent) || 'send_message'
  const intent = asObject(intents[intentName])
  return asObject(intent.targets)
}

function getVerticalRange(nodes) {
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const node of nodes) {
    const bounds = asObject(node.bounds)
    const y = getFiniteNumber(bounds.y)
    const height = getFiniteNumber(bounds.height) ?? 0
    if (y === null) continue
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y + height)
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY <= minY) {
    return { minY: 0, maxY: 1 }
  }
  return { minY, maxY }
}

function preferenceScore(node, preference, verticalRange) {
  if (!isRecord(preference)) return { score: 0, reason: '' }
  const bounds = asObject(node.bounds)
  const y = getFiniteNumber(bounds.y)
  const height = getFiniteNumber(bounds.height) ?? 0
  const centerY = y === null ? null : y + height / 2
  const span = Math.max(1, verticalRange.maxY - verticalRange.minY)
  if (preference.focused === true && node.focused === true) {
    return { score: 10, reason: 'focused' }
  }
  if (preference.bottomArea === true && centerY !== null && centerY >= verticalRange.minY + span * 0.62) {
    return { score: 8, reason: 'bottomArea' }
  }
  if (preference.topArea === true && centerY !== null && centerY <= verticalRange.minY + span * 0.38) {
    return { score: 8, reason: 'topArea' }
  }
  return { score: 0, reason: '' }
}

function scoreNodeForHint(node, hint, verticalRange) {
  const reasons = []
  let score = 0
  const nodeRole = normalizeRole(node.role)
  const searchText = nodeSearchText(node)
  const roles = asStringArray(hint.roles).map(normalizeRole)
  if (roles.some((role) => role && (nodeRole === role || nodeRole.includes(role) || role.includes(nodeRole)))) {
    score += 42
    reasons.push('role')
  }

  const labels = asStringArray(hint.labels).map(normalizeText)
  if (labels.some((label) => label && searchText.includes(label))) {
    score += 34
    reasons.push('label')
  }

  const values = asStringArray(hint.values).map(normalizeText)
  if (values.some((value) => value && normalizeText(node.value).includes(value))) {
    score += 24
    reasons.push('value')
  }

  const nearText = asStringArray(hint.nearText).map(normalizeText)
  if (nearText.some((text) => text && searchText.includes(text))) {
    score += 12
    reasons.push('nearText')
  }

  if (node.enabled === false) score -= 12
  if (Array.isArray(hint.prefer)) {
    for (const preference of hint.prefer) {
      const preferenceResult = preferenceScore(node, preference, verticalRange)
      if (preferenceResult.score > 0) {
        score += preferenceResult.score
        reasons.push(preferenceResult.reason)
      }
    }
  }
  if (node.focused === true) {
    score += 4
    reasons.push('focusedState')
  }

  return { score, reasons }
}

async function findUiTargets(input) {
  const tree = await getUiTree(input)
  const nodes = flattenTree(tree.root)
  const verticalRange = getVerticalRange(nodes)
  const hints = getTargetHints(input)
  const targets = {}
  let bestNode = null
  let bestTargetName = ''

  for (const [targetName, hintValue] of Object.entries(hints)) {
    const hint = asObject(hintValue)
    const candidates = nodes
      .map((node) => {
        const ranked = scoreNodeForHint(node, hint, verticalRange)
        return {
          ...compactNode(node),
          score: ranked.score,
          reasons: ranked.reasons,
        }
      })
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || String(left.id).localeCompare(String(right.id)))
      .slice(0, 8)
    targets[targetName] = candidates
    if (candidates[0] && (!bestNode || candidates[0].score > bestNode.score)) {
      bestNode = candidates[0]
      bestTargetName = targetName
    }
  }

  const center = boundsCenter(bestNode?.bounds)
  await emitComputerUseEvent({
    type: 'find_ui_targets',
    message: bestNode
      ? `접근성 후보를 찾았습니다: ${bestTargetName} -> ${bestNode.role} ${bestNode.name ?? bestNode.value ?? bestNode.id}.`
      : '접근성 후보를 찾지 못했습니다.',
    ...(center ? { screen: center } : {}),
    cursor: {
      visible: true,
      x: 50,
      y: 50,
      label: bestNode ? 'AX 후보' : '후보 없음',
      targetLabel: bestNode ? `${bestTargetName} ${bestNode.id}` : '접근성 트리',
      mode: bestNode ? 'moving' : 'waiting',
    },
  })

  return {
    ok: true,
    driver: 'native-ax',
    snapshot_id: tree.snapshot_id,
    app: tree.app,
    node_count: tree.node_count,
    accessibility_trusted: tree.accessibility_trusted,
    targets,
  }
}

async function performUiAction(input) {
  const result = await runSwiftCommand('perform_ui_action', input, 15_000)
  const center = boundsCenter(result.bounds)
  const action = getString(input.action) || result.action
  await emitComputerUseEvent({
    type: 'perform_ui_action',
    message: action === 'setText' || action === 'set_text'
      ? '접근성 element에 값을 입력했습니다.'
      : '접근성 element action을 실행했습니다.',
    ...(center ? { screen: center } : {}),
    cursor: {
      visible: true,
      x: 50,
      y: 50,
      label: action === 'setText' || action === 'set_text' ? 'AX 입력' : 'AX 실행',
      targetLabel: getString(input.element_id) || result.element_id,
      mode: action === 'setText' || action === 'set_text' ? 'typing' : 'clicking',
    },
  })
  return result
}

function resolveTemplate(text, slots) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => {
    const value = slots[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

function ruleText(rule, input) {
  const text = getString(rule.text) || getString(rule.value)
  return resolveTemplate(text, asObject(input.slots)).trim()
}

async function verifyUiState(input) {
  const tree = await getUiTree(input)
  const nodes = flattenTree(tree.root)
  const textIndex = nodes.map(nodeSearchText).join('\n')
  const rules = Array.isArray(input.rules)
    ? input.rules.filter(isRecord)
    : isRecord(input.rule)
      ? [input.rule]
      : []
  const hints = getTargetHints(input)
  const verticalRange = getVerticalRange(nodes)

  const results = rules.map((rawRule) => {
    const rule = asObject(rawRule)
    const type = getString(rule.type) || 'textVisible'
    if (type === 'targetExists') {
      const target = getString(rule.target)
      const hint = asObject(hints[target])
      const best = nodes
        .map((node) => ({ node, ...scoreNodeForHint(node, hint, verticalRange) }))
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => right.score - left.score)[0]
      return {
        type,
        target,
        passed: Boolean(best),
        candidate: best ? compactNode(best.node) : null,
      }
    }

    const expectedText = ruleText(rule, input)
    if (!expectedText) {
      return {
        type,
        passed: false,
        reason: 'text is empty after slot interpolation',
      }
    }
    return {
      type,
      text: expectedText,
      passed: textIndex.includes(normalizeText(expectedText)),
    }
  })

  const ok = results.length > 0 && results.every((result) => result.passed === true)
  await emitComputerUseEvent({
    type: 'verify_ui_state',
    message: ok ? '접근성 상태 검증을 통과했습니다.' : '접근성 상태 검증 결과를 확인했습니다.',
    cursor: {
      visible: true,
      x: 52,
      y: 48,
      label: 'AX 검증',
      targetLabel: tree?.app?.app_name ?? input.app_name ?? '앱',
      mode: ok ? 'done' : 'waiting',
    },
  })

  return {
    ok,
    driver: 'native-ax',
    snapshot_id: tree.snapshot_id,
    app: tree.app,
    accessibility_trusted: tree.accessibility_trusted,
    results,
  }
}

async function callTool(name, input) {
  const args = asObject(input)
  if (name === 'list_apps') return await listApps(args)
  if (name === 'activate_app') return await activateApp(args)
  if (name === 'get_ui_tree') return await getUiTree(args)
  if (name === 'find_ui_targets') return await findUiTargets(args)
  if (name === 'perform_ui_action') return await performUiAction(args)
  if (name === 'verify_ui_state') return await verifyUiState(args)
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
