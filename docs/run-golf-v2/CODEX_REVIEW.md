# SportsGang Run + Golf v2 — Codex 독립 검수

검수일: 2026-10-03, Australia/Sydney
**VERDICT: NEEDS_FIXES**
앱 구현 코드는 수정하지 않았다. P1 5건, P2 3건을 확인했다. 기존 테스트의 통과와 제품 요구사항 충족은 구분한다. 미검증 항목은 통과에 포함하지 않는다.

## 1. 검수 대상과 보존 상태

| 항목 | 확인 결과 |
| --- | --- |
| 시작 checkout | /Users/edwardhwang/Desktop/github-repo-only/Sportsgang, feat/run-first-ui |
| 시작 checkout HEAD | ffca063fa3408ee6654980cfd72bf61fd3d0f654 |
| 실제 구현 worktree | /Users/edwardhwang/Desktop/github-repo-only/Sportsgang/.claude/worktrees/run-golf-v2 |
| 실제 구현 branch / HEAD | feat/run-golf-v2 / 8b8afb0524d5da133730562fb04acd1078be5e8d |
| 구현 기준 / merge-base | edfb30fe48eddda76ebc9f347581641f3550ed44 |
| origin | https://github.com/EdwardH-jedi/Sportsgang.git |
| 처음 git status | 시작 checkout: untracked codex-review-prompt.md, todo.md. 구현 worktree: clean |
| 마지막 git status | 시작 checkout: 위 두 입력 파일 + 이번 docs/run-golf-v2/ 검수 산출물만 untracked. staged/unstaged tracked 변경 없음. 구현 worktree: clean |
| 파일 보존 검증 | 시작 checkout tracked 469개, 구현 worktree tracked 569개 SHA256 대조: 변경 0개. 입력 문서도 동일. 양쪽 HEAD/branch/stash 보존 |
| 검수 중 변경 | 시작 checkout의 docs/run-golf-v2/CODEX_REVIEW.md 및 review-evidence/만 추가 |
| 제외한 작업 | checkout/reset/rebase/stash/clean, merge/push/PR, 배포, 운영 DB, 원격 Fly API, EAS/App Store 작업 없음 |

실제 구현이 시작 checkout에 합쳐져 있지 않으므로 nested worktree의 코드를 검수했다. 결과 파일은 사용자가 지정한 시작 checkout에 저장했다. 현재 원격 main의 최신성은 새 fetch로 확인하지 않았다. 위 기준은 로컬 commit 관계로 확인했으며, 구현 당시 fetch 시각은 IMPLEMENTATION_REPORT의 **보고된 과거 사실**이다.

전체 비교 범위는 기준..HEAD의 136개 파일이다: API 20, mobile 65, shared-types 4, docs 46, todo 1. 미커밋 구현은 없었다. 구현 커밋은 15a0f1d → 77ae4c8 → 6400f23 → 0e543f7 → e72476f → 9292445 → 5101b48 → 5c11692 → c0133c2 → 8b8afb0. 커밋된 로그/스크린샷은 과거 증거로 취급하고 아래 검증을 직접 다시 실행했다.

근거: [initial-launch.json](review-evidence/initial-launch.json), [initial-target.json](review-evidence/initial-target.json), [final-source-preservation.json](review-evidence/final-source-preservation.json), [reviewed-diff-paths.txt](review-evidence/reviewed-diff-paths.txt), [worktrees-final.txt](review-evidence/worktrees-final.txt). 산출물 목록과 해시는 review-evidence/manifest.json에 기록했다.

## 2. 주요 결함과 수정 방향

### F1 — P1: 참여 취소 후 재참여가 실제 PostgreSQL에서 500으로 실패

**재현:** 계정 A가 run 또는 golf event 생성 → B join 200 → B leave 200 → B join. 두 종목 모두 실패했다. iPhone 16e에서도 native run을 참여 → My Plans → 탈퇴 → 재참여하여 HTTP 500을 확인했다.

**기대:** 기존 participant 행을 다시 활성화하고 정원/상태를 일관되게 갱신.
**실제:** asyncpg DataError: “can't subtract offset-naive and offset-aware datetimes”. UPDATE의 joined_at은 TIMESTAMP WITHOUT TIME ZONE인데 timezone-aware UTC datetime을 전달한다.

원인: [apps/api/app/services/events.py:410](../../apps/api/app/services/events.py#L410)에서 aware datetime을 대입하지만 [apps/api/app/models/event.py:104](../../apps/api/app/models/event.py#L104)의 joined_at은 timezone 없는 DateTime으로 추론된다. flush는 services/events.py:423. 이 경로는 기준 코드에도 존재한다. 새로 만든 회귀라고 단정하지 않지만, todo의 필수 leave/rejoin 흐름은 충족하지 못한다.

**수정 방향:** DB/model/service의 시간 표현을 하나로 맞춘다. aware UTC로 통일한다면 기존 UTC-naive joined_at의 변환 기준을 명시한 추가 migration을 만들고 ID/관계를 보존한다. naive UTC를 유지한다면 대입 경계에서 명시적으로 정규화한다. 단순 예외 포착으로 200을 반환하면 안 된다. 두 종목의 재참여, 정원 복구, participant 중복 없음까지 PostgreSQL에서 검증한다.

근거: [current-journeys.json](review-evidence/current-journeys.json), [rejoin-initial-failure.log](review-evidence/rejoin-initial-failure.log), [screens/06-native-rejoin-error.png](review-evidence/screens/06-native-rejoin-error.png), [native-ui-snapshots.json](review-evidence/native-ui-snapshots.json). 기존 integration 9개는 이 재참여 경로를 검증하지 않는다. SQLite 통과가 asyncpg의 datetime binding을 보증하지 않는다.

### F2 — P1: 과거 일정 50개가 미래 약속을 My Plans에서 밀어낸다

**재현:** A에게 완료된 과거 run 51개와 미래 run 1개를 준비한다. GET /events?mine=true&limit=50 응답 total=52, items=50이며 미래 run은 없다. offset=50 요청에는 미래 run이 있다. 같은 A의 native My Plans도 미래 group run을 표시하지 않는다.

원인: [apps/mobile/src/hooks/usePlans.ts:152](../../apps/mobile/src/hooks/usePlans.ts#L152)와 :157이 booking/event를 각각 첫 50개만 받고 total/다음 페이지를 버린다. [apps/api/app/services/events.py:319](../../apps/api/app/services/events.py#L319)는 starts_at 오름차순이며 bookings 서비스도 오름차순이다. segmentation을 **잘린 데이터에 적용**하므로 Upcoming이 실제 약속 전체를 반영하지 못한다. My Plans에는 나머지를 가져오는 경로가 없다.

**수정 방향:** Upcoming/Pending/Past의 서버 필터 및 정렬 계약을 정의하거나 각 소스를 끝까지 페이지 처리한다. Upcoming/Pending이 과거 기록 수에 영향받지 않도록 하고 Past는 별도 페이지로 다룬다. limit만 늘리는 수정은 같은 결함을 늦출 뿐이다. booking/event 소스별 오류 표시와 식별자 구분은 유지한다.

근거: [current-journeys.json](review-evidence/current-journeys.json)의 plans_truncation, [screens/02-after-plans-tap.png](review-evidence/screens/02-after-plans-tap.png). booking 쪽 동일 구조는 코드에서 확인했으며 51개 booking fixture로 별도 재현한 것은 아니다.

### F3 — P1: 골프 배우기 추천에서 상대방의 명시적 초보 동반 의사가 생략됨

**실제 API 반례:**

| 사용자 | 입력 |
| --- | --- |
| 요청자 | estimate 30.0, experience=range, intent=[learn_from_experienced] |
| 상대방 | estimate 24.0, experience=regular, intent=[similar_level], tolerance=10.0 |
| 기대 | 상대방이 welcome_beginners 또는 any_level을 명시할 때까지 제외 |
| 실제 | 상대방이 compatible로 반환됨. similar_handicap / more_experienced / 시간 겹침 이유 포함 |

todo.md:248–249는 Learn-from-experienced에 상대의 welcome_beginners 또는 any_level을 요구한다. [apps/api/app/services/compatibility.py:176](../../apps/api/app/services/compatibility.py#L176)은 경험 증거만 확인하고, :194에서 양측의 개별 허용 결과를 조합한다. 상대의 similar_level이 넓은 tolerance로 통과하면 배우기 의사를 수락한 것으로 처리한다. “같은 초보 + similar-only 경험자” 테스트가 좁은 tolerance에서 우연히 제외되는 것만으로는 요구사항이 입증되지 않는다.

**계약 드리프트:** [docs/run-golf-v2/CONTRACTS.md:193](../../docs/run-golf-v2/CONTRACTS.md#L193)도 명시적 수락 조건 없이 경험 증거만 규정한다. 구현 문서의 변경된 규칙을 원래 제품 요구사항의 승인으로 간주할 수 없다.

**수정 방향:** learn_from_experienced branch에 상대의 명시적 welcome_beginners/any_level과 경험 증거를 모두 요구한다. 양측 similar tolerance, 한쪽 any_level이 상대 제한을 무효화하지 않는 조건은 유지한다. 넓은 tolerance의 similar-only 반례, welcome/any 전환 대조군, 역방향 피드를 검증하고 CONTRACTS와 todo를 일치시킨다.

근거: [current-journeys.json](review-evidence/current-journeys.json)의 golf_consent_counterexample. 실제 PG + ASGI HTTP 응답으로 확인했으며 mock 추천 결과가 아니다.

### F4 — P1: 설정을 저장해도 이미 로드된 추천과 이유가 갱신되지 않는다

**재현:** 준비된 running feed 로드 → 자신의 페이스를 다른 구간으로 저장 → 같은 sport/filter로 loadFeed. 실제 profile/explore store를 가져온 독립 Jest 테스트에서 예상 GET 2회가 실제 1회다. 새 결과 대신 기존 카드/호환 이유가 남는다. force refresh 대조군은 새 요청을 보낸다.

원인: [apps/mobile/src/stores/profile.ts:175](../../apps/mobile/src/stores/profile.ts#L175)의 upsert는 sportProfiles만 바꾸며 feed를 invalidate하지 않는다. [apps/mobile/src/screens/profile/EditSportPreferencesScreen.tsx:89](../../apps/mobile/src/screens/profile/EditSportPreferencesScreen.tsx#L89)는 저장 후 goBack만 한다. [apps/mobile/src/stores/explore.ts:187](../../apps/mobile/src/stores/explore.ts#L187)은 같은 sport/filter의 ready feed를 그대로 재사용하고, [apps/mobile/src/hooks/useDiscovery.ts:32](../../apps/mobile/src/hooks/useDiscovery.ts#L32)에는 프로필 revision 의존성이 없다. 삭제 경로도 동일한 누락이다.

**수정 방향:** sport별 preference revision 또는 명시적 invalidation을 추가한다. 설정 생성/수정/삭제가 관련 feed generation을 무효화하고 복귀 시 다시 조회하게 한다. 단순 상세/back에서는 선택 필터와 위치를 유지하되 설정 변경 후에는 새로운 서버 판단과 이유를 사용해야 한다.

근거: [cache.acceptance.test.js](review-evidence/cache.acceptance.test.js), [cache-acceptance.log](review-evidence/cache-acceptance.log). transport는 mock이고 **실제 Zustand store 동작**을 검증한 것이다. native Partners 화면에서 해당 편집 복귀 경로를 별도로 재현했다고 주장하지 않는다.

### F5 — P1: 1:1 약속 시간이 API 프로세스의 시간대에 따라 11시간 달라짐

**재현:** 현재 BookingComposer와 같은 offset 없는 starts_at=2026-10-05T09:00:00 payload를 동일 DB에 두 프로세스 TZ로 전송한다.

| API 프로세스 TZ | 상태 | 저장/응답 starts_at |
| --- | --- | --- |
| UTC | 201 | 2026-10-05T09:00:00Z |
| Australia/Sydney | 201 | 2026-10-04T22:00:00Z |
| 두 TZ의 명시적 Z payload 대조군 | 모두 201 | 동일 UTC 값 |

원인: [apps/mobile/src/screens/bookings/BookingComposerScreen.tsx:94](../../apps/mobile/src/screens/bookings/BookingComposerScreen.tsx#L94)가 offset을 붙이지 않는다. [apps/api/app/services/bookings.py:126](../../apps/api/app/services/bookings.py#L126)은 과거 시간 검증에만 naive를 UTC로 가정하고, :153에서는 원본 datetime을 그대로 저장한다. DB driver의 naive timestamp 처리에 프로세스 TZ가 개입한다.

IMPLEMENTATION_REPORT는 기존 composer의 device-local time을 제한으로 밝히지만, 이 결과는 API host TZ가 약속 시각을 바꾸는 결함까지 포함한다. 기준과 동일한 기존 코드이므로 새 회귀로 분류하지 않는다. 다만 이번 범위의 1:1 제안/확정, My Plans, UTC/Sydney 시간 계약에서 남겨둘 수 없는 문제다.

**수정 방향:** composer에서 Sydney wall time을 aware UTC ISO로 변환한다. 서버는 명시적 offset을 요구하거나 구버전 naive payload의 해석 시간대를 계약으로 고정하고 저장 전 정규화한다. host/device TZ에 의존하지 않게 하고 DST gap/overlap, 날짜 경계, 종료 시각을 검증한다.

근거: [probe_booking_payload.py](review-evidence/probe_booking_payload.py), [booking-payload-results-UTC.json](review-evidence/booking-payload-results-UTC.json), [booking-payload-results-Australia-Sydney.json](review-evidence/booking-payload-results-Australia-Sydney.json). 운영 서버의 시간대를 확인하거나 운영 장애를 재현한 것은 아니다.

### F6 — P2: 페이스를 지우면 엄격 필터가 켜진 채 비활성화되어 해제 불가

설정에서 두 페이스 경계를 null로 지우고 social로 저장해도 strictPace=true가 남는다. [apps/mobile/src/screens/explore/ExploreScreen.tsx:219](../../apps/mobile/src/screens/explore/ExploreScreen.tsx#L219)는 selected=true이면서 disabled=!ownHasPaceRange로 만든다. 사용자가 칩을 눌러 해제할 수 없고 강제 새로고침은 서버의 “viewer pace range required” 422를 받게 된다.

독립 store acceptance 테스트가 expected false / actual true로 실패했다. 해당 422 서버 조건은 직접 실행한 test_discovery_v2.py의 strict pace 테스트로 확인했다.

**수정 방향:** 페이스 capability가 사라지면 필터를 off로 정규화하고 feed를 invalidate한다. 선택된 필터는 capability가 없어도 해제할 수 있게 한다. F4와 같은 mobile 상태 담당자가 처리한다.

### F7 — P2: running/tennis 1:1 약속 상세가 Golf로 표시됨

[apps/mobile/src/screens/bookings/BookingDetailScreen.tsx:198](../../apps/mobile/src/screens/bookings/BookingDetailScreen.tsx#L198)은 gym 이외의 모든 sport를 Golf로 표시한다. native Running chat → 약속 제안 → 상세에서도 Golf 표시를 관찰했다. underlying booking.sport=running은 유지된다. 기준 코드와 동일한 표시 결함이다.

**수정 방향:** 공통 sport label mapping으로 네 종목을 처리한다. Running/Tennis 상세 label regression을 추가한다. court 중심 장소 picker는 보고서가 인정한 후속 범위이지만 잘못된 sport 표시는 별도 수정해야 한다.

### F8 — P2: 참여 후 Explore 세션 목록의 정원/참여 상태가 오래된 값으로 남음

native에서 Bob이 capacity=2인 golf round 생성 → Alice가 마지막 자리 참여 → 상세는 Full/2 of 2 → Back. 같은 목록 카드는 “1 spot left”를 계속 표시하며 참여 상태가 반영되지 않는다.

[apps/mobile/src/hooks/useEvents.ts:61](../../apps/mobile/src/hooks/useEvents.ts#L61)은 query 변경/마운트 때만 refresh하고, :98의 join은 detail 상태만 갱신한다. [apps/mobile/src/screens/explore/ExploreScreen.tsx:129](../../apps/mobile/src/screens/explore/ExploreScreen.tsx#L129)에는 복귀 시 invalidation/focus refresh가 없다.

**수정 방향:** join/leave/cancel/create 후 목록 캐시를 해당 event 단위로 갱신하거나 복귀 시 새 데이터를 가져온다. 필터를 유지하고 늦은 응답 guard를 보존한다. 같은 화면의 session list는 기본 첫 20개만 읽고 추가 페이지가 없어 확장성도 확인이 필요하다. 이번에는 21개 public session 누락 fixture를 따로 실행하지 않았다.

근거: [screens/15-native-alice-golf-full.png](review-evidence/screens/15-native-alice-golf-full.png)와 [screens/16-native-stale-golf-list.png](review-evidence/screens/16-native-stale-golf-list.png), [native-session-api-results.json](review-evidence/native-session-api-results.json).

## 3. todo / IMPLEMENTATION_REPORT / 코드 대조

“구현됨”은 해당 구조가 있다는 뜻이고, “PASS”는 명시한 검증 계층에서 직접 확인했다는 뜻이다.

| 요구사항 | 구현 상태 | 현재 검증/판정 |
| --- | --- | --- |
| Wave 0: 격리 branch, 기준, ownership | 구현됨 | 로컬 commit/worktree 관계 확인. 시작 checkout과 마케팅 앱을 섞지 않음. 현재 원격 최신 main 여부는 NOT_RUN |
| Wave 1: 추가 migration, 기존 gym/tennis 보존 | 구현됨 | 새 PG →0016, 데이터 있는 0015→0016 모두 PASS. 9개 테이블 기존 열/행 hash 동일 |
| 기존 계정/ID/관계/기록 | 구현됨 | upgrade 후 같은 user ID 로그인, 기존 match/message/confirmed booking/event 접근 PASS |
| v2 필드 omit/null/빈 값, 버전, DTO 변환 | 구현됨 | profile/API/mobile/shared 테스트 PASS. 실제 PG에서 omit=preserve, partial null pace=422, 동일 profile ID 유지 PASS |
| handicap source/plus/pace 숫자 의미 | 구현됨 | native +2.1→-21, self-reported label, 5:30–6:15→330/375 PASS. parse/validation 테스트 PASS |
| 미설정≠any, 사진/소개 선택 | 구현됨 | 업그레이드 NULL 유지, setup flag/no compatibility PASS. 사진/소개 없는 계정으로 main tabs 접근 PASS. **신규 전체 native onboarding은 미완료** |
| Wave 2: 양방향 골프 의사 | 부분 충족 | 기본 양방향/숫자 tolerance/any 테스트 PASS, 명시적 초보 수락 반례 FAIL(F3), CONTRACTS 드리프트 |
| running overlap/general vs strict/session pace 구분 | 구현됨 | 실제 실행한 pure/API/client 테스트 PASS. unknown은 unverified/엄격 제외. 필터 capability 변경 FAIL(F6) |
| self/inactive/양방향 block 제외 | 구현됨 | source + API 테스트 PASS. native block/report 액션은 NOT_RUN |
| cursor 다음 페이지/action 뒤 후보/중복 | 구현됨 | 실제 PG integration cursor test PASS, 실제 client store append/dedupe mock transport 테스트 PASS |
| 느린 sport 응답/오류/action sport/account reset | 구현됨 | 실제 store 테스트 PASS. native offline/느린 요청 주입은 NOT_RUN |
| 설정 변경 후 추천 이유/후보 일치 | 부분 충족 | independent acceptance FAIL(F4), 수동 force refresh control PASS |
| bounded 200 pool/total 정직성 | 구현됨 | pool_limit/total이 pool 내 eligible 수이며 UI에 newest 200 제한 표시. 완전한 전체 사용자 검색으로 판정하지 않음 |
| Wave 3: Explore/My Plans/Chats/Profile, light theme | 구현됨 | 두 iOS에서 탭/상세 이동과 사진 없는 fallback 확인. 레거시 tennis/annandale rank foreground 호출 제거 확인 |
| 신규/기존 사용자 setup | 부분 검증 | setupFlow 15개 등 client tests PASS, native 기존 sport preferences 저장 PASS. 새 identity→sports→availability 전체 native 완료 BLOCKED_ENV |
| 큰 글꼴/작은 화면/키보드 | 부분 검증 | 390×844 iPhone 16e accessibility-large에서 run editor 입력/scroll/save, 실제 software keyboard 표시 PASS(해당 화면 한정). 전체 폼/VoiceOver/대비 최종 gate 미검증 |
| Wave 4: run/golf 세션별 필드 | 구현됨 | native run/golf 생성, API readback, course/9홀/3500 cents/Sydney 시간/host declaration PASS |
| 두 계정 run join→plans→leave | 구현됨 | native Bob + API A/B에서 PASS. leave→rejoin FAIL(F1) |
| 골프 마지막 자리/추가 거절/duplicate | 구현됨 | native 2명 Full, outsider 실제 API 422, duplicate 409 PASS. leave→rejoin FAIL(F1) |
| 실제 PostgreSQL 정원/취소 경쟁/행 잠금 | 구현됨 | integration 9개 모두 실행, capacity race/duplicate/cancel race/lock-wait PASS. rejoin을 포함한 전체 lifecycle PASS는 아님 |
| host/attendance/private 권한 | 구현됨 | API 단위 테스트 PASS(SQLite). 실제 PG HTTP로 outsider message403/booking404/cancel403/attendance404 확인. 모든 native attendance/private path를 실행한 것은 아님 |
| My Plans 출처/상태/부분 오류 | 부분 충족 | client segmentation/ID collision/partial failure/retry/focus tests PASS. 전체 약속 수집 FAIL(F2) |
| UTC/Sydney/DST/기기 시간대 | 부분 충족 | group native DST 당일 생성 UTC readback, Sydney time tests16개 PASS. 1:1 composer FAIL(F5). 실제 다른 TZ device 미검증 |
| 골프 티타임 사실성/가짜 group chat 제거 | 구현됨 | native “host says”, 예약/결제 미연동 설명 확인. 미작동 group chat 버튼 없음 |
| 기존 match/chat/booking/과거 기록 | 부분 충족 | 실제 PG mutual like→match→message→propose→confirm, legacy upgrade 접근 PASS. native Chats/제안/상세 이동 확인. 시간/종목 label FAIL(F5/F7) |
| Apple/logout/report/block/deletion/push | 부분 검증 | 관련 기존 단위 테스트 PASS, native login/logout PASS. Apple/push/native deletion/report/block 완료는 미검증 |
| 출시 식별자/의존성/마케팅 범위 | 구현됨 | config/dependency/lockfile diff 없음. 앱 코드 외 출시/마케팅 변경 없음 |
| Wave 5 “all” 완료/DoD | **충족하지 못함** | 기존 checks 재실행 PASS지만 필수 반례/제품 흐름 실패 및 native 공백이 남음 |

IMPLEMENTATION_REPORT의 “all required repository checks pass”는 이번 재실행으로 해당 명령 범위에서 재확인했다. 그러나 Wave 2/4의 “all”, todo의 체크 완료를 최종 제품 PASS로 받아들일 수 없다. rejoin, 기록 50개 초과, 넓은 golf tolerance에서의 explicit consent, profile-edit cache/strict filter 전환이 빠져 있다. report가 이미 공개한 composer/keyboard/Apple 등의 제한도 검수 요구사항의 면제 승인은 아니다.

## 4. 직접 실행한 명령과 결과

모든 최종 검사 대상 HEAD는 8b8afb0이다. command/cwd/exit/elapsed/head는 각 .json, 원문은 같은 이름 .log에 저장했다. 직접 실행한 결과를 Claude의 과거 증거와 합산하지 않았다.

| 명령/검사 | exit | 실제 결과 / skip |
| --- | --- | --- |
| npm ci --offline | 0 | lockfile 기반 설치 |
| npm run lint --workspace @protin/mobile | 0 | lint PASS |
| npm run typecheck --workspace @protin/mobile | 0 | PASS |
| shared-types typecheck, --tsBuildInfoFile 외부 임시 경로 | 0 | PASS, tracked tsbuildinfo 보존 |
| mobile test:ci --runInBand (첫 시도) | 1 | Watchman sandbox 권한 오류로 테스트 실행 전 실패. 제품 FAIL로 계산하지 않음 |
| mobile test:ci --runInBand --watchman=false | 0 | **58 suites / 811 tests passed, skipped 0** |
| uv sync --frozen --dev --offline | 0 | frozen API 환경 설치 |
| uv run --offline ruff check . | 0 | PASS |
| uv run --offline ruff format --check . | 0 | PASS |
| uv run --offline pytest -q | 0 | **729 passed, skipped 0**, warnings 802 |
| fresh alembic upgrade head | 0 | 빈 실제 PG DB →0016 |
| uv run --offline pytest tests_integration -q | 0 | **9 passed, skipped 0**, warnings 15. 실제 PG/Redis |
| baseline0015 생성 + legacy-seed-complete | 0 / 0 | 기준 commit 코드로 실제 old-schema fixture 생성 |
| populated-upgrade-complete | 0 | 0015→0016, retained hashes equal=true |
| upgraded-login | 0 | 기존 로그인/관계/기록 + v2 update/old client preserve |
| independent-journeys | 0 | 스크립트 수집 완료. **내용에 제품 FAIL(F1/F2/F3)이 있음 — 전체 PASS 아님** |
| 외부 cache.acceptance Jest | 1 | **2 failed / 1 passed / 3 total, skipped 0**. F4/F6, control PASS |
| booking payload, process TZ UTC/Sydney | 0 / 0 | probe 완료. 비교 결과 제품 FAIL(F5) |
| expo export --platform ios, 외부 output-dir | 0 | Hermes iOS bundle. native 실행 증거와 별도 |
| native-session API readback | 0 | native 생성 run/golf 필드 및 outsider full rejection PASS |
| git diff --check 기준..HEAD | 2 | todo.md:567의 EOF blank line 한 건. 앱 기능 실패와 구분 |

핵심 로그: [mobile-tests-no-watchman.log](review-evidence/mobile-tests-no-watchman.log), [api-tests.log](review-evidence/api-tests.log), [integration-tests.log](review-evidence/integration-tests.log), [cache-acceptance.log](review-evidence/cache-acceptance.log), [populated-upgrade-complete.log](review-evidence/populated-upgrade-complete.log), [upgraded-login.log](review-evidence/upgraded-login.log), [ios-export.log](review-evidence/ios-export.log).

초기 harness에서 outsider 권한의 기대 status(403 대신 concealment 404)와 event 응답 field명(joined_count 대신 participant_count)을 잘못 가정한 것은 수정한 **검수 스크립트 문제**다. 최종 결과로 앱 결함에 포함하지 않았다. 일부 초기 migration 시도는 fixture에 identity_preferences가 없어 충분하지 않았으며, complete fixture로 별도 DB에서 최종 검증했다. 저장된 초기 실패 로그는 최종 PASS 증거로 사용하지 않는다.

### 실제 DB 증거

이번 검수 전용 Docker project: codex-sg-review-20261003. PostgreSQL 16/Redis 7, 127.0.0.1:55443/56443. codex_review와 codex_review_upgrade2 사용. PG 데이터는 tmpfs이고 사용자 볼륨은 사용하지 않았다. SQLite test DB와 실제 PG integration을 구분했다. 외부 provider key는 빈 값이며 실제 Apple/push/Places 호출을 통과로 취급하지 않았다.

populated upgrade 전후 동일한 기존 데이터:

| 테이블 | 행 수 |
| --- | --- |
| users / user_profiles | 각 3 |
| sport_profiles | 8 (gym/tennis/running/golf 각 두 사용자) |
| identity_preferences | 2 |
| matches / messages / bookings / events | 각 1 |
| event_participants | 2 |

각 테이블의 **모든 기존 열**을 순서가 고정된 row hash로 대조했다. ID/FK와 필드값이 같으며 기존 sport_profiles의 preferences_version은 NULL이었다. upgrade 이후 실제 로그인과 기록 조회도 확인했다. 원문 password hash/token을 증거 파일에 덤프하지 않았다. [upgrade-retained-hashes.json](review-evidence/upgrade-retained-hashes.json), [upgraded-login-results.json](review-evidence/upgraded-login-results.json).

정원 경쟁은 마지막 1자리에 3명 경쟁을 5회 반복하는 테스트, 같은 계정 중복 join, host cancel vs join 반복, row lock 대기 증명, 두 계정 run/plans 흐름을 포함한다. **실제 PostgreSQL test 결과**이며 SELECT FOR UPDATE 소스만 보고 판정한 것이 아니다.

## 5. 네이티브 확인과 미검증 항목

Xcode 26.6 / iOS 26.3 simulator / 기존 설치 Expo Go 54.0.7에서 현재 source를 offline Metro(8087), localhost API(8023)에 연결했다. bundle ID host.exp.Exponent는 Expo Go 런타임이고 SportsGang의 출시 build를 검증한 것은 아니다. 별도 dev-client/EAS build는 만들지 않았다.

| 기기 | UDID | 화면 |
| --- | --- | --- |
| iPhone 17 Pro | EC0E6542-A25C-4EBC-ACFF-F5FF62723171 | 402×874 pt / 1206×2622 px |
| iPhone 16e | 3D2AF32A-3288-465B-8B27-92D087A382B2 | 390×844 pt / 1170×2532 px |

직접 실행: seeded Alice/Bob native 로그인, Explore 두 종목, Chats/booking composer/detail 이동, native run 생성 → Bob 참여 → Bob My Plans → leave → rejoin 500, native golf 생성 → Alice 마지막 자리 참여/Full, Profile/legacy sport 표시, run preferences 저장, plus handicap 저장/표시, logout, 신규 empty-profile 로그인 후 Step1 진입. 사진/소개 없는 기존 fixture 계정의 main tabs 진입은 확인했다.

native run은 Sun 4 Oct 6:30 Sydney가 2026-10-03T19:30:00Z로 저장됐고 golf는 8:00 Sydney가 2026-10-03T21:00:00Z로 저장됐다. native 상세와 API readback을 대조했다. [native-session-api-results.json](review-evidence/native-session-api-results.json), [native-preference-api-results.json](review-evidence/native-preference-api-results.json).

16e의 accessibility-large에서 run preferences 입력값이 읽히고 software keyboard 위로 scroll하여 Save preferences를 눌러 저장했다. 키보드는 I/O → Keyboard → Toggle Software Keyboard로 실제 표시했다. 입력은 숫자/콜론 키가 있는 키보드였고 저장 결과 330/375초가 API에 남았다. **모든 폼의 keyboard-safe/large-text PASS로 확대하지 않는다.** 검수 후 글꼴은 원래 large로 복원했다. 스크린샷별 장면/기기/source는 [screens/manifest.json](review-evidence/screens/manifest.json)에 기록했다.

| 항목 | 상태와 이유 | 다음 재현 절차 |
| --- | --- | --- |
| 신규 전체 native 온보딩 | **BLOCKED_ENV(자동화 입력/AX 제한)**. profile 없는 새 local 계정 로그인→Step1, 긴 이름 입력까지 진행. Birth year 모달을 AX가 옵션별 버튼 대신 하나의 긴 요소로 반환하며 좌표 선택도 반영을 확인하지 못함. sports/availability 완료 아님 | local 환경 재생성 → native 빈-profile 계정 로그인 → Birth year/Sydney suburb 직접 선택 → Running Social/pace blank → availability → Finish → 사진/소개 없이 main tabs 및 재실행 |
| Select/VoiceOver 접근성 | **추가 확인 필요**. CUA와 simulator snapshot이 modal의 option 버튼을 개별 노출하지 않음. 실제 VoiceOver 선택 실패로 확정하지 않음 | VoiceOver로 Birth year/Suburb 열고 각 option/닫기/선택 완료 확인. Select.tsx:101–102의 nested Pressable grouping도 검토 |
| 다른 TZ의 실제 기기 | **NOT_RUN**. process TZ unit tests와 group DST native readback은 있지만 simulator TZ 자체를 바꾼 검증 없음 | Seoul/Los Angeles device TZ에서 동일 group/booking 생성·표시, 자정과 DST gap/overlap |
| Apple sign-in | **BLOCKED_ENV**. 이 isolated env는 실제 Apple credentials/signing/dev-client 제공 안 함. native 버튼과 단위 테스트만 확인 | signing 가능한 native build + test Apple 계정 → 첫 로그인/재로그인/연결/실패 처리 |
| 실제 push | **BLOCKED_ENV**. Expo Go 제한, 실제 provider 비활성 | dev-client/실기기 permission→수신→탭 navigation, foreground/background |
| Android / physical iOS / dev-client | **BLOCKED_ENV**. 이번 연결 환경은 두 iOS Expo Go simulators | 해당 runtime/build로 동일 journey와 layout 재검증 |
| native report/block/account deletion 완료 | **NOT_RUN**. API/client 기존 tests 통과와 UI entry point 유지 확인에 한정 | 새 disposable local 계정으로 report/block/unblock/deletion confirmation/권한/재로그인 거절 |
| native offline/실패/partial source 상태 | **NOT_RUN**. mock transport tests는 통과하지만 device network failure 주입 없음 | 한 endpoint만 실패시 My Plans의 성공 소스 유지/retry, offline 복귀/느린 sport 전환 |
| 전체 화면 대비/모든 large text/긴 이름 카드 | **부분 검증**. theme test/source와 일부 native 화면 확인. 긴 이름 Step1 입력, no-photo cards는 확인했지만 전체 화면의 최종 gate는 없음 | 양 기기/large text/긴 이름으로 onboarding·partner/detail·session forms·plans·chat 전체 시각 확인 |

onboarding 선택 모달은 [screens/17-native-onboarding-birth-picker.png](review-evidence/screens/17-native-onboarding-birth-picker.png)와 [onboarding-blocked-ui.json](review-evidence/onboarding-blocked-ui.json)에 남겼다. source의 각 option에 accessibilityRole이 있어도 실제 native tree에서는 선택 단위가 보이지 않으므로 source 구조만으로 접근성 PASS를 주지 않았다. 이 관찰을 product defect로 단정하거나 완료된 onboarding으로 계산하지 않는다.

## 6. 수정 우선순위와 소유권 경계

**P1은 통합/출시 승인 전에 수정하고 직접 재검증한다.** P2도 잘못된 상태/종목 표시를 막도록 같은 후속 작업에 포함하는 것이 좋다. 이 검수에서는 수정하지 않는다.

| 순서 | 작업/담당 경계 | 완료 기준 |
| --- | --- | --- |
| Wave A: 계약 고정 | API/contract 담당: participant timestamp, 1:1 input timezone, golf learn acceptance를 CONTRACTS에 명시. shared DTO 변경은 단일 담당 | todo와 계약 일치. legacy 처리와 migration 기준 확정 |
| Wave B1: API lifecycle | API events 담당: F1, 필요한 additive migration, PG regression | run/golf join→leave→rejoin/정원/ID 보존 + 기존 races PASS |
| Wave B2: API matching | compatibility/discovery 담당: F3. B1과 파일 경계 분리 | 넓은 tolerance의 similar-only 제외, welcome/any 허용, reverse feed PASS |
| Wave C1: Mobile 상태 | profile/explore store + ExploreScreen/useEvents 단일 담당: F4/F6/F8 | save/clear/delete/back, strict off, stale response guard, 목록 Full/참여 상태 PASS |
| Wave C2: My Plans | usePlans/MyPlansScreen 및 API list 계약 담당: F2. Explore 파일은 건드리지 않음 | 51개 이상의 history 뒤 upcoming/pending booking/event 유지, 출처별 오류/페이지 PASS |
| Wave C3: Booking | API bookings + composer/time helper 담당: F5/F7. Wave A 시간 계약을 먼저 사용 | API TZ/device TZ와 무관한 동일 UTC, DST/날짜 경계, 네 종목 label PASS |
| Wave D: 독립 QA | 새 HEAD/source hash 고정 후 검수 담당 | 이번 반례 전부 통과 + 필수 native/upgrade/PG gate. 미검증 항목은 계속 구분 |

ExploreScreen은 필터와 SessionsView가 한 파일이므로 C1의 한 담당자가 소유한다. CONTRACTS/shared DTO를 여러 수정 작업이 동시에 바꾸지 않는다. 기존 문제(F1/F5/F7)를 신규 회귀와 혼동하지 않고 수정 책임/수용 기준으로 관리한다. 이번 작업은 planning/review 역할을 지켰으며 앱 파일에 패치를 만들지 않았다.

## 7. 증거 재실행과 환경 정리

review-evidence/run_checks.py에 cwd/env/명령을 모았다. 모든 연결은 리뷰용 localhost DB/API를 사용한다. compose.yml은 이번 격리 구성을 보존한 파일이며 password/SECRET은 사용자의 비밀이 아닌 폐기 가능한 로컬 fixture 값이다. 운영 환경으로 바꿔 실행하지 않는다.

대표 재실행:

```sh
# 시작 checkout에서 검수용 서비스만 시작
docker compose -p codex-sg-review-20261003 -f docs/run-golf-v2/review-evidence/compose.yml up -d
python3 docs/run-golf-v2/review-evidence/run_checks.py api
python3 docs/run-golf-v2/review-evidence/run_checks.py integration

# 모바일 gate는 실제 구현 worktree에서 실행
cd .claude/worktrees/run-golf-v2
npm run test:ci --workspace @protin/mobile -- --runInBand --watchman=false
```

F1/F2/F3는 probe_journeys.py를 run_checks.ENV 및 PYTHONPATH=실제 target/apps/api로 실행한다. current 모드는 실패를 잡아 JSON에 기록하기 때문에 exit0만 보지 말고 run_leave_rejoin/golf_leave_rejoin, plans_truncation, golf_consent_counterexample을 검사해야 한다. F4/F6는 저장된 jest.review.config.js + cache.acceptance.test.js로 재현한다. F5는 같은 ENV에 TZ=UTC / Australia/Sydney를 각각 설정하여 probe_booking_payload.py를 실행하고 UTC 결과를 비교한다. 명령의 절대 경로/실제 env 구성은 .json과 run_checks.py에 있다.

구버전 upgrade는 baseline commit을 /private/tmp의 별도 archive로 풀고 **새 전용 DB**를 0015까지 올린 뒤 legacy 모드로 fixture를 만든다. verify_upgrade.py가 retained columns hash를 읽고 target migration을 적용해 비교한다. 같은 DB를 이미 head까지 올린 뒤 전/후 비교했다고 하지 않는다. upgraded-login probe는 완료 fixture DB(codex_review_upgrade2)를 대상으로 한다.

검수 끝에 직접 띄운 API/Metro를 정상 종료했고 codex-sg-review-20261003 컨테이너/네트워크만 compose down으로 제거했다. **down -v는 실행하지 않았다.** 사용자/구현자의 다른 서비스와 볼륨은 건드리지 않았다. PG tmpfs fixture는 종료와 함께 폐기되었고 재현 스크립트·결과·hash·스크린샷이 남는다. 기존 Expo Go와 booted simulator는 설치/삭제/erase하지 않았으며, simulator 화면에는 검수 계정/마지막 검수 단계가 남아 있다. [runtime-stop.json](review-evidence/runtime-stop.json), [teardown.json](review-evidence/teardown.json).

최종 보고서 판정은 **NEEDS_FIXES**이다. 기존 test suite 통과, migration 보존, PostgreSQL race 통과는 유효한 증거지만 위 제품 실패와 native 공백을 상쇄하지 않는다.


## 8. GitHub 반영 범위 (후속 사용자 요청)

검수 완료 후 사용자가 GitHub push를 요청했다. 이에 따라 검수 대상인 `feat/run-golf-v2`에 이 보고서와 `review-evidence/`만 추가하여 커밋·푸시한다. 검수 프롬프트의 push 제외 지시는 이 후속 요청으로 변경되었으며, **앱 코드 수정 금지 범위는 유지**한다. 구현 결함은 수정하지 않았고 판정은 계속 **NEEDS_FIXES**다. main merge, PR 생성, 배포는 하지 않는다.

이 문서의 초기/종료 상태와 테스트 HEAD는 **검수 당시 상태**다. 보고서 추가 커밋은 8b8afb0 뒤에 붙는 문서 커밋이며 앱/API/shared 소스는 검수한 그대로다. 시작 checkout의 원본 보고서와 입력 문서는 보존한다. 기존 구현 커밋을 포함한 브랜치를 원격에 생성하되 이번 신규 변경은 검수 산출물뿐이다.

GitHub에서 보고서·증거·코드 링크를 열 수 있도록 이 복사본의 링크를 상대 경로로 바꿨다. 재현 스크립트는 원래 nested worktree 또는 구현 브랜치의 일반 clone에서 대상 경로를 찾도록 정리했다. `review-time-manifest.json`은 최초 검수 원본의 해시이고 `manifest.json`은 게시할 파일의 해시다. 원래 검사 로그/결과/스크린샷은 변경하지 않았다.

GitHub의 이 브랜치를 일반 clone한 경우 위 재실행 예의 `cd .claude/worktrees/run-golf-v2` 대신 레포 루트에서 명령을 실행한다. 폐기된 native fixture의 event ID를 사용하는 `probe_native_results.py`는 새 native journey에서 생성한 ID로 바꿔야 한다. 과거 ID만으로 현재 native 흐름이 검증됐다고 보지 않는다. 앱 소스 변경이 없어 전체 테스트는 반복하지 않고, 게시용 경로 정리 후 acceptance probe를 다시 실행했고 동일한 **2 FAIL / 1 PASS, skipped 0**를 재현했다(exit 1). 이는 F4/F6가 여전히 존재한다는 증거다. 명령·원문은 [publication-acceptance.json](review-evidence/publication-acceptance.json), [publication-acceptance.log](review-evidence/publication-acceptance.log)에 기록했다.

게시 전 `git diff --cached --check`는 원문 Jest 로그 등의 trailing whitespace/EOF blank line 때문에 exit 2였다. 원문 증거의 해시를 보존하려고 로그를 정리하지 않았다. 보고서/재현 스크립트/JSON 구성 파일에 대한 별도 whitespace 검사는 통과했다. 이 문서 검사는 앱 제품 PASS를 뜻하지 않는다.
