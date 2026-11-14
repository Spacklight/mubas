import { authClient } from "@/lib/auth/client";

type Result = { error: { message?: string } | null };

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

export function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Try again.";
}
