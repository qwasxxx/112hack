const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 384;
const JPEG_QUALITY = 0.82;

export async function compressProfileImage(file: File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Допустимы только изображения JPEG, PNG, WebP или GIF.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Файл слишком большой. Выберите изображение до 8 МБ.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Не удалось прочитать изображение. Выберите другой файл.');
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Не удалось обработать изображение.');
  }
  context.fillStyle = '#eef3f8';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  try {
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch {
    throw new Error('Не удалось обработать изображение.');
  }
}
