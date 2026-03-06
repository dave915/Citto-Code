# 02. Medium

## [MEDIUM] 비용 값 0일 때 표시 누락 가능
- 상태: Open
- 영역: Renderer 상태 반영
- 위치: `src/App.tsx` result 이벤트 처리
- 증상:
  - `if (event.totalCostUsd)`처럼 truthy 체크를 사용하면 `0`은 반영되지 않음
- 영향:
  - 비용 UI가 일부 케이스에서 갱신 누락
- 권장 수정:
  - `event.totalCostUsd !== undefined` 조건으로 변경

## [MEDIUM] 대용량/바이너리 첨부 처리 취약
- 상태: Open
- 영역: 파일 첨부
- 위치: `electron/main.ts` select-files 처리
- 증상:
  - 선택 파일을 UTF-8 문자열로 전부 메모리 로드
- 영향:
  - 메모리 스파이크, 렌더링 지연, 바이너리 파일 깨짐
- 권장 수정:
  - 파일 크기 상한 도입 (예: 1~2MB)
  - MIME/확장자 검증
  - 바이너리 감지 시 업로드 차단 또는 요약 방식 전환

## [MEDIUM] stderr 키워드 매칭 기반 오류 감지 오탐 가능
- 상태: Open
- 영역: 프로세스 오류 처리
- 위치: `electron/main.ts` stderr 핸들러
- 증상:
  - `error|fatal` 문자열 포함 여부만으로 오류 이벤트 발행
- 영향:
  - 정상 로그도 오류로 표시 가능
- 권장 수정:
  - CLI exit code + structured 이벤트 기반 판정 우선
  - stderr는 보조 신호로만 사용
