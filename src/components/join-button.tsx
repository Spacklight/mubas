import { useState } from "react";
import { toast } from "sonner";
import { joinCommunity } from "@/lib/campus/server";
import type { CommunityCard } from "@/lib/campus/types";
import { failureMessage } from "@/lib/campus/email-auth";
import { unwrap } from "@/components/page-kit";
import { btn, btnGhost } from "@/components/ui";

export function JoinButton({ room, onChange }: { room: CommunityCard; onChange: () => void }) {
  const [pending, setPending] = useState(false);
  const member = room.membership === "member" || room.membership === "rep";
  async function toggle() {
    setPending(true);
    try {
      await unwrap(joinCommunity({ data: { slug: room.slug, leave: member || room.membership === "pending" } }));
      onChange();
    } catch (reason) {
      toast.error(failureMessage(reason));
    } finally {
      setPending(false);
    }
  }
  return (
    <button type="button" disabled={pending} onClick={() => void toggle()} className={member ? btnGhost : btn}>
      {member ? "Leave" : room.membership === "pending" ? "Cancel request" : "Join"}
    </button>
  );
}
