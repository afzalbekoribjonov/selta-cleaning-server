import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../lib/admin";
import { ApiError, sendError, withAuth, type AuthedRequest } from "../lib/authz";
import {
  deleteImageKitFiles,
  drainPhotoTrash,
  getFileDetails,
  imageKitConfig,
  isInFolder,
  photoFolder,
  requireImageKit,
  uploadAuth,
} from "../lib/imagekit";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_STATE,
  isPhotoState,
  isSafeId,
  photosOf,
  stateOfPhoto,
  type ItemPhoto,
  type ItemPhotos,
  type PhotoState,
} from "../lib/itemPhotos";
import { computeOrderItemsSummary, summaryItemOf } from "../lib/orderSummary";

export const photosRouter = Router();

/**
 * Rasm vakolatlari (admin panel → xodim): ko'rish `canViewPhotos`,
 * saqlash `canUploadPhotos`, o'chirish `canDeletePhotos`. Admin — hammasi.
 */
async function photoAccess(req: AuthedRequest) {
  const employeeId = req.auth!.employeeId ?? req.auth!.uid;
  const employee = (await db.collection("employees").doc(employeeId).get()).data() ?? {};
  const admin = req.auth!.role === "admin";
  return {
    employeeId,
    name: (employee.fullName as string | undefined) ?? (admin ? "Admin" : "Xodim"),
    canUpload: admin || employee.canUploadPhotos === true,
    canDelete: admin || employee.canDeletePhotos === true,
  };
}

function parseTarget(body: Record<string, unknown> | undefined, { stateRequired }: { stateRequired: boolean }) {
  const { orderId, itemId, state } = body ?? {};
  if (!isSafeId(orderId) || !isSafeId(itemId)) {
    throw new ApiError(400, "invalid-argument", "orderId va itemId majburiy");
  }
  if (stateRequired ? !isPhotoState(state) : state !== undefined && !isPhotoState(state)) {
    throw new ApiError(400, "invalid-argument", "Rasm holati noto'g'ri (eski yoki tayyor)");
  }
  return { orderId, itemId, state: state as PhotoState | undefined };
}

function parseFileId(value: unknown): string {
  if (!isSafeId(value)) throw new ApiError(400, "invalid-argument", "fileId noto'g'ri");
  return value;
}

function limitError(state: PhotoState) {
  return new ApiError(
    409,
    "limit",
    `${state === "before" ? "Eski" : "Tayyor"} holat uchun ko'pi bilan ${MAX_PHOTOS_PER_STATE} ta rasm saqlanadi`,
  );
}

function serializePhoto(photo: ItemPhoto) {
  const at = photo.uploadedAt;
  return { ...photo, uploadedAt: at instanceof Timestamp ? at.toMillis() : null };
}

/**
 * Mahsulot rasmlarini yozadi va buyurtmadagi mahsulotlar nusxasini
 * (itemsMirror) yangilaydi — ilova rasmlarni shu nusxadan ko'rsatadi.
 */
function writePhotos(
  tx: FirebaseFirestore.Transaction,
  orderRef: FirebaseFirestore.DocumentReference,
  itemId: string,
  allItems: FirebaseFirestore.QuerySnapshot,
  photos: ItemPhotos,
) {
  tx.update(orderRef.collection("items").doc(itemId), { photos });
  tx.update(orderRef, {
    ...computeOrderItemsSummary(allItems.docs.map((d) => (d.id === itemId ? summaryItemOf(d, { photos }) : summaryItemOf(d)))),
  });
}

/**
 * Yuklashdan oldin: bir martalik imzo. Joy qolmagan bo'lsa imzo
 * berilmaydi — ImageKit'ga bekorga fayl yuklanmasin.
 */
photosRouter.post("/itemPhotoUploadAuth", withAuth, async (req: AuthedRequest, res) => {
  try {
    const access = await photoAccess(req);
    if (!access.canUpload) throw new ApiError(403, "permission-denied", "Rasm saqlash huquqingiz yo'q");
    const config = requireImageKit();
    const { orderId, itemId, state } = parseTarget(req.body, { stateRequired: true });

    const itemSnap = await db.collection("orders").doc(orderId).collection("items").doc(itemId).get();
    if (!itemSnap.exists) throw new ApiError(404, "not-found", "Mahsulot topilmadi");
    if (photosOf(itemSnap.data())[state!].length >= MAX_PHOTOS_PER_STATE) throw limitError(state!);

    res.json({
      ...uploadAuth(config),
      folder: photoFolder(orderId, itemId),
      fileName: `${state}.jpg`,
    });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Yuklangan rasmni mahsulotga biriktiradi. Rasm haqiqatan ImageKit'da,
 * aynan shu mahsulot papkasida ekani tekshiriladi; joy qolmagan bo'lsa
 * fayl ImageKit'dan o'chiriladi. Takror yuborilsa (internet uzilib qolgan
 * bo'lsa) ikkinchi marta qo'shilmaydi.
 */
photosRouter.post("/addItemPhoto", withAuth, async (req: AuthedRequest, res) => {
  try {
    const access = await photoAccess(req);
    if (!access.canUpload) throw new ApiError(403, "permission-denied", "Rasm saqlash huquqingiz yo'q");
    const config = requireImageKit();
    const { orderId, itemId, state } = parseTarget(req.body, { stateRequired: true });
    const fileId = parseFileId(req.body?.fileId);

    const file = await getFileDetails(config, fileId);
    if (!file) throw new ApiError(404, "not-found", "Yuklangan rasm topilmadi — qaytadan yuklang");
    if (!isInFolder(file.filePath, photoFolder(orderId, itemId)) || file.fileType !== "image" || !file.url) {
      throw new ApiError(400, "invalid-argument", "Bu rasm ushbu mahsulotga tegishli emas");
    }
    if (file.size > MAX_PHOTO_BYTES) {
      await deleteImageKitFiles([fileId]);
      throw new ApiError(413, "invalid-argument", "Rasm hajmi juda katta");
    }

    const photo: ItemPhoto = {
      fileId,
      url: file.url,
      ...(file.width ? { width: file.width } : {}),
      ...(file.height ? { height: file.height } : {}),
      size: file.size,
      uploadedBy: access.employeeId,
      uploadedByName: access.name,
      // Massiv ichida FieldValue.serverTimestamp() ishlatib bo'lmaydi.
      uploadedAt: Timestamp.now(),
    };

    const orderRef = db.collection("orders").doc(orderId);
    let saved: ItemPhoto = photo;
    try {
      await db.runTransaction(async (tx) => {
        const [orderSnap, itemSnap, allItems] = await Promise.all([
          tx.get(orderRef),
          tx.get(orderRef.collection("items").doc(itemId)),
          tx.get(orderRef.collection("items")),
        ]);
        if (!orderSnap.exists || !itemSnap.exists) throw new ApiError(404, "not-found", "Mahsulot topilmadi");
        const photos = photosOf(itemSnap.data());
        const existing = photos[state!].find((p) => p.fileId === fileId);
        if (existing) {
          saved = existing;
          return;
        }
        if (photos[state!].length >= MAX_PHOTOS_PER_STATE) throw limitError(state!);
        saved = photo;
        writePhotos(tx, orderRef, itemId, allItems, { ...photos, [state!]: [...photos[state!], photo] });
      });
    } catch (err) {
      // Biriktirilmagan fayl ImageKit'da egasiz qolmasin.
      if (err instanceof ApiError && (err.code === "limit" || err.code === "not-found")) {
        await deleteImageKitFiles([fileId]);
      }
      throw err;
    }

    await drainPhotoTrash();
    res.json({ ok: true, photo: serializePhoto(saved) });
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * Rasmni o'chiradi (`canDeletePhotos`). Mahsulotga hali biriktirilmagan
 * yuklama (ilova yuklab, biriktirishga ulgurmagan) esa uni yuklagan
 * xodim tomonidan ham bekor qilinishi mumkin — faqat shu mahsulot
 * papkasidagi fayl bo'lsa. Takror chaqirish xavfsiz.
 */
photosRouter.post("/deleteItemPhoto", withAuth, async (req: AuthedRequest, res) => {
  try {
    const access = await photoAccess(req);
    if (!access.canDelete && !access.canUpload) {
      throw new ApiError(403, "permission-denied", "Rasmni o'chirish huquqingiz yo'q");
    }
    const { orderId, itemId } = parseTarget(req.body, { stateRequired: false });
    const fileId = parseFileId(req.body?.fileId);

    const orderRef = db.collection("orders").doc(orderId);
    let attached = false;
    await db.runTransaction(async (tx) => {
      const [orderSnap, itemSnap, allItems] = await Promise.all([
        tx.get(orderRef),
        tx.get(orderRef.collection("items").doc(itemId)),
        tx.get(orderRef.collection("items")),
      ]);
      attached = false;
      if (!orderSnap.exists || !itemSnap.exists) return;
      const photos = photosOf(itemSnap.data());
      const state = stateOfPhoto(photos, fileId);
      if (!state) return;
      if (!access.canDelete) throw new ApiError(403, "permission-denied", "Rasmni o'chirish huquqingiz yo'q");
      attached = true;
      writePhotos(tx, orderRef, itemId, allItems, {
        ...photos,
        [state]: photos[state].filter((p) => p.fileId !== fileId),
      });
    });

    if (attached) {
      await deleteImageKitFiles([fileId]);
    } else {
      const config = imageKitConfig();
      const file = config ? await getFileDetails(config, fileId) : null;
      if (file && isInFolder(file.filePath, photoFolder(orderId, itemId))) await deleteImageKitFiles([fileId]);
    }

    await drainPhotoTrash();
    res.json({ ok: true, removed: attached });
  } catch (err) {
    sendError(res, err);
  }
});
