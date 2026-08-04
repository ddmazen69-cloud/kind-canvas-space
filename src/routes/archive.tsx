import { createFileRoute } from "@tanstack/react-router";
import Archive from "@/pages/Archive";
import { requireAuth } from "@/lib/route-guards";

export const Route = createFileRoute("/archive")({
  ssr: false,
  beforeLoad: requireAuth,
  component: Archive,
  head: () => ({
    meta: [
      { title: "الأرشيف — سِجلّي" },
      { name: "description", content: "أرشيف كل العناصر المحذوفة من عملاء وفواتير وموردين وأصناف ومصروفات مع إمكانية الاسترجاع أو المسح النهائي." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "الأرشيف — سِجلّي" },
      { property: "og:description", content: "استرجع أي عنصر محذوف أو امسحه نهائيًا من أرشيف سِجلّي." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/archive" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "الأرشيف — سِجلّي" },
      { name: "twitter:description", content: "استرجع أي عنصر محذوف أو امسحه نهائيًا من أرشيف سِجلّي." },
    ],
    links: [{ rel: "canonical", href: "/archive" }],
  }),
});
