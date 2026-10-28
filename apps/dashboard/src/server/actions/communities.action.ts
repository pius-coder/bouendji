"use server";

import { z } from "zod";
import { id } from "@/server/api/schema-kit";
import { getServices } from "@/server/services";
import { communityFormSchema } from "@/server/services/communities/communities.schema";
import { isWhatsappGroupUrl, normalizeCameroonWhatsapp } from "@/server/services/onboarding/onboarding.schema";
import { runAction, type ActionResult } from "./action-result";

/**
 * Le formulaire saisit un pourcentage (0-30) ; l'API veut des points de base.
 * L'entrée vient du client : on rejoue le schéma du formulaire, puis le schéma
 * du service valide encore le corps avant tout envoi.
 */
export async function createCommunityAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const values = communityFormSchema.parse(input);
    const percent = values.commissionPercent.replace(",", ".");
    const created = await getServices().communities.createCommunity({
      name: values.name,
      slug: values.slug,
      ...(percent ? { commissionBps: Math.round(Number(percent) * 100) } : {}),
    });
    return { id: created.id };
  });
}

const editSchema = z.object({
  name: z.string().trim().min(2, "2 caractères min.").max(120),
  commissionPercent: communityFormSchema.shape.commissionPercent.optional(),
  whatsappGroupUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || isWhatsappGroupUrl(v), "Lien de groupe attendu : https://chat.whatsapp.com/...")
    .optional(),
  contactWhatsapp: z
    .string()
    .trim()
    .refine((v) => v === "" || normalizeCameroonWhatsapp(v) !== null, "9 chiffres attendus, +237 facultatif.")
    .optional(),
});

/** Modifier nom, commission (owner) et WhatsApp (owner / community_admin). */
export async function updateCommunityAction(communityId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const values = editSchema.parse(input);
    const percent = values.commissionPercent?.replace(",", ".") ?? "";
    const updated = await getServices().communities.updateCommunity({
      communityId: id.parse(communityId),
      name: values.name,
      ...(percent ? { commissionBps: Math.round(Number(percent) * 100) } : {}),
      ...(values.whatsappGroupUrl !== undefined
        ? { whatsappGroupUrl: values.whatsappGroupUrl === "" ? null : values.whatsappGroupUrl }
        : {}),
      ...(values.contactWhatsapp !== undefined
        ? { contactWhatsapp: values.contactWhatsapp === "" ? null : values.contactWhatsapp }
        : {}),
    });
    return { id: updated.id };
  });
}

/** Suspendre ou reprendre : l'app de la communauté cesse ou reprend de servir. */
export async function setCommunityStatusAction(communityId: string, status: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const next = z.enum(["active", "suspended"]).parse(status);
    const updated = await getServices().communities.updateCommunity({ communityId: id.parse(communityId), status: next });
    return { id: updated.id };
  });
}
