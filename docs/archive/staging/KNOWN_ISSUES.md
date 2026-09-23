# Protin Staging — Known Issues

Updated: 2026-03-18
Environment: home staging server

---

## Blockers (prevent QA from proceeding)

None confirmed at time of writing. Update as issues are found.

---

## Non-blockers (workarounds available)

### NB-001 — Google Calendar OAuth requires HTTPS for production
**Symptom**: OAuth redirect works on HTTP for staging LAN, but Google's production consent screen requires verified redirect URIs with HTTPS.
**Workaround**: Use HTTP for staging validation. Configure HTTPS and verified redirect URIs before production.
**Owner**: Infra

### NB-002 — Push notifications require physical device
**Symptom**: Expo push tokens are not available on iOS Simulator or Android Emulator.
**Workaround**: Test push notification flow on a physical device. Use worker logs to confirm scheduling.
**Owner**: Mobile

### NB-003 — Discovery requires ≥2 user accounts
**Symptom**: Discovery feed is empty with only one account.
**Workaround**: Create at least 2 test accounts. Set up profiles for both. Like each other to create a match.
**Owner**: N/A (expected behaviour)

### NB-004 — ~~Chat does not auto-refresh~~ — RESOLVED (Wave 10)
**Resolved**: WebSocket-based real-time messaging shipped. Server: `apps/api/app/routers/chat.py` (`_ConnectionManager` + `/matches/{id}/ws`). Client: `apps/mobile/src/screens/ChatScreen.tsx` opens an authenticated `ws://` connection on mount. Manual refresh no longer required.

### NB-005 — Booking time input is manual text
**Symptom**: BookingComposer requires manual YYYY-MM-DD and HH:MM input. No date picker.
**Workaround**: Follow the format exactly. Invalid formats show an error before submission.
**Owner**: Mobile — future wave

### NB-006 — Chat does not show `sport` from BookingComposer on older matches
**Symptom**: Matches created before Wave 7 where the `Chat` navigation was opened may not have `sport` in params.
**Workaround**: These matches need to be re-navigated to from MatchesScreen. Fresh navigation always includes `sport` in Wave 7.
**Owner**: Mobile — expected for alpha

---

## Investigation Needed

Add items here as QA uncovers issues that are not yet categorised.

---

## Resolved

| ID | Description | Fixed in |
|---|---|---|
| W7-001 | BookingDetailScreen showed Confirm/Decline to proposer | Wave 7 — mobile |
| W7-002 | ChatScreen silently swallowed fetchMessages errors | Wave 7 — mobile |
| W7-003 | BookingComposer attached UTC `Z` suffix to times | Wave 7 — mobile |
| W7-004 | Push tokens not registered — notifications permanently lost | Wave 7 — API + mobile |
| W7-005 | Sport always 'gym' in Chat→BookingComposer navigation | Wave 7 — mobile |
