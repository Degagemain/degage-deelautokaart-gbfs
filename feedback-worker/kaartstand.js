/* Wat er op de kaart ingesteld stond toen iemand iets meldde: de zoom en de filters.
   ------------------------------------------------------------------------------------
   De kaart stuurt het mee als `kaartstand` (kaartstand() in map/index.js), zodat wie het
   issue leest weet welke auto's de melder zag. Er zit geen plek in, alleen de zoom.

   Wat de kaart stuurt:

     zoom          het zoomniveau, een getal
     grijs         true als uitgefilterde standplaatsen grijs blijven staan, false als ze
                   verborgen zijn
     filters       alleen de filters die iets wegfilteren:
       soort, klasse, brandstof, bak, toebehoren, afspraken
                   lijsten met de sleutels uit de feed (bv. ["diesel", "benzine"])
       zitplaatsen   ondergrens
       bouwjaar      ondergrens
       euronorm      { van, tot }: rangen 0–10, 10 is elektrisch; tot null = "en hoger"
       ov            { bus|tram|trein: { maxM, minFreq } }; null = geen grens
       ovAlle        true als een standplaats aan alle ingestelde modi moet voldoen

   Iedereen kan dit verzoek zelf in elkaar knutselen, en het komt openbaar in het issue.
   Dus alleen wat hier bekend is, gaat mee: bekende sleutels, getallen binnen hun bereik,
   en korte woorden zonder tekens waar GitHub iets van maakt (@, #, links, Markdown). De
   woorden staan in het issue bovendien tussen backticks. Klopt er iets niet, dan valt dat
   stuk weg; de melding zelf gaat altijd door. */

const LIJSTEN = {
  soort: "Soort",
  klasse: "Prijsklasse",
  brandstof: "Brandstof",
  bak: "Versnellingsbak",
  toebehoren: "Toebehoren",
  afspraken: "Afspraken"
};
const OV_MODI = { bus: "Bus", tram: "Tram", trein: "Trein" };
const WOORD = /^[\p{L}\p{N}][\p{L}\p{N} _+\-.\/]{0,39}$/u;
const MAX_WOORDEN = 20;
const ELEKTRISCH_RANG = 10;

function getalTussen(w, min, max) {
  return typeof w === "number" && Number.isFinite(w) && w >= min && w <= max ? w : null;
}

function geheelTussen(w, min, max) {
  const g = getalTussen(w, min, max);
  return g !== null && Number.isInteger(g) ? g : null;
}

/* De kaartstand zoals hij in het issue mag, of null als er niets bruikbaars in zit. */
export function leesKaartstand(ruw) {
  if (!ruw || typeof ruw !== "object") return null;
  const uit = {};
  const zoom = getalTussen(ruw.zoom, 0, 22);
  if (zoom !== null) uit.zoom = Math.round(zoom * 10) / 10;
  if (typeof ruw.grijs === "boolean") uit.grijs = ruw.grijs;

  const f = ruw.filters && typeof ruw.filters === "object" ? ruw.filters : {};
  const filters = {};
  for (const sleutel of Object.keys(LIJSTEN)) {
    if (!Array.isArray(f[sleutel])) continue;
    const woorden = f[sleutel].slice(0, MAX_WOORDEN)
      .filter((w) => typeof w === "string" && WOORD.test(w));
    if (woorden.length) filters[sleutel] = woorden;
  }
  const zit = geheelTussen(f.zitplaatsen, 1, 99);
  if (zit !== null) filters.zitplaatsen = zit;
  const jaar = geheelTussen(f.bouwjaar, 1900, 2100);
  if (jaar !== null) filters.bouwjaar = jaar;
  if (f.euronorm && typeof f.euronorm === "object") {
    const van = geheelTussen(f.euronorm.van, 0, ELEKTRISCH_RANG);
    const tot = geheelTussen(f.euronorm.tot, 0, ELEKTRISCH_RANG);
    if (van !== null && (tot === null || tot >= van)) filters.euronorm = { van, tot };
  }
  if (f.ov && typeof f.ov === "object") {
    const ov = {};
    for (const modus of Object.keys(OV_MODI)) {
      const m = f.ov[modus];
      if (!m || typeof m !== "object") continue;
      const maxM = geheelTussen(m.maxM, 0, 100000);
      const minFreq = getalTussen(m.minFreq, 0, 100);
      if (maxM !== null || minFreq !== null) ov[modus] = { maxM, minFreq };
    }
    if (Object.keys(ov).length) filters.ov = ov;
    if (Object.keys(ov).length >= 2 && f.ovAlle === true) filters.ovAlle = true;
  }
  uit.filters = filters;
  return "zoom" in uit || Object.keys(filters).length ? uit : null;
}

function normNaam(rang) {
  return rang === ELEKTRISCH_RANG ? "elektrisch" : "Euro " + rang;
}

function afstand(m) {
  return m >= 1000 ? String(m / 1000).replace(".", ",") + " km" : m + " m";
}

/* De regels voor het issue, onder een eigen kop. */
export function kaartstandTekst(stand) {
  const regels = ["### Kaart bij het melden", ""];
  if ("zoom" in stand) regels.push("- **Zoom:** " + String(stand.zoom).replace(".", ","));
  if ("grijs" in stand) {
    regels.push("- **Uitgefilterde auto's:** " + (stand.grijs ? "grijs getoond" : "verborgen"));
  }
  const f = stand.filters;
  const lijn = [];
  for (const [sleutel, label] of Object.entries(LIJSTEN)) {
    if (f[sleutel]) lijn.push(label + ": " + f[sleutel].map((w) => "`" + w + "`").join(", "));
  }
  if (f.zitplaatsen) lijn.push("Zitplaatsen: vanaf " + f.zitplaatsen);
  if (f.euronorm) {
    const { van, tot } = f.euronorm;
    lijn.push("Euronorm: " + (tot === van ? "enkel " + normNaam(van)
      : tot === null ? normNaam(van) + " en hoger"
      : normNaam(van) + " tot en met " + normNaam(tot)));
  }
  if (f.bouwjaar) lijn.push("Bouwjaar: vanaf " + f.bouwjaar);
  for (const [modus, label] of Object.entries(OV_MODI)) {
    const m = f.ov && f.ov[modus];
    if (!m) continue;
    lijn.push(label + ": " + [
      m.maxM !== null ? "hoogstens " + afstand(m.maxM) : "",
      m.minFreq !== null ? "minstens " + String(m.minFreq).replace(".", ",") + "× per uur per richting" : ""
    ].filter(Boolean).join(", "));
  }
  if (f.ovAlle) lijn.push("Openbaar vervoer: aan alle ingestelde voldoen");
  regels.push(lijn.length ? "- **Filters:**" : "- **Filters:** geen");
  for (const l of lijn) regels.push("  - " + l);
  return regels;
}
