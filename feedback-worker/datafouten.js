/* Datafouten: wat er niet klopt aan de auto's in de feed, voor de beheerders op
   /beheer/datafouten.
   ------------------------------------------------------------------------------------
   De Worker leest elke nacht `degage_vehicles.json` (FEED_URL in wrangler.toml) en legt
   elke auto langs de REGELS hieronder. Daarnaast neemt hij de tabel `datacorrecties` mee:
   wat de generator (scripts/genereer_gbfs.py) bij de kwartaalrun al rechtzette of liet
   vallen — een merk in een andere schrijfwijze, een gemeente in hoofdletters, een
   euronorm als "nvt" of "5 of 6". De generator stuurt dat na elke run naar
   POST /api/datacorrecties (ontvangCorrecties() hieronder), met een token. In
   de feed staat het al goed, maar in de bron niet, en daar hoort het verbeterd te worden. Wat er niet klopt, komt in de tabel `datafouten` (schema.sql),
   met de dag waarop het voor het eerst gevonden werd. Op de beheerpagina kan het ook
   meteen, met "Nu controleren".

   Los daarvan toont de pagina de auto's die in de live vloot staan (VLOOT_URL) maar nog
   niet in de feed: nieuwe auto's, waarvan de kaart tot de volgende feed alleen de naam,
   de brandstof en de versnellingsbak kent. Dat is geen fout en wordt niet bewaard; de
   lijst wordt bij elk bezoek opnieuw gemaakt (nieuweAutos()).

   Een fout verdwijnt op twee manieren:
   · de beheerder drukt "Probleem opgelost, wissen", nadat hij de bron verbeterd heeft;
   · de fout staat niet meer in de feed — dan is ze verbeterd en gaat de rij vanzelf weg.

   Het eerste vraagt een kleine omweg. De feed wordt maar per kwartaal ververst: wie
   vandaag de bron verbetert, ziet de oude fout tot de volgende feed in de feed blijven
   staan, en de controle van morgen zou ze gewoon weer vinden. Daarom wordt een "gewiste"
   fout niet weggegooid maar als opgelost onthouden, samen met de datum van de feed op dat
   moment. Ze blijft verborgen zolang de feed dezelfde is. Staat ze in een NIEUWERE feed
   nog altijd, dan was ze niet opgelost en komt ze terug in de lijst, met een nieuwe datum.

   De sleutel van een fout is de naam van de auto plus de regel: namen zijn uniek in de
   vloot, en zo blijft een fout dezelfde rij als de auto verhuist of een andere fout bij
   dezelfde auto komt. */

/* De euronormen per bouwjaar. Verplicht: vanaf dit jaar moet elke nieuw ingeschreven auto
   minstens deze norm halen (Euro 4 in 2006, Euro 5 in 2011, Euro 6 in september 2015).
   Bestaat sinds: vroeger dan dit jaar haalde vrijwel geen auto deze norm. Beide met een
   jaar speling, want het bouwjaar in de bron is niet altijd het jaar van inschrijving:
   een fout hier is een vraag om na te kijken, geen zekerheid. */
const NORM_VERPLICHT = { 4: 2007, 5: 2012, 6: 2016 };
const NORM_BESTAAT_SINDS = { 4: 2003, 5: 2008, 6: 2011 };
const MOTOR = new Set(["benzine", "diesel", "CNG", "LPG", "hybride", "plug-in hybride"]);

/* Kleine letters, zonder accenten, alleen letters en cijfers, letters en cijfers apart
   ("500L" wordt "500 l"). Dezelfde als vergelijkbaar() in map/index.js, zodat hier
   dezelfde merkvelden opvallen die de kaart voor haar foto's rechtzet. */
function vergelijkbaar(s) {
  return " " + String(s || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ")
    .replace(/([a-z])([0-9])/g, "$1 $2").replace(/([0-9])([a-z])/g, "$1 $2")
    .trim() + " ";
}

/* Staat er een model in het merkveld? Zelfde regel als fotoSleutel() in map/index.js:
   knip het merk op de spaties en kijk of de vloot ZELF die combinatie elders kent.
   "Fiat Panda" + "1.2 Easy" valt op omdat er ook auto's met merk "Fiat" en model "Panda"
   zijn; "Alfa Romeo" niet, want geen auto heeft merk "Alfa" en model "Romeo". */
function merkMetModel(w, paren) {
  const woorden = String(w.merk || "").split(/\s+/).filter(Boolean);
  for (let i = woorden.length - 1; i > 0; i--) {
    const merkdeel = woorden.slice(0, i).join(" ");
    const rest = woorden.slice(i);
    for (let j = rest.length; j > 0; j--) {
      const paar = paren.get(vergelijkbaar(merkdeel) + "|" + vergelijkbaar(rest.slice(0, j).join(" ")));
      if (paar) return paar;
    }
    /* Ook het restje van het merk samen met het model: "Peugeot E" + "208" is "Peugeot" +
       "E-208", dat elders in de vloot staat. (De kaart doet dit voor haar foto's niet.) */
    const samen = paren.get(vergelijkbaar(merkdeel) + "|" + vergelijkbaar(rest.join(" ") + " " + w.model));
    if (samen) return samen;
  }
  return null;
}

/* Wat er mis kan zijn aan het gemeenteveld. De generator zet alleen hoofdletters recht;
   dit hier is rechtzetten dat raden zou zijn, dus het hoort in de bron. */
function plaatsProblemen(plaats) {
  const p = String(plaats || "");
  const uit = [];
  if (/\d/.test(p)) uit.push("er staat een postcode in");
  if (/belgi|belgique|belgium/i.test(p)) uit.push("het land staat erbij");
  if (/\b(Sint|Sinte|Sainte?|Onze)\s+\p{Lu}/u.test(p)) uit.push("een koppelteken ontbreekt (Sint-…)");
  if (/\(/.test(p)) {
    uit.push("er staan twee namen in, met haakjes — elders staat de deelgemeente soms vóór, " +
             "soms ná de gemeente; kies één vorm");
  }
  return uit;
}

const VELDEN = {
  merk: "Merk", model: "Model", carrosserie: "Soort auto", brandstof: "Brandstof",
  versnellingsbak: "Versnellingsbak"
};

/* Elke regel geeft voor één auto een beschrijving van de fout, of niets. De sleutel van
   de regel komt in de databank; verander hem dus niet zonder reden. */
const REGELS = {
  "elektrisch-met-norm": (w) => w.brandstof === "elektrisch" && w.euronorm
    ? "Volledig elektrische auto met euronorm “" + w.euronorm + "”. Een elektrische auto " +
      "heeft geen euronorm: klopt de brandstof (is het een hybride?), of moet de euronorm weg?"
    : null,
  "norm-ontbreekt": (w) => MOTOR.has(w.brandstof) && !w.euronorm
    ? "Euronorm ontbreekt bij een auto op " + w.brandstof + ". In de bron is hij leeg, " +
      "“nvt” of dubbelzinnig (zoals “5 of 6”). Op de kaart valt de auto daardoor weg zodra " +
      "iemand op euronorm filtert."
    : null,
  "norm-bouwjaar": (w) => {
    const m = /^Euro (\d)$/.exec(w.euronorm || "");
    if (!m || !w.bouwjaar) return null;
    const norm = Number(m[1]);
    for (const [moet, vanaf] of Object.entries(NORM_VERPLICHT)) {
      if (w.bouwjaar >= vanaf && norm < Number(moet)) {
        return "Euro " + norm + " past niet bij bouwjaar " + w.bouwjaar + ": sinds " +
          (vanaf - 1) + " moet elke nieuwe auto minstens Euro " + moet + " halen. " +
          "Klopt de euronorm, of het bouwjaar?";
      }
    }
    const sinds = NORM_BESTAAT_SINDS[norm];
    if (sinds && w.bouwjaar < sinds) {
      return "Euro " + norm + " bij bouwjaar " + w.bouwjaar + " is onwaarschijnlijk: die " +
        "norm haalden auto's pas vanaf ongeveer " + sinds + ". Klopt de euronorm, of het bouwjaar?";
    }
    return null;
  },
  "bouwjaar": (w) => {
    if (!w.bouwjaar) return "Bouwjaar ontbreekt.";
    const nu = new Date().getUTCFullYear();
    return w.bouwjaar < 1980 || w.bouwjaar > nu + 1
      ? "Bouwjaar " + w.bouwjaar + " is onmogelijk." : null;
  },
  "zitplaatsen": (w) => {
    if (!w.zitplaatsen) return "Aantal zitplaatsen ontbreekt.";
    return w.zitplaatsen < 1 || w.zitplaatsen > 9
      ? w.zitplaatsen + " zitplaatsen is onmogelijk voor een auto." : null;
  },
  ...Object.fromEntries(Object.entries(VELDEN).map(([veld, naam]) =>
    ["ontbreekt-" + veld, (w) => (w[veld] ? null : naam + " ontbreekt.")]))
};

/* Wat de generator rechtzette (de tabel datacorrecties), in gewone woorden. Een onbruikbare
   euronorm staat hier niet: die zit in de regel "norm-ontbreekt", met de bronwaarde erbij,
   zodat dezelfde fout niet twee keer in de lijst staat. */
const CORRECTIES = {
  schrijfwijze: (c) => (c.veld === "merk" ? "Merk" : "Model") + " staat in de bron als “" +
    c.bron + "”, elders in de vloot als “" + c.feed + "”. De feed gebruikt “" + c.feed + "”.",
  hoofdletters: (c) => "Gemeente staat in de bron als “" + c.bron + "”; de feed zet de " +
    "hoofdletters recht tot “" + c.feed + "”.",
  asterisk: (c) => "Euronorm staat in de bron als “" + c.bron + "”: het sterretje wordt " +
    "genegeerd, de feed zegt “" + c.feed + "”. Wat betekent het sterretje?"
};

/* Alle fouten in een feed, als lijst { sleutel, auto, station, plaats, regel, fout }.
   `correcties` zijn de rijen uit de tabel datacorrecties, of leeg. */
export function controleer(feed, correcties = []) {
  const wagens = (feed && feed.data && feed.data.vehicles) || [];
  const opNaam = new Map(wagens.map((w) => [String(w.naam || ""), w]));
  // Een onbruikbare euronorm per auto, voor de regel "norm-ontbreekt".
  const onbruikbaar = new Map(correcties
    .filter((c) => c.veld === "euronorm" && c.soort === "onbruikbaar")
    .map((c) => [c.naam, c.bron]));
  const paren = new Map();
  for (const w of wagens) {
    if (!w.merk) continue;
    const k = vergelijkbaar(w.merk) + "|" + vergelijkbaar(w.model);
    if (!paren.has(k)) paren.set(k, w.merk + " " + w.model);
  }

  const uit = [];
  const voeg = (w, auto, regel, fout) => uit.push({
    sleutel: auto + "|" + regel, auto, station: String((w && w.station_id) || ""),
    plaats: String((w && w.plaats) || ""), regel, fout });
  for (const w of wagens) {
    const auto = String(w.naam || "(zonder naam)");
    for (const [regel, test] of Object.entries(REGELS)) {
      let fout = test(w);
      if (fout && regel === "norm-ontbreekt" && onbruikbaar.has(auto)) {
        fout = "Euronorm staat in de bron als “" + onbruikbaar.get(auto) + "”, en daar valt " +
          "geen norm uit af te leiden. Op de kaart valt de auto daardoor weg zodra iemand " +
          "op euronorm filtert.";
      }
      if (fout) voeg(w, auto, regel, fout);
    }
    const paar = merkMetModel(w, paren);
    if (paar) {
      voeg(w, auto, "merkveld", "Het model staat in het merkveld: merk “" + w.merk +
        "”, model “" + w.model + "”. Elders in de vloot staat “" + paar + "” netjes " +
        "verdeeld over merk en model.");
    }
    const plaats = plaatsProblemen(w.plaats);
    if (plaats.length) {
      voeg(w, auto, "plaats", "Gemeente “" + w.plaats + "”: " + plaats.join("; ") + ".");
    }
  }
  for (const c of correcties) {
    const tekst = CORRECTIES[c.soort];
    if (!tekst) continue;
    voeg(opNaam.get(c.naam), c.naam, "correctie-" + c.veld, tekst(c));
  }
  return uit;
}

/* De soorten fouten, voor het filter op de beheerpagina: per regel een groep met een
   naam. Een regel die hier niet staat, valt onder "Andere". */
export const SOORTEN = {
  "elektrisch-met-norm": "Elektrische auto met euronorm",
  "norm-ontbreekt": "Euronorm ontbreekt of onbruikbaar",
  "norm-bouwjaar": "Euronorm past niet bij bouwjaar",
  "correctie-euronorm": "Sterretje in de euronorm",
  "merkveld": "Model in het merkveld",
  "schrijfwijze": "Schrijfwijze van merk of model",
  "plaats": "Gemeenteveld",
  "correctie-plaats": "Gemeente in hoofdletters",
  "bouwjaar": "Bouwjaar",
  "zitplaatsen": "Zitplaatsen",
  "ontbreekt": "Veld ontbreekt"
};

export function soortVan(regel) {
  if (regel === "correctie-merk" || regel === "correctie-model") return "schrijfwijze";
  if (regel.startsWith("ontbreekt-")) return "ontbreekt";
  return Object.hasOwn(SOORTEN, regel) ? regel : "andere";
}

/* De correcties van de laatste kwartaalrun, uit de databank. */
async function leesCorrecties(env) {
  const { results } = await env.DB.prepare(
    "SELECT naam, veld, soort, bron, feed FROM datacorrecties").all();
  return results;
}

const SLEUTEL_ONTVANGEN = "datacorrecties_ontvangen";
const VELDEN_CORRECTIE = new Set(["merk", "model", "plaats", "euronorm"]);
const SOORTEN_CORRECTIE = new Set(["schrijfwijze", "hoofdletters", "onbruikbaar", "asterisk"]);
const MAX_CORRECTIES = 5000;

/* Twee teksten vergelijken in een tijd die niet verraadt hoeveel tekens er kloppen. */
function gelijk(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let verschil = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) verschil |= (x[i] || 0) ^ (y[i] || 0);
  return verschil === 0;
}

/* POST /api/datacorrecties — wat de generator na een kwartaalrun stuurt:
   { feed: last_updated van de nieuwe feed, correcties: [{ naam, veld, soort, bron, feed? }] }.
   Alleen met `Authorization: Bearer <CORRECTIES_TOKEN>`, een geheim van de Worker; de
   generator leest hetzelfde token uit een bestand in de interne repo. Wie het token
   heeft, kan niet meer dan deze werklijst overschrijven — een bewust aanvaard risico. */
export async function ontvangCorrecties(request, env) {
  const antwoord = (status, inhoud) => new Response(JSON.stringify(inhoud), {
    status, headers: { "Content-Type": "application/json; charset=utf-8" } });
  if (request.method !== "POST") return antwoord(405, { fout: "Alleen POST." });
  if (!env.DB || !env.CORRECTIES_TOKEN) {
    return antwoord(503, { fout: "CORRECTIES_TOKEN of de databank is niet ingesteld." });
  }
  if (!gelijk(request.headers.get("Authorization") || "", "Bearer " + env.CORRECTIES_TOKEN)) {
    return antwoord(401, { fout: "Verkeerd of ontbrekend token." });
  }
  let json;
  try {
    json = await request.json();
  } catch (e) {
    return antwoord(400, { fout: "Geen geldige JSON." });
  }
  const { status, inhoud } = await bewaarCorrecties(env, json);
  return antwoord(status, inhoud);
}

/* De lijst vervangt de vorige helemaal: wat niet meer gestuurd wordt, is in de bron
   verbeterd. Daarna meteen een controle, zodat de beheerpagina klopt. Geeft
   { status, inhoud } terug voor het antwoord. */
async function bewaarCorrecties(env, json) {
  const lijst = json && json.correcties;
  if (!Array.isArray(lijst) || lijst.length > MAX_CORRECTIES) {
    return { status: 400, inhoud: { fout: "`correcties` moet een lijst zijn van hoogstens " +
                                          MAX_CORRECTIES + " rijen." } };
  }
  const tekst = (v, max) => typeof v === "string" && v.length <= max;
  const slecht = lijst.findIndex((c) => !c || !tekst(c.naam, 200) || !c.naam ||
    !VELDEN_CORRECTIE.has(c.veld) || !SOORTEN_CORRECTIE.has(c.soort) || !tekst(c.bron, 500) ||
    (c.feed !== undefined && !tekst(c.feed, 500)));
  if (slecht >= 0) return { status: 400, inhoud: { fout: "Rij " + slecht + " klopt niet." } };

  // Eén rij per auto en veld; staat er toch een dubbele in, dan telt de laatste.
  const uniek = new Map(lijst.map((c) => [c.naam + "|" + c.veld, c]));
  const nu = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM datacorrecties"),
    ...[...uniek.values()].map((c) => env.DB.prepare(
      "INSERT INTO datacorrecties (naam, veld, soort, bron, feed) VALUES (?, ?, ?, ?, ?)"
    ).bind(c.naam, c.veld, c.soort, c.bron, c.feed === undefined ? null : c.feed)),
    env.DB.prepare(
      "INSERT INTO instellingen (sleutel, waarde, gewijzigd, door) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT (sleutel) DO UPDATE SET waarde = excluded.waarde, " +
      "gewijzigd = excluded.gewijzigd, door = excluded.door"
    ).bind(SLEUTEL_ONTVANGEN, JSON.stringify({ feed: String(json.feed || ""), aantal: uniek.size }),
           nu, "generator")
  ]);
  let gecontroleerd = true;
  try {
    await werkBij(env);
  } catch (e) {
    // Bewaard is bewaard; de nachtelijke controle neemt het dan mee.
    console.error("Datafouten na ontvangst:", e.message);
    gecontroleerd = false;
  }
  return { status: 200, inhoud: { bewaard: uniek.size, gecontroleerd } };
}

/* De auto's in de live vloot die (nog) niet in de feed staan, op naam gekoppeld zoals de
   kaart dat doet (metLiveVloot() in map/index.js). Alleen naam, brandstof en
   versnellingsbak: de API geeft ook een exacte plek, maar die heeft hier niets te zoeken. */
const API_BRANDSTOF = {
  gasoline: "benzine", diesel: "diesel", electric: "elektrisch", hybrid: "hybride",
  pluginhybrid: "plug-in hybride", cng: "CNG", lpg: "LPG"
};
const API_BAK = { manual: "manueel", automatic: "automatisch" };

export async function nieuweAutos(env) {
  if (!env.VLOOT_URL || !env.FEED_URL) throw new Error("VLOOT_URL of FEED_URL ontbreekt");
  const [api, feed] = await Promise.all([env.VLOOT_URL, env.FEED_URL].map(async (u) => {
    const r = await fetch(u, { cf: { cacheTtl: 0 } });
    if (!r.ok) throw new Error(new URL(u).hostname + " gaf status " + r.status);
    return r.json();
  }));
  if (!Array.isArray(api)) throw new Error("de vloot is geen lijst");
  const inFeed = new Set(((feed.data && feed.data.vehicles) || []).map((w) => String(w.naam)));
  return api
    .map((v) => ({ v, naam: String((v && v.displayName) || "").trim() }))
    .filter(({ naam }) => naam && !inFeed.has(naam))
    .map(({ v, naam }) => {
      const info = (v && v.vehicleInformation) || {};
      return { naam, brandstof: API_BRANDSTOF[info.fuelType] || "", bak: API_BAK[info.type] || "" };
    })
    .sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}

const SLEUTEL_CONTROLE = "datafouten_controle";

/* De feed ophalen, nakijken en de tabel bijwerken. Geeft { aantal, feed } terug, of
   gooit een fout als de feed niet te lezen is; de tabel blijft dan zoals ze was. */
export async function werkBij(env) {
  if (!env.DB) throw new Error("geen databank");
  if (!env.FEED_URL) throw new Error("FEED_URL staat niet in wrangler.toml");
  const r = await fetch(env.FEED_URL, { cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error("de feed gaf status " + r.status);
  const feed = await r.json();
  const feedDatum = String(feed.last_updated || "");
  const gevonden = controleer(feed, await leesCorrecties(env));
  const nu = new Date().toISOString();

  const { results } = await env.DB.prepare(
    "SELECT sleutel, opgelost, feed_bij_opgelost FROM datafouten").all();
  const bekend = new Map(results.map((r) => [r.sleutel, r]));
  const opdrachten = [];
  for (const f of gevonden) {
    const rij = bekend.get(f.sleutel);
    if (!rij) {
      opdrachten.push(env.DB.prepare(
        "INSERT INTO datafouten (sleutel, auto, station, plaats, regel, fout, gevonden) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(f.sleutel, f.auto, f.station, f.plaats, f.regel, f.fout, nu));
    } else if (rij.opgelost && nieuwer(feedDatum, rij.feed_bij_opgelost)) {
      // Als opgelost gewist, maar een nieuwere feed heeft ze nog: terug in de lijst.
      opdrachten.push(env.DB.prepare(
        "UPDATE datafouten SET fout = ?, station = ?, plaats = ?, gevonden = ?, " +
        "opgelost = '', opgelost_door = '', feed_bij_opgelost = '' WHERE sleutel = ?"
      ).bind(f.fout, f.station, f.plaats, nu, f.sleutel));
    } else {
      opdrachten.push(env.DB.prepare(
        "UPDATE datafouten SET fout = ?, station = ?, plaats = ? WHERE sleutel = ?"
      ).bind(f.fout, f.station, f.plaats, f.sleutel));
    }
  }
  // Niet meer in de feed: verbeterd. Weg, ook als niemand op "opgelost" drukte.
  const nog = new Set(gevonden.map((f) => f.sleutel));
  for (const sleutel of bekend.keys()) {
    if (!nog.has(sleutel)) {
      opdrachten.push(env.DB.prepare("DELETE FROM datafouten WHERE sleutel = ?").bind(sleutel));
    }
  }
  opdrachten.push(env.DB.prepare(
    "INSERT INTO instellingen (sleutel, waarde, gewijzigd, door) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT (sleutel) DO UPDATE SET waarde = excluded.waarde, " +
    "gewijzigd = excluded.gewijzigd, door = excluded.door"
  ).bind(SLEUTEL_CONTROLE, JSON.stringify({ feed: feedDatum, aantal: gevonden.length }), nu,
         "controle"));
  await env.DB.batch(opdrachten);
  return { aantal: gevonden.length, feed: feedDatum };
}

function nieuwer(a, b) {
  const x = Date.parse(a), y = Date.parse(b);
  return Number.isFinite(x) && (!Number.isFinite(y) || x > y);
}

/* De open fouten, voor de beheerpagina, en wanneer er laatst gecontroleerd werd. */
export async function leesOpen(env) {
  const { results } = await env.DB.prepare(
    "SELECT sleutel, auto, plaats, regel, fout, gevonden FROM datafouten " +
    "WHERE opgelost = '' ORDER BY gevonden DESC, auto"
  ).all();
  const status = async (sleutel) => {
    const rij = await env.DB.prepare(
      "SELECT waarde, gewijzigd, door FROM instellingen WHERE sleutel = ?").bind(sleutel).first();
    try {
      return rij ? { wanneer: rij.gewijzigd, door: rij.door, ...JSON.parse(rij.waarde) } : null;
    } catch (e) {
      return null;   // een kapotte rij: dan weten we het niet
    }
  };
  return { fouten: results, laatst: await status(SLEUTEL_CONTROLE),
           ontvangen: await status(SLEUTEL_ONTVANGEN) };
}

/* "Probleem opgelost, wissen": verborgen tot een nieuwere feed dezelfde fout nog heeft. */
export async function markeerOpgelost(env, sleutel, wie) {
  const controle = await env.DB.prepare(
    "SELECT waarde FROM instellingen WHERE sleutel = ?").bind(SLEUTEL_CONTROLE).first();
  let feed = "";
  try { feed = controle ? JSON.parse(controle.waarde).feed || "" : ""; } catch (e) { /* leeg */ }
  await env.DB.prepare(
    "UPDATE datafouten SET opgelost = ?, opgelost_door = ?, feed_bij_opgelost = ? " +
    "WHERE sleutel = ?"
  ).bind(new Date().toISOString(), wie, feed, sleutel).run();
}
