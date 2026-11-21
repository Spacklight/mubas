-- Showcase: students share talents, projects and knowledge.
-- Posts, comments and likes live in the database. Photos are stored in the
-- Hugging Face dataset; only the file path is kept here.

create table if not exists showcase_items (
  id serial primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  kind text not null default 'post',
  title text not null,
  body text not null default '',
  category text not null default 'Talent',
  media_path text,
  media_type text,
  link_url text,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  constraint showcase_kind_chk check (kind in ('post', 'image', 'video'))
);

create index if not exists showcase_created_idx on showcase_items (created_at desc);
create index if not exists showcase_user_idx on showcase_items (user_id);

create table if not exists showcase_likes (
  item_id integer not null references showcase_items (id) on delete cascade,
  user_id text not null references profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create table if not exists showcase_comments (
  id serial primary key,
  item_id integer not null references showcase_items (id) on delete cascade,
  user_id text not null references profiles (user_id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists showcase_comments_item_idx on showcase_comments (item_id, created_at);
