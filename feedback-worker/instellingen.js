/* Instellingen van de kaart die een beheerder op /beheer kan wijzigen, zonder de kaart
   opnieuw te publiceren: welke filters de kaart toont, welke daarvan onder "Meer filters"
   staan, en per filter welke keuzes.
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

/* Hoeveel auto's in de feed elke keuze uit OPTIES hebben, als { filter: { keuze: n } }:
   voor de beheerpagina, zodat wie een keuze verbergt ziet hoeveel auto's ze raakt. De
   afspraken staan in de feed onder `toebehoren`, net als de toebehoren zelf. */
const VELD = { soort: "carrosserie", klasse: "klasse", brandstof: "brandstof",
               bak: "versnellingsbak" };

export function telKeuzes(feed) {
  const tel = Object.fromEntries(Object.entries(OPTIES).map(([filter, keuzes]) =>
    [filter, Object.fromEntries(Object.keys(keuzes).map((k) => [k, 0]))]));
  for (const w of (feed && feed.data && feed.data.vehicles) || []) {
    for (const [filter, veld] of Object.entries(VELD)) {
      const waarde = filter === "klasse" && !w.klasse ? "onbekend" : w[veld];
      if (Object.hasOwn(tel[filter], waarde)) tel[filter][waarde]++;
    }
    for (const filter of ["toebehoren", "afspraken"]) {
      for (const k of Object.keys(tel[filter])) if (w.toebehoren && w.toebehoren[k]) tel[filter][k]++;
    }
  }
  return tel;
}

const SLEUTEL_FILTERS = "verborgen_filters";
const SLEUTEL_OPTIES = "verborgen_opties";
const SLEUTEL_MEER = "meer_filters";

/* Wat onder "Meer filters" staat zolang niemand het op /beheer/kaartfilters gekozen heeft.
   Dezelfde lijst staat als MEER_FILTERS_STANDAARD in map/index.js, voor als de kaart
   deze Worker niet bereikt. */
export const MEER_STANDAARD = ["euronorm", "bouwjaar"];

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

/* De filters onder "Meer filters", als lijst sleutels uit FILTERS. Nog nooit bewaard:
   MEER_STANDAARD. Een lege lijst is wél een keuze: dan staat alles in de gewone lijst. */
export async function leesMeer(env) {
  const lijst = await lees(env, SLEUTEL_MEER);
  return (Array.isArray(lijst) ? lijst : MEER_STANDAARD)
    .filter((k) => Object.hasOwn(FILTERS, k));
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
      "SELECT gewijzigd, door FROM instellingen WHERE sleutel IN (?, ?, ?) " +
      "ORDER BY gewijzigd DESC LIMIT 1"
    ).bind(SLEUTEL_FILTERS, SLEUTEL_OPTIES, SLEUTEL_MEER).first();
  } catch (e) {
    return null;
  }
}

/* Alles in één keer, met hetzelfde tijdstip: de beheerpagina bewaart het samen. */
export async function bewaarVerborgen(env, filters, opties, meer, wie) {
  const wanneer = new Date().toISOString();
  await bewaar(env, SLEUTEL_FILTERS, Object.keys(FILTERS).filter((k) => filters.includes(k)),
               wie, wanneer);
  await bewaar(env, SLEUTEL_OPTIES, schoonOpties(opties), wie, wanneer);
  await bewaar(env, SLEUTEL_MEER, Object.keys(FILTERS).filter((k) => meer.includes(k)),
               wie, wanneer);
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
  const [verborgenFilters, verborgenOpties, meerFilters] =
    await Promise.all([leesVerborgen(env), leesVerborgenOpties(env), leesMeer(env)]);
  return new Response(JSON.stringify({ verborgenFilters, verborgenOpties, meerFilters }), {
    headers: {
      ...kop,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60"
    }
  });
}
