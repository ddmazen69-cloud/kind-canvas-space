import { createFileRoute } from "@tanstack/react-router";
import Payments from "@/pages/CustomersPayments";

export const Route = createFileRoute("/customers/payments")({
  ssr: false,
  component: Payments,
  head: () => ({
    meta: [
      { title: "المدفوعات — سِجلّي" },
      { name: "description", content: "عرض سجل المدفوعات وربطه بملفات العملاء." },
    ],
    links: [{ rel: "canonical", href: "/customers/payments" }],
  }),
});
