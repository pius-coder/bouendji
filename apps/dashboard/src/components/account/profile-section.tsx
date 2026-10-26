import { getMe } from "@/server/context";
import { ProfileForm } from "./profile-form";

/** Profil lu sur le serveur (`getMe`, redirection incluse) puis passé au formulaire client. */
export async function ProfileSection() {
  const me = await getMe();
  return (
    <ProfileForm
      values={{
        name: me.name,
        email: me.email,
        whatsappNumber: me.whatsappNumber,
        telegramChatId: me.telegramChatId ?? null,
        platform: me.platformRole !== "none",
      }}
    />
  );
}
