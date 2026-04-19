# Quality Gates

이 저장소는 아직 테스트 스위트보다 문서화된 경계와 타입 안정성에 더 크게 의존한다.

## Required Checks

### Always

- `npm run harness:check`
- `npm run harness:check:auto-preview`는 auto HTML preview 프롬프트가 단일 HTML 데모와 로컬 서버 데모를 올바르게 분기하는지 자동 확인한다.
- `npm run harness:check:preview-ui`는 HTML preview 높이 판정처럼 "수정했는데 UI에는 안 먹는" 회귀를 fixture 기반으로 자동 확인한다.
- `npm run harness:check:preview-proxy`는 고정 포트 preview proxy의 session path 라우팅, redirect 재작성, referer 기반 asset 라우팅, target update 회귀를 자동 확인한다.

### For TypeScript Changes

- `npm run typecheck`
- 필요하면 `npm run harness:check:strict`

### For Main/IPC/Build Boundary Changes

- `npm run build`

## Refactoring Gates

- 리팩토링은 외부 동작 동일, 내부 구조 개선을 만족해야 한다.
- 기능 추가나 버그 수정이 섞이면 리팩토링 완료로 보지 말고 별도 변경으로 분리한다.
- Boy Scout Rule을 적용해서 건드린 파일은 이전보다 읽기 쉽고 중복이 적어야 한다.
- 자동 검증은 변경 전후 모두 green이어야 한다. 이 저장소의 기본 green 기준은 `npm run harness:check`, TypeScript 변경 시 `npm run typecheck`, 경계 변경 시 `npm run build`다.
- 현재 저장소는 별도 lint 게이트보다 harness/type/build와 수동 smoke에 더 의존한다. lint 스크립트가 없는 영역에서는 그 기준을 그대로 DoD에 사용한다.
- 테스트가 이미 있으면 유지한 채 green이어야 한다. 테스트가 없는 영역인데 리스크가 높다면 리팩토링 전에 타깃 테스트 또는 더 좁은 검증 경로를 먼저 만든다.
- 수동 smoke에서 사용자 흐름, 반응성, cleanup, 성능 회귀가 없어야 한다.

## Harness Review Checklist

- 렌더러가 preload 없이 직접 Electron/Node 기능을 사용하지 않는가
- IPC payload 변경이 preload 타입과 호출부에 모두 반영되었는가
- watcher, timer, event listener에 cleanup 경로가 있는가
- persisted state shape 변경이 기존 사용자 데이터를 깨지 않는가
- macOS/Windows 분기 로직이 새 변경에서도 유지되는가
- 구조 변화가 `docs/harness/`에 반영되었는가
- renderer direct import guard와 harness manifest가 현재 구조를 반영하는가
- 같은 사용자 동작을 공유하는 인접 surface를 확인했는가, 제외했다면 이유가 남아 있는가

## Current Test Strategy

- 정적 검증: TypeScript typecheck
- 구조 검증: harness docs/link/path validation, manifest 기반 critical path/script 검증, renderer direct import guard
- 타깃 회귀 검증: auto preview prompt branching, HTML preview UI sizing fixture, preview proxy routing 회귀 자동 하네스
- 통합 검증: Electron build
- 수동 검증: 실제 채팅, Git 패널, 워크플로우 빌더, 설정 화면에서 smoke test, 그리고 같은 동작을 쓰는 인접 surface 일관성 확인

## Manual Smoke Matrix

### Conversation

- 새 세션 생성
- 메시지 전송
- 권한 요청 승인/거절
- tool call 및 HTML preview 노출

### File And Preview

- 파일 트리 로딩과 폴더 이동
- 텍스트/이미지 preview와 open-with 또는 기본 열기
- HTML preview 저장 또는 zip export

### Quick Panel

- 글로벌 단축키로 열기/닫기
- 최근 프로젝트 목록 또는 폴더 선택이 올바른 cwd로 반영되는지 확인
- submit 후 메인 윈도우가 열리고 세션 생성/전송으로 이어지는지 확인

### Git

- 상태 로딩
- diff 미리보기
- 브랜치 전환 또는 외부 브랜치 감지

### Team And Subagents

- 팀 실행 시작
- 실시간 텍스트 스트리밍과 완료 상태 반영
- detail modal 또는 drilldown transcript 로딩

### Workflow Builder

- 워크플로우 생성/복제/이름 편집
- 캔버스 선택/복사/붙여넣기/undo-redo
- 수동 실행, 취소, 완료 알림, 예약 트리거 보정 확인

### Settings

- 설정 저장
- MCP/Skill 목록 로딩
- Claude 설치 확인 또는 모델 목록 조회
