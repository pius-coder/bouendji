/**
 * Catalogue public d'une marque.
 *
 * L'APK connaît son `appId` au build (`BrandTokens.appId`) : c'est la seule clé
 * nécessaire pour afficher les offres de sa marque, avec les prix fixés par son
 * administrateur (white label, D35). Aucune donnée d'utilisateur, et jamais le
 * prix d'une autre marque : la requête est filtrée par `app_id` en SQL.
 *
 * `revision` est la même valeur que celle vérifiée par `POST /v1/orders` ; si
 * l'administrateur change un prix entre l'affichage et le paiement, la commande
 * est refusée en `409 PLAN_CHANGED` au lieu d'être facturée à l'ancien prix.
 */
import type { FastifyInstance } from "fastify";
import type { Database, Row } from "../db.js";
import { fail } from "../lib/errors.js";
import { planRevision } from "../services/payments.js";
import { activeNightOptions, planTermsDto, planTermsSql } from "../services/planTerms.js";
import {
  assertChoiceAllowed,
  customChoiceSchema,
  customPriceXaf,
  customTermsFromJson,
  LONG_DAYS,
  ROUND_XAF,
  SHORT_DAYS,
} from "../services/customOffer.js";
import { NIGHT_WINDOWS } from "../services/pricing.js";

/**
 * Contacts d'exploitation d'une marque.
 *
 * Seul ce que l'administrateur a saisi est exposé : le numéro WhatsApp de la
 * communauté (`communities.contact_whatsapp`) et, à défaut, l'e-mail de la
 * marque (`apps.support_email`). Le `support_url` injecté au build n'est
 * jamais lu : il contient le `mailto:` de la plateforme, qui s'affichait à la
 * place du contact de la communauté.
 */
function supportDto(row: Row) {
  const digits = String(row.contact_whatsapp ?? "").replace(/\D/g, "");
  const local = digits.startsWith("237") ? digits.slice(3) : digits;
  // Mobile camerounais : 9 chiffres commençant par 6 ; fixe : 2.
  const whatsapp = /^[62]\d{8}$/.test(local) ? `237${local}` : null;
  const email = String(row.support_email ?? "").trim();
  const groupUrl = String(row.whatsapp_group_url ?? "").trim();
  return {
    source: whatsapp ? "community" : email ? "app" : "none",
    whatsapp,
    whatsappUrl: whatsapp ? `https://wa.me/${whatsapp}` : null,
    call: whatsapp ? `tel:+${whatsapp}` : null,
    email: email || null,
    groupUrl: groupUrl || null,
    hours: null,
    responseHint: null,
  };
}

export function registerCatalogRoutes(app: FastifyInstance, db: Database): void {
  app.get<{ Params: { appId: string } }>("/v1/apps/:appId/plans", async (req) => {
    const appRow = await db.one<Row>(
      `SELECT a.id, a.name, a.support_email, a.privacy_url, a.terms_url, a.min_version_code,
              c.contact_whatsapp, c.whatsapp_group_url,
              b.version_code AS latest_version_code,
              b.version_name AS latest_version_name,
              COALESCE(b.apk_url, b.artifact_url) AS update_url,
              b.sha256 AS update_sha256,
              n.id AS announcement_id, n.title AS announcement_title,
              n.body AS announcement_body, n.level AS announcement_level,
              n.published_at AS announcement_published_at
         FROM apps a
         JOIN communities c ON c.id = a.community_id
         LEFT JOIN LATERAL (
           SELECT version_code, version_name, apk_url, artifact_url, sha256
             FROM builds
            WHERE app_id = a.id AND status = 'succeeded'
            ORDER BY version_code DESC, created_at DESC
            LIMIT 1
         ) b ON true
         LEFT JOIN LATERAL (
           SELECT id, title, body, level, published_at
             FROM announcements
            WHERE active = true AND (app_id = a.id OR app_id IS NULL)
            ORDER BY (app_id = a.id) DESC, published_at DESC
            LIMIT 1
         ) n ON true
        WHERE a.id = $1`,
      [req.params.appId],
    );
    if (!appRow) throw fail.notFound("Application introuvable.");

    const rows = await db.query<Row>(
      `SELECT p.id, p.app_id, p.code, p.name, p.description, p.price_xaf, p.duration_days, p.device_limit,
              p.badge, p.featured, p.sort_order, p.active, p.endpoint_tier,
              ${planTermsSql("p")}
         FROM plans p
        WHERE p.app_id = $1 AND p.active = true
        ORDER BY p.sort_order ASC, p.price_xaf ASC`,
      [req.params.appId],
    );

    return {
      app: {
        id: appRow.id as string,
        name: appRow.name as string,
        minVersionCode: Number(appRow.min_version_code ?? 0),
        /** Dernier build signé publié : version et APK, pour la mise à jour in-app. */
        latestVersionCode: Number(appRow.latest_version_code ?? 0),
        latestVersionName: (appRow.latest_version_name as string | null) ?? null,
        updateUrl: (appRow.update_url as string | null) ?? null,
        updateSha256: (appRow.update_sha256 as string | null) ?? null,
      },
      /** Message d'exploitation (table `announcements`), affiché au démarrage. */
      announcement: appRow.announcement_id
        ? {
            id: appRow.announcement_id as string,
            title: appRow.announcement_title as string,
            body: appRow.announcement_body as string,
            level: (appRow.announcement_level as string | null) ?? "info",
            publishedAt: String(appRow.announcement_published_at ?? ""),
          }
        : null,
      /**
       * Contacts d'exploitation, saisis par l'administrateur dans le
       * dashboard. `apps.support_url` n'est volontairement pas utilisé : il
       * contient le `mailto:` de la plateforme injecté au build, qui
       * s'affichait à la place du contact de la communauté.
       */
      support: supportDto(appRow),
      legal: {
        privacyUrl: (appRow.privacy_url as string | null) ?? null,
        termsUrl: (appRow.terms_url as string | null) ?? null,
      },
      items: rows.map((row) => {
        const terms = planTermsDto(row);
        return {
          id: row.id as string,
          code: row.code as string,
          name: row.name as string,
          description: row.description as string,
          priceXaf: Number(row.price_xaf),
          durationDays: Number(row.duration_days),
          deviceLimit: Number(row.device_limit),
          badge: (row.badge as string | null) ?? null,
          featured: row.featured === true,
          sortOrder: Number(row.sort_order),
          /** D45 : `free-labs` = illimité (Cloud Run), `paid-gcp` = limité (3x-ui, quota). */
          endpointTier: row.endpoint_tier === "paid-gcp" ? "paid-gcp" : "free-labs",
          /** D115/D132 : `limited`, `limited_night`, `unlimited` (durée seule, prix propre) ou `custom`. */
          family: terms.family,
          /** Octets. `null` : offre sans quota (ancien comportement). */
          quotaBytes: terms.quotaBytes,
          /** Plages de nuit proposées (actives seulement) et leur prix, ajouté au prix du forfait. */
          nightOptions: terms.nightOptions
            .filter((option) => option.active)
            .map((option) => ({ window: option.window, priceXaf: option.priceXaf })),
          revision: planRevision({
            code: row.code as string,
            price_xaf: Number(row.price_xaf),
            duration_days: Number(row.duration_days),
            device_limit: Number(row.device_limit),
            active: row.active === true,
            family: terms.family,
            quota_bytes: terms.quotaBytes,
            endpoint_tier: row.endpoint_tier as string | null,
            night_options: row.night_options,
            custom_terms: row.custom_terms,
          }),
          /**
           * D127 : offre sur mesure. L'app place deux curseurs dans ces bornes et
           * affiche une estimation avec la même formule ; le montant facturé est
           * celui de `/quote` et de la commande, calculé par le serveur.
           */
          custom: customDto(row.custom_terms),
        };
      }),
    };
  });

  /**
   * Devis de l'offre sur mesure : même calcul que `POST /v1/orders`, sans rien
   * écrire. Public comme le catalogue (le prix n'est pas une donnée personnelle).
   */
  app.get<{ Params: { appId: string; planId: string }; Querystring: Record<string, string | undefined> }>(
    "/v1/apps/:appId/plans/:planId/quote",
    async (req) => {
      const row = await db.one<Row>(
        `SELECT p.id, p.app_id, p.active, p.family, ${planTermsSql("p")}
           FROM plans p WHERE p.id = $1 AND p.app_id = $2`,
        [req.params.planId, req.params.appId],
      );
      if (!row || row.active !== true || row.family !== "custom") throw fail.notFound("Offre introuvable.");
      const terms = customTermsFromJson(row.custom_terms);
      if (!terms) throw fail.notFound("Offre introuvable.");

      const parsed = customChoiceSchema.safeParse({ gb: Number(req.query.gb), days: Number(req.query.days) });
      if (!parsed.success) throw fail.validation({ gb: "Entier requis.", days: "Entier requis." });
      assertChoiceAllowed(terms, parsed.data);

      const rawWindow = req.query.nightWindow;
      const window = rawWindow ? NIGHT_WINDOWS.find((w) => w === rawWindow) : undefined;
      if (rawWindow && !window) throw fail.validation({ nightWindow: "Plage inconnue." });
      const option = window ? activeNightOptions(row.night_options).find((o) => o.window === window) : undefined;
      if (window && !option) throw fail.validation({ nightWindow: "Plage de nuit non proposée pour ce forfait." });

      const baseXaf = customPriceXaf(terms, parsed.data);
      const nightXaf = option?.priceXaf ?? 0;
      return {
        gb: parsed.data.gb,
        days: parsed.data.days,
        nightWindow: window ?? null,
        baseXaf,
        nightXaf,
        totalXaf: baseXaf + nightXaf,
        currency: "XAF",
      };
    },
  );
}

function customDto(raw: unknown) {
  const terms = customTermsFromJson(raw);
  if (!terms) return null;
  return {
    ...terms,
    /** Rappel de la formule pour l'estimation affichée par l'app. */
    formula: { shortDays: SHORT_DAYS, longDays: LONG_DAYS, roundXaf: ROUND_XAF },
  };
}
