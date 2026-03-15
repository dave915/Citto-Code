import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type RefObject,
  type SetStateAction,
  type SyntheticEvent,
} from 'react'
import type { FileEntry, SelectedFile } from '../../electron/preload'
import { type SlashCommand } from '../components/input/inputUtils'

type UseInputMentionsOptions = {
  cwd: string
  promptHistory: string[]
  slashCommands: SlashCommand[]
  syncTextareaHeight: (value: string) => void
  text: string
  textareaRef: RefObject<HTMLTextAreaElement>
  setAttachedFiles: Dispatch<SetStateAction<SelectedFile[]>>
  setText: Dispatch<SetStateAction<string>>
}

export function useInputMentions({
  cwd,
  promptHistory,
  slashCommands,
  syncTextareaHeight,
  text,
  textareaRef,
  setAttachedFiles,
  setText,
}: UseInputMentionsOptions) {
  const [atMention, setAtMention] = useState<{ query: string; startPos: number } | null>(null)
  const [atResults, setAtResults] = useState<FileEntry[]>([])
  const [atSelectedIndex, setAtSelectedIndex] = useState(0)
  const [slashMention, setSlashMention] = useState<{ query: string; startPos: number } | null>(null)
  const [slashResults, setSlashResults] = useState<SlashCommand[]>([])
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0)
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const atQueryRef = useRef<string | null>(null)
  const atItemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const slashItemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const draftTextRef = useRef('')

  const closeAtMention = useCallback(() => {
    setAtMention(null)
    setAtResults([])
    atQueryRef.current = null
  }, [])

  const closeSlashMention = useCallback(() => {
    setSlashMention(null)
    setSlashResults([])
  }, [])

  const handleAtSelect = useCallback(async (file: FileEntry) => {
    if (!atMention) return
    const cursor = textareaRef.current?.selectionStart ?? (atMention.startPos + atMention.query.length + 1)
    const newText = text.slice(0, atMention.startPos) + text.slice(cursor)
    setText(newText)
    closeAtMention()

    const selectedFile = await window.claude.readFile(file.path)
    if (selectedFile) {
      setAttachedFiles((prev) => {
        const existing = new Set(prev.map((entry) => entry.path))
        if (existing.has(file.path)) return prev
        return [...prev, selectedFile]
      })
    }
    textareaRef.current?.focus()
  }, [atMention, closeAtMention, setAttachedFiles, setText, text, textareaRef])

  const handleSlashSelect = useCallback((command: SlashCommand) => {
    if (!slashMention) return
    const cursor = textareaRef.current?.selectionStart ?? (slashMention.startPos + slashMention.query.length + 1)
    const newText = `${text.slice(0, slashMention.startPos)}/${command.name} ${text.slice(cursor)}`
    setText(newText)
    closeSlashMention()
    requestAnimationFrame(() => {
      const nextCursor = slashMention.startPos + command.name.length + 2
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }, [closeSlashMention, setText, slashMention, text, textareaRef])

  const applyHistoryText = useCallback((value: string) => {
    setText(value)
    requestAnimationFrame(() => {
      syncTextareaHeight(value)
      const end = value.length
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(end, end)
    })
  }, [setText, syncTextareaHeight, textareaRef])

  const handleInput = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value
    setText(nextValue)
    if (historyIndex === null) {
      draftTextRef.current = nextValue
    }
    if (historyIndex !== null) {
      setHistoryIndex(null)
      draftTextRef.current = nextValue
    }

    const textarea = event.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`

    const cursor = textarea.selectionStart
    const atMatch = nextValue.slice(0, cursor).match(/@([^\s@]*)$/)
    const slashMatch = nextValue.slice(0, cursor).match(/(^|\s)\/([^\s/]*)$/)

    if (atMatch && cwd) {
      const query = atMatch[1]
      const startPos = cursor - atMatch[0].length
      setAtMention({ query, startPos })
      setAtSelectedIndex(0)
      atQueryRef.current = query
      closeSlashMention()
      window.claude.listFiles(cwd, query).then((files) => {
        if (atQueryRef.current === query) setAtResults(files)
      }).catch(() => {
        if (atQueryRef.current === query) setAtResults([])
      })
    } else if (slashMatch) {
      const query = slashMatch[2].toLowerCase()
      const startPos = cursor - query.length - 1
      const filtered = slashCommands.filter((command) => command.name.toLowerCase().includes(query))
      setSlashMention({ query, startPos })
      setSlashResults(filtered)
      setSlashSelectedIndex(0)
      closeAtMention()
    } else {
      closeAtMention()
      closeSlashMention()
    }
  }, [closeAtMention, closeSlashMention, cwd, historyIndex, setText, slashCommands])

  const handleSelect = useCallback((event: SyntheticEvent<HTMLTextAreaElement>) => {
    if (!atMention) return
    const cursor = (event.target as HTMLTextAreaElement).selectionStart
    const textBefore = text.slice(0, cursor)
    if (!textBefore.match(/@([^\s@]*)$/)) {
      closeAtMention()
    }
    if (!textBefore.match(/(^|\s)\/([^\s/]*)$/)) {
      closeSlashMention()
    }
  }, [atMention, closeAtMention, closeSlashMention, text])

  useEffect(() => {
    atItemRefs.current[atSelectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [atSelectedIndex])

  useEffect(() => {
    slashItemRefs.current[slashSelectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [slashSelectedIndex])

  useEffect(() => {
    setHistoryIndex(null)
    draftTextRef.current = ''
  }, [promptHistory])

  return {
    applyHistoryText,
    atItemRefs,
    atResults,
    atSelectedIndex,
    closeAtMention,
    closeSlashMention,
    draftTextRef,
    handleAtSelect,
    handleInput,
    handleSelect,
    handleSlashSelect,
    historyIndex,
    setAtSelectedIndex,
    setHistoryIndex,
    setSlashSelectedIndex,
    slashItemRefs,
    slashResults,
    slashSelectedIndex,
  }
}
