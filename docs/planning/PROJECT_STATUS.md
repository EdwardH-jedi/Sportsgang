# Protin — Project Status Report

> **Historical snapshot (Wave 8, 2026-04-08) — out of date.** The project has since
> grown well beyond this report (challenges, battles/events, tournaments, rank and
> honour system, venue/Places search, Apple auth, token encryption, CI, mobile
> tests). For the current state see [README.md](../../README.md) and
> [docs/PORTFOLIO_FACTS.md](../PORTFOLIO_FACTS.md).

> Generated: 2026-04-08 | Branch: `feature/wave-8-staging-readiness`

---

## 1. 프로젝트 구조

```
protin/
├── apps/
│   ├── api/                            FastAPI 백엔드 (Python 3.12)
│   │   ├── alembic/                    DB 마이그레이션 (4개 버전)
│   │   │   └── versions/
│   │   │       ├── 0001_users_and_profiles.py
│   │   │       ├── 0002_discovery_actions_and_matches.py
│   │   │       ├── 0003_messages_and_bookings.py
│   │   │       └── 0004_google_calendar_notifications_safety.py
│   │   ├── app/
│   │   │   ├── core/                   설정·보안 (config.py, security.py)
│   │   │   ├── db/                     SQLAlchemy 세션, Redis 클라이언트
│   │   │   ├── models/                 ORM 모델 14개 (user, profile, booking …)
│   │   │   ├── routers/                API 라우터 9개
│   │   │   ├── schemas/                Pydantic 요청/응답 스키마
│   │   │   ├── services/               비즈니스 로직 8개 모듈
│   │   │   └── main.py                 FastAPI 진입점
│   │   ├── tests/                      pytest 스위트 (11개 파일)
│   │   ├── worker.py                   알림 백그라운드 워커
│   │   ├── pyproject.toml
│   │   └── Dockerfile                  멀티스테이지 빌드
│   └── mobile/                         Expo React Native 앱
│       ├── src/
│       │   ├── components/             공통 UI 컴포넌트 (Screen.tsx)
│       │   ├── hooks/                  커스텀 훅 (useDiscovery.ts)
│       │   ├── navigation/             React Navigation 설정
│       │   ├── screens/                도메인별 스크린 14개
│       │   ├── stores/                 Zustand 스토어 (auth, profile)
│       │   ├── lib/                    유틸리티 (api, calendar, notifications, diagnostics)
│       │   └── theme/                  디자인 토큰 (colors, spacing, typography)
│       └── app.config.js               동적 Expo 설정 (env 읽기)
├── packages/
│   └── shared-types/                   API↔모바일 공유 TypeScript 타입 (12개 파일)
├── infra/
│   ├── nginx/                          리버스 프록시 설정
│   └── scripts/                        배포 스크립트 (deploy, health-check, setup, backup, restore)
├── docs/                               알파·스테이징·계약 문서
├── docker-compose.yml                  로컬 개발 인프라 (postgres, redis)
├── docker-compose.staging.yml          스테이징 전체 스택
├── .env.example                        환경변수 소스 오브 트루스
├── CLAUDE.md                           팀 Claude 가이던스
└── AGENTS.md                           Codex 가이던스
```

### 디렉토리별 역할 요약

| 디렉토리 | 역할 |
|---|---|
| `apps/api` | FastAPI REST API, DB 모델, 비즈니스 로직, 마이그레이션 |
| `apps/mobile` | Expo RN 앱 — 스크린, 훅, 상태 관리, API 클라이언트 |
| `packages/shared-types` | API↔앱 계약 타입 (UUID, PartnerCard, Booking 등) |
| `infra/` | nginx 설정, 배포·백업·헬스체크 쉘 스크립트 |
| `docs/` | 알파 문서, API 계약서, 스테이징 가이드 |

---

## 2. 기술 스택

### 프론트엔드 (Mobile)

| 항목 | 버전 |
|---|---|
| Expo | ~52.0.20 |
| React | 18.3.1 |
| React Native | 0.76.3 |
| TypeScript | ^5.6.3 |
| React Navigation (native-stack + bottom-tabs) | ^6.x |
| Zustand | ^5.0.0 |
| expo-secure-store | ~14.0.0 |
| expo-calendar | ~13.0.2 |
| expo-notifications | ~0.29.9 |
| expo-web-browser | ~14.0.1 |

### 백엔드 (API)

| 항목 | 버전 |
|---|---|
| Python | 3.12+ |
| FastAPI | 0.116+ |
| SQLAlchemy (asyncio) | 2.0+ |
| asyncpg | 0.30+ |
| Alembic | 1.14+ |
| Pydantic | 2.10+ |
| PyJWT | 2.8+ |
| passlib + bcrypt | - |
| httpx | 0.28+ |
| Redis (async) | 5.2+ |

### DB / 인프라

| 항목 | 버전 |
|---|---|
| PostgreSQL | 16-alpine |
| Redis | 7-alpine |
| Docker / Docker Compose | - |
| nginx | 1.27-alpine |
| Python uv | (package manager) |

---

## 3. 기존 설정 파일

### CLAUDE.md

```markdown
# Protin Claude team guidance

## Product direction
- Booking-first workout partner app
- Sydney-first
- Gym and golf only for current scope
- Premium but minimal UX
- Avoid generic dating-app feel

## Engineering rules
- Respect ownership boundaries
- Keep implementation minimal and production-oriented
- Do not add placeholder business logic
- Do not add speculative features
- Prefer simple structure over abstraction

## Wave discipline
- Parallelize only where file ownership is clean
- Raise conflicts instead of editing outside scope
- Optimize for easy integration into the next wave
```

### AGENTS.md

```markdown
# Protin Codex guidance

## Your role
You are used for planning and review, not primary implementation.

## What good looks like
- Minimal, production-oriented structure
- Clear ownership boundaries
- Clean wave-based implementation plan
- Low merge-conflict risk
- Booking-first product alignment

## Review priorities
1. Ownership drift
2. Naming consistency
3. Architecture drift
4. Missing boundaries
5. Developer experience issues
6. Follow-up task split
```

### .claude/ 디렉토리

`.claude/` 디렉토리 없음 — settings.json, hooks, skills 미설정 상태.

### 환경변수 키 목록 (.env.example)

**루트 (인프라):**
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`
- `REDIS_PORT`
- `APP_ENV`, `API_HOST`, `API_PORT`, `LOG_LEVEL`
- `POSTGRES_URL`, `REDIS_URL`
- `SECRET_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `WORKER_POLL_INTERVAL_SECONDS`
- `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_REDIRECT_URI`

**스테이징 (.env.staging.example):**
- 루트와 동일 키, `APP_ENV=staging`, 내부 docker 네트워크 URL 사용

---

## 4. 구현 완료된 기능

### API 엔드포인트 목록

| 라우터 | 경로 | 메서드 | 설명 |
|---|---|---|---|
| **auth** | `/auth/register` | POST | 회원가입 + JWT 반환 |
| | `/auth/login` | POST | 로그인 + JWT 반환 |
| | `/auth/me` | GET | 현재 유저 정보 |
| **users** | `/users/me/profile` | GET/PUT | 프로필 조회/수정 |
| | `/users/me/identity-preferences` | GET/PUT | 매칭 선호 조회/수정 |
| | `/users/me/sport-profiles` | GET/POST | 종목 프로필 목록/생성 |
| | `/users/me/sport-profiles/{sport}` | DELETE | 종목 프로필 삭제 |
| **discovery** | `/discovery` | GET | 파트너 카드 피드 (페이지네이션) |
| | `/discovery/actions` | POST | like/pass/save 액션 기록 |
| **matches** | `/matches` | GET | 상호 매칭 목록 |
| | `/matches/{id}` | PATCH | 매치 아카이브 |
| **chat** | `/matches/{id}/messages` | GET | 메시지 목록 |
| | `/matches/{id}/messages` | POST | 메시지 전송 |
| **bookings** | `/bookings` | GET/POST | 예약 목록/생성 |
| | `/bookings/{id}` | GET | 예약 상세 |
| | `/bookings/{id}/confirm` | POST | 예약 확정 |
| | `/bookings/{id}/decline` | POST | 예약 거절 |
| | `/bookings/{id}/cancel` | POST | 예약 취소 |
| | `/bookings/{id}/complete` | POST | 완료 처리 |
| | `/bookings/{id}/no-show` | POST | 노쇼 처리 |
| **google_calendar** | `/users/me/google-calendar/auth-url` | GET | OAuth URL |
| | `/users/me/google-calendar/callback` | GET | OAuth 콜백 |
| | `/users/me/google-calendar/status` | GET | 연결 상태 |
| | `/users/me/google-calendar/disconnect` | DELETE | 연결 해제 |
| | `/users/me/google-calendar/bookings/{id}/sync-google-calendar` | POST | 캘린더 동기화 |
| **notifications** | `/notifications/token` | POST | 푸시 토큰 등록 |
| | `/notifications/token/{id}` | DELETE | 토큰 해제 |
| | `/notifications/internal/process-notifications` | POST | 알림 배달 트리거 |
| **safety** | `/reports` | POST | 유저 신고 |
| | `/blocks` | GET | 차단 목록 |
| | `/blocks/{id}` | POST/DELETE | 차단/해제 |

### DB 모델 / 스키마 현황 (14개 테이블)

| 모델 | 테이블 | 주요 필드 |
|---|---|---|
| User | `users` | id, email, hashed_password, is_active |
| UserProfile | `user_profiles` | user_id, display_name, bio, birth_year, suburb, avatar_url |
| IdentityPreferences | `identity_preferences` | user_id, open_to (JSON), age_range, max_distance_km |
| SportProfile | `sport_profiles` | user_id, sport(gym/golf), level, preferred_times, gym_name |
| DiscoveryAction | `discovery_actions` | actor_id, target_id, sport, action (like/pass/save) |
| Match | `matches` | user1_id, user2_id, sport, status(active/archived) |
| Message | `messages` | match_id, sender_id, body (max 1000자) |
| Booking | `bookings` | match_id, proposer_id, partner_id, status FSM, starts_at, location |
| GoogleCalendarToken | `google_calendar_tokens` | user_id, access_token, refresh_token, token_expiry |
| CalendarBookingSync | `calendar_booking_syncs` | booking_id, user_id, google_event_id, sync_status |
| PushToken | `push_tokens` | user_id, token (Expo format), platform |
| NotificationEvent | `notification_events` | user_id, booking_id, type, title, body, scheduled_at, sent_at |
| Report | `reports` | reporter_id, reported_id, reason, context |
| Block | `blocks` | blocker_id, blocked_id |

### 모바일 화면 / 컴포넌트 목록

| 스크린 | 경로 | 역할 |
|---|---|---|
| SplashScreen | `screens/SplashScreen.tsx` | 토큰 리하이드레이션, 네비게이션 가드 |
| AuthEntryScreen | `screens/auth/` | 앱 진입점 (로그인/회원가입 분기) |
| LoginScreen | `screens/auth/` | 이메일·비밀번호 로그인 |
| RegisterScreen | `screens/auth/` | 회원가입 |
| OnboardingStep1-3Screen | `screens/onboarding/` | 프로필 초기 설정 3단계 |
| DiscoveryScreen | `screens/discovery/` | 파트너 카드 스와이프 피드 |
| MatchesScreen | `screens/matches/` | 상호 매칭 목록 |
| ChatScreen | `screens/chat/` | 매치 대화 |
| BookingComposerScreen | `screens/bookings/` | 예약 제안 생성 |
| BookingDetailScreen | `screens/bookings/` | 예약 상세·관리 |
| ProfileScreen | `screens/profile/` | 프로필 편집 |
| ReportScreen | `screens/safety/` | 유저 신고 |

### 주요 파일/모듈 역할

| 파일 | 역할 |
|---|---|
| `apps/api/app/main.py` | FastAPI 앱 초기화, 미들웨어, 라우터 마운트 |
| `apps/api/app/core/config.py` | 환경변수 기반 설정 (BaseSettings) |
| `apps/api/app/core/security.py` | JWT 생성·검증, bcrypt 해싱 |
| `apps/api/app/db/` | 비동기 SQLAlchemy 세션, Redis 클라이언트 |
| `apps/api/app/services/bookings.py` | 예약 상태 머신 (`_TRANSITIONS` dict) |
| `apps/api/app/services/discovery.py` | 피드 필터링·파트너 카드 빌딩 |
| `apps/api/app/services/google_calendar.py` | OAuth 플로우, 토큰 갱신, 캘린더 이벤트 sync |
| `apps/api/app/services/notifications.py` | 푸시 토큰 등록, Expo 푸시 배달 |
| `apps/api/worker.py` | 알림 이벤트 폴링 백그라운드 워커 |
| `apps/mobile/src/lib/api.ts` | HTTP 클라이언트 (JWT, snake↔camelCase 변환, 타임아웃) |
| `apps/mobile/src/hooks/useDiscovery.ts` | 디스커버리 피드 상태 + 액션 |
| `apps/mobile/src/stores/auth.ts` | Zustand 인증 스토어 |
| `packages/shared-types/src/` | API↔앱 공유 TypeScript 타입 계약 |

---

## 5. 미구현 / TODO

### TODO / FIXME / HACK 주석

소스 코드 내 TODO/FIXME/HACK 주석 **없음**.

**단, 프로덕션 전 처리 필요한 인라인 메모:**

| 파일 | 내용 |
|---|---|
| `apps/api/app/models/google_calendar.py` | "Tokens stored in plaintext for staging convenience. Production: encrypt at rest." |
| `apps/mobile/src/lib/api.ts:16` | `[DEBUG]` BASE_URL 로그 — 스테이징 확인 후 제거 필요 |
| `apps/mobile/src/lib/api.ts:82,109,125,148` | `[DEBUG]` 요청/응답 상세 로그 4곳 — 프로덕션 전 제거 필요 |
| `infra/nginx/nginx.conf` | HTTPS 설정 주석 처리됨 — 인증서 준비 후 활성화 필요 |

### 현재 unstaged 변경 파일 (git status)

| 파일 | 상태 |
|---|---|
| `apps/mobile/src/hooks/useDiscovery.ts` | Modified (staged) |
| `apps/mobile/src/lib/api.ts` | Modified (unstaged) |

> `api.ts`에 디버그 로그가 추가된 상태. 스테이징 디버깅용으로 보이며 머지 전 정리 필요.

### 빈 파일 / 스텁

| 파일 | 상태 |
|---|---|
| `app/db/__init__.py` | 표준 Python 패키지 마커 (의도적 빈 파일) |
| `app/routers/__init__.py` | 동일 |
| `app/schemas/__init__.py` | 동일 |
| `app/services/__init__.py` | 동일 |
| `alembic/versions/.gitkeep` | 디렉토리 마커 |
| `apps/mobile/app.json` | 의도적 최소화 (동적 설정은 app.config.js에서) |

스텁 함수 없음 — 코드 전체가 프로덕션 지향적.

### 테스트 파일 유무 및 커버리지

**API 테스트 (pytest) — 11개 파일:**

| 파일 | 커버 대상 |
|---|---|
| `conftest.py` | 인메모리 SQLite 픽스처, ASGI 클라이언트, 의존성 오버라이드 |
| `test_auth.py` | 회원가입, 로그인, 토큰 검증 |
| `test_profile.py` | 유저 프로필 CRUD |
| `test_discovery.py` | 피드, 액션 기록 |
| `test_matches.py` | 매치 목록, 아카이브 |
| `test_bookings.py` | 예약 전체 라이프사이클 |
| `test_chat.py` | 메시지 전송·조회 |
| `test_google_calendar.py` | OAuth, 토큰, 캘린더 sync |
| `test_notifications.py` | 푸시 토큰 등록, 알림 배달 |
| `test_safety.py` | 신고, 차단/해제 |
| `test_health.py` | 헬스체크 엔드포인트 |

- **모바일 테스트 없음** — React Native / Expo 테스트 파일 미존재
- `pytest-asyncio` + `httpx.AsyncClient(ASGITransport)` 패턴
- 인메모리 SQLite (`sqlite+aiosqlite:///:memory:`)로 격리
- Redis는 mock 처리

---

## 6. Git 상태

### 현재 브랜치

```
feature/wave-8-staging-readiness
```

### 최근 커밋 (최대 10개)

```
b6b5376  Wave 8 staging readiness and PR workflow hardening
2b8a3d9  Initial commit
```

> 총 2개 커밋. 단일 대형 초기 커밋 + Wave 8 하드닝 커밋 구조.

### 커밋 컨벤션 패턴

Wave 기반 서술형 메시지 사용 — `feat/fix/chore` 프리픽스 미사용.  
커밋 수가 적어 패턴 통계 측정 불가.

---

## 7. 린트 / 빌드 상태

### 모바일 앱

`apps/mobile/package.json`에 `lint`, `typecheck`, `test` 스크립트 **미정의**.  
현재 lint/typecheck 자동화 없음 — 추가 필요.

```json
"scripts": {
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "web": "expo start --web"
}
```

### API (Python)

`pyproject.toml`에서 lint/typecheck 설정 확인 필요.  
`uv run pytest` 로 테스트 실행 가능 (로컬 Docker 인프라 필요 없음 — 인메모리 SQLite 사용).

### 빌드 가능 여부

| 대상 | 상태 |
|---|---|
| API Docker 이미지 | Dockerfile 존재, 멀티스테이지 빌드 구성 완료 |
| 스테이징 스택 | docker-compose.staging.yml 완성, deploy.sh 존재 |
| 모바일 앱 | Expo 빌드 가능 (expo start / EAS build) |
| CI/CD 파이프라인 | **없음** — 수동 배포 (`deploy.sh`) 방식 |

---

## 8. 전반적 평가 및 다음 단계 제안

### 완성도

- **API**: Wave 8 기준 기능 100% 구현. 엔드포인트, 모델, 서비스, 마이그레이션, 테스트 모두 존재.
- **모바일**: 모든 주요 스크린 구현. `api.ts`와 `useDiscovery.ts`가 현재 수정 중.
- **인프라**: 스테이징 배포 준비 완료 (nginx, docker-compose, 스크립트).

### 즉시 처리 필요 항목

| 우선순위 | 항목 |
|---|---|
| 높음 | `apps/mobile/src/lib/api.ts` 디버그 로그 5곳 제거 후 커밋 |
| 높음 | `unstaged` 상태인 `api.ts` 변경 처리 (커밋 또는 revert) |
| 중간 | Google Calendar 토큰 평문 저장 → 암호화 (프로덕션 전) |
| 중간 | 모바일 앱 lint / typecheck 스크립트 추가 |
| 낮음 | CI/CD 파이프라인 구성 (현재 수동 deploy.sh) |
| 낮음 | nginx HTTPS 활성화 (인증서 준비 후) |
| 낮음 | 모바일 앱 테스트 추가 |
