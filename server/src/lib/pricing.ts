import { db } from "./admin";
import { ApiError } from "./authz";

export interface ItemInput {
  name?: string;
  productId?: string | null;
  calcType?: string;
  width?: number;
  height?: number;
  qty?: number;
  sizeVariant?: "small" | "large";
  condition?: "average" | "bad" | "veryBad" | null;
  price?: number; // faqat calcType 'fixed' (katalogsiz) uchun to'g'ridan-to'g'ri ishlatiladi
}

export interface ComputedItem {
  name: string;
  productId: string | null;
  calcType: string;
  width: number | null;
  height: number | null;
  qty: number | null;
  area: number; // orqaga moslik: sqm uchun qty bilan bir xil, boshqalarda 0
  sizeVariant: "small" | "large" | null;
  unitPrice: number | null;
  condition: "average" | "bad" | "veryBad" | null;
  conditionSurchargePercent: number | null;
  price: number;
}

/**
 * Narx katalogi + mahsulot holati ustama foizlaridan foydalanib item
 * narxini serverda hisoblaydi — klient tomonidan yuborilgan narxga
 * ishonmaydi (faqat calcType='fixed', ya'ni katalogsiz qo'lda kiritilgan
 * itemlar uchun klient narxi qabul qilinadi).
 *
 * `orderTariff` berilsa — mahsulot shu tarifga tegishli emasligini ham
 * tekshiradi (klient UI faqat mos mahsulotlarni ko'rsatadi, lekin serverda
 * ham tasdiqlanadi — boshqa tarifga tegishli mahsulot hech qachon
 * qo'shilmasligini kafolatlaydi).
 */
export async function computeItems(items: ItemInput[], orderTariff?: string): Promise<ComputedItem[]> {
  const productIds = [...new Set(items.map((i) => i.productId).filter((id): id is string => !!id))];
  const needsSurcharge = items.some((i) => i.condition);

  const [productSnaps, surchargeSnap] = await Promise.all([
    Promise.all(productIds.map((id) => db.collection("products").doc(id).get())),
    needsSurcharge ? db.collection("settings").doc("conditionSurcharges").get() : Promise.resolve(null),
  ]);

  const products = new Map(productSnaps.map((s) => [s.id, s.data()]));
  const surcharges = (surchargeSnap?.data() as { average?: number; bad?: number; veryBad?: number } | undefined) ?? {};

  return items.map((item) => {
    const calcType = item.calcType ?? "fixed";
    const name = item.name?.toString()?.trim() || "Mahsulot";

    if (calcType === "fixed" || !item.productId) {
      const price = Number(item.price) || 0;
      return {
        name,
        productId: null,
        calcType: "fixed",
        width: null,
        height: null,
        qty: null,
        area: 0,
        sizeVariant: null,
        unitPrice: null,
        condition: null,
        conditionSurchargePercent: null,
        price,
      };
    }

    const product = products.get(item.productId);
    if (!product) throw new ApiError(404, "not-found", `Mahsulot topilmadi: ${item.productId}`);

    const productTariffs = (product.tariffs as string[] | undefined) ?? [];
    if (orderTariff && productTariffs.length > 0 && !productTariffs.includes(orderTariff)) {
      throw new ApiError(400, "invalid-argument", `"${product.name}" mahsuloti bu tarifga tegishli emas`);
    }

    let base = 0;
    let unitPrice: number | null = null;
    let qty: number | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let sizeVariant: "small" | "large" | null = null;

    if (calcType === "size") {
      sizeVariant = item.sizeVariant === "large" ? "large" : "small";
      unitPrice = sizeVariant === "large" ? Number(product.largePrice) || 0 : Number(product.smallPrice) || 0;
      base = unitPrice;
    } else {
      unitPrice = Number(product.unitPrice) || 0;
      if (calcType === "sqm" && item.width && item.height) {
        width = Number(item.width);
        height = Number(item.height);
        qty = Math.round(width * height * 100) / 100;
      } else {
        qty = Number(item.qty) || 0;
      }
      base = unitPrice * qty;
    }

    let surchargePercent: number | null = null;
    if (item.condition) {
      surchargePercent = Number(surcharges[item.condition]) || 0;
    }
    const price = Math.round(base * (1 + (surchargePercent ?? 0) / 100));

    return {
      name: name === "Mahsulot" ? (product.name as string) : name,
      productId: item.productId,
      calcType,
      width,
      height,
      qty,
      area: calcType === "sqm" ? qty ?? 0 : 0,
      sizeVariant,
      unitPrice,
      condition: item.condition ?? null,
      conditionSurchargePercent: surchargePercent,
      price,
    };
  });
}
