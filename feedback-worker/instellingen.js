/* Instellingen van de kaart die een beheerder op /beheer kan wijzigen, zonder de kaart
   opnieuw te publiceren. Voorlopig één: welke filters de kaart toont.
   ------------------------------------------------------------------------------------
   De keuze staat in de D1-databank (tabel `instellingen`, zie schema.sql). De kaart leest
   ze bij het laden op `GET /instellingen`. Dat adres is openbaar en mag van overal
   gelezen worden: er staat niets geheims in, alleen welke filters uit staan.

   Antwoordt de Worker niet, of is de tabel er (nog) niet, dan toont de kaart alle
   filters. Een storing hier mag de kaart nooit armer maken dan ze zonder deze pagina was.
*/

/* De filters van de kaart, in de volgorde van de filterlijst. De sleutel staat als
   `data-filter` op de sectie in map/index.html; wie er hier een bijzet, zet hem daar ook. */
export const FILTERS = {
  soort: "Soort auto",
  klasse: "Prijsklasse",
  zitplaatsen: "Zitplaatsen",
  brandstof: "Brandstof",
  bak: "Versnellingsbak",
  toebehoren: "Toebehoren",
  afspraken: "Afspraken",
  ov: "Openbaar vervoer (bus, trein, afstand en frequentie)",
  euronorm: "Euronorm",
  bouwjaar: "Bouwjaar"
};

const SLEUTEL = "verborgen_filters";

/* De verborgen filters, als lijst sleutels uit FILTERS. Wat er niet (meer) in FILTERS
   staat, valt weg: een filter dat uit de kaart verdween, hoort hier niet te blijven
   hangen. Zonder databank of tabel: een lege lijst. */
export async function leesVerborgen(env) {
  if (!env.DB) return [];
  try {
    const rij = await env.DB.prepare("SELECT waarde FROM instellingen WHERE sleutel = ?")
      .bind(SLEUTEL).first();
    const lijst = rij ? JSON.parse(rij.waarde) : [];
    return Array.isArray(lijst) ? lijst.filter((k) => Object.hasOwn(FILTERS, k)) : [];
  } catch (e) {
    console.error("Instellingen lezen:", e.message);
    return [];
  }
}

/* Wie het laatst iets wijzigde, en wanneer; of null. Voor de beheerpagina. */
export async function laatsteWijziging(env) {
  try {
    return await env.DB.prepare("SELECT gewijzigd, door FROM instellingen WHERE sleutel = ?")
      .bind(SLEUTEL).first();
  } catch (e) {
    return null;
  }
}

/* Gooit een fout als de tabel er niet is; de beheerpagina zegt dan wat er moet gebeuren. */
export async function bewaarVerborgen(env, lijst, wie) {
  const geldig = Object.keys(FILTERS).filter((k) => lijst.includes(k));
  await env.DB.prepare(
    "INSERT INTO instellingen (sleutel, waarde, gewijzigd, door) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT (sleutel) DO UPDATE SET waarde = excluded.waarde, " +
    "gewijzigd = excluded.gewijzigd, door = excluded.door"
  ).bind(SLEUTEL, JSON.stringify(geldig), new Date().toISOString(), wie).run();
}

/* GET /instellingen — wat de kaart bij het laden leest. Een minuut in de cache: een
   wijziging op /beheer is dus binnen de minuut zichtbaar, en een drukke dag kost de
   databank geen vraag per bezoeker. */
export async function voorDeKaart(request, env) {
  const kop = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400"
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: kop });
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ fout: "Alleen GET." }), { status: 405, headers: kop });
  }
  return new Response(JSON.stringify({ verborgenFilters: await leesVerborgen(env) }), {
    headers: {
      ...kop,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60"
    }
  });
}
