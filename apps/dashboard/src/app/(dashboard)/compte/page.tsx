import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountTabs } from "@/components/account/account-tabs";
import { AppearanceForm } from "@/components/account/appearance-form";
import { PasswordChangeForm } from "@/components/account/password-change-form";
import { ProfileSection } from "@/components/account/profile-section";
import { SessionsSection } from "@/components/account/sessions-section";
import { PageContent, PageHeader } from "@/components/page/page";

export const metadata: Metadata = { title: "Mon compte" };

/** Compte : profil, mot de passe, sessions, apparence. Chaque lecture a sa frontière Suspense. */
export default function AccountPage() {
  return (
    <PageContent>
      <PageHeader title="Mon compte" description="Profil, mot de passe, sessions et apparence." />
      <AccountTabs
        profile={
          <Suspense fallback={<div aria-hidden className="h-72 max-w-lg animate-pulse rounded-xl bg-group" />}>
            <ProfileSection />
          </Suspense>
        }
        password={
          <div className="max-w-lg">
            <PasswordChangeForm />
          </div>
        }
        sessions={
          <Suspense fallback={<div aria-hidden className="h-48 max-w-2xl animate-pulse rounded-xl bg-group" />}>
            <SessionsSection />
          </Suspense>
        }
        appearance={<AppearanceForm />}
      />
    </PageContent>
  );
}
