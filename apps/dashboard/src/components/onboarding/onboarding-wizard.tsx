"use client";

import * as React from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { useInvalidateAdmin } from "@/hooks/use-admin-query";
import { PhonePreview } from "@/components/common/phone-preview";
import { PriceIndicator } from "@/components/common/price-indicator";
import { StatusBadge } from "@/components/common/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dropzone, type DropzoneFilePayload } from "@/components/ui/dropzone";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatXaf } from "@/lib/format";
import { requestBuildAction } from "@/server/actions/builds.action";
import { updateCommunityAction } from "@/server/actions/communities.action";
import {
  createAppAction,
  createOnboardingCommunityAction,
  saveOnboardingStepAction,
  updateAppAction,
  uploadAppLogoAction,
} from "@/server/actions/onboarding.action";
import { createPlanAction } from "@/server/actions/plans.action";
import type { Build } from "@/server/services/builds/builds.service";
import type { Community } from "@/server/services/communities/communities.schema";
import {
  BRAND_THEME_META,
  BRAND_THEMES,
  type BrandTheme,
  isWhatsappGroupUrl,
  normalizeCameroonWhatsapp,
  type OnboardingState,
  previewPackageName,
  slugFromName,
} from "@/server/services/onboarding/onboarding.schema";
import { BYTES_PER_GB, type Plan } from "@/server/services/plans/plans.schema";
import { baseFloorXaf, nightOptionFloorXaf, type PricingSettings } from "@/server/services/pricing/pricing.schema";

const STEPS: readonly StepperStep[] = [
  { id: 1, label: "Votre profil", description: "Nom & WhatsApp" },
  { id: 2, label: "Communauté", description: "Groupe WhatsApp" },
  { id: 3, label: "Application", description: "Marque & thème" },
  { id: 4, label: "Forfaits", description: "Prix & marges" },
  { id: 5, label: "Équipe", description: "Support & finance" },
  { id: 6, label: "Récapitulatif", description: "Demander l'APK" },
];

interface PlanPreset {
  id: string;
  label: string;
  name: string;
  family: "limited" | "limited_night";
  quotaGb: number;
  durationDays: number;
  badge: string;
}

const PLAN_PRESETS: readonly PlanPreset[] = [
  {
    id: "semaine",
    label: "Semaine · 5 Go",
    name: "Pass Semaine 5 Go",
    family: "limited",
    quotaGb: 5,
    durationDays: 7,
    badge: "",
  },
  {
    id: "mois",
    label: "Mois · 15 Go",
    name: "Forfait Mois 15 Go",
    family: "limited",
    quotaGb: 15,
    durationDays: 30,
    badge: "Populaire",
  },
  {
    id: "nuit",
    label: "Mois + Nuit · 25 Go",
    name: "Forfait Nuit & Jour 25 Go",
    family: "limited_night",
    quotaGb: 25,
    durationDays: 30,
    badge: "Meilleur prix",
  },
];

export interface InitialAppInfo {
  id: string;
  slug: string;
  displayName: string;
  packageName: string | null;
  theme: BrandTheme;
  accentHex?: string | null;
  logoUrl?: string | null;
}

export function OnboardingWizard({
  adminName,
  onboarding,
  initialCommunity,
  initialApp,
  initialPlans,
  initialBuilds,
  pricing,
}: {
  adminName: string;
  onboarding: OnboardingState;
  initialCommunity: Community | null;
  initialApp: InitialAppInfo | null;
  initialPlans: readonly Plan[];
  initialBuilds: readonly Build[];
  pricing: PricingSettings;
}) {
  const invalidate = useInvalidateAdmin();
  const [pending, startTransition] = React.useTransition();

  const initialStep = Math.min(6, Math.max(1, onboarding.step || 1));
  const [step, setStep] = React.useState<number>(initialStep);

  // Étape 1 — Profil
  const [profileName, setProfileName] = React.useState(adminName);
  const [adminWhatsapp, setAdminWhatsapp] = React.useState(
    initialCommunity?.contactWhatsapp ?? "+237",
  );

  // Étape 2 — Communauté
  const [community, setCommunity] = React.useState<Community | null>(initialCommunity);
  const [communityName, setCommunityName] = React.useState(initialCommunity?.name ?? "");
  const [whatsappGroupUrl, setWhatsappGroupUrl] = React.useState(
    initialCommunity?.whatsappGroupUrl ?? "",
  );
  const [contactWhatsapp, setContactWhatsapp] = React.useState(
    initialCommunity?.contactWhatsapp ?? "+237",
  );

  // Étape 3 — Application
  const [app, setApp] = React.useState<InitialAppInfo | null>(initialApp);
  const [appDisplayName, setAppDisplayName] = React.useState(
    initialApp?.displayName ?? (initialCommunity?.name ? `${initialCommunity.name} VPN` : ""),
  );
  const [theme, setTheme] = React.useState<BrandTheme>(initialApp?.theme ?? "billet");
  const [accentHex, setAccentHex] = React.useState<string>(
    initialApp?.accentHex ?? BRAND_THEME_META[initialApp?.theme ?? "billet"].color,
  );
  const [logoUrl, setLogoUrl] = React.useState<string | null>(initialApp?.logoUrl ?? null);
  const [pendingLogo, setPendingLogo] = React.useState<DropzoneFilePayload | null>(null);

  // Étape 4 — Forfaits
  const [plans, setPlans] = React.useState<readonly Plan[]>(initialPlans);
  const [selectedPreset, setSelectedPreset] = React.useState<string>("mois");
  const commissionBps = community?.commissionBps ?? 1500;
  const defaultMoisFloor = baseFloorXaf(15 * BYTES_PER_GB, pricing) ?? 1500;
  const [planName, setPlanName] = React.useState("Forfait Mois 15 Go");
  const [planFamily, setPlanFamily] = React.useState<"limited" | "limited_night">("limited");
  const [planQuotaGb, setPlanQuotaGb] = React.useState<number>(15);
  const [planDurationDays, setPlanDurationDays] = React.useState<number>(30);
  const [planPriceXaf, setPlanPriceXaf] = React.useState<number>(
    Math.ceil((defaultMoisFloor + 500) / 100) * 100,
  );
  const defaultNightFloor = nightOptionFloorXaf("20-04", pricing) ?? 500;
  const [planNightPriceXaf, setPlanNightPriceXaf] = React.useState<number>(
    Math.ceil((defaultNightFloor + 200) / 100) * 100,
  );

  // Étape 6 — Builds
  const [builds, setBuilds] = React.useState<readonly Build[]>(initialBuilds);
  const latestBuild = builds[0] ?? null;

  const applyPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    const p = PLAN_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    setPlanName(p.name);
    setPlanFamily(p.family);
    setPlanQuotaGb(p.quotaGb);
    setPlanDurationDays(p.durationDays);
    const floor = baseFloorXaf(p.quotaGb * BYTES_PER_GB, pricing) ?? 1500;
    setPlanPriceXaf(Math.ceil((floor + 500) / 100) * 100);
    if (p.family === "limited_night") {
      const nFloor = nightOptionFloorXaf("20-04", pricing) ?? 500;
      setPlanNightPriceXaf(Math.ceil((nFloor + 200) / 100) * 100);
    }
  };

  // Sauvegarde Étape 1
  const submitStep1 = () => {
    if (profileName.trim().length < 2) {
      toast.error("Indiquez votre nom (au moins 2 caractères).");
      return;
    }
    const normalizedWa = normalizeCameroonWhatsapp(adminWhatsapp);
    if (!normalizedWa) {
      toast.error("Numéro WhatsApp camerounais attendu (+237 suivi de 9 chiffres commençant par 6 ou 2).");
      return;
    }
    startTransition(async () => {
      if (!contactWhatsapp || contactWhatsapp === "+237") {
        setContactWhatsapp(normalizedWa);
      }
      await saveOnboardingStepAction({ step: 2 });
      setStep(2);
    });
  };

  // Sauvegarde Étape 2
  const submitStep2 = () => {
    const trimmedName = communityName.trim();
    if (trimmedName.length < 2) {
      toast.error("Le nom de la communauté doit contenir au moins 2 caractères.");
      return;
    }
    if (!isWhatsappGroupUrl(whatsappGroupUrl)) {
      toast.error("Lien de groupe WhatsApp invalide (attendu : https://chat.whatsapp.com/...).");
      return;
    }
    const normalizedWa = normalizeCameroonWhatsapp(contactWhatsapp);
    if (!normalizedWa) {
      toast.error("Numéro WhatsApp de contact invalide (+237 suivi de 9 chiffres).");
      return;
    }

    startTransition(async () => {
      if (!community) {
        const created = await createOnboardingCommunityAction({
          name: trimmedName,
          slug: slugFromName(trimmedName),
          whatsappGroupUrl: whatsappGroupUrl.trim(),
          contactWhatsapp: normalizedWa,
        });
        if (!created.ok) {
          toast.error(created.message);
          return;
        }
        setCommunity({
          id: created.data.id,
          name: created.data.name,
          slug: created.data.slug,
          status: "active",
          commissionBps: 1500,
          whatsappGroupUrl: whatsappGroupUrl.trim(),
          contactWhatsapp: normalizedWa,
          createdAt: new Date().toISOString(),
          suspended: false,
        });
        if (!appDisplayName.trim()) {
          setAppDisplayName(`${created.data.name} VPN`);
        }
      } else {
        const updated = await updateCommunityAction(community.id, {
          name: trimmedName,
          whatsappGroupUrl: whatsappGroupUrl.trim(),
          contactWhatsapp: normalizedWa,
        });
        if (!updated.ok) {
          toast.error(updated.message);
          return;
        }
        setCommunity({
          ...community,
          name: trimmedName,
          whatsappGroupUrl: whatsappGroupUrl.trim(),
          contactWhatsapp: normalizedWa,
        });
      }
      await saveOnboardingStepAction({ step: 3 });
      toast.success("Communauté enregistrée.");
      setStep(3);
    });
  };

  // Sauvegarde Étape 3
  const submitStep3 = () => {
    if (!community) {
      toast.error("Configurez d'abord votre communauté à l'étape 2.");
      setStep(2);
      return;
    }
    const trimmedApp = appDisplayName.trim();
    if (trimmedApp.length < 2) {
      toast.error("Donnez un nom d'au moins 2 caractères à votre application.");
      return;
    }

    startTransition(async () => {
      let currentApp = app;
      const supportUrl =
        community.whatsappGroupUrl || whatsappGroupUrl.trim() || "https://chat.whatsapp.com/bouendji";
      if (!currentApp) {
        const created = await createAppAction({
          name: trimmedApp,
          theme,
          accent: accentHex,
          supportUrl,
        });
        if (!created.ok) {
          toast.error(created.message);
          return;
        }
        const safeTheme: BrandTheme = (BRAND_THEMES as readonly string[]).includes(created.data.theme)
          ? (created.data.theme as BrandTheme)
          : theme;
        currentApp = {
          id: created.data.id,
          slug: slugFromName(created.data.name) ?? "app",
          displayName: created.data.name,
          packageName: created.data.packageName ?? previewPackageName(created.data.name),
          theme: safeTheme,
          accentHex: created.data.accent ?? accentHex,
          logoUrl,
        };
      } else {
        const updated = await updateAppAction(currentApp.id, {
          name: trimmedApp,
          theme,
          accent: accentHex,
          supportUrl,
        });
        if (!updated.ok) {
          toast.error(updated.message);
          return;
        }
        const safeTheme: BrandTheme = (BRAND_THEMES as readonly string[]).includes(updated.data.theme)
          ? (updated.data.theme as BrandTheme)
          : theme;
        currentApp = {
          ...currentApp,
          displayName: updated.data.name,
          theme: safeTheme,
          accentHex: updated.data.accent ?? accentHex,
        };
      }

      if (pendingLogo && currentApp) {
        const uploaded = await uploadAppLogoAction(currentApp.id, {
          mime: pendingLogo.mime,
          data: pendingLogo.dataBase64,
        });
        if (uploaded.ok) {
          currentApp = { ...currentApp, logoUrl: pendingLogo.dataUrl };
          setLogoUrl(pendingLogo.dataUrl);
          setPendingLogo(null);
        } else {
          toast.error(uploaded.message);
          return;
        }
      }

      setApp(currentApp);
      await saveOnboardingStepAction({ step: 4 });
      toast.success("Application configurée.");
      setStep(4);
    });
  };

  // Ajout d'un forfait à l'étape 4
  const handleAddPlan = () => {
    if (!app) {
      toast.error("Créez d'abord votre application à l'étape 3.");
      setStep(3);
      return;
    }
    const code = `${slugFromName(planName)}-${plans.length + 1}`.slice(0, 40);
    const badge = PLAN_PRESETS.find((p) => p.id === selectedPreset)?.badge || null;
    startTransition(async () => {
      const created = await createPlanAction(app.id, {
        code,
        name: planName.trim(),
        description: "",
        family: planFamily,
        quotaGb: String(planQuotaGb),
        priceXaf: String(planPriceXaf),
        durationDays: String(planDurationDays),
        deviceLimit: "2",
        badge: badge ?? "",
        sortOrder: String(plans.length),
        featured: plans.length === 0,
        active: true,
        endpointTier: "free-labs",
        nightPrices: {
          "20-24": "",
          "24-04": "",
          "20-04": planFamily === "limited_night" ? String(planNightPriceXaf) : "",
        },
        nightActive: { "20-24": true, "24-04": true, "20-04": true },
      });
      if (!created.ok) {
        toast.error(created.message);
        return;
      }
      setPlans((prev) => [
        ...prev,
        {
          id: created.data.id,
          appId: app.id,
          code,
          name: planName.trim(),
          description: "",
          family: planFamily,
          quotaBytes: planQuotaGb * BYTES_PER_GB,
          durationDays: planDurationDays,
          priceXaf: planPriceXaf,
          currency: "XAF",
          deviceLimit: 2,
          badge,
          active: true,
          sortOrder: plans.length,
          featured: plans.length === 0,
          endpointTier: "free-labs",
          revision: 1,
        },
      ]);
      toast.success(`Forfait « ${planName.trim()} » ajouté.`);
    });
  };

  const submitStep4 = () => {
    if (plans.length === 0) {
      toast.error("Ajoutez au moins un forfait avant de continuer.");
      return;
    }
    startTransition(async () => {
      await saveOnboardingStepAction({ step: 5 });
      setStep(5);
    });
  };

  const submitStep5 = () => {
    startTransition(async () => {
      await saveOnboardingStepAction({ step: 6 });
      setStep(6);
    });
  };

  // Étape 6 — Demander la compilation de l'APK
  const handleRequestBuild = () => {
    if (!app) {
      toast.error("Votre application n'est pas encore configurée.");
      setStep(3);
      return;
    }
    startTransition(async () => {
      const res = await requestBuildAction(app.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setBuilds((prev) => [
        {
          id: res.data.buildId,
          status: res.data.status,
          versionCode: null,
          versionName: "1.0.0",
          sha256: null,
          apkUrl: null,
          rejectReason: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      await saveOnboardingStepAction({ step: 5 });
      await invalidate(["/v1/admin/apps", "/v1/admin/onboarding", "/v1/admin/communities"]);
      toast.success("Demande d'application envoyée au propriétaire de la plateforme !");
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Stepper
        steps={STEPS}
        currentStep={step}
        onSelectStep={(s) => setStep(s)}
      />

      {/* ÉTAPE 1 : PROFIL */}
      {step === 1 ? (
        <div className="flex flex-col gap-6 rounded-section border border-separator bg-background p-5 sm:p-6">
          <div>
            <h2 className="text-title-3 font-semibold text-foreground">
              1. Bienvenue sur Bouendji
            </h2>
            <p className="mt-1 text-subhead text-muted-foreground">
              En quelques minutes, préparez votre communauté, votre application Android et vos forfaits.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-section border border-separator bg-muted/35 p-4">
              <div className="mb-2 flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
                <Icon name="smartphone" className="size-4" />
              </div>
              <p className="text-subhead font-semibold text-foreground">
                Votre application à votre nom
              </p>
              <p className="mt-1 text-footnote text-muted-foreground">
                Votre logo, vos couleurs et l&apos;invitation directe vers votre groupe WhatsApp.
              </p>
            </div>
            <div className="rounded-section border border-separator bg-muted/35 p-4">
              <div className="mb-2 flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
                <Icon name="tag" className="size-4" />
              </div>
              <p className="text-subhead font-semibold text-foreground">
                Vos forfaits, votre marge
              </p>
              <p className="mt-1 text-footnote text-muted-foreground">
                Vous choisissez vos prix au-dessus du plancher et touchez votre commission sur chaque vente.
              </p>
            </div>
            <div className="rounded-section border border-separator bg-muted/35 p-4">
              <div className="mb-2 flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
                <Icon name="server" className="size-4" />
              </div>
              <p className="text-subhead font-semibold text-foreground">
                Zéro gestion de serveur
              </p>
              <p className="mt-1 text-footnote text-muted-foreground">
                La plateforme gère l&apos;infrastructure VPN jour/nuit et l&apos;encaissement Mobile Money.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="onb-name">Votre nom complet</FieldLabel>
              <Input
                id="onb-name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Ex. Rodrigue N."
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="onb-wa">Votre numéro WhatsApp</FieldLabel>
              <Input
                id="onb-wa"
                value={adminWhatsapp}
                onChange={(e) => setAdminWhatsapp(e.target.value)}
                placeholder="+237690000000"
              />
              <FieldDescription>
                Utilisé pour les notifications importantes et le support de votre communauté.
              </FieldDescription>
            </Field>
          </div>

          <div className="flex justify-end border-t border-separator pt-4">
            <Button type="button" disabled={pending} onClick={submitStep1}>
              {pending ? <Spinner /> : null}
              Continuer vers ma communauté
            </Button>
          </div>
        </div>
      ) : null}

      {/* ÉTAPE 2 : COMMUNAUTÉ */}
      {step === 2 ? (
        <div className="flex flex-col gap-6 rounded-section border border-separator bg-background p-5 sm:p-6">
          <div>
            <h2 className="text-title-3 font-semibold text-foreground">
              2. Votre communauté et votre groupe WhatsApp
            </h2>
            <p className="mt-1 text-subhead text-muted-foreground">
              Après leur premier paiement, vos abonnés verront une fenêtre les invitant à rejoindre votre groupe WhatsApp.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="comm-name">Nom de la communauté</FieldLabel>
              <Input
                id="comm-name"
                value={communityName}
                onChange={(e) => setCommunityName(e.target.value)}
                placeholder="Ex. Campus Douala Connect"
              />
              <FieldDescription>
                Identifiant : <span className="font-mono">{slugFromName(communityName)}</span>
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="comm-wa-contact">Numéro WhatsApp du support</FieldLabel>
              <Input
                id="comm-wa-contact"
                value={contactWhatsapp}
                onChange={(e) => setContactWhatsapp(e.target.value)}
                placeholder="+237690000000"
              />
              <FieldDescription>
                Numéro affiché aux abonnés en cas de besoin d&apos;assistance.
              </FieldDescription>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="comm-wa-group">Lien du groupe WhatsApp</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="comm-wa-group"
                className="flex-1"
                value={whatsappGroupUrl}
                onChange={(e) => setWhatsappGroupUrl(e.target.value)}
                placeholder="https://chat.whatsapp.com/InviteCode123"
              />
              {isWhatsappGroupUrl(whatsappGroupUrl) ? (
                <Button asChild variant="outline" size="sm">
                  <a href={whatsappGroupUrl.trim()} target="_blank" rel="noreferrer">
                    Tester le lien
                  </a>
                </Button>
              ) : null}
            </div>
            <FieldDescription>
              Copiez le lien d&apos;invitation depuis les informations de votre groupe WhatsApp (`https://chat.whatsapp.com/...`).
            </FieldDescription>
          </Field>

          <div className="flex items-center justify-between border-t border-separator pt-4">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              Retour
            </Button>
            <Button type="button" disabled={pending} onClick={submitStep2}>
              {pending ? <Spinner /> : null}
              Enregistrer et personnaliser l&apos;application
            </Button>
          </div>
        </div>
      ) : null}

      {/* ÉTAPE 3 : APPLICATION */}
      {step === 3 ? (
        <div className="grid gap-6 rounded-section border border-separator bg-background p-5 sm:p-6 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-title-3 font-semibold text-foreground">
                3. Identité visuelle de votre application Android
              </h2>
              <p className="mt-1 text-subhead text-muted-foreground">
                L&apos;aperçu du téléphone à droite se met à jour en direct selon vos choix.
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="app-display-name">Nom affiché sous l&apos;icône Android</FieldLabel>
              <Input
                id="app-display-name"
                value={appDisplayName}
                onChange={(e) => setAppDisplayName(e.target.value)}
                placeholder="Ex. Douala Turbo VPN"
              />
              <FieldDescription>
                Paquet Android généré :{" "}
                <span className="font-mono text-foreground">
                  {app?.packageName ?? previewPackageName(appDisplayName || communityName || "app")}
                </span>
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Thème visuel</FieldLabel>
              <ToggleGroup
                type="single"
                value={theme}
                onValueChange={(val) => {
                  if (val && val in BRAND_THEME_META) {
                    const nextTheme = val as BrandTheme;
                    setTheme(nextTheme);
                    setAccentHex(BRAND_THEME_META[nextTheme].color);
                  }
                }}
                className="flex flex-wrap justify-start"
              >
                {BRAND_THEMES.map((t) => (
                  <ToggleGroupItem key={t} value={t}>
                    <span
                      className="size-3 rounded-full"
                      style={{ backgroundColor: BRAND_THEME_META[t].color }}
                    />
                    {BRAND_THEME_META[t].label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>{BRAND_THEME_META[theme].description}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="app-accent">Couleur principale (accent)</FieldLabel>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  aria-label="Sélecteur de couleur"
                  value={/^#[0-9a-fA-F]{6}$/.test(accentHex) ? accentHex : "#ffcc00"}
                  onChange={(e) => setAccentHex(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-md border border-separator bg-background p-1"
                />
                <Input
                  id="app-accent"
                  value={accentHex}
                  onChange={(e) => setAccentHex(e.target.value)}
                  placeholder="#ffcc00"
                  className="max-w-40 font-mono"
                />
              </div>
            </Field>

            <Dropzone
              valueUrl={logoUrl}
              onSelectFile={(payload) => {
                setPendingLogo(payload);
                setLogoUrl(payload.dataUrl);
              }}
            />

            <div className="flex items-center justify-between border-t border-separator pt-4">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                Retour
              </Button>
              <Button type="button" disabled={pending} onClick={submitStep3}>
                {pending ? <Spinner /> : null}
                Enregistrer et configurer mes forfaits
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center rounded-section border border-separator bg-muted/30 p-5">
            <PhonePreview
              displayName={appDisplayName || "Mon VPN"}
              theme={theme}
              accentHex={accentHex}
              logoUrl={logoUrl}
              communityName={communityName || community?.name}
              whatsappGroupUrl={whatsappGroupUrl || community?.whatsappGroupUrl}
              packageName={app?.packageName}
            />
          </div>
        </div>
      ) : null}

      {/* ÉTAPE 4 : FORFAITS */}
      {step === 4 ? (
        <div className="flex flex-col gap-6 rounded-section border border-separator bg-background p-5 sm:p-6">
          <div>
            <h2 className="text-title-3 font-semibold text-foreground">
              4. Vos forfaits et votre gain par vente
            </h2>
            <p className="mt-1 text-subhead text-muted-foreground">
              Partez d&apos;un modèle prêt à l&apos;emploi, ajustez le prix au-dessus du plancher et voyez immédiatement votre gain.
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-section border border-separator bg-muted/25 p-4">
            <Field>
              <FieldLabel>Modèle rapide</FieldLabel>
              <ToggleGroup
                type="single"
                value={selectedPreset}
                onValueChange={(v) => v && applyPreset(v)}
                className="flex flex-wrap justify-start"
              >
                {PLAN_PRESETS.map((p) => (
                  <ToggleGroupItem key={p.id} value={p.id}>
                    {p.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="onb-plan-name">Nom du forfait</FieldLabel>
                <Input
                  id="onb-plan-name"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="onb-plan-quota">Quota (Go)</FieldLabel>
                <Input
                  id="onb-plan-quota"
                  type="number"
                  min={1}
                  value={planQuotaGb}
                  onChange={(e) => setPlanQuotaGb(Math.max(1, Number(e.target.value) || 1))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="onb-plan-price">Prix de vente (FCFA)</FieldLabel>
                <Input
                  id="onb-plan-price"
                  type="number"
                  min={100}
                  step={100}
                  value={planPriceXaf}
                  onChange={(e) => setPlanPriceXaf(Math.max(0, Number(e.target.value) || 0))}
                />
              </Field>
            </div>

            {planFamily === "limited_night" ? (
              <Field>
                <FieldLabel htmlFor="onb-plan-night">Supplément Nuit 20h–04h (FCFA)</FieldLabel>
                <Input
                  id="onb-plan-night"
                  type="number"
                  min={100}
                  step={100}
                  value={planNightPriceXaf}
                  onChange={(e) => setPlanNightPriceXaf(Math.max(0, Number(e.target.value) || 0))}
                  className="max-w-xs"
                />
              </Field>
            ) : null}

            <PriceIndicator
              quotaGb={planQuotaGb}
              priceXaf={planPriceXaf}
              commissionBps={commissionBps}
              pricing={pricing}
              hasNightOption={planFamily === "limited_night"}
              nightWindowHours="20-04"
              nightPriceXaf={planNightPriceXaf}
              onUseFloor={(floor) => setPlanPriceXaf(floor)}
              onUseNightFloor={(nFloor) => setPlanNightPriceXaf(nFloor)}
            />

            <div className="flex justify-end">
              <Button type="button" variant="outline" disabled={pending} onClick={handleAddPlan}>
                <Icon name="plus" className="size-4" />
                Ajouter ce forfait à ma boutique
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-subhead font-semibold text-foreground">
              Forfaits configurés ({plans.length})
            </h3>
            {plans.length === 0 ? (
              <p className="rounded-section border border-dashed border-separator p-4 text-center text-subhead text-muted-foreground">
                Aucun forfait ajouté pour l&apos;instant. Cliquez sur « Ajouter ce forfait à ma boutique » ci-dessus.
              </p>
            ) : (
              <ul className="divide-y divide-separator overflow-hidden rounded-section border border-separator bg-background">
                {plans.map((p) => {
                  const qGb = Math.round((p.quotaBytes ?? 0) / BYTES_PER_GB);
                  const gain = Math.floor((p.priceXaf * commissionBps) / 10_000);
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="text-subhead font-medium text-foreground">{p.name}</p>
                        <p className="text-caption text-muted-foreground">
                          {qGb} Go · {p.durationDays} jours ·{" "}
                          {p.family === "limited_night" ? "Jour + Nuit" : "Jour"}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="text-subhead font-semibold tabular-nums text-foreground">
                          {formatXaf(p.priceXaf)}
                        </p>
                        <p className="text-caption font-medium text-positive tabular-nums">
                          Gain : +{formatXaf(gain)} / vente
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-separator pt-4">
            <Button type="button" variant="outline" onClick={() => setStep(3)}>
              Retour
            </Button>
            <Button type="button" disabled={pending || plans.length === 0} onClick={submitStep4}>
              Continuer vers l&apos;équipe
            </Button>
          </div>
        </div>
      ) : null}

      {/* ÉTAPE 5 : ÉQUIPE (OPTIONNEL) */}
      {step === 5 ? (
        <div className="flex flex-col gap-6 rounded-section border border-separator bg-background p-5 sm:p-6">
          <div>
            <h2 className="text-title-3 font-semibold text-foreground">
              5. Votre équipe (optionnel)
            </h2>
            <p className="mt-1 text-subhead text-muted-foreground">
              Vous pouvez travailler seul ou déléguer le support client et la comptabilité depuis l&apos;onglet Communauté → Équipe à tout moment.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-section border border-separator bg-muted/30 p-4">
              <p className="text-subhead font-semibold text-foreground">Rôle Support</p>
              <p className="mt-1 text-footnote text-muted-foreground">
                Consulte les abonnés, vérifie l&apos;état des commandes, révoque un téléphone perdu et génère des fichiers de secours `.bvpn`. Ne voit pas votre solde financier.
              </p>
            </div>
            <div className="rounded-section border border-separator bg-muted/30 p-4">
              <p className="text-subhead font-semibold text-foreground">Rôle Finance</p>
              <p className="mt-1 text-footnote text-muted-foreground">
                Consulte les commandes, les commissions et prépare ou suit les versements. Ne modifie ni vos forfaits ni votre application.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-separator pt-4">
            <Button type="button" variant="outline" onClick={() => setStep(4)}>
              Retour
            </Button>
            <Button type="button" disabled={pending} onClick={submitStep5}>
              Continuer vers le récapitulatif
            </Button>
          </div>
        </div>
      ) : null}

      {/* ÉTAPE 6 : RÉCAPITULATIF & DEMANDE DE BUILD */}
      {step === 6 ? (
        <div className="grid gap-6 rounded-section border border-separator bg-background p-5 sm:p-6 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-title-3 font-semibold text-foreground">
                6. Récapitulatif avant compilation de votre APK
              </h2>
              <p className="mt-1 text-subhead text-muted-foreground">
                Vérifiez chaque bloc. Une fois votre demande envoyée, le propriétaire valide l&apos;identité et lance la compilation Android.
              </p>
            </div>

            <div className="divide-y divide-separator rounded-section border border-separator bg-muted/20">
              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-subhead font-semibold text-foreground">
                    Communauté : {community?.name || communityName || "Non renseignée"}
                  </p>
                  <p className="text-footnote text-muted-foreground">
                    Groupe : {community?.whatsappGroupUrl || whatsappGroupUrl || "—"} · Contact :{" "}
                    {community?.contactWhatsapp || contactWhatsapp || "—"}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setStep(2)}>
                  Modifier
                </Button>
              </div>

              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-subhead font-semibold text-foreground">
                    Application : {app?.displayName || appDisplayName || "Non renseignée"}
                  </p>
                  <p className="text-footnote text-muted-foreground">
                    Paquet : <span className="font-mono">{app?.packageName ?? previewPackageName(appDisplayName)}</span>{" "}
                    · Thème : {BRAND_THEME_META[theme].label}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setStep(3)}>
                  Modifier
                </Button>
              </div>

              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-subhead font-semibold text-foreground">
                    Forfaits actifs : {plans.length} offre{plans.length > 1 ? "s" : ""}
                  </p>
                  <p className="text-footnote text-muted-foreground">
                    {plans.map((p) => `${p.name} (${formatXaf(p.priceXaf)})`).join(" · ") || "Aucun forfait"}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setStep(4)}>
                  Modifier
                </Button>
              </div>
            </div>

            {latestBuild ? (
              <div className="flex items-center justify-between gap-4 rounded-section border border-separator bg-muted/40 p-4">
                <div>
                  <p className="text-subhead font-semibold text-foreground">
                    Statut de votre application
                  </p>
                  <p className="text-footnote text-muted-foreground">
                    Version {latestBuild.versionName} (#{latestBuild.versionCode})
                  </p>
                </div>
                <StatusBadge status={latestBuild.status} />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-separator pt-4">
              <Button type="button" variant="outline" onClick={() => setStep(5)}>
                Retour
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" disabled={pending || !app || plans.length === 0}>
                    {pending ? <Spinner /> : <Icon name="download" className="size-4" />}
                    Demander mon application Android
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Envoyer la demande de compilation pour « {app?.displayName || appDisplayName} » ?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Le propriétaire de la plateforme vérifiera votre logo, votre nom d&apos;application et vos forfaits, puis lancera la génération de votre fichier APK signé.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Vérifier encore</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRequestBuild}>
                      Confirmer la demande
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div className="flex items-center justify-center rounded-section border border-separator bg-muted/30 p-5">
            <PhonePreview
              displayName={app?.displayName || appDisplayName || "Mon VPN"}
              theme={theme}
              accentHex={accentHex}
              logoUrl={logoUrl}
              communityName={community?.name || communityName}
              whatsappGroupUrl={community?.whatsappGroupUrl || whatsappGroupUrl}
              packageName={app?.packageName}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
