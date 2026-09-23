# Protin — Alpha Readiness

Date: 2026-03-18
Wave: 7 (post-hardening)

> **SUPERSEDED (2026-04-15)** — This document is frozen at Wave 7 and does
> not reflect Waves 8–17 (harness, sport expansion, WebSocket chat, matching
> algorithm, push-notification tests, CI pipeline, ESLint, nginx HTTP-only
> default). See `docs/archive/alpha/ALPHA_READINESS_UPDATED.md` for the current audit.
> Kept for historical context only.

---

## What is working

### Core flows
- User registration and login with persistent JWT sessions
- Profile setup (display name, age, suburb, bio)
- Identity preferences (gender, sport preferences)
- Sport profiles (gym and golf with fitness level, preferred time)
- Discovery feed with Like / Pass / Save actions
- Bidirectional block filter in discovery
- Mutual match creation and match list
- Chat between matched users
- Booking proposal, confirmation, decline, cancel, complete, no-show
- Device calendar integration (add confirmed sessions to phone calendar)

### Infrastructure
- PostgreSQL + Redis on docker-compose with persistent volumes
- nginx reverse proxy on port 80
- Background worker for push notification delivery
- Health check endpoint with dependency status

---

## What needs manual configuration before alpha

| Item | Who | Notes |
|---|---|---|
| `.env.staging` on the home staging server | Infra | Fill SECRET_KEY, POSTGRES_PASSWORD, optionally Google OAuth |
| Google OAuth credentials | Product | Required for Google Calendar integration only |
| 2+ test accounts with profiles | QA | Discovery feed requires ≥2 accounts with sport profiles set |
| Physical device for push | QA | Expo push tokens unavailable on simulator |

---

## Known alpha limitations

| Area | Limitation | Severity |
|---|---|---|
| Chat | No real-time messaging (no WebSocket/polling) | Non-blocker — manual refresh |
| Chat | No message read receipts | Non-blocker |
| Booking composer | Manual text input for date/time | Non-blocker — format validated |
| Booking composer | No date picker | Non-blocker — future wave |
| Discovery | No photo upload — initials avatar only | Non-blocker |
| Discovery | No advanced filters (age, suburb range) | Non-blocker |
| Google Calendar | HTTP only (no HTTPS on LAN staging) | Non-blocker — staging only |
| Push notifications | Requires physical device | Non-blocker — log verification works |
| Matches | No conversation preview in match list | Non-blocker |

---

## Not in scope for alpha

- Payments or premium subscription logic
- Admin dashboard or moderation tools
- Video/voice calling
- Real-time WebSocket messaging
- Advanced calendar availability matching
- Photo upload
- App Store or Google Play distribution

---

## Proposed alpha entry criteria

The app is ready for internal alpha testing when:

- [ ] The home staging server is deployed and `curl http://SERVER_IP/health` returns `{"status":"ok"}`
- [ ] Two test accounts exist with complete profiles and sport profiles
- [ ] A mutual match can be created end-to-end from two devices
- [ ] A booking can be proposed, confirmed, and added to device calendar
- [ ] The QA checklist in `docs/archive/staging/QA_CHECKLIST.md` passes without blockers

---

## Wave 7 improvements summary

- Role-aware booking action buttons (proposer vs. partner)
- ChatScreen error handling (fetchMessages no longer silent on failure)
- Sport correctly passed from matches → chat → booking composer
- Booking time entry no longer forces UTC offset
- Push notification tokens now retried if not registered at scheduling time
- Status filter on `GET /bookings` for active vs. historical view
- Past booking creation rejected at API level
- Pull-to-refresh on MatchesScreen
- Notification registration wired into app initialization
