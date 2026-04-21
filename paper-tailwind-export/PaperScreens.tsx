import type { ReactNode } from 'react'

type ScreenId =
  | 'team-empty'
  | 'team-workspace'
  | 'design-system'
  | 'session'
  | 'review'
  | 'workflow'
  | 'settings-skill'
  | 'settings-general'
  | 'settings-mcp'
  | 'settings-agents'
  | 'settings-variables'

type ScreenDefinition = {
  id: ScreenId
  paperNodeId: string
  name: string
  component: () => JSX.Element
}

const sidebarThreads = [
  ['로컬 서버 데모를 만들어줘.', '28분'],
  ['[워크플로우] ○ ○ · Step 3', '6시간'],
  ['[워크플로우] 테스트 · 문서 요약', '4일'],
]

const workflowRows = [
  ['문서 검토 흐름', '검토 → 요약 전송', '활성', '9분'],
  ['회신 분류', '중요도에 따라 분리', '정상', '1시간'],
  ['요청 초안 정리', '긴 요청을 표준 형식으로 변환', '초안', '어제'],
  ['분류 보정', '누락 항목 자동 재검토', '대기', '2일'],
]

const settingsTabs = [
  ['일반', '8'],
  ['MCP', '3'],
  ['스킬', '12'],
  ['에이전트', '4'],
  ['환경변수', '8'],
]

const skillFiles = ['SKILL.md', 'agents', 'assets', 'references', 'scripts', 'LICENSE.txt']

function MacDots() {
  return (
    <div className="flex items-center gap-2">
      <span className="h-3 w-3 rounded-full bg-[#ff6058]" />
      <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
      <span className="h-3 w-3 rounded-full bg-[#29c840]" />
    </div>
  )
}

function Titlebar({
  title,
  middle,
  right,
}: {
  title: string
  middle?: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="flex h-[42px] shrink-0 items-center border-b border-[#ffffff14] bg-[#1b1c1f] px-4">
      <div className="flex w-[100px] shrink-0 items-center">
        <MacDots />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-[#9b978f]">‹</span>
        <span className="text-[#9b978f]">›</span>
        <span className="truncate text-[13px] font-semibold text-[#ece7df]">{title}</span>
        <span className="text-[13px] text-[#9b978f]">citto-code</span>
        <span className="text-[#5b584f]">···</span>
        {middle}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>
    </div>
  )
}

function Button({
  children,
  active = false,
  accent = false,
  className = '',
}: {
  children: ReactNode
  active?: boolean
  accent?: boolean
  className?: string
}) {
  return (
    <button
      className={[
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-[6px] border px-3 text-[12px] font-medium',
        active ? 'border-[#3a3c42] bg-[#2a2b2f] text-[#ece7df]' : 'border-[#34353a] bg-[#1b1c1f] text-[#b8b2a8]',
        accent ? 'border-[#7c5238] bg-[#d08a5a] text-[#16171a]' : '',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function GlobalSidebar({ active = 'threads' }: { active?: 'threads' | 'team' }) {
  return (
    <aside className="flex h-full w-[188px] shrink-0 flex-col border-r border-[#ffffff14] bg-[#16171a] px-2 py-3 text-[12px] text-[#9b978f]">
      <MacDots />
      <div className="mt-4 space-y-1">
        <div className="flex h-[30px] items-center gap-2 rounded-[6px] px-2 text-[#ece7df]">＋ 새 세션</div>
        <div className="flex h-[32px] items-center justify-between rounded-[6px] border border-[#34353a] px-2">
          <span>▣ 워크플로우</span>
          <span className="rounded bg-[#2a2b2f] px-1.5">3</span>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between text-[11px] font-semibold">
        <span>스레드</span>
        <span>≡ ＋</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {sidebarThreads.map(([title, time], index) => (
          <div
            key={title}
            className={[
              'rounded-[6px] px-2.5 py-2',
              index === 0 && active === 'threads' ? 'bg-[#2a2b2f] text-[#ece7df]' : 'border border-[#34353a]',
            ].join(' ')}
          >
            <div className="line-clamp-2">{title}</div>
            <div className="mt-1 text-right text-[#77736c]">{time}</div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex h-[30px] items-center gap-2 px-2">◎ 설정</div>
    </aside>
  )
}

function TeamSidebar() {
  return (
    <aside className="flex h-full w-[188px] shrink-0 flex-col border-r border-[#34353a] bg-[#16171a] px-2 py-3 text-[12px] text-[#9b978f]">
      <MacDots />
      <div className="mt-4 space-y-1">
        <div className="h-[30px] rounded-[6px] px-2 py-1.5 text-[#ece7df]">‹ 채팅으로 돌아가기</div>
        <div className="h-[30px] rounded-[6px] px-2 py-1.5 text-[#ece7df]">＋ 새 라운드테이블</div>
        <div className="h-[30px] rounded-[6px] px-2 py-1.5">ⓘ 가이드</div>
      </div>
      <div className="mt-5 flex items-center justify-between px-1 text-[11px]">
        <span>라운드테이블</span>
        <span className="rounded border border-[#34353a] px-1.5">1</span>
      </div>
      <div className="mt-2 rounded-[6px] bg-[#2a2b2f] px-2.5 py-2 text-[#ece7df]">
        <div className="font-medium">출시 점검팀</div>
        <div className="mt-1 flex items-center justify-between text-[#9b978f]">
          <span>4명</span>
          <span className="rounded-full bg-[#23432f] px-2 text-[#8ad690]">완료</span>
        </div>
      </div>
    </aside>
  )
}

function PixelAgent({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="h-11 w-[52px] border-2 border-[#5c4b3e] bg-[#6d513d] shadow-[0_5px_0_#45362b]" />
      <div className={`-mt-7 h-9 w-11 border-2 border-[#3d434a] ${color} [image-rendering:pixelated]`} />
      <div className="mt-2 border border-[#96a3b0] bg-[#f5eee5] px-2 py-1 text-[11px] font-semibold text-[#4c5a67]">
        {label}
      </div>
    </div>
  )
}

function OfficeScene() {
  return (
    <div className="relative h-full min-h-[540px] flex-1 overflow-hidden rounded-[8px] border-2 border-[#8c98a4] bg-[linear-gradient(180deg,#eef3f7_0%,#e7edf3_28%,#c5cdd6_28%,#bcc5ce_100%)]">
      <div className="absolute left-[8%] top-[7%] h-[16%] w-[24%] rounded-[6px] border-2 border-[#93a7bc] bg-[#cfe6fb]" />
      <div className="absolute right-[8%] top-[7%] h-[16%] w-[24%] rounded-[6px] border-2 border-[#93a7bc] bg-[#cfe6fb]" />
      <div className="absolute inset-x-0 top-[28%] h-px bg-[#a4afba]" />
      <button className="absolute left-1/2 top-[8%] w-[168px] -translate-x-1/2 border-2 border-[#96a3b0] bg-[#f8fafc] px-4 py-3 text-center shadow-[0_4px_0_#c7d0d9]">
        <span className="border border-[#cfd8e1] bg-white px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-[#607080]">
          주제
        </span>
        <p className="mt-2 text-xs text-[#4c5a67]">테스트</p>
      </button>
      <div className="absolute bottom-[11%] left-[18%] right-[18%] top-[34%] rounded-[10px] border border-white/30 bg-[repeating-linear-gradient(90deg,rgba(139,151,163,0.09)_0_1px,transparent_1px_28px),repeating-linear-gradient(0deg,rgba(139,151,163,0.08)_0_1px,transparent_1px_28px)]" />
      <div className="absolute left-[36%] top-[42%] -translate-x-1/2 -translate-y-1/2"><PixelAgent color="bg-[#58b978]" label="개발자" /></div>
      <div className="absolute left-[65%] top-[42%] -translate-x-1/2 -translate-y-1/2"><PixelAgent color="bg-[#d89b3d]" label="테스터" /></div>
      <div className="absolute left-[36%] top-[72%] -translate-x-1/2 -translate-y-1/2"><PixelAgent color="bg-[#6f88a8]" label="보안전문가" /></div>
      <div className="absolute left-[65%] top-[72%] -translate-x-1/2 -translate-y-1/2"><PixelAgent color="bg-[#d85f50]" label="비판자" /></div>
    </div>
  )
}

function TeamFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[900px] w-[1440px] overflow-hidden bg-[#242426] font-['Archivo',system-ui,sans-serif] text-[#ece7df]">
      <TeamSidebar />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  )
}

export function TeamEmptyScreen() {
  return (
    <div className="h-[900px] w-[1440px] overflow-hidden bg-[#242426] font-['Archivo',system-ui,sans-serif]">
      <div className="flex h-full">
        <GlobalSidebar />
        <main className="flex flex-1 items-center justify-center bg-[#111113]">
          <div className="flex w-[520px] flex-col items-center gap-5 text-center">
            <div className="border border-[#34353a] bg-[#17181a] px-8 py-5 text-[#9b978f]">
              <div className="mx-auto flex h-20 w-48 items-end justify-center gap-4">
                <span className="h-14 w-12 bg-[#58b978]" />
                <span className="h-20 w-16 bg-[#d08a5a]" />
                <span className="h-14 w-12 bg-[#d85f50]" />
              </div>
            </div>
            <div className="text-[26px] font-semibold text-[#ece7df]">첫 라운드테이블을 시작하세요</div>
            <p className="max-w-[420px] text-[14px] leading-7 text-[#9b978f]">
              여러 에이전트가 같은 주제를 서로 검토하고 합의안을 정리하는 회의형 작업 공간입니다.
            </p>
            <Button accent>새 팀 만들기</Button>
          </div>
        </main>
      </div>
    </div>
  )
}

export function TeamWorkspaceScreen() {
  return (
    <TeamFrame>
      <Titlebar
        title="출시 점검팀"
        right={<><Button>가이드</Button><Button>새 라운드테이블</Button></>}
      />
      <div className="flex h-10 items-center gap-4 border-b border-[#34353a] bg-[#1b1c1f] px-4 text-[12px] text-[#9b978f]">
        <Button active>→ 순차</Button>
        <Button>↔ 병렬</Button>
        <Button>◎ 회의</Button>
        <span>라운드 <b className="text-[#ece7df]">1</b></span>
        <span className="text-[#ece7df]">개발자 → 테스터 → 보안전문가 → 비판자</span>
        <span className="ml-auto">"테스트"</span>
        <Button>초기화</Button>
      </div>
      <div className="flex flex-1 gap-3 overflow-hidden p-3">
        <OfficeScene />
        <aside className="w-[360px] shrink-0 overflow-hidden border border-[#34353a] bg-[#1d1e22]">
          <div className="flex items-center gap-4 border-b border-[#34353a] p-4">
            <div className="h-16 w-16 bg-[#d85f50]" />
            <div>
              <h2 className="text-[15px] font-semibold">비판자</h2>
              <p className="mt-1 text-[12px] text-[#9b978f]">코드 리뷰어</p>
              <p className="mt-2 text-[12px] text-[#9b978f]">문제점과 개선 사항을 찾아냅니다</p>
            </div>
          </div>
          <div className="space-y-3 p-4 text-[12px] text-[#b8b2a8]">
            <div className="border border-[#34353a] bg-[#17181a] p-3">
              최근 단서<br />이전 분석에 없던 파일들을 직접 확인합니다...
            </div>
            <div className="border-l border-[#d85f50] pl-3">
              <div className="mb-2 text-[#ece7df]">코드 리뷰어 관점: 동의, 반박, 보완</div>
              보안 전문가 의견에 대한 평가와 추가 확인 항목을 정리합니다.
            </div>
          </div>
        </aside>
      </div>
      <div className="border-t border-[#34353a] p-3">
        <div className="h-[80px] border border-[#34353a] bg-[#202126] px-4 py-3 text-[#77736c]">
          새 토론 주제를 입력하세요...
        </div>
      </div>
    </TeamFrame>
  )
}

function SessionSidebar() {
  return (
    <aside className="h-full w-[188px] border-r border-[#34353a] bg-[#16171a] px-2 py-3 text-[12px] text-[#9b978f]">
      <MacDots />
      <div className="mt-4 space-y-1">
        <div className="rounded-[6px] px-2 py-2 text-[#ece7df]">＋ New session</div>
        <div className="rounded-[6px] px-2 py-2">▣ Routines</div>
        <div className="rounded-[6px] px-2 py-2">⌂ Customize</div>
      </div>
      <div className="mt-6 text-[11px]">Citto-Code</div>
      {['Check Figma connection status', 'Add component interest calculation feature', 'Explore trending features', 'Fix API build configuration'].map((item, index) => (
        <div key={item} className={`mt-1 rounded-[6px] px-2 py-2 ${index === 0 ? 'bg-[#2a2b2f] text-[#ece7df]' : ''}`}>
          {item}
        </div>
      ))}
    </aside>
  )
}

export function ProSessionScreen() {
  return (
    <div className="flex h-[900px] w-[1440px] overflow-hidden bg-[#242426] font-['Archivo',system-ui,sans-serif] text-[#ece7df]">
      <SessionSidebar />
      <main className="flex flex-1 flex-col">
        <Titlebar title="Citto-Code / Check Figma connection status" right={<span className="text-[12px] text-[#8fd080]">+4460 -0</span>} />
        <div className="mx-auto w-[680px] flex-1 overflow-hidden py-6 text-[13px] leading-6 text-[#b8b2a8]">
          <p>현재 브랜치의 실제 WelcomeScreen 읽어볼게요.</p>
          <p className="mt-4">읽기 WelcomeScreen.tsx</p>
          <p>완전히 다른 구도네요. 현재 말풍선은 카드 스타일이고...</p>
          <pre className="mt-6 rounded-[6px] border border-[#34353a] bg-[#1d1e22] p-4 font-mono text-[12px] text-[#d8d3cc]">
{`Citto Code
Claude Code CLI 기반 코드 어시스턴트입니다.

        [ + GIF 마스터 ]

구조 이해        요청 초안 정리
이 저장소 구조와 핵심 흐름 먼저 설명해`}
          </pre>
        </div>
        <div className="mx-auto mb-4 h-[74px] w-[680px] rounded-[8px] border border-[#34353a] bg-[#202126] px-4 py-3 text-[#77736c]">
          바이브 일렉트리 / 입력
        </div>
      </main>
    </div>
  )
}

export function ProReviewScreen() {
  return (
    <div className="flex h-[900px] w-[1440px] overflow-hidden bg-[#242426] font-['Archivo',system-ui,sans-serif] text-[#ece7df]">
      <SessionSidebar />
      <main className="flex flex-1 flex-col">
        <Titlebar title="Review / Fix permissions" right={<span className="text-[12px] text-[#8fd080]">+157,082 -0</span>} />
        <div className="mx-auto w-[640px] flex-1 overflow-y-auto py-7 text-[13px] leading-6 text-[#b8b2a8]">
          <p>상위 파일 구조를 확인했고, 편집 위치도 AssistantMessageBubble.tsx로 좁혔습니다.</p>
          <div className="my-6 rounded-[6px] border border-[#34353a] bg-[#202126] p-3">
            <div className="text-[11px] text-[#9b978f]">1개 파일 변경됨</div>
            <div className="mt-2 text-[#ece7df]">src/components/message/AssistantMessageBubble.tsx <span className="text-[#8fd080]">+9</span> <span className="text-[#e36b6b]">-35</span></div>
          </div>
          <p>되돌렸습니다. 남은 변경은 제 작업과 무관한 untracked 파일뿐입니다.</p>
        </div>
        <div className="mx-auto mb-4 h-[70px] w-[640px] rounded-[8px] border border-[#34353a] bg-[#202126] px-4 py-3 text-[#77736c]">
          후속 변경 사항을 부탁하세요
        </div>
      </main>
    </div>
  )
}

export function ProWorkflowScreen() {
  return (
    <div className="h-[900px] w-[1440px] overflow-hidden bg-[#111113] font-['Archivo',system-ui,sans-serif] text-[#ece7df]">
      <Titlebar
        title="문서 검토 워크플로우 정리"
        middle={<Button className="ml-3 w-[230px] justify-between">문서 검토 워크플로우 정리 ˅</Button>}
        right={<><Button>열기</Button><Button>미리보기</Button></>}
      />
      <div className="flex h-[858px]">
        <WorkflowSidebarStatic />
        <main className="relative flex-1 overflow-hidden">
          <div className="border-b border-[#34353a] px-7 py-5">
            <h1 className="text-[20px] font-semibold">문서 검토 워크플로우 정리</h1>
            <p className="mt-2 text-[12px] text-[#9b978f]">리뷰 수집 → 중요도 판단 → 추가 확인 반복 → 최종 정리 순서로 실행됩니다.</p>
            <div className="mt-3 flex gap-2"><Button active>매일 09:00</Button><span className="text-[12px] text-[#9b978f]">마지막 실행: 오늘 20:41 · 다음 실행: 내일 09:00</span></div>
          </div>
          <WorkflowCanvasStatic withEditor />
        </main>
      </div>
    </div>
  )
}

function WorkflowSidebarStatic() {
  return (
    <aside className="w-[260px] border-r border-[#34353a] bg-[#16171a] p-3 text-[12px] text-[#9b978f]">
      <div className="flex items-center justify-between"><h2 className="text-[13px] font-semibold text-[#ece7df]">워크플로우</h2><span>12개</span></div>
      <div className="mt-3 flex gap-2"><div className="flex-1 rounded border border-[#34353a] px-2 py-2">흐름 검색</div><Button accent>새로 만들기</Button></div>
      <div className="mt-3 flex gap-2"><Button active>전체</Button><Button>최근 실행</Button><Button>초안</Button></div>
      <div className="mt-4 grid grid-cols-[1fr_40px_48px] text-[10px]"><span>목록</span><span>상태</span><span>최근 수정</span></div>
      <div className="mt-2 space-y-1">
        {workflowRows.map(([name, desc, status, time], index) => (
          <div key={name} className={`grid min-h-[58px] grid-cols-[1fr_40px_48px] gap-2 rounded-[6px] px-2 py-2 ${index === 0 ? 'bg-[#2a2b2f]' : ''}`}>
            <div><div className="text-[#ece7df]">{name}</div><div>{desc}</div></div><div>{status}</div><div>{time}</div>
          </div>
        ))}
      </div>
    </aside>
  )
}

function WorkflowCanvasStatic({ withEditor = false }: { withEditor?: boolean }) {
  return (
    <div className="absolute inset-0 top-[110px] bg-[#17181a] bg-[radial-gradient(circle,#292b30_1px,transparent_1px)] [background-size:28px_28px]">
      <div className="absolute left-[80px] top-[300px] h-9 w-9 rounded-full bg-[#3b8c58]" />
      <div className="absolute left-[190px] top-[294px] h-[58px] w-[206px] rounded-[6px] border border-[#34353a] bg-[#202126] p-3">리뷰 수집<br /><span className="text-[11px] text-[#9b978f]">Agent</span></div>
      <div className="absolute left-[500px] top-[294px] h-[58px] w-[206px] rounded-[6px] border border-[#5170ba] bg-[#202126] p-3">중요도 판단<br /><span className="text-[11px] text-[#9b978f]">Condition</span></div>
      <div className="absolute left-[760px] top-[220px] h-[58px] w-[206px] rounded-[6px] border border-[#34353a] bg-[#202126] p-3">추가 확인<br /><span className="text-[11px] text-[#9b978f]">Loop</span></div>
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2"><Button>＋ Add Step</Button><Button>✦ Trigger</Button><Button>☰ History</Button><Button accent>▶ Run Now</Button></div>
      {withEditor ? (
        <aside className="absolute bottom-4 right-4 top-4 w-[392px] border border-[#34353a] bg-[#202126] p-4">
          <div className="flex justify-between"><h3 className="font-semibold">Edit Node</h3><Button>닫기</Button></div>
          {['Step name', 'Default next node', 'Operator', 'Comparison value', 'If true, go to', 'If false, go to'].map((label) => (
            <div key={label} className="mt-4"><div className="mb-2 text-[12px] text-[#b8b2a8]">{label}</div><div className="h-10 rounded bg-[#111113] px-3 py-2 text-[#9b978f]">중요도 판단</div></div>
          ))}
        </aside>
      ) : null}
    </div>
  )
}

function SettingsSidebar({ active = '스킬' }: { active?: string }) {
  return (
    <aside className="w-[220px] border-r border-[#34353a] bg-[#16171a] px-3 py-5 text-[13px] text-[#9b978f]">
      <h2 className="font-semibold text-[#ece7df]">설정</h2>
      <p className="mt-2 text-[11px]">작업 환경과 연결을 조정합니다</p>
      <div className="mt-6 space-y-1">
        {settingsTabs.map(([label, count]) => (
          <div key={label} className={`flex h-9 items-center justify-between rounded-[6px] px-3 ${label === active ? 'bg-[#2a2b2f] text-[#ece7df]' : ''}`}>
            <span>{label}</span><span>{count}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}

function SettingsFrame({ active, children }: { active: string; children: ReactNode }) {
  return (
    <div className="h-[900px] w-[1440px] overflow-hidden bg-[#111113] font-['Archivo',system-ui,sans-serif] text-[#ece7df]">
      <Titlebar title="환경 설정 정리" right={<><Button>열기</Button><Button>미리보기</Button><span className="text-[12px] text-[#9b978f]">브랜치 +35 -9</span></>} />
      <div className="flex h-[858px]">
        <SettingsSidebar active={active} />
        {children}
      </div>
    </div>
  )
}

function SettingsSectionNav({ title, rows }: { title: string; rows: string[] }) {
  return (
    <aside className="w-[286px] border-r border-[#34353a] bg-[#18191c] p-3 text-[13px] text-[#9b978f]">
      <div className="flex justify-between"><h2 className="font-semibold text-[#ece7df]">{title}</h2><span>⌕ ＋</span></div>
      <div className="mt-5 space-y-1">
        {rows.map((row, index) => (
          <div key={row} className={`rounded-[6px] px-3 py-2 ${index === 0 ? 'bg-[#2a2b2f] text-[#ece7df]' : ''}`}>{row}</div>
        ))}
      </div>
    </aside>
  )
}

export function ProSettingsScreen() {
  return (
    <SettingsFrame active="스킬">
      <SettingsSectionNav title="스킬" rows={['skill-creator', ...skillFiles, 'paper-sync', 'figma-code-connect', 'skill-evals']} />
      <main className="flex-1 overflow-y-auto p-5">
        <div className="flex items-start justify-between border-b border-[#34353a] pb-4">
          <div><div className="text-[12px] text-[#9b978f]">개인 스킬</div><h1 className="text-[22px] font-semibold">skill-creator</h1><p className="mt-2 text-[12px] text-[#9b978f]">Anthropic · 슬래시 명령어 + 자동 · 활성</p></div>
          <span className="text-[12px] text-[#9b978f]">SKILL.md</span>
        </div>
        <CodePanel />
      </main>
    </SettingsFrame>
  )
}

function CodePanel() {
  return (
    <div className="mt-5 border border-[#34353a] bg-[#111113] font-mono text-[13px] leading-8 text-[#d8d3cc]">
      <div className="flex gap-8 border-b border-[#34353a] px-4 py-2 text-[12px] text-[#9b978f]"><span>SKILL.md</span><span>evals/eval.json</span><span>references/</span><span className="ml-auto">코드 보기</span></div>
      <pre className="overflow-hidden p-5">
{` 1  ## Commit message format
 5  Input: Added user authentication with JWT tokens
 6  Output: feat(auth): implement JWT-based authentication

10  Writing Style
14  Explain why each instruction matters instead of relying only on MUST statements.

19  Test Cases
23  Collect 2-3 realistic prompts from real user language before drafting assertions.`}
      </pre>
    </div>
  )
}

export function SettingsGeneralScreen() {
  return (
    <SettingsFrame active="일반">
      <SettingsSectionNav title="일반" rows={['표시', '세션 복구', '알림', '단축키', '작성 보조']} />
      <main className="flex-1 overflow-y-auto p-5">
        <h1 className="text-[22px] font-semibold">표시</h1>
        <div className="mt-5 grid grid-cols-[1fr_220px] gap-4">
          <div className="border border-[#34353a] p-4"><div className="text-[12px] text-[#9b978f]">현재 프리셋</div><h3 className="mt-2 font-semibold">집중 작업용</h3><p className="mt-2 text-[12px] text-[#9b978f]">정보 밀도는 높이고, 보조 텍스트는 한 단계 낮춰 화면이 덜 떠 보이도록 조정합니다.</p></div>
          <div className="border border-[#34353a] p-4"><div className="text-[12px] text-[#9b978f]">기본 화면</div><h3 className="mt-2 font-semibold">새 세션</h3><p className="mt-2 text-[12px] text-[#9b978f]">앱 시작 직후 바로 입력 가능</p></div>
        </div>
        {['밀도', '사이드 패널 기본 너비', '최근 세션 자동 복구', '완료 알림 배너'].map((row, index) => (
          <div key={row} className="mt-4 flex h-[50px] items-center justify-between bg-[#18191c] px-4 text-[13px]">
            <div><div className="font-medium">{row}</div><div className="text-[12px] text-[#9b978f]">Paper 시안 기준 밀도 유지</div></div>
            <Button active={index === 0}>표준</Button>
          </div>
        ))}
        <div className="mt-6 border border-[#34353a] p-4 text-[#9b978f]">미리보기 skeleton rows</div>
      </main>
    </SettingsFrame>
  )
}

export function SettingsMcpScreen() {
  return (
    <SettingsFrame active="MCP">
      <SettingsSectionNav title="MCP" rows={['사용자 범위', '프로젝트별', '공유 설정']} />
      <main className="flex-1 p-5">
        <h1 className="text-[22px] font-semibold">MCP 서버</h1>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {['paper', 'figma', 'playwright'].map((name, index) => (
            <div key={name} className="border border-[#34353a] bg-[#18191c] p-4">
              <div className="flex items-center justify-between"><h3 className="font-semibold">{name}</h3><span className="text-[#8fd080]">정상</span></div>
              <p className="mt-3 text-[12px] text-[#9b978f]">{index === 0 ? 'Paper canvas export and editing server' : '연결된 도구 서버'}</p>
              <div className="mt-4 h-24 bg-[#111113] p-3 font-mono text-[11px] text-[#9b978f]">command / args / env</div>
            </div>
          ))}
        </div>
      </main>
    </SettingsFrame>
  )
}

export function SettingsAgentsScreen() {
  return (
    <SettingsFrame active="에이전트">
      <SettingsSectionNav title="에이전트" rows={['code-reviewer.md', 'designer.md', 'planner.md', 'qa.md']} />
      <main className="flex-1 p-5">
        <h1 className="text-[22px] font-semibold">code-reviewer</h1>
        <p className="mt-2 text-[12px] text-[#9b978f]">변경사항을 비판적으로 검토하고 회귀 위험을 먼저 찾습니다.</p>
        <div className="mt-5 grid grid-cols-[1fr_320px] gap-4">
          <CodePanel />
          <div className="border border-[#34353a] bg-[#18191c] p-4">
            <h3 className="font-semibold">도구 권한</h3>
            {['read', 'grep', 'git diff', 'npm test'].map((tool) => <div key={tool} className="mt-3 flex justify-between text-[13px]"><span>{tool}</span><span className="text-[#8fd080]">허용</span></div>)}
          </div>
        </div>
      </main>
    </SettingsFrame>
  )
}

export function SettingsVariablesScreen() {
  return (
    <SettingsFrame active="환경변수">
      <SettingsSectionNav title="환경변수" rows={['CLAUDE_CODE_USE_BEDROCK', 'ANTHROPIC_MODEL', 'PATH', 'GIT_EDITOR']} />
      <main className="flex-1 p-5">
        <h1 className="text-[22px] font-semibold">환경변수</h1>
        <p className="mt-2 text-[12px] text-[#9b978f]">Claude 실행과 프로젝트별 명령 환경을 분리해 관리합니다.</p>
        <div className="mt-5 border border-[#34353a]">
          {['CLAUDE_CODE_USE_BEDROCK=false', 'ANTHROPIC_MODEL=default', 'PATH=/opt/homebrew/bin:...', 'GIT_EDITOR=code --wait'].map((item) => (
            <div key={item} className="flex h-11 items-center justify-between border-b border-[#34353a] px-4 text-[13px] last:border-b-0">
              <span className="font-mono">{item}</span><Button>편집</Button>
            </div>
          ))}
        </div>
      </main>
    </SettingsFrame>
  )
}

export function DesignSystemProScreen() {
  return (
    <div className="w-[1600px] bg-[#111113] p-10 font-['Archivo',system-ui,sans-serif] text-[#ece7df]">
      <h1 className="text-[36px] font-semibold">Citto Pro Design System</h1>
      <p className="mt-3 max-w-[700px] text-[15px] leading-7 text-[#9b978f]">Compact, professional desktop tooling for developers and non-developers. No generic AI cards, no oversized spacing, no duplicated headers.</p>
      <div className="mt-10 grid grid-cols-4 gap-4">
        {['#111113', '#16171A', '#1B1C1F', '#2A2B2F', '#ECE7DF', '#9B978F', '#D08A5A', '#8FD080'].map((color) => (
          <div key={color} className="border border-[#34353a] p-4">
            <div className="h-20" style={{ backgroundColor: color }} />
            <div className="mt-3 font-mono text-[12px]">{color}</div>
          </div>
        ))}
      </div>
      <div className="mt-10 grid grid-cols-3 gap-5">
        <div className="border border-[#34353a] p-5"><h2 className="text-[20px] font-semibold">Density</h2><p className="mt-2 text-[#9b978f]">42px titlebar, 188px session sidebar, 260px workflow sidebar, 286px settings subnav.</p></div>
        <div className="border border-[#34353a] p-5"><h2 className="text-[20px] font-semibold">Components</h2><div className="mt-4 flex gap-2"><Button active>Selected</Button><Button>Secondary</Button><Button accent>Accent</Button></div></div>
        <div className="border border-[#34353a] p-5"><h2 className="text-[20px] font-semibold">Typography</h2><p className="mt-2 text-[13px] leading-6 text-[#9b978f]">Archivo UI, Menlo code, fixed product scale. Letter spacing stays neutral.</p></div>
      </div>
    </div>
  )
}

export const paperScreens: ScreenDefinition[] = [
  { id: 'team-empty', paperNodeId: '7AF-0', name: '07 Team Empty', component: TeamEmptyScreen },
  { id: 'team-workspace', paperNodeId: '7C2-0', name: '08 Team Workspace', component: TeamWorkspaceScreen },
  { id: 'design-system', paperNodeId: '7GY-0', name: '11 Design System Pro', component: DesignSystemProScreen },
  { id: 'session', paperNodeId: '7Q0-0', name: '12 Pro Session', component: ProSessionScreen },
  { id: 'review', paperNodeId: '8K5-0', name: '13 Pro Review', component: ProReviewScreen },
  { id: 'workflow', paperNodeId: '7TJ-0', name: '14 Pro Workflow', component: ProWorkflowScreen },
  { id: 'settings-skill', paperNodeId: '806-0', name: '15 Pro Settings', component: ProSettingsScreen },
  { id: 'settings-general', paperNodeId: '84J-0', name: '16 Settings General', component: SettingsGeneralScreen },
  { id: 'settings-mcp', paperNodeId: '88L-0', name: '17 Settings MCP', component: SettingsMcpScreen },
  { id: 'settings-agents', paperNodeId: '8CT-0', name: '18 Settings Agents', component: SettingsAgentsScreen },
  { id: 'settings-variables', paperNodeId: '8GA-0', name: '19 Settings Variables', component: SettingsVariablesScreen },
]

export function PaperScreensGallery() {
  return (
    <div className="min-h-screen space-y-10 bg-[#050506] p-8">
      {paperScreens.map((screen) => {
        const Component = screen.component
        return (
          <section key={screen.id} className="space-y-3">
            <div className="flex items-end justify-between text-[#ece7df]">
              <div>
                <div className="font-mono text-[12px] text-[#9b978f]">{screen.paperNodeId}</div>
                <h2 className="text-[18px] font-semibold">{screen.name}</h2>
              </div>
              <div className="font-mono text-[12px] text-[#5b584f]">{screen.id}</div>
            </div>
            <div className="origin-top-left scale-[0.5] overflow-hidden rounded-[10px] border border-[#34353a] bg-[#111113] shadow-2xl">
              <Component />
            </div>
          </section>
        )
      })}
    </div>
  )
}
