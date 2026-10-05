-- 1. Current and configured zone, and any per-database/per-role override.
SHOW timezone;
SELECT setting, source, sourcefile FROM pg_settings WHERE name = 'TimeZone';
SELECT coalesce(d.datname, '*') AS db, coalesce(r.rolname, '*') AS role, s.setconfig
  FROM pg_db_role_setting s
  LEFT JOIN pg_database d ON d.oid = s.setdatabase
  LEFT JOIN pg_roles r ON r.oid = s.setrole;

-- 2. Per-period writing zone (CONTRACTS §9): naive bookings.created_at vs the
--    aware scheduled_at of the proposal notice written by the same request.
SELECT date_trunc('month', n.scheduled_at) AS month,
       round(extract(epoch FROM b.created_at - (n.scheduled_at AT TIME ZONE 'UTC')) / 3600) AS offset_hours,
       count(*)
  FROM bookings b
  JOIN notification_events n ON n.booking_id = b.id AND n.notification_type = 'proposal_received'
 GROUP BY 1, 2 ORDER BY 1, 2;

-- 3. Range of naive history per audit column (what periods need a zone).
SELECT 'messages.created_at' AS col, min(created_at), max(created_at), count(*) FROM messages
UNION ALL SELECT 'bookings.created_at', min(created_at), max(created_at), count(*) FROM bookings
UNION ALL SELECT 'bookings.updated_at', min(updated_at), max(updated_at), count(*) FROM bookings
UNION ALL SELECT 'blocks.created_at', min(created_at), max(created_at), count(*) FROM blocks
UNION ALL SELECT 'reports.created_at', min(created_at), max(created_at), count(*) FROM reports
UNION ALL SELECT 'notification_events.created_at', min(created_at), max(created_at), count(*) FROM notification_events
UNION ALL SELECT 'push_tokens.created_at', min(created_at), max(created_at), count(*) FROM push_tokens
UNION ALL SELECT 'calendar_booking_syncs.created_at', min(created_at), max(created_at), count(*) FROM calendar_booking_syncs
UNION ALL SELECT 'google_calendar_tokens.connected_at', min(connected_at), max(connected_at), count(*) FROM google_calendar_tokens;

-- 4. Label rows that are ambiguous IF the history was written in Sydney time:
--    naive values inside a fall-back repeated hour (first Sunday of April,
--    02:00–03:00 local). Extend the list to cover the range found in step 3.
WITH windows(start_at) AS (VALUES (TIMESTAMP '2025-04-06 02:00'), (TIMESTAMP '2026-04-05 02:00'))
SELECT w.start_at, 'messages' AS tbl, count(*) FROM windows w JOIN messages m
    ON m.created_at >= w.start_at AND m.created_at < w.start_at + interval '1 hour' GROUP BY 1, 2
UNION ALL
SELECT w.start_at, 'bookings', count(*) FROM windows w JOIN bookings b
    ON b.created_at >= w.start_at AND b.created_at < w.start_at + interval '1 hour' GROUP BY 1, 2;
-- (repeat for the other audit columns as needed; any non-zero count is
--  ambiguous under a Sydney history and cannot be resolved uniquely)
