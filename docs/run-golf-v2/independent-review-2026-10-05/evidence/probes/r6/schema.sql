-- Minimal faithful schema for the R6 procedure validation (disposable database only).
--
-- Mirrors the tables and column TYPES that the R6 procedure reads, from
-- apps/api/alembic/versions/0003_messages_and_bookings.py and
-- 0004_google_calendar_notifications_safety.py: the nine naive audit columns
-- are `timestamp without time zone DEFAULT now()`, `notification_events.scheduled_at`
-- and the booking bounds are `timestamptz`. Columns the procedure never reads
-- are reduced; foreign keys to users/matches are omitted (no such tables here).
-- The bookings -> notification_events / calendar_booking_syncs links are kept.

CREATE TABLE messages (
    id         uuid PRIMARY KEY,
    match_id   uuid NOT NULL,
    sender_id  uuid NOT NULL,
    body       varchar(1000) NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE bookings (
    id          uuid PRIMARY KEY,
    match_id    uuid NOT NULL,
    proposer_id uuid NOT NULL,
    partner_id  uuid NOT NULL,
    sport       varchar(20) NOT NULL,
    starts_at   timestamptz NOT NULL,
    ends_at     timestamptz NOT NULL,
    status      varchar(20) NOT NULL DEFAULT 'proposed',
    created_at  timestamp without time zone NOT NULL DEFAULT now(),
    updated_at  timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE notification_events (
    id                uuid PRIMARY KEY,
    user_id           uuid NOT NULL,
    booking_id        uuid REFERENCES bookings (id) ON DELETE CASCADE,
    notification_type varchar(50) NOT NULL,
    title             varchar(256) NOT NULL,
    body              varchar(512) NOT NULL,
    push_token        varchar(256),
    scheduled_at      timestamptz NOT NULL,
    sent_at           timestamptz,
    failed_reason     text,
    created_at        timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE blocks (
    id         uuid PRIMARY KEY,
    blocker_id uuid NOT NULL,
    blocked_id uuid NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE reports (
    id          uuid PRIMARY KEY,
    reporter_id uuid NOT NULL,
    reported_id uuid NOT NULL,
    reason      varchar(50) NOT NULL,
    created_at  timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE push_tokens (
    id         uuid PRIMARY KEY,
    user_id    uuid NOT NULL,
    token      varchar(256) NOT NULL UNIQUE,
    platform   varchar(20) NOT NULL DEFAULT 'ios',
    created_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE calendar_booking_syncs (
    id              uuid PRIMARY KEY,
    booking_id      uuid NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
    user_id         uuid NOT NULL,
    google_event_id varchar(256) NOT NULL,
    created_at      timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE google_calendar_tokens (
    id           uuid PRIMARY KEY,
    user_id      uuid NOT NULL UNIQUE,
    calendar_id  varchar(256) NOT NULL DEFAULT 'primary',
    connected_at timestamp without time zone NOT NULL DEFAULT now()
);
