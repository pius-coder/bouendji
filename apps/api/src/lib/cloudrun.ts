/**
 * Cloud Run → pays. Le nom d'un service Cloud Run porte sa région :
 * `svc-123.europe-west4.run.app`. L'application Android affiche un drapeau à
 * partir d'un code ISO à deux lettres (`Flags.kt`) : on stocke donc le pays, pas
 * la région GCP brute.
 *
 * Table volontairement explicite : une région inconnue ne doit pas produire un
 * pays inventé. Elle retombe alors sur `auto`.
 */
export interface CloudRunLocation {
  /** Région GCP, ex. `europe-west4`. */
  region: string;
  /** Code ISO 3166-1 alpha-2, ex. `nl`. */
  country: string;
  /** Libellé lisible pour les journaux et l'audit. */
  city: string;
}

const LOCATIONS: Record<string, { country: string; city: string }> = {
  // Amérique du Nord
  "us-central1": { country: "us", city: "Iowa" },
  "us-east1": { country: "us", city: "Caroline du Sud" },
  "us-east4": { country: "us", city: "Virginie du Nord" },
  "us-east5": { country: "us", city: "Columbus" },
  "us-south1": { country: "us", city: "Dallas" },
  "us-west1": { country: "us", city: "Oregon" },
  "us-west2": { country: "us", city: "Los Angeles" },
  "us-west3": { country: "us", city: "Salt Lake City" },
  "us-west4": { country: "us", city: "Las Vegas" },
  "northamerica-northeast1": { country: "ca", city: "Montréal" },
  "northamerica-northeast2": { country: "ca", city: "Toronto" },
  // Europe
  "europe-central2": { country: "pl", city: "Varsovie" },
  "europe-north1": { country: "fi", city: "Hamina" },
  "europe-north2": { country: "se", city: "Stockholm" },
  "europe-southwest1": { country: "es", city: "Madrid" },
  "europe-west1": { country: "be", city: "Belgique" },
  "europe-west2": { country: "gb", city: "Londres" },
  "europe-west3": { country: "de", city: "Francfort" },
  "europe-west4": { country: "nl", city: "Pays-Bas" },
  "europe-west6": { country: "ch", city: "Zurich" },
  "europe-west8": { country: "it", city: "Milan" },
  "europe-west9": { country: "fr", city: "Paris" },
  "europe-west10": { country: "de", city: "Berlin" },
  "europe-west12": { country: "it", city: "Turin" },
  // Asie / Pacifique
  "asia-east1": { country: "tw", city: "Taïwan" },
  "asia-east2": { country: "hk", city: "Hong Kong" },
  "asia-northeast1": { country: "jp", city: "Tokyo" },
  "asia-northeast2": { country: "jp", city: "Osaka" },
  "asia-northeast3": { country: "kr", city: "Séoul" },
  "asia-south1": { country: "in", city: "Mumbai" },
  "asia-south2": { country: "in", city: "Delhi" },
  "asia-southeast1": { country: "sg", city: "Singapour" },
  "asia-southeast2": { country: "id", city: "Jakarta" },
  "australia-southeast1": { country: "au", city: "Sydney" },
  "australia-southeast2": { country: "au", city: "Melbourne" },
  // Amérique du Sud, Moyen-Orient, Afrique
  "southamerica-east1": { country: "br", city: "São Paulo" },
  "southamerica-west1": { country: "cl", city: "Santiago" },
  "me-west1": { country: "il", city: "Tel Aviv" },
  "me-central1": { country: "qa", city: "Doha" },
  "me-central2": { country: "sa", city: "Dammam" },
  "africa-south1": { country: "za", city: "Johannesburg" },
};

/** `svc-123.europe-west4.run.app` → `europe-west4`. */
export function cloudRunRegionOf(host: string | null | undefined): string | null {
  if (!host) return null;
  const match = /(?:^|\.)([a-z]+-[a-z]+\d)\.run\.app$/i.exec(host.trim().toLowerCase());
  return match ? match[1]!.toLowerCase() : null;
}

/** Région GCP → pays affichable. `null` si la région n'est pas dans la table. */
export function cloudRunLocationOf(host: string | null | undefined): CloudRunLocation | null {
  const region = cloudRunRegionOf(host);
  if (!region) return null;
  const known = LOCATIONS[region];
  if (!known) return null;
  return { region, ...known };
}
