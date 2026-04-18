# AGENTS

이 파일은 이 저장소에서 작업하는 에이전트를 위한 기본 진입점이다.
`CLAUDE.md`는 이 문서를 가리키는 얇은 진입점이며, 실제 규칙은 여기와 `docs/harness/`에만 둔다.

## Canonical Docs

- 이 저장소의 하네스 문서는 `docs/harness/`만 신뢰한다.
- 기존 `docs/spec-v1/`, `docs/issues-v1/`, `docs/en/`, 루트 `README.md`는 기본적으로 무시한다.
- 사용자가 기존 문서를 직접 비교하거나 갱신하라고 요청한 경우에만 예외로 읽는다.

## Read Order

1. `docs/harness/README.md`
2. `docs/harness/architecture-map.md`
3. `docs/harness/change-workflow.md`
4. `docs/harness/quality-gates.md`
5. `docs/harness/area-ownership.md`
6. 필요하면 `docs/harness/task-template.md`

## Entry Points

- 앱 부트스트랩: `src/main.tsx`, `src/App.tsx`
- 렌더러 핵심 화면: `src/components/ChatView.tsx`, `src/components/InputArea.tsx`, `src/components/chat/ChatMessagePane.tsx`
- 세션 상태: `src/store/sessions.ts`, `src/store/sessionStoreState.ts`, `src/store/sessionStoreMutators.ts`
- Claude 스트리밍: `src/hooks/useClaudeStream.ts`, `src/hooks/claudeStream/*`
- 메인 프로세스: `electron/main.ts`
- Preload 경계: `electron/preload.ts`, `electron/preload/claudeApi.ts`, `electron/preload/quickPanelApi.ts`
- Claude IPC: `electron/ipc/claude.ts`, `electron/ipc/claude/*`
- Git IPC/서비스: `electron/ipc/git.ts`, `electron/services/gitService.ts`, `electron/services/git/*`
- Quick Panel: `src/quick-panel/*`, `src/hooks/useAppDesktopEffects.ts`, `electron/ipc/quickPanel.ts`, `electron/preload/quickPanelApi.ts`, `electron/main/windowController.ts`
- 레거시 예약 작업 마이그레이션: `src/main.tsx`, `electron/persistence.ts`, `electron/ipc/storage.ts`, `electron/services/scheduledTaskScheduler.ts`
- 설정 데이터: `electron/ipc/settings.ts`, `electron/services/settingsDataService.ts`, `electron/services/settingsData/*`

## Working Loop

1. 변경 요청을 기능 축으로 분류한다.
2. `docs/harness/area-ownership.md`에서 해당 영역과 인접 경계를 확인한다.
3. 필요한 파일만 읽고 최소 경계 안에서 수정한다.
4. 같은 요청 안에서 다음 명백한 구현/통합/검증 단계가 남아 있으면 사용자 확인을 기다리지 말고 이어서 진행한다.
5. 구조나 흐름이 바뀌면 `docs/harness/`를 같이 수정한다.
6. 최소 `npm run harness:check`를 실행한다.
7. TypeScript를 건드렸다면 `npm run typecheck` 또는 `npm run harness:check:strict`까지 실행한다.
8. 결과를 사용자에게 `변경 내용`, `검증`, `남은 리스크` 순으로 짧게 정리한다.

## Default Execution Mode

- 기본값은 `autonomous until blocked`다. 사용자가 명시적으로 멈추거나 계획만 원한다고 하지 않는 한, 분석에서 멈추지 말고 구현과 검증까지 끝낸다.
- 요청을 수행하는 데 필요한 세부조건이 일부 비어 있으면 먼저 합리적 가정을 세우고 진행한다.
- 작은 안정 경계 하나를 끝냈다고 바로 멈추지 않는다. 원래 요청의 완료조건이 아직 안 닫혔고 다음 단계가 명백하면 같은 흐름에서 계속 진행한다.
- 진행 중에는 짧게 상태를 공유하되, 매 단계마다 승인이나 확인을 요구하지 않는다.
- 아래 경우에는 멈추고 질문한다:
- 파괴적이거나 되돌리기 어려운 변경이 필요한 경우
- 현재 작업 트리의 사용자 변경과 직접 충돌하는 경우
- 서로 다른 제품 결정이 가능하고 어느 쪽이 맞는지 추론하기 어려운 경우
- 필요한 자격 증명, 외부 리소스, 환경 정보가 없어 검증이나 구현을 안전하게 끝낼 수 없는 경우

## Non-Negotiable Constraints

- 렌더러에서 Node/Electron API를 직접 호출하지 않는다. `window.claude` 또는 `window.quickPanel`만 사용한다.
- IPC 계약을 바꾸면 preload 타입과 렌더러 호출부를 같이 맞춘다.
- 세션/예약 작업의 persisted shape를 바꾸면 마이그레이션 영향부터 확인한다.
- 스트림, watcher, timer를 추가하면 해제 경로도 같은 변경에서 보장한다.
- 새 구조를 도입했으면 문서가 코드보다 뒤처지지 않게 같은 PR에서 갱신한다.
