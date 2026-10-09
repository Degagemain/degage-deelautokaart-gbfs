/* De screenshot van de kaart die een melder kan meesturen.
   ------------------------------------------------------------------------------------
   De kaart maakt hem zelf (html2canvas, zie openMeldvenster() in map/index.js) en stuurt
   hem als JPEG-data-URL mee met de melding. GitHub laat via de API geen bijlagen toe;
   daarom bewaart deze Worker de afbeelding in zijn D1-databank (tabel
   `schermafbeeldingen`, zie schema.sql) en serveert hij ze openbaar op
   GET /schermafbeelding/<id>.jpg. Het issue toont ze met een gewone Markdown-afbeelding.

   Openbaar, net als het issue zelf: de melder ziet een voorbeeld en kiest of de
   screenshot meegaat. Het id is lang en willekeurig, zodat niemand de andere
   screenshots kan aflopen.

   Een screenshot wordt alleen bewaard samen met een issue: lukt het issue niet, dan
   gaat hij meteen weer weg. Zo is de Worker geen opslagplaats voor wie zomaar
   afbeeldingen wil kwijt — en de spamcontrole (Turnstile) zit er al vóór.

   Weghalen (iemand vraagt het, of er staat toch iets persoonlijks op): zie
   feedback-worker/README.md, "Een screenshot weghalen". */

import { naarBase64url } from "./github.js";

export const MAX_BEELD = 800 * 1024;                  // bytes, de JPEG zelf
// Zo lang mag de data-URL in het verzoek zijn: base64 maakt er 4 tekens van per 3 bytes.
export const MAX_BEELD_TEKST = Math.ceil(MAX_BEELD / 3) * 4 + 32;
const VOORVOEGSEL = "data:image/jpeg;base64,";

/* De JPEG uit een data-URL, als bytes; of null als het geen (geldige) JPEG is. */
export function leesBeeld(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(VOORVOEGSEL) ||
      dataUrl.length > MAX_BEELD_TEKST) return null;
  let bytes;
  try {
    bytes = Uint8Array.from(atob(dataUrl.slice(VOORVOEGSEL.length)), (c) => c.charCodeAt(0));
  } catch (e) {
    return null;
  }
  // Elke JPEG begint met FF D8 FF; iets anders serveren we niet als image/jpeg.
  const jpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return jpeg && bytes.length <= MAX_BEELD ? bytes : null;
}

/* Bewaart de afbeelding nog zonder issue, en geeft het id terug. */
export async function bewaarBeeld(env, bytes) {
  const id = naarBase64url(crypto.getRandomValues(new Uint8Array(18)));
  await env.DB.prepare(
    "INSERT INTO schermafbeeldingen (id, issue, beeld, aangemaakt) VALUES (?, NULL, ?, ?)"
  ).bind(id, bytes.buffer, new Date().toISOString()).run();   // D1 wil een ArrayBuffer
  return id;
}

export async function koppelBeeld(env, id, issue) {
  await env.DB.prepare("UPDATE schermafbeeldingen SET issue = ? WHERE id = ?")
    .bind(issue, id).run();
}

export async function vergeetBeeld(env, id) {
  await env.DB.prepare("DELETE FROM schermafbeeldingen WHERE id = ?").bind(id).run();
}

/* GET /schermafbeelding/<id>.jpg. Een jaar in de cache: een screenshot verandert nooit.
   `sandbox` en `nosniff`: wat hier staat, is een afbeelding en niets anders. */
export async function toonBeeld(request, env, pad) {
  const m = /^\/schermafbeelding\/([A-Za-z0-9_-]{16,64})\.jpg$/.exec(pad);
  if (!m || !env.DB || (request.method !== "GET" && request.method !== "HEAD")) {
    return new Response("Niet gevonden.", { status: 404 });
  }
  let rij = null;
  try {
    rij = await env.DB.prepare("SELECT beeld FROM schermafbeeldingen WHERE id = ?")
      .bind(m[1]).first();
  } catch (e) {
    console.error("Screenshot lezen:", e.message);
  }
  if (!rij) return new Response("Niet gevonden.", { status: 404 });
  return new Response(request.method === "HEAD" ? null : new Uint8Array(rij.beeld), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
