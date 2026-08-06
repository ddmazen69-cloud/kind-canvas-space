import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/route-guards";
import BlockedCustomers from "@/pages/BlockedCustomers";

export const Route = createFileRoute("/blocked")({
  ssr: false,
  beforeLoad: requireAuth,
  component: BlockedCustomers,
  head: () => ({
    meta: [
      { title: "المحظورون — سِجلّي" },
      { name: "description", content: "إدارة القائمة السوداء والديون المجمدة والتوصيات الذكية." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "المحظورون — سِجلّي" },
      { property: "og:description", content: "إدارة القائمة السوداء والديون المجمدة والتوصيات الذكية." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/blocked" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "المحظورون — سِجلّي" },
      { name: "twitter:description", content: "إدارة القائمة السوداء والديون المجمدة والتوصيات الذكية." },
    ],
    links: [{ rel: "canonical", href: "/blocked" }],
  }),
});
