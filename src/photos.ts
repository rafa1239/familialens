/**
 * Photo storage for the online-only app.
 *
 * Photos are compressed client-side and stored as data URLs inside the
 * authenticated online snapshot. Nothing durable is written to this PC.
 */

export async function addPhoto(file: Blob): Promise<string> {
  const blob = await compressImage(file, 1200, 0.85);
  return blobToDataUrl(blob);
}

export async function getPhotoUrl(id: string): Promise<string | null> {
  if (id.startsWith("data:") || id.startsWith("http")) return id;
  return null;
}

export async function removePhoto(_id: string): Promise<void> {
  return;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
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
