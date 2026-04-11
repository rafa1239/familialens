/**
 * Photo storage. Photos are stored as Blobs in IndexedDB (separate store
 * from the main snapshot) and referenced by id in events/people. When the
 * UI needs to display a photo, it calls `loadPhotoUrl(id)` which returns
 * an object URL cached in memory for the lifetime of the page.
 */

import { loadPhoto, savePhoto, deletePhoto } from "./db";
import { createId } from "./ids";

const urlCache = new Map<string, string>();

export async function addPhoto(file: Blob): Promise<string> {
  const id = createId("photo");
  // Downscale + re-encode to JPEG to keep the snapshot small.
  const blob = await compressImage(file, 1200, 0.85);
  await savePhoto(id, blob);
  return id;
}

export async function getPhotoUrl(id: string): Promise<string | null> {
  if (urlCache.has(id)) return urlCache.get(id)!;
  const blob = await loadPhoto(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export async function removePhoto(id: string): Promise<void> {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
  await deletePhoto(id);
}

/**
 * Downscale an image to fit within `maxDim` (longest side) and re-encode
 * as JPEG at the given quality. Returns the resulting Blob.
 */
async function compressImage(
  file: Blob,
  maxDim: number,
  quality: number
): Promise<Blob> {
  const img = await loadImage(file);
  const { width, height } = img;
  let w = width;
  let h = height;
  if (Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, w, h);
  return await new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? file),
      "image/jpeg",
      quality
    );
  });
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}
