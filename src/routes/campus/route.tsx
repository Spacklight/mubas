import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CampusState } from "@/components/campus-state";
import { Shell } from "@/components/shell";

import { seo } from "@/lib/site";

export const Route = createFileRoute("/campus")({
  head: () => seo({ title: "Zapa MUBAS", path: "/campus", noindex: true }),
  component: () => (
    <CampusState>
      <Shell>
        <Outlet />
      </Shell>
    </CampusState>
  ),
});
