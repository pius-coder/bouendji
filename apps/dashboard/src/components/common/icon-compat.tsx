import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icon";

/**
 * Noms « à la lucide » rendus en Solar, pour les primitives shadcn (`components/ui/`)
 * et les écrans legacy : on remplace l'import, pas chaque appel. Le code nouveau
 * utilise directement `<Icon name>`.
 */
type Props = { className?: string; "aria-hidden"?: boolean | "true" | "false" };

function make(name: IconName, display: string) {
  function Compat({ className }: Props) {
    return <Icon name={name} className={cn("size-4", className)} />;
  }
  Compat.displayName = display;
  return Compat;
}

export const CheckIcon = make("checkmark", "CheckIcon");
export const ChevronRightIcon = make("chevron-right", "ChevronRightIcon");
export const ChevronRight = ChevronRightIcon;
export const ChevronDownIcon = make("chevron-down", "ChevronDownIcon");
export const ChevronUpIcon = make("chevron-up", "ChevronUpIcon");
export const XIcon = make("close", "XIcon");
export const SearchIcon = make("search", "SearchIcon");
export const MoreHorizontal = make("menu-dots", "MoreHorizontal");
export const PanelLeftIcon = make("sidebar", "PanelLeftIcon");
export const PlusIcon = make("plus", "PlusIcon");
export const PencilIcon = make("pen", "PencilIcon");
export const EyeIcon = make("eye", "EyeIcon");
export const EyeOffIcon = make("eye-closed", "EyeOffIcon");
export const CircleCheckIcon = make("check", "CircleCheckIcon");
export const InfoIcon = make("info", "InfoIcon");
export const TriangleAlertIcon = make("warning", "TriangleAlertIcon");
export const OctagonXIcon = make("danger", "OctagonXIcon");
export const Loader2Icon = make("refresh", "Loader2Icon");

/** Puce d'élément radio (pas d'icône Solar équivalente : un disque plein). */
export function CircleIcon({ className }: Props) {
  return <span aria-hidden className={cn("block size-2 rounded-full bg-current", className)} />;
}
