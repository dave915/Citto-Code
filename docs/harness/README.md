# Harness Docs

이 디렉터리는 이 저장소의 새 하네스 문서 집합이다.

## Scope

- 에이전트가 이 프로젝트를 읽고, 바꾸고, 검증하는 최소 규칙을 담는다.
- 기존 문서는 참고 자료가 아니라 아카이브로 취급한다.
- 구조 변경이 생기면 이 디렉터리가 먼저 갱신되어야 한다.

## Start Here

1. [Architecture Map](./architecture-map.md)
2. [Change Workflow](./change-workflow.md)
3. [Quality Gates](./quality-gates.md)
4. [Area Ownership](./area-ownership.md)
5. [Task Template](./task-template.md)

## Repo Snapshot

- 앱 타입: Electron + React + TypeScript 데스크톱 앱
- 렌더러 상태: Zustand 기반 세션/워크플로우 스토어
- 메인 프로세스 역할: Claude CLI 실행, Git/파일/설정 IPC, 스케줄러, 트레이/윈도우 제어
- 경계: `main -> preload -> renderer`

## Default Commands

```bash
npm install
npm run dev
npm run harness:check
npm run typecheck
npm run harness:check:strict
npm run build
```

## When To Update These Docs

- 파일 이동이나 새 진입점 추가
- IPC 채널 추가 또는 기존 payload 변경
- 저장소의 canonical workflow 변경
- 품질 게이트 추가 또는 제거
