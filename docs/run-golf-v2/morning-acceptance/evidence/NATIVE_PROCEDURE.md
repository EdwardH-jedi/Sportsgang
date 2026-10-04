# Q09 native reproduction and observed sequence

Run only on a newly created dedicated simulator. This run used iPhone 16e/iOS 26.3, 390×844 pt, UUID `B0603E58-8D8E-485C-B2C6-BB3B931444C2`. Change the capture script's UUID to your own newly created device; never reuse a human simulator. The installed Expo Go bundle was copied read-only from an existing installation; the existing simulator/app was not modified.

Start candidate QA with isolated ports/config/ownership (`qa.py up --mode simulator --no-open`), then open `exp://127.0.0.1:8252` in the dedicated device. Use the private seeded fixture credentials without logging values. Decline notification permission. Choose Chats → fixture match → propose a running session. No release build or paid provider is needed.

At the default content size, open the start picker. Set hour 11. Set minute 15, tap adjacent 30, and capture `default-15-to-30`. Set minute 45, tap adjacent 30, capture `default-45-to-30`. Swipe the minute wheel; wait for momentum/snap settling. The final adequate swipe selected 45 (`default-swipe-settled`); the earlier short swipe stayed 30 (`default-after-swipe`) and is retained as exploration. Reset to 30, Done, reopen and capture `default-reopened-start`. End picker should show 12:30 (`default-end-picker`).

Change only this device's text size with:

```sh
xcrun simctl ui YOUR_REVIEW_UUID content_size accessibility-extra-extra-extra-large
```

Repeat 15→30 and 45→30 taps, a swipe settled on 45, reset to 30, Done/reopen and the end picker. Observe the **complete visible Done label** in screenshots and the close button's AX target, not only a style value. Maximum captures are `max-start-picker`, `max-15-to-30`, `max-45-to-30`, `max-after-swipe`, `max-reopened-start`, `max-end-picker`. Physical taps (`axe tap --tap-style physical`) and XcodeBuildMCP touch/type actions were used when generic synthetic taps did not activate RN buttons.

`capture_native.py` saves unmodified `axe describe-ui` output and `simctl io screenshot` PNGs. `summarize_native.py` validates close target inside 390×844 with dimensions ≥44×44 and derives selected rows from actual AX centers; screenshots were separately inspected for complete labels. It asserts four neighbor-tap results, both reopen/end selections and settled swipes. It does not derive native layout from component styles.

Restore the device's default size and relaunch Expo Go before final form submission: retained broader form text showed mixed cached sizes after the content-size switch, so intermediate `final-form-before-send` is not the clean accepted form. The fresh default form shows 5 October 2026, 11:30 AM–12:30 PM, Sydney time. Submit once and observe proposed booking detail (`after-native-submit`). `native_recording_api.py` provided an in-memory, private HTTP recording wrapper on API 8152; it did not edit the app. `verify_native_data.py` compared that actual 201 request and the literal PostgreSQL row.

Observed exact agreement: form 2026-10-05 11:30–12:30 Sydney → HTTP `2026-10-05T00:30:00.000Z`–`2026-10-05T01:30:00.000Z` → database 00:30+00–01:30+00. The static verifier intentionally pins this run's booking/date receipt; adapt it explicitly for another date/fixture, preserving the form/HTTP/literal-row equality assertion.

The dedicated simulator was shut down after evidence capture. Default/maximum picker coverage passes here. Physical devices, Android, VoiceOver, signed builds, real pushes and broad form accessibility are NOT_RUN or outside this narrow result.
