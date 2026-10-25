"use client";

import { toast } from "sonner";

/**
 * Retours non bloquants (HIG feedback). Pas de toast pour l'attendu ; un toast pour
 * l'important réussi. Une erreur ou un toast qui porte une action RESTE jusqu'à
 * fermeture (better-accessibility). Annoncé poliment par Sonner (`role="status"`).
 */
export const notify = {
  success(message: string, description?: string) {
    toast.success(message, { description });
  },
  error(message: string, description?: string) {
    toast.error(message, { description, duration: Number.POSITIVE_INFINITY, closeButton: true });
  },
  action(message: string, action: { label: string; onClick: () => void }) {
    toast(message, { action, duration: Number.POSITIVE_INFINITY, closeButton: true });
  },
};
