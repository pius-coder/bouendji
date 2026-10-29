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
    <main className="grid h-dvh w-full bg-frame p-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(28rem,0.9fr)] lg:gap-3">
      <section className="relative hidden overflow-hidden rounded-[1.75rem] bg-sidebar p-10 text-white shadow-[0_24px_70px_rgba(15,23,42,0.24)] lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div aria-hidden className="absolute -top-32 -right-24 size-[28rem] rounded-full bg-accent-gradient opacity-25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-44 -left-32 size-[30rem] rounded-full bg-accent-gradient opacity-15 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-accent-gradient text-white shadow-[0_12px_32px_rgba(237,63,131,0.28)]">
            <Icon name="shield" filled className="size-6" />
          </span>
          <div>
            <p className="font-semibold tracking-tight">Bouendji</p>
            <p className="text-caption-1 text-sidebar-foreground">Console d&apos;administration</p>
          </div>
        </div>
        <div className="relative max-w-xl">
          <p className="mb-4 text-[0.7rem] font-bold uppercase tracking-[0.18em] text-accent-text">Plateforme VPN marque blanche</p>
          <h1 className="text-[clamp(2.5rem,5vw,4.75rem)] leading-[0.98] font-semibold tracking-[-0.045em]">
            Pilotez votre réseau, vos offres et vos revenus.
          </h1>
          <p className="mt-6 max-w-lg text-callout leading-relaxed text-sidebar-foreground">
            Un espace unique pour accompagner vos abonnés, publier votre application et garder le contrôle sur l&apos;infrastructure.
          </p>
        </div>
        <div className="relative grid grid-cols-3 gap-8">
          {[
            ["users", "Abonnés", "Suivi et assistance"],
            ["wallet", "Revenus", "Commissions et versements"],
            ["server", "Réseau", "État en temps réel"],
          ].map(([icon, label, detail]) => (
            <div key={label} className="py-2">
              <Icon name={icon as "users" | "wallet" | "server"} className="mb-3 size-5 text-white" />
              <p className="text-footnote font-semibold text-white">{label}</p>
              <p className="mt-0.5 text-caption-2 text-sidebar-foreground">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex min-h-0 items-center justify-center px-4 py-8 sm:px-8 lg:rounded-[1.75rem] lg:bg-surface">
        <div className="flex w-full max-w-[420px] flex-col gap-8">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-xl bg-accent-gradient text-white shadow-card">
              <Icon name="shield" filled className="size-6" />
            </span>
            <div>
              <p className="font-semibold tracking-tight">Bouendji</p>
              <p className="text-caption-1 text-muted-foreground">Console d&apos;administration</p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-accent-text">Accès sécurisé</p>
            <h2 className="text-title-1 font-semibold tracking-[-0.03em] md:text-large-title">Bon retour parmi nous.</h2>
            <p className="mt-2 text-subhead text-muted-foreground">Connectez-vous pour retrouver votre espace de travail.</p>
          </div>
          <Suspense fallback={<LoginForm next="/" />}>
            <LoginFormSection searchParams={searchParams} />
          </Suspense>
          <p className="text-center text-caption-1 text-muted-foreground">Accès réservé aux administrateurs autorisés.</p>
        </div>
      </section>
    </main>
  );
}
