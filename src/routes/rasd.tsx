import { createFileRoute } from "@tanstack/react-router";
import RasdPage from "@/pages/Rasd";
import { requireAuth } from "@/lib/route-guards";

export const Route = createFileRoute("/rasd")({
  ssr: false,
  beforeLoad: requireAuth,
  component: RasdPage,
  head: () => ({
    meta: [
      { title: "رَصْد — المساعد التحليلي — سِجلّي" },
      { name: "description", content: "اسأل رَصْد عن بيانات محلك: الأقساط المتأخرة، المخزون الناقص، التحصيلات والربح." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "رَصْد — المساعد التحليلي" },
      { property: "og:description", content: "اسأل رَصْد عن بيانات محلك: الأقساط المتأخرة، المخزون الناقص، التحصيلات والربح." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/rasd" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "رَصْد — المساعد التحليلي" },
      { name: "twitter:description", content: "اسأل رَصْد عن بيانات محلك." },
    ],
    links: [{ rel: "canonical", href: "/rasd" }],
  }),
});
