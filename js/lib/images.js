// Imágenes del club (principios, tareas): se reducen en el navegador y se guardan en Storage.
// Rutas: <club_id>/<carpeta>/<uuid>.jpg (bucket privado 'club-files'; se ven con URL firmada).
import { sb } from '../supabase.js';
import { S } from '../session.js';

/** Reduce una imagen a como mucho maxSide px de lado y maxBytes. */
export async function resizeImage(file, maxSide = 1280, maxBytes = 400 * 1024) {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  const toBlob = (type, q) => new Promise((r) => canvas.toBlob(r, type, q));
  for (let i = 0; i < 4; i++) {
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    for (const q of [0.82, 0.7, 0.55]) {
      const blob = await toBlob('image/jpeg', q);
      if (blob && blob.size <= maxBytes) return blob;
    }
    scale *= 0.7;
  }
  return toBlob('image/jpeg', 0.5);
}

/** Sube una imagen y devuelve su ruta en Storage. */
export async function uploadClubImage(folder, file) {
  if (!/^image\//.test(file.type)) throw new Error('Elige una imagen (JPG o PNG).');
  const blob = await resizeImage(file);
  const path = `${S.club.id}/${folder}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb().storage.from('club-files').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

export async function removeClubImage(path) {
  if (path) await sb().storage.from('club-files').remove([path]);
}

const cache = new Map();
/** URLs firmadas de varias rutas a la vez: { ruta: url }. */
export async function signedUrls(paths) {
  const need = [...new Set(paths.filter((p) => p && !cache.has(p)))];
  if (need.length) {
    const { data } = await sb().storage.from('club-files').createSignedUrls(need, 3600);
    (data || []).forEach((d) => { if (d.signedUrl) cache.set(d.path, d.signedUrl); });
  }
  return Object.fromEntries(paths.filter(Boolean).map((p) => [p, cache.get(p) || '']));
}
