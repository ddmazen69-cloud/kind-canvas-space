import { createFileRoute } from "@tanstack/react-router";
import CustomerDetails from "@/pages/CustomerDetails";
import { requireAuth } from "@/lib/route-guards";

export const Route = createFileRoute("/customers/$customerId")({
  ssr: false,
  beforeLoad: requireAuth,
  component: CustomerDetails,
  head: () => ({
    meta: [
      { title: "تفاصيل العميل — سِجلّي" },
      { name: "description", content: "ملف العميل، حركة الحساب، وتحليل السلوك والالتزام." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
