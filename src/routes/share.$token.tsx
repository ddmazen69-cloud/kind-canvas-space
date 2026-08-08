import { createFileRoute } from "@tanstack/react-router";
import SharedStatement from "@/pages/SharedStatement";

function SharedStatementRoute() {
  const { token } = Route.useParams();
  return <SharedStatement token={token} />;
}

export const Route = createFileRoute("/share/$token")({
  ssr: false,
  component: SharedStatementRoute,
  head: () => ({
    meta: [
      { title: "كشف حساب — سِجلّي" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "كشف حساب عميل مُشارك من سِجلّي — عرض كامل للفواتير والمدفوعات." },
    ],
  }),
});
