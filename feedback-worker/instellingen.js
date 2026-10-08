/* Instellingen van de kaart die een beheerder op /beheer kan wijzigen, zonder de kaart
   opnieuw te publiceren: welke filters de kaart toont, en per filter welke keuzes.
   ------------------------------------------------------------------------------------
   De keuze staat in de D1-databank (tabel `instellingen`, zie schema.sql). De kaart leest
   ze bij het laden op `GET /instellingen`. Dat adres is openbaar en mag van overal
   gelezen worden: er staat niets geheims in, alleen wat er uit staat.

   Antwoordt de Worker niet, of is de tabel er (nog) niet, dan toont de kaart alles.
   Een storing hier mag de kaart nooit armer maken dan ze zonder deze pagina was.
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

/* De keuzes binnen de filters met vakjes, zoals ze in de feed staan: de gesloten lijsten
   uit gbfs/schema/degage_vehicles.json, en de vlaggen uit FEEDSPEC.md. Komt er daar een
   waarde bij, zet ze dan ook hier, anders kan niemand ze verbergen.

   Een verborgen keuze verdwijnt uit het filter. Bij toebehoren en afspraken gaat ze
   verder: dan bestaat die vlag voor de hele kaart niet, ook niet in de popup van een
   wagen. Een wagen met een trekhaak die uit staat, is op de kaart een wagen zonder
   vermelding van een trekhaak — nooit "trekhaak: nee". */
export const OPTIES = {
  soort: { Personenwagen: "Personenwagen", Bestelwagen: "Bestelwagen" },
  klasse: { A: "Prijsklasse A", B: "Prijsklasse B", onbekend: "Onbekende prijsklasse" },
  brandstof: {
    benzine: "benzine", diesel: "diesel", elektrisch: "elektrisch", hybride: "hybride",
    "plug-in hybride": "plug-in hybride", CNG: "CNG", LPG: "LPG"
  },
  bak: { manueel: "manueel", automatisch: "automatisch" },
  toebehoren: {
    aanhanger: "aanhangwagen", bed: "bed", fietsdrager: "fietsdrager", gps: "gps",
    kinderzitje: "kinderzitje", trekhaak: "trekhaak"
  },
  afspraken: { huisdieren: "huisdieren toegelaten", leren_autorijden: "leren autorijden" }
};

const SLEUTEL_FILTERS = "verborgen_filters";
const SLEUTEL_OPTIES = "verborgen_opties";

async function lees(env, sleutel) {
  if (!env.DB) return null;
  try {
    const rij = await env.DB.prepare("SELECT waarde FROM instellingen WHERE sleutel = ?")
      .bind(sleutel).first();
    return rij ? JSON.parse(rij.waarde) : null;
  } catch (e) {
    console.error("Instellingen lezen:", e.message);
    return null;
  }
}

/* Gooit een fout als de tabel er niet is; de beheerpagina zegt dan wat er moet gebeuren. */
async function bewaar(env, sleutel, waarde, wie, wanneer) {
  await env.DB.prepare(
    "INSERT INTO instellingen (sleutel, waarde, gewijzigd, door) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT (sleutel) DO UPDATE SET waarde = excluded.waarde, " +
    "gewijzigd = excluded.gewijzigd, door = excluded.door"
  ).bind(sleutel, JSON.stringify(waarde), wanneer, wie).run();
}

/* De verborgen filters, als lijst sleutels uit FILTERS. Wat er niet (meer) in FILTERS
   staat, valt weg: een filter dat uit de kaart verdween, hoort hier niet te blijven
   hangen. Zonder databank of tabel: een lege lijst. */
export async function leesVerborgen(env) {
  const lijst = await lees(env, SLEUTEL_FILTERS);
  return Array.isArray(lijst) ? lijst.filter((k) => Object.hasOwn(FILTERS, k)) : [];
}

/* De verborgen keuzes, als { filter: [keuze, ...] }, met alleen de filters waar er iets
   uit staat. Wat niet (meer) in OPTIES staat, valt weg, net als hierboven. */
export async function leesVerborgenOpties(env) {
  const opgeslagen = await lees(env, SLEUTEL_OPTIES);
  return schoonOpties(opgeslagen && typeof opgeslagen === "object" ? opgeslagen : {});
}

function schoonOpties(opties) {
  const uit = {};
  for (const [filter, keuzes] of Object.entries(OPTIES)) {
    const lijst = Array.isArray(opties[filter]) ? opties[filter] : [];
    const geldig = Object.keys(keuzes).filter((k) => lijst.includes(k));
    if (geldig.length) uit[filter] = geldig;
  }
  return uit;
}

/* Wie het laatst iets wijzigde, en wanneer; of null. Voor de beheerpagina. */
export async function laatsteWijziging(env) {
  try {
    return await env.DB.prepare(
      "SELECT gewijzigd, door FROM instellingen WHERE sleutel IN (?, ?) " +
      "ORDER BY gewijzigd DESC LIMIT 1"
    ).bind(SLEUTEL_FILTERS, SLEUTEL_OPTIES).first();
  } catch (e) {
    return null;
  }
}

/* Beide in één keer, met hetzelfde tijdstip: de beheerpagina bewaart ze samen. */
export async function bewaarVerborgen(env, filters, opties, wie) {
  const wanneer = new Date().toISOString();
  await bewaar(env, SLEUTEL_FILTERS, Object.keys(FILTERS).filter((k) => filters.includes(k)),
               wie, wanneer);
  await bewaar(env, SLEUTEL_OPTIES, schoonOpties(opties), wie, wanneer);
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
  const [verborgenFilters, verborgenOpties] =
    await Promise.all([leesVerborgen(env), leesVerborgenOpties(env)]);
  return new Response(JSON.stringify({ verborgenFilters, verborgenOpties }), {
    headers: {
      ...kop,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60"
    }
  });
}
