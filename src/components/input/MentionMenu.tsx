import type { MutableRefObject } from 'react'

import type { FileEntry } from '../../../electron/preload'
import { translate, type AppLanguage } from '../../lib/i18n'
import type { SlashCommand } from './inputUtils'

export function MentionMenu({
  language,
  slashResults,
  atResults,
  slashSelectedIndex,
  atSelectedIndex,
  slashItemRefs,
  atItemRefs,
  onSlashSelect,
  onAtSelect,
}: {
  language: AppLanguage
  slashResults: SlashCommand[]
  atResults: FileEntry[]
  slashSelectedIndex: number
  atSelectedIndex: number
  slashItemRefs: MutableRefObject<(HTMLButtonElement | null)[]>
  atItemRefs: MutableRefObject<(HTMLButtonElement | null)[]>
  onSlashSelect: (command: SlashCommand) => void
  onAtSelect: (file: FileEntry) => void
}) {
  if (slashResults.length === 0 && atResults.length === 0) {
    return null
  }

  return (
    <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-2xl border border-claude-border bg-claude-panel">
      <div className="flex items-center gap-1.5 border-b border-claude-border/60 bg-claude-surface px-3 py-2">
        {slashResults.length > 0 ? (
          <svg className="h-3 w-3 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 3L8 21M8 3h8" />
          </svg>
        ) : (
          <svg className="h-3 w-3 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
          </svg>
        )}
        <span className="text-xs font-medium text-claude-muted">
          {slashResults.length > 0
            ? translate(language, 'input.mention.slashCommands')
            : translate(language, 'input.mention.fileReferences')}
        </span>
        <span className="ml-auto text-xs text-claude-muted/60">
          {translate(language, 'input.mention.hint')}
        </span>
      </div>
      <div className="max-h-48 overflow-y-auto py-1">
        {slashResults.length > 0 ? (
          slashResults.map((command, index) => (
            <button
              key={`${command.kind ?? 'custom'}-${command.name}-${command.path}`}
              ref={(element) => { slashItemRefs.current[index] = element }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSlashSelect(command)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:bg-claude-surface-2 ${
                index === slashSelectedIndex ? 'bg-claude-surface-2 text-white' : 'text-claude-text hover:bg-claude-surface'
              }`}
            >
              <svg className="h-3.5 w-3.5 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 3L8 21M8 3h8" />
              </svg>
              <span className="truncate font-medium">/{command.name}</span>
              <span className="ml-auto max-w-[40%] truncate text-xs text-claude-muted">
                {command.kind === 'builtin'
                  ? (command.description ?? translate(language, 'input.mention.builtinCommand'))
                  : command.kind === 'plugin'
                    ? `${command.pluginName ?? 'plugin'}`
                    : command.legacy
                      ? `commands/${command.name}`
                      : `skills/${command.name}`}
              </span>
            </button>
          ))
        ) : (
          atResults.map((file, index) => (
            <button
              key={file.path}
              ref={(element) => { atItemRefs.current[index] = element }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onAtSelect(file)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:bg-claude-surface-2 ${
                index === atSelectedIndex ? 'bg-claude-surface-2 text-white' : 'text-claude-text hover:bg-claude-surface'
              }`}
            >
              <svg className="h-3.5 w-3.5 flex-shrink-0 text-claude-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="truncate font-medium">{file.name}</span>
              <span className="ml-auto max-w-[40%] truncate text-xs text-claude-muted">{file.relativePath}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
