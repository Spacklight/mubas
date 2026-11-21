-- Zapa Content: uploaded videos (stored in the Hugging Face dataset), views,
-- shares, poster images, and 24-hour stories.

alter table showcase_items add column views integer not null default 0;
alter table showcase_items add column shares integer not null default 0;
alter table showcase_items add column thumb_path text;
alter table showcase_items add column media_oid text;
alter table showcase_items add column media_size integer;
alter table showcase_items add column upload_plan text;
alter table showcase_items add column pending boolean not null default false;

create table if not exists showcase_views (
  item_id integer not null references showcase_items (id) on delete cascade,
  user_id text not null references profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create table if not exists stories (
  id serial primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  media_path text not null,
  caption text not null default '',
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists stories_created_idx on stories (created_at desc);
create index if not exists stories_user_idx on stories (user_id);
