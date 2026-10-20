"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { useSession } from "./SessionProvider";
import { FormError, TextField } from "./fields";

/**
 * Connexion. Trois réponses distinctes, comme l'API :
 * 401 identifiants faux (message générique), 403 compte désactivé, 429 limite
 * de tentatives avec le délai annoncé. Aucun indice sur l'existence d'un compte.
 */
export function LoginScreen() {
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const emailValue = email.trim();
    if (!emailValue || !password) {
      setError("Renseignez l’adresse email et le mot de passe.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await login(emailValue, password);
      setPassword("");
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.status === 429) {
          setError(
            caught.retryAfter
              ? `Trop de tentatives. Réessayez dans ${caught.retryAfter} seconde${caught.retryAfter > 1 ? "s" : ""}.`
              : "Trop de tentatives. Attendez quelques minutes avant de réessayer.",
          );
        } else if (caught.status === 403) {
          setError("Ce compte administrateur est désactivé.");
        } else if (caught.status === 401) {
          setError("Email ou mot de passe incorrect.");
        } else {
          setError(caught.message || "Connexion impossible.");
        }
      } else {
        setError(caught instanceof Error ? caught.message : "Connexion impossible.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="panel login-panel" noValidate onSubmit={onSubmit}>
        <h1>Connexion</h1>
        <p className="lede">Accès réservé aux administrateurs de la plateforme et des communautés.</p>
        <FormError message={error} />
        <TextField
          label="Adresse email"
          type="email"
          name="email"
          autoComplete="username"
          required
          spellCheck={false}
          value={email}
          onChange={setEmail}
        />
        <TextField
          label="Mot de passe"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={setPassword}
        />
        <div className="actions">
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? "Connexion…" : "Se connecter"}
          </button>
        </div>
      </form>
      <div className="login-notes">
        <p>Le jeton de session reste en mémoire de cet onglet. Un rechargement de la page impose une nouvelle connexion.</p>
        <p>La connexion est limitée par adresse et par compte : après plusieurs échecs, il faut attendre.</p>
        <p className="muted">
          Cette console interroge l’API depuis le navigateur, sur la même origine. Aucun jeton n’est stocké par le
          navigateur.
        </p>
      </div>
    </div>
  );
}
