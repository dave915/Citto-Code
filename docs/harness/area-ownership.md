# Area Ownership

이 문서는 기능 영역별로 먼저 읽어야 할 파일과 자주 발생하는 회귀를 정리한다.

## App Shell

- 파일:
  - `src/main.tsx`
  - `src/App.tsx`
  - `src/components/app/AppMainContent.tsx`
  - `src/hooks/useAppPanels.ts`
  - `src/components/Sidebar.tsx`
- 책임:
  - 앱 부트스트랩
  - 전역 패널 열림 상태
  - 세션/설정/예약 작업 상위 조합
  - `App.tsx`는 store/hook 조합과 상위 액션 연결을 유지하고, 메인 화면 분기는 `AppMainContent.tsx`, 단일 패널 상태는 `useAppPanels.ts`에 둔다.
- 흔한 회귀:
  - hydration 후 active session 누락
  - 사이드바/메인 패널 상태 꼬임

## Session State And Persistence

- 파일:
  - `src/store/sessions.ts`
  - `src/store/sessionStoreState.ts`
  - `src/store/scheduledTasks.ts`
  - `electron/persistence.ts`
- 책임:
  - 세션/예약 작업 저장 구조
  - migrate/rehydrate
  - sqlite snapshot 동기화
- 흔한 회귀:
  - persisted version 불일치
  - beforeunload flush 누락

## Claude Runtime

- 파일:
  - `src/hooks/useClaudeStream.ts`
  - `src/hooks/claudeStream/eventHandler.ts`
  - `src/hooks/claudeStream/sessionHandlers.ts`
  - `electron/ipc/claude.ts`
  - `electron/services/claude/*`
- 책임:
  - Claude CLI 실행
  - stream-json 이벤트 처리
  - tool call, permission, token usage, abort 흐름
- 흔한 회귀:
  - 중복 프로세스 정리 누락
  - permission continuation 처리 누락
  - partial text chunk 손실

## Chat Surface

- 파일:
  - `src/components/ChatView.tsx`
  - `src/hooks/useChatViewLayout.ts`
  - `src/hooks/useChatViewJumpState.ts`
  - `src/components/ChatMessagePane.tsx`
  - `src/components/InputArea.tsx`
  - `src/components/chat/*`
- 책임:
  - 메인 채팅 UX
  - 파일/Git/세션 사이드 패널
  - export, preview, selection actions
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
  - `src/components/team/TeamViewHeader.tsx`
  - `src/components/team/TeamViewWorkspace.tsx`
  - `src/components/team/TeamViewComposer.tsx`
  - `src/components/team/TeamAgentSeat.tsx`
  - `src/components/team/TeamSelectedAgentPanel.tsx`
  - `src/components/team/TeamTaskPopover.tsx`
  - `src/components/SubagentDrilldownView.tsx`
  - `electron/services/subagentWatchService.ts`
- 책임:
  - 팀 실행
  - 서브에이전트 스트리밍
  - drilldown UI
  - `TeamView.tsx`는 팀 상태 오케스트레이션과 상위 액션 연결만 유지한다.
  - `useTeamViewController.ts`는 Team 화면의 로컬 UI 상태, resize/escape cleanup, 입력/첨부 흐름을 담당한다.
  - `TeamViewHeader.tsx`, `TeamViewWorkspace.tsx`, `TeamViewComposer.tsx`는 화면 섹션을 나눠 렌더링한다.
  - `TeamAgentSeat.tsx`, `TeamSelectedAgentPanel.tsx`, `TeamTaskPopover.tsx`는 seat/detail/task popup 조각을 나눠 갖고, `TeamViewParts.tsx`는 공용 selector/util과 re-export만 유지한다.
  - `TeamSetupModal.tsx`는 선택 상태와 저장만 유지하고, 프리셋 카드/커스텀 폼/우측 프리뷰는 `TeamSetupModalParts.tsx`에 둔다.
  - `useAgentTeam.ts`는 스트림/runtime 오케스트레이션을 유지하고, 프롬프트 문자열 조립은 `src/hooks/team/*`에 둔다.
- 흔한 회귀:
  - watch 해제 누락
  - 실시간 텍스트 누락 또는 완료 상태 미동기화

## Git Integration

- 파일:
  - `src/hooks/git/*`
  - `src/components/chat/git/*`
  - `electron/ipc/git.ts`
  - `electron/services/gitService.ts`
  - `electron/services/git/*`
- 책임:
  - 상태/diff/log/브랜치 처리
  - staging/restore/commit/push/pull
  - 외부 HEAD 변경 감지
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
  - `src/components/settings/skill/*`
  - `electron/ipc/settings.ts`
  - `electron/services/settingsDataService.ts`
  - `electron/services/settingsData/*`
- 책임:
  - 설정 파일/프로젝트 설정/Claude 디렉터리 읽기 쓰기
  - MCP/Skill 목록과 편집
  - 큰 settings 탭은 파일 I/O 상태와 로컬 편집 상태를 해당 하위 폴더 helper로 분리한다.
- 흔한 회귀:
  - scope 혼동으로 잘못된 파일 위치에 저장
  - renderer와 persisted 설정 불일치
