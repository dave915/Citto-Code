# Quality Gates

이 저장소는 아직 테스트 스위트보다 문서화된 경계와 타입 안정성에 더 크게 의존한다.

## Required Checks

### Always

- `npm run harness:check`

### For TypeScript Changes

- `npm run typecheck`
- 필요하면 `npm run harness:check:strict`

### For Main/IPC/Build Boundary Changes

- `npm run build`

## Harness Review Checklist

- 렌더러가 preload 없이 직접 Electron/Node 기능을 사용하지 않는가
- IPC payload 변경이 preload 타입과 호출부에 모두 반영되었는가
- watcher, timer, event listener에 cleanup 경로가 있는가
- persisted state shape 변경이 기존 사용자 데이터를 깨지 않는가
- macOS/Windows 분기 로직이 새 변경에서도 유지되는가
- 구조 변화가 `docs/harness/`에 반영되었는가

## Current Test Strategy

- 정적 검증: TypeScript typecheck
- 구조 검증: harness docs/link/path validation
- 통합 검증: Electron build
- 수동 검증: 실제 채팅, Git 패널, 예약 작업, 설정 화면에서 smoke test

## Manual Smoke Matrix

### Conversation

- 새 세션 생성
- 메시지 전송
- 권한 요청 승인/거절
- tool call 및 HTML preview 노출

### Git

- 상태 로딩
- diff 미리보기
- 브랜치 전환 또는 외부 브랜치 감지

### Scheduled Tasks

- 태스크 생성/수정
- run now 실행
- 중복 실행 방지 확인

### Settings

- 설정 저장
- MCP/Skill 목록 로딩
- Claude 설치 확인 또는 모델 목록 조회
