# Paper Tailwind Export

Paper source: `citto-code` / `Page 1`

This folder contains a Tailwind-based React export of the current Paper screens. It is intentionally separate from the production app source so the screens can be used as visual reference, implementation input, or a standalone prototype without changing runtime code.

## Files

- `PaperScreens.tsx` - Tailwind React components for all exported Paper artboards.

## Exported Artboards

| Paper node | Screen |
| --- | --- |
| `7AF-0` | 07 Team Empty |
| `7C2-0` | 08 Team Workspace |
| `7GY-0` | 11 Design System Pro |
| `7Q0-0` | 12 Pro Session |
| `8K5-0` | 13 Pro Review |
| `7TJ-0` | 14 Pro Workflow |
| `806-0` | 15 Pro Settings |
| `84J-0` | 16 Settings General |
| `88L-0` | 17 Settings MCP |
| `8CT-0` | 18 Settings Agents |
| `8GA-0` | 19 Settings Variables |

## Usage

```tsx
import { PaperScreensGallery, ProWorkflowScreen } from './paper-tailwind-export/PaperScreens'

export function App() {
  return <PaperScreensGallery />
}
```

The export uses fixed `1440 x 900` frames for app screens and a larger `1600px` design-system frame, matching the Paper artboard sizes.
