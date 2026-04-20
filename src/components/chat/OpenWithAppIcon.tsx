import type { OpenWithApp } from '../../../electron/preload'

import finderIcon from '../../assets/open-with/finder.png'
import intellijIdeaIcon from '../../assets/open-with/intellij-idea.png'
import iterm2Icon from '../../assets/open-with/iterm2.png'
import terminalIcon from '../../assets/open-with/terminal.png'
import vscodeIcon from '../../assets/open-with/vscode.png'
import warpIcon from '../../assets/open-with/warp.png'
import webstormIcon from '../../assets/open-with/webstorm.png'
import xcodeIcon from '../../assets/open-with/xcode.png'

const OPEN_WITH_ICONS: Record<string, string> = {
  vscode: vscodeIcon,
  finder: finderIcon,
  terminal: terminalIcon,
  iterm2: iterm2Icon,
  warp: warpIcon,
  xcode: xcodeIcon,
  'intellij-idea': intellijIdeaIcon,
  webstorm: webstormIcon,
}

export function OpenWithAppIcon({
  app,
  className = 'h-4 w-4',
}: {
  app: OpenWithApp | null
  className?: string
}) {
  if (app?.iconDataUrl) {
    return <img src={app.iconDataUrl} alt="" className={`${className} rounded-md object-contain`} />
  }

  if (app && OPEN_WITH_ICONS[app.id]) {
    return <img src={OPEN_WITH_ICONS[app.id]} alt="" className={`${className} rounded-md object-contain`} />
  }

  if (app?.iconPath) {
    return <img src={encodeURI(`file://${app.iconPath}`)} alt="" className={`${className} rounded-md object-contain`} />
  }

  return (
    <span className={`flex items-center justify-center rounded-lg bg-claude-surface text-claude-muted ${className}`}>
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h9v9" />
      </svg>
    </span>
  )
}
