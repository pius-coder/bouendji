"use server";

import { id } from "@/server/api/schema-kit";
import { getServices } from "@/server/services";
import {
  appCreateBody,
  type AppDetail,
  appLogoBody,
  appPatchBody,
  onboardingCommunityBody,
  onboardingPatchBody,
  type OnboardingState,
} from "@/server/services/onboarding/onboarding.schema";
import { runAction, type ActionResult } from "./action-result";

export async function saveOnboardingStepAction(input: unknown): Promise<ActionResult<OnboardingState>> {
  return runAction(async () => {
    const body = onboardingPatchBody.parse(input);
    return getServices().onboarding.patchOnboarding(body);
  });
}

export async function createOnboardingCommunityAction(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string; slug: string }>> {
  return runAction(async () => {
    const body = onboardingCommunityBody.parse(input);
    const created = await getServices().onboarding.createOwnCommunity(body);
    return { id: created.id, name: created.name, slug: created.slug };
  });
}

export async function createAppAction(input: unknown): Promise<ActionResult<AppDetail>> {
  return runAction(async () => {
    const body = appCreateBody.parse(input);
    return getServices().onboarding.createApp(body);
  });
}

export async function updateAppAction(appId: string, input: unknown): Promise<ActionResult<AppDetail>> {
  return runAction(async () => {
    const body = appPatchBody.parse(input);
    return getServices().onboarding.updateApp({ appId: id.parse(appId), ...body });
  });
}

export async function uploadAppLogoAction(
  appId: string,
  input: unknown,
): Promise<ActionResult<{ appId: string; logoKey: string; sha256: string }>> {
  return runAction(async () => {
    const body = appLogoBody.parse(input);
    const res = await getServices().onboarding.uploadLogo({ appId: id.parse(appId), ...body });
    return { appId: res.appId, logoKey: res.logoKey, sha256: res.sha256 };
  });
}
