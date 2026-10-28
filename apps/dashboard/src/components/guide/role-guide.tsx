"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saveOnboardingStepAction } from "@/server/actions/onboarding.action";

export type GuideRoleKey = "community_admin" | "support" | "finance" | "reseau" | "owner";

interface RoleGuideStep {
  title: string;
  situation: string;
  steps: readonly string[];
  actionLabel?: string;
  actionHref?: (communityId: string | null) => string;
}

const GUIDE_BY_ROLE: Record<
  GuideRoleKey,
  {
    label: string;
    summary: string;
    cases: readonly RoleGuideStep[];
  }
> = {
  community_admin: {
    label: "Admin de communauté",
    summary:
      "Vous gérez votre marque VPN, vos forfaits, votre groupe WhatsApp, votre équipe et vos demandes de versement.",
    cases: [
      {
        title: "1. Configurer ma communauté et mon application",
        situation:
          "Première connexion : créez votre communauté, choisissez le thème de votre application Android, vos forfaits et demandez la compilation de l'APK.",
        steps: [
          "Ouvrez l'assistant de configuration en 6 étapes.",
          "Renseignez le lien du groupe WhatsApp (https://chat.whatsapp.com/...) et votre numéro WhatsApp (+237...).",
          "Choisissez le nom de l'application, le thème visuel et votre logo PNG/SVG.",
          "Vérifiez vos forfaits avec l'indicateur de prix plancher, puis cliquez sur « Demander mon application ».",
        ],
        actionLabel: "Ouvrir l'assistant",
        actionHref: () => "/onboarding",
      },
      {
        title: "2. Ajuster mes forfaits sans vendre à perte",
        situation:
          "Vous souhaitez créer une promo ou ajouter une option nuit (20h–00h, 00h–04h, 20h–04h).",
        steps: [
          "Rendez-vous dans Offres → Forfaits.",
          "La barre de répartition affiche en direct le coût serveur, la marge plateforme et votre gain par vente.",
          "Si un prix passe sous le minimum, cliquez sur « Utiliser le plancher ».",
        ],
        actionLabel: "Gérer mes forfaits",
        actionHref: (cid) => (cid ? `/${cid}/plans` : "/onboarding"),
      },
      {
        title: "3. Dépanner un abonné ou retirer ses commissions",
        situation:
          "Un abonné signale un souci sur WhatsApp, ou vous voulez encaisser vos commissions disponibles.",
        steps: [
          "Tapez Ctrl+K (ou cliquez sur Rechercher) et saisissez le nom ou la référence Fapshi.",
          "Cliquez sur le nom de l'abonné pour ouvrir sa fiche tiroir (Abonnés · Appareils · Commandes · Secours).",
          "Pour vos gains, ouvrez Argent → Versements et cliquez sur « Préparer un versement ».",
        ],
        actionLabel: "Voir mes revenus",
        actionHref: () => "/payouts",
      },
    ],
  },
  support: {
    label: "Support client",
    summary:
      "Vous aidez les abonnés au quotidien : vérification de paiement, révocation d'appareil perdu et émission de fichier de secours `.bvpn`.",
    cases: [
      {
        title: "1. Un abonné dit « J'ai payé mais ça ne marche pas »",
        situation:
          "L'abonné vous envoie sa capture Mobile Money sur WhatsApp.",
        steps: [
          "Ouvrez la recherche globale (Ctrl+K) et collez son nom ou sa référence Fapshi.",
          "Ouvrez la fiche Commande : vérifiez si le statut est Payée et Activée.",
          "Cliquez sur le nom de l'abonné dans la fiche pour vérifier son quota restant et ses appareils enregistrés.",
        ],
      },
      {
        title: "2. L'abonné a changé ou perdu son téléphone",
        situation:
          "Il atteint la limite d'appareils de son forfait et ne peut plus se connecter sur son nouveau téléphone.",
        steps: [
          "Ouvrez la fiche de l'abonné puis l'onglet Appareils.",
          "Cliquez sur l'ancien appareil pour ouvrir sa fiche.",
          "Cliquez sur « Révoquer l'appareil » et confirmez : la place se libère immédiatement.",
        ],
      },
      {
        title: "3. Le réseau bloque la récupération automatique",
        situation:
          "L'abonné a un abonnement actif mais son téléphone n'arrive pas à joindre l'API.",
        steps: [
          "Ouvrez la fiche de son appareil actif.",
          "Cliquez sur « Fichier de secours (.bvpn) », choisissez la durée (ex. 48 h) et téléchargez le fichier.",
          "Envoyez le fichier `.bvpn` à l'abonné sur WhatsApp : il l'ouvre directement dans l'application.",
        ],
      },
    ],
  },
  finance: {
    label: "Finance & Comptabilité",
    summary:
      "Vous suivez les commandes encaissées, les commissions générées et le traitement des versements aux communautés.",
    cases: [
      {
        title: "1. Préparer et approuver un versement",
        situation:
          "Les commissions d'une communauté sont accumulées et doivent être versées.",
        steps: [
          "Ouvrez Argent → Versements.",
          "Cliquez sur un versement en attente pour inspecter toutes les commandes incluses.",
          "Approuvez le versement (un versement préparé par un admin doit être approuvé par un autre).",
        ],
        actionLabel: "Ouvrir les versements",
        actionHref: () => "/payouts",
      },
      {
        title: "2. Payer, confirmer ou trancher un incident",
        situation:
          "Le virement Mobile Money est lancé ou marqué « À vérifier » (`needs_review`).",
        steps: [
          "Dans la fiche du versement approuvé, cliquez sur « Payer » puis « Confirmer la réception ».",
          "Si le statut passe en « À vérifier », contrôlez la référence sur le portail fournisseur puis saisissez la référence (Payé) ou le motif (Échoué).",
        ],
      },
    ],
  },
  reseau: {
    label: "Opérateur Réseau",
    summary:
      "Vous assurez la disponibilité des créneaux de nuit (20h et minuit) et des serveurs de jour 3x-ui.",
    cases: [
      {
        title: "1. Prendre en charge un créneau de nuit (20h ou 00h)",
        situation:
          "À 19h45 ou 23h45, le rappel Telegram sonne pour préparer les serveurs de nuit.",
        steps: [
          "Ouvrez Réseau → Ce soir.",
          "Cliquez sur « Je m'en occupe » sur le créneau concerné.",
          "Ouvrez « Marche à suivre » : générez la clé de déploiement à usage unique (`ENDPOINT_INGEST_SECRET`) et suivez les commandes Cloud Run.",
        ],
        actionLabel: "Ouvrir Réseau · Ce soir",
        actionHref: () => "/network",
      },
      {
        title: "2. Ajouter un serveur de jour ou un lien VLESS de secours",
        situation:
          "Un serveur de jour approche de sa limite ou vous ajoutez un VPS 3x-ui.",
        steps: [
          "Ouvrez Réseau → Jour.",
          "Ajoutez un panneau 3x-ui et cliquez sur « Tester » pour vérifier la connexion.",
          "En dépannage rapide, collez un lien VLESS : les champs techniques sont extraits en lecture seule et un nom aléatoire est généré.",
        ],
      },
    ],
  },
  owner: {
    label: "Propriétaire Plateforme",
    summary:
      "Vous pilotez l'ensemble de la plateforme : tarifs planchers, validation des APK, communautés, administrateurs et réseau.",
    cases: [
      {
        title: "1. Inviter un admin de communauté sur WhatsApp",
        situation:
          "Un nouveau partenaire rejoint Bouendji pour lancer sa communauté.",
        steps: [
          "Ouvrez Plateforme → Administrateurs puis cliquez sur « Nouvel administrateur ».",
          "Saisissez son nom et son numéro WhatsApp (+237...).",
          "L'API génère un mot de passe temporaire et un bouton « Envoyer sur WhatsApp » prêt à expédier.",
        ],
        actionLabel: "Gérer les admins",
        actionHref: () => "/admins",
      },
      {
        title: "2. Valider ou refuser une demande de build APK",
        situation:
          "Un admin a terminé son onboarding et demandé la compilation de son application.",
        steps: [
          "Sur l'Accueil ou dans Plateforme → Communautés (onglet Demandes de build), cliquez sur la demande `requested`.",
          "Vérifiez l'aperçu téléphone, le nom de paquet et le logo.",
          "Cliquez sur « Valider et compiler » pour déclencher GitHub Actions, ou « Refuser avec motif ».",
        ],
        actionLabel: "Voir les communautés",
        actionHref: () => "/communities",
      },
      {
        title: "3. Ajuster les coûts et marges de la plateforme",
        situation:
          "Le coût par Go ou les coûts des créneaux de nuit évoluent.",
        steps: [
          "Ouvrez Plateforme → Tarifs (`/pricing`).",
          "Modifiez le coût par Go, les coûts des créneaux de nuit, la marge plateforme ou le plafond de commission.",
          "Les forfaits existants qui passent sous le nouveau plancher sont signalés sans coupure brutale.",
        ],
        actionLabel: "Régler les tarifs",
        actionHref: () => "/pricing",
      },
    ],
  },
};

export function RoleGuideSheet({
  defaultRole = "community_admin",
  communityId = null,
}: {
  defaultRole?: GuideRoleKey;
  communityId?: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [role, setRole] = React.useState<GuideRoleKey>(defaultRole);
  const [saving, startTransition] = React.useTransition();

  const markGuideRead = () => {
    startTransition(async () => {
      const res = await saveOnboardingStepAction({ completed: true });
      if (res.ok) {
        toast.success("Guide marqué comme lu.");
        setOpen(false);
      } else {
        setOpen(false);
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Icon name="info" className="size-4" />
          <span className="hidden sm:inline">Guide</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Guide pratique par rôle</SheetTitle>
          <SheetDescription>
            Cas concrets et marche à suivre pas à pas selon votre rôle sur la plateforme.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 pb-6">
          <Tabs value={role} onValueChange={(v) => setRole(v as GuideRoleKey)}>
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="community_admin">Admin</TabsTrigger>
              <TabsTrigger value="support">Support</TabsTrigger>
              <TabsTrigger value="finance">Finance</TabsTrigger>
              <TabsTrigger value="reseau">Réseau</TabsTrigger>
              <TabsTrigger value="owner">Propriétaire</TabsTrigger>
            </TabsList>

            {(Object.keys(GUIDE_BY_ROLE) as GuideRoleKey[]).map((key) => {
              const info = GUIDE_BY_ROLE[key];
              return (
                <TabsContent key={key} value={key} className="mt-4 flex flex-col gap-4">
                  <div className="rounded-section border border-separator bg-muted/40 p-3.5">
                    <p className="text-subhead font-semibold text-foreground">{info.label}</p>
                    <p className="mt-1 text-footnote text-muted-foreground">{info.summary}</p>
                  </div>

                  {info.cases.map((c) => (
                    <div
                      key={c.title}
                      className="flex flex-col gap-2.5 rounded-section border border-separator bg-background p-4"
                    >
                      <h4 className="text-subhead font-semibold text-foreground">{c.title}</h4>
                      <p className="text-footnote text-muted-foreground">{c.situation}</p>
                      <ol className="ms-4 list-decimal space-y-1 text-footnote text-foreground">
                        {c.steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                      {c.actionLabel && c.actionHref ? (
                        <div className="pt-1">
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            onClick={() => setOpen(false)}
                          >
                            <Link href={c.actionHref(communityId)}>{c.actionLabel}</Link>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </TabsContent>
              );
            })}
          </Tabs>

          <div className="flex items-center justify-between border-t border-separator pt-4">
            <Link
              href="/onboarding"
              onClick={() => setOpen(false)}
              className="text-footnote font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Ouvrir l&apos;assistant de configuration (6 étapes)
            </Link>
            <Button type="button" size="sm" disabled={saving} onClick={markGuideRead}>
              J&apos;ai compris
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
