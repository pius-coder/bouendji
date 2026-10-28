import "server-only";
import { CommunitySettingsCard } from "@/components/communities/community-settings-card";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { can } from "@/lib/roles";
import { getCommunities, getMe } from "@/server/context";

export async function CommunitySettingsSection({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  const { communityId } = await params;
  const [me, communities] = await Promise.all([getMe(), getCommunities()]);
  if (!can(me, "staff.manage", communityId)) {
    return <ForbiddenBlock />;
  }
  const community = communities.find((c) => c.id === communityId);
  if (!community) {
    return (
      <EmptyBlock
        icon="building"
        title="Communauté introuvable"
        description="Impossible de charger les coordonnées WhatsApp de cette communauté."
      />
    );
  }
  return <CommunitySettingsCard community={community} />;
}
