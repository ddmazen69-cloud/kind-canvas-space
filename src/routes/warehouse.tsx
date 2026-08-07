import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/route-guards";
import Warehouse from "@/pages/Warehouse";

export const Route = createFileRoute("/warehouse")({
  ssr: false,
  beforeLoad: requireAuth,
  component: Warehouse,
  head: () => ({
    meta: [
      { title: "المخزن — سِجلّي" },
      { name: "description", content: "إدارة البضاعة الموسمية المخزنة صيفية وشتوية وتتبع كمياتها." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "المخزن — سِجلّي" },
      { property: "og:description", content: "إدارة البضاعة الموسمية المخزنة صيفية وشتوية وتتبع كمياتها." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/warehouse" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "المخزن — سِجلّي" },
      { name: "twitter:description", content: "إدارة البضاعة الموسمية المخزنة صيفية وشتوية وتتبع كمياتها." },
    ],
    links: [{ rel: "canonical", href: "/warehouse" }],
  }),
});
