import { createFileRoute } from "@tanstack/react-router";
import Join from "@/pages/Join";

function JoinRoute() {
  const { token } = Route.useParams();
  return <Join token={token} />;
}

export const Route = createFileRoute("/join/$token")({
  ssr: false,
  component: JoinRoute,
  head: () => ({
    meta: [
      { title: "دعوة انضمام للفريق — سِجلّي" },
      { name: "description", content: "افتح رابط الدعوة عشان تنضم لفريق المحل بالصلاحية اللي حددها المالك." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "دعوة انضمام للفريق — سِجلّي" },
      { property: "og:description", content: "انضم لفريق المحل على سِجلّي بالصلاحية اللي حددها المالك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "دعوة انضمام للفريق — سِجلّي" },
      { name: "twitter:description", content: "انضم لفريق المحل على سِجلّي بالصلاحية اللي حددها المالك." },
    ],
  }),
});
