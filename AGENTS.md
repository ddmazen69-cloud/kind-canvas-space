<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

<!-- SECURITY:MEMORY -->
# ذاكرة الأمان (Security Memory)

القواعد التالية إلزامية؛ مخالفتها تعيد إظهار ثغرات في فحص الأمان. أي تعديل
لاحق في الكود أو في الهجرات يجب أن يحافظ عليها ولا يعكسها:

1. **لا تُرسل أسرار إلى المتصفح أبداً.** ممنوع استعمال أي `VITE_*` متغير لأي
   token/secret (Upstash Redis, Supabase anon/service keys, مفاتيح API...).
   كل ما يُنفَّذ client-side يعتبر علني. أي كاش أو خدمة سرية تنتقل لسيرفر فقط
   (Server Function / Edge Function) وتقرأ من `process.env` بمتغير اسمه
   `AUTO_BACKUP_WEBHOOK_SECRET` أو ما يشابهه، مع مقارنة ثابتة الزمن
   (timingSafeEqual) وفشلٍ آمن (fail closed) إذا كان المتغير غير مُعرَّف.

2. **`team_directory` هي VIEW مُقيَّدة، ليست دالة.** لا تعِد إنشاءها كدالة
   `SECURITY DEFINER` ولا تُرجع كل صفوف `user_roles`/`auth.users` لأي مستخدم.
   النطاق: المالك يرى الكل، أي مستخدم آخر يرى نفسه فقط، والإيميل لا يُكشف
   لغير المالكين. كل الوصول مرسى على `auth.uid()`.

3. **دالة `has_role` تبقى كما هي (لا تُحوَّل لـ INVOKER):** قلبها الحقيقي في
   schema غير مكشوف (`app_private.has_role`) بصيغة `SECURITY DEFINER`،
   والغلاف `public.has_role` هو `SECURITY INVOKER` رفيع. هذا ضروري لأن
   سياسات RLS على `user_roles` نفسها تحتاج قراءة بدون RLS لتفادي الـ
   infinite recursion. لا تنقلها لـ public DEFINER ولا تحذف الغلاف.

4. **لا تكتب دوال `SECURITY DEFINER` جديدة تُمنح EXECUTE لـ `authenticated`**
   (lint 0029) ولا لـ `anon` (lint 0028). البدائل:
   - اقرأ من `auth.jwt()` / `auth.uid()` بدلاً من `auth.users`.
   - استخدم VIEW مع حصر حسب `auth.uid()`.
   - افصل منطق الـ DEFINER في schema غير مكشوف (مثل `app_private`) مع غلاف
     INVOKER في public، واربط كل كائن بـ `REVOKE ALL ... FROM public/anon`
     ثم `GRANT` للأدوار المناسبة فقط (انتبه: default privileges في Supabase
     تمنح `authenticated`/`anon` تلقائياً، فألغِها صراحةً).

5. **قبول دعوات الفريق مرتبط بالبريد.** أي دعوة (بريدية أو رابط) يجب أن تحمل
   `email` المتلقي، ولا يوجد قبول عبر token فقط. `accept_invite_token` و
   `bootstrap_my_role` يقرآن بريد المتصل من `auth.jwt() ->> 'email'`، وتسمح
   له RLS بقراءة/تحديث دعوته المعلّقة فقط (pending وغير منتهية ومطابقة
   لبريده). لا تُرجع `createInviteLink` بدون بريد.

6. **`role_abilities` مقروءة للمالكين فقط.** لا تعدِّل سياسة SELECT لتصير
   عامة لكل authenticated أو مبنية على `(role)::app_role`. غير المالك يقرأ
   المصفوفة الافتراضية من الكود فقط.

7. **كل بيانات المستخدم داخل HTML منشأ (PDF/طباعة) تُهرب بالضرورة.** استخدم
   `esc()` من `src/lib/pdf-doc.ts` أو `escapeHtml` من `customer-utils` لأي
   نص من مصدر بيانات (أسماء، ملاحظات، أرقام، رموز) قبل إدراجه في `document.write`
   أو `dangerouslySetInnerHTML`. لا تُدرج قيمة المستخدم مباشرة داخل SVG/HTML.

8. **الباركود يُهرب دائماً داخل SVG.** في `src/lib/barcode-svg.ts` النص يُمر
   عبر `escXml` قبل وضعه في `<text>`. لا تُدرج قيمة الكود خام داخل SVG.

9. **أيّ وظيفة إدارية في Hook/API عام تحتاج سرّاً مخصصاً، لا `apikey`**
   (مفتاح anon علني). `auto-backup` يستخدم header `x-backup-secret` مع
   `AUTO_BACKUP_WEBHOOK_SECRET` في بيئة السيرفر.

 10. **روابط مشاركة كشف حساب العميل (customer_share_links) قراءة عامة مقصودة
     وموثقة.** هذه هي الطريقة الوحيدة المسموح بها لعرض بيانات عميل لغير المسجلين:
     - إدارة الروابط (إنشاء/قائمة/إلغاء/حذف) تعمل client-side مباشرة عبر supabase
       في `src/lib/share.client.ts` (بديل Server Functions التي لا تعمل في بيئة
       Lovable). الـ `token` (48 حرف hex) يُولَّد عبر WebCrypto
       `crypto.getRandomValues` بـ 24 بايت — بنفس قوة `randomBytes` — ولا يُعرض
       قبل إنشائه. قبل الإدراج يُتحقق أن العميل يخص المستخدم عبر RLS على
       `customers` (`maybeSingle`) فلا يُنشأ رابط لعميل لا يملكه المستخدم.
     - جدول `customer_share_links` RLS على `auth.uid() = user_id` فقط، ولا
       GRANT لأي دور خارج `authenticated`.
     - القراءة العامة من Edge Function `shared-statement`
       (`supabase/functions/shared-statement/index.ts`) بـ Service Role
       (بعد الفحص الفوري لـ `revoked_at` و`expires_at`)، وترجع بيانات العميل
       الواحد المرتبط بالتوكن فقط — **بدون** `user_id` أو بيانات مستخدمين آخرين
       أو إعدادات المحل. لا تُحوَّل إلى RLS أنون ولا تُكشف لغير مالكي التوكن.
       لا تُستخدم Server Functions (TanStack Start) لأي شيء في هذه الميزة —
       فهي تسبّب فشل build في بيئة Lovable.

<!-- SECURITY:MEMORY:END -->
