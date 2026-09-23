# Protin Staging QA Checklist

Date: ___________
Tester: ___________
Server IP: ___________
Mobile device: ___________
App build: ___________

---

## Pre-flight

- [ ] Server is reachable: `curl http://SERVER_IP/health` returns `{"status":"ok",...}`
- [ ] All containers running: `docker compose -f docker-compose.yml -f docker-compose.staging.yml ps`
- [ ] Mobile app .env points to correct SERVER_IP (`EXPO_PUBLIC_API_URL=http://SERVER_IP`)
- [ ] Mobile app restarted after env change

---

## 1. Authentication

- [ ] **Register** — create a new account with email + password
- [ ] **Login** — log in with the same credentials
- [ ] **Token persistence** — close and reopen the app; should stay logged in
- [ ] **Invalid credentials** — enter wrong password; app shows error, not crash
- [ ] **Logout** — log out from Profile; returns to login screen

---

## 2. Profile setup

- [ ] **Display name** — set a display name and save; visible after reload
- [ ] **About** — set About text and save
- [ ] **Age** — set age and save
- [ ] **Gender** — set gender and save
- [ ] **Identity preferences** — set gender preference and save
- [ ] **Sport profiles — Gym** — fill in fitness level, preferred time; save
- [ ] **Sport profiles — Golf** — fill in golf-specific fields; save (or skip if not applicable)

---

## 3. Discovery

- [ ] **Discovery feed loads** — cards appear (requires at least 2 accounts in DB)
- [ ] **Like** — swipe/tap Like; card advances
- [ ] **Pass** — swipe/tap Pass; card advances
- [ ] **No more cards** — empty state shown when deck is exhausted

---

## 4. Matches

- [ ] **Mutual like creates match** — use two test accounts to like each other; match appears
- [ ] **Match list loads** — matched user appears in Matches tab
- [ ] **Match card shows partner name and sport**

---

## 5. Chat

- [ ] **Open chat** — tap a match; chat screen opens
- [ ] **Send message** — type and send; message appears
- [ ] **Receive message** — from second account, send a message; first account sees it (requires manual poll or refresh)
- [ ] **Messages ordered oldest-first**

---

## 6. Booking

- [ ] **Propose booking** — tap "+ Session" in chat; fill in date/time/location; submit
- [ ] **Booking appears in BookingDetail** — redirected after submit; status = proposed
- [ ] **Confirm booking** — from partner account, confirm; status changes to confirmed
- [ ] **Decline booking** — propose a new booking; partner declines; status = declined
- [ ] **Cancel booking** — from either account, cancel a confirmed booking; status = cancelled
- [ ] **Invalid times** — submit with end_time before start_time; app shows error

---

## 7. Device Calendar

- [ ] **Add to Calendar prompt** — on a confirmed booking, "Add to Calendar" button appears
- [ ] **Calendar permission** — first use prompts for calendar permission
- [ ] **Event added** — event appears in device calendar app with correct time and title

---

## 8. Google Calendar (if configured)

- [ ] **Connect Google Calendar** — Profile → Google Calendar → Connect; browser opens OAuth flow
- [ ] **Auth completes** — browser closes; Profile shows "Connected"
- [ ] **Sync booking** — tap Sync on a confirmed booking; returns success
- [ ] **Disconnect** — Profile → Google Calendar → Disconnect; status resets

> Skip this section if `GOOGLE_CLIENT_ID` is not configured in `.env.staging`.

---

## 9. Push Notifications (if configured)

- [ ] **Token registration** — on first login, device registers push token (check worker logs)
- [ ] **Booking reminder** — advance a booking time to ~1 min from now; verify worker sends notification

> Skip this section if push notifications have not been configured or tested.

---

## 10. Safety

- [ ] **Report user** — from chat, open menu → Report; submit a report; success state shown
- [ ] **Block user** — from chat, open menu → Block; user disappears from discovery
- [ ] **Block is bidirectional** — blocked user also cannot see blocker in discovery

---

## 11. Stability

- [ ] **Restart API** — `docker compose restart api`; app reconnects cleanly
- [ ] **Data persists across restart** — restart postgres; data is still present
- [ ] **Worker running** — `docker compose logs worker` shows polling activity

---

## Post-QA

- [ ] Log findings in docs/archive/staging/KNOWN_ISSUES.md
- [ ] Take note of any crashes with stack traces
- [ ] Confirm backup script works: `bash infra/scripts/backup.sh`
