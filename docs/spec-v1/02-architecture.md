# 02. 아키텍처와 기술 스택

## 1) 권장 기술 스택
- Desktop: Electron
- Renderer: React + TypeScript
- State: Zustand 또는 동등 전역 스토어
- Styling: TailwindCSS 또는 동등 유틸리티 CSS
- Markdown: GFM 지원 렌더러
- Build: electron-vite 계열

## 2) 아키텍처 경계
- Main Process
  - Claude CLI 실행
  - 스트림 JSON 파싱
  - IPC 핸들러 제공
- Preload
  - 제한된 API만 `window.claude`로 노출
- Renderer
  - 세션 상태 관리
  - UI 렌더링
  - 사용자 이벤트 처리

## 3) 화면 정보 구조
- Sidebar
  - 세션 목록, 새 세션, 폴더 변경, 세션 닫기
- ChatView
  - 헤더(폴더/비용), 메시지 목록, 오류 배너
- InputArea
  - textarea, 첨부 파일 칩, 권한/플랜/모델 설정, 전송/중단
