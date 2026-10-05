import { createHmac, randomUUID } from "crypto";
import { db } from "./admin";
import { ApiError } from "./authz";

/**
 * ImageKit — mahsulot rasmlari saqlanadigan xizmat.
 *
 * Kalitlar FAQAT serverda (Render → Environment): ilovaga maxfiy kalit
 * hech qachon berilmaydi. Ilova rasmni ImageKit'ga o'zi to'g'ridan-to'g'ri
 * yuklaydi (server orqali emas — tezroq va Render'ga yuk tushmaydi), lekin
 * buning uchun har safar serverdan bir martalik imzo oladi
 * ([uploadAuth]). Yuklangan rasm buyurtmaga faqat server tekshirgandan
 * keyin biriktiriladi (routes/photos.ts).
 */
export interface ImageKitConfig {
  privateKey: string;
  publicKey: string;
  urlEndpoint: string;
}

export function imageKitConfig(): ImageKitConfig | null {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY?.trim();
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY?.trim();
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT?.trim().replace(/\/+$/, "");
  if (!privateKey || !publicKey || !urlEndpoint) return null;
  return { privateKey, publicKey, urlEndpoint };
}

export function requireImageKit(): ImageKitConfig {
  const config = imageKitConfig();
  if (!config) {
    throw new ApiError(412, "failed-precondition", "Rasm xizmati hali sozlanmagan — administratorga murojaat qiling");
  }
  return config;
}

export const UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";
const API_URL = "https://api.imagekit.io/v1/files";

/** Imzo amal qiladigan vaqt (ImageKit: 1 soatdan kam bo'lishi shart). */
const UPLOAD_AUTH_TTL_SECONDS = 30 * 60;

/** Testlarda almashtiriladi — tarmoqqa chiqmaslik uchun. */
export const imageKitDeps = {
  fetch: (input: string, init?: RequestInit): Promise<Response> => fetch(input, init),
  now: () => Date.now(),
};

/** ImageKit'ning "client-side upload" imzosi: HMAC-SHA1(token + expire). */
export function uploadSignature(privateKey: string, token: string, expire: number): string {
  return createHmac("sha1", privateKey).update(token + String(expire)).digest("hex");
}

export function uploadAuth(config: ImageKitConfig) {
  const token = randomUUID();
  const expire = Math.floor(imageKitDeps.now() / 1000) + UPLOAD_AUTH_TTL_SECONDS;
  return {
    uploadUrl: UPLOAD_URL,
    publicKey: config.publicKey,
    token,
    expire,
    signature: uploadSignature(config.privateKey, token, expire),
  };
}

/** Mahsulot rasmlari papkasi — biriktirishda rasm aynan shu yerdaligi tekshiriladi. */
export function photoFolder(orderId: string, itemId: string): string {
  return `/selta/orders/${orderId}/${itemId}`;
}

export function isInFolder(filePath: unknown, folder: string): boolean {
  return typeof filePath === "string" && filePath.startsWith(`${folder}/`) && !filePath.slice(folder.length + 1).includes("/");
}

export interface ImageKitFile {
  fileId: string;
  filePath: string;
  url: string;
  fileType: string;
  size: number;
  width?: number;
  height?: number;
}

function authHeader(config: ImageKitConfig): string {
  return `Basic ${Buffer.from(`${config.privateKey}:`).toString("base64")}`;
}

/** Fayl ma'lumoti; yo'q bo'lsa `null`. */
export async function getFileDetails(config: ImageKitConfig, fileId: string): Promise<ImageKitFile | null> {
  let res: Response;
  try {
    res = await imageKitDeps.fetch(`${API_URL}/${encodeURIComponent(fileId)}/details`, {
      headers: { Authorization: authHeader(config) },
    });
  } catch {
    throw new ApiError(503, "unavailable", "Rasm xizmatiga ulanib bo'lmadi");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(503, "unavailable", "Rasm xizmatiga ulanib bo'lmadi");
  const body = (await res.json()) as Record<string, unknown>;
  return {
    fileId: String(body.fileId ?? ""),
    filePath: String(body.filePath ?? ""),
    url: String(body.url ?? ""),
    fileType: String(body.fileType ?? ""),
    size: Number(body.size) || 0,
    width: typeof body.width === "number" ? body.width : undefined,
    height: typeof body.height === "number" ? body.height : undefined,
  };
}

/** `true` — o'chirildi yoki allaqachon yo'q edi. */
async function deleteFile(config: ImageKitConfig, fileId: string): Promise<boolean> {
  try {
    const res = await imageKitDeps.fetch(`${API_URL}/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: { Authorization: authHeader(config) },
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/**
 * Fayllarni ImageKit'dan o'chiradi. O'chmaganlari (internet, kalit yo'q)
 * `photoTrash`ga yoziladi va keyingi rasm amallarida qayta urinib
 * ko'riladi ([drainPhotoTrash]) — ImageKit'da egasiz fayl qolmasligi uchun.
 */
export async function deleteImageKitFiles(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  const config = imageKitConfig();
  await Promise.all(
    fileIds.map(async (fileId) => {
      if (config && (await deleteFile(config, fileId))) return;
      await db
        .collection("photoTrash")
        .doc(fileId)
        .set({ fileId, queuedAt: new Date() })
        .catch((err) => console.error("photoTrash", err));
    }),
  );
}

export async function drainPhotoTrash(limit = 5): Promise<void> {
  const config = imageKitConfig();
  if (!config) return;
  try {
    const snap = await db.collection("photoTrash").limit(limit).get();
    await Promise.all(
      snap.docs.map(async (doc) => {
        if (await deleteFile(config, doc.id)) await doc.ref.delete();
      }),
    );
  } catch (err) {
    console.error("drainPhotoTrash", err);
  }
}
