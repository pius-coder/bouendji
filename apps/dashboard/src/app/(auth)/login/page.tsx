import type { Metadata } from "next";
import { Suspense } from "react";
import { Icon } from "@/components/common/icon";
import { LoginForm } from "@/components/auth/login-form";
import { LoginFormSection } from "@/components/auth/login-form-section";

export const metadata: Metadata = { title: "Connexion" };

/**
 * Connexion (Chariow / Axa Zara : carte blanche centrée sur le gris). Seul `next`
 * dépend de la requête : le repli est le même formulaire avec `next = "/"`, rien
 * ne saute à l'affichage (D104).
 */
export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <main className="flex h-dvh w-full items-center justify-center bg-frame p-4">
      <div className="flex w-full max-w-[400px] flex-col gap-6 rounded-2xl bg-surface p-8 shadow-surface">
        <div className="flex flex-col gap-4">
          <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Icon name="shield" filled className="size-6" />
          </span>
          <div>
            <h1 className="text-title-2 font-bold tracking-tight">Connexion</h1>
            <p className="text-subhead text-muted-foreground">Console d&apos;administration</p>
          </div>
        </div>
        <Suspense fallback={<LoginForm next="/" />}>
          <LoginFormSection searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
