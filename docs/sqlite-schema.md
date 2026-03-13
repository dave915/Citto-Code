# SQLite Schema

이 앱은 대화/스케줄 데이터를 `app.getPath('userData')/storage/app.sqlite` 에 저장합니다.

현재 스키마 버전: `1`

## 목적

- 세션/메시지/툴콜/첨부를 `localStorage` 대신 SQLite에 영구 저장
- 예약 작업과 실행 기록을 SQLite에 저장
- 기존 설치 사용자의 `localStorage` 데이터를 첫 실행 시 자동 migration

## 테이블

### `sessions`

세션 메타데이터를 저장합니다.

| column | type | notes |
| --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | UI 세션 ID |
| `claude_session_id` | `TEXT` | Claude CLI `--resume` 세션 ID |
| `name` | `TEXT NOT NULL` | 세션 이름 |
| `favorite` | `INTEGER NOT NULL` | `0/1` |
| `cwd` | `TEXT NOT NULL` | 작업 폴더 |
| `error` | `TEXT` | 마지막 오류 메시지 |
| `last_cost` | `REAL` | 마지막 비용 |
| `permission_mode` | `TEXT NOT NULL` | `default/acceptEdits/bypassPermissions` |
| `plan_mode` | `INTEGER NOT NULL` | `0/1` |
| `model` | `TEXT` | 선택 모델 |
| `sort_order` | `INTEGER NOT NULL` | 세션 목록 순서 |
| `created_at` | `INTEGER NOT NULL` | epoch ms |
| `updated_at` | `INTEGER NOT NULL` | epoch ms |

### `messages`

세션별 메시지 본문을 저장합니다.

| column | type | notes |
| --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | 메시지 ID |
| `session_id` | `TEXT NOT NULL` | `sessions.id` FK |
| `role` | `TEXT NOT NULL` | `user/assistant` |
| `text` | `TEXT NOT NULL` | 메시지 텍스트 |
| `thinking` | `TEXT NOT NULL` | thinking 텍스트 |
| `created_at` | `INTEGER NOT NULL` | epoch ms |
| `seq` | `INTEGER NOT NULL` | 세션 내 순서 |

### `tool_calls`

메시지에 포함된 tool call 블록을 저장합니다.

| column | type | notes |
| --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | tool call ID |
| `message_id` | `TEXT NOT NULL` | `messages.id` FK |
| `tool_use_id` | `TEXT NOT NULL` | Claude tool use ID |
| `tool_name` | `TEXT NOT NULL` | tool 이름 |
| `tool_input_json` | `TEXT` | JSON 직렬화 입력 |
| `file_snapshot_before` | `TEXT` | 편집 전 스냅샷 |
| `result_json` | `TEXT` | JSON 직렬화 결과 |
| `is_error` | `INTEGER NOT NULL` | `0/1` |
| `status` | `TEXT NOT NULL` | `running/done/error` |
| `seq` | `INTEGER NOT NULL` | 메시지 내 순서 |

### `attachments`

메시지 첨부 파일을 저장합니다.

| column | type | notes |
| --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | 첨부 ID |
| `message_id` | `TEXT NOT NULL` | `messages.id` FK |
| `name` | `TEXT NOT NULL` | 파일명 |
| `path` | `TEXT NOT NULL` | 원본 경로 |
| `content_text` | `TEXT NOT NULL` | 텍스트 첨부 본문. 이미지면 빈 문자열 |
| `size` | `INTEGER NOT NULL` | 바이트 크기 |
| `file_type` | `TEXT` | `text/image` |
| `seq` | `INTEGER NOT NULL` | 메시지 내 순서 |

### `scheduled_tasks`

예약 작업 정의를 저장합니다.

| column | type | notes |
| --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | 작업 ID |
| `name` | `TEXT NOT NULL` | 작업 이름 |
| `prompt` | `TEXT NOT NULL` | 실행 프롬프트 |
| `project_path` | `TEXT NOT NULL` | 작업 폴더 |
| `permission_mode` | `TEXT NOT NULL` | `default/acceptEdits/bypassPermissions` |
| `frequency` | `TEXT NOT NULL` | `manual/hourly/daily/weekdays/weekly` |
| `enabled` | `INTEGER NOT NULL` | `0/1` |
| `hour` | `INTEGER NOT NULL` | 시간 |
| `minute` | `INTEGER NOT NULL` | 분 |
| `weekly_day` | `TEXT NOT NULL` | `sun..sat` |
| `skip_days_json` | `TEXT` | 제외 요일 배열 JSON |
| `quiet_hours_start` | `TEXT` | `HH:mm` |
| `quiet_hours_end` | `TEXT` | `HH:mm` |
| `next_run_at` | `INTEGER` | 다음 실행 시각 |
| `last_run_at` | `INTEGER` | 마지막 실행 시각 |
| `created_at` | `INTEGER NOT NULL` | epoch ms |
| `updated_at` | `INTEGER NOT NULL` | epoch ms |
| `sort_order` | `INTEGER NOT NULL` | 작업 목록 순서 |

### `scheduled_task_runs`

예약 작업 실행 기록을 저장합니다.

| column | type | notes |
| --- | --- | --- |
| `id` | `TEXT PRIMARY KEY` | 실행 기록 ID |
| `task_id` | `TEXT NOT NULL` | `scheduled_tasks.id` FK |
| `run_at` | `INTEGER NOT NULL` | 실행 시각 |
| `outcome` | `TEXT NOT NULL` | `executed/skipped` |
| `note` | `TEXT NOT NULL` | 실행 메모 |
| `catch_up` | `INTEGER NOT NULL` | `0/1` |
| `manual` | `INTEGER NOT NULL` | `0/1` |
| `session_tab_id` | `TEXT` | 연결된 UI 세션 ID |
| `status` | `TEXT` | `running/approval/completed/failed` |
| `summary` | `TEXT` | 실행 요약 |
| `changed_paths_json` | `TEXT` | 변경 파일 배열 JSON |
| `cost` | `REAL` | 비용 |
| `sort_order` | `INTEGER NOT NULL` | 작업 내 순서 |

## 런타임 데이터

다음 값은 SQLite에 저장하지 않고 런타임 메모리에서만 유지합니다.

- `isStreaming`
- `currentAssistantMsgId`
- `pendingPermission`
- `pendingQuestion`

앱 재시작 시 이 값들은 초기화됩니다.

## Migration

첫 실행 시 다음 순서로 migration 합니다.

1. SQLite 파일이 비어 있는지 확인
2. renderer가 세션 store hydration 전에 기존 `localStorage` 키를 읽음
   - `claude-ui-sessions`
   - `claude-ui-scheduled-tasks`
3. DB가 비어 있고 legacy 데이터가 있으면 SQLite에 1회 import
4. 이후부터는 SQLite를 기준으로 로드
5. UI 설정은 기존 `claude-ui-sessions` localStorage에 계속 저장하되, 세션 본문은 더 이상 거기에 저장하지 않음

## 현재 구현 메모

- 저장은 안정성 우선으로 전체 스냅샷 치환 방식입니다.
- 세션 저장은 renderer에서 debounce 후 IPC로 main process에 전달합니다.
- 예약 작업은 renderer에서 full snapshot 저장과 scheduler sync를 분리합니다.
