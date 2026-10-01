# Ready_Ai Badge and Follow-Up Rules

## Duplicate Extension Guard

Ready_Ai must not run two active unpacked copies against ChatGPT. On this PC the duplicate ids observed were:

- Canonical repo extension: `jmgnmeaiahlpbbgnocmognokfecofkma`
- Older mirrored-path extension: `ajnolilmicdilijebljgchoodgajnfeg`

If both are enabled, each extension has its own isolated content world and background worker. They can both inject the same UI id, send `force_check`, process the same follow-up queue, and make Chrome freeze when multiple ChatGPT tabs are open.

Do not remove the page-level ownership guard in the content script. Duplicate Ready_Ai instances must yield before creating `#ready-ai-steering-host`, before running heavy status checks, and before processing follow-up queue messages.

Do not remove the background passive-duplicate guard. On this PC the legacy mirror id `ajnolilmicdilijebljgchoodgajnfeg` must not run tab injection, queue probe, Gemini probe, or ChatGPT bootstrap handling while the canonical id `jmgnmeaiahlpbbgnocmognokfecofkma` exists. Otherwise two service workers can race on the same ChatGPT tabs even when the page-level UI guard works.

Do not bump `READY_AI_CONTENT_VERSION` just to mark a build. That string is the background/content compatibility handshake. Bumping it while Chrome still has an older service worker alive causes repeated `chrome.scripting.executeScript` reinjection and can make multiple ChatGPT tabs freeze. Use `READY_AI_CONTENT_BUILD_VERSION` for build identity instead.

이 문서는 배지 상태 규칙과 후속 지시 규칙을 고정하기 위한 기준 문서다.
이 문서의 항목은 사용자 요청 없이 임의로 바꾸지 않는다.

## 1. 배지 상태 규칙

배지 상태는 후속 지시와 완전히 별개다.

### 고정 규칙
1. GPT가 답변 또는 이미지 생성 중이면 배지는 주황색이다.
2. GPT 답변이 끝나면 배지는 흰색이다.
3. 흰색 상태는 사용자가 페이지를 읽고 있다는 뜻이 아니라 아직 확인 전 완료 상태라는 뜻이다.
4. 흰색 상태는 사용자가 클릭하거나 스크롤하거나 메인 채팅 입력창에서 새 입력을 시작하면 연두색으로 바뀐다.
5. 연두색 상태는 대기/읽음/아무 질문 없음 상태다.
6. 후속 지시 입력 간격을 위한 별도 노란색 배지는 두지 않는다.
7. 후속 지시 대기열이 남아 있으면 크롬 탭 제목에서는 색 배지 바로 오른쪽에 붙는 압축 숫자로, 크롬 확장 뱃지에서는 일반 숫자로 남은 개수를 노출한다.
8. 후속 지시 기능 수정은 배지 상태 규칙을 건드리면 안 된다.

### 탭 제목 숫자 표시 기준
1. 크롬 탭 제목은 문자열만 표시할 수 있으므로 진짜 픽셀 겹침 대신 색 배지 바로 옆에 붙는 압축 숫자로 표현한다.
2. 숫자는 작은 위첨자나 대괄호 없이 일반 크기 숫자만 사용해서 가독성을 우선한다.
3. 색 배지 바로 오른쪽에 `N` 형태로 공백 없이 붙여서 최대한 짧고 선명하게 보이게 한다.

### Google AI 제목 안전 모드
1. Gemini와 AI Studio에서는 `document.title`을 지속적으로 감시하거나 되쓰지 않는다.
2. Google 페이지가 새 채팅 제목을 정하는 동안 확장 제목 guard가 맞물리면 렌더러 CPU/RAM이 폭증할 수 있으므로, 이 두 사이트의 상태 이모지는 후속 지시 패널 안에서만 유지한다.
3. 후속 지시 대기열, 생성 감지, 완료 후 자동 전송은 제목 처리와 독립적으로 계속 동작해야 한다.
4. Google AI 편집기는 페이지 메인 영역에서 편집기 모델을 갱신하고, 입력창과 가장 가까운 정확한 보내기 버튼을 사용한다. `debugger` 권한은 다른 Chrome 제어 확장과 충돌하고 자동화 세션을 끊을 수 있으므로 사용하지 않는다.
5. AI Studio가 생성 중 Stop/Progress 요소를 제공하지 않는 UI에서는 활성 `Run` 버튼의 소실과 복귀를 생성 시작/완료 보조 신호로 사용한다. 사용자 Ctrl/Cmd+Enter와 Ready_Ai 전송 직후에는 짧은 고속 점검을 실행하고, `Run`이 복귀하면 완료 상태를 열어 대기열의 다음 후속 지시를 자동 전송한다.
6. AI Studio 상태 점검은 긴 대화 전체의 모든 Material 아이콘을 반복 수집하지 않는다. 명시적인 Stop 버튼과 현재 보이는 입력 footer 내부의 진행/Stop 신호만 검사하고, 유휴 상태 폴링은 5초 간격으로 제한한다.

## 2. 후속 지시 규칙

### 런처 문구
- 제목: 후속 지시 열기
- 설명: 항상 열어둘 수 있는 후속 지시 패널

### 표시 규칙
1. `후속 지시 열기` 런처는 지원 사이트에서 상시 보여야 한다.
2. 런처 위치는 채팅 입력창 바로 위 기준으로 고정한다.
3. 대기 문구는 `대기중: N` 형식으로 표시한다.
4. `대기중: N`은 `후속 지시 열기` 또는 `후속 지시 닫기` 문구 바로 오른쪽 같은 줄에 붙는다.
5. 후속 지시 패널을 닫아도 `대기중: N` 표시는 계속 보여야 한다. 내부 대기열도 그대로 유지한다.
6. 패널이 열려 있으면 런처 제목은 `후속 지시 닫기`로 바뀌고, 닫혀 있으면 `후속 지시 열기`로 돌아가야 한다.
7. 카드와 런처는 입력창 바로 위에 고정되고, 대기 목록은 카드 위로만 늘어나야 한다.
8. 카드 열기와 닫기는 내부 대기열과 분리해서 동작한다.
9. GPT 답변 완료만으로 후속 지시 패널을 자동으로 열면 안 된다. 패널은 사용자가 런처를 눌렀을 때만 열린다.

### 입력 버튼 규칙
1. 기본 버튼 텍스트는 `후속 대기`이며, Enter 키도 현재 입력을 후속 지시 대기열에 넣는다.
2. Ctrl+Enter 또는 Cmd+Enter는 ChatGPT의 실제 키 입력 처리를 먼저 유지해서 현재 작업에 바로 반영한다. 0.36초 안에 새 사용자 메시지, 입력창 비움/닫힘, 전송 버튼 상태 변화가 없고 입력이 남아 있으면 Ready_Ai가 현재 입력창에 가장 가까운 전송 경로로 한 번 복구한다. 보조 전송용 내부 Enter는 후속 대기열에 넣지 않으며, 키를 누른 직후 기존 작업이 끝나도 현재 입력을 반드시 전송한다.
   - ChatGPT 이미지 편집 모달의 입력창은 뒤에 남아 있는 기본 대화 입력창보다 우선한다. 편집창이 닫히거나 이미지 처리 상태가 시작된 경우도 정상 전송으로 판정해 중복 편집을 만들지 않는다.
   - 후속 지시 기능이 꺼져 있어도 Ctrl/Cmd+Enter의 최소 복구 전송은 유지한다. 이때 다른 응답을 중지하지 않으며, 생성 중 응답을 중지하고 즉시 반영하는 동작은 후속 지시 기능이 켜진 경우에만 허용한다.
   - 후속 지시 기능이 켜져 있으면 Ctrl/Cmd+Enter 직후 응답 시작 표시가 아직 나타나지 않은 짧은 전환 구간에도 다음 기본 Enter를 후속 대기열로 보낸다. 네이티브 전송 확인 또는 복구 전송이 끝나면 기존 응답 시작/완료 대기 상태로 연속해서 넘기며, 이 구간의 Enter가 ChatGPT로 직접 새 전송되면 안 된다.
3. ChatGPT가 응답 생성 중이면 후속 지시 패널의 열림/닫힘과 관계없이, ChatGPT 기본 입력창의 Enter는 현재 입력을 후속 지시 대기열에 넣는다. Shift+Enter 줄바꿈과 Ctrl/Cmd+Enter 즉시 반영은 그대로 유지한다.
4. `바로 반영`은 기존 대기 항목을 한꺼번에 보내거나 순서를 바꾸면 안 된다. 선택한 입력 또는 선택한 대기 항목 하나만 전송한다.
5. 사용자가 입력한 후속 지시는 여러 개 대기열에 쌓을 수 있어야 한다.
   - Ctrl/Cmd+Enter 직후의 다음 Enter도 버리면 안 된다. 물리 키 반복은 `event.repeat`으로 막고, 서로 다른 후속 지시는 0.16초 이후부터 연속 입력을 허용한다.
6. ChatGPT 새 채팅의 첫 질문 전에는 후속 패널의 Enter/`후속 대기` 입력을 자동 전송하지 않는다. 첫 항목은 대기열에 남기고, Ctrl/Cmd+Enter 또는 사용자가 누른 `다음 보내기`만 즉시 전송할 수 있다. 실제 첫 대화가 시작된 뒤에는 기존 후속 자동 전송 흐름을 따른다.
7. 후속 지시는 한 번에 하나씩만 전송하고, 전송이 성공하면 대기열에서 자동으로 하나씩 사라져야 한다.
8. 후속 지시 전송이 시작되면 응답 시작 전까지는 다음 후속 지시가 바로 연속 전송되지 않도록 막아야 한다.
9. GPT 답변 완료 후 1초 뒤 대기열의 다음 후속 지시를 자동 전송한다.
10. 일반 Enter로 여러 항목을 연속 대기시킨 뒤에도 Ctrl/Cmd+Enter는 버리지 않는다. 자동 대기 항목 전송과 겹치면 짧게 전송 슬롯을 기다리고, ChatGPT가 생성 종료 경계에 있으면 React 내부 객체를 순회하지 않고 보이는 Stop/보내기 버튼만 사용해 중지 후 즉시 전송한다.
10. 대기 목록과 대기 문구는 카드 내부가 아니라 카드 위 영역에 표시해서 카드 위치를 흔들지 않아야 한다.
11. 전송 버튼 탐지에 실패해도 주변 제출 버튼, form submit, Enter 전송을 순서대로 시도해야 한다.
    - Gemini에서는 이전 답변의 `다시 실행`을 보내기 버튼으로 오인하면 안 된다. `보내기/전송` 라벨을 우선하고 재실행·재생성·retry 계열을 제외한 뒤 실제 입력창에 가장 가까운 버튼을 선택한다.
12. `다음 보내기`는 GPT가 생성 중이거나 방금 보낸 응답의 시작/완료 확인을 기다리는 동안 후속대기 게이트를 우회하면 안 된다.
13. `바로 반영`만 사용자의 명시적인 현재 작업 조정 동작으로 게이트를 우회할 수 있다. 나머지 대기 항목은 ChatGPT가 전송 가능한 상태가 된 뒤 일반 큐 처리기로 하나씩 보내야 한다.
14. 각 대기 항목은 편집, 드래그 순서 변경, 바로 반영, 삭제를 제공해야 한다.
15. 대기열이 길어져도 패널 상단이 viewport 밖으로 잘리면 안 된다. 큐 높이는 스크롤로 제한하고, 필요한 경우 카드 내부 높이를 줄여서 처리한다.
16. Gemini의 `후속 지시 열기/닫기` 런처는 첫 화면과 대화 화면 모두 동일한 하단 고정 높이를 사용한다. 가로 위치만 실제 입력창 외곽 오른쪽 끝에 맞춘다. 패널이 열려 상단이 viewport 밖으로 나갈 때만 열린 묶음을 필요한 만큼 아래로 보정하고, 닫으면 하단 고정 높이로 즉시 돌아간다.
17. `ChatGPT 후속 대기` 카드 자체에는 세로/가로 스크롤바를 만들지 않는다. 스크롤은 대기 목록에만 허용하고, 카드 높이 문제는 입력창/파일 드롭 영역을 더 슬림하게 줄여 해결한다.
18. ChatGPT 페이지 오른쪽 스크롤바와 후속 지시 패널 오른쪽 끝이 겹치면 안 된다. ChatGPT에서는 패널을 스크롤바에서 소폭 왼쪽으로 띄운다.
    - 홈 화면의 작성기가 화면 중앙에 있을 때 펼친 패널이 모델 선택 버튼을 가리면, 버튼 옆에 패널 전체가 들어가는 공간을 찾아 수평으로 옮긴다. 먼저 오른쪽을 사용하고, 공간이 부족하면 왼쪽을 사용한다. 양쪽에 공간이 없으면 화면 밖으로 밀지 않는다.
    - 모델/추론 수준 메뉴 등 ChatGPT 기본 팝오버가 후속 지시 UI와 겹치면, 메뉴가 열려 있는 동안만 UI를 일시적으로 숨긴다. 메뉴를 닫으면 원래 위치에 복원하며 패널 열림 상태, 초안, 첨부, 대기열과 자동 전송은 유지한다. 툴팁과 겹치지 않는 팝오버에는 양보하지 않는다.
19. ChatGPT가 생성 중일 때 대기 항목의 `바로 반영`은 현재 응답을 중지 버튼으로 끊으면 안 된다. 선택한 항목을 ChatGPT 기본 입력창에 반영하고 실제 Ctrl/Cmd+Enter와 같은 현재 작업 조정 경로만 사용해야 한다. 이 경로를 확인하지 못하면 일반 Enter로 폴백해 ChatGPT의 다음 대기열에 넣지 않고 Ready_Ai 대기 항목을 그대로 보존한다. 일반 자동 대기열 전송에는 이 우회 경로를 적용하지 않는다.
20. Gemini의 Quill 작성기는 단순 `textContent` 대입으로 덮어쓰지 않는다. 작성기에 사용자 초안이 있으면 후속 지시를 대기하고, 빈 작성기에는 편집 명령으로 전체 선택 후 교체하며 Quill의 `<p>` 문단 구조와 replacement input 이벤트를 유지한다. 반영 검증 실패 시 잘못 삽입된 문자열을 지워 다음 재시도에 누적되지 않게 한다.

### ChatGPT 다중 탭 감시 범위
1. ChatGPT 후속 지시 감시는 top frame 기준으로만 동작해야 한다.
2. ChatGPT iframe은 후속 지시 대기열 개수를 background에 보고하면 안 된다. iframe의 빈 큐가 top frame의 실제 대기열 개수를 0으로 덮어쓰면 안 된다.
3. background의 후속 지시 probe는 ChatGPT URL이면서 실제 대기열 개수가 남아 있는 탭만 대상으로 한다.
4. 큐가 없는 평상시에는 후속 지시 probe alarm을 꺼두어야 한다.
5. 여러 ChatGPT 탭이 열려 있어도 probe는 큐가 있는 탭 ID 중 한 번에 소수 탭만 순환 처리해야 한다. 모든 Chrome 탭이나 모든 iframe을 동시에 깨우는 방식으로 되돌리면 안 된다.
6. 새 채팅 분산 전송처럼 명시적으로 필요한 경우를 제외하고 ChatGPT content script를 all frames로 강제 재주입하면 안 된다.
7. `manifest.json`의 ChatGPT 항목에는 full content script 자동 주입을 두지 않는다. ChatGPT에는 top frame 전용 `src/content/chatgpt-bootstrap.js`만 자동 주입하며, 실제 content script는 background가 요청한 ChatGPT 탭 하나, 활성 ChatGPT 탭, 또는 큐가 있는 ChatGPT 탭에만 수동 주입한다. Gemini/AI Studio 등 비-ChatGPT 기본 사이트의 top-frame manifest 주입은 유지한다.
8. service worker 시작 시 전체 탭을 훑어서 content script를 주입하는 `kickAllTabs`류 동작을 넣으면 안 된다. 시작/설치/초기화 시에는 각 창의 활성 ChatGPT/Gemini/AI Studio 탭만 가볍게 확인한다. manifest 관리 탭은 로딩 완료 상태이고 반복 ping에 응답이 전혀 없을 때만 죽은 확장 컨텍스트 복구용으로 한 번 재주입할 수 있다.
9. 큐도 없고 생성 중도 아닌 숨김 ChatGPT 탭은 짧은 주기 polling/keepalive 대상이 아니다. hidden idle 상태는 긴 주기로 유지한다.
10. 활성 ChatGPT 탭 주입은 사이트 설정 캐시가 늦게 로드되어도 동작해야 한다. ChatGPT 기본 URL은 fallback site로 처리한다.
11. popup 열기 또는 popup에서 후속 지시 전송/삭제를 누른 경우에는 background가 해당 대상 탭 하나만 content script 주입 보장할 수 있다. ChatGPT 대상은 항상 top frame만 확인한다.
12. background 후속 지시 probe는 대기열 확인과 정상 처리 요청만 해야 하며 `forceResume`을 보내면 안 된다. 강제 재개는 사용자가 `즉시 재개`를 직접 누른 경우에만 허용한다.
13. 후속 지시 대기열 전송은 탭당 한 번에 하나만 실행되어야 한다. content script 재주입이나 runtime 메시지 중복으로 같은 문구가 동시에 두 번 enqueue/send되면 안 된다.
14. ChatGPT 응답이 매우 빨라 중지 버튼을 관찰하지 못한 경우에는 새 assistant turn을 응답 시작 보조 신호로 사용해야 한다. 웹 검색/조사 중간 단계는 완료로 처리하지 않고, 최신 assistant turn에 최종 응답 작업 버튼이 생긴 뒤에만 다음 큐로 진행해야 한다.
15. 응답 시작 대기 타이머는 이미 실행 중인 turn completion watchdog의 시작 시각을 뒤로 미루면 안 된다.
16. popup/dashboard의 수동 강제 확인도 ChatGPT에서는 top frame만 확인해야 한다. 수동 버튼이라는 이유로 `allFrames: true`를 쓰면 안 된다.

## 3. 변경 금지 범위

다음 항목은 사용자 승인 없이 변경하지 않는다.

- 주황색 -> 흰색 -> 연두색 배지 흐름
- 흰색의 의미를 GPT 완료 외 다른 상태로 재해석하는 것
- 연두색의 의미를 대기/읽음/아무 질문 없음 외 다른 상태로 재해석하는 것
- `후속 지시 열기` / `항상 열어둘 수 있는 후속 지시 패널` 문구
- `Enter`는 후속 대기, `Ctrl/Cmd+Enter`는 현재 작업 바로 반영으로 분리하는 규칙
- 다중 후속 지시 대기열과 자동 전송 흐름
- 사용자가 런처를 누르기 전에는 후속 지시 패널을 자동으로 열지 않는 것
- ChatGPT 후속 지시 감시를 top frame이 아닌 iframe/전체 프레임 기준으로 넓히는 것
- 큐가 없는 ChatGPT 탭이나 일반 Chrome 탭까지 후속 지시 probe 대상으로 포함하는 것
- `manifest.json`의 content script를 다시 `all_frames: true` 또는 `match_about_blank: true`로 되돌리는 것
- `manifest.json`에 ChatGPT full content script 자동 주입용 `content_scripts` 블록을 다시 추가하는 것 (`src/content/chatgpt-bootstrap.js` top-frame shim만 예외)
- service worker 시작 때 모든 탭을 순회하며 content script를 주입하는 것
- popup 복구 경로를 이유로 전체 Chrome 탭 또는 모든 ChatGPT 탭을 주기적으로 순회하는 것
- background probe에서 `process_steering_queue_now`에 `forceResume`을 붙여 후속 대기를 강제로 깨는 것
- content script 재주입 시 기존 runtime listener가 같은 후속 지시를 다시 enqueue/send할 수 있게 두는 것
- popup/dashboard 강제 확인에서 ChatGPT 프레임 전체를 깨우는 것

## 4. 후속 지시 고급설정

### 기본 원칙
1. 고급설정은 기본 후속 지시 UI를 대체하지 않는다.
2. 고급설정은 사용자가 직접 ON/OFF하는 저장 설정이다.
3. 고급설정이 OFF이면 기존처럼 현재 대화에 후속 지시를 대기열로 보낸다.
4. 고급설정이 ON이면 후속 지시 패널을 더 세로로 길게 보여준다.

### 새 채팅 분산 전송
1. 고급설정 ON 상태에서 기본 전송 버튼은 현재 대화가 아니라 새 ChatGPT 채팅 탭으로 보낸다.
2. 새 채팅 탭 수는 1~8개 사이에서 저장한다.
3. 새 채팅 분산 전송은 ChatGPT에서만 지원한다.
4. 새 채팅 분산 전송은 텍스트 후속 지시만 지원한다.
5. 이미지가 포함된 후속 지시는 기존 현재 대화 전송 흐름을 사용한다.

- Pro의 긴 응답은 시간 경과만으로 완료 처리하지 않는다. 새 응답의 완료 UI와 새 사용자 전송을 확인한 후에만 다음 대기를 실행하고 전송된 ID만 제거한다.
- 같은 탭의 ChatGPT 대화별로 대기·초안·첨부를 보관한다. 다른 대화로 이동할 때는 그 대화의 목록만 보이고, 돌아오면 기존 흐름을 이어간다. 전체 페이지 복구 또는 전송 확인이 불확실한 경우에는 확인 후 ‘다음 보내기’로 재개한다.
- 팝업 최상단의 사용 전환으로 화면 버튼·자동 전송·알림을 멈출 수 있다. 보관된 대기는 유지하며, 탭을 닫으면 해당 탭의 모든 대화 보관 내용을 삭제한다.
