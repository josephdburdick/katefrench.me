CREATE TABLE booking_suggestions (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  answers TEXT NOT NULL,
  start_at TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'replaced')),
  token_hash TEXT NOT NULL UNIQUE,
  answered_at TEXT
);
