/**
 * Envoi Telegram : plusieurs destinataires, réessai après un échec, aucune
 * donnée de connexion dans le message. `fetch` est remplacé : aucun appel réseau.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 3).toString("base64");

const { env } = await import("../src/config.js");
const { notifyChats } = await import("../src/services/telegram.js");

const realFetch = globalThis.fetch;
const realEnabled = env.telegram.enabled;
const realToken = env.telegram.botToken;

after(() => {
  globalThis.fetch = realFetch;
  env.telegram.enabled = realEnabled;
  env.telegram.botToken = realToken;
});

env.telegram.enabled = true;
env.telegram.botToken = "123456:TEST-TOKEN";

type Call = { chatId: string; text: string };
function mockFetch(responder: (call: Call, attempt: number) => Response): Call[] {
  const calls: Call[] = [];
  const attempts = new Map<string, number>();
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { chat_id: string; text: string };
    const call = { chatId: body.chat_id, text: body.text };
    calls.push(call);
    const attempt = (attempts.get(call.chatId) ?? 0) + 1;
    attempts.set(call.chatId, attempt);
    return responder(call, attempt);
  }) as typeof fetch;
  return calls;
}

test("un échec est réessayé une fois, puis le message part", async () => {
  const calls = mockFetch((_call, attempt) =>
    attempt === 1 ? new Response('{"ok":false}', { status: 500 }) : new Response('{"ok":true}', { status: 200 }),
  );
  const ok = await notifyChats(["111"], "Rappel de créneau");
  assert.equal(ok, true);
  assert.equal(calls.length, 2);
});

test("deux échecs : le résultat est faux, sans lever d'exception", async () => {
  const calls = mockFetch(() => new Response('{"ok":false}', { status: 500 }));
  const ok = await notifyChats(["222"], "Rappel");
  assert.equal(ok, false);
  assert.equal(calls.length, 2);
});

test("plusieurs destinataires : chacun reçoit, sans doublon", async () => {
  const calls = mockFetch(() => new Response('{"ok":true}', { status: 200 }));
  const ok = await notifyChats(["301", "301", "302"], "Test");
  assert.equal(ok, true);
  assert.deepEqual(calls.map((c) => c.chatId), ["301", "302"]);
});

test("le texte envoyé ne contient ni configuration, ni UUID, ni jeton", async () => {
  const calls = mockFetch(() => new Response('{"ok":true}', { status: 200 }));
  const secret = "11111111-2222-3333-4444-555555555555";
  await notifyChats(["401"], `Nœud prêt vless://${secret}@host:443?path=/ws Bearer abcdefghijklmnopqrstuvwxyz012345`);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.text.includes(secret), false);
  assert.equal(calls[0]!.text.includes("vless://"), false);
  assert.equal(calls[0]!.text.includes("abcdefghijklmnopqrstuvwxyz012345"), false);
});

test("Telegram désactivé : rien n'est envoyé", async () => {
  env.telegram.enabled = false;
  const calls = mockFetch(() => new Response('{"ok":true}', { status: 200 }));
  const ok = await notifyChats(["501"], "Test");
  env.telegram.enabled = true;
  assert.equal(ok, false);
  assert.equal(calls.length, 0);
});
