# Area Ownership

이 문서는 기능 영역별로 먼저 읽어야 할 파일과 자주 발생하는 회귀를 정리한다.

## App Shell

- 파일:
  - `src/main.tsx`
  - `src/App.tsx`
  - `src/hooks/useAppController.ts`
  - `src/components/app/AppMainContent.tsx`
  - `src/hooks/useAppPanels.ts`
  - `src/components/Sidebar.tsx`
- 책임:
  - 앱 부트스트랩
  - 전역 패널 열림 상태
  - 세션/설정/예약 작업 상위 조합
  - 새 세션 draft 상태와 첫 입력 시점의 실제 세션 생성
  - `App.tsx`는 루트 레이아웃 렌더링만 유지한다.
  - `useAppController.ts`는 store/hook 조합, 세션 선택/점프, 팀 연동, 데스크톱 effect wiring을 담당한다.
  - 메인 화면 분기는 `AppMainContent.tsx`, 단일 패널 상태는 `useAppPanels.ts`에 둔다.
- 흔한 회귀:
  - hydration 후 active session 누락
  - 사이드바/메인 패널 상태 꼬임
  - draft 세션이 첫 입력 전에 사이드바나 quick panel 최근 목록에 섞여 들어감

## Main Process Shell

- 파일:
  - `electron/main.ts`
  - `electron/main/windowController.ts`
  - `electron/main/devLogger.ts`
  - `electron/services/trayImageService.ts`
- 책임:
  - 앱 부트스트랩
  - 메인 윈도우/퀵패널 생성과 포커스 복원
  - 트레이/글로벌 단축키/외부 링크 처리
  - dev log 전달과 메인 프로세스 수명주기 정리
  - `main.ts`는 서비스 초기화와 IPC wiring만 유지하고, 윈도우/퀵패널 상태는 `windowController.ts`, 개발용 로그 전달은 `devLogger.ts`에 둔다.
- 흔한 회귀:
  - quick panel 단축키 재등록 누락
  - 창 재생성 후 preload 경계나 외부 링크 처리 누락
  - will-quit cleanup 누락

## Session State And Persistence

- 파일:
  - `src/store/sessions.ts`
  - `src/store/sessionStoreState.ts`
  - `src/store/sessionStoreMutators.ts`
  - `src/store/scheduledTasks.ts`
  - `electron/persistence.ts`
- 책임:
  - 세션/예약 작업 저장 구조
  - migrate/rehydrate
  - sqlite snapshot 동기화
  - `sessionStoreState.ts`는 store action wiring과 persisted 필드 기본값을 유지하고, 반복적인 session/message/tool mutation helper는 `sessionStoreMutators.ts`에 둔다.
  - user/assistant message 생성, btw anchor 삽입, tool call append, stream finalize 같은 반복 state transition도 `sessionStoreMutators.ts`에 둔다.
- 흔한 회귀:
  - persisted version 불일치
  - beforeunload flush 누락

## Claude Runtime

- 파일:
  - `src/hooks/useClaudeStream.ts`
  - `src/hooks/claudeStream/eventHandler.ts`
  - `src/hooks/claudeStream/sessionHandlers.ts`
  - `electron/ipc/claude.ts`
  - `electron/ipc/claude/*`
  - `electron/services/claude/*`
- 책임:
  - Claude CLI 실행
  - stream-json 이벤트 처리
  - tool call, permission, token usage, abort 흐름
  - `electron/ipc/claude.ts`는 IPC 채널 등록과 메인 wiring만 유지하고, 첨부 직렬화/모델 캐시/프로세스 registry/서브에이전트 이벤트 라우팅 helper는 `electron/ipc/claude/*`에 둔다.
- 흔한 회귀:
  - 중복 프로세스 정리 누락
  - permission continuation 처리 누락
  - partial text chunk 손실

## Chat Surface

- 파일:
  - `src/components/ChatView.tsx`
  - `src/components/chat/ChatViewMainContent.tsx`
  - `src/hooks/useChatViewController.ts`
  - `src/hooks/chatView/*`
  - `src/hooks/useChatViewLayout.ts`
  - `src/hooks/useChatViewJumpState.ts`
  - `src/components/ChatMessagePane.tsx`
  - `src/components/InputArea.tsx`
  - `src/components/input/useInputAreaController.ts`
  - `src/components/MessageBubble.tsx`
  - `src/components/message/*`
  - `src/components/chat/*`
  - `src/components/toolcalls/*`
- 책임:
  - 메인 채팅 UX
  - 파일/Git/세션 사이드 패널
  - export, preview, selection actions
  - tool result preview와 HTML iframe/fullscreen 수명주기
  - `InputArea.tsx`는 입력 영역 레이아웃 조립만 유지하고, draft/멘션/권한 프롬프트/키보드 wiring은 `src/components/input/useInputAreaController.ts`가 담당한다.
  - `useInputKeyboard.ts`는 React hook/wiring만 유지하고, 질문/권한/@/슬래시/히스토리/전송 키 분기는 `src/hooks/inputKeyboardHandler.ts`로 분리한다.
  - `MessageBubble.tsx`는 메시지 종류 분기와 공통 copy 상태만 유지하고, 사용자/어시스턴트 bubble 렌더와 HTML preview 로더는 `src/components/message/*`로 분리한다.
  - `ChatView.tsx`는 헤더/사이드패널 wiring과 상위 액션 연결만 유지한다.
  - `useChatViewController.ts`는 우측 패널 상태, export/copy 상태, Git draft/selection draft 생성, drilldown 전환 상태를 담당한다.
  - `src/hooks/chatView/useChatViewActions.ts`는 session export/copy, selection/git draft 생성, drilldown 상태를 담당한다.
  - `ChatViewMainContent.tsx`는 drilldown과 기본 메시지+입력 흐름 분기만 담당한다.
  - `AgentStatusBar.tsx`는 subagent summary/list 선택 상태만 유지하고, 상세 modal/transcript load/copy feedback/status helper는 `AgentDetailModal.tsx`, `AgentStatusCopyButton.tsx`, `agentStatusShared.ts`로 분리한다.
- 흔한 회귀:
  - 레이아웃 상태 충돌
  - preview pane가 잘못 열리거나 닫히지 않음

## Team And Subagents

- 파일:
  - `src/hooks/useAgentTeam.ts`
  - `src/hooks/team/*`
  - `src/hooks/useSubagentStreams.ts`
  - `src/components/team/*`
  - `src/components/team/useTeamViewController.ts`
  - `src/components/team/useTeamDetailPanel.ts`
  - `src/components/team/useTeamTaskComposer.ts`
  - `src/components/team/TeamViewHeader.tsx`
  - `src/components/team/TeamViewWorkspace.tsx`
  - `src/components/team/TeamViewComposer.tsx`
  - `src/components/team/TeamAgentSeat.tsx`
  - `src/components/team/TeamSelectedAgentPanel.tsx`
  - `src/components/team/TeamSelectedAgentMessageCard.tsx`
  - `src/components/team/TeamSelectedAgentMessagePopup.tsx`
  - `src/components/team/TeamTaskPopover.tsx`
  - `src/components/team/teamSelectedAgentShared.tsx`
  - `src/components/team/teamOverlayShared.tsx`
  - `src/components/team/TeamSetupSelectionPane.tsx`
  - `src/components/team/TeamSetupCustomAgentForm.tsx`
  - `src/components/team/TeamSetupPreviewPane.tsx`
  - `src/components/team/teamSetupShared.ts`
  - `src/components/SubagentDrilldownView.tsx`
  - `src/components/subagentDrilldown/*`
  - `electron/services/subagentWatchService.ts`
- 책임:
  - 팀 실행
  - 서브에이전트 스트리밍
  - drilldown UI
  - `TeamView.tsx`는 팀 상태 오케스트레이션과 상위 액션 연결만 유지한다.
  - `useTeamViewController.ts`는 Team 화면의 선택/focus/popover 상태와 상위 액션 연결을 담당한다.
  - `useTeamDetailPanel.ts`는 detail panel width, resize listener, body cursor cleanup을 담당한다.
  - `useTeamTaskComposer.ts`는 task 입력/첨부, textarea height, summary injection, reset/start 흐름을 담당한다.
  - `TeamViewHeader.tsx`, `TeamViewWorkspace.tsx`, `TeamViewComposer.tsx`는 화면 섹션을 나눠 렌더링한다.
  - `TeamAgentSeat.tsx`, `TeamSelectedAgentPanel.tsx`, `TeamTaskPopover.tsx`는 seat/detail/task popup 조각을 나눠 갖고, `TeamViewParts.tsx`는 공용 selector/util과 re-export만 유지한다.
  - `TeamSelectedAgentPanel.tsx`는 선택된 agent header, message highlight 이동, empty/error 상태만 유지하고, message card/popup 렌더링은 `TeamSelectedAgentMessageCard.tsx`, `TeamSelectedAgentMessagePopup.tsx`, `teamSelectedAgentShared.tsx`로 분리한다.
  - 팀 overlay popup의 escape/copy feedback cleanup은 `teamOverlayShared.tsx`에서 공통으로 관리한다.
  - `SubagentDrilldownView.tsx`는 drilldown layout과 main chat로의 입력 handoff만 유지하고, transcript load/state와 header 렌더는 `src/components/subagentDrilldown/*`로 분리한다.
  - `TeamSetupModal.tsx`는 선택 상태와 저장만 유지한다.
  - `teamSetupShared.ts`는 setup 공용 타입/로컬 저장/프리셋 변환을 담당하고, `TeamSetupSelectionPane.tsx`, `TeamSetupCustomAgentForm.tsx`, `TeamSetupPreviewPane.tsx`는 각 화면 조각을 담당한다.
  - `TeamSetupModalParts.tsx`는 setup 서브모듈 re-export 레이어만 유지한다.
  - `useAgentTeam.ts`는 스트림/runtime 오케스트레이션만 유지하고, 프롬프트 문자열 조립과 queue/context runtime helper는 `src/hooks/team/*`에 둔다.
- 흔한 회귀:
  - watch 해제 누락
  - 실시간 텍스트 누락 또는 완료 상태 미동기화

## Git Integration

- 파일:
  - `src/hooks/git/*`
  - `src/hooks/git/useGitPanelSelection.ts`
  - `src/components/chat/git/*`
  - `electron/ipc/git.ts`
  - `electron/services/gitService.ts`
  - `electron/services/git/*`
- 책임:
  - 상태/diff/log/브랜치 처리
  - staging/restore/commit/push/pull
  - 외부 HEAD 변경 감지
  - `useGitPanelData.ts`는 repo status/log/branch 로드와 polling/watch cleanup만 유지하고, 선택된 entry/commit과 diff preview 수명주기는 `useGitPanelSelection.ts`로 분리한다.
- 흔한 회귀:
  - cwd 기준 오류
  - 브랜치 전환 후 패널 stale state

## Scheduled Tasks

- 파일:
  - `src/store/scheduledTasks.ts`
  - `src/components/scheduledTasks/*`
  - `src/components/scheduledTaskForm/*`
  - `electron/services/scheduledTaskScheduler.ts`
  - `electron/ipc/storage.ts`
- 책임:
  - 예약 작업 생성과 실행
  - 다음 실행 시각 계산
  - catch-up 및 중복 실행 방지
- 흔한 회귀:
  - sleep/wake 이후 중복 fire
  - quiet hours/skip day 계산 오류

## Settings, MCP, Skills

- 파일:
  - `src/components/settings/*`
  - `src/components/settings/useMcpTabState.ts`
  - `src/components/settings/skill/*`
  - `electron/ipc/settings.ts`
  - `electron/services/settingsDataService.ts`
  - `electron/services/settingsData/*`
- 책임:
  - 설정 파일/프로젝트 설정/Claude 디렉터리 읽기 쓰기
  - MCP/Skill 목록과 편집
  - MCP 서버별 헬스 체크, 인증 필요 상태 감지, 설정 탭과 채팅 입력창 사이의 런타임 경고 상태 연결
  - 큰 settings 탭은 파일 I/O 상태와 로컬 편집 상태를 해당 하위 폴더 helper로 분리한다.
  - `McpTab.tsx`는 scope panel, add form, server list 렌더링만 유지하고, project path 탐색과 read/write/delete/reset 흐름은 `useMcpTabState.ts`에서 관리한다.
  - `SkillTab.tsx`는 intro/add/list 조합만 유지하고, skill 카드와 file editor/add-file UI는 `src/components/settings/skill/*` 하위 컴포넌트로 분리한다.
  - `AgentTab.tsx`는 intro/add/list 조합만 유지하고, agent 파일 로드/생성/삭제/편집 상태와 file card/editor UI는 `src/components/settings/agent/*`로 분리한다.
- 흔한 회귀:
  - scope 혼동으로 잘못된 파일 위치에 저장
  - 헬스 체크 결과와 입력창 인증 경고 상태 불일치
  - renderer와 persisted 설정 불일치
