import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/payments-test")({
  component: () => (
    <div className="p-8 text-xl font-bold">مدفوعات تجريبي — المسار يعمل</div>
  ),
});
