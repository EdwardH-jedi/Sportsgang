# Protin 하네스 설계 & 로드맵

> 기준: `feature/wave-8-staging-readiness` | 2026-04-08

---

## 현재 상태 요약

### 잘 되어 있는 것
- API 기능 100% 구현 (9개 라우터, 14개 모델, 8개 서비스, 4개 마이그레이션)
- 모바일 14개 스크린 구현 완료
- API 테스트 11개 파일 (pytest + 인메모리 SQLite)
- 스테이징 인프라 준비 완료 (Docker, nginx, deploy.sh)
- shared-types로 프론트↔백 타입 계약 수립

### 빠져 있는 것
- `.claude/` 디렉토리 자체가 없음 (hooks, skills, agents, settings 전무)
- 모바일 lint/typecheck/test 스크립트 없음
- CI/CD 파이프라인 없음
- Conventional Commits 미적용 (커밋 2개, 서술형)
- 모바일 테스트 0개
- 디버그 로그 5곳 잔존 (`api.ts`)
- Google Calendar 토큰 평문 저장

---

## 하네스 구조

### 디렉토리 레이아웃

```
protin/
├── .claude/
│   ├── settings.json              # hooks + 권한 설정
│   ├── agents/
│   │   ├── api-builder.md         # FastAPI 백엔드 전담
│   │   ├── mobile-builder.md      # Expo RN 프론트엔드 전담
│   │   ├── qa-reviewer.md         # 코드 리뷰 + 테스트 검증
│   │   └── infra-ops.md           # Docker, nginx, CI/CD, 배포
│   ├── skills/
│   │   ├── booking-fsm/
│   │   │   └── SKILL.md           # 예약 상태머신 로직 가이드
│   │   ├── discovery-feed/
│   │   │   └── SKILL.md           # 피드 필터링 + 매칭 스코어링
│   │   ├── api-contract/
│   │   │   └── SKILL.md           # shared-types 동기화 규칙
│   │   └── wave-planning/
│   │       └── SKILL.md           # Wave 기반 작업 분배 프로토콜
│   └── hooks/
│       ├── pre-commit.sh          # lint + typecheck + secret scan
│       └── post-edit-lint.sh      # 파일 수정 후 자동 린트
├── CLAUDE.md                      # 기존 유지 + 하네스 참조 추가
└── AGENTS.md                      # 기존 유지
```

### 에이전트 설계

| 에이전트 | 역할 | 파일 소유권 | 패턴 |
|---|---|---|---|
| **api-builder** | FastAPI 라우터, 서비스, 모델, 마이그레이션, API 테스트 | `apps/api/**` | Producer |
| **mobile-builder** | RN 스크린, 훅, 스토어, 컴포넌트, 모바일 테스트 | `apps/mobile/**` | Producer |
| **qa-reviewer** | 모든 PR/커밋 코드 리뷰, 타입 안정성, 보안 검증 | 읽기 전용 (수정 안 함) | Reviewer |
| **infra-ops** | Docker, nginx, CI/CD, 배포 스크립트, 환경변수 | `infra/`, `docker-compose*`, `.github/` | Producer |

**오케스트레이션**: Producer-Reviewer 패턴 중심
- api-builder / mobile-builder가 병렬 구현
- shared-types 변경 시 둘 다 동기화 필요 → api-contract 스킬이 가이드
- 모든 구현물은 qa-reviewer를 통과해야 완료
- CLAUDE.md의 "wave discipline" 규칙 그대로 유지

### 스킬 설계

**booking-fsm** — 예약 상태 전이 (`_TRANSITIONS` dict) 기반으로 새 상태 추가/수정 시 가이드. confirm→complete, decline→cancelled 등 FSM 규칙 강제.

**discovery-feed** — 파트너 카드 피드 필터링 로직. 차단 유저 제외, 이미 액션한 유저 제외, 종목+거리+선호시간 기반 정렬. 현재 gym/golf only 스코프 반영.

**api-contract** — `packages/shared-types/` 수정 시 프론트↔백 양쪽 호환성 체크. snake_case(API) ↔ camelCase(앱) 변환 규칙 포함.

**wave-planning** — Wave 단위 작업 분배 프로토콜. 파일 소유권 충돌 방지, 병렬화 가능 여부 판단, 머지 컨플릭트 리스크 평가.

### Hooks 설계

**pre-commit.sh** (PreToolUse → Bash matcher):
1. main/master 브랜치 직접 커밋 차단
2. Python: `ruff check . && ruff format --check .` (apps/api)
3. TypeScript: `npx tsc --noEmit` (apps/mobile)
4. Secret scan: staged 파일에서 API key/password/token 패턴 grep
5. Conventional Commits 형식 검증 (feat/fix/chore/docs/refactor/test/perf/ci)
6. git commit 아닌 명령어는 즉시 exit 0

**post-edit-lint.sh** (PostToolUse → Edit matcher):
- .py 파일 수정 시 → `ruff check {파일}`
- .ts/.tsx 파일 수정 시 → `npx tsc --noEmit` (프로젝트 전체)

---

## 앞으로 해야 할 일 (우선순위순)

### Wave 9: 코드 품질 기반 다지기 (즉시)

| # | 작업 | 담당 에이전트 | 예상 난이도 |
|---|---|---|---|
| 1 | `api.ts` 디버그 로그 5곳 제거 + unstaged 변경 정리 커밋 | mobile-builder | 쉬움 |
| 2 | 모바일 lint/typecheck 스크립트 추가 (`eslint`, `tsc --noEmit`) | mobile-builder | 쉬움 |
| 3 | `.claude/` 하네스 전체 구조 생성 (agents, skills, hooks, settings) | infra-ops | 중간 |
| 4 | Conventional Commits 도입 + 기존 커밋 히스토리는 그대로 두기 | qa-reviewer | 쉬움 |
| 5 | API ruff 설정 확인/추가 (pyproject.toml) | api-builder | 쉬움 |

### Wave 10: 테스트 & 안정성

| # | 작업 | 담당 에이전트 | 예상 난이도 |
|---|---|---|---|
| 6 | 모바일 테스트 기반 마련 (jest + @testing-library/react-native) | mobile-builder | 중간 |
| 7 | 핵심 스크린 테스트 작성 (Discovery, Chat, Booking 3개) | mobile-builder | 중간 |
| 8 | Google Calendar 토큰 암호화 (Fernet 또는 환경변수 기반 AES) | api-builder | 중간 |
| 9 | API 테스트에 edge case 추가 (FSM 불가능 전이, 중복 매치 등) | api-builder | 중간 |

### Wave 11: 인프라 & 배포

| # | 작업 | 담당 에이전트 | 예상 난이도 |
|---|---|---|---|
| 10 | GitHub Actions CI 파이프라인 (lint → typecheck → test → docker build) | infra-ops | 중간 |
| 11 | nginx HTTPS 활성화 (Let's Encrypt 또는 Cloudflare) | infra-ops | 중간 |
| 12 | 스테이징 환경 헬스체크 자동화 (cron + health-check.sh) | infra-ops | 쉬움 |

### Wave 12: 기능 확장 (제품 방향)

| # | 작업 | 담당 에이전트 | 예상 난이도 |
|---|---|---|---|
| 13 | 운동 종목 확장 (tennis, running 추가) — 현재 gym/golf only | api-builder + mobile-builder | 중간 |
| 14 | 실시간 채팅 WebSocket 전환 (현재 HTTP 폴링) | api-builder + mobile-builder | 높음 |
| 15 | 매칭 알고리즘 고도화 (실력 수준 + 거리 + 시간대 가중치 스코어링) | api-builder | 높음 |
| 16 | 푸시 알림 테스트 (실기기 + Expo EAS) | mobile-builder + infra-ops | 중간 |

---

## 하네스 적용 프롬프트

아래를 Claude Code CLI에 붙여넣어 하네스를 생성:

```
이 프로젝트의 하네스를 구성해줘.

먼저 CLAUDE.md와 AGENTS.md를 읽어서 기존 규칙을 파악하고,
아래 구조대로 .claude/ 디렉토리를 생성해줘.

## 에이전트 (4명)

### .claude/agents/api-builder.md
- 역할: FastAPI 백엔드 전담 (라우터, 서비스, 모델, 마이그레이션, 테스트)
- 소유권: apps/api/** 전체
- 원칙: CLAUDE.md의 "minimal and production-oriented" 준수, placeholder 로직 금지
- 출력 규칙: API 엔드포인트 변경 시 반드시 packages/shared-types도 업데이트
- 커밋 형식: Conventional Commits (feat/fix/chore/docs/refactor/test)

### .claude/agents/mobile-builder.md
- 역할: Expo React Native 프론트엔드 전담 (스크린, 훅, 스토어, 컴포넌트)
- 소유권: apps/mobile/** 전체
- 원칙: 디자인 토큰(theme/) 사용 강제, 인라인 스타일 금지
- 의존: shared-types의 타입을 import해서 사용, 직접 타입 정의 금지
- 커밋 형식: Conventional Commits

### .claude/agents/qa-reviewer.md
- 역할: 코드 리뷰 전담. 파일 수정 권한 없음 (읽기 전용)
- 리뷰 기준 (AGENTS.md의 우선순위 그대로):
  1. 소유권 이탈 (다른 에이전트 영역 침범)
  2. 네이밍 일관성 (snake_case API, camelCase 앱)
  3. 아키텍처 드리프트
  4. 경계 누락
  5. 개발자 경험 이슈
  6. 후속 작업 분리
- 추가 체크: 타입 안정성, 보안 취약점, 테스트 커버리지

### .claude/agents/infra-ops.md
- 역할: Docker, nginx, CI/CD, 배포 스크립트, 환경변수 관리
- 소유권: infra/**, docker-compose*, .github/**, .env*
- 원칙: 인프라 변경은 항상 스테이징에서 먼저 검증

## 스킬 (4개)

### .claude/skills/booking-fsm/SKILL.md
- 트리거: booking, 예약, 상태 전이, FSM 관련 작업
- 내용: apps/api/app/services/bookings.py의 _TRANSITIONS dict 기반 상태머신 규칙
- 가능한 상태: pending_partner → confirmed/declined, confirmed → cancelled/completed/no_show
- 규칙: 새 상태 추가 시 반드시 전이 맵 + 테스트 + 마이그레이션 함께 작성

### .claude/skills/discovery-feed/SKILL.md
- 트리거: 디스커버리, 피드, 매칭, 스와이프 관련 작업
- 내용: 피드 필터링 규칙 (차단 유저 제외, 기존 액션 제외, gym/golf 스코프)
- 매칭 스코어: 종목 겹침, 실력 차이, 거리, 선호 시간대 가중치

### .claude/skills/api-contract/SKILL.md
- 트리거: shared-types, API 스키마, 타입 변경 관련 작업
- 내용: packages/shared-types/ 수정 규칙
- 규칙: API 변경 → shared-types 업데이트 → 모바일 import 확인 순서 강제
- snake_case(Python) ↔ camelCase(TypeScript) 변환은 apps/mobile/src/lib/api.ts에서 처리

### .claude/skills/wave-planning/SKILL.md
- 트리거: wave, 작업 계획, 병렬화, 태스크 분배 관련
- 내용: CLAUDE.md의 wave discipline 규칙 구체화
- 규칙: 파일 소유권 충돌 시 작업 분리, 병렬화는 소유권 clean할 때만

## Hooks

### .claude/hooks/pre-commit.sh
- PreToolUse + Bash matcher
- git commit 감지 시:
  1. main/master 브랜치 차단 → {"decision":"block","reason":"feature 브랜치를 사용하세요"}
  2. Python lint: cd apps/api && ruff check . && ruff format --check .
  3. TS typecheck: cd apps/mobile && npx tsc --noEmit
  4. Secret scan: git diff --cached에서 password|secret|api_key|token.*= 패턴 grep
  5. Conventional Commits: -m 메시지가 feat|fix|chore|docs|refactor|test|perf|ci로 시작하는지
- git commit 아닌 명령 → 즉시 exit 0
- 스크립트 상단: #!/usr/bin/env bash, set -euo pipefail
- chmod +x 설정

### .claude/hooks/post-edit-lint.sh
- PostToolUse + Edit matcher
- .py 파일 → ruff check {파일경로}
- .ts/.tsx 파일 → npx tsc --noEmit (apps/mobile 기준)

### .claude/settings.json
- hooks 설정 + 기본 권한 규칙 포함

## 기존 파일 처리
- CLAUDE.md: 마지막에 "## Harness" 섹션 추가하여 .claude/ 구조 참조 안내
- AGENTS.md: 수정하지 않음 (Codex 가이던스 유지)

## 검증
- 각 에이전트의 트리거 키워드 확인
- pre-commit.sh를 echo 테스트로 드라이런
- 디렉토리 구조 최종 확인 출력

환경변수도 설정해줘:
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```
