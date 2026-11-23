import { createFileRoute, redirect } from "@tanstack/react-router";

// Shared links open the full-screen player.
export const Route = createFileRoute("/campus/content/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/campus/reels", search: { id: Number(params.id) } });
  },
});
