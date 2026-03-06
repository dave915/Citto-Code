# 01. Critical/High

## [HIGH] activeProcesses 맵 키 누수 가능
- 상태: Open
- 영역: Electron Main Process
- 위치: `electron/main.ts` (`activeProcesses` 처리 구간)
- 증상:
  - 전송 시 `pending-*` 키로 프로세스를 저장한 뒤, 세션 ID를 받으면 세션 키로 다시 저장한다.
  - 기존 `pending-*` 키가 제거되지 않아 맵 엔트리가 누적될 수 있다.
- 영향:
  - 장시간 사용 시 메모리 사용량 증가 가능
  - 프로세스 정리 로직 복잡도 증가
- 재현 조건:
  1. 앱 실행 후 세션 생성/전송을 반복
  2. 세션 시작 이벤트가 정상 수신되는 요청을 다수 수행
  3. `activeProcesses` 디버깅 시 `pending-*` 잔존 가능
- 임시 우회:
  - 앱 재시작
- 권장 수정:
  - `pendingKey -> sessionId` 전환 시 즉시 `pendingKey` 삭제
  - close/error 핸들러에서 orphan key 정리

## [HIGH] 보안 강도 저하 가능성 (`sandbox: false`)
- 상태: Open
- 영역: Electron 보안 설정
- 위치: `electron/main.ts` BrowserWindow 생성부
- 증상:
  - `contextIsolation: true`는 설정되어 있으나 `sandbox: false`
- 영향:
  - 취약점 발생 시 렌더러 격리 수준이 낮아질 수 있음
- 재현 조건:
  - 악성 입력/취약 렌더링 경로 존재 시 공격면 확대 가능
- 임시 우회:
  - 외부 콘텐츠 렌더링 최소화 유지
- 권장 수정:
  - `sandbox: true` 전환 검토
  - preload API 입력 검증 강화
