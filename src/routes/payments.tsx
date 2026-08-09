import { createFileRoute } from "@tanstack/react-router";
import Payments from "@/pages/Payments";
import { requireAuth } from "@/lib/route-guards";

export const Route = createFileRoute("/payments")({
  ssr: false,
  beforeLoad: requireAuth,
  component: Payments,
  head: () => ({
    meta: [
      { title: "المدفوعات — سِجلّي" },
      { name: "description", content: "سجل كل عمليات السداد لكل العملاء." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "المدفوعات — سِجلّي" },
      { property: "og:description", content: "سجل كل عمليات السداد لكل العملاء." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/payments" },
    ],
    links: [{ rel: "canonical", href: "/payments" }],
  }),
});
