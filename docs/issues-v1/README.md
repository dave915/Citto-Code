# Claude UI 이슈 후보 정리 (v1)

이 디렉토리는 현재 코드 기준으로 장애/회귀/운영 리스크가 될 수 있는 항목을 모아둔 문서입니다.

## 문서 구성
- [01-critical-high.md](./01-critical-high.md): 우선 해결이 필요한 이슈
- [02-medium.md](./02-medium.md): 중간 우선순위 이슈
- [03-low-techdebt.md](./03-low-techdebt.md): 기술부채/개선 항목
- [issue-template.md](./issue-template.md): 새 이슈 기록 템플릿

## 운영 규칙
- 각 이슈는 재현 조건, 영향도, 임시 우회, 권장 수정안을 포함한다.
- 파일/라인 참조를 포함한다.
- 해결 시 상태를 `Open -> Mitigated -> Closed`로 변경한다.
