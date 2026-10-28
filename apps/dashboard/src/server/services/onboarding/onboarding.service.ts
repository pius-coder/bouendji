import "server-only";
import { BaseService, type BaseServiceDeps } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";
import {
  type AppCreate,
  appCreateBody,
  appDetail,
  appIdParams,
  appLogoBody,
  appLogoResult,
  type AppLogoUpload,
  type AppPatch,
  appPatchBody,
  type OnboardingCommunityCreate,
  onboardingCommunityBody,
  onboardingCommunityCreated,
  type OnboardingPatch,
  onboardingPatchBody,
  onboardingState,
} from "./onboarding.schema";

/** Dossier API : `/v1/admin` (onboarding en libre-service R4 : `onboarding`, `apps`, `logo`). */
export class OnboardingService extends BaseService {
  private static readonly endpoints = {
    get: endpoint({ method: "GET", path: "/onboarding", response: onboardingState }),
    patch: endpoint({
      method: "PATCH",
      path: "/onboarding",
      body: onboardingPatchBody,
      response: onboardingState,
      refreshAfter: true,
    }),
    createCommunity: endpoint({
      method: "POST",
      path: "/onboarding/community",
      body: onboardingCommunityBody,
      response: onboardingCommunityCreated,
      idempotent: true,
      refreshAfter: true,
    }),
    createApp: endpoint({
      method: "POST",
      path: "/apps",
      body: appCreateBody,
      response: appDetail,
      idempotent: true,
      refreshAfter: true,
    }),
    updateApp: endpoint({
      method: "PATCH",
      path: "/apps/:appId",
      params: appIdParams,
      body: appPatchBody,
      response: appDetail,
      refreshAfter: true,
    }),
    uploadLogo: endpoint({
      method: "POST",
      path: "/apps/:appId/logo",
      params: appIdParams,
      body: appLogoBody,
      response: appLogoResult,
      refreshAfter: true,
    }),
  } as const;

  constructor(deps: BaseServiceDeps) {
    super(deps, { basePath: "/v1/admin" });
  }

  getOnboarding() {
    return this.call(OnboardingService.endpoints.get);
  }

  patchOnboarding(body: OnboardingPatch) {
    return this.call(OnboardingService.endpoints.patch, { body });
  }

  createOwnCommunity(body: OnboardingCommunityCreate) {
    return this.call(OnboardingService.endpoints.createCommunity, { body });
  }

  createApp(body: AppCreate) {
    return this.call(OnboardingService.endpoints.createApp, { body });
  }

  updateApp(input: { appId: string } & AppPatch) {
    const { appId, ...body } = input;
    return this.call(OnboardingService.endpoints.updateApp, { params: { appId }, body });
  }

  uploadLogo(input: { appId: string } & AppLogoUpload) {
    const { appId, ...body } = input;
    return this.call(OnboardingService.endpoints.uploadLogo, { params: { appId }, body });
  }
}
