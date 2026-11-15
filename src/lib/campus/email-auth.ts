import { authClient } from "@/lib/auth/client";

type Result = { error: { message?: string; code?: string; status?: number; statusText?: string } | null };

type EmailAuth = {
  signUp: {
    email: (body: { email: string; password: string; name: string }) => Promise<Result>;
  };
  signIn: {
    email: (body: { email: string; password: string; callbackURL?: string }) => Promise<Result>;
  };
  changePassword: (body: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions?: boolean;
  }) => Promise<Result>;
  requestPasswordReset: (body: { email: string; redirectTo?: string }) => Promise<Result>;
};

export function emailAuth(): EmailAuth {
  return authClient as unknown as EmailAuth;
}

export function authFailure(error: NonNullable<Result["error"]>, fallback: string): string {
  const detail = error.message || error.code || error.statusText;
  return detail ? `${detail}${error.status ? ` (${error.status})` : ""}` : fallback;
}

export function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Try again.";
}
