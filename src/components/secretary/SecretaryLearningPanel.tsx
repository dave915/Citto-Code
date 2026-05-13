import { useMemo, useState } from 'react'
import type {
  SecretaryLearningCandidate,
  SecretaryLearningPromotionTarget,
  SecretaryMemoryEntry,
} from '../../../electron/preload'

type Props = {
  candidates: SecretaryLearningCandidate[]
  memories: SecretaryMemoryEntry[]
  onPromoteCandidate: (id: string, target: SecretaryLearningPromotionTarget) => void
  onDismissCandidate: (id: string) => void
  onUpdateMemory: (key: string, value: string) => Promise<boolean>
  onDeleteMemory: (key: string) => void
  compact?: boolean
  showMemories?: boolean
}

const KIND_LABEL: Record<SecretaryLearningCandidate['kind'], string> = {
  memory: '기억',
  skill: '스킬',
  workflow: '워크플로우',
}

const TARGET_LABEL: Record<SecretaryLearningPromotionTarget, string> = {
  memory: '기억',
  skill: '스킬',
  workflow: '워크플로우',
}

function formatSeenAt(value: number) {
  if (!Number.isFinite(value)) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function orderedTargets(kind: SecretaryLearningCandidate['kind']): SecretaryLearningPromotionTarget[] {
  const primary: SecretaryLearningPromotionTarget = kind
  return [primary, ...(['memory', 'skill', 'workflow'] as SecretaryLearningPromotionTarget[]).filter((target) => target !== primary)]
}

export function SecretaryLearningPanel({
  candidates,
  memories,
  onPromoteCandidate,
  onDismissCandidate,
  onUpdateMemory,
  onDeleteMemory,
  compact = false,
  showMemories = true,
}: Props) {
  const [memoryQuery, setMemoryQuery] = useState('')
  const [editingMemoryKey, setEditingMemoryKey] = useState<string | null>(null)
  const [editingMemoryValue, setEditingMemoryValue] = useState('')

  const filteredMemories = useMemo(() => {
    const query = memoryQuery.trim().toLowerCase()
    if (!query) return memories
    return memories.filter((memory) => (
      memory.key.toLowerCase().includes(query)
      || memory.label.toLowerCase().includes(query)
      || memory.value.toLowerCase().includes(query)
    ))
  }, [memories, memoryQuery])

  const startMemoryEdit = (memory: SecretaryMemoryEntry) => {
    setEditingMemoryKey(memory.key)
    setEditingMemoryValue(memory.value)
  }

  const saveMemoryEdit = async () => {
    if (!editingMemoryKey) return
    const saved = await onUpdateMemory(editingMemoryKey, editingMemoryValue)
    if (!saved) return
    setEditingMemoryKey(null)
    setEditingMemoryValue('')
  }

  return (
    <div className={`secretary-learning-panel${compact ? ' compact' : ''}`}>
      <section className="secretary-learning-section" aria-label="학습 후보">
        <div className="secretary-learning-section-header">
          <h3>학습 후보</h3>
          {candidates.length > 0 && <span>{candidates.length}</span>}
        </div>
        {candidates.length === 0 ? (
          <p className="secretary-learning-empty">새 후보가 없습니다</p>
        ) : (
          <div className="secretary-learning-list">
            {candidates.map((candidate) => (
              <article key={candidate.id} className="secretary-learning-item">
                <div className="secretary-learning-item-header">
                  <span>{KIND_LABEL[candidate.kind]}</span>
                  <time>{formatSeenAt(candidate.lastSeenAt)}</time>
                </div>
                <h4>{candidate.title}</h4>
                <p>{candidate.summary}</p>
                {!compact && <small>{candidate.source}</small>}
                <div className="secretary-learning-actions">
                  {orderedTargets(candidate.kind).map((target) => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => onPromoteCandidate(candidate.id, target)}
                    >
                      {TARGET_LABEL[target]}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="danger"
                    onClick={() => onDismissCandidate(candidate.id)}
                  >
                    삭제
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showMemories && (
      <section className="secretary-learning-section" aria-label="장기 기억">
        <div className="secretary-learning-section-header">
          <h3>기억</h3>
          {memories.length > 0 && <span>{memories.length}</span>}
        </div>
        <input
          className="secretary-memory-search"
          value={memoryQuery}
          onChange={(event) => setMemoryQuery(event.target.value)}
          placeholder="기억 검색"
        />
        {filteredMemories.length === 0 ? (
          <p className="secretary-learning-empty">표시할 기억이 없습니다</p>
        ) : (
          <div className="secretary-memory-list">
            {filteredMemories.map((memory) => {
              const editing = editingMemoryKey === memory.key
              return (
                <article key={memory.key} className="secretary-memory-item">
                  <div className="secretary-memory-item-header">
                    <span>{memory.label}</span>
                    <code>{memory.key}</code>
                  </div>
                  {editing ? (
                    <textarea
                      value={editingMemoryValue}
                      onChange={(event) => setEditingMemoryValue(event.target.value)}
                      rows={3}
                    />
                  ) : (
                    <p>{memory.value}</p>
                  )}
                  <div className="secretary-learning-actions">
                    {editing ? (
                      <>
                        <button type="button" onClick={() => void saveMemoryEdit()}>저장</button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMemoryKey(null)
                            setEditingMemoryValue('')
                          }}
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => startMemoryEdit(memory)}>수정</button>
                    )}
                    <button
                      type="button"
                      className="danger"
                      onClick={() => onDeleteMemory(memory.key)}
                    >
                      삭제
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      )}
    </div>
  )
}
