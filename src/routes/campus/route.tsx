import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CampusState } from "@/components/campus-state";
import { Shell } from "@/components/shell";

export const Route = createFileRoute("/campus")({
  component: () => (
    <CampusState>
      <Shell>
        <Outlet />
      </Shell>
    </CampusState>
  ),
});
