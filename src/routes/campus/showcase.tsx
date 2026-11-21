import { createFileRoute, redirect } from "@tanstack/react-router";

// Showcase became Zapa Content, which now lives on the Home tab.
export const Route = createFileRoute("/campus/showcase")({
  beforeLoad: () => {
    throw redirect({ to: "/campus" });
  },
});
