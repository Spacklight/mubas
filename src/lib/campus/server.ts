import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import type { Sql } from "@/lib/db";
import {
  ACADEMIC_YEARS,
  ANNOUNCEMENT_CATEGORIES,
  LIBRARY_CATEGORIES,
  REPORT_REASONS,
  STUDY_LEVELS,
  STUDY_MODES,
  VIDEO_CATEGORIES,
  cleanHttpUrl,
  cleanText,
  isMubasEmail,
} from "@/lib/campus/logic";
import type {
  Announcement,
  Audience,
  Comment,
  CommunityCard,
  ConversationCard,
  ChatMessage,
  Directory,
  Fail,
  LibraryApplication,
  LibraryCard,
  LibraryResource,
  Note,
  PersonPreview,
  Post,
  PostKind,
  Profile,
  Programme,
  Relation,
  Role,
  School,
  VideoItem,
} from "@/lib/campus/types";

type Row = Record<string, unknown>;

function fail(error: string): Fail {
  return { ok: false, error };
}

function str(row: Row, key: string): string {
  const value = row[key];
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function nullable(row: Row, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function num(row: Row, key: string): number {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function flag(row: Row, key: string): boolean {
  const value = row[key];
  return value === true || value === "t" || value === "true" || value === 1;
}

function asRole(value: string): Role {
  if (value === "lecturer" || value === "staff" || value === "admin") return value;
  return "student";
}

function asAudience(value: string): Audience {
  if (value === "friends" || value === "community") return value;
  return "campus";
}

function asKind(value: string): PostKind {
  if (value === "question" || value === "material") return value;
  return "note";
}

function asRelation(value: string): Relation {
  if (value === "self" || value === "friends" || value === "outgoing" || value === "incoming") return value;
  return "none";
}

function oneOf(value: string | undefined, allowed: readonly string[], label: string): string | Fail {
  const next = (value ?? "").trim();
  if (!next || !allowed.includes(next)) return fail(`Choose a valid ${label}.`);
  return next;
}

function operators(): string[] {
  return (process.env.ZAPA_ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

const RATE: Record<string, { limit: number; window: string }> = {
  post: { limit: 12, window: "10 minutes" },
  comment: { limit: 30, window: "10 minutes" },
  message: { limit: 40, window: "5 minutes" },
  friend: { limit: 30, window: "1 hour" },
  report: { limit: 12, window: "1 hour" },
  video: { limit: 8, window: "1 hour" },
  email: { limit: 5, window: "10 minutes" },
};

async function db() {
  const { getSql, dbSource } = await import("@/lib/db");
  return { sql: await getSql(), dbSource };
}

async function limited(sql: Sql, userId: string, action: keyof typeof RATE): Promise<Fail | null> {
  const rule = RATE[action];
  const rows = await sql.query<{ n: number }>(
    `select count(*)::int as n from rate_hits
     where user_id = $1 and action = $2 and hit_at > now() - interval '${rule.window}'`,
    [userId, action],
  );
  if (num(rows[0] ?? {}, "n") >= rule.limit) return fail("Too many requests. Wait a moment and try again.");
  await sql`insert into rate_hits (user_id, action) values (${userId}, ${action})`;
  return null;
}

async function notify(
  sql: Sql,
  userId: string,
  kind: string,
  title: string,
  body: string,
  href: string,
) {
  const column =
    kind === "message" ? "notify_messages" : kind === "announcement" ? "notify_campus" : "notify_social";
  const rows = await sql.query<Row>(
    `select ${column} as on from profiles where user_id = $1 and account_status = 'active'`,
    [userId],
  );
  if (!rows[0] || !flag(rows[0], "on")) return;
  await sql`
    insert into notifications (user_id, kind, title, body, href)
    values (${userId}, ${kind}, ${cleanText(title, 140)}, ${cleanText(body, 240)}, ${href.slice(0, 240)})
  `;
}

async function audit(sql: Sql, actorId: string, action: string, detail: string) {
  await sql`
    insert into audit_logs (actor_id, action, detail)
    values (${actorId}, ${action}, ${cleanText(detail, 300)})
  `;
}

function mapProfile(row: Row): Profile {
  return {
    userId: str(row, "user_id"),
    fullName: str(row, "full_name"),
    authEmail: str(row, "auth_email"),
    campusEmail: nullable(row, "campus_email"),
    role: asRole(str(row, "role")),
    roleConfirmed: flag(row, "role_confirmed"),
    accountStatus: str(row, "account_status"),
    schoolId: nullable(row, "school_id"),
    schoolName: nullable(row, "school_name"),
    schoolShort: nullable(row, "school_short"),
    department: nullable(row, "department"),
    programmeId: nullable(row, "programme_id"),
    programmeName: nullable(row, "programme_name"),
    studyLevel: nullable(row, "study_level"),
    studyMode: nullable(row, "study_mode"),
    academicYear: nullable(row, "academic_year"),
    bio: str(row, "bio"),
    interests: str(row, "interests"),
    skills: str(row, "skills"),
    visibility: str(row, "visibility") === "friends" ? "friends" : "campus",
    emailDomainOk: flag(row, "email_domain_ok"),
    emailConfirmed: flag(row, "email_confirmed"),
    notifyMessages: flag(row, "notify_messages"),
    notifySocial: flag(row, "notify_social"),
    notifyCampus: flag(row, "notify_campus"),
    avatarData: nullable(row, "avatar_data"),
    coverData: nullable(row, "cover_data"),
    lastSeen: str(row, "last_seen"),
    createdAt: str(row, "created_at"),
  };
}

const PROFILE_FROM = `
  from profiles p
  left join schools s on s.id = p.school_id
  left join programmes g on g.id = p.programme_id
`;

async function ownerRow(sql: Sql, userId: string): Promise<Row | null> {
  const rows = await sql.query<Row>(
    `select p.*, s.name as school_name, s.short_name as school_short, g.name as programme_name
     ${PROFILE_FROM} where p.user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function sessionEmail(sql: Sql, userId: string): Promise<string> {
  const rows = await sql.query<Row>(`select email from "user" where id = $1`, [userId]);
  return str(rows[0] ?? {}, "email").toLowerCase();
}

async function active(sql: Sql, userId: string): Promise<Profile | Fail> {
  const row = await ownerRow(sql, userId);
  if (!row) return fail("Finish your campus profile first.");
  const profile = mapProfile(row);
  if (profile.accountStatus === "suspended") return fail("This account is suspended.");
  if (profile.accountStatus === "withdrawn") return fail("This profile is closed.");
  return profile;
}

function isFail(value: Profile | Fail): value is Fail {
  return "ok" in value && value.ok === false;
}

async function isAdmin(sql: Sql, userId: string): Promise<boolean> {
  const row = await ownerRow(sql, userId);
  if (!row) return false;
  const profile = mapProfile(row);
  return profile.role === "admin" || operators().includes(profile.authEmail.toLowerCase());
}

async function blockedEither(sql: Sql, a: string, b: string): Promise<boolean> {
  const rows = await sql<{ n: number }>`
    select count(*)::int as n from blocks
    where (blocker_id = ${a} and blocked_id = ${b})
       or (blocker_id = ${b} and blocked_id = ${a})
  `;
  return num(rows[0] ?? {}, "n") > 0;
}

function mapAnnouncement(row: Row): Announcement {
  return {
    id: num(row, "id"),
    title: str(row, "title"),
    body: str(row, "body"),
    category: str(row, "category"),
    sourceLabel: str(row, "source_label"),
    sourceUrl: nullable(row, "source_url"),
    official: flag(row, "official"),
    createdAt: str(row, "created_at"),
  };
}

function mapPost(row: Row): Post {
  const sharedId = num(row, "shared_id");
  return {
    id: num(row, "id"),
    userId: str(row, "user_id"),
    author: str(row, "full_name"),
    role: asRole(str(row, "role")),
    roleConfirmed: flag(row, "role_confirmed"),
    programmeName: nullable(row, "programme_name"),
    schoolShort: nullable(row, "school_short"),
    body: str(row, "body"),
    audience: asAudience(str(row, "audience")),
    kind: asKind(str(row, "kind")),
    linkUrl: nullable(row, "link_url"),
    communityName: nullable(row, "community_name"),
    communitySlug: nullable(row, "community_slug"),
    shared: sharedId
      ? { id: sharedId, author: str(row, "shared_author") || "Someone", body: str(row, "shared_body") }
      : null,
    likeCount: num(row, "like_count"),
    commentCount: num(row, "comment_count"),
    liked: flag(row, "liked"),
    saved: flag(row, "saved"),
    createdAt: str(row, "created_at"),
  };
}

async function fetchPosts(
  sql: Sql,
  me: string,
  options: { offset: number; slug?: string; saved?: boolean; authorId?: string },
): Promise<Post[]> {
  const params: unknown[] = [me];
  let where = `
    p.hidden = false
    and pr.account_status = 'active'
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = $1 and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = $1)
    )
  `;
  if (options.slug) {
    params.push(options.slug);
    where += ` and c.slug = $${params.length}`;
  } else if (options.saved) {
    where += ` and exists (select 1 from post_saves sv2 where sv2.post_id = p.id and sv2.user_id = $1)`;
  } else if (options.authorId) {
    params.push(options.authorId);
    where += ` and p.user_id = $${params.length} and (p.audience = 'campus' or p.user_id = $1 or (p.audience = 'friends' and exists (
      select 1 from friendships f where f.user_a = least(p.user_id, $1) and f.user_b = greatest(p.user_id, $1)
    )))`;
  } else {
    where += ` and (
      p.user_id = $1
      or p.audience = 'campus'
      or (p.audience = 'friends' and exists (
        select 1 from friendships f where f.user_a = least(p.user_id, $1) and f.user_b = greatest(p.user_id, $1)
      ))
      or (p.audience = 'community' and exists (
        select 1 from community_members m
        where m.community_id = p.community_id and m.user_id = $1 and m.role <> 'pending'
      ))
    )`;
  }
  params.push(options.offset);
  const offsetRef = `$${params.length}`;
  const rows = await sql.query<Row>(
    `select p.id, p.user_id, p.body, p.audience, p.kind, p.link_url, p.created_at,
      pr.full_name, pr.role, pr.role_confirmed,
      g.name as programme_name, s.short_name as school_short,
      c.name as community_name, c.slug as community_slug,
      sp.id as shared_id, sp.body as shared_body, sa.full_name as shared_author,
      (select count(*)::int from post_likes l where l.post_id = p.id) as like_count,
      (select count(*)::int from comments cm where cm.post_id = p.id) as comment_count,
      exists(select 1 from post_likes l where l.post_id = p.id and l.user_id = $1) as liked,
      exists(select 1 from post_saves sv where sv.post_id = p.id and sv.user_id = $1) as saved
    from posts p
    join profiles pr on pr.user_id = p.user_id
    left join programmes g on g.id = pr.programme_id
    left join schools s on s.id = pr.school_id
    left join communities c on c.id = p.community_id
    left join posts sp on sp.id = p.shared_post_id and sp.hidden = false
    left join profiles sa on sa.user_id = sp.user_id
    where ${where}
    order by p.created_at desc
    limit 12 offset ${offsetRef}`,
    params,
  );
  return rows.map(mapPost);
}

function mapPerson(row: Row): PersonPreview {
  return {
    userId: str(row, "user_id"),
    fullName: str(row, "full_name"),
    role: asRole(str(row, "role")),
    roleConfirmed: flag(row, "role_confirmed"),
    schoolShort: nullable(row, "school_short"),
    programmeName: nullable(row, "programme_name"),
    studyLevel: nullable(row, "study_level"),
    studyMode: nullable(row, "study_mode"),
    academicYear: nullable(row, "academic_year"),
    department: nullable(row, "department"),
    rank: num(row, "rank") || 6,
    relation: asRelation(str(row, "relation")),
    following: flag(row, "following"),
    mutuals: num(row, "mutuals"),
    hasAvatar: flag(row, "has_avatar"),
  };
}

async function fetchPeople(
  sql: Sql,
  me: string,
  filters: {
    schoolId?: string;
    department?: string;
    programmeId?: string;
    studyLevel?: string;
    studyMode?: string;
    academicYear?: string;
    interest?: string;
  },
  limit: number,
): Promise<PersonPreview[]> {
  const params: unknown[] = [me];
  let extra = "";
  const add = (clause: string, value: string) => {
    params.push(value);
    extra += ` and ${clause.replace("?", `$${params.length}`)}`;
  };
  if (filters.schoolId) add("p.school_id = ?", filters.schoolId);
  if (filters.department) add("p.department = ?", filters.department);
  if (filters.programmeId) add("p.programme_id = ?", filters.programmeId);
  if (filters.studyLevel) add("p.study_level = ?", filters.studyLevel);
  if (filters.studyMode) add("p.study_mode = ?", filters.studyMode);
  if (filters.academicYear) add("p.academic_year = ?", filters.academicYear);
  if (filters.interest) {
    const interest = filters.interest.replace(/[%_]/g, "").trim();
    if (interest) add("p.interests ilike ?", `%${interest}%`);
  }
  params.push(limit);
  const rows = await sql.query<Row>(
    `select p.user_id, p.full_name, p.role, p.role_confirmed, p.study_level, p.study_mode,
      p.academic_year, p.department, s.short_name as school_short, g.name as programme_name,
      (p.avatar_data is not null) as has_avatar,
      case
        when p.programme_id is not null and p.programme_id = me.programme_id and p.academic_year is not null and p.academic_year = me.academic_year then 1
        when p.programme_id is not null and p.programme_id = me.programme_id then 2
        when p.department is not null and p.department = me.department and p.school_id is not null and p.school_id = me.school_id then 3
        when p.school_id is not null and p.school_id = me.school_id then 4
        when p.study_mode is not null and p.study_mode = me.study_mode then 5
        else 6
      end as rank,
      case
        when p.user_id = $1 then 'self'
        when exists (select 1 from friendships f where f.user_a = least(p.user_id, $1) and f.user_b = greatest(p.user_id, $1)) then 'friends'
        when exists (select 1 from friend_requests r where r.from_user = $1 and r.to_user = p.user_id and r.status = 'pending') then 'outgoing'
        when exists (select 1 from friend_requests r where r.from_user = p.user_id and r.to_user = $1 and r.status = 'pending') then 'incoming'
        else 'none'
      end as relation,
      exists(select 1 from follows fo where fo.follower_id = $1 and fo.following_id = p.user_id) as following,
      (
        select count(*)::int from friendships theirs
        where (theirs.user_a = p.user_id or theirs.user_b = p.user_id)
          and (
            case when theirs.user_a = p.user_id then theirs.user_b else theirs.user_a end
          ) in (
            select case when mine.user_a = $1 then mine.user_b else mine.user_a end
            from friendships mine
            where mine.user_a = $1 or mine.user_b = $1
          )
          and case when theirs.user_a = p.user_id then theirs.user_b else theirs.user_a end <> $1
      ) as mutuals
    from profiles p
    join profiles me on me.user_id = $1
    left join schools s on s.id = p.school_id
    left join programmes g on g.id = p.programme_id
    where p.user_id <> $1
      and p.account_status = 'active'
      and (
        p.visibility = 'campus'
        or exists (select 1 from friendships f where f.user_a = least(p.user_id, $1) and f.user_b = greatest(p.user_id, $1))
      )
      and not exists (
        select 1 from blocks b
        where (b.blocker_id = $1 and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = $1)
      )
      ${extra}
    order by rank, p.full_name
    limit $${params.length}`,
    params,
  );
  return rows.map(mapPerson);
}

async function loadDirectory(sql: Sql): Promise<Directory> {
  const schools = await sql<Row>`select id, name, short_name, summary from schools order by name`;
  const programmes = await sql<Row>`select id, school_id, department, name, level from programmes order by name`;
  const announcements = await sql<Row>`
    select id, title, body, category, source_label, source_url, official, created_at
    from announcements order by created_at desc limit 12
  `;
  return {
    schools: schools.map(
      (row): School => ({
        id: str(row, "id"),
        name: str(row, "name"),
        shortName: str(row, "short_name"),
        summary: str(row, "summary"),
      }),
    ),
    programmes: programmes.map(
      (row): Programme => ({
        id: str(row, "id"),
        schoolId: str(row, "school_id"),
        department: str(row, "department"),
        name: str(row, "name"),
        level: str(row, "level"),
      }),
    ),
    announcements: announcements.map(mapAnnouncement),
  };
}

function jpeg(value: string | undefined, max: number): string | null | Fail {
  if (!value) return null;
  if (value.length > max || !/^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(value)) {
    return fail("Use a smaller JPG image.");
  }
  return value;
}

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  campusEmail: z.string().trim().max(160).optional(),
  role: z.enum(["student", "lecturer", "staff"]),
  schoolId: z.string().trim().min(1, "Choose a school.").max(40),
  programmeId: z.string().trim().max(80).optional(),
  studyLevel: z.string().trim().max(40).optional(),
  studyMode: z.string().trim().max(40).optional(),
  academicYear: z.string().trim().max(40).optional(),
  interests: z.string().trim().max(300).optional(),
  departmentNote: z.string().trim().max(80).optional(),
});

async function writeProfile(
  sql: Sql,
  userId: string,
  input: z.infer<typeof profileSchema>,
  mode: "create" | "update",
  extras?: {
    bio?: string;
    skills?: string;
    visibility?: "campus" | "friends";
    avatar?: string | null;
    cover?: string | null;
    notifyMessages?: boolean;
    notifySocial?: boolean;
    notifyCampus?: boolean;
  },
): Promise<{ ok: true } | Fail> {
  const existing = await ownerRow(sql, userId);
  if (mode === "create" && existing && str(existing, "account_status") === "active") {
    return fail("Your campus profile is already set up.");
  }
  if (mode === "update" && (!existing || str(existing, "account_status") === "withdrawn")) {
    return fail("Finish your campus profile first.");
  }
  const authEmail = (await sessionEmail(sql, userId)) || str(existing ?? {}, "auth_email");
  if (!authEmail) return fail("Sign in again, then finish your profile.");
  let campusEmail = isMubasEmail(authEmail)
    ? authEmail.toLowerCase()
    : (input.campusEmail ?? "").trim().toLowerCase();
  if (!isMubasEmail(campusEmail)) return fail("Use an official @mubas.ac.mw address.");
  const schoolRows = await sql<Row>`select id from schools where id = ${input.schoolId}`;
  if (!schoolRows[0]) return fail("Choose a school from the list.");
  let programmeId: string | null = input.programmeId?.trim() || null;
  let department = cleanText(input.departmentNote ?? "", 80);
  if (programmeId) {
    const found = await sql<Row>`select id, school_id, department from programmes where id = ${programmeId}`;
    if (!found[0] || str(found[0], "school_id") !== input.schoolId) return fail("That programme is not in the chosen school.");
    if (!programmeId.startsWith("other-")) department = str(found[0], "department");
  }
  if (input.role === "student" && !programmeId) {
    return fail("Choose your programme. Pick “not listed” if you cannot find it.");
  }
  if (!department) return fail("Add a department.");
  const level = oneOf(input.studyLevel, STUDY_LEVELS, "study level");
  if (typeof level !== "string") return level;
  const studyMode = oneOf(input.studyMode, STUDY_MODES, "study mode");
  if (typeof studyMode !== "string") return studyMode;
  const year = oneOf(input.academicYear, ACADEMIC_YEARS, "academic year");
  if (typeof year !== "string") return year;
  const previousEmail = existing ? nullable(existing, "campus_email") : null;
  const emailChanged = previousEmail?.toLowerCase() !== campusEmail;
  const confirmed = existing && !emailChanged ? flag(existing, "email_confirmed") : false;
  let role: Role = input.role;
  let roleConfirmed = false;
  if (mode === "update" && existing) {
    role = asRole(str(existing, "role"));
    roleConfirmed = flag(existing, "role_confirmed");
  }
  if (operators().includes(authEmail.toLowerCase())) {
    role = "admin";
    roleConfirmed = true;
  }
  const bio = cleanText(extras?.bio ?? (existing ? str(existing, "bio") : ""), 600);
  const skills = cleanText(extras?.skills ?? (existing ? str(existing, "skills") : ""), 300);
  const interests = cleanText(input.interests ?? (existing ? str(existing, "interests") : ""), 300);
  const visibility = extras?.visibility ?? (existing && str(existing, "visibility") === "friends" ? "friends" : "campus");
  const avatar = extras && "avatar" in extras ? extras.avatar : existing ? nullable(existing, "avatar_data") : null;
  const cover = extras && "cover" in extras ? extras.cover : existing ? nullable(existing, "cover_data") : null;
  const notifyMessages = extras?.notifyMessages ?? (existing ? flag(existing, "notify_messages") : true);
  const notifySocial = extras?.notifySocial ?? (existing ? flag(existing, "notify_social") : true);
  const notifyCampus = extras?.notifyCampus ?? (existing ? flag(existing, "notify_campus") : true);
  try {
    if (!existing) {
      await sql`
        insert into profiles (
          user_id, full_name, auth_email, campus_email, role, role_confirmed, school_id, department,
          programme_id, study_level, study_mode, academic_year, interests, bio, skills, visibility,
          email_domain_ok, email_confirmed, notify_messages, notify_social, notify_campus, avatar_data, cover_data
        ) values (
          ${userId}, ${cleanText(input.fullName, 120)}, ${authEmail}, ${campusEmail}, ${role}, ${roleConfirmed},
          ${input.schoolId}, ${department}, ${programmeId}, ${level}, ${studyMode}, ${year}, ${interests},
          ${bio}, ${skills}, ${visibility}, ${true}, ${confirmed}, ${notifyMessages}, ${notifySocial}, ${notifyCampus},
          ${avatar}, ${cover}
        )
      `;
    } else {
      await sql`
        update profiles set
          full_name = ${cleanText(input.fullName, 120)},
          auth_email = ${authEmail},
          campus_email = ${campusEmail},
          role = ${role},
          role_confirmed = ${roleConfirmed},
          account_status = 'active',
          school_id = ${input.schoolId},
          department = ${department},
          programme_id = ${programmeId},
          study_level = ${level},
          study_mode = ${studyMode},
          academic_year = ${year},
          interests = ${interests},
          bio = ${bio},
          skills = ${skills},
          visibility = ${visibility},
          email_domain_ok = ${true},
          email_confirmed = ${confirmed},
          notify_messages = ${notifyMessages},
          notify_social = ${notifySocial},
          notify_campus = ${notifyCampus},
          avatar_data = ${avatar},
          cover_data = ${cover},
          updated_at = now()
        where user_id = ${userId}
      `;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("unique") || message.includes("duplicate")) {
      return fail("That campus email is already used on Zapa.");
    }
    throw error;
  }
  return { ok: true };
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T | Fail {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  return parsed.data;
}

export const listDirectory = createServerFn({ method: "GET" }).handler(async (): Promise<Directory> => {
  const { sql } = await db();
  return loadDirectory(sql);
});

export const getShell = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, dbSource } = await db();
    const row = await ownerRow(sql, context.userId);
    if (row && str(row, "account_status") === "active") {
      await sql`update profiles set last_seen = now() where user_id = ${context.userId}`;
    }
    const fresh = row ? await ownerRow(sql, context.userId) : null;
    const notes = fresh
      ? await sql<{ n: number }>`
          select count(*)::int as n from notifications where user_id = ${context.userId} and read_at is null
        `
      : [{ n: 0 }];
    const messages = fresh
      ? await sql<{ n: number }>`
          select count(*)::int as n
          from messages m
          join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = ${context.userId}
          where m.user_id <> ${context.userId}
            and m.deleted_at is null
            and (cm.last_read_at is null or m.created_at > cm.last_read_at)
        `
      : [{ n: 0 }];
    return {
      ok: true as const,
      profile: fresh ? mapProfile(fresh) : null,
      unreadNotes: num(notes[0] ?? {}, "n"),
      unreadMessages: num(messages[0] ?? {}, "n"),
      canPreviewSteward: dbSource === "pglite",
    };
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(profileSchema, data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    return writeProfile(sql, context.userId, parsed, "create");
  });

const updateSchema = profileSchema.extend({
  bio: z.string().trim().max(600).optional(),
  skills: z.string().trim().max(300).optional(),
  visibility: z.enum(["campus", "friends"]),
  avatarData: z.string().max(140000).optional(),
  coverData: z.string().max(180000).optional(),
  clearAvatar: z.boolean().optional(),
  clearCover: z.boolean().optional(),
  notifyMessages: z.boolean(),
  notifySocial: z.boolean(),
  notifyCampus: z.boolean(),
});

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(updateSchema, data);
    if ("ok" in parsed) return parsed;
    const avatar = parsed.clearAvatar ? null : parsed.avatarData ? jpeg(parsed.avatarData, 140000) : undefined;
    if (avatar && typeof avatar !== "string") return avatar;
    const cover = parsed.clearCover ? null : parsed.coverData ? jpeg(parsed.coverData, 180000) : undefined;
    if (cover && typeof cover !== "string") return cover;
    const { sql } = await db();
    return writeProfile(sql, context.userId, parsed, "update", {
      bio: parsed.bio,
      skills: parsed.skills,
      visibility: parsed.visibility,
      ...(avatar !== undefined ? { avatar } : {}),
      ...(cover !== undefined ? { cover } : {}),
      notifyMessages: parsed.notifyMessages,
      notifySocial: parsed.notifySocial,
      notifyCampus: parsed.notifyCampus,
    });
  });

const discoverSchema = z.object({
  schoolId: z.string().max(40).optional(),
  department: z.string().max(80).optional(),
  programmeId: z.string().max(80).optional(),
  studyLevel: z.string().max(40).optional(),
  studyMode: z.string().max(40).optional(),
  academicYear: z.string().max(40).optional(),
  interest: z.string().max(40).optional(),
});

export const getDiscover = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(discoverSchema, data ?? {});
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const people = await fetchPeople(sql, context.userId, parsed, 30);
    const incoming = await sql<Row>`
      select r.id, r.from_user, p.full_name, g.name as programme_name, r.created_at
      from friend_requests r
      join profiles p on p.user_id = r.from_user
      left join programmes g on g.id = p.programme_id
      where r.to_user = ${context.userId} and r.status = 'pending'
      order by r.created_at desc
    `;
    return {
      ok: true as const,
      people,
      incoming: incoming.map((row) => ({
        id: num(row, "id"),
        userId: str(row, "from_user"),
        fullName: str(row, "full_name"),
        programmeName: nullable(row, "programme_name"),
        createdAt: str(row, "created_at"),
      })),
    };
  });

export const getHome = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const [posts, people, announcements, videos, resources] = await Promise.all([
      fetchPosts(sql, context.userId, { offset: 0 }),
      fetchPeople(sql, context.userId, {}, 8),
      sql<Row>`select id, title, body, category, source_label, source_url, official, created_at
        from announcements order by created_at desc limit 4`,
      sql<Row>`select v.id, v.title, v.category, p.full_name from videos v
        join profiles p on p.user_id = v.user_id
        where v.hidden = false order by v.created_at desc limit 3`,
      sql<Row>`select r.id, r.title, r.category, l.name as library_name
        from library_resources r join libraries l on l.id = r.library_id
        where r.hidden = false and r.access = 'campus'
        order by r.created_at desc limit 3`,
    ]);
    const rooms = await sql<Row>`
      select c.slug, c.name, m.role
      from community_members m
      join communities c on c.id = m.community_id
      where m.user_id = ${context.userId} and m.role <> 'pending'
      order by c.name limit 6
    `;
    return {
      ok: true as const,
      posts,
      people,
      announcements: announcements.map(mapAnnouncement),
      videos: videos.map((row) => ({
        id: num(row, "id"),
        title: str(row, "title"),
        category: str(row, "category"),
        author: str(row, "full_name"),
      })),
      resources: resources.map((row) => ({
        id: num(row, "id"),
        title: str(row, "title"),
        category: str(row, "category"),
        libraryName: str(row, "library_name"),
      })),
      rooms: rooms.map((row) => ({ slug: str(row, "slug"), name: str(row, "name") })),
    };
  });

export const getFeed = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        offset: z.number().int().min(0).max(400).optional(),
        communitySlug: z.string().max(80).optional(),
        saved: z.boolean().optional(),
        authorId: z.string().max(80).optional(),
      }),
      data ?? {},
    );
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const posts = await fetchPosts(sql, context.userId, {
      offset: parsed.offset ?? 0,
      slug: parsed.communitySlug,
      saved: parsed.saved,
      authorId: parsed.authorId,
    });
    return { ok: true as const, posts };
  });

const postSchema = z.object({
  body: z.string().trim().min(1, "Write something first.").max(4000),
  audience: z.enum(["campus", "friends", "community"]),
  kind: z.enum(["note", "question", "material"]),
  linkUrl: z.string().max(500).optional(),
  communitySlug: z.string().max(80).optional(),
  sharedPostId: z.number().int().positive().optional(),
});

export const createPost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(postSchema, data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const paced = await limited(sql, context.userId, "post");
    if (paced) return paced;
    const link = parsed.linkUrl ? cleanHttpUrl(parsed.linkUrl) : null;
    if (parsed.linkUrl && parsed.linkUrl.trim() && !link) return fail("That link needs to start with http or https.");
    let communityId: number | null = null;
    if (parsed.audience === "community") {
      if (!parsed.communitySlug) return fail("Choose a community.");
      const rooms = await sql<Row>`select id from communities where slug = ${parsed.communitySlug}`;
      if (!rooms[0]) return fail("That room does not exist.");
      communityId = num(rooms[0], "id");
      const members = await sql<Row>`
        select role from community_members
        where community_id = ${communityId} and user_id = ${context.userId}
      `;
      if (!members[0] || str(members[0], "role") === "pending") {
        return fail("Join this room before posting in it.");
      }
    }
    if (parsed.sharedPostId) {
      const origin = await sql<Row>`select id from posts where id = ${parsed.sharedPostId} and hidden = false`;
      if (!origin[0]) return fail("That post is no longer available.");
    }
    const inserted = await sql<{ id: number }>`
      insert into posts (user_id, body, audience, kind, link_url, community_id, shared_post_id)
      values (
        ${context.userId}, ${cleanText(parsed.body, 4000)}, ${parsed.audience}, ${parsed.kind},
        ${link}, ${communityId}, ${parsed.sharedPostId ?? null}
      )
      returning id
    `;
    return { ok: true as const, id: num(inserted[0] ?? {}, "id") };
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ postId: z.number().int().positive() }), data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const gone = await sql<{ id: number }>`
      delete from posts where id = ${parsed.postId} and user_id = ${context.userId} returning id
    `;
    if (!gone[0]) return fail("You can only remove your own post.");
    return { ok: true as const };
  });

async function toggle(sql: Sql, table: "post_likes" | "post_saves" | "video_likes", idColumn: string, id: number, userId: string) {
  const existing = await sql.query<Row>(
    `select 1 as hit from ${table} where ${idColumn} = $1 and user_id = $2`,
    [id, userId],
  );
  if (existing[0]) {
    await sql.query(`delete from ${table} where ${idColumn} = $1 and user_id = $2`, [id, userId]);
    return false;
  }
  await sql.query(`insert into ${table} (${idColumn}, user_id) values ($1, $2)`, [id, userId]);
  return true;
}

export const toggleLike = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ postId: z.number().int().positive() }), data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const posts = await sql<Row>`select user_id from posts where id = ${parsed.postId} and hidden = false`;
    if (!posts[0]) return fail("That post is gone.");
    const on = await toggle(sql, "post_likes", "post_id", parsed.postId, context.userId);
    const author = str(posts[0], "user_id");
    if (on && author !== context.userId) {
      await notify(sql, author, "like", "New like", `${me.fullName} liked your post.`, `/campus`);
    }
    return { ok: true as const, on };
  });

export const toggleSave = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ postId: z.number().int().positive() }), data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const on = await toggle(sql, "post_saves", "post_id", parsed.postId, context.userId);
    return { ok: true as const, on };
  });

export const getComments = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ postId: z.number().int().positive() }), data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const rows = await sql<Row>`
      select c.id, c.user_id, c.body, c.created_at, p.full_name
      from comments c join profiles p on p.user_id = c.user_id
      where c.post_id = ${parsed.postId}
      order by c.created_at asc limit 80
    `;
    const comments: Comment[] = rows.map((row) => ({
      id: num(row, "id"),
      userId: str(row, "user_id"),
      author: str(row, "full_name"),
      body: str(row, "body"),
      createdAt: str(row, "created_at"),
    }));
    return { ok: true as const, comments };
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({ postId: z.number().int().positive(), body: z.string().trim().min(1).max(1500) }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const paced = await limited(sql, context.userId, "comment");
    if (paced) return paced;
    const posts = await sql<Row>`select user_id from posts where id = ${parsed.postId} and hidden = false`;
    if (!posts[0]) return fail("That post is gone.");
    await sql`
      insert into comments (post_id, user_id, body)
      values (${parsed.postId}, ${context.userId}, ${cleanText(parsed.body, 1500)})
    `;
    const author = str(posts[0], "user_id");
    if (author !== context.userId) {
      await notify(sql, author, "comment", "New comment", `${me.fullName} commented on your post.`, `/campus`);
    }
    return { ok: true as const };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ commentId: z.number().int().positive() }), data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const gone = await sql<{ id: number }>`
      delete from comments where id = ${parsed.commentId} and user_id = ${context.userId} returning id
    `;
    if (!gone[0]) return fail("You can only remove your own comment.");
    return { ok: true as const };
  });

export const friendRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ userId: z.string().min(1).max(80) }), data);
    if ("ok" in parsed) return parsed;
    if (parsed.userId === context.userId) return fail("You cannot add yourself.");
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const paced = await limited(sql, context.userId, "friend");
    if (paced) return paced;
    if (await blockedEither(sql, context.userId, parsed.userId)) return fail("That person is not available.");
    const other = await sql<Row>`select user_id, full_name from profiles where user_id = ${parsed.userId} and account_status = 'active'`;
    if (!other[0]) return fail("That person is not available.");
    const already = await sql<Row>`
      select 1 as hit from friendships
      where user_a = least(${context.userId}, ${parsed.userId})
        and user_b = greatest(${context.userId}, ${parsed.userId})
    `;
    if (already[0]) return fail("You are already connected.");
    await sql`
      insert into friend_requests (from_user, to_user, status)
      values (${context.userId}, ${parsed.userId}, 'pending')
      on conflict (from_user, to_user)
      do update set status = 'pending', created_at = now()
    `;
    await notify(
      sql,
      parsed.userId,
      "friend_request",
      "Friend request",
      `${me.fullName} wants to connect.`,
      `/campus/people/${context.userId}`,
    );
    return { ok: true as const };
  });

export const respondFriend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ requestId: z.number().int().positive(), accept: z.boolean() }), data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const rows = await sql<Row>`
      update friend_requests
      set status = ${parsed.accept ? "accepted" : "rejected"}
      where id = ${parsed.requestId} and to_user = ${context.userId} and status = 'pending'
      returning from_user
    `;
    if (!rows[0]) return fail("That request is no longer open.");
    const fromUser = str(rows[0], "from_user");
    if (parsed.accept) {
      await sql`
        insert into friendships (user_a, user_b)
        values (least(${context.userId}, ${fromUser}), greatest(${context.userId}, ${fromUser}))
        on conflict do nothing
      `;
      await notify(sql, fromUser, "friend_accept", "Request accepted", `${me.fullName} accepted your request.`, `/campus/people/${context.userId}`);
    }
    return { ok: true as const };
  });

export const toggleFollow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ userId: z.string().min(1).max(80) }), data);
    if ("ok" in parsed) return parsed;
    if (parsed.userId === context.userId) return fail("You cannot follow yourself.");
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    if (await blockedEither(sql, context.userId, parsed.userId)) return fail("That person is not available.");
    const existing = await sql<Row>`
      select 1 as hit from follows where follower_id = ${context.userId} and following_id = ${parsed.userId}
    `;
    if (existing[0]) {
      await sql`delete from follows where follower_id = ${context.userId} and following_id = ${parsed.userId}`;
      return { ok: true as const, on: false };
    }
    await sql`insert into follows (follower_id, following_id) values (${context.userId}, ${parsed.userId})`;
    await notify(sql, parsed.userId, "follow", "New follower", `${me.fullName} followed you.`, `/campus/people/${context.userId}`);
    return { ok: true as const, on: true };
  });

export const toggleBlock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ userId: z.string().min(1).max(80), block: z.boolean() }), data);
    if ("ok" in parsed) return parsed;
    if (parsed.userId === context.userId) return fail("You cannot block yourself.");
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    if (parsed.block) {
      await sql`
        insert into blocks (blocker_id, blocked_id) values (${context.userId}, ${parsed.userId})
        on conflict do nothing
      `;
      await sql`
        delete from friendships
        where user_a = least(${context.userId}, ${parsed.userId})
          and user_b = greatest(${context.userId}, ${parsed.userId})
      `;
      await sql`
        delete from friend_requests
        where (from_user = ${context.userId} and to_user = ${parsed.userId})
           or (from_user = ${parsed.userId} and to_user = ${context.userId})
      `;
      await sql`
        delete from follows
        where (follower_id = ${context.userId} and following_id = ${parsed.userId})
           or (follower_id = ${parsed.userId} and following_id = ${context.userId})
      `;
      return { ok: true as const, blocked: true };
    }
    await sql`delete from blocks where blocker_id = ${context.userId} and blocked_id = ${parsed.userId}`;
    return { ok: true as const, blocked: false };
  });

export const getPerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ userId: z.string().min(1).max(80) }), data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    if (await blockedEither(sql, context.userId, parsed.userId)) return fail("This profile is not available.");
    const rows = await sql.query<Row>(
      `select p.*, s.name as school_name, s.short_name as school_short, g.name as programme_name,
        case
          when p.user_id = $1 then 'self'
          when exists (select 1 from friendships f where f.user_a = least(p.user_id, $1) and f.user_b = greatest(p.user_id, $1)) then 'friends'
          when exists (select 1 from friend_requests r where r.from_user = $1 and r.to_user = p.user_id and r.status = 'pending') then 'outgoing'
          when exists (select 1 from friend_requests r where r.from_user = p.user_id and r.to_user = $1 and r.status = 'pending') then 'incoming'
          else 'none'
        end as relation,
        exists(select 1 from follows fo where fo.follower_id = $1 and fo.following_id = p.user_id) as following,
        exists(select 1 from blocks b where b.blocker_id = $1 and b.blocked_id = p.user_id) as blocked_by_me,
        (select count(*)::int from follows f where f.following_id = p.user_id) as follower_count,
        (select count(*)::int from friendships f where f.user_a = p.user_id or f.user_b = p.user_id) as friend_count
      ${PROFILE_FROM}
      where p.user_id = $2 and p.account_status = 'active'`,
      [context.userId, parsed.userId],
    );
    if (!rows[0]) return fail("This profile is not available.");
    const profile = mapProfile(rows[0]);
    const relation = asRelation(str(rows[0], "relation"));
    const restricted = profile.visibility === "friends" && relation !== "self" && relation !== "friends";
    const posts = restricted ? [] : await fetchPosts(sql, context.userId, { offset: 0, authorId: parsed.userId });
    return {
      ok: true as const,
      person: {
        ...profile,
        authEmail: relation === "self" ? profile.authEmail : "",
        campusEmail: relation === "self" ? profile.campusEmail : null,
        bio: restricted ? "" : profile.bio,
        interests: restricted ? "" : profile.interests,
        skills: restricted ? "" : profile.skills,
        avatarData: restricted ? null : profile.avatarData,
        coverData: restricted ? null : profile.coverData,
        relation,
        following: flag(rows[0], "following"),
        blockedByMe: flag(rows[0], "blocked_by_me"),
        restricted,
        followerCount: num(rows[0], "follower_count"),
        friendCount: num(rows[0], "friend_count"),
      },
      posts,
    };
  });

export const reportContent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        targetType: z.enum(["post", "comment", "message", "video", "resource", "profile", "announcement"]),
        targetId: z.string().min(1).max(80),
        reason: z.enum(REPORT_REASONS),
        details: z.string().trim().max(500).optional(),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const paced = await limited(sql, context.userId, "report");
    if (paced) return paced;
    await sql`
      insert into reports (reporter_id, target_type, target_id, reason, details)
      values (${context.userId}, ${parsed.targetType}, ${parsed.targetId}, ${parsed.reason}, ${cleanText(parsed.details ?? "", 500)})
    `;
    return { ok: true as const };
  });

export const listCommunities = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const rows = await sql<Row>`
      select c.id, c.slug, c.name, c.summary, s.short_name as school_short,
        (select count(*)::int from community_members m where m.community_id = c.id and m.role <> 'pending') as member_count,
        coalesce((select m.role from community_members m where m.community_id = c.id and m.user_id = ${context.userId}), 'none') as membership
      from communities c
      left join schools s on s.id = c.school_id
      order by c.name
    `;
    const communities: CommunityCard[] = rows.map((row) => ({
      id: num(row, "id"),
      slug: str(row, "slug"),
      name: str(row, "name"),
      summary: str(row, "summary"),
      schoolShort: nullable(row, "school_short"),
      memberCount: num(row, "member_count"),
      membership: (["member", "pending", "rep"].includes(str(row, "membership"))
        ? str(row, "membership")
        : "none") as CommunityCard["membership"],
    }));
    return { ok: true as const, communities };
  });

export const joinCommunity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ slug: z.string().min(1).max(80), leave: z.boolean().optional() }), data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const rooms = await sql<Row>`select id, programme_id, school_id from communities where slug = ${parsed.slug}`;
    if (!rooms[0]) return fail("That room does not exist.");
    const id = num(rooms[0], "id");
    if (parsed.leave) {
      await sql`delete from community_members where community_id = ${id} and user_id = ${context.userId}`;
      return { ok: true as const, membership: "none" as const };
    }
    const programmeId = nullable(rooms[0], "programme_id");
    const schoolId = nullable(rooms[0], "school_id");
    const immediate =
      me.role === "lecturer" ||
      me.role === "staff" ||
      me.role === "admin" ||
      (programmeId != null && programmeId === me.programmeId) ||
      (programmeId == null && schoolId != null && schoolId === me.schoolId);
    const role = immediate ? "member" : "pending";
    await sql`
      insert into community_members (community_id, user_id, role)
      values (${id}, ${context.userId}, ${role})
      on conflict (community_id, user_id) do update set role = ${role}
    `;
    return { ok: true as const, membership: role };
  });

async function conversationList(sql: Sql, me: string): Promise<ConversationCard[]> {
  const rows = await sql<Row>`
    select c.id, c.kind, c.title,
      coalesce((
        select string_agg(p.full_name, ', ' order by p.full_name)
        from conversation_members m
        join profiles p on p.user_id = m.user_id
        where m.conversation_id = c.id and m.user_id <> ${me}
      ), '') as others,
      coalesce((
        select case when m.deleted_at is null then m.body else 'Message removed' end
        from messages m where m.conversation_id = c.id order by m.created_at desc limit 1
      ), '') as last_body,
      (select m.created_at from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last_at,
      (
        select count(*)::int from messages m
        where m.conversation_id = c.id and m.user_id <> ${me} and m.deleted_at is null
          and (cm.last_read_at is null or m.created_at > cm.last_read_at)
      ) as unread
    from conversations c
    join conversation_members cm on cm.conversation_id = c.id and cm.user_id = ${me}
    order by last_at desc nulls last, c.created_at desc
  `;
  return rows.map((row) => ({
    id: num(row, "id"),
    kind: str(row, "kind") === "group" ? "group" : "direct",
    title: str(row, "title"),
    others: str(row, "others"),
    lastBody: str(row, "last_body"),
    lastAt: str(row, "last_at"),
    unread: num(row, "unread"),
  }));
}

export const listConversations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    return { ok: true as const, conversations: await conversationList(sql, context.userId) };
  });

export const openDirect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ userId: z.string().min(1).max(80) }), data);
    if ("ok" in parsed) return parsed;
    if (parsed.userId === context.userId) return fail("Pick someone else.");
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    if (await blockedEither(sql, context.userId, parsed.userId)) return fail("You cannot message this person.");
    const other = await sql<Row>`select user_id from profiles where user_id = ${parsed.userId} and account_status = 'active'`;
    if (!other[0]) return fail("That person is not available.");
    const found = await sql<Row>`
      select c.id from conversations c
      join conversation_members a on a.conversation_id = c.id and a.user_id = ${context.userId}
      join conversation_members b on b.conversation_id = c.id and b.user_id = ${parsed.userId}
      where c.kind = 'direct' limit 1
    `;
    if (found[0]) return { ok: true as const, conversationId: num(found[0], "id") };
    const created = await sql<{ id: number }>`
      insert into conversations (kind, created_by) values ('direct', ${context.userId}) returning id
    `;
    const id = num(created[0] ?? {}, "id");
    await sql`
      insert into conversation_members (conversation_id, user_id, role) values
      (${id}, ${context.userId}, 'admin'),
      (${id}, ${parsed.userId}, 'member')
    `;
    return { ok: true as const, conversationId: id };
  });

export const createGroup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        title: z.string().trim().min(2, "Name the group.").max(80),
        memberIds: z.array(z.string().min(1).max(80)).max(24),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const ids = [...new Set(parsed.memberIds.filter((id) => id !== context.userId))];
    if (!ids.length) return fail("Add at least one other person.");
    const created = await sql<{ id: number }>`
      insert into conversations (kind, title, created_by)
      values ('group', ${cleanText(parsed.title, 80)}, ${context.userId}) returning id
    `;
    const id = num(created[0] ?? {}, "id");
    await sql`
      insert into conversation_members (conversation_id, user_id, role)
      values (${id}, ${context.userId}, 'admin')
    `;
    for (const memberId of ids) {
      if (await blockedEither(sql, context.userId, memberId)) continue;
      const person = await sql<Row>`select user_id from profiles where user_id = ${memberId} and account_status = 'active'`;
      if (!person[0]) continue;
      await sql`
        insert into conversation_members (conversation_id, user_id, role)
        values (${id}, ${memberId}, 'member')
        on conflict do nothing
      `;
      await notify(sql, memberId, "message", "Group chat", `${me.fullName} added you to ${cleanText(parsed.title, 80)}.`, `/campus/messages?thread=${id}`);
    }
    return { ok: true as const, conversationId: id };
  });

export const getThread = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ conversationId: z.number().int().positive() }), data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const member = await sql<Row>`
      select role from conversation_members
      where conversation_id = ${parsed.conversationId} and user_id = ${context.userId}
    `;
    if (!member[0]) return fail("That conversation is not yours.");
    await sql`
      update conversation_members set last_read_at = now()
      where conversation_id = ${parsed.conversationId} and user_id = ${context.userId}
    `;
    const meta = await sql<Row>`select id, kind, title from conversations where id = ${parsed.conversationId}`;
    const peer = await sql<Row>`
      select last_read_at from conversation_members
      where conversation_id = ${parsed.conversationId} and user_id <> ${context.userId}
      order by last_read_at desc nulls last limit 1
    `;
    const rows = await sql<Row>`
      select m.id, m.user_id, m.body, m.attachment_url, m.reply_to, m.deleted_at, m.created_at, p.full_name
      from messages m join profiles p on p.user_id = m.user_id
      where m.conversation_id = ${parsed.conversationId}
      order by m.created_at desc limit 80
    `;
    const messages: ChatMessage[] = rows.reverse().map((row) => ({
      id: num(row, "id"),
      userId: str(row, "user_id"),
      author: str(row, "full_name"),
      body: nullable(row, "deleted_at") ? "" : str(row, "body"),
      attachmentUrl: nullable(row, "deleted_at") ? null : nullable(row, "attachment_url"),
      replyTo: num(row, "reply_to") || null,
      mine: str(row, "user_id") === context.userId,
      removed: Boolean(nullable(row, "deleted_at")),
      createdAt: str(row, "created_at"),
    }));
    return {
      ok: true as const,
      conversation: {
        id: num(meta[0] ?? {}, "id"),
        kind: str(meta[0] ?? {}, "kind") === "group" ? "group" : "direct",
        title: str(meta[0] ?? {}, "title"),
        peerReadAt: nullable(peer[0] ?? {}, "last_read_at"),
      },
      messages,
    };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        conversationId: z.number().int().positive(),
        body: z.string().trim().min(1, "Write a message.").max(4000),
        attachmentUrl: z.string().max(500).optional(),
        replyTo: z.number().int().positive().optional(),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const paced = await limited(sql, context.userId, "message");
    if (paced) return paced;
    const member = await sql<Row>`
      select 1 as hit from conversation_members
      where conversation_id = ${parsed.conversationId} and user_id = ${context.userId}
    `;
    if (!member[0]) return fail("That conversation is not yours.");
    const link = parsed.attachmentUrl?.trim() ? cleanHttpUrl(parsed.attachmentUrl) : null;
    if (parsed.attachmentUrl?.trim() && !link) return fail("Attachment links must start with http or https.");
    const others = await sql<Row>`
      select user_id from conversation_members
      where conversation_id = ${parsed.conversationId} and user_id <> ${context.userId}
    `;
    for (const other of others) {
      if (await blockedEither(sql, context.userId, str(other, "user_id"))) {
        return fail("Someone in this chat has blocked the conversation.");
      }
    }
    await sql`
      insert into messages (conversation_id, user_id, body, attachment_url, reply_to)
      values (${parsed.conversationId}, ${context.userId}, ${cleanText(parsed.body, 4000)}, ${link}, ${parsed.replyTo ?? null})
    `;
    for (const other of others) {
      await notify(
        sql,
        str(other, "user_id"),
        "message",
        "New message",
        `${me.fullName}: ${cleanText(parsed.body, 80)}`,
        `/campus/messages?thread=${parsed.conversationId}`,
      );
    }
    return { ok: true as const };
  });

export const deleteMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ messageId: z.number().int().positive() }), data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const gone = await sql<{ id: number }>`
      update messages set body = '', attachment_url = null, deleted_at = now()
      where id = ${parsed.messageId} and user_id = ${context.userId} and deleted_at is null
      returning id
    `;
    if (!gone[0]) return fail("You can only remove your own message.");
    return { ok: true as const };
  });

function mapVideo(row: Row, me: string): VideoItem {
  return {
    id: num(row, "id"),
    userId: str(row, "user_id"),
    author: str(row, "full_name"),
    title: str(row, "title"),
    description: str(row, "description"),
    category: str(row, "category"),
    externalUrl: str(row, "external_url"),
    likeCount: num(row, "like_count"),
    commentCount: num(row, "comment_count"),
    liked: flag(row, "liked"),
    subscribed: flag(row, "subscribed"),
    createdAt: str(row, "created_at"),
  };
}

export const listVideos = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ category: z.string().max(60).optional(), q: z.string().max(80).optional() }), data ?? {});
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const params: unknown[] = [context.userId];
    let extra = "";
    if (parsed.category && VIDEO_CATEGORIES.includes(parsed.category as (typeof VIDEO_CATEGORIES)[number])) {
      params.push(parsed.category);
      extra += ` and v.category = $${params.length}`;
    }
    if (parsed.q && parsed.q.trim()) {
      params.push(`%${parsed.q.replace(/[%_]/g, "").trim()}%`);
      extra += ` and (v.title ilike $${params.length} or v.description ilike $${params.length})`;
    }
    const rows = await sql.query<Row>(
      `select v.*, p.full_name,
        (select count(*)::int from video_likes l where l.video_id = v.id) as like_count,
        (select count(*)::int from video_comments c where c.video_id = v.id) as comment_count,
        exists(select 1 from video_likes l where l.video_id = v.id and l.user_id = $1) as liked,
        exists(select 1 from subscriptions s where s.subscriber_id = $1 and s.creator_id = v.user_id) as subscribed
      from videos v join profiles p on p.user_id = v.user_id
      where v.hidden = false ${extra}
      order by v.created_at desc limit 40`,
      params,
    );
    const playlists = await sql<Row>`select id, title from playlists where user_id = ${context.userId} order by created_at desc`;
    return {
      ok: true as const,
      videos: rows.map((row) => mapVideo(row, context.userId)),
      playlists: playlists.map((row) => ({ id: num(row, "id"), title: str(row, "title") })),
    };
  });

export const createVideo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        title: z.string().trim().min(2).max(140),
        description: z.string().trim().max(1000).optional(),
        category: z.enum(VIDEO_CATEGORIES),
        externalUrl: z.string().trim().min(4).max(500),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const link = cleanHttpUrl(parsed.externalUrl);
    if (!link) return fail("Add an http or https link to the video.");
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const paced = await limited(sql, context.userId, "video");
    if (paced) return paced;
    const inserted = await sql<{ id: number }>`
      insert into videos (user_id, title, description, category, external_url)
      values (${context.userId}, ${cleanText(parsed.title, 140)}, ${cleanText(parsed.description ?? "", 1000)}, ${parsed.category}, ${link})
      returning id
    `;
    return { ok: true as const, id: num(inserted[0] ?? {}, "id") };
  });

export const videoAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        action: z.enum(["like", "subscribe", "comment", "playlist", "create-playlist"]),
        videoId: z.number().int().positive().optional(),
        creatorId: z.string().max(80).optional(),
        body: z.string().trim().max(1500).optional(),
        title: z.string().trim().max(80).optional(),
        playlistId: z.number().int().positive().optional(),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    if (parsed.action === "like" && parsed.videoId) {
      const on = await toggle(sql, "video_likes", "video_id", parsed.videoId, context.userId);
      return { ok: true as const, on };
    }
    if (parsed.action === "subscribe" && parsed.creatorId && parsed.creatorId !== context.userId) {
      const existing = await sql<Row>`
        select 1 as hit from subscriptions where subscriber_id = ${context.userId} and creator_id = ${parsed.creatorId}
      `;
      if (existing[0]) {
        await sql`delete from subscriptions where subscriber_id = ${context.userId} and creator_id = ${parsed.creatorId}`;
        return { ok: true as const, on: false };
      }
      await sql`insert into subscriptions (subscriber_id, creator_id) values (${context.userId}, ${parsed.creatorId})`;
      await notify(sql, parsed.creatorId, "video", "New subscriber", `${me.fullName} subscribed to you on Zapa Watch.`, `/campus/watch`);
      return { ok: true as const, on: true };
    }
    if (parsed.action === "comment" && parsed.videoId && parsed.body) {
      const paced = await limited(sql, context.userId, "comment");
      if (paced) return paced;
      await sql`
        insert into video_comments (video_id, user_id, body)
        values (${parsed.videoId}, ${context.userId}, ${cleanText(parsed.body, 1500)})
      `;
      return { ok: true as const };
    }
    if (parsed.action === "create-playlist" && parsed.title) {
      const inserted = await sql<{ id: number }>`
        insert into playlists (user_id, title) values (${context.userId}, ${cleanText(parsed.title, 80)}) returning id
      `;
      return { ok: true as const, id: num(inserted[0] ?? {}, "id") };
    }
    if (parsed.action === "playlist" && parsed.playlistId && parsed.videoId) {
      const owned = await sql<Row>`select id from playlists where id = ${parsed.playlistId} and user_id = ${context.userId}`;
      if (!owned[0]) return fail("That playlist is not yours.");
      await sql`
        insert into playlist_items (playlist_id, video_id) values (${parsed.playlistId}, ${parsed.videoId})
        on conflict do nothing
      `;
      return { ok: true as const };
    }
    return fail("That action is not available.");
  });

export const getVideoComments = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ videoId: z.number().int().positive() }), data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const rows = await sql<Row>`
      select c.id, c.user_id, c.body, c.created_at, p.full_name
      from video_comments c join profiles p on p.user_id = c.user_id
      where c.video_id = ${parsed.videoId}
      order by c.created_at asc limit 80
    `;
    return {
      ok: true as const,
      comments: rows.map((row) => ({
        id: num(row, "id"),
        userId: str(row, "user_id"),
        author: str(row, "full_name"),
        body: str(row, "body"),
        createdAt: str(row, "created_at"),
      })),
    };
  });

export const libraryHome = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const applications = await sql<Row>`
      select id, provider_name, kind, status, created_at
      from library_applications where user_id = ${context.userId}
      order by created_at desc
    `;
    const libraries = await sql<Row>`
      select l.id, l.name, l.description, m.role
      from libraries l
      left join library_members m on m.library_id = l.id and m.user_id = ${context.userId}
      where m.user_id is not null or exists (
        select 1 from library_resources r where r.library_id = l.id and r.access = 'campus' and r.hidden = false
      )
      order by l.name
    `;
    const resources = await sql<Row>`
      select r.id, r.library_id, l.name as library_name, r.title, r.description, r.subject, r.author_name,
        r.category, r.file_type, r.external_url, r.access, r.created_at
      from library_resources r
      join libraries l on l.id = r.library_id
      where r.hidden = false and (
        r.access = 'campus'
        or exists (select 1 from library_members m where m.library_id = l.id and m.user_id = ${context.userId})
      )
      order by r.created_at desc limit 60
    `;
    return {
      ok: true as const,
      applications: applications.map(
        (row): LibraryApplication => ({
          id: num(row, "id"),
          providerName: str(row, "provider_name"),
          kind: str(row, "kind"),
          status: str(row, "status"),
          createdAt: str(row, "created_at"),
        }),
      ),
      libraries: libraries.map(
        (row): LibraryCard => ({
          id: num(row, "id"),
          name: str(row, "name"),
          description: str(row, "description"),
          role: (["owner", "admin", "contributor", "reader"].includes(str(row, "role"))
            ? str(row, "role")
            : "none") as LibraryCard["role"],
        }),
      ),
      resources: resources.map(
        (row): LibraryResource => ({
          id: num(row, "id"),
          libraryId: num(row, "library_id"),
          libraryName: str(row, "library_name"),
          title: str(row, "title"),
          description: str(row, "description"),
          subject: str(row, "subject"),
          authorName: str(row, "author_name"),
          category: str(row, "category"),
          fileType: str(row, "file_type"),
          externalUrl: nullable(row, "external_url"),
          access: str(row, "access") === "members" ? "members" : "campus",
          createdAt: str(row, "created_at"),
        }),
      ),
    };
  });

export const applyLibrary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        providerName: z.string().trim().min(2).max(120),
        kind: z.enum(["individual", "organisation"]),
        email: z.string().trim().email("Enter a real email.").max(160),
        phone: z.string().trim().min(6).max(30),
        organisation: z.string().trim().max(120).optional(),
        description: z.string().trim().min(20, "Describe the library in a few sentences.").max(1000),
        materials: z.string().trim().min(2).max(300),
        audience: z.string().trim().min(2).max(200),
        reason: z.string().trim().min(10).max(800),
        agreed: z.literal(true, { error: "Agree to the library rules before submitting." }),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const open = await sql<Row>`
      select id from library_applications where user_id = ${context.userId} and status = 'pending' limit 1
    `;
    if (open[0]) return fail("You already have an application waiting for review.");
    await sql`
      insert into library_applications (
        user_id, provider_name, kind, email, phone, organisation, description, materials, audience, reason, agreed
      ) values (
        ${context.userId}, ${cleanText(parsed.providerName, 120)}, ${parsed.kind}, ${parsed.email.toLowerCase()},
        ${cleanText(parsed.phone, 30)}, ${cleanText(parsed.organisation ?? "", 120)}, ${cleanText(parsed.description, 1000)},
        ${cleanText(parsed.materials, 300)}, ${cleanText(parsed.audience, 200)}, ${cleanText(parsed.reason, 800)}, ${true}
      )
    `;
    return { ok: true as const };
  });

export const addResource = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        libraryId: z.number().int().positive(),
        title: z.string().trim().min(2).max(160),
        description: z.string().trim().max(800).optional(),
        subject: z.string().trim().max(80).optional(),
        authorName: z.string().trim().max(120).optional(),
        category: z.enum(LIBRARY_CATEGORIES),
        externalUrl: z.string().trim().min(4).max(500),
        access: z.enum(["campus", "members"]),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const link = cleanHttpUrl(parsed.externalUrl);
    if (!link) return fail("Add an http or https link. Private file storage is not connected.");
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const member = await sql<Row>`
      select role from library_members where library_id = ${parsed.libraryId} and user_id = ${context.userId}
    `;
    const role = str(member[0] ?? {}, "role");
    if (!["owner", "admin", "contributor"].includes(role)) return fail("You cannot add to this library.");
    await sql`
      insert into library_resources (
        library_id, uploader_id, title, description, subject, author_name, category, file_type, external_url, access
      ) values (
        ${parsed.libraryId}, ${context.userId}, ${cleanText(parsed.title, 160)}, ${cleanText(parsed.description ?? "", 800)},
        ${cleanText(parsed.subject ?? "", 80)}, ${cleanText(parsed.authorName ?? "", 120)}, ${parsed.category},
        'link', ${link}, ${parsed.access}
      )
    `;
    return { ok: true as const };
  });

export const addLibraryMember = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        libraryId: z.number().int().positive(),
        userId: z.string().min(1).max(80),
        role: z.enum(["admin", "contributor", "reader"]),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const mine = await sql<Row>`
      select role from library_members where library_id = ${parsed.libraryId} and user_id = ${context.userId}
    `;
    if (!["owner", "admin"].includes(str(mine[0] ?? {}, "role"))) return fail("Only the library owner can do that.");
    const person = await sql<Row>`select user_id from profiles where user_id = ${parsed.userId} and account_status = 'active'`;
    if (!person[0]) return fail("That person is not available.");
    await sql`
      insert into library_members (library_id, user_id, role)
      values (${parsed.libraryId}, ${parsed.userId}, ${parsed.role})
      on conflict (library_id, user_id) do update set role = ${parsed.role}
    `;
    return { ok: true as const };
  });

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const rows = await sql<Row>`
      select id, title, body, category, source_label, source_url, official, created_at
      from announcements order by created_at desc limit 40
    `;
    return { ok: true as const, announcements: rows.map(mapAnnouncement), canPost: me.role !== "student" };
  });

export const createAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        title: z.string().trim().min(4).max(140),
        body: z.string().trim().min(10).max(2000),
        category: z.enum(ANNOUNCEMENT_CATEGORIES),
        sourceUrl: z.string().trim().max(500).optional(),
        official: z.boolean().optional(),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const admin = await isAdmin(sql, context.userId);
    if (me.role === "student" && !admin) return fail("Students cannot publish campus notices.");
    const official = Boolean(parsed.official) && admin;
    if (parsed.official && !admin) return fail("Only a steward can mark a notice as official.");
    const link = parsed.sourceUrl?.trim() ? cleanHttpUrl(parsed.sourceUrl) : null;
    if (parsed.sourceUrl?.trim() && !link) return fail("Source links must start with http or https.");
    const sourceLabel = official
      ? `${me.fullName} · steward notice. Confirm it on the university site before you rely on it.`
      : `${me.fullName} · ${me.roleConfirmed ? me.role : "unconfirmed " + me.role} note. Not an official university announcement.`;
    await sql`
      insert into announcements (title, body, category, source_label, source_url, official, author_id)
      values (
        ${cleanText(parsed.title, 140)}, ${cleanText(parsed.body, 2000)}, ${parsed.category},
        ${sourceLabel}, ${link}, ${official}, ${context.userId}
      )
    `;
    await audit(sql, context.userId, "announcement", parsed.title);
    return { ok: true as const };
  });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const rows = await sql<Row>`
      select id, kind, title, body, href, read_at, created_at
      from notifications where user_id = ${context.userId}
      order by created_at desc limit 40
    `;
    const notes: Note[] = rows.map((row) => ({
      id: num(row, "id"),
      kind: str(row, "kind"),
      title: str(row, "title"),
      body: str(row, "body"),
      href: str(row, "href"),
      read: Boolean(nullable(row, "read_at")),
      createdAt: str(row, "created_at"),
    }));
    return { ok: true as const, notes };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await db();
    await sql`update notifications set read_at = now() where user_id = ${context.userId} and read_at is null`;
    return { ok: true as const };
  });

export const searchCampus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ q: z.string().trim().min(2, "Type at least 2 letters.").max(80) }), data);
    if ("ok" in parsed) return parsed;
    const q = parsed.q.replace(/[%_]/g, "").trim();
    if (q.length < 2) return fail("Type at least 2 letters.");
    const like = `%${q}%`;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    const people = await sql<Row>`
      select p.user_id, p.full_name, g.name as programme_name, s.short_name as school_short
      from profiles p
      left join programmes g on g.id = p.programme_id
      left join schools s on s.id = p.school_id
      where p.account_status = 'active' and p.user_id <> ${context.userId}
        and (p.full_name ilike ${like} or g.name ilike ${like} or p.department ilike ${like} or p.interests ilike ${like})
        and p.visibility = 'campus'
        and not exists (
          select 1 from blocks b
          where (b.blocker_id = ${context.userId} and b.blocked_id = p.user_id)
             or (b.blocker_id = p.user_id and b.blocked_id = ${context.userId})
        )
      order by p.full_name limit 8
    `;
    const posts = await sql<Row>`
      select p.id, p.body, pr.full_name from posts p
      join profiles pr on pr.user_id = p.user_id
      where p.hidden = false and p.audience = 'campus' and p.body ilike ${like}
      order by p.created_at desc limit 8
    `;
    const communities = await sql<Row>`
      select slug, name from communities where name ilike ${like} or summary ilike ${like} order by name limit 8
    `;
    const videos = await sql<Row>`
      select id, title from videos where hidden = false and (title ilike ${like} or description ilike ${like})
      order by created_at desc limit 8
    `;
    const resources = await sql<Row>`
      select id, title from library_resources
      where hidden = false and access = 'campus' and (title ilike ${like} or subject ilike ${like} or description ilike ${like})
      order by created_at desc limit 8
    `;
    const announcements = await sql<Row>`
      select id, title from announcements where title ilike ${like} or body ilike ${like}
      order by created_at desc limit 8
    `;
    return {
      ok: true as const,
      people: people.map((row) => ({
        userId: str(row, "user_id"),
        fullName: str(row, "full_name"),
        programmeName: nullable(row, "programme_name"),
        schoolShort: nullable(row, "school_short"),
      })),
      posts: posts.map((row) => ({ id: num(row, "id"), body: str(row, "body"), author: str(row, "full_name") })),
      communities: communities.map((row) => ({ slug: str(row, "slug"), name: str(row, "name") })),
      videos: videos.map((row) => ({ id: num(row, "id"), title: str(row, "title") })),
      resources: resources.map((row) => ({ id: num(row, "id"), title: str(row, "title") })),
      announcements: announcements.map((row) => ({ id: num(row, "id"), title: str(row, "title") })),
    };
  });

async function smartbase(path: string, body: object) {
  const key = process.env.SMARTBASE_API_KEY;
  if (!key) return { configured: false as const };
  const response = await fetch(`https://smartemail.de5.net/api/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-smartbase-key": key },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const rejected = record?.success === false || record?.ok === false || record?.verified === false;
  return { configured: true as const, ok: response.ok && !rejected };
}

export const requestEmailConfirm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    if (!me.campusEmail || !me.emailDomainOk) return fail("Add an @mubas.ac.mw address first.");
    const paced = await limited(sql, context.userId, "email");
    if (paced) return paced;
    const result = await smartbase("send-verification", { email: me.campusEmail, name: me.fullName });
    if (!result.configured) {
      return fail("Mailbox confirmation is not connected yet. The address is domain-checked only, which does not prove enrolment.");
    }
    if (!result.ok) return fail("The mailbox service did not send a code. Try again later.");
    await sql`
      insert into email_checks (user_id, email, status)
      values (${context.userId}, ${me.campusEmail}, 'code_sent')
      on conflict (user_id) do update set email = ${me.campusEmail}, status = 'code_sent', updated_at = now()
    `;
    return { ok: true as const };
  });

export const confirmEmailCode = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ code: z.string().trim().min(4).max(12) }), data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    if (!me.campusEmail) return fail("Add an @mubas.ac.mw address first.");
    const paced = await limited(sql, context.userId, "email");
    if (paced) return paced;
    const result = await smartbase("verify-code", { email: me.campusEmail, code: parsed.code });
    if (!result.configured) {
      return fail("Mailbox confirmation is not connected yet.");
    }
    if (!result.ok) return fail("That code was not accepted.");
    await sql`update profiles set email_confirmed = true where user_id = ${context.userId}`;
    await sql`
      insert into email_checks (user_id, email, status)
      values (${context.userId}, ${me.campusEmail}, 'confirmed')
      on conflict (user_id) do update set status = 'confirmed', updated_at = now()
    `;
    return { ok: true as const };
  });

export const openPreviewSteward = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, dbSource } = await db();
    if (dbSource !== "pglite") return fail("On the published campus, an operator assigns stewards.");
    const me = await active(sql, context.userId);
    if (isFail(me)) return me;
    await sql`update profiles set role = 'admin', role_confirmed = true where user_id = ${context.userId}`;
    await audit(sql, context.userId, "preview-steward", "Opened steward tools in the local preview.");
    return { ok: true as const };
  });

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await db();
    if (!(await isAdmin(sql, context.userId))) return fail("Steward tools are not available on this account.");
    const stats = await sql<Row>`
      select
        (select count(*)::int from profiles) as profiles,
        (select count(*)::int from profiles where email_domain_ok) as domain_ok,
        (select count(*)::int from profiles where email_confirmed) as confirmed,
        (select count(*)::int from profiles where account_status = 'active' and last_seen > now() - interval '1 day') as active_day,
        (select count(*)::int from communities) as communities,
        (select count(*)::int from posts where hidden = false) as posts,
        (select count(*)::int from videos where hidden = false) as videos,
        (select count(*)::int from library_resources where hidden = false) as resources,
        (select coalesce(sum(coalesce(octet_length(avatar_data), 0) + coalesce(octet_length(cover_data), 0)), 0)::int from profiles) as image_bytes
    `;
    const applications = await sql<Row>`
      select id, provider_name, kind, email, description, materials, audience, reason, status, created_at
      from library_applications where status = 'pending' order by created_at asc limit 20
    `;
    const reports = await sql<Row>`
      select id, target_type, target_id, reason, details, status, created_at
      from reports where status = 'open' order by created_at asc limit 30
    `;
    const people = await sql<Row>`
      select user_id, full_name, auth_email, role, role_confirmed, account_status
      from profiles order by created_at desc limit 30
    `;
    const logs = await sql<Row>`
      select id, actor_id, action, detail, created_at from audit_logs order by created_at desc limit 20
    `;
    const stat = stats[0] ?? {};
    return {
      ok: true as const,
      stats: {
        profiles: num(stat, "profiles"),
        domainOk: num(stat, "domain_ok"),
        confirmed: num(stat, "confirmed"),
        activeDay: num(stat, "active_day"),
        communities: num(stat, "communities"),
        posts: num(stat, "posts"),
        videos: num(stat, "videos"),
        resources: num(stat, "resources"),
        imageBytes: num(stat, "image_bytes"),
      },
      applications: applications.map((row) => ({
        id: num(row, "id"),
        providerName: str(row, "provider_name"),
        kind: str(row, "kind"),
        email: str(row, "email"),
        description: str(row, "description"),
        materials: str(row, "materials"),
        audience: str(row, "audience"),
        reason: str(row, "reason"),
        createdAt: str(row, "created_at"),
      })),
      reports: reports.map((row) => ({
        id: num(row, "id"),
        targetType: str(row, "target_type"),
        targetId: str(row, "target_id"),
        reason: str(row, "reason"),
        details: str(row, "details"),
        createdAt: str(row, "created_at"),
      })),
      people: people.map((row) => ({
        userId: str(row, "user_id"),
        fullName: str(row, "full_name"),
        email: str(row, "auth_email"),
        role: str(row, "role"),
        roleConfirmed: flag(row, "role_confirmed"),
        accountStatus: str(row, "account_status"),
      })),
      logs: logs.map((row) => ({
        id: num(row, "id"),
        action: str(row, "action"),
        detail: str(row, "detail"),
        createdAt: str(row, "created_at"),
      })),
    };
  });

export const adminAct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(
      z.object({
        action: z.enum([
          "approve-library",
          "reject-library",
          "review-report",
          "dismiss-report",
          "hide-target",
          "suspend",
          "restore",
          "confirm-role",
          "set-role",
        ]),
        id: z.number().int().positive().optional(),
        userId: z.string().max(80).optional(),
        role: z.enum(["student", "lecturer", "staff"]).optional(),
      }),
      data,
    );
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    if (!(await isAdmin(sql, context.userId))) return fail("Steward tools are not available on this account.");
    if (parsed.action === "approve-library" && parsed.id) {
      const apps = await sql<Row>`
        select * from library_applications where id = ${parsed.id} and status = 'pending'
      `;
      if (!apps[0]) return fail("That application is not waiting.");
      await sql`update library_applications set status = 'approved' where id = ${parsed.id}`;
      const created = await sql<{ id: number }>`
        insert into libraries (owner_id, application_id, name, description)
        values (${str(apps[0], "user_id")}, ${parsed.id}, ${str(apps[0], "provider_name")}, ${str(apps[0], "description")})
        returning id
      `;
      await sql`
        insert into library_members (library_id, user_id, role)
        values (${num(created[0] ?? {}, "id")}, ${str(apps[0], "user_id")}, 'owner')
      `;
      await audit(sql, context.userId, "approve-library", str(apps[0], "provider_name"));
      return { ok: true as const };
    }
    if (parsed.action === "reject-library" && parsed.id) {
      await sql`update library_applications set status = 'rejected' where id = ${parsed.id}`;
      await audit(sql, context.userId, "reject-library", String(parsed.id));
      return { ok: true as const };
    }
    if ((parsed.action === "review-report" || parsed.action === "dismiss-report") && parsed.id) {
      const status = parsed.action === "review-report" ? "reviewed" : "dismissed";
      await sql`update reports set status = ${status} where id = ${parsed.id}`;
      await audit(sql, context.userId, status + "-report", String(parsed.id));
      return { ok: true as const };
    }
    if (parsed.action === "hide-target" && parsed.id) {
      const reports = await sql<Row>`select target_type, target_id from reports where id = ${parsed.id}`;
      if (!reports[0]) return fail("Report not found.");
      const type = str(reports[0], "target_type");
      const target = str(reports[0], "target_id");
      if (type === "post") await sql.query(`update posts set hidden = true where id = $1`, [Number(target)]);
      if (type === "video") await sql.query(`update videos set hidden = true where id = $1`, [Number(target)]);
      if (type === "resource") await sql.query(`update library_resources set hidden = true where id = $1`, [Number(target)]);
      if (type === "showcase") await sql.query(`update showcase_items set hidden = true where id = $1`, [Number(target)]);
      await sql`update reports set status = 'reviewed' where id = ${parsed.id}`;
      await audit(sql, context.userId, "hide", `${type}:${target}`);
      return { ok: true as const };
    }
    if (parsed.userId && parsed.userId !== context.userId) {
      if (parsed.action === "suspend") {
        await sql`update profiles set account_status = 'suspended' where user_id = ${parsed.userId}`;
      } else if (parsed.action === "restore") {
        await sql`update profiles set account_status = 'active' where user_id = ${parsed.userId} and account_status = 'suspended'`;
      } else if (parsed.action === "confirm-role") {
        await sql`update profiles set role_confirmed = true where user_id = ${parsed.userId}`;
      } else if (parsed.action === "set-role" && parsed.role) {
        await sql`update profiles set role = ${parsed.role}, role_confirmed = false where user_id = ${parsed.userId} and role <> 'admin'`;
      } else {
        return fail("That action is not available.");
      }
      await audit(sql, context.userId, parsed.action, parsed.userId);
      return { ok: true as const };
    }
    return fail("That action is not available.");
  });

export const exportMine = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql } = await db();
    const row = await ownerRow(sql, context.userId);
    if (!row) return fail("No profile to export.");
    const profile = mapProfile(row);
    const posts = await sql<Row>`select id, body, audience, kind, created_at from posts where user_id = ${context.userId} order by created_at desc`;
    const messages = await sql<Row>`
      select id, conversation_id, body, created_at from messages
      where user_id = ${context.userId} and deleted_at is null order by created_at desc limit 200
    `;
    return {
      ok: true as const,
      export: {
        profile: { ...profile, avatarData: profile.avatarData ? "included-separately" : null, coverData: null },
        posts: posts.map((item) => ({ id: num(item, "id"), body: str(item, "body"), createdAt: str(item, "created_at") })),
        messages: messages.map((item) => ({
          id: num(item, "id"),
          conversationId: num(item, "conversation_id"),
          body: str(item, "body"),
          createdAt: str(item, "created_at"),
        })),
      },
    };
  });

export const leaveCampus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const parsed = parse(z.object({ confirm: z.literal("LEAVE") }), data);
    if ("ok" in parsed) return parsed;
    const { sql } = await db();
    const userId = context.userId;
    const photos = await sql<Row>`select media_path, thumb_path from showcase_items where user_id = ${userId} and (media_path is not null or thumb_path is not null)`;
    const storyFiles = await sql<Row>`select media_path from stories where user_id = ${userId}`;
    await sql`delete from stories where user_id = ${userId}`;
    await sql`delete from ai_chats where user_id = ${userId}`;
    await sql`delete from ai_files where user_id = ${userId}`;
    await sql`delete from showcase_saves where user_id = ${userId}`;
    await sql`delete from daily_usage where user_id = ${userId}`;
    await sql`delete from showcase_views where user_id = ${userId}`;
    await sql`delete from showcase_comments where user_id = ${userId}`;
    await sql`delete from showcase_likes where user_id = ${userId}`;
    await sql`delete from showcase_items where user_id = ${userId}`;
    const photoPaths = [
      ...photos.flatMap((row) => [str(row, "media_path"), str(row, "thumb_path")]),
      ...storyFiles.map((row) => str(row, "media_path")),
    ].filter(Boolean);
    if (photoPaths.length) {
      try {
        const hf = await import("@/lib/hf.server");
        if (hf.hfConfigured()) await hf.hfDelete(photoPaths, "Remove a closed account's photos");
      } catch (error) {
        console.error("[leave] could not remove stored photos", error instanceof Error ? error.message : error);
      }
    }
    await sql`delete from library_resources where uploader_id = ${userId}`;
    await sql`delete from libraries where owner_id = ${userId}`;
    await sql`delete from video_comments where user_id = ${userId}`;
    await sql`delete from videos where user_id = ${userId}`;
    await sql`delete from comments where user_id = ${userId}`;
    await sql`delete from posts where user_id = ${userId}`;
    await sql`delete from notifications where user_id = ${userId}`;
    await sql`update messages set body = '', attachment_url = null, deleted_at = now() where user_id = ${userId}`;
    await sql`
      update profiles set
        full_name = 'Former member', campus_email = null, bio = '', interests = '', skills = '',
        avatar_data = null, cover_data = null, account_status = 'withdrawn', visibility = 'friends',
        email_confirmed = false
      where user_id = ${userId}
    `;
    await audit(sql, userId, "leave", "Profile closed and personal content removed.");
    return { ok: true as const };
  });
