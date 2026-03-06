# 07. 상태 전이 명세

## 1) 전송 직후
- 오류 초기화
- `isStreaming = true`
- 사용자 메시지 즉시 append (optimistic UI)

## 2) 이벤트 기반 전이
- `stream-start`
  - assistant 빈 메시지 생성
  - `currentAssistantMsgId` 설정
  - 필요 시 tabId <-> sessionId 매핑 고정
- `text-chunk`
  - 현재 assistant 메시지에 텍스트 append
- `tool-start`
  - toolCalls에 running 항목 추가
- `tool-result`
  - 동일 `toolUseId` 항목 done/error로 전환
- `result`
  - `lastCost` 갱신
- `stream-end`
  - `isStreaming = false`
  - `currentAssistantMsgId = null`
- `error`
  - `error` 설정
  - `isStreaming = false`

## 3) 중단(abort)
- 세션의 실행 프로세스에 시그널 전달
- UI 스트리밍 상태를 종료 상태로 전환
