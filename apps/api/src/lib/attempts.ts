/**
 * Compteur de tentatives à fenêtre fixe, **en mémoire du processus**.
 *
 * Pourquoi pas seulement `@fastify/rate-limit` : le plugin compte par clé (ici
 * l'IP), or le login doit aussi compter **par email**. Une attaque distribuée
 * sur une adresse unique passe sous le plafond par IP ; une attaque sur mille
 * emails passe sous le plafond par email. Les deux compteurs sont donc
 * nécessaires, et ils vivent à deux endroits différents.
 *
 * Limite assumée : ce compteur est local à l'instance. Sur N instances, le
 * plafond effectif par email est N × `max` sur la fenêtre, et un redémarrage
 * remet tous les compteurs à zéro. Ce n'est pas une garantie de sécurité
 * globale, c'est un ralentisseur — le verrou réel reste le mot de passe scrypt
 * et l'appareil enrôlé (D4). Pour un compteur partagé, il faudrait un store
 * (Redis) que ce lot n'installe pas.
 */
import { fail, type ApiFailure } from "./errors.js";

export interface AttemptResult {
  allowed: boolean;
  /** Secondes avant la fin de la fenêtre. 0 quand la tentative passe. */
  retryAfterSeconds: number;
  remaining: number;
}

/**
 * Réponse 429 de `@fastify/rate-limit`, dans l'enveloppe du projet.
 *
 * Le plugin **lève** le retour de ce constructeur ; il faut donc une `Error`
 * (`ApiFailure`) et pas un objet nu : un objet nu sans `statusCode` serait
 * traduit en 500 par Fastify, et le 429 deviendrait une panne serveur. Passer
 * par `ApiFailure` fait rendre la réponse par le gestionnaire d'erreurs
 * d'app.ts — même forme que partout ailleurs.
 */
export function rateLimitError(
  _req: { id: string },
  context: { after: string; ttl: number; max: number },
): ApiFailure {
  return fail.rateLimited(Math.max(1, Math.ceil(context.ttl / 1000)), "Trop de requêtes. Réessayez plus tard.");
}

interface Entry {
  count: number;
  resetAt: number;
}

export class AttemptCounter {
  private readonly hits = new Map<string, Entry>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    /** Plafond de clés retenues : sans lui, un attaquant remplit la mémoire. */
    private readonly capacity = 10_000,
  ) {}

  /**
   * Consomme une tentative. La tentative qui atteint `max` passe encore : c'est
   * la suivante qui est refusée, donc `max` succès sont possibles par fenêtre.
   */
  hit(key: string, now = Date.now()): AttemptResult {
    const current = this.hits.get(key);

    if (!current || current.resetAt <= now) {
      if (this.hits.size >= this.capacity) this.evict(now);
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: Math.max(0, this.max - 1), retryAfterSeconds: 0 };
    }

    if (current.count >= this.max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      };
    }

    current.count += 1;
    return { allowed: true, remaining: Math.max(0, this.max - current.count), retryAfterSeconds: 0 };
  }

  /** Efface le compteur d'une clé (connexion réussie, par exemple). */
  reset(key: string): void {
    this.hits.delete(key);
  }

  clear(): void {
    this.hits.clear();
  }

  get size(): number {
    return this.hits.size;
  }

  private evict(now: number): void {
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key);
    }
    // Toujours plein : on sacrifie les plus anciennes entrées (Map = ordre
    // d'insertion). Perdre un compteur est préférable à gonfler la mémoire.
    while (this.hits.size >= this.capacity) {
      const oldest = this.hits.keys().next();
      if (oldest.done) return;
      this.hits.delete(oldest.value);
    }
  }
}
