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

## Adjacent Surfaces
- 같은 동작을 공유하는 다른 화면, 패널, modal, hook, store action
- 이번 작업에서 같이 맞출 곳과 제외할 곳

## Invariants
- 절대 깨지면 안 되는 동작

## Validation
- 실행할 명령
- 필요한 수동 확인

## Execution Mode
- 기본값은 `autonomous until blocked`
- 어떤 경우에만 질문할지

## Done When
- 완료 조건 2-4개
- 같은 동작을 공유하는 인접 surface와 표시/동작이 어긋나지 않는다.
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

## Adjacent Surfaces
- Git 상태를 보여주는 다른 패널과 branch 표시
- 이번 작업에서는 Git 패널과 branch watch 흐름을 함께 확인

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
- 같은 Git 상태를 보여주는 다른 surface와 표시가 어긋나지 않는다.
```

## Refactoring Tasks

리팩토링 요청이면 `Done When`에 아래 기준을 우선 포함한다.

- 사용자에게 보이는 외부 동작이 동일하다.
- 건드린 코드가 이전보다 더 명확하고 단순하거나 중복이 줄었다.
- 기능 추가나 버그 수정이 리팩토링 안에 섞이지 않았다.
- 해당 자동 검증이 모두 green이고, 필요한 수동 smoke가 끝났다.
- 같은 동작을 공유하는 인접 surface와 불일치가 생기지 않았다.

## Default Execution Mode

작업 템플릿에 `Execution Mode`를 따로 쓰지 않았다면 아래를 기본값으로 본다.

- `autonomous until blocked`
- 에이전트는 합리적 가정으로 구현과 검증까지 이어서 진행한다.
- 파괴적 변경, 사용자 변경과의 직접 충돌, 큰 제품 결정, 필수 환경 정보 부족일 때만 질문한다.
