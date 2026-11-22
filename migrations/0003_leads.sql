CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  intent TEXT NOT NULL,
  answers TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  from_section TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'replied', 'call-booked', 'won', 'lost'))
);
