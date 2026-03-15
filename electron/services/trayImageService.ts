import { app, nativeImage, type NativeImage } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { deflateSync } from 'zlib'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let bit = 0; bit < 8; bit += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  return table
})()

export function resolveAppIconPath() {
  const candidates = [
    join(process.cwd(), 'build', 'icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
    join(dirname(app.getAppPath()), 'build', 'icon.png'),
    join(process.resourcesPath, 'build', 'icon.png'),
    join(process.resourcesPath, 'app.asar.unpacked', 'build', 'icon.png'),
  ]

  for (const iconPath of candidates) {
    if (existsSync(iconPath)) return iconPath
  }

  return undefined
}

function resolveMacTrayTemplatePath() {
  const candidates = [
    join(process.cwd(), 'electron', 'assets', 'tray-mac-template.png'),
    join(app.getAppPath(), 'electron', 'assets', 'tray-mac-template.png'),
    join(dirname(app.getAppPath()), 'electron', 'assets', 'tray-mac-template.png'),
    join(process.resourcesPath, 'electron', 'assets', 'tray-mac-template.png'),
    join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'assets', 'tray-mac-template.png'),
  ]

  for (const assetPath of candidates) {
    if (existsSync(assetPath)) return assetPath
  }

  return undefined
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createPngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const lengthBuffer = Buffer.alloc(4)
  lengthBuffer.writeUInt32BE(data.length, 0)

  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer])
}

function encodeRgbaPng(width: number, height: number, pixels: Buffer) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (stride + 1)
    raw[rawOffset] = 0
    pixels.copy(raw, rawOffset + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    createPngChunk('IHDR', ihdr),
    createPngChunk('IDAT', deflateSync(raw)),
    createPngChunk('IEND', Buffer.alloc(0)),
  ])
}

function createMacTrayImageFromAsset(assetPath: string, size: number): NativeImage | null {
  const source = nativeImage.createFromPath(assetPath)
  if (source.isEmpty()) return null
  const image = source.resize({
    width: size,
    height: size,
    quality: 'best',
  })

  if (image.isEmpty()) return null
  return image
}

function createBurstTrayPixels(size: number, color: [number, number, number, number]) {
  const pixels = Buffer.alloc(size * size * 4, 0)

  const setPixel = (x: number, y: number, pixelColor: [number, number, number, number] = color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const offset = (y * size + x) * 4
    pixels[offset] = pixelColor[0]
    pixels[offset + 1] = pixelColor[1]
    pixels[offset + 2] = pixelColor[2]
    pixels[offset + 3] = pixelColor[3]
  }

  const drawDot = (cx: number, cy: number, radius: number, pixelColor: [number, number, number, number] = color) => {
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        const dx = x - cx
        const dy = y - cy
        if ((dx * dx) + (dy * dy) <= radius * radius) {
          setPixel(x, y, pixelColor)
        }
      }
    }
  }

  const drawLine = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    thickness: number,
    pixelColor: [number, number, number, number] = color,
  ) => {
    let currentX = x0
    let currentY = y0
    const deltaX = Math.abs(x1 - x0)
    const stepX = x0 < x1 ? 1 : -1
    const deltaY = -Math.abs(y1 - y0)
    const stepY = y0 < y1 ? 1 : -1
    let error = deltaX + deltaY

    while (true) {
      for (let offsetY = -thickness; offsetY <= thickness; offsetY += 1) {
        for (let offsetX = -thickness; offsetX <= thickness; offsetX += 1) {
          if ((offsetX * offsetX) + (offsetY * offsetY) <= thickness * thickness) {
            setPixel(currentX + offsetX, currentY + offsetY, pixelColor)
          }
        }
      }

      if (currentX === x1 && currentY === y1) break
      const doubleError = 2 * error
      if (doubleError >= deltaY) {
        error += deltaY
        currentX += stepX
      }
      if (doubleError <= deltaX) {
        error += deltaX
        currentY += stepY
      }
    }
  }

  const center = Math.floor(size / 2)
  const end = size - 3
  const start = 2

  drawLine(center, start, center, center - 3, 1)
  drawLine(center, center + 3, center, end, 1)
  drawLine(start, center, center - 3, center, 1)
  drawLine(center + 3, center, end, center, 1)
  drawLine(4, 4, center - 2, center - 2, 1)
  drawLine(center + 2, center + 2, size - 5, size - 5, 1)
  drawLine(size - 5, 4, center + 2, center - 2, 1)
  drawLine(center - 2, center + 2, 4, size - 5, 1)
  drawDot(center, center, 2)

  return pixels
}

function createMacMascotTrayPixels(size: number, color: [number, number, number, number]) {
  const pixels = Buffer.alloc(size * size * 4, 0)
  const clear: [number, number, number, number] = [0, 0, 0, 0]

  const setPixel = (x: number, y: number, pixelColor: [number, number, number, number] = color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const offset = (y * size + x) * 4
    pixels[offset] = pixelColor[0]
    pixels[offset + 1] = pixelColor[1]
    pixels[offset + 2] = pixelColor[2]
    pixels[offset + 3] = pixelColor[3]
  }

  const fillRect = (x: number, y: number, width: number, height: number, pixelColor: [number, number, number, number] = color) => {
    for (let row = y; row < y + height; row += 1) {
      for (let col = x; col < x + width; col += 1) {
        setPixel(col, row, pixelColor)
      }
    }
  }

  const fillCircle = (cx: number, cy: number, radius: number, pixelColor: [number, number, number, number] = color) => {
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        const dx = x - cx
        const dy = y - cy
        if ((dx * dx) + (dy * dy) <= radius * radius) {
          setPixel(x, y, pixelColor)
        }
      }
    }
  }

  const fillLine = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    thickness: number,
    pixelColor: [number, number, number, number] = color,
  ) => {
    let currentX = x0
    let currentY = y0
    const deltaX = Math.abs(x1 - x0)
    const stepX = x0 < x1 ? 1 : -1
    const deltaY = -Math.abs(y1 - y0)
    const stepY = y0 < y1 ? 1 : -1
    let error = deltaX + deltaY

    while (true) {
      fillCircle(currentX, currentY, thickness, pixelColor)
      if (currentX === x1 && currentY === y1) break
      const doubleError = 2 * error
      if (doubleError >= deltaY) {
        error += deltaY
        currentX += stepX
      }
      if (doubleError <= deltaX) {
        error += deltaX
        currentY += stepY
      }
    }
  }

  const scale = Math.max(1, Math.floor(size / 18))
  const scaled = (value: number) => Math.max(1, Math.round(value * scale))

  fillRect(scaled(4), scaled(5), scaled(10), scaled(7), color)
  fillRect(scaled(3), scaled(7), scaled(12), scaled(5), color)
  fillRect(scaled(4), scaled(11), scaled(10), scaled(2), color)
  fillCircle(scaled(7), scaled(4), scaled(3), color)
  fillCircle(scaled(11), scaled(4), scaled(3), color)
  fillCircle(scaled(3), scaled(10), scaled(3), color)
  fillCircle(scaled(15), scaled(10), scaled(3), color)
  fillRect(scaled(4), scaled(12), scaled(2), scaled(4), color)
  fillRect(scaled(7), scaled(12), scaled(2), scaled(4), color)
  fillRect(scaled(10), scaled(12), scaled(2), scaled(4), color)
  fillRect(scaled(13), scaled(12), scaled(2), scaled(4), color)

  fillCircle(scaled(7), scaled(8), scaled(1), clear)
  fillCircle(scaled(11), scaled(8), scaled(1), clear)
  fillLine(scaled(6), scaled(10), scaled(8), scaled(11), scaled(1), clear)
  fillLine(scaled(8), scaled(11), scaled(10), scaled(11), scaled(1), clear)
  fillLine(scaled(10), scaled(11), scaled(12), scaled(10), scaled(1), clear)

  return pixels
}

export function createTrayImage() {
  const size = process.platform === 'darwin' ? 18 : 16
  if (process.platform === 'win32') {
    const appIconPath = resolveAppIconPath()
    if (appIconPath) {
      const appIcon = nativeImage.createFromPath(appIconPath).resize({ width: size, height: size })
      if (!appIcon.isEmpty()) {
        return appIcon
      }
    }
  }

  if (process.platform === 'darwin') {
    const templatePath = resolveMacTrayTemplatePath()
    if (templatePath) {
      const templateImage = createMacTrayImageFromAsset(templatePath, size)
      if (templateImage) {
        return templateImage
      }
    }

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
        <defs>
          <mask id="face-cut">
            <rect width="72" height="72" fill="white" />
            <circle cx="28" cy="33" r="3.5" fill="black" />
            <circle cx="44" cy="33" r="3.5" fill="black" />
            <path
              d="M26 43 C31 47, 41 47, 46 43"
              fill="none"
              stroke="black"
              stroke-width="4"
              stroke-linecap="round"
            />
            <ellipse cx="36" cy="59" rx="8" ry="5.5" fill="black" />
          </mask>
        </defs>
        <g fill="#000000" mask="url(#face-cut)">
          <rect x="16" y="20" width="40" height="28" rx="8" />
          <circle cx="30" cy="18" r="10" />
          <circle cx="42" cy="18" r="10" />
          <circle cx="15" cy="39" r="10" />
          <circle cx="57" cy="39" r="10" />
          <rect x="19" y="46" width="6" height="16" rx="3" />
          <rect x="28" y="47" width="5" height="15" rx="2.5" />
          <rect x="39" y="47" width="5" height="15" rx="2.5" />
          <rect x="48" y="46" width="6" height="16" rx="3" />
        </g>
      </svg>
    `.trim()
    const templateImage = nativeImage.createFromDataURL(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    )
    if (!templateImage.isEmpty()) {
      templateImage.setTemplateImage(true)
      return templateImage
    }
  }

  const color: [number, number, number, number] = process.platform === 'darwin'
    ? [0, 0, 0, 255]
    : [217, 119, 87, 255]
  const pixels = process.platform === 'darwin'
    ? createMacMascotTrayPixels(size, color)
    : createBurstTrayPixels(size, color)
  const png = encodeRgbaPng(size, size, pixels)
  let image = nativeImage.createFromBuffer(png)

  if (image.isEmpty()) {
    const appIconPath = resolveAppIconPath()
    if (appIconPath) {
      image = nativeImage.createFromPath(appIconPath).resize({ width: size, height: size })
    }
  }

  if (process.platform === 'darwin' && !image.isEmpty()) {
    image.setTemplateImage(true)
  }

  return image
}
