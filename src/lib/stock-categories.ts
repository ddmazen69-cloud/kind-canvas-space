/** أنواع الأصناف في محلات الملابس + قسم المفروشات. */
export interface StockCategoryGroup {
  label: string;
  options: { value: string; label: string }[];
}

export const STOCK_CATEGORY_GROUPS: StockCategoryGroup[] = [
  {
    label: "رجالي",
    options: [
      { value: "men_shirts", label: "قمصان رجالي" },
      { value: "men_tshirts", label: "تي شيرت رجالي" },
      { value: "men_pants", label: "بناطيل رجالي" },
      { value: "men_jeans", label: "جينز رجالي" },
      { value: "men_suits", label: "بدل وجاكيتات رجالي" },
      { value: "men_jackets", label: "جواكت وبلاطي رجالي" },
      { value: "men_pajamas", label: "بيجامات رجالي" },
      { value: "men_underwear", label: "ملابس داخلية رجالي" },
      { value: "men_shoes", label: "أحذية رجالي" },
      { value: "men_accessories", label: "إكسسوارات رجالي" },
    ],
  },
  {
    label: "حريمي",
    options: [
      { value: "women_dresses", label: "فساتين" },
      { value: "women_abaya", label: "عبايات وإسدال" },
      { value: "women_blouses", label: "بلوزات وقمصان حريمي" },
      { value: "women_pants", label: "بناطيل حريمي" },
      { value: "women_skirts", label: "جيبات" },
      { value: "women_jackets", label: "جواكت ومعاطف حريمي" },
      { value: "women_pajamas", label: "بيجامات وقمصان نوم" },
      { value: "women_underwear", label: "ملابس داخلية حريمي" },
      { value: "women_hijab", label: "طرح وحجابات" },
      { value: "women_shoes", label: "أحذية حريمي" },
      { value: "women_bags", label: "شنط وإكسسوارات" },
    ],
  },
  {
    label: "أطفالي",
    options: [
      { value: "kids_boys", label: "ملابس ولادي" },
      { value: "kids_girls", label: "ملابس بناتي" },
      { value: "kids_baby", label: "ملابس بيبي ومواليد" },
      { value: "kids_sets", label: "أطقم أطفال" },
      { value: "kids_pajamas", label: "بيجامات أطفال" },
      { value: "kids_school", label: "ملابس مدارس" },
      { value: "kids_shoes", label: "أحذية أطفال" },
      { value: "kids_accessories", label: "إكسسوارات أطفال" },
    ],
  },
  {
    label: "مفروشات",
    options: [
      { value: "home_bedsheets", label: "مفارش وملايات" },
      { value: "home_comforters", label: "لحف وأغطية" },
      { value: "home_blankets", label: "بطاطين" },
      { value: "home_pillows", label: "مخدات ومراتب" },
      { value: "home_towels", label: "فوط وبشاكير" },
      { value: "home_curtains", label: "ستائر" },
      { value: "home_tablecloth", label: "مفارش سفرة" },
      { value: "home_carpets", label: "سجاد وكليم" },
      { value: "home_kitchen", label: "مفروشات مطبخ" },
    ],
  },
  {
    label: "عام",
    options: [
      { value: "unisex_sportswear", label: "ملابس رياضية" },
      { value: "unisex_socks", label: "شرابات" },
      { value: "other", label: "أخرى / غير محدد" },
    ],
  },
];

export const STOCK_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  STOCK_CATEGORY_GROUPS.flatMap((g) => g.options.map((o) => [o.value, o.label])),
);

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return "غير محدد";
  return STOCK_CATEGORY_LABEL[value] ?? "غير محدد";
}
