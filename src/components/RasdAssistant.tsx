import { supabase } from "@/integrations/supabase/client";
import { analyzeCustomerRisk, fmt, isDueSoonOrOverdue, useDB, useShopSettings } from "@/lib/store";

export type NavTarget = { label: string; to: string };

export type Message = {
  role: "user" | "assistant";
  content: string;
  nav?: NavTarget;
};

export type Answer = { content: string; nav?: NavTarget };

export const WELCOME: Message = {
  role: "assistant",
  content: "أنا رَصْد، مساعد سِجلّي. أجاوبك عن بيانات محلك وطريقة استخدام التطبيق، وأوضح لك الخطوات بدقة. لن أغيّر أي بيانات من تلقاء نفسي.",
};

export const QUICK_QUESTIONS: string[] = [
  "ما أهم 3 نقاط في محلي الآن؟",
  "كم صافي الربح هذا الشهر؟",
  "إيه الأصناف الناقصة في المخزن؟",
  "مين أولويات المتابعة مع العملاء؟",
  "ازاي أسجّل فاتورة بيع جديدة؟",
];

export const RASD_ROUTE = "/rasd";

export function startsThisMonth(value: string, now = new Date()) {
  const date = new Date(value);
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function startsLastMonth(value: string, now = new Date()) {
  const date = new Date(value);
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return date.getFullYear() === last.getFullYear() && date.getMonth() === last.getMonth();
}

/** Useful answers while the optional cloud AI service is being deployed. */
export function localAnswer(question: string, data: ReturnType<typeof useDB>, settings: { lowStockThreshold: number; reminderDaysBefore: number }): Answer {
  const normalized = question.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").toLowerCase();
  const has = (...terms: string[]) => terms.some((term) => normalized.includes(term));
  const asksHow = has("ازاي", "كيف", "فين", "اين", "اضيف", "اضافة", "اعمل", "استخدم", "مكان", "طريق");
  const overdue = data.invoices
    .filter((invoice) => isDueSoonOrOverdue(invoice, settings.reminderDaysBefore))
    .map((invoice) => {
      const customer = data.customers.find((item) => item.id === invoice.customerId);
      const days = Math.max(0, Math.floor((Date.now() - new Date(invoice.firstDueDate).getTime()) / 86400000));
      return { invoice, customer, remaining: Math.max(0, invoice.total - invoice.paid), days };
    })
    .sort((a, b) => b.days - a.days || b.remaining - a.remaining);
  const lowStock = data.stockItems.filter((item) => item.quantity <= (item.minQuantity ?? settings.lowStockThreshold));
  const salesThisMonth = data.invoices.filter((item) => startsThisMonth(item.createdAt)).reduce((sum, item) => sum + item.total, 0);
  const collectionsThisMonth = data.payments.filter((item) => startsThisMonth(item.paidAt)).reduce((sum, item) => sum + item.amount, 0)
    + data.invoices.filter((item) => startsThisMonth(item.createdAt)).reduce((sum, item) => sum + item.downPayment, 0);

  // Product help: this makes Rasd useful for every feature even before cloud AI is enabled.
  if (asksHow && has("فاتور", "قسط", "دفع", "دفعة", "تحصيل")) {
    return { content: "لتسجيل بيع: افتح «الفواتير» ثم أضف فاتورة، واختر العميل وحدد الإجمالي والمقدم والقسط الشهري وموعد أول استحقاق. لتسجيل تحصيل لاحق، افتح الفاتورة أو استخدم «تسجيل دفعة» من زر الإجراءات السريعة. العميل النقدي يجب أن تكون فاتورته مسددة بالكامل.", nav: { label: "الفواتير", to: "/invoices" } };
  }
  if (asksHow && has("عميل", "عملا", "زبون")) {
    return { content: "من «العملاء» اضغط إضافة عميل، ثم اختر نوعه: قسط أو فوري نقدي. يمكنك تحديد سقف المديونية ويوم الاستحقاق والتقييم. لتجنب البيع لعميل متعثر، جمّده أو حدّث حالته من تفاصيله.", nav: { label: "العملاء", to: "/customers" } };
  }
  if (asksHow && has("منتج", "مخزون", "باركود", "صنف")) {
    return { content: "من «المنتجات» أضف الصنف وحدد الكمية وسعر الشراء والبيع والحد الأدنى والباركود إن وُجد. استخدم «المخزن» للبضاعة الموسمية أو المخزنة، واختر مكان الصنف وموسمه لتتابعه بشكل أدق.", nav: { label: "المنتجات", to: "/inventory" } };
  }
  if (asksHow && has("مورد", "شراء", "مشتري")) {
    return { content: "من «الموردين» أضف المورد أولًا، ثم سجّل فاتورة شراء بنقدي أو آجل. يمكنك متابعة الرصيد المتبقي وتسجيل دفعات المورد من نفس القسم.", nav: { label: "الموردين", to: "/suppliers" } };
  }
  if (asksHow && has("مصروف", "ايجار", "رواتب")) {
    return { content: "من «المصروفات» اضغط إضافة مصروف، ثم اختر البند والتاريخ والمبلغ وأي ملاحظة. يظهر تأثيره لاحقًا في التقارير وصافي الربح.", nav: { label: "المصروفات", to: "/expenses" } };
  }
  if (asksHow && has("تقرير", "اكسل", "pdf", "تصدير")) {
    return { content: "من «التقارير» اختر الفترة ثم راجع المبيعات والتحصيلات والمصروفات والربح وأفضل العملاء والأصناف. تستطيع تصدير التقرير إلى Excel أو PDF من أزرار التصدير.", nav: { label: "التقارير", to: "/reports" } };
  }
  if (asksHow && has("نسخ", "باك", "احتياطي", "ارشيف", "حذف")) {
    return { content: "قسم «الأرشيف» يحتفظ بالسجلات المحذوفة لتستعيدها حسب الصلاحية. ومن «الإعدادات» ثم تبويب البيانات تستطيع تصدير نسخة احتياطية أو استيرادها. راجع البيانات قبل المسح النهائي.", nav: { label: "الإعدادات", to: "/settings" } };
  }
  if (asksHow && has("صلاح", "فريق", "عضو", "مدير", "بايع")) {
    return { content: "من «الإعدادات» ثم «الفريق» يستطيع المالك دعوة أعضاء وتحديد دورهم: مالك أو مدير أو بايع. المالك فقط يغيّر الصلاحيات، ويُظهر التطبيق لكل دور الأقسام المسموح بها.", nav: { label: "الإعدادات", to: "/settings" } };
  }
  if (asksHow && has("تنبيه", "واتساب", "تذكير")) {
    return { content: "من «المنبه» ستجد الأقساط المستحقة والمتأخرة والأصناف الناقصة. يمكنك تسجيل دفعة مباشرة أو نسخ وإرسال رسالة واتساب مقترحة للعميل. عدد أيام التذكير يتغير من الإعدادات.", nav: { label: "المنبه", to: "/alerts" } };
  }
  if (has("تنبيه") || has("اهم", "النهارده")) {
    const parts = [
      overdue.length ? `${overdue.length} فاتورة مستحقة أو متأخرة` : "لا توجد أقساط مستحقة حاليًا",
      lowStock.length ? `${lowStock.length} صنف يحتاج متابعة في المخزون` : "المخزون فوق الحد الأدنى",
      `تحصيلات الشهر حتى الآن ${fmt(collectionsThisMonth)} ج.م`,
    ];
    return { content: `أهم 3 نقاط الآن:\n1. ${parts[0]}.\n2. ${parts[1]}.\n3. ${parts[2]}.`, nav: { label: "المنبه", to: "/alerts" } };
  }
  if (has("عميل", "عملا", "زبون") && has("متابع", "متاخر", "محتاج")) {
    if (!overdue.length) return { content: "لا يوجد عملاء لديهم أقساط مستحقة أو متأخرة حاليًا." };
    return { content: `الأولوية للمتابعة:\n${overdue.slice(0, 5).map((item, index) => `${index + 1}. ${item.customer?.name ?? "عميل"}: متبقي ${fmt(item.remaining)} ج.م${item.days ? ` ومتأخر ${item.days} يوم` : " ومستحق الآن"}.`).join("\n")}`, nav: { label: "العملاء", to: "/customers" } };
  }
  if (has("صنف", "مخزون", "ناقص")) {
    const totalUnits = data.stockItems.reduce((sum, item) => sum + item.quantity, 0);
    if (!lowStock.length) return { content: `المخزون حاليًا يحتوي على ${data.stockItems.length} صنفًا بإجمالي ${fmt(totalUnits)} وحدة. لا توجد أصناف وصلت للحد الأدنى المحدد في الإعدادات.` };
    return { content: `ملخص المخزون: ${data.stockItems.length} صنفًا بإجمالي ${fmt(totalUnits)} وحدة.\n\nالأصناف التي تحتاج إعادة طلب:\n${lowStock.slice(0, 8).map((item, index) => `${index + 1}. ${item.name}: المتاح ${fmt(item.quantity)}، والحد الأدنى ${fmt(item.minQuantity ?? settings.lowStockThreshold)}.`).join("\n")}`, nav: { label: "المنتجات", to: "/inventory" } };
  }
  if (has("حساب", "رصيد", "مديون", "مستحق")) {
    const totalDue = data.invoices.reduce((sum, item) => sum + Math.max(0, item.total - item.paid), 0);
    const customerDue = data.customers.reduce((sum, customer) => sum + customer.openingBalance, 0);
    const supplierDue = data.suppliers.reduce((sum, supplier) => sum + supplier.openingBalance, 0)
      + data.purchases.filter((purchase) => purchase.paymentType === "credit").reduce((sum, purchase) => sum + purchase.total, 0)
      - data.supplierPayments.reduce((sum, payment) => sum + payment.amount, 0);
    return { content: `ملخص الحسابات الحالية:\n• المستحق من العملاء: ${fmt(totalDue + customerDue)} ج.م\n• المستحق للموردين: ${fmt(Math.max(0, supplierDue))} ج.م\n• التحصيلات هذا الشهر: ${fmt(collectionsThisMonth)} ج.م\n• المبيعات هذا الشهر: ${fmt(salesThisMonth)} ج.م.` };
  }
  if (has("تحصيل", "مبيعات", "الشهر")) {
    return { content: `ملخص الشهر الحالي:\n• المبيعات: ${fmt(salesThisMonth)} ج.م\n• التحصيلات: ${fmt(collectionsThisMonth)} ج.م\n• إجمالي المديونيات المفتوحة: ${fmt(data.invoices.reduce((sum, item) => sum + Math.max(0, item.total - item.paid), 0))} ج.م.`, nav: { label: "الفواتير", to: "/invoices" } };
  }
  if (has("ربح", "بيتحسن", "مقارن")) {
    const profit = (isCurrent: (value: string) => boolean) => {
      const invoiceIds = new Set(data.invoices.filter((item) => isCurrent(item.createdAt)).map((item) => item.id));
      const gross = data.invoiceItems.filter((item) => invoiceIds.has(item.invoiceId)).reduce((sum, item) => sum + item.price - item.cost, 0);
      const expenses = data.expenses.filter((item) => isCurrent(item.expenseDate)).reduce((sum, item) => sum + item.amount, 0);
      return gross - expenses;
    };
    const current = profit((value) => startsThisMonth(value));
    const previous = profit((value) => startsLastMonth(value));
    const direction = current > previous ? "أفضل" : current < previous ? "أقل" : "مستقر";
    return { content: `صافي الربح المحسوب هذا الشهر ${fmt(current)} ج.م، وكان ${fmt(previous)} ج.م الشهر الماضي. الاتجاه الحالي ${direction}.`, nav: { label: "التقارير", to: "/reports" } };
  }
  if (has("واتساب", "رسالة")) {
    const target = data.customers.find((customer) => normalized.includes(customer.name.replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").toLowerCase()));
    if (!target) return { content: "اكتب اسم العميل مع طلب الرسالة، مثل: اكتب رسالة واتساب لطيفة للعميل أحمد." };
    const risk = analyzeCustomerRisk(target, data.invoices);
    const balance = data.invoices.filter((invoice) => invoice.customerId === target.id).reduce((sum, invoice) => sum + Math.max(0, invoice.total - invoice.paid), target.openingBalance);
    return { content: `أهلًا أستاذ/ة ${target.name}، نتمنى تكون بخير. حابين نفكّرك إن المتبقي على حسابك ${fmt(balance)} ج.م. يهمنا نرتب مع حضرتك موعد مناسب للسداد. شكرًا لتعاونك.\n\nملاحظة: مستوى المتابعة المقترح ${risk.level === "high" ? "عالي" : risk.level === "medium" ? "متوسط" : "عادي"}.`, nav: { label: "العملاء", to: "/customers" } };
  }
  return { content: "أفهم أسئلة العملاء والفواتير والدفعات والمنتجات والمخزن والموردين والمشتريات والمصروفات والتنبيهات والتقارير والأرشيف والنسخ الاحتياطي والصلاحيات. اكتب سؤالك بصيغة كاملة، وسأعطيك الإجابة أو الخطوات المناسبة." };
}

export async function askRasd(messages: Message[], question: string): Promise<Answer> {
  const { data, error } = await supabase.functions.invoke("rasd-assistant", {
    body: { messages: [...messages, { role: "user", content: question }].slice(-10) },
  });
  if (error) throw error;
  const answer = typeof data?.answer === "string" ? data.answer : "تعذّر على رَصْد تجهيز إجابة الآن. جرّب مرة أخرى.";
  return { content: answer };
}
