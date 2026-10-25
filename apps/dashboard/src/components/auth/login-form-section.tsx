import { LoginForm } from "./login-form";

/** Résout `searchParams` côté serveur et passe `next` au formulaire client en prop. */
export async function LoginFormSection({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : "/"} />;
}
