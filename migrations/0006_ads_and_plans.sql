-- Zapa Ads, payment records, and paid Zapa AI plans.

alter table showcase_items add column is_ad boolean not null default false;

create table if not exists payments (
  id serial primary key,
  user_id text not null,
  purpose text not null,
  ref_id integer,
  tier integer,
  expected_amount integer not null,
  status text not null default 'pending_review',
  reason text not null default '',
  amount integer,
  txn_id text,
  recipient text,
  sender text,
  paid_at text,
  provider text,
  confidence real,
  proof_path text,
  image_hash text,
  extracted text,
  reviewed_by text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint payments_status_chk check (status in ('approved', 'pending_review', 'rejected', 'revoked'))
);

create unique index if not exists payments_txn_uq on payments (txn_id);
create unique index if not exists payments_hash_uq on payments (image_hash);
create index if not exists payments_user_idx on payments (user_id, id);
create index if not exists payments_status_idx on payments (status, id);

create table if not exists ads (
  id serial primary key,
  user_id text not null,
  item_id integer not null references showcase_items (id) on delete cascade,
  business text not null,
  phone text not null,
  cta_url text,
  status text not null default 'awaiting_payment',
  payment_id integer,
  starts_at timestamptz,
  ends_at timestamptz,
  impressions integer not null default 0,
  clicks integer not null default 0,
  created_at timestamptz not null default now(),
  constraint ads_status_chk check (status in ('awaiting_payment', 'pending_review', 'active', 'paused', 'rejected', 'revoked'))
);

create index if not exists ads_user_idx on ads (user_id, id);
create index if not exists ads_status_idx on ads (status, ends_at);

create table if not exists ai_plans (
  id serial primary key,
  user_id text not null,
  tier integer not null,
  expires_at timestamptz not null,
  payment_id integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_plans_user_idx on ai_plans (user_id, expires_at);
