import { PASSWORD_MIN_LENGTH } from "@/server/services/admin-auth/admin-auth.schema";

/*
 * Règles du changement de mot de passe, côté affichage : jauge et erreurs en
 * direct. L'API reste l'autorité (même règles dans `passwordChangeBody`).
 */

export const PASSWORD_FIELDS = ["currentPassword", "newPassword", "confirmPassword"] as const;
export type PasswordField = (typeof PASSWORD_FIELDS)[number];

export interface PasswordStrength {
  /** 0 = trop court ; 1 à 4 = du plus faible au plus solide. */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

const STRENGTH_LABELS = ["Trop court", "Faible", "Correct", "Bon", "Solide"] as const;

/**
 * Jauge simple : sous le minimum, 0. Au-delà, une longueur plus grande et plus de
 * types de caractères (minuscules, majuscules, chiffres, symboles) relèvent le score.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < PASSWORD_MIN_LENGTH) return { score: 0, label: STRENGTH_LABELS[0] };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  let score = 1;
  if (password.length >= 16) score += 1;
  if (classes >= 3) score += 1;
  if (classes === 4 && password.length >= 20) score += 1;
  const bounded = Math.min(score, 4) as 1 | 2 | 3 | 4;
  return { score: bounded, label: STRENGTH_LABELS[bounded] };
}

export type PasswordErrors = Partial<Record<PasswordField, string>>;

/** Erreurs de saisie, champ par champ. Un objet vide = saisie cohérente. */
export function passwordErrors(values: { currentPassword: string; newPassword: string; confirmPassword: string }): PasswordErrors {
  const errors: PasswordErrors = {};
  if (!values.currentPassword) errors.currentPassword = "Mot de passe actuel requis.";
  if (values.newPassword.length > 0 && values.newPassword.length < PASSWORD_MIN_LENGTH) {
    errors.newPassword = `Au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  } else if (values.newPassword && values.newPassword === values.currentPassword) {
    errors.newPassword = "Le nouveau mot de passe doit être différent de l'actuel.";
  }
  if (values.confirmPassword && values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = "Les deux mots de passe ne correspondent pas.";
  }
  return errors;
}

/** Vrai quand le formulaire peut partir : tout rempli, minimum atteint, confirmation identique. */
export function canSubmitPassword(values: { currentPassword: string; newPassword: string; confirmPassword: string }): boolean {
  return (
    values.currentPassword.length > 0 &&
    values.newPassword.length >= PASSWORD_MIN_LENGTH &&
    values.confirmPassword === values.newPassword &&
    Object.keys(passwordErrors(values)).length === 0
  );
}
