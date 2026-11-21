/** SQL for Zapa Content. Pure functions (no server imports) so they can be tested on their own. */

export const CONTENT_TABS = ["for-you", "following", "trending", "mubas", "friends"] as const;
export type ContentTab = (typeof CONTENT_TABS)[number];

export type ListParams = {
  offset?: number;
  tab?: ContentTab;
  kind?: "post" | "image" | "video";
  category?: string;
  authorId?: string;
  q?: string;
  id?: number;
};

export const PAGE = 12;

const SELECT = `s.id, s.user_id, s.kind, s.title, s.body, s.category, s.media_path, s.thumb_path, s.media_type,
  s.link_url, s.views, s.shares, s.created_at, p.full_name, p.role, p.role_confirmed,
  (select count(*) from showcase_likes l where l.item_id = s.id) as like_count,
  (select count(*) from showcase_comments c where c.item_id = s.id) as comment_count,
  exists(select 1 from showcase_likes l where l.item_id = s.id and l.user_id = $1) as liked,
  exists(select 1 from follows f where f.follower_id = $1 and f.following_id = s.user_id) as following`;

const SCORE = `(select count(*) from showcase_likes l2 where l2.item_id = s.id) * 3
  + (select count(*) from showcase_comments c2 where c2.item_id = s.id) * 4 + s.shares * 5 + s.views as score`;

export function buildListQuery(userId: string, params: ListParams): { text: string; values: unknown[] } {
  const values: unknown[] = [userId];
  let where = `s.hidden = false and s.pending = false and p.account_status = 'active'
    and not exists (select 1 from blocks b where (b.blocker_id = $1 and b.blocked_id = s.user_id) or (b.blocker_id = s.user_id and b.blocked_id = $1))`;
  const add = (clause: string, value: unknown) => {
    values.push(value);
    where += ` and ${clause.replaceAll("?", `$${values.length}`)}`;
  };
  if (params.id) add("s.id = ?", params.id);
  if (params.kind) add("s.kind = ?", params.kind);
  if (params.category) add("s.category = ?", params.category);
  if (params.authorId) add("s.user_id = ?", params.authorId);
  if (params.q) add("(s.title ilike ? or s.body ilike ?)", `%${params.q}%`);
  const tab = params.tab ?? "for-you";
  if (tab === "following") {
    where += ` and exists (select 1 from follows f2 where f2.follower_id = $1 and f2.following_id = s.user_id)`;
  } else if (tab === "friends") {
    where += ` and exists (select 1 from friendships fr where (fr.user_a = $1 and fr.user_b = s.user_id) or (fr.user_b = $1 and fr.user_a = s.user_id))`;
  } else if (tab === "mubas") {
    where += ` and (p.role = 'admin' or (p.role in ('lecturer', 'staff') and p.role_confirmed = true)
      or s.title ilike '%#mubas%' or s.body ilike '%#mubas%')`;
  } else if (tab === "trending") {
    where += ` and s.created_at > now() - interval '14 days'`;
  }
  const order = tab === "trending" ? "score desc, s.created_at desc, s.id desc" : "s.created_at desc, s.id desc";
  values.push(PAGE, params.offset ?? 0);
  const text = `select ${SELECT}, ${SCORE}
    from showcase_items s join profiles p on p.user_id = s.user_id
    where ${where}
    order by ${order}
    limit $${values.length - 1} offset $${values.length}`;
  return { text, values };
}

/** Stories from the last 24 hours, newest first. */
export const STORIES_SQL = `select st.id, st.user_id, st.caption, st.created_at, p.full_name
  from stories st join profiles p on p.user_id = st.user_id
  where st.hidden = false and p.account_status = 'active' and st.created_at > now() - interval '24 hours'
    and not exists (select 1 from blocks b where (b.blocker_id = $1 and b.blocked_id = st.user_id) or (b.blocker_id = st.user_id and b.blocked_id = $1))
  order by st.created_at desc, st.id desc
  limit 120`;
