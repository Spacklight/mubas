-- Daily limits, saved content, and Zapa AI (Gemini keys, chats, files).

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- One row per member, per Malawi calendar day, per kind ('video', 'story', 'ai').
create table if not exists daily_usage (
  user_id text not null,
  day text not null,
  kind text not null,
  used integer not null default 0,
  primary key (user_id, day, kind)
);

create table if not exists showcase_saves (
  item_id integer not null references showcase_items (id) on delete cascade,
  user_id text not null references profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create table if not exists ai_keys (
  id serial primary key,
  label text not null,
  key_cipher text not null,
  key_tail text not null,
  enabled boolean not null default true,
  note text not null default '',
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists ai_requests (
  id serial primary key,
  key_id integer not null references ai_keys (id) on delete cascade,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_requests_key_idx on ai_requests (key_id, model, created_at);

create table if not exists ai_blocks (
  key_id integer not null references ai_keys (id) on delete cascade,
  model text not null,
  blocked_until timestamptz not null,
  reason text not null default '',
  primary key (key_id, model)
);

create table if not exists ai_chats (
  id serial primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  role text not null,
  body text not null,
  file_name text,
  created_at timestamptz not null default now(),
  constraint ai_chats_role_chk check (role in ('user', 'model'))
);

create index if not exists ai_chats_user_idx on ai_chats (user_id, id);

create table if not exists ai_files (
  id serial primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  name text not null,
  size integer not null,
  digest text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_files_user_idx on ai_files (user_id, id);
