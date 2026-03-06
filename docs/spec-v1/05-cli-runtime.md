# 05. Claude CLI 실행 규격

## 1) 기본 실행 인자
- `--output-format stream-json`
- `--verbose`
- `-p <prompt>`

## 2) 조건부 인자
- 기존 세션 재개: `--resume <sessionId>`
- 모델 지정: `--model <modelId>`
- 권한 모드(default 제외): `--permission-mode <mode>`
- 플랜 모드 ON: `--allowedTools Read,Glob,Grep,WebFetch,WebSearch,Task`

## 3) 실행 환경
- cwd: 세션 cwd, 없으면 HOME
- stdout: 줄바꿈 단위 JSON 파싱
- stderr: `error`/`fatal` 포함 시 에러 이벤트 전달

## 4) 파싱 대상 이벤트 타입
- `system`: 세션 ID 확보, stream-start 발행
- `assistant`: text chunk, tool_use 반영
- `user`: tool_result 반영
- `result`: 비용/종료 메타 반영
