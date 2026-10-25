import type { ChipOption } from "@/components/page/chip-filter";

export const PAYOUT_STATUS_OPTIONS: readonly ChipOption[] = [
  { value: "", label: "Tous" },
  { value: "needs_review", label: "À vérifier", dot: "danger" },
  { value: "pending", label: "En attente", dot: "warning" },
  { value: "approved", label: "Approuvés", dot: "info" },
  { value: "processing", label: "En cours", dot: "info" },
  { value: "paid", label: "Payés", dot: "success" },
  { value: "failed", label: "Échoués", dot: "danger" },
];

