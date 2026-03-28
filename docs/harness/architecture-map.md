# Architecture Map

이 문서는 코드베이스를 읽는 순서와 변경 경계를 설명한다.

## System Boundaries

### Main Process

- `electron/main.ts`
- `electron/main/windowController.ts`
- `electron/main/devLogger.ts`
- 역할: 윈도우 생성, 트레이/단축키 등록, IPC 핸들러 연결, 스케줄러/감시 서비스 수명주기 관리

### Preload

- `electron/preload.ts`
- `electron/preload/claudeApi.ts`
- 역할: 렌더러에 노출할 안전한 API만 브리지로 공개

### Renderer

- `src/main.tsx`
- `src/App.tsx`
- 역할: 상태 초기화, 화면 조합, 세션 기반 UX 렌더링

## Core Flows

### App Bootstrap

1. `electron/main.ts`가 브라우저 윈도우와 IPC를 준비한다.
2. `src/main.tsx`가 persisted snapshot을 읽고 Zustand 스토어를 복원한다.
3. `src/App.tsx`가 현재 세션, 설정, 예약 작업, 팀/서브에이전트 UI를 조합한다.

### Claude Conversation

1. `src/components/InputArea.tsx` 또는 `src/components/ChatView.tsx`에서 사용자 입력이 시작된다.
2. `src/App.tsx`가 `useClaudeStream`의 핸들러를 호출한다.
3. `src/hooks/useClaudeStream.ts`와 `src/hooks/claudeStream/*`가 세션 상태, 스트림 이벤트, 권한 요청, tool call 반영을 담당한다.
4. `electron/ipc/claude.ts`가 Claude IPC 채널을 연결하고, `electron/ipc/claude/*` helper가 모델 캐시, 프로세스 실행, 첨부 직렬화, 서브에이전트 라우팅을 나눠 담당한다.
5. 렌더러 스토어가 갱신되고 `ChatView`가 새 메시지, tool call, 서브에이전트 상태를 렌더링한다.

### Git Integration

1. 렌더러의 `src/hooks/git/*`가 Git 패널 요청을 만든다.
2. `electron/ipc/git.ts`가 IPC를 받아 서비스로 전달한다.
3. `electron/services/gitService.ts`와 `electron/services/git/*`가 실제 Git 명령 실행과 읽기/쓰기 처리를 맡는다.
4. `electron/services/gitHeadWatchService.ts`가 외부 브랜치 전환을 감시한다.

### Scheduled Tasks

1. `src/store/scheduledTasks.ts`와 `src/components/scheduledTasks/*`가 작업 정의와 UI를 관리한다.
2. `electron/ipc/storage.ts`와 persistence 계층이 snapshot을 보존한다.
3. `electron/services/scheduledTaskScheduler.ts`가 다음 실행 시각, catch-up, 중복 실행 방지를 관리한다.
4. 실행 시 렌더러는 새 세션을 열고 Claude 흐름에 합류한다.

### Settings And Claude Files

1. 설정 UI는 `src/components/settings/*`에 있다.
2. 렌더러는 `window.claude`를 통해 설정, MCP, Skill, plugin 파일 IO를 요청한다.
3. `electron/ipc/settings.ts`와 `electron/services/settingsDataService.ts`가 실제 읽기/쓰기 정책을 담당한다.

## High-Risk Integration Seams

- `electron/ipc/claude.ts` / `electron/ipc/claude/*` <-> `electron/preload/claudeApi.ts` <-> `src/hooks/useClaudeStream.ts`
- `src/main.tsx` persistence bootstrap <-> `src/store/sessions.ts` / `src/store/scheduledTasks.ts`
- `electron/services/scheduledTaskScheduler.ts` <-> renderer scheduled task advance handling
- `electron/services/gitHeadWatchService.ts` <-> Git panel refresh hooks

## Fast File Map By Intent

- 채팅 레이아웃/패널: `src/components/ChatView.tsx`, `src/components/chat/ChatViewMainContent.tsx`, `src/components/app/AppMainContent.tsx`, `src/hooks/useChatViewController.ts`, `src/hooks/useChatViewLayout.ts`, `src/hooks/useChatViewJumpState.ts`, `src/hooks/useAppPanels.ts`, `src/components/chat/*`, `src/components/message/*`, `src/components/toolcalls/HtmlPreview.tsx`, `src/components/toolcalls/useHtmlPreviewController.ts`, `src/components/toolcalls/htmlPreviewDocument.ts`
- 앱 루트 오케스트레이션: `src/App.tsx`, `src/hooks/useAppController.ts`, `src/hooks/useAppPanels.ts`, `src/components/app/*`
- 입력/멘션/첨부: `src/components/InputArea.tsx`, `src/components/input/*`, `src/components/input/useInputAreaController.ts`, `src/hooks/useInput*`
- 세션 상태/검색/직렬화: `src/store/*`, `src/lib/sessionUtils.ts`, `src/lib/sessionExport.ts`
- 팀/서브에이전트: `src/components/team/*`, `src/components/team/TeamViewHeader.tsx`, `src/components/team/TeamViewWorkspace.tsx`, `src/components/team/TeamViewComposer.tsx`, `src/components/team/TeamAgentSeat.tsx`, `src/components/team/TeamSelectedAgentPanel.tsx`, `src/components/team/TeamTaskPopover.tsx`, `src/components/team/TeamViewParts.tsx`, `src/components/team/TeamSetupSelectionPane.tsx`, `src/components/team/TeamSetupCustomAgentForm.tsx`, `src/components/team/TeamSetupPreviewPane.tsx`, `src/components/team/teamSetupShared.ts`, `src/components/team/TeamSetupModalParts.tsx`, `src/components/team/useTeamViewController.ts`, `src/hooks/useAgentTeam.ts`, `src/hooks/team/*`, `src/hooks/useSubagentStreams.ts`
- 파일 탐색/미리보기: `src/hooks/useFileExplorer.ts`, `src/components/chat/FilePanel.tsx`, `src/components/chat/PreviewPane.tsx`
- 메인 프로세스 부트스트랩/윈도우: `electron/main.ts`, `electron/main/windowController.ts`, `electron/main/devLogger.ts`, `electron/services/trayImageService.ts`
