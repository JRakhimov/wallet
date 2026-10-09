/**
 * Photo preparation in the browser: the upload from a phone stays small and the server
 * needs no image library. Re-encoding through a canvas also drops EXIF (location).
 */

// Larger images are downscaled by vision models anyway.
const FULL_MAX_SIDE = 1568;
const THUMB_MAX_SIDE = 400;
const JPEG_QUALITY = 0.82;

export type PreparedPhoto = { full: Blob; thumbnail: Blob };

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  // `from-image` applies the EXIF rotation, so portrait photos are not sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const [full, thumbnail] = await Promise.all([
      encode(bitmap, FULL_MAX_SIDE),
      encode(bitmap, THUMB_MAX_SIDE),
    ]);
    return { full, thumbnail };
  } finally {
    bitmap.close();
  }
}

function encode(bitmap: ImageBitmap, maxSide: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Не удалось обработать фото");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось обработать фото"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}
