-- Sift schema. Runs once per server process (src/lib/server/db.ts), so every statement is idempotent.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  publik_handle text unique,
  timezone text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_active_day date,
  context text not null default '', -- what matters to the person, in their words
  last_sync_at timestamptz,
  synced jsonb not null default '{}'::jsonb -- per account: when it was last read up to
);

create table if not exists sessions (
  id text primary key, -- sha256(cookie value)
  user_id uuid references users(id) on delete cascade,
  install_id uuid not null, -- this session's publik install
  publik_key_enc text, -- this session's publik key, encrypted with APP_SECRET
  claim_url text,
  claim_state text not null default 'anonymous',
  wallet_checked_at timestamptz,
  last_app_opened_at timestamptz,
  last_active_session_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source text not null, -- gmail | outlook | slack
  external_id text not null, -- gmail message id, outlook message id, slack "<channel>:<ts>"
  thread_id text, -- gmail thread, outlook conversation, slack channel
  sender text not null,
  subject text,
  body text not null,
  received_at timestamptz not null,
  url text,
  bucket text, -- important | later | low; null until sorted
  summary text,
  reason text,
  needs_reply boolean not null default false,
  injection boolean not null default false,
  moved_by_you boolean not null default false,
  done_at timestamptz,
  draft text,
  sent_at timestamptz, -- set before sending: at most one send per message
  sent_ok boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists messages_user_external_idx on messages(user_id, source, external_id);
create index if not exists messages_user_received_idx on messages(user_id, received_at desc);

-- Every time the person moves a message to another bucket. The sorter reads the latest ones as examples.
create table if not exists corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  sender text not null,
  subject text,
  from_bucket text,
  to_bucket text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists corrections_user_idx on corrections(user_id, created_at desc);

create table if not exists events (
  id bigserial primary key,
  user_id uuid references users(id) on delete cascade,
  session_id text,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_name_time_idx on events(name, created_at);
