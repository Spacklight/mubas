create table if not exists schools (
  id text primary key,
  name text not null,
  short_name text not null,
  summary text not null
);

create table if not exists programmes (
  id text primary key,
  school_id text not null references schools (id),
  department text not null,
  name text not null,
  level text not null
);

create table if not exists profiles (
  user_id text primary key,
  full_name text not null,
  auth_email text not null,
  campus_email text,
  role text not null default 'student',
  role_confirmed boolean not null default false,
  account_status text not null default 'active',
  school_id text references schools (id),
  department text,
  programme_id text references programmes (id),
  study_level text,
  study_mode text,
  academic_year text,
  bio text not null default '',
  interests text not null default '',
  skills text not null default '',
  visibility text not null default 'campus',
  email_domain_ok boolean not null default false,
  email_confirmed boolean not null default false,
  notify_messages boolean not null default true,
  notify_social boolean not null default true,
  notify_campus boolean not null default true,
  avatar_data text,
  cover_data text,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_chk check (role in ('student', 'lecturer', 'staff', 'admin')),
  constraint profiles_status_chk check (account_status in ('active', 'suspended', 'withdrawn')),
  constraint profiles_visibility_chk check (visibility in ('campus', 'friends'))
);

create unique index if not exists profiles_campus_email_uq on profiles (lower(campus_email));
create index if not exists profiles_programme_idx on profiles (programme_id, academic_year);
create index if not exists profiles_school_idx on profiles (school_id);

create table if not exists email_checks (
  user_id text primary key references profiles (user_id) on delete cascade,
  email text not null,
  status text not null,
  updated_at timestamptz not null default now()
);

create table if not exists friend_requests (
  id serial primary key,
  from_user text not null references profiles (user_id) on delete cascade,
  to_user text not null references profiles (user_id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (from_user, to_user),
  constraint friend_requests_status_chk check (status in ('pending', 'accepted', 'rejected'))
);

create table if not exists friendships (
  user_a text not null references profiles (user_id) on delete cascade,
  user_b text not null references profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  constraint friendships_order_chk check (user_a < user_b)
);

create table if not exists follows (
  follower_id text not null references profiles (user_id) on delete cascade,
  following_id text not null references profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id)
);

create table if not exists blocks (
  blocker_id text not null references profiles (user_id) on delete cascade,
  blocked_id text not null references profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists communities (
  id serial primary key,
  slug text not null unique,
  name text not null,
  school_id text references schools (id),
  programme_id text references programmes (id),
  summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists community_members (
  community_id integer not null references communities (id) on delete cascade,
  user_id text not null references profiles (user_id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (community_id, user_id),
  constraint community_members_role_chk check (role in ('member', 'pending', 'rep'))
);

create table if not exists posts (
  id serial primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  body text not null,
  audience text not null default 'campus',
  kind text not null default 'note',
  link_url text,
  community_id integer references communities (id) on delete cascade,
  shared_post_id integer references posts (id) on delete set null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  constraint posts_audience_chk check (audience in ('campus', 'friends', 'community')),
  constraint posts_kind_chk check (kind in ('note', 'question', 'material'))
);

create index if not exists posts_created_idx on posts (created_at desc);
create index if not exists posts_community_idx on posts (community_id, created_at desc);

create table if not exists comments (
  id serial primary key,
  post_id integer not null references posts (id) on delete cascade,
  user_id text not null references profiles (user_id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_post_idx on comments (post_id, created_at);

create table if not exists post_likes (
  post_id integer not null references posts (id) on delete cascade,
  user_id text not null references profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists post_saves (
  post_id integer not null references posts (id) on delete cascade,
  user_id text not null references profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists conversations (
  id serial primary key,
  kind text not null default 'direct',
  title text not null default '',
  created_by text not null references profiles (user_id),
  created_at timestamptz not null default now(),
  constraint conversations_kind_chk check (kind in ('direct', 'group'))
);

create table if not exists conversation_members (
  conversation_id integer not null references conversations (id) on delete cascade,
  user_id text not null references profiles (user_id) on delete cascade,
  role text not null default 'member',
  last_read_at timestamptz,
  primary key (conversation_id, user_id),
  constraint conversation_members_role_chk check (role in ('member', 'admin'))
);

create table if not exists messages (
  id serial primary key,
  conversation_id integer not null references conversations (id) on delete cascade,
  user_id text not null references profiles (user_id),
  body text not null,
  attachment_url text,
  reply_to integer,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on messages (conversation_id, created_at);

create table if not exists announcements (
  id serial primary key,
  title text not null,
  body text not null,
  category text not null,
  source_label text not null,
  source_url text,
  official boolean not null default false,
  author_id text references profiles (user_id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id serial primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  href text not null default '/campus',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

create table if not exists videos (
  id serial primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null,
  external_url text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists video_comments (
  id serial primary key,
  video_id integer not null references videos (id) on delete cascade,
  user_id text not null references profiles (user_id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists video_likes (
  video_id integer not null references videos (id) on delete cascade,
  user_id text not null references profiles (user_id) on delete cascade,
  primary key (video_id, user_id)
);

create table if not exists subscriptions (
  subscriber_id text not null references profiles (user_id) on delete cascade,
  creator_id text not null references profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (subscriber_id, creator_id)
);

create table if not exists playlists (
  id serial primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists playlist_items (
  playlist_id integer not null references playlists (id) on delete cascade,
  video_id integer not null references videos (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (playlist_id, video_id)
);

create table if not exists library_applications (
  id serial primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  provider_name text not null,
  kind text not null,
  email text not null,
  phone text not null,
  organisation text not null default '',
  description text not null,
  materials text not null,
  audience text not null,
  reason text not null,
  agreed boolean not null default false,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint library_applications_status_chk check (status in ('pending', 'approved', 'rejected'))
);

create table if not exists libraries (
  id serial primary key,
  owner_id text not null references profiles (user_id),
  application_id integer references library_applications (id) on delete set null,
  name text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists library_members (
  library_id integer not null references libraries (id) on delete cascade,
  user_id text not null references profiles (user_id) on delete cascade,
  role text not null,
  primary key (library_id, user_id),
  constraint library_members_role_chk check (role in ('owner', 'admin', 'contributor', 'reader'))
);

create table if not exists library_resources (
  id serial primary key,
  library_id integer not null references libraries (id) on delete cascade,
  uploader_id text not null references profiles (user_id),
  title text not null,
  description text not null default '',
  subject text not null default '',
  programme_id text references programmes (id),
  author_name text not null default '',
  category text not null,
  file_type text not null default 'link',
  external_url text,
  access text not null default 'campus',
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  constraint library_resources_access_chk check (access in ('campus', 'members'))
);

create table if not exists reports (
  id serial primary key,
  reporter_id text not null references profiles (user_id) on delete cascade,
  target_type text not null,
  target_id text not null,
  reason text not null,
  details text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint reports_status_chk check (status in ('open', 'reviewed', 'dismissed'))
);

create index if not exists reports_status_idx on reports (status, created_at desc);

create table if not exists audit_logs (
  id serial primary key,
  actor_id text not null,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists rate_hits (
  user_id text not null,
  action text not null,
  hit_at timestamptz not null default now()
);

create index if not exists rate_hits_idx on rate_hits (user_id, action, hit_at desc);

insert into schools (id, name, short_name, summary) values
  ('soe', 'School of Engineering', 'SOE', 'Electrical, mechanical, civil and mining engineering. Summarised from the public MUBAS schools page.'),
  ('sost', 'School of Science and Technology', 'SOST', 'Applied science and technology, including computing, mathematics, food science and environmental fields.'),
  ('sobes', 'School of Business and Economic Sciences', 'SOBES', 'Accountancy, management, finance, economics and related professional programmes.'),
  ('secoms', 'School of Education, Communication and Media Studies', 'SECOMS', 'Education, language and communication, and journalism and media studies.'),
  ('sobe', 'School of Built Environment', 'SOBE', 'Architecture, quantity surveying, land surveying, real estate and planning.')
on conflict (id) do nothing;

insert into programmes (id, school_id, department, name, level) values
  ('bsc-civil', 'soe', 'Civil Engineering', 'Bachelor of Science in Civil Engineering', 'Undergraduate'),
  ('bsc-electrical', 'soe', 'Electrical Engineering', 'Bachelor of Science in Electrical Engineering', 'Undergraduate'),
  ('bsc-mechanical', 'soe', 'Mechanical Engineering', 'Bachelor of Science in Mechanical Engineering', 'Undergraduate'),
  ('bsc-mining', 'soe', 'Mining Engineering', 'Bachelor of Science in Mining Engineering', 'Undergraduate'),
  ('cert-electrical', 'soe', 'Electrical Engineering', 'Certificate in Electrical Installation', 'Certificate'),
  ('other-soe', 'soe', 'Other', 'My engineering programme is not listed', 'Generic'),
  ('bsc-it', 'sost', 'Computing and Information Technology', 'Bachelor of Science in Information Technology', 'Undergraduate'),
  ('bsc-mis', 'sost', 'Computing and Information Technology', 'Bachelor of Science in Management Information Systems', 'Undergraduate'),
  ('bsc-maths', 'sost', 'Mathematical Sciences', 'Bachelor of Science in Mathematical Sciences', 'Undergraduate'),
  ('bsc-env', 'sost', 'Environmental Sciences', 'Bachelor of Science in Environmental Management', 'Undergraduate'),
  ('bsc-food', 'sost', 'Applied Sciences', 'Bachelor of Science in Food Science and Technology', 'Undergraduate'),
  ('cert-computer', 'sost', 'Computing and Information Technology', 'Certificate in Computer Maintenance', 'Certificate'),
  ('other-sost', 'sost', 'Other', 'My science or technology programme is not listed', 'Generic'),
  ('bacc', 'sobes', 'Accountancy', 'Bachelor of Accountancy', 'Undergraduate'),
  ('bba', 'sobes', 'Management', 'Bachelor of Business Administration', 'Undergraduate'),
  ('bcom', 'sobes', 'Commerce', 'Bachelor of Commerce', 'Undergraduate'),
  ('bsc-economics', 'sobes', 'Economics', 'Economics', 'Undergraduate'),
  ('dip-procurement', 'sobes', 'Management', 'Diploma in Procurement and Supply Chain Management', 'Diploma'),
  ('mba', 'sobes', 'Management', 'Master of Business Administration', 'Postgraduate'),
  ('other-sobes', 'sobes', 'Other', 'My business programme is not listed', 'Generic'),
  ('ba-journalism', 'secoms', 'Journalism and Media Studies', 'Bachelor of Arts in Journalism', 'Undergraduate'),
  ('b-buscomm', 'secoms', 'Language and Communication', 'Bachelor of Business Communication', 'Undergraduate'),
  ('bed-bcs', 'secoms', 'Applied Education', 'Bachelor of Education in Business and Computer Studies', 'Undergraduate'),
  ('ma-devcomm', 'secoms', 'Language and Communication', 'Master of Development Communication', 'Postgraduate'),
  ('uce', 'secoms', 'Applied Education', 'University Certificate in Education', 'Certificate'),
  ('other-secoms', 'secoms', 'Other', 'My education or media programme is not listed', 'Generic'),
  ('bsc-architecture', 'sobe', 'Architecture', 'Bachelor of Science in Architectural Studies', 'Undergraduate'),
  ('bsc-qs', 'sobe', 'Quantity Surveying', 'Bachelor of Science in Quantity Surveying (Hons)', 'Undergraduate'),
  ('bsc-land', 'sobe', 'Land Surveying', 'Bachelor of Science in Land Surveying (Hons)', 'Undergraduate'),
  ('bsc-realestate', 'sobe', 'Land Economy', 'Bachelor of Science in Real Estate', 'Undergraduate'),
  ('bsc-urp', 'sobe', 'Physical Planning', 'Bachelor of Science in Urban and Regional Planning (Hons)', 'Undergraduate'),
  ('dip-construction', 'sobe', 'Construction', 'Diploma in Construction Management', 'Diploma'),
  ('msc-envdev', 'sobe', 'Built Environment', 'Master of Science in Environment and Development', 'Postgraduate'),
  ('other-sobe', 'sobe', 'Other', 'My built-environment programme is not listed', 'Generic')
on conflict (id) do nothing;

insert into communities (slug, name, school_id, programme_id, summary)
select p.id, p.name, p.school_id, p.id,
  'Programme room for ' || p.name || '. Official requirements stay on mubas.ac.mw.'
from programmes p
on conflict (slug) do nothing;

insert into communities (slug, name, school_id, programme_id, summary)
select 'school-' || s.id, s.short_name || ' lounge', s.id, null,
  'Shared room for ' || s.name || '.'
from schools s
on conflict (slug) do nothing;

insert into announcements (title, body, category, source_label, source_url, official)
select 'How to apply',
  'Application steps are published by the university. This card only points there. It is not an offer and not a decision.',
  'Registration',
  'Link published on mubas.ac.mw',
  'https://www.mubas.ac.mw/admissions/how-to-apply',
  false
where not exists (
  select 1 from announcements where source_url = 'https://www.mubas.ac.mw/admissions/how-to-apply'
);

insert into announcements (title, body, category, source_label, source_url, official)
select 'Academic calendar',
  'Dates are set by the university. Open the calendar itself before you plan around a deadline.',
  'Academic calendar',
  'Link published on the MUBAS e-services page',
  'https://calendar.mubas.ac.mw/',
  false
where not exists (
  select 1 from announcements where source_url = 'https://calendar.mubas.ac.mw/'
);

insert into announcements (title, body, category, source_label, source_url, official)
select 'Student e-services',
  'SMIS, USIMS, MUBAS One, Moodle, accommodation and other systems are listed on the university e-services page.',
  'General',
  'Link published on mubas.ac.mw',
  'https://www.mubas.ac.mw/eservices',
  false
where not exists (
  select 1 from announcements where source_url = 'https://www.mubas.ac.mw/eservices'
);

insert into announcements (title, body, category, source_label, source_url, official)
select 'Vacancies',
  'Jobs and other calls are posted by the university. Read the original notice before you apply.',
  'Vacancies',
  'Link published on mubas.ac.mw',
  'https://www.mubas.ac.mw/vacancies',
  false
where not exists (
  select 1 from announcements where source_url = 'https://www.mubas.ac.mw/vacancies'
);

insert into announcements (title, body, category, source_label, source_url, official)
select 'University news',
  'News and events on the public MUBAS site. Zapa does not rewrite them as its own announcements.',
  'Events',
  'Link published on mubas.ac.mw',
  'https://www.mubas.ac.mw/news',
  false
where not exists (
  select 1 from announcements where source_url = 'https://www.mubas.ac.mw/news'
);
