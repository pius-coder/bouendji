import { createCn } from "cn/config";

/**
 * Fusion de classes Tailwind avec les jetons du projet. Sans cette extension,
 * `text-body` passerait pour une couleur et écraserait `text-foreground`
 * (vérifié le 2026-10-24) ; `rounded-field` cohabiterait avec `rounded-md`.
 * Les primitives `components/ui/` importent ce `cn`, pas celui du paquet.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "large-title",
            "title-2",
            "title-3",
            "headline",
            "body",
            "callout",
            "subhead",
            "footnote",
            "caption-1",
            "caption-2",
          ],
        },
      ],
      rounded: [{ rounded: ["field", "section"] }],
      shadow: [{ shadow: ["hairline", "float"] }],
    },
  },
});
