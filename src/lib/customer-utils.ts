import type { Customer, Invoice, Payment } from "@/lib/store";
import { daysLate, fmt, analyzeCustomerRisk } from "@/lib/store";
import { toArabicDigits } from "@/lib/arabic-digits";

/* ── Egypt locale helpers ── */

export function isoToDDMMYYYY(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "";
  return `${d}/${m}/${y}`;
}

export function ddmmyyyyToIso(s: string): string | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dd = Number(d), mm = Number(mo);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${y}-${mo}-${d}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/* ── Customer financial metrics ── */

export function customerMetrics(invoices: Invoice[], c: Customer) {
  const mine = invoices.filter((i) => i.customerId === c.id);
  const totalCharged = mine.reduce((s, i) => s + i.total, 0) + (c.openingBalance || 0);
  const totalPaid = mine.reduce((s, i) => s + i.paid, 0);
  const balance = totalCharged - totalPaid;
  const worstLate = Math.max(0, ...mine.map(daysLate));
  const paidPct = totalCharged > 0 ? Math.min(100, Math.round((totalPaid / totalCharged) * 100)) : 0;
  return { balance, worstLate, paidPct, totalCharged, totalPaid };
}

/* ── Blocked customer WhatsApp message (formal/legal tone) ── */

export function blockedWhatsAppMessage(c: Customer, balance: number, worstLate: number): string {
  const balanceStr = fmt(balance);
  const lines: string[] = [];

  lines.push(`السيد/ ${c.name} — إشعار رسمي بتجميد الحساب`);
  lines.push(``);
  lines.push(`نحيطكم علماً بأنه تم تجميد حسابكم لدينا نظراً لتأخر سداد المستحقات المالية.`);
  lines.push(``);

  if (balance > 0) {
    lines.push(`💰 المبلغ المستحق: ${balanceStr} ج.م`);
  }
  if (worstLate > 0) {
    lines.push(`⏰ مدة التأخير: ${worstLate} يوماً`);
  }

  lines.push(``);
  lines.push(`نأمل التواصل معنا في أقرب وقت لتسوية المبالغ المتأخرة وإعادة تفعيل حسابكم.`);
  lines.push(``);
  lines.push(`⚠️ في حال عدم الاستجابة خلال مدة أقصاها ٧ أيام من تاريخ هذا الإشعار، سيتم اتخاذ الإجراءات اللازمة لاسترداد المستحقات.`);
  lines.push(``);
  lines.push(`مع تحياتنا — سِجلّي`);

  return lines.join("\n");
}
