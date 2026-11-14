export type Role = "student" | "lecturer" | "staff" | "admin";
export type Relation = "self" | "friends" | "outgoing" | "incoming" | "none";
export type Audience = "campus" | "friends" | "community";
export type PostKind = "note" | "question" | "material";

export type School = {
  id: string;
  name: string;
  shortName: string;
  summary: string;
};

export type Programme = {
  id: string;
  schoolId: string;
  department: string;
  name: string;
  level: string;
};

export type Announcement = {
  id: number;
  title: string;
  body: string;
  category: string;
  sourceLabel: string;
  sourceUrl: string | null;
  official: boolean;
  createdAt: string;
};

export type Directory = {
  schools: School[];
  programmes: Programme[];
  announcements: Announcement[];
};

export type Profile = {
  userId: string;
  fullName: string;
  authEmail: string;
  campusEmail: string | null;
  role: Role;
  roleConfirmed: boolean;
  accountStatus: string;
  schoolId: string | null;
  schoolName: string | null;
  schoolShort: string | null;
  department: string | null;
  programmeId: string | null;
  programmeName: string | null;
  studyLevel: string | null;
  studyMode: string | null;
  academicYear: string | null;
  bio: string;
  interests: string;
  skills: string;
  visibility: "campus" | "friends";
  emailDomainOk: boolean;
  emailConfirmed: boolean;
  notifyMessages: boolean;
  notifySocial: boolean;
  notifyCampus: boolean;
  avatarData: string | null;
  coverData: string | null;
  lastSeen: string;
  createdAt: string;
};

export type PersonPreview = {
  userId: string;
  fullName: string;
  role: Role;
  roleConfirmed: boolean;
  schoolShort: string | null;
  programmeName: string | null;
  studyLevel: string | null;
  studyMode: string | null;
  academicYear: string | null;
  department: string | null;
  rank: number;
  relation: Relation;
  following: boolean;
  mutuals: number;
  hasAvatar: boolean;
};

export type Post = {
  id: number;
  userId: string;
  author: string;
  role: Role;
  roleConfirmed: boolean;
  programmeName: string | null;
  schoolShort: string | null;
  body: string;
  audience: Audience;
  kind: PostKind;
  linkUrl: string | null;
  communityName: string | null;
  communitySlug: string | null;
  shared: { id: number; author: string; body: string } | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  saved: boolean;
  createdAt: string;
};

export type Comment = {
  id: number;
  userId: string;
  author: string;
  body: string;
  createdAt: string;
};

export type CommunityCard = {
  id: number;
  slug: string;
  name: string;
  summary: string;
  schoolShort: string | null;
  memberCount: number;
  membership: "none" | "member" | "pending" | "rep";
};

export type ConversationCard = {
  id: number;
  kind: "direct" | "group";
  title: string;
  others: string;
  lastBody: string;
  lastAt: string;
  unread: number;
};

export type ChatMessage = {
  id: number;
  userId: string;
  author: string;
  body: string;
  attachmentUrl: string | null;
  replyTo: number | null;
  mine: boolean;
  removed: boolean;
  createdAt: string;
};

export type VideoItem = {
  id: number;
  userId: string;
  author: string;
  title: string;
  description: string;
  category: string;
  externalUrl: string;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  subscribed: boolean;
  createdAt: string;
};

export type LibraryResource = {
  id: number;
  libraryId: number;
  libraryName: string;
  title: string;
  description: string;
  subject: string;
  authorName: string;
  category: string;
  fileType: string;
  externalUrl: string | null;
  access: "campus" | "members";
  createdAt: string;
};

export type LibraryCard = {
  id: number;
  name: string;
  description: string;
  role: "owner" | "admin" | "contributor" | "reader" | "none";
};

export type LibraryApplication = {
  id: number;
  providerName: string;
  kind: string;
  status: string;
  createdAt: string;
};

export type Note = {
  id: number;
  kind: string;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
};

export type Fail = { ok: false; error: string };
