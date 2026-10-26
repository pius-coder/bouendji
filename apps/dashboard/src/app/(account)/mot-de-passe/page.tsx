import type { Metadata } from "next";
import { PasswordChangeForm } from "@/components/account/password-change-form";
import { Icon } from "@/components/common/icon";
import { logoutAction } from "@/server/actions/auth.action";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

/**
 * Changement de mot de passe exigé avant tout le reste (groupe sans shell). Pas de
 * lecture de session ici : l'API accepte `/me/password` pour un compte qui doit
 * changer de mot de passe. Après succès : retour à l'accueil.
 */
export default function ChangePasswordPage() {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-frame p-4">
      <div className="flex w-full max-w-[420px] flex-col gap-6 rounded-2xl bg-surface p-8 shadow-surface">
        <div className="flex flex-col gap-4">
          <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Icon name="lock" className="size-6" />
          </span>
          <div>
            <h1 className="text-title-2 font-bold tracking-tight">Changez votre mot de passe</h1>
            <p className="text-subhead text-muted-foreground">
              Pour continuer, choisissez un nouveau mot de passe d&apos;au moins 12 caractères.
            </p>
          </div>
        </div>
        <PasswordChangeForm redirectTo="/" />
        <form action={logoutAction} className="border-t border-separator pt-4">
          <Button type="submit" variant="ghost" className="w-full">
            Se déconnecter
          </Button>
        </form>
      </div>
    </main>
  );
}
