"use client";

import { Icon } from "@/components/common/icon";
import { useState } from "react";
import { ActionMenu } from "@/components/common/action-menu";
import { AppSheet } from "@/components/common/app-sheet";
import { Button } from "@/components/common/button";
import { AreaChart, BarList, MeterRow, Sparkline } from "@/components/common/charts";
import { ConfirmAlert } from "@/components/common/confirm-alert";
import { GroupedSection } from "@/components/common/grouped-list";
import { ListRow } from "@/components/common/list-row";
import { PickerSheet } from "@/components/common/picker-sheet";
import { SearchField } from "@/components/common/search-field";
import { PeriodSwitch, SegmentedControl } from "@/components/common/segmented-control";
import { SelectField, SelectRow } from "@/components/common/select-field";
import { SwitchRow } from "@/components/common/switch-row";
import { SecureField, TextField, TextFieldRow } from "@/components/common/text-field";
import { notify } from "@/components/common/toast";
import { OrDivider, SocialButton } from "@/components/common/auth-layout";

const COUNTRIES = [
  { value: "cm", label: "Cameroun" },
  { value: "ci", label: "Côte d’Ivoire" },
  { value: "sn", label: "Sénégal" },
  { value: "ga", label: "Gabon" },
  { value: "td", label: "Tchad" },
  { value: "cf", label: "Centrafrique" },
];

const DAYS = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 8, 25 + i)).toISOString().slice(0, 10));
const WAVE = DAYS.map((x, i) => ({
  x,
  values: { sales: 20_000 + ((i * 7919) % 13) * 4_000 + i * 900, orders: 4 + ((i * 31) % 7), subscribers: 1 + ((i * 17) % 5) },
}));

/** Démonstration interactive des contrôles du kit (aucun appel réseau). */
export function KitControls() {
  const [segment, setSegment] = useState<"actifs" | "expires" | "tous">("actifs");
  const [period, setPeriod] = useState<"7j" | "30j" | "90j">("30j");
  const [notifications, setNotifications] = useState(true);
  const [role, setRole] = useState<"community_admin" | "support" | "finance">("support");
  const [country, setCountry] = useState("cm");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const emailError = submitted && !/^\S+@\S+\.\S+$/.test(email) ? "Saisissez une adresse au format nom@exemple.com." : undefined;

  return (
    <div className="flex flex-col gap-8">
      <GroupedSection title="Champs" titleId="kit-fields" inset={false} footer="Libellé toujours visible, placeholder = exemple de format, erreur qui dit comment corriger.">
        <form
          noValidate
          className="flex flex-col gap-4 rounded-section bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
        >
          <SocialButton logo={<Icon name="mail" />} onClick={() => notify.success("Démonstration : aucun fournisseur appelé")}>
            Continuer avec un lien e-mail
          </SocialButton>
          <OrDivider />
          <TextField required label="E-mail" type="email" inputMode="email" autoComplete="email" placeholder="nom@exemple.com" leading={<Icon name="mail" />} value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} />
          <SecureField required label="Mot de passe" leading={<Icon name="lock" />} hint="12 caractères au moins." />
          <SelectField label="Rôle" value={role} onValueChange={setRole} options={[{ value: "community_admin", label: "Administrateur" }, { value: "support", label: "Support" }, { value: "finance", label: "Finance" }]} />
          <Button variant="prominent" size="lg" type="submit">
            Valider
          </Button>
        </form>
      </GroupedSection>

      <GroupedSection title="Formulaire en liste groupée" titleId="kit-list-form">
        <TextFieldRow label="Nom" placeholder="Communauté Douala" />
        <TextFieldRow label="Commission" placeholder="2,5 %" inputMode="decimal" hint="Entre 0 et 30 %." />
        <SelectRow title="Pays" value={country} onValueChange={setCountry} options={COUNTRIES.slice(0, 4)} />
        <SwitchRow title="Envoyer les alertes" description="Un message à chaque nœud hors service." checked={notifications} onCheckedChange={setNotifications} />
        <ListRow title="Choisir dans une longue liste" value={COUNTRIES.find((c) => c.value === country)?.label} onClick={() => setPickerOpen(true)} />
      </GroupedSection>

      <GroupedSection title="Segmented control, période, recherche" titleId="kit-segments" inset={false}>
        <div className="flex flex-col gap-3 rounded-section bg-card p-4">
          <SegmentedControl label="Appareils" value={segment} onValueChange={setSegment} options={[{ value: "actifs", label: "Actifs" }, { value: "expires", label: "Expirés" }, { value: "tous", label: "Tous" }]} />
          <PeriodSwitch value={period} onValueChange={setPeriod} options={[{ value: "7j", label: "7 j" }, { value: "30j", label: "30 j" }, { value: "90j", label: "90 j" }]} />
          <SearchField label="Rechercher un abonné" placeholder="Nom ou e-mail" value={query} onSearch={setQuery} />
          <p className="text-footnote text-muted-foreground">Recherche envoyée : « {query} »</p>
        </div>
      </GroupedSection>

      <GroupedSection title="Feuille, alerte, menu, toast" titleId="kit-overlays" inset={false}>
        <div className="flex flex-wrap items-center gap-2 rounded-section bg-card p-4">
          <Button variant="prominent" onClick={() => setSheetOpen(true)}>
            Ouvrir une feuille
          </Button>
          <Button variant="destructive-plain" onClick={() => setAlertOpen(true)}>
            Supprimer…
          </Button>
          <Button variant="tinted" onClick={() => notify.success("Modifications enregistrées")}>
            Toast
          </Button>
          <ActionMenu
            actions={[
              { label: "Renommer", onSelect: () => notify.success("Renommer — démonstration") },
              { label: "Dupliquer", onSelect: () => notify.success("Dupliquer — démonstration") },
              { label: "Supprimer", icon: <Icon name="trash" />, destructive: true, onSelect: () => setAlertOpen(true) },
            ]}
          />
        </div>
      </GroupedSection>

      <GroupedSection title="Graphiques (orya, version HIG)" titleId="kit-charts" inset={false}>
        <div className="flex flex-col gap-6 rounded-section bg-card p-4">
          <AreaChart
            label="Ventes et abonnés, 30 jours (démonstration)"
            data={WAVE}
            format="xaf"
            series={[
              { key: "sales", label: "Ventes", color: "var(--chart-1)", heavy: true },
              { key: "orders", label: "Commandes", color: "var(--chart-2)" },
            ]}
          />
          <AreaChart label="Ventes, axes (démonstration)" data={WAVE} format="xaf" axes height={200} series={[{ key: "sales", label: "Ventes", color: "var(--chart-1)", heavy: true }]} />
          <div className="grid gap-6 md:grid-cols-2">
            <BarList label="Répartition" items={COUNTRIES.map((c, i) => ({ id: c.value, label: c.label, value: 90 - i * 13 }))} />
            <div className="flex flex-col gap-4">
              <MeterRow label="Mobile Money" valueLabel="42 payées / 51 · 82 %" ratio={0.82} />
              <MeterRow label="Carte" valueLabel="7 payées / 19 · 37 %" ratio={0.37} tone="danger" />
              <div className="flex items-center gap-3 text-subhead">
                Tendance 7 jours <Sparkline values={[3, 5, 4, 8, 6, 9, 11]} label="Commandes des 7 derniers jours" />
              </div>
            </div>
          </div>
        </div>
      </GroupedSection>

      <PickerSheet open={pickerOpen} onOpenChange={setPickerOpen} title="Pays" options={COUNTRIES} value={country} onValueChange={setCountry} searchLabel="Rechercher un pays" />
      <AppSheet open={sheetOpen} onOpenChange={setSheetOpen} title="Nouveau forfait" dirty action={{ label: "Créer", onClick: () => setSheetOpen(false) }}>
        <div className="flex flex-col gap-4">
          <TextField label="Nom du forfait" placeholder="Mensuel" />
          <TextField label="Prix (XAF)" inputMode="numeric" placeholder="2 000" />
        </div>
      </AppSheet>
      <ConfirmAlert
        open={alertOpen}
        onOpenChange={setAlertOpen}
        title="Supprimer ce forfait ?"
        message="Les abonnés actuels gardent leur accès jusqu’à expiration."
        confirmLabel="Supprimer"
        reason={{ label: "Motif (journal)", minLength: 5, placeholder: "Forfait remplacé" }}
        onConfirm={() => {
          notify.success("Supprimé — démonstration");
          return true;
        }}
      />
    </div>
  );
}
