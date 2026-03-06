# 09. 보안/성능/품질 요구사항

## 1) 보안 최소 요구사항
- `contextIsolation: true`
- `nodeIntegration: false`
- renderer에서 Node 직접 접근 금지
- preload 브릿지 외 IPC 사용 금지
- 파일 접근은 사용자 선택 기반

## 2) 성능 요구사항
- 앱 시작 후 입력 가능 상태 2초 이내(일반 Mac 기준)
- 텍스트 chunk append 시 프리즈 없어야 함
- 세션당 메시지 100개 수준에서 스크롤/입력 유지

## 3) 빌드/운영
- 단일 빌드 명령으로 main/preload/renderer 산출
- 프로세스 라이프사이클 종료 시 자식 프로세스 정리
- 세션 매핑/프로세스 맵 누수 방지

## 4) 품질 권장사항
- E2E 최소 시나리오 자동화
- IPC payload 스키마 검증
- 대용량 첨부 파일 제한 정책(크기/확장자)
