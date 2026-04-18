# Architecture Map

이 문서는 코드베이스를 읽는 순서와 변경 경계를 설명한다.

## System Boundaries

### Main Process

- `electron/main.ts`
- `electron/main/windowController.ts`
- `electron/main/devLogger.ts`
- `electron/workflow-executor.ts`
- 역할: 윈도우 생성, 트레이/단축키 등록, IPC 핸들러 연결, 스케줄러/실행 엔진 수명주기 관리

### Preload

- `electron/preload.ts`
- `electron/preload/claudeApi.ts`
- `electron/preload/quickPanelApi.ts`
- 역할: 렌더러에 노출할 안전한 API만 브리지로 공개

### Renderer

- `src/main.tsx`
- `src/App.tsx`
- `src/quick-panel/main.tsx`
- `src/quick-panel/QuickPanel.tsx`
- 역할: 상태 초기화, 메인 앱/퀵 패널 UX 렌더링

## Core Flows

### App Bootstrap

1. `electron/main.ts`가 브라우저 윈도우와 IPC를 준비한다.
2. `src/main.tsx`가 persisted snapshot을 읽고 Zustand 스토어를 복원한다.
3. `src/App.tsx`가 현재 세션, 설정, 워크플로우, 팀/서브에이전트 UI를 조합한다.

### Claude Conversation

1. `src/components/InputArea.tsx` 또는 `src/components/ChatView.tsx`에서 사용자 입력이 시작된다. 새 세션 버튼으로 연 경우에는 `src/hooks/useAppController.ts`가 renderer-local draft를 먼저 열고, 첫 입력 시점에만 실제 세션을 생성한다.
2. `src/App.tsx`가 `useClaudeStream`의 핸들러를 호출한다.
3. `src/hooks/useClaudeStream.ts`와 `src/hooks/claudeStream/*`가 세션 상태, 스트림 이벤트, 권한 요청, tool call 반영을 담당한다.
4. `electron/ipc/claude.ts`가 Claude IPC 채널을 연결하고, `electron/ipc/claude/*` helper가 모델 캐시, 프로세스 실행, 첨부 직렬화, 서브에이전트 라우팅을 나눠 담당한다.
5. `electron/services/claude-models.ts`가 로컬 모델 선택일 때만 Claude CLI env를 보정한다.
6. 렌더러 스토어가 갱신되고 `ChatView`가 새 메시지, tool call, 서브에이전트 상태를 렌더링한다.
7. 체크포인트 복원은 화면 히스토리를 되돌리되 Claude 세션은 새로 시작하며, 저장된 체크포인트 요약이 있으면 다음 요청 직전에 숨은 컨텍스트로만 재주입한다.

### Git Integration

1. 렌더러의 `src/hooks/git/*`가 Git 패널 요청을 만든다.
2. `electron/ipc/git.ts`가 IPC를 받아 서비스로 전달한다.
3. `electron/services/gitService.ts`와 `electron/services/git/*`가 실제 Git 명령 실행과 읽기/쓰기 처리를 맡는다.
4. `electron/services/gitHeadWatchService.ts`가 외부 브랜치 전환을 감시한다.

### Quick Panel

1. `src/hooks/useAppDesktopEffects.ts`가 최근 프로젝트 목록과 단축키 설정을 메인 프로세스로 동기화하고, `quick-panel:message`를 메인 채팅 세션 생성 흐름으로 다시 연결한다.
2. `electron/main/windowController.ts`가 글로벌 단축키 등록, 퀵 패널 윈도우 생성/위치/포커스 복원, 폴더 선택 모달을 담당한다.
3. `electron/ipc/quickPanel.ts`와 `electron/preload/quickPanelApi.ts`가 프로젝트 목록 조회, 단축키 갱신, submit/hide, 폴더 선택 요청을 브리지한다.
4. `src/quick-panel/QuickPanel.tsx`가 프로젝트 선택, blur/escape cleanup, cwd 포함 submit을 담당한다.

### Scheduled Tasks

1. 사용자-facing scheduled task UI는 제거되었고, `scheduled_tasks` 테이블은 워크플로우 마이그레이션 소스로만 남아 있다.
2. `src/main.tsx`가 부트 시 legacy scheduled task를 읽어 단일-agent workflow로 변환하고 migrated flag를 기록한다.
3. `electron/persistence.ts`가 `migrated_at` 컬럼과 미변환 task 로드/완료 마킹을 관리한다.
4. `electron/services/scheduledTaskScheduler.ts`는 legacy 구현 참고용으로 남아 있으나 현재 앱 부트 경로에는 연결되지 않는다.

### Workflow Builder

1. `src/store/workflowStore.ts`와 `src/components/workflow/*`가 워크플로우 정의, 실행 기록, 편집 UI를 관리한다.
2. `src/main.tsx`가 persisted workflow/workflow execution snapshot을 hydrate하고 debounce flush를 관리한다.
3. `electron/ipc/storage.ts`와 persistence 계층이 workflow/workflow execution CRUD를 유지한다.
4. `electron/workflow-executor.ts`가 수동 실행, 예약 실행, 놓친 예약 따라잡기, 취소, step update 스트림을 담당한다.
5. Agent step은 `electron/services/claude-spawn.ts`를 통해 일반 채팅과 같은 Claude CLI 설정으로 실행하고, 실행 직전에 renderer가 동기화한 Claude runtime 설정(`claudeBinaryPath`, env vars)을 재사용한다. renderer는 `workflow:*` 이벤트로 실행 기록을 갱신하면서 agent run을 별도 세션으로도 미러링한다.

### Settings And Claude Files

1. 설정 UI는 `src/components/settings/*`에 있다.
2. 렌더러는 `window.claude`를 통해 설정, MCP, Skill, plugin 파일 IO와 MCP 헬스 체크를 요청한다.
3. `electron/ipc/settings.ts`와 `electron/services/settingsDataService.ts`가 실제 읽기/쓰기 정책을 담당한다.
4. MCP 인증 필요 상태는 `src/components/settings/useMcpTabState.ts`에서 감지하고 `src/store/mcpRuntime.ts`를 통해 `src/components/InputArea.tsx`의 슬림 경고 바와 OS 알림으로 전달한다.

## High-Risk Integration Seams

- `electron/ipc/claude.ts` / `electron/ipc/claude/*` <-> `electron/preload/claudeApi.ts` <-> `src/hooks/useClaudeStream.ts`
- `src/main.tsx` persistence bootstrap <-> `src/store/sessions.ts` / `src/store/workflowStore.ts`
- `src/main.tsx` persistence bootstrap <-> `src/store/workflowStore.ts` <-> `electron/workflow-executor.ts`
- `src/main.tsx` legacy scheduled task migration <-> `electron/persistence.ts`
- `electron/services/claude-models.ts` <-> `electron/ipc/claude/processLauncher.ts`
- `electron/services/gitHeadWatchService.ts` <-> Git panel refresh hooks
- `src/components/toolcalls/HtmlPreview.tsx` / `src/components/toolcalls/useHtmlPreviewController.ts` <-> `electron/preload/claudeApi.ts` <-> `electron/services/previewWatchService.ts`
- `src/hooks/useAppDesktopEffects.ts` <-> `electron/main/windowController.ts` <-> `electron/ipc/quickPanel.ts` <-> `electron/preload/quickPanelApi.ts` <-> `src/quick-panel/QuickPanel.tsx`

## Fast File Map By Intent

- 채팅 레이아웃/패널: `src/components/ChatView.tsx`, `src/components/chat/ChatViewMainContent.tsx`, `src/components/chat/ChatHeader.tsx`, `src/components/chat/ChatSidePanel.tsx`, `src/components/chat/HtmlPreviewPanel.tsx`, `src/components/app/AppMainContent.tsx`, `src/hooks/useChatViewController.ts`, `src/hooks/useChatViewLayout.ts`, `src/hooks/useChatViewJumpState.ts`, `src/hooks/useAppPanels.ts`, `src/components/chat/*`, `src/components/message/*`, `src/components/toolcalls/HtmlPreview.tsx`, `src/components/toolcalls/useHtmlPreviewController.ts`, `src/components/toolcalls/htmlPreviewDocument.ts`, `electron/services/previewWatchService.ts`
- 앱 루트 오케스트레이션: `src/App.tsx`, `src/hooks/useAppController.ts`, `src/hooks/useAppPanels.ts`, `src/components/app/*`
- 워크플로우 빌더: `src/components/WorkflowsView.tsx`, `src/components/workflow/*`, `src/store/workflowStore.ts`, `src/store/workflowTypes.ts`, `electron/workflow-executor.ts`, `electron/services/claude-spawn.ts`
- 입력/멘션/첨부: `src/components/InputArea.tsx`, `src/components/input/*`, `src/components/input/useInputAreaController.ts`, `src/hooks/useInput*`
- 퀵 패널: `src/quick-panel/*`, `src/hooks/useAppDesktopEffects.ts`, `src/components/settings/general/QuickPanelSection.tsx`, `electron/main/windowController.ts`, `electron/ipc/quickPanel.ts`, `electron/preload/quickPanelApi.ts`
- 세션 상태/검색/직렬화: `src/store/*`, `src/lib/sessionUtils.ts`, `src/lib/sessionExport.ts`
- 팀/서브에이전트: `src/components/team/*`, `src/components/team/TeamViewHeader.tsx`, `src/components/team/TeamViewWorkspace.tsx`, `src/components/team/TeamViewComposer.tsx`, `src/components/team/TeamAgentSeat.tsx`, `src/components/team/TeamSelectedAgentPanel.tsx`, `src/components/team/TeamSelectedAgentMessageCard.tsx`, `src/components/team/TeamSelectedAgentMessagePopup.tsx`, `src/components/team/TeamTaskPopover.tsx`, `src/components/team/teamSelectedAgentShared.tsx`, `src/components/team/teamOverlayShared.tsx`, `src/components/team/TeamViewParts.tsx`, `src/components/team/TeamSetupSelectionPane.tsx`, `src/components/team/TeamSetupCustomAgentForm.tsx`, `src/components/team/TeamSetupPreviewPane.tsx`, `src/components/team/teamSetupShared.ts`, `src/components/team/TeamSetupModalParts.tsx`, `src/components/team/useTeamViewController.ts`, `src/hooks/useAgentTeam.ts`, `src/hooks/team/*`, `src/hooks/useSubagentStreams.ts`
- 파일 탐색/미리보기: `src/hooks/useFileExplorer.ts`, `src/components/chat/FilePanel.tsx`, `src/components/chat/PreviewPane.tsx`
- 메인 프로세스 부트스트랩/윈도우: `electron/main.ts`, `electron/main/windowController.ts`, `electron/main/devLogger.ts`, `electron/services/trayImageService.ts`
- 모델/env 보정: `electron/services/claude-models.ts`, `electron/ipc/claude/processLauncher.ts`
