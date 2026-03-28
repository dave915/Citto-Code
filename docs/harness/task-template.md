# Task Template

새 작업을 시작할 때 아래 템플릿으로 정리하면 에이전트가 범위를 안정적으로 유지하기 쉽다.

```md
## Objective
- 사용자에게 보이는 목표 한 줄

## Change Type
- renderer-only | renderer+store | ipc | scheduler | git | settings

## Owning Area
- `docs/harness/area-ownership.md`의 어느 영역인지

## Files To Read First
- 시작 파일 2-5개

## Invariants
- 절대 깨지면 안 되는 동작

## Validation
- 실행할 명령
- 필요한 수동 확인

## Done When
- 완료 조건 2-4개
```

## Example

```md
## Objective
- 외부에서 브랜치를 바꿨을 때 Git 패널이 즉시 갱신되게 한다.

## Change Type
- git

## Owning Area
- Git Integration

## Files To Read First
- `src/hooks/git/useGitPanelData.ts`
- `src/components/chat/GitPanel.tsx`
- `electron/services/gitHeadWatchService.ts`

## Invariants
- 현재 세션의 cwd 기준으로만 감시한다.
- watch 해제 누락이 없어야 한다.

## Validation
- `npm run harness:check`
- `npm run typecheck`
- 실제로 터미널에서 브랜치를 바꿔 패널 갱신 확인

## Done When
- 브랜치 이름과 상태가 즉시 갱신된다.
- 기존 Git 패널 기능이 깨지지 않는다.
```
