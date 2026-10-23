/**
 * D53 — le compte est **par marque**, et le téléphone y est obligatoire.
 *
 * Ce que ces tests prouvent, et rien de plus :
 * - une inscription sans téléphone est refusée en 400 (`fail.validation`), et
 *   n'écrit aucune ligne ;
 * - un téléphone mal formé est refusé en 400, et rien n'est écrit non plus ;
 * - un téléphone bien formé mais saisi avec espaces, points ou tirets est
 *   **normalisé** avant stockage (sinon `(app_id, phone)` ne verrait pas le
 *   même numéro deux fois) ;
 * - le même email sur deux marques donne **deux comptes distincts** et **deux
 *   connexions distinctes** : l'unicité est `(app_id, lower(email))`, pas
 *   globale ;
 * - une connexion sans `appId` est un 400 — la route ne devine pas la marque ;
 * - une connexion sur la mauvaise marque est un 401, avec exactement le même
 *   message qu'un mot de passe faux ou qu'un email inconnu.
 *
 * Le test suit `auth.test.ts` : vraies clés EC P-256, vraie preuve d'appareil
 * signée sur le corps exact, et la base mémoire de `support.ts` (PGlite, donc
 * les vrais index du schéma).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

const { db, call, closeAll, enrollDevice, seedApp, signProof } = await import("./support.js");

const brandA = await seedApp({ deviceLimit: 1 });
const brandB = await seedApp({ deviceLimit: 1 });

const PASSWORD = "mot-de-passe-de-test";
/** Saisi avec espaces et points : doit être stocké `+237612345678`. */
const PHONE_A = "+237 6 12 34 56 78";
const PHONE_A_STORED = "+237612345678";

after(closeAll);

/* ------------------------------------------------------------------ outils */

interface Device {
  deviceId: string;
  deviceToken: string;
  keys: { signing: { spki: string; pem: string } };
}

interface Body {
  appId?: string;
  email: string;
  password: string;
  name: string;
  phone?: string;
  locale?: string;
}

/** Corps d'inscription de base ; l'appelant retire ce qu'il veut tester. */
function registerBody(appId: string, email: string, phone: string): Body {
  return { appId, email, password: PASSWORD, name: "Testeur Test", phone, locale: "fr" };
}

/**
 * L'envoi signe **exactement** le corps qui part : `call` sérialise l'objet
 * reçu, donc `JSON.stringify(body)` ici est la même chaîne que celle envoyée.
 * Un champ retiré du corps est donc aussi retiré de la signature.
 */
function post(device: Device, path: string, body: Record<string, unknown>) {
  return call("POST", path, {
    payload: body,
    headers: {
      "x-device-token": device.deviceToken,
      ...signProof(device.keys.signing, "POST", path, JSON.stringify(body)),
    },
  });
}

function register(device: Device, body: Body) {
  return post(device, "/v1/auth/register", body as unknown as Record<string, unknown>);
}

function login(device: Device, body: { appId?: string; email: string; password: string }) {
  return post(device, "/v1/auth/login", body as unknown as Record<string, unknown>);
}

/** Nombre de comptes portant cet email, toutes marques confondues. */
async function userCount(email: string): Promise<number> {
  return Number(await db.scalar("SELECT count(*) AS n FROM users WHERE lower(email) = lower($1)", [email]));
}

function emailOf(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}@example.test`;
}

/* -------------------------------------------------------------------- tests */

test("inscription : sans téléphone, 400 et aucune ligne écrite", async () => {
  const device = await enrollDevice({ deviceName: "Pixel sans tel" });
  const email = emailOf("sans-tel");
  const body = registerBody(brandA.appId, email, PHONE_A);
  // « Sans téléphone » veut dire champ absent, pas champ vide : les deux sont
  // refusés, mais seul le premier est ce qu'envoie une app qui n'a pas le champ.
  delete body.phone;

  const missing = await register(device, body);
  assert.equal(missing.status, 400, `400 attendu : ${missing.text}`);
  assert.equal(missing.body.error.code, "VALIDATION_FAILED");
  assert.match(JSON.stringify(missing.body.error.details), /phone/, "le champ fautif est nommé");

  const empty = await register(device, registerBody(brandA.appId, email, "   "));
  assert.equal(empty.status, 400, `400 attendu sur un téléphone vide : ${empty.text}`);
  assert.equal(empty.body.error.code, "VALIDATION_FAILED");

  assert.equal(await userCount(email), 0, "aucun compte n'est créé sans téléphone");
});

test("inscription : téléphone mal formé refusé, téléphone espacé normalisé", async () => {
  const malformed = ["12 34", "+237.6.12.34.56.78.90.12.34", "abc-12345678", "tel:+237612345678"];

  for (const phone of malformed) {
    const device = await enrollDevice({ deviceName: "Pixel tel casse" });
    const email = emailOf("tel-casse");
    const res = await register(device, registerBody(brandA.appId, email, phone));
    assert.equal(res.status, 400, `400 attendu pour « ${phone} » : ${res.text}`);
    assert.equal(res.body.error.code, "VALIDATION_FAILED");
    assert.match(JSON.stringify(res.body.error.details), /phone/, "le champ fautif est nommé");
    assert.equal(await userCount(email), 0, `aucun compte créé pour « ${phone} »`);
  }

  // Le format accepte une saisie lisible : ce qui est stocké est le numéro
  // canonique, sinon deux saisies du même numéro seraient deux comptes.
  const device = await enrollDevice({ deviceName: "Pixel tel ok" });
  const email = emailOf("tel-ok");
  const ok = await register(device, registerBody(brandA.appId, email, PHONE_A));
  assert.equal(ok.status, 201, ok.text);
  assert.equal(ok.body.user.email, email.toLowerCase(), "email stocké en minuscules");

  const row = await db.one<Record<string, any>>("SELECT email, phone, app_id FROM users WHERE id = $1", [
    ok.body.user.id,
  ]);
  assert.equal(row?.phone, PHONE_A_STORED, "espaces, points et tirets retirés avant stockage");
  assert.equal(row?.email, email.toLowerCase(), "email stocké en minuscules");
  assert.equal(row?.app_id, brandA.appId, "le compte appartient à la marque d'inscription");
});

test("compte par marque : le même email sur deux marques donne deux comptes et deux connexions", async () => {
  // Casse volontairement mixte : la comparaison et le stockage passent par
  // `lower(email)`, l'index aussi.
  const email = `Partage-${randomUUID().slice(0, 8)}@Example.test`;
  const phoneA = "+237 6 90 00 00 01";
  const phoneB = "+237690000002";

  const deviceA = await enrollDevice({ deviceName: "Pixel marque A" });
  const first = await register(deviceA, registerBody(brandA.appId, email, phoneA));
  assert.equal(first.status, 201, first.text);
  assert.equal(first.body.user.email, email.toLowerCase());
  assert.equal(first.body.user.communityId, brandA.communityId);

  // Même email, **autre marque** : ce n'est pas un doublon (D53).
  const deviceB = await enrollDevice({ deviceName: "Pixel marque B" });
  const second = await register(deviceB, registerBody(brandB.appId, email, phoneB));
  assert.equal(second.status, 201, `le même email doit passer sur une autre marque : ${second.text}`);
  assert.equal(second.body.user.email, email.toLowerCase());
  assert.equal(second.body.user.communityId, brandB.communityId);

  assert.notEqual(first.body.user.id, second.body.user.id, "deux comptes distincts");
  assert.equal(await userCount(email), 2, "deux lignes users, une par marque");

  const rows = await db.query<Record<string, any>>(
    "SELECT id, app_id, phone FROM users WHERE lower(email) = lower($1) ORDER BY app_id",
    [email],
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.app_id).sort(),
    [brandA.appId, brandB.appId].sort(),
    "un compte par marque",
  );

  // Deux connexions distinctes, chacune dans sa marque, même email et même mot
  // de passe : c'est l'`appId` qui départage les comptes.
  const loginA = await login(deviceA, { appId: brandA.appId, email: email.toLowerCase(), password: PASSWORD });
  assert.equal(loginA.status, 200, loginA.text);
  assert.equal(loginA.body.user.id, first.body.user.id);

  const loginB = await login(deviceB, { appId: brandB.appId, email: email.toLowerCase(), password: PASSWORD });
  assert.equal(loginB.status, 200, loginB.text);
  assert.equal(loginB.body.user.id, second.body.user.id);
  assert.notEqual(loginA.body.user.id, loginB.body.user.id);

  // Et le téléphone est lui aussi unique **par marque** : le réutiliser sur
  // l'autre marque est légitime, le réutiliser dans la même marque ne l'est pas.
  const deviceC = await enrollDevice({ deviceName: "Pixel marque B bis" });
  const samePhoneOtherBrand = await register(deviceC, registerBody(brandB.appId, emailOf("tel-partage"), phoneA));
  assert.equal(samePhoneOtherBrand.status, 201, `téléphone d'une autre marque accepté : ${samePhoneOtherBrand.text}`);

  const deviceD = await enrollDevice({ deviceName: "Pixel marque B doublon" });
  const samePhoneSameBrand = await register(deviceD, registerBody(brandB.appId, emailOf("tel-doublon"), phoneA));
  assert.equal(samePhoneSameBrand.status, 409);
  assert.equal(samePhoneSameBrand.body.error.code, "CONFLICT");

  // Même email dans la même marque : toujours un conflit, la marque ne lève
  // pas l'unicité interne.
  const deviceE = await enrollDevice({ deviceName: "Pixel marque A doublon" });
  const sameEmailSameBrand = await register(deviceE, registerBody(brandA.appId, email, "+237690000003"));
  assert.equal(sameEmailSameBrand.status, 409);
  assert.equal(sameEmailSameBrand.body.error.code, "CONFLICT");
});

test("connexion : sans appId, 400 — la marque n'est jamais devinée", async () => {
  const device = await enrollDevice({ deviceName: "Pixel sans appId" });
  const email = emailOf("sans-appid");
  const created = await register(device, registerBody(brandA.appId, email, "+237690000004"));
  assert.equal(created.status, 201, created.text);

  const body = { email: email.toLowerCase(), password: PASSWORD };
  const missing = await login(device, body);
  assert.equal(missing.status, 400, `400 attendu sans appId : ${missing.text}`);
  assert.equal(missing.body.error.code, "VALIDATION_FAILED");
  assert.match(JSON.stringify(missing.body.error.details), /appId/, "le champ fautif est nommé");
});

test("connexion : mauvaise marque, mot de passe faux, email inconnu → même 401", async () => {
  const email = emailOf("message-identique");
  const owner = await enrollDevice({ deviceName: "Pixel message" });
  const created = await register(owner, registerBody(brandA.appId, email, "+237690000005"));
  assert.equal(created.status, 201, created.text);

  // Session valide dans la bonne marque : la référence des suivantes.
  const ok = await login(owner, { appId: brandA.appId, email: email.toLowerCase(), password: PASSWORD });
  assert.equal(ok.status, 200, ok.text);

  const probe = await enrollDevice({ deviceName: "Pixel sonde" });

  const wrongBrand = await login(probe, { appId: brandB.appId, email: email.toLowerCase(), password: PASSWORD });
  assert.equal(wrongBrand.status, 401, `une autre marque ne doit pas ouvrir ce compte : ${wrongBrand.text}`);
  assert.equal(wrongBrand.body.error.code, "INVALID_CREDENTIALS");

  const wrongPassword = await login(probe, { appId: brandA.appId, email: email.toLowerCase(), password: "mauvais-mot-de-passe" });
  assert.equal(wrongPassword.status, 401);
  assert.equal(wrongPassword.body.error.code, "INVALID_CREDENTIALS");

  const unknownEmail = await login(probe, { appId: brandA.appId, email: emailOf("inconnu"), password: PASSWORD });
  assert.equal(unknownEmail.status, 401);
  assert.equal(unknownEmail.body.error.code, "INVALID_CREDENTIALS");

  // Le message est le même dans les trois cas : la route n'apprend rien sur
  // l'existence du compte ni sur la marque où il vit.
  assert.equal(wrongBrand.body.error.message, wrongPassword.body.error.message);
  assert.equal(unknownEmail.body.error.message, wrongPassword.body.error.message);
});
