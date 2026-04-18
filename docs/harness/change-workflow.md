# Change Workflow

이 문서는 에이전트가 실제 변경 작업을 수행할 때의 기본 루프를 정의한다.

## 1. Scope The Change

- 먼저 변경이 어느 경계에 속하는지 고른다.
- 사용자가 특정 화면 이름만 말했더라도, 실제 scope는 그 화면 파일이 아니라 바뀌는 사용자 동작과 공유 상태/공유 UI 경계로 판단한다.
- 가능한 분류:
  - renderer-only
  - renderer + store
  - renderer + preload + main IPC
  - scheduler/persistence
  - git integration
  - file/preview/open-with integration
  - settings/MCP/skill IO

## 2. Read Only The Owning Files

- 항상 [Area Ownership](./area-ownership.md)의 파일 세트를 먼저 읽는다.
- 같은 component, hook, store action, selector, persisted shape를 소비하는 인접 surface를 `rg`로 먼저 찾는다.
- 인접 모듈은 실제 연결부만 본다.
- 전체 리포지터리를 넓게 읽지 않는다.

## Adjacent Surface Rule

- screen-first가 아니라 behavior-first로 범위를 잡는다.
- 한 화면의 표시나 상호작용을 바꾸면, 같은 동작을 공유하는 다른 화면, 패널, modal, drilldown, quick panel 진입점이 있는지 먼저 확인한다.
- 같은 hook/store/component/action을 소비하는 다른 surface가 있으면 함께 맞추거나, 이번 변경 범위에서 제외한 이유를 결과에 남긴다.
- 관련 surface를 확인하지 않고 “말한 화면만 수정”한 상태는 완료로 보지 않는다.

## Default Execution Posture

- 기본 실행 모드는 `autonomous until blocked`다.
- 사용자가 계획만 요청한 경우가 아니면, 분석이나 제안에서 멈추지 말고 구현과 검증까지 이어서 진행한다.
- 요청 수행에 필요한 일부 정보가 비어 있으면 합리적 가정을 먼저 세우고 진행한다.
- 작은 변경 하나를 끝낸 뒤에도 원래 요청의 완료조건이 아직 남아 있고 다음 단계가 명백하면 같은 흐름에서 계속 진행한다.
- 진행 중에는 짧게 상태를 공유하되 단계마다 승인 요청을 반복하지 않는다.
- 아래 경우에는 멈추고 질문한다.
- 파괴적이거나 되돌리기 어려운 변경이 필요한 경우
- 사용자 변경과 직접 충돌해서 어느 쪽을 살려야 할지 분명하지 않은 경우
- 제품 결정이나 범위 결정이 여러 갈래로 갈릴 수 있고 어느 쪽이 맞는지 추론이 어려운 경우
- 필요한 자격 증명, 외부 리소스, 환경 정보가 없어 구현이나 검증을 안전하게 끝낼 수 없는 경우

## 3. Change The Smallest Stable Boundary

- UI 문제면 우선 컴포넌트와 관련 hook만 건드린다.
- 상태 전이 문제면 store 또는 session handler에서 해결하고 UI는 표시만 하게 둔다.
- 새 기능이 OS/file/Git/CLI 호출을 포함하면 preload와 IPC 경계를 명시적으로 통과시킨다.

## Refactoring Completion Rule

- 리팩토링의 기본 완료 조건은 사용자에게 보이는 외부 동작은 유지하고 내부 구조만 개선된 상태다.
- 기능 추가나 버그 수정이 필요해지면 리팩토링 안에 섞지 말고 별도 작업으로 분리하는 쪽을 기본값으로 둔다.
- Boy Scout Rule을 적용해서, 건드린 코드는 들어오기 전보다 더 읽기 쉽고 단순해야 한다.
- 범위는 건드린 경계 안에서 제한한다. "같이 고치면 좋아 보이는 곳"까지 확장하지 않는다.
- 테스트가 이미 있는 영역이면 리팩토링 전후 모두 green이어야 한다.
- 테스트가 없는 영역인데 변경 리스크가 높다면, 리팩토링 전에 좁은 검증 경로나 타깃 테스트를 먼저 만드는 쪽을 검토한다.

## 4. Update The Harness When Structure Changes

아래 중 하나에 해당하면 문서를 같이 수정한다.

- 새 핵심 진입점이 생김
- 주요 데이터 흐름이 바뀜
- 품질 게이트가 늘어남
- 특정 영역의 수정 규칙이 달라짐
- machine-checked path/script/import guard가 바뀌면 `docs/harness/manifest.json`도 같이 수정한다.

## 5. Run The Smallest Meaningful Validation

- 문서만 바꿨다면 `npm run harness:check`
- TypeScript 코드가 바뀌었다면 `npm run typecheck`
- 한 번에 묶어서 보려면 `npm run harness:check:strict`
- 메인/프리로드/IPC/build 경계가 바뀌었다면 `npm run build`

## 6. Report In Product Terms

- 무엇이 바뀌었는지
- 어떤 경계를 건드렸는지
- 어떤 명령으로 검증했는지
- 어떤 인접 surface를 같이 확인했는지, 또는 왜 제외했는지
- 남은 수동 확인 포인트가 무엇인지
- 작업이 아직 안 끝났다면 다음에 바로 이어질 가장 명백한 한 단계를 함께 적는다.

## Refactoring Done Checklist

- `Done When`에는 최소한 아래 성격의 조건이 들어가야 한다.
- 사용자에게 보이는 동작이 동일하다.
- 건드린 코드가 이전보다 명확하거나 중복이 줄었다.
- 자동 검증이 모두 green이다.
- 영향받는 흐름에 성능, 반응성, cleanup 회귀가 없다.
- 같은 동작을 공유하는 인접 surface와 동작 불일치가 없다.

## Change Recipes

### UI 변경

- 시작 파일: `src/App.tsx`, `src/components/ChatView.tsx`, 관련 `src/components/*`
- 먼저 확인할 것: 레이아웃 상태가 store에 있어야 하는지, 로컬 state면 충분한지

### 스트림/메시지 처리 변경

- 시작 파일: `src/hooks/useClaudeStream.ts`, `src/hooks/claudeStream/*`, `electron/ipc/claude.ts`
- 먼저 확인할 것: abort, concurrent request, partial chunk, permission continuation 경로

### 저장 구조 변경

- 시작 파일: `src/main.tsx`, `src/store/sessions.ts`, `src/store/workflowStore.ts`, `electron/persistence.ts`
- 먼저 확인할 것: legacy migration, debounce flush, bootstrap failure fallback

### 레거시 예약 작업 마이그레이션

- 시작 파일: `src/main.tsx`, `electron/persistence.ts`, `electron/ipc/storage.ts`
- 먼저 확인할 것: `scheduled_tasks.migrated_at`, 중복 변환 방지, workflow sync 타이밍

### Git 변경

- 시작 파일: `src/hooks/git/*`, `electron/ipc/git.ts`, `electron/services/gitService.ts`
- 먼저 확인할 것: staged/unstaged 반영, branch watch refresh, 외부 변경 동기화

### 파일/preview/open-with 변경

- 시작 파일: `src/hooks/useFileExplorer.ts`, `src/hooks/useChatOpenWith.ts`, `src/components/toolcalls/useHtmlPreviewController.ts`, `electron/ipc/files.ts`
- 먼저 확인할 것: preview URL allowlist, 저장/압축 경로 처리, open-with OS 분기, 파일 탐색/첨부 결과 shape
- preview UI sizing/viewport heuristic를 건드렸다면 `npm run harness:check:preview-ui`까지 green인지 확인한다.
