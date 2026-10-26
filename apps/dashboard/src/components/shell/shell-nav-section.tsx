import { getCommunities, getMe } from "@/server/context";
import { CommandPalette } from "./command-palette";
import {
  MobileCommunitySwitcher,
  ShellBottomBar,
  ShellRail,
  ShellSectionBand,
  ShellSectionChips,
  ShellSubmenu,
} from "./shell-nav";
import { UserMenu } from "./user-menu";

/**
 * Blocs serveur du shell : chacun lit compte et communautés (dédoublonnés par
 * `cache()`) et passe des props sérialisables au client. Chacun a SA frontière
 * Suspense dans le layout, à la géométrie du bloc (D104).
 */
async function readNav() {
  const [me, communities] = await Promise.all([getMe(), getCommunities()]);
  return { me, communities: communities.map((c) => ({ id: c.id, name: c.name })) };
}

export async function RailSection() {
  return <ShellRail {...await readNav()} />;
}

export async function SubmenuSection() {
  return <ShellSubmenu {...await readNav()} />;
}

export async function SectionBandSection() {
  return <ShellSectionBand {...await readNav()} />;
}

export async function SectionChipsSection() {
  return <ShellSectionChips {...await readNav()} />;
}

export async function BottomBarSection() {
  return <ShellBottomBar {...await readNav()} />;
}

export async function MobileCommunitySection() {
  return <MobileCommunitySwitcher {...await readNav()} />;
}

export async function UserMenuSection() {
  const me = await getMe();
  return <UserMenu name={me.name} email={me.email} />;
}

/** Palette Ctrl K : même navigation que le shell, montée une fois par page. */
export async function CommandPaletteSection() {
  const { me, communities } = await readNav();
  return <CommandPalette me={me} communities={communities} />;
}
