import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSubmitPassword, passwordErrors, passwordStrength } from "@/components/account/password-rules";
import { describeAgent, formatSessionDate } from "@/components/account/session-format";

describe("mot de passe : jauge et erreurs", () => {
  it("sous 12 caractères : score 0, « Trop court »", () => {
    assert.deepEqual(passwordStrength("Abc123!"), { score: 0, label: "Trop court" });
    assert.equal(passwordStrength("").score, 0);
  });

  it("12 caractères d'une seule classe : Faible ; la longueur et la variété relèvent le score", () => {
    assert.equal(passwordStrength("aaaaaaaaaaaa").score, 1);
    assert.equal(passwordStrength("aaaaaaaaaaaaaaaa").score, 2);
    assert.equal(passwordStrength("Abcdefgh1234").score, 2);
    assert.equal(passwordStrength("Abcdefgh1234!xyz").score, 3);
    assert.equal(passwordStrength("Abcdefgh1234!xyzABCD").score, 4);
  });

  it("erreurs : minimum, identique à l'actuel, confirmation différente", () => {
    const short = passwordErrors({ currentPassword: "ancien-mdp-ok", newPassword: "court", confirmPassword: "court" });
    assert.match(short.newPassword ?? "", /12 caractères/);
    const same = passwordErrors({
      currentPassword: "identique-123456",
      newPassword: "identique-123456",
      confirmPassword: "identique-123456",
    });
    assert.match(same.newPassword ?? "", /différent/);
    const mismatch = passwordErrors({
      currentPassword: "ancien-mdp-ok",
      newPassword: "nouveau-mdp-2026",
      confirmPassword: "nouveau-mdp-2027",
    });
    assert.match(mismatch.confirmPassword ?? "", /ne correspondent pas/);
    assert.deepEqual(
      passwordErrors({ currentPassword: "ancien-mdp-ok", newPassword: "nouveau-mdp-2026", confirmPassword: "nouveau-mdp-2026" }),
      {},
    );
  });

  it("envoi permis seulement si tout est cohérent", () => {
    assert.equal(
      canSubmitPassword({ currentPassword: "ancien-mdp-ok", newPassword: "nouveau-mdp-2026", confirmPassword: "nouveau-mdp-2026" }),
      true,
    );
    assert.equal(
      canSubmitPassword({ currentPassword: "", newPassword: "nouveau-mdp-2026", confirmPassword: "nouveau-mdp-2026" }),
      false,
    );
    assert.equal(
      canSubmitPassword({ currentPassword: "ancien-mdp-ok", newPassword: "nouveau-mdp-2026", confirmPassword: "autre" }),
      false,
    );
  });
});

describe("sessions : libellé d'appareil et date", () => {
  it("reconnaît navigateur et système", () => {
    assert.equal(
      describeAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36"),
      "Chrome sur Android",
    );
    assert.equal(
      describeAgent("Mozilla/5.0 (Windows NT 10.0; Win64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0"),
      "Edge sur Windows",
    );
    assert.equal(
      describeAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"),
      "Safari sur iOS",
    );
    assert.equal(describeAgent(null), "Appareil inconnu");
  });

  it("date invalide affichée telle quelle", () => {
    assert.equal(formatSessionDate("pas-une-date"), "pas-une-date");
    assert.notEqual(formatSessionDate("2026-10-26T08:00:00Z"), "2026-10-26T08:00:00Z");
  });
});
