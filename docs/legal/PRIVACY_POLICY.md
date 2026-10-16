# SportsGang — Privacy Policy

**Last updated:** 2026-04-16
**Effective:** [INSERT LAUNCH DATE]

> **TEMPLATE NOTICE — before publishing, replace every `[BRACKETED]` placeholder
> and have a lawyer review. This draft is based on the actual data the app
> collects (verified against `apps/api/app/models/` in the source tree) but
> does not constitute legal advice.**

## 1. Who we are

SportsGang ("**we**", "**us**", "**our**") is an app that helps people find
workout partners for gym and golf sessions (with tennis and running
supported). This Privacy Policy explains what personal information we
collect, how we use it, and the choices you have.

Data controller: [INSERT LEGAL ENTITY NAME AND ADDRESS]
Contact: [privacy@protin.app]

## 2. Information we collect

We collect only what the app needs to function.

### 2.1 You give us directly
- **Account** — email address, password (stored only as a bcrypt hash; we never see it in plaintext).
- **If you sign in with Apple** — the Apple-issued user identifier and, on first sign-in, the email address Apple shares (which may be a private relay address you control).
- **If you sign in with Google** — the Google-issued user identifier and the email address associated with your Google account.
- **Profile** — display name, optional bio, birth year, suburb (free-text you type), and an optional avatar URL.
- **Identity preferences** — which genders you are open to match with, age range, and maximum distance in kilometres. You set these; we use them for discovery filtering only.
- **Sport profiles** — for each sport you add (gym, golf, tennis, running): skill level, preferred times of day, optional gym or golf-club name, and optional goals text.
- **Discovery actions** — the users you like, pass, or save in the discovery feed.
- **Chat messages** — messages you send to a matched partner.
- **Bookings** — proposed workout sessions: time, optional location, optional notes, status history.
- **Reports and blocks** — if you report or block another user, we store the reported/blocked user ID and, for reports, the free-text reason you provide.

### 2.2 Collected automatically
- **Device push token** — an Expo push token (a random identifier, not a phone number or email) per device that you have logged in on, used to send you match and booking notifications. Stored only while you are logged in on that device.
- **Service logs** — standard request logs (IP address, user agent, timestamp, route) retained for up to 30 days for security, abuse prevention, and diagnostics.
- **Crash and performance data** — anonymised crash reports collected via Sentry (see §4).

### 2.3 If you link Google Calendar
If you choose to connect Google Calendar to add confirmed bookings to your calendar, we store your Google OAuth access and refresh tokens **encrypted at rest** (AES-256-GCM via the Fernet scheme). We use them only to write events you have explicitly confirmed. You can disconnect at any time from the profile screen, which deletes the tokens.

### 2.4 Device location (foreground, optional)

> _Draft wording — confirm with legal/operator before App Store submission._

When you open the in-app venue / court picker (for example to attach a court to a session proposal, booking, or game), SportsGang may ask for **foreground location permission** on your device. You can grant or deny this permission, and you can change it at any time in your device settings.

- **Why we ask.** To help you find sports venues and courts near you and to sort venue results by approximate distance from your current location.
- **Precision.** When you grant permission, the app reads a single foreground location fix (the operating system decides the precision; this may be approximate or precise depending on your device and permission grant). We do not run background location, and we do not track your location over time.
- **Where it goes.** When the venue picker is open, your device sends your coordinates to the SportsGang backend with the sport keyword and an optional search radius so we can return nearby venues. We do not store your raw coordinates as a user-profile field; they are used to answer the request and may appear in standard service logs covered by §2.2.
- **Third-party venue lookup.** To improve venue coverage, the SportsGang backend may forward the same search coordinates and sport/venue query context to **Google Maps Platform / Google Places** as a venue provider (see §4). Google API keys are configured server-side only; the mobile app does not embed or call Google Maps Platform directly.
- **Opt-out path.** If you deny location, the venue picker still works — it falls back to a manual catalog and you can type a venue or court name yourself.

### 2.5 What we do **not** collect
- We do **not** run background location, and we do not continuously track where you are.
- We do **not** access your photo library, camera, microphone, contacts, or health data.
- We do **not** sell personal data, and we do not share it for cross-context behavioural advertising.

## 3. How we use your information

- Create and secure your account.
- Match you with compatible workout partners based on your sport profiles and identity preferences.
- Deliver in-app chat and booking workflows between matched users.
- Send push notifications about matches, chat messages, and booking changes.
- Add bookings to your Google Calendar **only if** you connected it.
- Investigate reports, enforce our Terms of Service, and prevent abuse.
- Monitor service health and fix bugs.

Our legal bases (where GDPR applies) are: **contract** (running the service you signed up for), **legitimate interests** (security, abuse prevention, basic analytics), and **consent** (push notifications, calendar linking).

## 4. Third parties who process data on our behalf

| Processor | Purpose | Data shared |
|---|---|---|
| **Fly.io** | App hosting in Sydney region | All data listed in §2 (they host our database and servers) |
| **Expo (Expo Push Service)** | Push notification delivery | Your device push token and the notification payload (e.g. "You have a new match") |
| **Apple (Sign in with Apple)** | Authentication | The identity token you send us — Apple returns your user ID and, optionally, email |
| **Google (OAuth + Calendar API)** | Optional calendar linking | Access/refresh tokens (encrypted at rest), event titles and times for bookings you confirm |
| **Google Maps Platform / Google Places** | Optional venue / court lookup when you use the in-app venue picker (see §2.4) | Search coordinates, sport keyword, and search radius. No SportsGang user identifier or email is sent. Requests are made server-side from the SportsGang backend; the API key is not in the mobile app. |
| **Sentry** | Crash and error reporting | Anonymised stack traces, device model, OS version. Personal data is scrubbed before upload. |

We do not share personal data with anyone else. We never sell it.

## 5. Data retention

- **Account data** — kept while your account is active.
- **Chat messages** — kept as long as the match exists.
- **Bookings** — kept for 2 years for dispute resolution, then deleted.
- **Reports and blocks** — kept for 2 years for safety record-keeping.
- **Service logs** — up to 30 days.
- **Crash reports** — up to 90 days.

## 6. Your rights

You can, at any time:
- **Access** — view and edit your profile, preferences, sport profiles, and bookings from within the app.
- **Delete** — delete your entire account from Settings → Delete Account. This cascades deletion of your profile, sport profiles, discovery actions, matches, chat messages, bookings, push tokens, calendar tokens, and reports you submitted. Backups are purged on a rolling 30-day cycle.
- **Export** — email us at [privacy@protin.app] and we will provide a machine-readable export within 30 days.
- **Correct** — edit your profile in-app.
- **Withdraw consent** — disconnect Google Calendar or disable push notifications from your device settings.
- **Complain** — contact your local data protection authority. In Australia, this is the OAIC (oaic.gov.au).

## 7. Children

SportsGang is for users aged **18 and over**. You confirm you are 18+ when you register. If we learn an account belongs to someone under 18, we will delete it.

## 8. Security

- Passwords are bcrypt-hashed; we never store plaintext passwords.
- Google Calendar tokens are encrypted at rest (AES-256-GCM).
- All traffic between the app and our servers is HTTPS (TLS 1.2+).
- JWT access tokens are signed with a rotating secret and expire.
- Access to production systems is restricted to the small engineering team and audited.

No system is perfectly secure. If we become aware of a breach affecting your personal data, we will notify you and the relevant authorities as required by law.

## 9. International data transfers

Our primary hosting region is Sydney, Australia. Some processors (Sentry, Expo, Apple, Google) may process data in the United States or other regions. Transfers are protected by Standard Contractual Clauses or equivalent mechanisms where required.

## 10. Changes to this policy

If we materially change how we handle your data, we will notify you in the app and by email before the change takes effect.

## 11. Contact

- **Email:** [privacy@protin.app]
- **Postal:** [INSERT BUSINESS ADDRESS]
