# Change Workflow

이 문서는 에이전트가 실제 변경 작업을 수행할 때의 기본 루프를 정의한다.

## 1. Scope The Change

- 먼저 변경이 어느 경계에 속하는지 고른다.
- 가능한 분류:
  - renderer-only
  - renderer + store
  - renderer + preload + main IPC
  - scheduler/persistence
  - git integration
  - settings/MCP/skill IO

## 2. Read Only The Owning Files

- 항상 [Area Ownership](./area-ownership.md)의 파일 세트를 먼저 읽는다.
- 인접 모듈은 실제 연결부만 본다.
- 전체 리포지터리를 넓게 읽지 않는다.

## 3. Change The Smallest Stable Boundary

- UI 문제면 우선 컴포넌트와 관련 hook만 건드린다.
- 상태 전이 문제면 store 또는 session handler에서 해결하고 UI는 표시만 하게 둔다.
- 새 기능이 OS/file/Git/CLI 호출을 포함하면 preload와 IPC 경계를 명시적으로 통과시킨다.

## 4. Update The Harness When Structure Changes

아래 중 하나에 해당하면 문서를 같이 수정한다.

- 새 핵심 진입점이 생김
- 주요 데이터 흐름이 바뀜
- 품질 게이트가 늘어남
- 특정 영역의 수정 규칙이 달라짐

## 5. Run The Smallest Meaningful Validation

- 문서만 바꿨다면 `npm run harness:check`
- TypeScript 코드가 바뀌었다면 `npm run typecheck`
- 한 번에 묶어서 보려면 `npm run harness:check:strict`
- 메인/프리로드/IPC/build 경계가 바뀌었다면 `npm run build`

## 6. Report In Product Terms

- 무엇이 바뀌었는지
- 어떤 경계를 건드렸는지
- 어떤 명령으로 검증했는지
- 남은 수동 확인 포인트가 무엇인지

## Change Recipes

### UI 변경

- 시작 파일: `src/App.tsx`, `src/components/ChatView.tsx`, 관련 `src/components/*`
- 먼저 확인할 것: 레이아웃 상태가 store에 있어야 하는지, 로컬 state면 충분한지

### 스트림/메시지 처리 변경

- 시작 파일: `src/hooks/useClaudeStream.ts`, `src/hooks/claudeStream/*`, `electron/ipc/claude.ts`
- 먼저 확인할 것: abort, concurrent request, partial chunk, permission continuation 경로

### 저장 구조 변경

- 시작 파일: `src/main.tsx`, `src/store/sessions.ts`, `src/store/scheduledTasks.ts`, `electron/persistence.ts`
- 먼저 확인할 것: legacy migration, debounce flush, bootstrap failure fallback

### 예약 작업 변경

- 시작 파일: `src/store/scheduledTasks.ts`, `src/components/scheduledTasks/*`, `electron/services/scheduledTaskScheduler.ts`
- 먼저 확인할 것: nextRunAt 계산, 중복 실행 방지, sleep/wake catch-up

### Git 변경

- 시작 파일: `src/hooks/git/*`, `electron/ipc/git.ts`, `electron/services/gitService.ts`
- 먼저 확인할 것: staged/unstaged 반영, branch watch refresh, 외부 변경 동기화
