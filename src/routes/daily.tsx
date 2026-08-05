import { createFileRoute } from "@tanstack/react-router";
import DailyLog from "@/pages/DailyLog";
import { requireAuth } from "@/lib/route-guards";

export const Route = createFileRoute("/daily")({
  ssr: false,
  beforeLoad: requireAuth,
  component: DailyLog,
  head: () => ({
    meta: [
      { title: "اليومية — سِجلّي" },
      { name: "description", content: "ملخّص فواتير ومبيعات اليوم في المحل" },
    ],
    links: [{ rel: "canonical", href: "/daily" }],
  }),
});
