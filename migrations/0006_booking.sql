CREATE TABLE booking_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  weekdays TEXT NOT NULL DEFAULT '1,2,3,4,5'
    CHECK (weekdays <> '' AND weekdays NOT GLOB '*[^1-7,]*'),
  start_hour INTEGER NOT NULL DEFAULT 9 CHECK (start_hour >= 0),
  end_hour INTEGER NOT NULL DEFAULT 17
    CHECK (end_hour > start_hour AND end_hour <= 24),
  call_minutes INTEGER NOT NULL DEFAULT 20 CHECK (call_minutes > 0),
  notice_hours INTEGER NOT NULL DEFAULT 24 CHECK (notice_hours >= 0),
  time_zone TEXT NOT NULL DEFAULT 'America/New_York'
);

INSERT INTO booking_settings (id) VALUES (1);

CREATE TABLE booking_requests (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  answers TEXT NOT NULL,
  start_at TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'declined')),
  confirm_hash TEXT NOT NULL UNIQUE,
  decline_hash TEXT NOT NULL UNIQUE,
  answered_at TEXT
);
