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
  - `src/components/WorkflowsView.tsx`
- 책임:
  - 앱 부트스트랩
  - 전역 패널 열림 상태
  - 세션/설정/워크플로우 상위 조합
  - 새 세션 draft 상태와 첫 입력 시점의 실제 세션 생성
  - `src/App.tsx`는 루트 레이아웃을 렌더링하고, 비서 활성 상태에서는 전체 비서 화면으로 루트 분기한다.
  - `src/hooks/useAppController.ts`는 store/hook 조합, 세션 선택/점프, 팀 연동, 데스크톱 effect wiring을 담당한다.
  - 일반 메인 화면 분기는 `src/components/app/AppMainContent.tsx`, 단일 패널 상태는 `src/hooks/useAppPanels.ts`에 둔다.
- 흔한 회귀:
  - hydration 후 active session 누락
  - 사이드바/메인 패널 상태 꼬임
  - draft 세션이 첫 입력 전에 사이드바나 비서 컨텍스트 최근 목록에 섞여 들어감

## Main Process Shell

- 파일:
  - `electron/main.ts`
  - `electron/main/windowController.ts`
  - `electron/main/devLogger.ts`
  - `electron/services/trayImageService.ts`
  - `electron/workflow-executor.ts`
- 책임:
  - 앱 부트스트랩
  - 메인 윈도우 생성과 비서 패널 토글/포커스 복원
  - 트레이/글로벌 단축키/외부 링크 처리
  - dev log 전달과 메인 프로세스 수명주기 정리
  - workflow executor 타이머/cleanup
  - `electron/main.ts`는 서비스 초기화와 IPC wiring만 유지하고, 윈도우/비서 토글 상태는 `electron/main/windowController.ts`, 개발용 로그 전달은 `electron/main/devLogger.ts`에 둔다.
- 흔한 회귀:
  - 비서 단축키 재등록 누락
  - 창 재생성 후 preload 경계나 외부 링크 처리 누락
  - will-quit cleanup 누락

## Session State And Persistence

- 파일:
  - `src/store/sessions.ts`
  - `src/store/sessionStoreState.ts`
  - `src/store/sessionStoreMutators.ts`
  - `src/store/workflowStore.ts`
  - `electron/persistence.ts`
- 책임:
  - 세션/워크플로우 저장 구조
  - migrate/rehydrate
  - sqlite snapshot 동기화
  - `src/store/sessionStoreState.ts`는 store action wiring과 persisted 필드 기본값을 유지하고, 반복적인 session/message/tool mutation helper는 `src/store/sessionStoreMutators.ts`에 둔다.
  - user/assistant message 생성, btw anchor 삽입, tool call append, stream finalize 같은 반복 state transition도 `src/store/sessionStoreMutators.ts`에 둔다.
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
  - `electron/services/claude-models.ts`
- 책임:
  - Claude CLI 실행
  - stream-json 이벤트 처리
  - tool call, permission, token usage, abort 흐름
  - 로컬 모델 선택 시 env 보정
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
  - `src/components/chat/ChatMessagePane.tsx`
  - `src/components/InputArea.tsx`
  - `src/components/input/useInputAreaController.ts`
  - `src/components/MessageBubble.tsx`
  - `src/components/message/*`
  - `src/components/chat/*`
  - `src/components/toolcalls/*`
  - `electron/services/previewWatchService.ts`
- 책임:
  - 메인 채팅 UX
  - 파일/Git/세션/미리보기 우측 패널 스택과 섹션 리사이즈
  - export, preview, selection actions
  - tool result preview, 우측 HTML preview 패널, HTML iframe/fullscreen 수명주기
  - HTML preview auto-reload watcher와 preview element selection draft/스크린샷 첨부 주입
  - `src/components/InputArea.tsx`는 입력 영역 레이아웃 조립만 유지하고, draft/멘션/권한 프롬프트/키보드 wiring은 `src/components/input/useInputAreaController.ts`가 담당한다.
  - `src/hooks/useInputKeyboard.ts`는 React hook/wiring만 유지하고, 질문/권한/@/슬래시/히스토리/전송 키 분기는 `src/hooks/inputKeyboardHandler.ts`로 분리한다.
  - `src/components/MessageBubble.tsx`는 메시지 종류 분기와 공통 copy 상태만 유지하고, 사용자/어시스턴트 bubble 렌더와 HTML preview 로더는 `src/components/message/*`로 분리한다.
  - `src/components/ChatView.tsx`는 헤더/사이드패널 wiring과 상위 액션 연결만 유지한다.
  - `src/hooks/useChatViewController.ts`는 우측 패널 상태, export/copy 상태, Git draft/selection draft 생성, drilldown 전환 상태를 담당한다.
  - `src/hooks/chatView/useChatViewActions.ts`는 session export/copy, selection/git draft 생성, drilldown 상태를 담당한다.
  - `src/components/chat/ChatViewMainContent.tsx`는 drilldown과 기본 메시지+입력 흐름 분기만 담당한다.
  - `src/components/chat/AgentStatusBar.tsx`는 subagent summary/list 선택 상태만 유지하고, 상세 modal/transcript load/copy feedback/status helper는 `src/components/chat/AgentDetailModal.tsx`, `src/components/chat/AgentStatusCopyButton.tsx`, `src/components/chat/agentStatusShared.ts`로 분리한다.
- 흔한 회귀:
  - 레이아웃 상태 충돌
  - preview pane가 잘못 열리거나 닫히지 않음
  - preview watcher cleanup 누락
  - localhost preview와 static HTML preview가 잘못 전환됨

## File And OS Integration

- 파일:
  - `src/hooks/useFileExplorer.ts`
  - `src/hooks/useChatOpenWith.ts`
  - `src/hooks/useInputAttachments.ts`
  - `src/hooks/useInputMentions.ts`
  - `src/components/chat/FilePanel.tsx`
  - `src/components/chat/PreviewPane.tsx`
  - `src/components/toolcalls/useHtmlPreviewController.ts`
  - `electron/preload/claudeApi.ts`
  - `electron/ipc/files.ts`
  - `electron/services/previewProxyService.ts`
  - `electron/services/fileService.ts`
- 책임:
  - 파일 트리 조회와 preview 로딩
  - 첨부 파일 선택과 mention 파일 검색
  - HTML preview 프록시 세션 관리, preview element PNG capture, 텍스트 저장, zip export
  - OS 기본 앱/open-with 연결과 macOS 앱 아이콘 로딩
  - `electron/ipc/files.ts`는 파일/폴더 선택 dialog, preview proxy start/update/stop, 저장/export, open-in-browser/open-with 핸들러를 담당한다.
  - `electron/services/previewProxyService.ts`는 localhost 미리보기만 허용하고, 고정 포트 session-aware 프록시 라우팅, 응답 헤더 정리와 bridge script 주입, renderer 종료 시 proxy cleanup을 담당한다.
  - `electron/services/fileService.ts`는 첨부 파일 읽기와 open-with 앱 탐색 같은 OS 의존 로직을 담당한다.
  - 렌더러는 `window.claude`만 통해 접근하고, 파일 탐색/미리보기 상태는 hook 쪽에서 수명주기를 관리한다.
- 흔한 회귀:
  - 숨김 파일/경로 정규화 차이로 파일 탐색 결과가 어긋남
  - preview proxy allowlist가 느슨해지거나 localhost preview가 막힘
  - preview proxy session cleanup 누락으로 포트가 남음
  - 저장/export 경로 처리 오류로 잘못된 위치에 파일이 생성됨
  - macOS가 아닌 환경에서 open-with 분기 누락

## Citto Secretary

- 파일:
  - `src/components/secretary/SecretaryPanel.tsx`
  - `src/components/secretary/SecretaryCharacter.tsx`
  - `src/components/secretary/SecretaryMessage.tsx`
  - `src/components/secretary/SecretaryMarkdown.tsx`
  - `src/components/secretary/SecretaryModelPicker.tsx`
  - `src/components/secretary/SecretaryThinkingIndicator.tsx`
  - `src/components/secretary/ConversationList.tsx`
  - `src/components/secretary/useSecretaryAppBridge.ts`
  - `src/secretary-panel/SecretaryFloating.tsx`
  - `src/secretary-panel/main.tsx`
  - `src/secretary-panel/styles.css`
  - `secretary-panel.html`
  - `src/App.tsx`
  - `src/components/Sidebar.tsx`
  - `src/hooks/useAppPanels.ts`
  - `src/hooks/useAppDesktopEffects.ts`
  - `src/components/settings/general/SecretarySection.tsx`
  - `src/store/sessionStoreState.ts`
  - `electron/secretary/*`
  - `electron/preload/secretaryApi.ts`
  - `electron/main/windowController.ts`
  - `electron/persistence.ts`
- 책임:
  - 글로벌 단축키 등록과 앱 밖 플로팅 비서 창 토글
  - 캐릭터 드래그 기반 플로팅 비서 창 위치 이동
  - 사이드바에서 진입하는 앱 내 비서 대화 화면
  - `window.secretary` preload 브리지와 `secretary:*` IPC 계약
  - LLM JSON intent 처리, 키워드 매칭 fallback 금지
  - 액션 레지스트리/핸들러와 allowlist 기반 액션 검증
  - 현재 Citto 컨텍스트 동기화와 확인 후 화면 이동
  - `AppPersistence` 기반 비서 profile/conversations/history/patterns 저장
  - 비서 채팅 CRUD와 채팅별 history 격리
  - 이전 주제 회상 요청 시 비서 대화 history와 일반 프로젝트 세션 messages 통합 검색
  - 프로젝트 진행 요청은 비서가 직접 장시간 수행하기보다 기존/새 프로젝트 세션으로 이어가도록 안내
  - 반복 작업/관례는 1차 `draftWorkflow`/`draftSkill`로 새 프로젝트 세션에 초안을 넘기고, 2차 `createWorkflow`/`createSkill`로 사용자 확인 후 실제 저장한다.
  - 워크플로우 생성은 렌더러 `useWorkflowStore` 경계를 통해 처리하고, 스킬 생성은 렌더러에서 `window.claude.writeClaudeFile`로 `~/.claude/skills/<name>/SKILL.md`를 작성한다.
  - `src/hooks/useAppDesktopEffects.ts`는 비서 단축키 enabled 상태만 메인 프로세스로 동기화한다.
  - `src/components/secretary/useSecretaryAppBridge.ts`는 active context sync, `citto:navigate`, 렌더러 처리 액션 라우팅을 담당한다.
  - `src/App.tsx`는 비서 활성 상태에서 기존 사이드바와 메인 화면을 모두 덮는 전체 비서 화면을 렌더링한다.
  - `src/components/secretary/SecretaryPanel.tsx`는 캐릭터, 비서 채팅 목록, 메시지, 일반 세션 입력창 기반 composer, 액션 확인 버튼, ESC 닫기를 렌더링한다.
  - `src/secretary-panel/SecretaryFloating.tsx`는 별도 Electron 창에서 축소 캐릭터/확장 대화창, 앱 열기, 플로팅 전용 모델 override를 렌더링한다.
- 흔한 회귀:
  - 단축키 토글 또는 ESC 닫기 누락
  - `getActiveContext`가 현재 route/session을 반영하지 않음
  - renderer에서 Electron/Node API 직접 호출
  - IPC payload 변경 후 preload 타입과 호출부 불일치
  - 키워드 매칭으로 액션을 실행하는 fallback 추가
  - 화면 이동/실행 액션이 사용자 확인 없이 실행됨
  - allowlist 미검증 액션 실행
  - 비서 채팅 간 history 누수
  - `isTaskRunning` 컨텍스트 누락으로 중복 실행 제안
  - `secretary` route가 사이드바 active state 또는 `handleSecretaryNavigate`와 불일치함
  - 새 history/pattern 저장이 기존 sqlite 스냅샷을 깨뜨림
  - 플로팅 창 resize/drag/escape 흐름이 창 위치·크기와 UI 상태를 다르게 유지함
  - `window.quickPanel`, `quick-panel:*` 채널 재도입

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
  - `src/components/team/TeamView.tsx`는 팀 상태 오케스트레이션과 상위 액션 연결만 유지한다.
  - `src/components/team/useTeamViewController.ts`는 Team 화면의 선택/focus/popover 상태와 상위 액션 연결을 담당한다.
  - `src/components/team/useTeamDetailPanel.ts`는 detail panel width, resize listener, body cursor cleanup을 담당한다.
  - `src/components/team/useTeamTaskComposer.ts`는 task 입력/첨부, textarea height, summary injection, reset/start 흐름을 담당한다.
  - `src/components/team/TeamViewHeader.tsx`, `src/components/team/TeamViewWorkspace.tsx`, `src/components/team/TeamViewComposer.tsx`는 화면 섹션을 나눠 렌더링한다.
  - `src/components/team/TeamAgentSeat.tsx`, `src/components/team/TeamSelectedAgentPanel.tsx`, `src/components/team/TeamTaskPopover.tsx`는 seat/detail/task popup 조각을 나눠 갖고, `src/components/team/TeamViewParts.tsx`는 공용 selector/util과 re-export만 유지한다.
  - `src/components/team/TeamSelectedAgentPanel.tsx`는 선택된 agent header, message highlight 이동, empty/error 상태만 유지하고, message card/popup 렌더링은 `src/components/team/TeamSelectedAgentMessageCard.tsx`, `src/components/team/TeamSelectedAgentMessagePopup.tsx`, `src/components/team/teamSelectedAgentShared.tsx`로 분리한다.
  - 팀 overlay popup의 escape/copy feedback cleanup은 `src/components/team/teamOverlayShared.tsx`에서 공통으로 관리한다.
  - `src/components/SubagentDrilldownView.tsx`는 drilldown layout과 main chat로의 입력 handoff만 유지하고, transcript load/state와 header 렌더는 `src/components/subagentDrilldown/*`로 분리한다.
  - `src/components/team/TeamSetupModal.tsx`는 선택 상태와 저장만 유지한다.
  - `src/components/team/teamSetupShared.ts`는 setup 공용 타입/로컬 저장/프리셋 변환을 담당하고, `src/components/team/TeamSetupSelectionPane.tsx`, `src/components/team/TeamSetupCustomAgentForm.tsx`, `src/components/team/TeamSetupPreviewPane.tsx`는 각 화면 조각을 담당한다.
  - `src/components/team/TeamSetupModalParts.tsx`는 setup 서브모듈 re-export 레이어만 유지한다.
  - `src/hooks/useAgentTeam.ts`는 스트림/runtime 오케스트레이션만 유지하고, 프롬프트 문자열 조립과 queue/context runtime helper는 `src/hooks/team/*`에 둔다.
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
  - `src/hooks/git/useGitPanelData.ts`는 repo status/log/branch 로드와 polling/watch cleanup만 유지하고, 선택된 entry/commit과 diff preview 수명주기는 `src/hooks/git/useGitPanelSelection.ts`로 분리한다.
- 흔한 회귀:
  - cwd 기준 오류
  - 브랜치 전환 후 패널 stale state

## Legacy Scheduled Tasks

- 파일:
  - `src/main.tsx`
  - `electron/persistence.ts`
  - `electron/ipc/storage.ts`
  - `electron/services/scheduledTaskScheduler.ts`
- 책임:
  - 기존 `scheduled_tasks` 레코드를 workflow로 1회 변환
  - `migrated_at` 기반 중복 변환 방지
  - legacy scheduler 구현 보존
- 흔한 회귀:
  - 이미 마이그레이션한 task 재변환
  - workflow 저장 전에 migrated flag를 먼저 찍어서 데이터 유실

## Workflow Builder

- 파일:
  - `src/components/WorkflowsView.tsx`
  - `src/components/workflow/*`
  - `src/store/workflowStore.ts`
  - `src/store/workflowTypes.ts`
  - `electron/workflow-executor.ts`
  - `electron/services/claude-spawn.ts`
  - `electron/ipc/storage.ts`
  - `electron/persistence.ts`
- 책임:
  - 워크플로우 정의/편집 UI
  - workflow/workflow execution persisted shape
  - 수동 실행, 예약 실행, 취소, step update 스트림
  - workflow builder 관련 preload/renderer event wiring
- 흔한 회귀:
  - 실행 중인 workflow 중복 시작
  - step output이 execution history에 누락됨
  - workflow 삭제 후 stale execution 참조

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
  - `src/components/settings/McpTab.tsx`는 scope panel, add form, server list 렌더링만 유지하고, project path 탐색과 read/write/delete/reset 흐름은 `src/components/settings/useMcpTabState.ts`에서 관리한다.
  - `src/components/settings/SkillTab.tsx`는 intro/add/list 조합만 유지하고, skill 카드와 file editor/add-file UI는 `src/components/settings/skill/*` 하위 컴포넌트로 분리한다.
  - `src/components/settings/AgentTab.tsx`는 intro/add/list 조합만 유지하고, agent 파일 로드/생성/삭제/편집 상태와 file card/editor UI는 `src/components/settings/agent/*`로 분리한다.
- 흔한 회귀:
  - scope 혼동으로 잘못된 파일 위치에 저장
  - 헬스 체크 결과와 입력창 인증 경고 상태 불일치
  - renderer와 persisted 설정 불일치
