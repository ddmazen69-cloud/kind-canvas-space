import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/backup";
import { archiveBeforeDelete } from "@/lib/archive";
import { redisGet, redisSet, redisDel } from "@/lib/redis";

export type CustomerStatus = "committed" | "neutral" | "defaulter";
export type CustomerType = "installment" | "cash";

export interface Customer {
  id: string;
  code: string | null;
  name: string;
  phone: string;
  rating: number;
  status: CustomerStatus;
  customerType: CustomerType;
  notes: string | null;
  frozen: boolean;
  address: string | null;
  joiningDate: string;
  creditLimit: number;
  dueDay: number;
  openingBalance: number;
  ledgerNo: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  customerId: string;
  total: number;
  discountAmount: number;
  discountPercent: number;
  downPayment: number;
  monthlyInstallment: number;
  firstDueDate: string;
  paid: number;
  notes: string | null;
  createdAt: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  paidAt: string;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  name: string;
  cost: number;
  price: number;
  createdAt: string;
}

export type ExpenseCategory = "rent" | "electricity" | "salaries" | "transport" | "other";

export interface Expense {
  id: string;
  amount: number;
  category: ExpenseCategory;
  expenseDate: string;
  notes: string | null;
  createdAt: string;
}

export interface Supplier {
  id: string;
  code: string | null;
  name: string;
  contact: string;
  notes: string | null;
  openingBalance: number;
  joiningDate: string;
  createdAt: string;
}

export type PurchasePaymentType = "cash" | "credit";

export interface Purchase {
  id: string;
  supplierId: string;
  total: number;
  paymentType: PurchasePaymentType;
  purchaseDate: string;
  notes: string | null;
  createdAt: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  name: string;
  unitCost: number;
  quantity: number;
  createdAt: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  amount: number;
  paidAt: string;
}

export interface StockItem {
  id: string;
  name: string;
  size: string | null;
  quantity: number;
  lastUnitCost: number;
  salePrice: number;
  barcode: string | null;
  /** الحد الأدنى للمخزون لهذه الصنف */
  minQuantity?: number | null;
  /** باركود مخصص (قيمة نصية قابلة للتعيين) */
  customBarcode?: string | null;
  /** نوع الصنف (قسم الملابس/المفروشات) */
  category: string;
  location: "shop" | "warehouse";
  season: "summer" | "winter" | "general";
  createdAt: string;
  updatedAt: string;
}

interface DBState {
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  invoiceItems: InvoiceItem[];
  suppliers: Supplier[];
  purchases: Purchase[];
  purchaseItems: PurchaseItem[];
  supplierPayments: SupplierPayment[];
  stockItems: StockItem[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const listeners = new Set<() => void>();
let cache: {
  customers: Customer[]; invoices: Invoice[]; payments: Payment[]; expenses: Expense[]; invoiceItems: InvoiceItem[];
  suppliers: Supplier[]; purchases: Purchase[]; purchaseItems: PurchaseItem[]; supplierPayments: SupplierPayment[];
  stockItems: StockItem[];
} = {
  customers: [], invoices: [], payments: [], expenses: [], invoiceItems: [],
  suppliers: [], purchases: [], purchaseItems: [], supplierPayments: [], stockItems: [],
};
let loading = true;
let loaded = false;

function notify() { listeners.forEach((l) => l()); }

function userCacheKey(userId: string) {
  return `kv:${userId}:all`;
}

// Always fetch fresh from Supabase and re-seed Redis (used after every mutation).
async function fetchAll() {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await redisDel(userCacheKey(user.id));
  await fetchAllFromServer();
}

// Initial hydration: serve from Redis when possible, then revalidate in the background.
async function hydrate() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { await fetchAllFromServer(); return; }
  const raw = await redisGet(userCacheKey(user.id));
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        cache = parsed;
        loaded = true;
        loading = false;
        notify();
        void fetchAllFromServer();
        return;
      }
    } catch { /* corrupted entry — fall back to a full fetch */ }
  }
  await fetchAllFromServer();
}

async function fetchAllFromServer() {
  loading = true;
  notify();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    cache = { customers: [], invoices: [], payments: [], expenses: [], invoiceItems: [], suppliers: [], purchases: [], purchaseItems: [], supplierPayments: [], stockItems: [] };
    loading = false;
    notify();
    return;
  }
  const [c, i, p, e, ii, s, pu, pi, sp, st] = await Promise.all([
    supabase.from("customers").select("*").order("name"),
    supabase.from("invoices").select("*").order("created_at", { ascending: false }),
    supabase.from("payments").select("*"),
    supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
    supabase.from("invoice_items").select("*").order("created_at"),
    supabase.from("suppliers").select("*").order("name"),
    supabase.from("purchases").select("*").order("created_at", { ascending: false }),
    supabase.from("purchase_items").select("*").order("created_at"),
    supabase.from("supplier_payments").select("*"),
    supabase.from("stock_items").select("*").order("name"),
  ]);
  cache = {
    customers: (c.data ?? []).map((r: any) => ({
      id: r.id, code: r.code ?? null, name: r.name, phone: r.phone, rating: r.rating,
      status: r.status as CustomerStatus, customerType: (r.customer_type ?? 'installment') as CustomerType,
      notes: r.notes, frozen: r.frozen,
      address: r.address, joiningDate: r.joining_date,
      creditLimit: Number(r.credit_limit ?? 0), dueDay: r.due_day ?? 1,
      openingBalance: Number(r.opening_balance ?? 0),
      ledgerNo: r.ledger_no ?? null,
      createdAt: r.created_at,
    })),
    invoices: (i.data ?? []).map((r: any) => ({
      id: r.id, customerId: r.customer_id, total: Number(r.total),
      discountAmount: Number(r.discount_amount ?? 0), discountPercent: Number(r.discount_percent ?? 0),
      downPayment: Number(r.down_payment), monthlyInstallment: Number(r.monthly_installment),
      firstDueDate: r.first_due_date, paid: Number(r.paid), notes: r.notes, createdAt: r.created_at,
    })),
    payments: (p.data ?? []).map((r: any) => ({
      id: r.id, invoiceId: r.invoice_id, amount: Number(r.amount), paidAt: r.paid_at,
    })),
    expenses: (e.data ?? []).map((r: any) => ({
      id: r.id, amount: Number(r.amount), category: r.category as ExpenseCategory,
      expenseDate: r.expense_date, notes: r.notes, createdAt: r.created_at,
    })),
    invoiceItems: (ii.data ?? []).map((r: any) => ({
      id: r.id, invoiceId: r.invoice_id, name: r.name,
      cost: Number(r.cost ?? 0), price: Number(r.price ?? 0), createdAt: r.created_at,
    })),
    suppliers: (s.data ?? []).map((r: any) => ({
      id: r.id, code: r.code ?? null, name: r.name, contact: r.contact ?? "", notes: r.notes,
      openingBalance: Number(r.opening_balance ?? 0),
      joiningDate: r.joining_date ?? String(r.created_at).slice(0, 10),
      createdAt: r.created_at,
    })),
    purchases: (pu.data ?? []).map((r: any) => ({
      id: r.id, supplierId: r.supplier_id, total: Number(r.total),
      paymentType: r.payment_type as PurchasePaymentType,
      purchaseDate: r.purchase_date, notes: r.notes, createdAt: r.created_at,
    })),
    purchaseItems: (pi.data ?? []).map((r: any) => ({
      id: r.id, purchaseId: r.purchase_id, name: r.name,
      unitCost: Number(r.unit_cost ?? 0), quantity: Number(r.quantity ?? 1), createdAt: r.created_at,
    })),
    supplierPayments: (sp.data ?? []).map((r: any) => ({
      id: r.id, supplierId: r.supplier_id, amount: Number(r.amount), paidAt: r.paid_at,
    })),
    stockItems: (st.data ?? []).map((r: any) => ({
      id: r.id, name: r.name,
      size: r.size ?? null,
      quantity: Number(r.quantity ?? 0),
      lastUnitCost: Number(r.last_unit_cost ?? 0),
      salePrice: Number(r.sale_price ?? 0),
      barcode: r.barcode ?? null,
      minQuantity: r.min_quantity ?? null,
      customBarcode: r.custom_barcode ?? null,
      category: r.category ?? "other",
      location: r.location ?? "shop",
      season: r.season ?? "general",
      createdAt: r.created_at, updatedAt: r.updated_at,
    })),
  };
  loading = false;
  loaded = true;
  notify();
  if (user) {
    await ensureCustomerCodes();
    await redisSet(userCacheKey(user.id), JSON.stringify(cache));
  }
}

/** تعيين كود تلقائي (C-xxxx) لأي عميل قديم ما زال بدون كود، بترتيب تاريخ الإنشاء. */
async function ensureCustomerCodes() {
  const missing = cache.customers.filter((c) => !c.code || c.code.trim() === "");
  if (missing.length === 0) return;
  const re = /^C-(\d+)$/;
  const max = cache.customers.reduce((mx, c) => {
    const m = c.code ? re.exec(c.code) : null;
    return m ? Math.max(mx, parseInt(m[1], 10)) : mx;
  }, 0);
  const sorted = [...missing].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  let n = max;
  for (const c of sorted) {
    n += 1;
    const code = `C-${String(n).padStart(4, "0")}`;
    await supabase.from("customers").update({ code }).eq("id", c.id);
    const target = cache.customers.find((x) => x.id === c.id);
    if (target) target.code = code;
  }
  notify();
}

export function useDB(): DBState {
  const [, setTick] = useState(0);
  const refresh = useCallback(async () => { await fetchAllFromServer(); }, []);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    if (!loaded) hydrate();
    return () => { listeners.delete(l); };
  }, []);
  return { ...cache, loading, refresh };
}

async function uid() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

// Recalculate invoice.paid = sum(payments.amount) + downPayment baseline.
// downPayment is stored on the invoice and was historically added to paid at creation time,
// so total paid = downPayment (already counted) + sum of subsequent payment rows.
async function recomputeInvoicePaid(invoiceId: string) {
  const { data: inv } = await supabase.from("invoices").select("down_payment,total").eq("id", invoiceId).single();
  const { data: pays } = await supabase.from("payments").select("amount").eq("invoice_id", invoiceId);
  const sumPays = (pays ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const down = Number(inv?.down_payment ?? 0);
  const total = Number(inv?.total ?? 0);
  const newPaid = Math.min(total, down + sumPays);
  await supabase.from("invoices").update({ paid: newPaid }).eq("id", invoiceId);
}

/**
 * Data-layer business rules for creating an invoice.
 * Mirrors (and backs up) the checks done in the UI form so no path can bypass them.
 */
async function assertInvoiceAllowed(inv: {
  customerId: string; total: number; downPayment: number; monthlyInstallment: number; paid?: number;
}) {
  const { data: c, error } = await supabase
    .from("customers")
    .select("id,name,frozen,status,credit_limit,opening_balance,customer_type")
    .eq("id", inv.customerId)
    .maybeSingle();
  if (error) throw error;
  if (!c) throw new Error("العميل غير موجود");
  if (c.frozen) throw new Error(`العميل «${c.name}» مجمّد — لا يمكن فتح فاتورة جديدة قبل تسوية حسابه`);
  if (c.status === "defaulter") throw new Error(`العميل «${c.name}» مماطل — لا يمكن فتح فاتورة جديدة قبل تسوية حسابه`);

  const paid = inv.paid ?? inv.downPayment;
  const remaining = Math.max(0, Number(inv.total) - Number(paid));

  // A cash customer may only have fully-paid invoices.
  if (c.customer_type === "cash" && (remaining > 0 || Number(inv.monthlyInstallment) > 0)) {
    throw new Error(`«${c.name}» عميل فوري (نقدي) — لازم تحصيل كامل المبلغ، أو غيّر نوع العميل لقسط أولًا`);
  }

  const limit = Number(c.credit_limit ?? 0);
  if (limit > 0 && remaining > 0) {
    const { data: invs } = await supabase
      .from("invoices").select("total,paid").eq("customer_id", inv.customerId);
    const openBalance = (invs ?? []).reduce((s: number, r: any) => s + (Number(r.total) - Number(r.paid)), 0)
      + Number(c.opening_balance ?? 0);
    if (openBalance + remaining > limit) {
      throw new Error(`تجاوز سقف المديونية: الحد ${Math.round(limit)} والمديونية بعد الفاتورة ${Math.round(openBalance + remaining)}`);
    }
  }
}

/** Adds quantities back to stock, matched by item name (used when reversing invoices/purchases). */
async function restoreStockByName(items: Array<{ name: string; quantity: number }>) {
  const user_id = await uid();
  const merged = new Map<string, number>();
  for (const it of items) {
    const name = (it.name || "").trim();
    if (!name || !it.quantity) continue;
    merged.set(name, (merged.get(name) ?? 0) + it.quantity);
  }
  for (const [name, qty] of merged) {
    const { data: existing } = await supabase
      .from("stock_items").select("id,quantity")
      .eq("user_id", user_id).eq("name", name).maybeSingle();
    if (!existing?.id) continue; // item no longer in stock catalogue — skip silently
    await supabase.from("stock_items")
      .update({ quantity: Math.max(0, Number(existing.quantity) + qty) })
      .eq("id", existing.id);
  }
}

export const db = {

  invalidate: fetchAll,
  async addCustomer(c: Omit<Customer, "id" | "createdAt">) {
    const user_id = await uid();
    const { error } = await supabase.from("customers").insert({
      user_id, code: c.code, name: c.name, phone: c.phone, rating: c.rating, status: c.status,
      customer_type: c.customerType ?? 'installment',
      notes: c.notes, frozen: c.frozen,
      address: c.address, joining_date: c.joiningDate,
      credit_limit: c.creditLimit, due_day: c.dueDay,
      opening_balance: c.openingBalance,
      ledger_no: c.ledgerNo,
    });
    if (error) throw error;
    await fetchAll();
  },
  async updateCustomer(id: string, patch: Partial<Customer>) {
    const upd: any = {};
    if (patch.code !== undefined) upd.code = patch.code;
    if (patch.name !== undefined) upd.name = patch.name;
    if (patch.phone !== undefined) upd.phone = patch.phone;
    if (patch.rating !== undefined) upd.rating = patch.rating;
    if (patch.status !== undefined) upd.status = patch.status;
    if (patch.customerType !== undefined) upd.customer_type = patch.customerType;
    if (patch.notes !== undefined) upd.notes = patch.notes;
    if (patch.frozen !== undefined) upd.frozen = patch.frozen;
    if (patch.address !== undefined) upd.address = patch.address;
    if (patch.joiningDate !== undefined) upd.joining_date = patch.joiningDate;
    if (patch.creditLimit !== undefined) upd.credit_limit = patch.creditLimit;
    if (patch.dueDay !== undefined) upd.due_day = patch.dueDay;
    if (patch.openingBalance !== undefined) upd.opening_balance = patch.openingBalance;
    if (patch.ledgerNo !== undefined) upd.ledger_no = patch.ledgerNo;
    if (patch.joiningDate !== undefined) upd.joining_date = patch.joiningDate;
    const { error } = await supabase.from("customers").update(upd).eq("id", id);
    if (error) throw error;
    await fetchAll();
  },
  async toggleFreezeCustomer(id: string, frozen: boolean) {
    await this.updateCustomer(id, { frozen });
    void logActivity("تعديل عميل", `تم ${frozen ? "حظر" : "إلغاء حظر"} العميل`).catch(() => undefined);
  },
  async removeCustomer(id: string) {
    await archiveBeforeDelete("customer", id);
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) throw error;
    await fetchAll();
  },
  async addInvoice(inv: {
    customerId: string; total: number; downPayment: number; monthlyInstallment: number;
    firstDueDate: string; paid?: number; notes: string | null;
    discountAmount?: number; discountPercent?: number;
    items?: Array<{ name: string; cost: number; price: number }>;
  }) {
    const user_id = await uid();
    await assertInvoiceAllowed(inv);

    const { data, error } = await supabase.from("invoices").insert({
      user_id, customer_id: inv.customerId, total: inv.total, down_payment: inv.downPayment,
      monthly_installment: inv.monthlyInstallment, first_due_date: inv.firstDueDate,
      discount_amount: inv.discountAmount ?? 0, discount_percent: inv.discountPercent ?? 0,
      paid: inv.paid ?? inv.downPayment, notes: inv.notes,
    }).select("id").single();
    if (error) throw error;
    if (inv.items && inv.items.length > 0 && data?.id) {
      const rows = inv.items.map((it) => ({
        user_id, invoice_id: data.id, name: it.name, cost: it.cost, price: it.price,
      }));
      const { error: e2 } = await supabase.from("invoice_items").insert(rows);
      if (e2) throw e2;
    }
    await fetchAll();
  },
  async addInvoiceItem(invoiceId: string, item: { name: string; cost: number; price: number }) {
    const user_id = await uid();
    const { error } = await supabase.from("invoice_items").insert({
      user_id, invoice_id: invoiceId, name: item.name, cost: item.cost, price: item.price,
    });
    if (error) throw error;
    await fetchAll();
  },
  async updateInvoiceItem(id: string, patch: Partial<{ name: string; cost: number; price: number }>) {
    const upd: any = {};
    if (patch.name !== undefined) upd.name = patch.name;
    if (patch.cost !== undefined) upd.cost = patch.cost;
    if (patch.price !== undefined) upd.price = patch.price;
    const { error } = await supabase.from("invoice_items").update(upd).eq("id", id);
    if (error) throw error;
    await fetchAll();
  },
  async removeInvoiceItem(id: string) {
    const { error } = await supabase.from("invoice_items").delete().eq("id", id);
    if (error) throw error;
    await fetchAll();
  },
  async removeInvoice(id: string) {
    // Return the sold units back to stock before deleting (items cascade-delete with the invoice).
    await archiveBeforeDelete("invoice", id);
    const { data: items } = await supabase
      .from("invoice_items").select("name").eq("invoice_id", id);
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) throw error;
    if (items && items.length > 0) {
      await restoreStockByName(items.map((it: any) => ({ name: it.name, quantity: 1 })));
    }
    await fetchAll();
  },

  async updateInvoice(id: string, patch: Partial<Pick<Invoice, "total" | "downPayment" | "monthlyInstallment" | "firstDueDate" | "notes" | "discountAmount" | "discountPercent">>) {
    const upd: any = {};
    if (patch.total !== undefined) upd.total = patch.total;
    if (patch.discountAmount !== undefined) upd.discount_amount = patch.discountAmount;
    if (patch.discountPercent !== undefined) upd.discount_percent = patch.discountPercent;
    if (patch.downPayment !== undefined) upd.down_payment = patch.downPayment;
    if (patch.monthlyInstallment !== undefined) upd.monthly_installment = patch.monthlyInstallment;
    if (patch.firstDueDate !== undefined) upd.first_due_date = patch.firstDueDate;
    if (patch.notes !== undefined) upd.notes = patch.notes;
    const { error } = await supabase.from("invoices").update(upd).eq("id", id);
    if (error) throw error;
    await recomputeInvoicePaid(id);
    await fetchAll();
  },
  async updatePayment(id: string, amount: number) {
    const { data: pay, error: e0 } = await supabase.from("payments").select("invoice_id").eq("id", id).single();
    if (e0) throw e0;
    const { error: e1 } = await supabase.from("payments").update({ amount }).eq("id", id);
    if (e1) throw e1;
    if (pay?.invoice_id) await recomputeInvoicePaid(pay.invoice_id);
    await fetchAll();
  },
  async removePayment(id: string) {
    const { data: pay, error: e0 } = await supabase.from("payments").select("invoice_id").eq("id", id).single();
    if (e0) throw e0;
    const { error: e1 } = await supabase.from("payments").delete().eq("id", id);
    if (e1) throw e1;
    if (pay?.invoice_id) await recomputeInvoicePaid(pay.invoice_id);
    await fetchAll();
  },
  async recordPayment(invoiceId: string, amount: number) {
    const user_id = await uid();
    const inv = cache.invoices.find((i) => i.id === invoiceId);
    if (!inv) throw new Error("Invoice not found");
    const newPaid = Math.min(inv.total, inv.paid + amount);
    const { error: e1 } = await supabase.from("payments").insert({
      user_id, invoice_id: invoiceId, amount,
    });
    if (e1) throw e1;
    const { error: e2 } = await supabase.from("invoices").update({ paid: newPaid }).eq("id", invoiceId);
    if (e2) throw e2;
    await fetchAll();
  },
  async addExpense(exp: Omit<Expense, "id" | "createdAt">) {
    const user_id = await uid();
    const { error } = await supabase.from("expenses").insert({
      user_id, amount: exp.amount, category: exp.category,
      expense_date: exp.expenseDate, notes: exp.notes,
    });
    if (error) throw error;
    await fetchAll();
  },
  async updateExpense(id: string, patch: Partial<Omit<Expense, "id" | "createdAt">>) {
    const upd: any = {};
    if (patch.amount !== undefined) upd.amount = patch.amount;
    if (patch.category !== undefined) upd.category = patch.category;
    if (patch.expenseDate !== undefined) upd.expense_date = patch.expenseDate;
    if (patch.notes !== undefined) upd.notes = patch.notes;
    const { error } = await supabase.from("expenses").update(upd).eq("id", id);
    if (error) throw error;
    await fetchAll();
  },
  async removeExpense(id: string) {
    await archiveBeforeDelete("expense", id);
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) throw error;
    await fetchAll();
  },

  // ---------- Suppliers ----------
  async addSupplier(s: Omit<Supplier, "id" | "createdAt">) {
    const user_id = await uid();
    const { error } = await supabase.from("suppliers").insert({
      user_id, code: s.code, name: s.name, contact: s.contact, notes: s.notes,
      opening_balance: s.openingBalance, joining_date: s.joiningDate,
    });
    if (error) throw error;
    await fetchAll();
  },
  async updateSupplier(id: string, patch: Partial<Omit<Supplier, "id" | "createdAt">>) {
    const upd: any = {};
    if (patch.code !== undefined) upd.code = patch.code;
    if (patch.name !== undefined) upd.name = patch.name;
    if (patch.contact !== undefined) upd.contact = patch.contact;
    if (patch.notes !== undefined) upd.notes = patch.notes;
    if (patch.openingBalance !== undefined) upd.opening_balance = patch.openingBalance;
    if (patch.joiningDate !== undefined) upd.joining_date = patch.joiningDate;
    const { error } = await supabase.from("suppliers").update(upd).eq("id", id);
    if (error) throw error;
    await fetchAll();
  },
  async removeSupplier(id: string) {
    await archiveBeforeDelete("supplier", id);
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) throw error;
    await fetchAll();
  },
  async addPurchase(
    p: Omit<Purchase, "id" | "createdAt"> & { items: Array<{ name: string; unitCost: number; quantity: number }> }
  ) {
    const user_id = await uid();
    const { data, error } = await supabase.from("purchases").insert({
      user_id, supplier_id: p.supplierId, total: p.total,
      payment_type: p.paymentType, purchase_date: p.purchaseDate, notes: p.notes,
    }).select("id").single();
    if (error) throw error;
    const purchaseId = data?.id as string | undefined;
    if (purchaseId && p.items.length > 0) {
      const rows = p.items.map((it) => ({
        user_id, purchase_id: purchaseId, name: it.name,
        unit_cost: it.unitCost, quantity: it.quantity,
      }));
      const { error: e2 } = await supabase.from("purchase_items").insert(rows);
      if (e2) throw e2;
    }
    // NOTE: Cash purchases are NOT inserted into the expenses table to avoid
    // double-counting. The Dashboard reads cash purchases directly from the
    // purchases table and subtracts them from net profit separately.
    await fetchAll();
  },
  async removePurchase(id: string) {
    // Reverse the stock that was added by this purchase.
    const { data: items } = await supabase
      .from("purchase_items").select("name,quantity").eq("purchase_id", id);
    const { error } = await supabase.from("purchases").delete().eq("id", id);
    if (error) throw error;
    if (items && items.length > 0) {
      await restoreStockByName(items.map((it: any) => ({ name: it.name, quantity: -Number(it.quantity || 0) })));
    }
    await fetchAll();
  },
  /**
   * Edit an existing purchase invoice: header fields + line items.
   * Items are replaced wholesale. Stock levels are NOT auto-adjusted here —
   * use the stock page for reconciliation (the UI warns about this).
   */
  async updatePurchase(
    id: string,
    p: {
      supplierId: string; total: number; paymentType: PurchasePaymentType;
      purchaseDate: string; notes: string | null;
      items: Array<{ name: string; unitCost: number; quantity: number }>;
    },
  ) {
    const user_id = await uid();
    const { error } = await supabase.from("purchases").update({
      supplier_id: p.supplierId, total: p.total, payment_type: p.paymentType,
      purchase_date: p.purchaseDate, notes: p.notes,
    }).eq("id", id);
    if (error) throw error;
    const { error: eDel } = await supabase.from("purchase_items").delete().eq("purchase_id", id);
    if (eDel) throw eDel;
    if (p.items.length > 0) {
      const rows = p.items.map((it) => ({
        user_id, purchase_id: id, name: it.name,
        unit_cost: it.unitCost, quantity: it.quantity,
      }));
      const { error: e2 } = await supabase.from("purchase_items").insert(rows);
      if (e2) throw e2;
    }
    await fetchAll();
  },


  async upsertStockDeltas(items: Array<{ name: string; quantity: number; unitCost: number; barcode?: string | null }>) {
    const user_id = await uid();
    for (const it of items) {
      const name = it.name.trim();
      if (!name || it.quantity <= 0) continue;
      let existing: { id: string; quantity: number } | null = null;
      if (it.barcode) {
        const { data } = await supabase
          .from("stock_items")
          .select("id,quantity")
          .eq("user_id", user_id)
          .eq("barcode", it.barcode)
          .maybeSingle();
        existing = data;
      }
      if (!existing) {
        const { data } = await supabase
          .from("stock_items")
          .select("id,quantity")
          .eq("user_id", user_id)
          .eq("name", name)
          .maybeSingle();
        existing = data;
      }
      if (existing?.id) {
        const upd: { quantity: number; last_unit_cost: number; barcode?: string } = {
          quantity: Number(existing.quantity) + it.quantity,
          last_unit_cost: it.unitCost,
        };
        if (it.barcode) upd.barcode = it.barcode;
        await supabase.from("stock_items")
          .update(upd)
          .eq("id", existing.id);
      } else {
        await supabase.from("stock_items").insert({
          user_id, name, quantity: it.quantity, last_unit_cost: it.unitCost,
          barcode: it.barcode || null,
        });
      }
    }
  },
  async deductStock(items: Array<{ stockId: string; quantity: number }>) {
    for (const it of items) {
      if (!it.stockId || it.quantity <= 0) continue;
      const { data: existing } = await supabase
        .from("stock_items")
        .select("quantity")
        .eq("id", it.stockId)
        .maybeSingle();
      const current = Number(existing?.quantity ?? 0);
      const next = Math.max(0, current - it.quantity);
      await supabase.from("stock_items")
        .update({ quantity: next })
        .eq("id", it.stockId);
    }
  },
  async recordSupplierPayment(supplierId: string, amount: number) {
    const user_id = await uid();
    const { error } = await supabase.from("supplier_payments").insert({
      user_id, supplier_id: supplierId, amount,
    });
    if (error) throw error;
    await fetchAll();
  },
  async updateSupplierPayment(id: string, amount: number) {
    if (!(amount > 0)) throw new Error("أدخل مبلغ صحيح");
    const { error } = await supabase.from("supplier_payments").update({ amount }).eq("id", id);
    if (error) throw error;
    await fetchAll();
  },
  async removeSupplierPayment(id: string) {
    const { error } = await supabase.from("supplier_payments").delete().eq("id", id);
    if (error) throw error;
    await fetchAll();
  },

  async updateStockItem(
    id: string,
    patch: Partial<{ name: string; size: string | null; quantity: number; lastUnitCost: number; salePrice: number; barcode: string | null; category: string; minQuantity?: number | null; customBarcode?: string | null; location?: "shop" | "warehouse"; season?: "summer" | "winter" | "general" }>,
    adjustment?: { delta: number; reason: string; notes?: string },
  ) {
    const upd: any = {};
    if (patch.name !== undefined) upd.name = patch.name;
    if (patch.size !== undefined) upd.size = patch.size || null;
    if (patch.quantity !== undefined) upd.quantity = patch.quantity;
    if (patch.lastUnitCost !== undefined) upd.last_unit_cost = patch.lastUnitCost;
    if (patch.salePrice !== undefined) upd.sale_price = patch.salePrice;
    if (patch.barcode !== undefined) upd.barcode = patch.barcode || null;
    if (patch.minQuantity !== undefined) upd.min_quantity = patch.minQuantity;
    if (patch.customBarcode !== undefined) upd.custom_barcode = patch.customBarcode || null;
    if (patch.category !== undefined) upd.category = patch.category;
    if (patch.location !== undefined) upd.location = patch.location;
    if (patch.season !== undefined) upd.season = patch.season;
    const hasLocationSeason = patch.location !== undefined || patch.season !== undefined;
    let { error } = await supabase.from("stock_items").update(upd).eq("id", id);
    if (error && hasLocationSeason && /column .*\.(location|season).* does not exist/i.test(error.message)) {
      // Column missing in the database — migration not applied. Surface it clearly
      // instead of silently succeeding (the old fallback showed a false success toast).
      throw new Error("ميزة المخزن تحتاج تحديث قاعدة البيانات: أعد تفعيل النشر من Lovable لتطبيق الـ migration، أو أضف عمودي location وseason لجدول stock_items");
    } else if (error) {
      throw error;
    }
    if (adjustment && adjustment.delta !== 0) {
      const user_id = await uid();
      await supabase.from("stock_adjustments").insert({
        user_id, stock_item_id: id, delta: adjustment.delta,
        reason: adjustment.reason, notes: adjustment.notes ?? null,
      });
    }
    await fetchAll();
  },
  async removeStockItem(id: string) {
    await archiveBeforeDelete("stock_item", id);
    const { error } = await supabase.from("stock_items").delete().eq("id", id);
    if (error) throw error;
    await fetchAll();
  },
  /** Manual stock reconciliation: applies a signed delta and logs it in stock_adjustments. */
  async adjustStock(id: string, delta: number, reason: string, notes?: string) {
    if (!delta) throw new Error("أدخل كمية التعديل");
    const user_id = await uid();
    const { data: existing, error: e0 } = await supabase
      .from("stock_items").select("quantity").eq("id", id).single();
    if (e0) throw e0;
    const next = Math.max(0, Number(existing?.quantity ?? 0) + delta);
    const applied = next - Number(existing?.quantity ?? 0);
    const { error: e1 } = await supabase.from("stock_items").update({ quantity: next }).eq("id", id);
    if (e1) throw e1;
    const { error: e2 } = await supabase.from("stock_adjustments").insert({
      user_id, stock_item_id: id, delta: applied, reason, notes: notes?.trim() || null,
    });
    if (e2) throw e2;
    await fetchAll();
    return next;
  },
  async addStockItem(item: { name: string; size?: string | null; quantity?: number; lastUnitCost?: number; salePrice?: number; barcode?: string | null; category?: string; minQuantity?: number | null; customBarcode?: string | null; location?: "shop" | "warehouse"; season?: "summer" | "winter" | "general" }) {
    const user_id = await uid();
    const payload: any = {
      user_id,
      name: item.name,
      size: item.size ?? null,
      quantity: item.quantity ?? 0,
      last_unit_cost: item.lastUnitCost ?? 0,
      sale_price: item.salePrice ?? 0,
      barcode: item.barcode ?? null,
      category: item.category ?? "other",
      location: item.location ?? "shop",
      season: item.season ?? "general",
    };
    if (item.minQuantity !== undefined) payload.min_quantity = item.minQuantity;
    if (item.customBarcode !== undefined) payload.custom_barcode = item.customBarcode ?? null;

    // Try inserting with new fields; if the DB doesn't have the columns, retry without them (compatibility)
    let data: any = null;
    let error: any = null;
    try {
      const res = await supabase.from("stock_items").insert(payload).select("id").single();
      data = res.data; error = res.error;
    } catch (e) { error = e; }
    if (error) {
      // Retry without optional fields if column not found (migration pending)
      const legacyPayload = { ...payload };
      delete legacyPayload.min_quantity;
      delete legacyPayload.custom_barcode;
      delete legacyPayload.location;
      delete legacyPayload.season;
      delete legacyPayload.size;
      const retry = await supabase.from("stock_items").insert(legacyPayload).select("id").single();
      if (retry.error) throw retry.error;
      data = retry.data;
    }
    await fetchAll();
    return data?.id as string | undefined;
  },
};

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "rent", label: "إيجار" },
  { value: "electricity", label: "كهرباء" },
  { value: "salaries", label: "رواتب" },
  { value: "transport", label: "نقل" },
  { value: "other", label: "أخرى" },
];

export function expenseCategoryLabel(c: ExpenseCategory): string {
  return EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

// --- helpers ---
export function supplierBalance(
  purchases: Purchase[],
  payments: SupplierPayment[],
  supplierId: string,
  openingBalance = 0,
) {
  const credit = purchases
    .filter((p) => p.supplierId === supplierId && p.paymentType === "credit")
    .reduce((s, p) => s + p.total, 0);
  const paid = payments
    .filter((p) => p.supplierId === supplierId)
    .reduce((s, p) => s + p.amount, 0);
  return openingBalance + credit - paid;
}

export function customerBalance(invoices: Invoice[], customerId: string, openingBalance = 0) {
  return openingBalance + invoices.filter((i) => i.customerId === customerId).reduce((s, i) => s + (i.total - i.paid), 0);
}

export interface CustomerRiskAnalysis {
  level: "high" | "medium" | "low";
  score: number;
  recommendBlock: boolean;
  reasons: string[];
}

export function analyzeCustomerRisk(c: Customer, invoices: Invoice[]): CustomerRiskAnalysis {
  const mine = invoices.filter((i) => i.customerId === c.id);
  const totalCharged = mine.reduce((s, i) => s + i.total, 0) + (c.openingBalance || 0);
  const totalPaid = mine.reduce((s, i) => s + i.paid, 0);
  const balance = Math.max(0, totalCharged - totalPaid);
  const worstLate = Math.max(0, ...mine.map(daysLate));
  const paidPct = totalCharged > 0 ? Math.min(100, Math.round((totalPaid / totalCharged) * 100)) : 0;
  const isOverLimit = c.creditLimit > 0 && balance >= c.creditLimit;

  const reasons: string[] = [];
  let riskPoints = 0;

  if (worstLate > 30) {
    riskPoints += 45;
    reasons.push(`تأخر عن سداد الأقساط لمدة طويلة (${worstLate} يوماً)`);
  } else if (worstLate > 14) {
    riskPoints += 25;
    reasons.push(`تأخر في السداد لمدة (${worstLate} يوماً)`);
  }

  if (c.customerType === "installment" && balance > 0) {
    if (paidPct < 25 && totalCharged > 500) {
      riskPoints += 35;
      reasons.push(`نسبة سداد ضعيفة جداً (${paidPct}% فقط من إجمالي المستحقات)`);
    } else if (paidPct < 50 && worstLate > 7) {
      riskPoints += 20;
      reasons.push(`نسبة المسدد أقل من 50% مع وجود تأخير سداد`);
    }
  }

  if (isOverLimit) {
    riskPoints += 30;
    reasons.push(`تجاوز سقف المديونية المسموح بها (${fmt(c.creditLimit)} ج.م)`);
  }

  if (c.status === "defaulter") {
    riskPoints += 25;
    reasons.push(`مصنف كعميل مماطل في السجل`);
  }
  if (c.rating <= 2) {
    riskPoints += 15;
    reasons.push(`تقييم الأمانة والالتزام منخفض (★${c.rating})`);
  }

  const score = Math.min(100, riskPoints);
  const recommendBlock = score >= 50 || worstLate > 30 || (c.status === "defaulter" && balance > 0);
  const level: "high" | "medium" | "low" = score >= 50 ? "high" : score >= 25 ? "medium" : "low";

  return { level, score, recommendBlock, reasons };
}

export function daysLate(inv: Invoice) {
  if (inv.paid >= inv.total) return 0;
  const diff = Math.floor((Date.now() - new Date(inv.firstDueDate).getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}

export function fmt(n: number) {
  return new Intl.NumberFormat("ar-EG").format(Math.round(n));
}

/** عدد أيام التذكير المُبكِّر المضبوط في الإعدادات. */
export function reminderDaysBefore() {
  return shopCache?.reminderDaysBefore ?? EMPTY_SHOP_SETTINGS.reminderDaysBefore;
}

/**
 * فاتورة تستحق التنبيه: متأخرة، مستحقة اليوم، أو قرب موعدها خلال
 * «عدد أيام التذكير» المضبوط في الإعدادات.
 */
export function isDueSoonOrOverdue(
  inv: { firstDueDate: string; paid: number; total: number },
  daysBefore = reminderDaysBefore(),
) {
  if (inv.paid >= inv.total) return false;
  const due = new Date(inv.firstDueDate); due.setHours(0, 0, 0, 0);
  const limit = new Date(); limit.setHours(0, 0, 0, 0);
  limit.setDate(limit.getDate() + Math.max(0, daysBefore));
  return due.getTime() <= limit.getTime();
}

/** عدد الأيام المتبقية حتى الاستحقاق (0 = اليوم، سالب = متأخر). */
export function daysUntilDue(inv: { firstDueDate: string }) {
  const due = new Date(inv.firstDueDate); due.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

/** توليد كود تلقائي متسلسل (مثل C-0001 أو S-0001) حسب الأكواد الموجودة. */
export function nextEntityCode(entities: Array<{ code: string | null }>, prefix: string): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = entities.reduce((mx, e) => {
    const m = re.exec(e.code ?? "");
    return m ? Math.max(mx, parseInt(m[1], 10)) : mx;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

/**
 * رقم الفاتورة المعروض/المطبوع = بادئة الإعدادات + مسلسل حسب ترتيب الإنشاء.
 * لو مفيش بادئة بنستخدم «#» علشان الشكل يفضل متسق.
 */
export function invoiceNumber(invoices: Invoice[], invoiceId: string, prefix = shopCache?.invoicePrefix ?? "") {
  const ordered = [...invoices].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const idx = ordered.findIndex((i) => i.id === invoiceId);
  const serial = String(idx >= 0 ? idx + 1 : ordered.length + 1).padStart(4, "0");
  const p = (prefix || "").trim();
  return p ? `${p}-${serial}` : `#${serial}`;
}

export const LOW_STOCK_THRESHOLD = 5;

/** Threshold actually in use (from shop settings, falling back to the default). */
export function lowStockThreshold() {
  return shopCache?.lowStockThreshold ?? LOW_STOCK_THRESHOLD;
}

export function lowStockCount(items: StockItem[], threshold = lowStockThreshold()) {
  return items.filter((it) => it.quantity < threshold).length;
}


export function findStockByBarcode(items: StockItem[], code: string): StockItem | undefined {
  const c = code.trim();
  if (!c) return undefined;
  return items.find((it) => (it.barcode ?? "").trim() === c);
}

export interface StockHistoryEntry {
  id: string;
  date: string;
  type: "purchase" | "sale" | "adjustment";
  qty: number; // positive = added, negative = removed
  reason?: string;
  notes?: string | null;
  ref?: string;
}

export async function fetchStockHistory(stockItemId: string, name: string): Promise<StockHistoryEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const [pi, ii, adj] = await Promise.all([
    supabase.from("purchase_items").select("id,name,quantity,created_at,purchase_id").eq("user_id", user.id).eq("name", name),
    supabase.from("invoice_items").select("id,name,created_at,invoice_id").eq("user_id", user.id).eq("name", name),
    supabase.from("stock_adjustments").select("id,delta,reason,notes,created_at").eq("user_id", user.id).eq("stock_item_id", stockItemId),
  ]);
  const out: StockHistoryEntry[] = [];
  for (const r of (pi.data ?? [])) {
    out.push({ id: `p-${r.id}`, date: r.created_at, type: "purchase", qty: Number(r.quantity ?? 0), ref: "فاتورة شراء" });
  }
  for (const r of (ii.data ?? [])) {
    out.push({ id: `i-${r.id}`, date: r.created_at, type: "sale", qty: -1, ref: "فاتورة بيع" });
  }
  for (const r of (adj.data ?? [])) {
    out.push({ id: `a-${r.id}`, date: r.created_at, type: "adjustment", qty: Number(r.delta ?? 0), reason: r.reason, notes: r.notes });
  }
  return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export type AITone = "auto" | "friendly" | "formal";

export function aiScript(c: Customer, balance: number, lateDays: number, tone: AITone = "auto"): string {
  const months = Math.max(1, Math.floor(Math.max(lateDays, 30) / 30));
  // رسمية
  if (tone === "formal") {
    if (c.status === "defaulter" || lateDays > 30)
      return `السيد/ ${c.name} المحترم،\nنحيطكم علماً بأن حسابكم لدينا متأخر السداد منذ ${months} شهر، وقد بلغ الرصيد المستحق عليكم مبلغ ${fmt(balance)} ج.م.\nنمنحكم مهلة نهائية للسداد خلال (7) أيام من تاريخه، وفي حال عدم الاستجابة سنضطر آسفين لاتخاذ كافة الإجراءات القانونية اللازمة لاسترداد حقوقنا، وتحميلكم كافة المصاريف القضائية.\nنأمل المبادرة بالسداد تجنباً للإجراءات.\nوتفضلوا بقبول وافر الاحترام.`;
    if (c.status === "committed")
      return `السيد/ ${c.name} المحترم،\nيتشرف المحل بشكر التزامكم المميز في السداد، ويخصّكم بعرض مميز بخصم 10% على مشترياتكم القادمة مع رفع السقف الائتماني.\nالعرض ساري لمدة أسبوع.\nوتفضلوا بقبول وافر الاحترام.`;
    if (lateDays <= 0)
      return `السيد/ ${c.name} المحترم،\nيسعدنا إعلامكم أن حسابكم مسدّد بالكامل دون أي تأخير، ونحن جاهزون لخدمتكم في أي وقت.\nوتفضلوا بقبول وافر الاحترام.`;
    if (lateDays < 7)
      return `السيد/ ${c.name} المحترم،\nتذكير ودي بأنه تبقى عليكم مبلغ ${fmt(balance)} ج.م. ونشكركم على تعاونكم.\nوتفضلوا بقبول وافر الاحترام.`;
    return `السيد/ ${c.name} المحترم،\nنحيطكم علماً بتأخر سداد مبلغ ${fmt(balance)} ج.م. منذ ${lateDays} يوم، ونأمل سرعة تسوية الحساب في أقرب وقت.\nوتفضلوا بقبول وافر الاحترام.`;
  }
  // ودية
  if (tone === "friendly") {
    if (c.status === "defaulter" || lateDays > 30)
      return `يا أستاذ ${c.name}، في موضوع مهم ومحتاجين نخلصه مع بعض 🤝\nعليك متبقي ${fmt(balance)} ج.م. متأخرة من فترة، ياريت تشرفنا في المحل الأسبوع ده عشان نقفل حسابك وكلنا نرتاح.\nولو عندك أي ظرف احكيلنا، إحنا تحت أمرك.`;
    if (c.status === "committed")
      return `يا أستاذ ${c.name}، تحية طيبة 🌿\nبنشكرك على التزامك الدائم في السداد، وده اللي خلانا نخصّك بعرض مميز:\n🎁 خصم 10% على مشترياتك الجاية، وسقف ائتماني أعلى من غير مقدم.\nالعرض ساري لمدة أسبوع. تحت أمرك في أي وقت.`;
    if (lateDays <= 0)
      return `يا أستاذ ${c.name}، تحية طيبة. حسابك تمام معانا، وأي وقت محتاج بضاعة جديدة إحنا تحت أمرك.`;
    if (lateDays < 7)
      return `يا أستاذ ${c.name}، تذكير بسيط وعلى راحتك: عليك متبقي ${fmt(balance)} ج.م. لو فيه أي استفسار إحنا تحت أمرك.`;
    return `يا أستاذ ${c.name}، بقالك ${lateDays} يوم متأخر على القسط. محتاجين نشرفنا في المحل لتحديث الحساب. المتبقي: ${fmt(balance)} ج.م.`;
  }
  // تلقائية — حسب حالة العميل ودرجة التأخر
  if (c.status === "defaulter") {
    return `يا أستاذ ${c.name}، بنلفت نظرك إن حسابك متوقف ومتأخر السداد من ${months} شهر، والمتبقي عليك ${fmt(balance)} ج.م.\nدي رسالة جادة: عندك مهلة 7 أيام للسداد، ولو حسابك اتمشيش خلالها هنضطر للجوء لإجراءات استرداد حقنا. ياريت تبادر بالسداد عشان نوفر عليك أي مشكلة.`;
  }
  if (c.status === "committed") {
    return `يا أستاذ ${c.name}، تحية طيبة 🌿\nبنشكرك على التزامك الدائم في السداد، وده اللي خلانا نخصّك بعرض مميز:\n🎁 خصم 10% على مشترياتك الجاية، وسقف ائتماني أعلى من غير مقدم.\nالعرض ساري لمدة أسبوع. تحت أمرك في أي وقت.`;
  }
  // neutral / default tone scales with lateness
  if (lateDays <= 0)
    return `يا أستاذ ${c.name}، تحية طيبة. حسابك تمام معانا، وأي وقت محتاج بضاعة جديدة إحنا تحت أمرك.`;
  if (lateDays < 7)
    return `يا أستاذ ${c.name}، تذكير بسيط وعلى راحتك: عليك متبقي ${fmt(balance)} ج.م. لو فيه أي استفسار إحنا تحت أمرك.`;
  if (lateDays <= 30)
    return `يا أستاذ ${c.name}، بقالك ${lateDays} يوم متأخر على القسط. محتاجين نشرفنا في المحل لتحديث الحساب. المتبقي: ${fmt(balance)} ج.م.`;
  return `يا أستاذ ${c.name}، الحساب متوقف تماماً وبقالنا ${months} شهر من غير سداد. لازم الحساب يتقفل لتجنب الإجراءات القانونية. المتبقي: ${fmt(balance)} ج.م.`;
}

// ---------- Auth identity ----------
export type AuthProvider = "google" | "email" | "unknown";

export interface AuthIdentity {
  id: string;
  email?: string;
  /** Name from the identity provider (Google `full_name`/`name`), if any. */
  metaName: string | null;
  /** Avatar from the identity provider (Google `avatar_url`/`picture`), if any. */
  metaAvatar: string | null;
  provider: AuthProvider;
  /** All linked providers — a user can have both google and a password. */
  providers: string[];
  hasPassword: boolean;
  emailConfirmed: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
}

function toIdentity(u: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
  identities?: { provider: string }[] | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
}): AuthIdentity {
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof meta[k] === "string" && meta[k] ? (meta[k] as string) : null);
  const linked = (u.identities ?? []).map((i) => i.provider);
  const appProviders = Array.isArray((u.app_metadata as { providers?: unknown })?.providers)
    ? ((u.app_metadata as { providers?: string[] }).providers as string[])
    : [];
  const providers = Array.from(new Set([...linked, ...appProviders])).filter(Boolean);
  const primary = (u.app_metadata as { provider?: string })?.provider ?? providers[0] ?? "";
  return {
    id: u.id,
    email: u.email,
    metaName: str("full_name") ?? str("name") ?? str("display_name"),
    metaAvatar: str("avatar_url") ?? str("picture"),
    provider: primary === "google" ? "google" : primary === "email" ? "email" : "unknown",
    providers: providers.length ? providers : primary ? [primary] : [],
    hasPassword: providers.includes("email") || primary === "email",
    emailConfirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at),
    createdAt: u.created_at ?? null,
    lastSignInAt: u.last_sign_in_at ?? null,
  };
}

/**
 * Auth state hook.
 * Session events drive re-renders instantly, but the identity we render is
 * re-validated against the auth server with getUser() — getSession() alone only
 * reads the locally-stored token.
 */
export function useAuth() {
  const [user, setUser] = useState<AuthIdentity | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    const verify = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!alive) return;
      setUser(error || !data.user ? null : toIdentity(data.user));
      setReady(true);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!alive) return;
      // Optimistic paint from the session, then verify with the auth server.
      setUser(session?.user ? toIdentity(session.user) : null);
      setReady(true);
      if (session?.user) void verify();
      // Refresh data on auth change
      loaded = false;
      fetchAll();
    });

    void verify();

    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  return { user, ready };
}

// ---------- Profile (اسم العرض والصورة) ----------
export interface Profile {
  displayName: string;
  avatarUrl: string | null;
  phone: string;
}

const emptyProfile: Profile = { displayName: "", avatarUrl: null, phone: "" };

export function useProfile() {
  const { user, ready: authReady } = useAuth();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setProfile(emptyProfile); setLoading(false); return; }
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, phone")
      .eq("id", user.id)
      .maybeSingle();
    const displayName = (data?.display_name ?? "").trim() || user.metaName || user.email?.split("@")[0] || "";
    const avatarUrl = data?.avatar_url || user.metaAvatar || null;
    const phone = data?.phone ?? "";
    setProfile({ displayName, avatarUrl, phone });
    // Keep profiles in sync with the account identity so the team list shows real names/photos.
    const needsName = !(data?.display_name ?? "").trim() && !!displayName;
    const needsAvatar = !data?.avatar_url && !!user.metaAvatar;
    if (needsName || needsAvatar || !data) {
      void supabase.from("profiles").upsert({
        id: user.id,
        display_name: displayName,
        avatar_url: avatarUrl,
        phone,
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { if (authReady) void load(); }, [authReady, load]);

  const save = useCallback(async (patch: Partial<Profile>) => {
    if (!user) throw new Error("لازم تكون مسجل دخول");
    const next = { ...profile, ...patch };
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      display_name: next.displayName,
      avatar_url: next.avatarUrl,
      phone: next.phone,
    });
    if (error) throw error;
    setProfile(next);
  }, [user, profile]);

  // The name we actually show anywhere in the UI.
  const label = profile.displayName || user?.metaName || user?.email?.split("@")[0] || "";
  const avatar = profile.avatarUrl || user?.metaAvatar || null;

  return { profile, label, avatar, loading: loading || !authReady, save, reload: load, user, authReady };
}


// ---------- Shop settings (بيانات المحل) ----------
export type ThemeMode = "dark" | "light" | "system";
export type ColorTheme = "emerald" | "ocean" | "sapphire" | "violet" | "orchid" | "rose" | "amber" | "copper" | "lime" | "graphite";
export type PrintPaper = "a4" | "thermal";

export interface ShopSettings {
  shopName: string;
  phone: string;
  address: string;
  logoUrl: string | null;
  footerNote: string;
  currency: string;
  taxNumber: string;
  whatsapp: string;
  lowStockThreshold: number;
  defaultInstallmentMonths: number;
  defaultDueDay: number;
  invoicePrefix: string;
  printPaper: PrintPaper;
  printShowLogo: boolean;
  printShowTaxNumber: boolean;
  printShowFooterNote: boolean;
  colorTheme: ColorTheme;
  theme: ThemeMode;
  reminderDaysBefore: number;
  alertsEnabled: boolean;
}

export const EMPTY_SHOP_SETTINGS: ShopSettings = {
  shopName: "",
  phone: "",
  address: "",
  logoUrl: null,
  footerNote: "",
  currency: "ج.م",
  taxNumber: "",
  whatsapp: "",
  lowStockThreshold: 5,
  defaultInstallmentMonths: 6,
  defaultDueDay: 1,
  invoicePrefix: "",
  printPaper: "a4",
  printShowLogo: true,
  printShowTaxNumber: true,
  printShowFooterNote: true,
  colorTheme: "emerald",
  theme: "dark",
  reminderDaysBefore: 3,
  alertsEnabled: true,
};

let shopCache: ShopSettings | null = null;
const shopListeners = new Set<() => void>();

/** Synchronous read of the cached settings (safe defaults before first load). */
export function getShopSettings(): ShopSettings {
  return shopCache ?? EMPTY_SHOP_SETTINGS;
}

/** Currency symbol currently configured. */
export function currency() {
  return getShopSettings().currency || "ج.م";
}

/** Formats an amount with the configured currency, e.g. "1٬250 ج.م". */
export function money(n: number) {
  return `${fmt(n)} ${currency()}`;
}

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const COLOR_THEME_VALUES: ColorTheme[] = ["emerald", "ocean", "sapphire", "violet", "orchid", "rose", "amber", "copper", "lime", "graphite"];
const cachedColorTheme = (): ColorTheme | null => {
  try {
    const value = localStorage.getItem("segilly:color-theme");
    return COLOR_THEME_VALUES.includes(value as ColorTheme) ? value as ColorTheme : null;
  } catch { return null; }
};

const notifyShopSettings = () => shopListeners.forEach((listener) => listener());

export async function fetchShopSettings(): Promise<ShopSettings> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return EMPTY_SHOP_SETTINGS;
  const { data } = await supabase
    .from("shop_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  shopCache = row
    ? {
        shopName: (row.shop_name as string) ?? "",
        phone: (row.phone as string) ?? "",
        address: (row.address as string) ?? "",
        logoUrl: (row.logo_url as string | null) ?? null,
        footerNote: (row.footer_note as string) ?? "",
        currency: (row.currency as string) || "ج.م",
        taxNumber: (row.tax_number as string) ?? "",
        whatsapp: (row.whatsapp as string) ?? "",
        lowStockThreshold: num(row.low_stock_threshold, 5),
        defaultInstallmentMonths: num(row.default_installment_months, 6),
        defaultDueDay: num(row.default_due_day, 1),
        invoicePrefix: (row.invoice_prefix as string) ?? "",
        printPaper: ((row.print_paper as PrintPaper) ?? "a4"),
        printShowLogo: (row.print_show_logo as boolean) ?? true,
        printShowTaxNumber: (row.print_show_tax_number as boolean) ?? true,
        printShowFooterNote: (row.print_show_footer_note as boolean) ?? true,
        colorTheme: (row.color_theme as ColorTheme) ?? cachedColorTheme() ?? "emerald",
        theme: ((row.theme as ThemeMode) ?? "dark"),
        reminderDaysBefore: num(row.reminder_days_before, 3),
        alertsEnabled: (row.alerts_enabled as boolean) ?? true,
      }
    : EMPTY_SHOP_SETTINGS;
  notifyShopSettings();
  return shopCache;
}

export async function saveShopSettings(patch: ShopSettings) {
  const user_id = await uid();
  const payload = {
    user_id,
    shop_name: patch.shopName.trim(),
    phone: patch.phone.trim(),
    address: patch.address.trim(),
    logo_url: patch.logoUrl?.trim() || null,
    footer_note: patch.footerNote.trim(),
    currency: patch.currency.trim() || "ج.م",
    tax_number: patch.taxNumber.trim(),
    whatsapp: patch.whatsapp.trim(),
    low_stock_threshold: Math.max(0, Math.round(patch.lowStockThreshold)),
    default_installment_months: Math.max(1, Math.round(patch.defaultInstallmentMonths)),
    default_due_day: Math.min(28, Math.max(1, Math.round(patch.defaultDueDay))),
    invoice_prefix: patch.invoicePrefix.trim(),
    print_paper: patch.printPaper,
    print_show_logo: patch.printShowLogo,
    print_show_tax_number: patch.printShowTaxNumber,
    print_show_footer_note: patch.printShowFooterNote,
    color_theme: patch.colorTheme,
    theme: patch.theme,
    reminder_days_before: Math.min(30, Math.max(0, Math.round(patch.reminderDaysBefore))),
    alerts_enabled: patch.alertsEnabled,
  };
  const write = (values: Record<string, unknown>) => supabase.from("shop_settings").upsert(values as never, { onConflict: "user_id" });
  let { error } = await write(payload);
  let compatibilitySave = false;

  // Older Lovable/Supabase environments may not yet have the new display columns.
  // Save all established settings instead of blocking the whole settings page.
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    const { color_theme, print_show_logo, print_show_tax_number, print_show_footer_note, ...legacyPayload } = payload;
    const retry = await write(legacyPayload);
    error = retry.error;
    compatibilitySave = !error;
  }
  if (error) throw error;

  if (compatibilitySave) {
    try { localStorage.setItem("segilly:color-theme", patch.colorTheme); } catch { /* noop */ }
    shopCache = patch;
    notifyShopSettings();
    void logActivity("setting", "تم تحديث إعدادات المحل (محفوظة محليًا لبعض خيارات العرض)").catch(() => undefined);
    return;
  }
  await fetchShopSettings();
  void logActivity("setting", "تم تحديث إعدادات المحل").catch(() => undefined);
}


/** Reactive access to the shop identity used on printed documents. */
export function useShopSettings() {
  const [settings, setSettings] = useState<ShopSettings>(shopCache ?? EMPTY_SHOP_SETTINGS);
  const [loading, setLoading] = useState(shopCache === null);
  useEffect(() => {
    const l = () => setSettings(shopCache ?? EMPTY_SHOP_SETTINGS);
    shopListeners.add(l);
    if (shopCache === null) {
      fetchShopSettings().finally(() => setLoading(false));
    }
    return () => { shopListeners.delete(l); };
  }, []);
  return { settings, loading, reload: fetchShopSettings };
}
