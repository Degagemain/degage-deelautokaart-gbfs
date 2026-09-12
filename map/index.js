/* De logica van de deelautokaart van Dégage.
   ------------------------------------------------------------------------------------
   Hoort bij `index.html`, dat de structuur en de pictogrammen draagt, bij `index.css`,
   dat de opmaak draagt, en bij `taal/*.js`, dat de teksten draagt. Ze worden alle vier
   door de browser rechtstreeks gelezen: geen bouwstap, geen module, geen `import`.

   Dit bestand wordt met een gewone <script>-tag onderaan `index.html` geladen, ná
   Leaflet en ná de taalbestanden. Die volgorde is geen toeval:

   · Leaflet en Leaflet.markercluster moeten er zijn, want `L` wordt hier meteen gebruikt.
   · De taalbestanden moeten er zijn, want `TALEN` wordt uit `window.DEGAGE_TALEN`
     afgeleid zodra dit bestand begint te draaien.
   · De opmaak moet er zijn, want er wordt hieronder rechtstreeks in de pagina gezocht
     (`$("paneel")` en zo). Vandaar onderaan de body en niet in de kop.

   Verplaats de scripttag dus niet naar boven zonder `defer`, en zet er geen `async` op:
   dan is de volgorde niet meer gegarandeerd en breekt het op een plek die niets met de
   oorzaak te maken heeft.

   Wat waar staat, van boven naar beneden:

     instellingen        GBFS_BASIS, FOTO_BASIS — de enige twee paden die je moet
                         aanpassen als de feed of de fotomap verhuist
     taal                de opzoekfuncties bij taal/*.js
     kaartinstelling     startbeeld, bbox, de vlaggen uit de feed, de euronormschaal
     kaart               de Leaflet-kaart, de tegels, het clusteren
     hulpjes             ontsnappen, datums, meervoud
     data                `staat` — alles wat de kaart weet — en het inladen van de feed
     filters             de filterlijst opbouwen en toepassen
     tekenen             popups, markers, de telling
     bediening           de kaartknoppen, het paneel, de instellingen
     adres zoeken        naamtreffers, Nominatim, de balk met dichtstbijzijnde wagens
     de huidige locatie  "Wagens in mijn buurt"
     van taal wisselen   alles opnieuw laten opschrijven zonder te herladen
*/
"use strict";

/* ==========================================================================
   DE ENIGE INSTELLING DIE JE MOET AANPASSEN ALS DE FEED VERHUIST
   ==========================================================================
   Relatief pad vanaf deze pagina naar de map met de GBFS-bestanden. Standaard staat
   de kaart in `map/` en de feed in `gbfs/`, dus één map omhoog. Zet hier de volledige
   publieke URL zodra de feed op zijn eigen adres staat (zie de open punten in SCOPE.md).
   Let op: bij een absolute URL op een ánder domein moet die server CORS toestaan. */
const GBFS_BASIS = "../gbfs";

/* Map met de stockfoto's per merk+model, opgehaald door `scripts/haal_stockfotos.py`.
   Ontbreekt de map of het manifest, dan werkt de kaart gewoon zonder foto's — ze zijn
   een verrijking, geen voorwaarde. */
const FOTO_BASIS = "fotos";

/* Twee verrijkingen naast de feed, allebei optioneel: ontbreekt het bestand, dan staat
   dat stuk gewoon niet in de popup. Ze komen uit scripts/haal_bereik.py en
   scripts/haal_ov.py, die net als het fotoscript buiten de generator draaien. */
const BEREIK_BESTAND = "bereik.json";
const OV_BESTAND = "ov.json";

/* ==========================================================================
   TAAL
   ==========================================================================
   De teksten staan NIET in dit bestand maar in `taal/nl.js`, `taal/fr.js` en
   `taal/en.js`, die hierboven met een gewone <script>-tag geladen worden. Geen bouwstap
   en geen module: elk bestand hangt zichzelf in `window.DEGAGE_TALEN`, en omdat een
   klassieke scripttag blokkeert, staat alles er al voor deze code begint.

   Waarom apart: het waren driehonderd regels tekst midden in de kaartlogica, en wie een
   zin wil bijschaven hoort daarvoor geen kaartcode te hoeven doorbladeren. Wie een taal
   toevoegt, zet één bestand neer en één scriptregel erbij — de keuzelijst en de
   taaldetectie volgen vanzelf.

   Welke taal het wordt:
   · `?taal=fr` (of `?lang=fr`) in de URL — voor de inbedding: de pagina eromheen weet
     in welke taal ze staat en kan dat meegeven.
   · anders de keuze die de bezoeker zelf eerder maakte (localStorage).
   · anders de browsertaal, uit `navigator.languages`.
   · anders Nederlands.

   Wat NIET vertaald wordt: eigennamen (Dégage, OpenStreetMap, Wikimedia Commons), de
   autonamen en de merken en modellen uit de feed, en de euronormen ("Euro 5" is overal
   Euro 5). De gesloten lijstjes uit de brondata — brandstof, carrosserie, bak,
   toebehoren — wél; zie de tabel `waarden` in de taalbestanden. */
const TAAL_SLEUTEL = "degage-kaart-taal";
/* De taal waarop alles terugvalt. Ontbreekt een sleutel in de gekozen taal, dan komt de
   zin hiervandaan: een vergeten vertaling geeft zo een Nederlandse zin en geen gat. */
const STANDAARDTAAL = "nl";

/* De talen die werkelijk geladen zijn, in de volgorde van de scripttags — en dat is
   meteen de volgorde van de keuzelijst. Afgeleid en niet vastgelegd: een taal die niet
   geladen is, hoort ook niet te kiezen te zijn. */
const TALEN = Object.keys(window.DEGAGE_TALEN || {});
/* Geen enkel taalbestand geladen is een publicatiefout, geen toestand om door te
   draaien alsof er niets aan de hand is. De melding onderaan moet dan blijven staan,
   ook nadat het laden klaar is — vandaar deze vlag. */
const TAALBESTANDEN_ONTBREKEN = TALEN.length === 0;

function taalblok(code) {
  return (window.DEGAGE_TALEN || {})[code] || null;
}

/* Welke taal het wordt. De volgorde staat hierboven uitgelegd. `localStorage` kan gooien
   in een iframe met strenge cookie-instellingen; dat mag de kaart niet breken, dus alle
   toegang gaat door deze twee functies heen. */
function bewaardeTaal() {
  try {
    return localStorage.getItem(TAAL_SLEUTEL);
  } catch (e) {
    return null;
  }
}

function bewaarTaal(code) {
  try {
    localStorage.setItem(TAAL_SLEUTEL, code);
  } catch (e) {
    /* Niets aan te doen; de keuze geldt dan alleen voor dit bezoek. */
  }
}

function kiesTaal() {
  const uitUrl = new URLSearchParams(location.search);
  const gevraagd = uitUrl.get("taal") || uitUrl.get("lang");
  const kandidaten = [gevraagd, bewaardeTaal(), ...(navigator.languages || [navigator.language])];
  for (const kandidaat of kandidaten) {
    if (!kandidaat) continue;
    // "fr-BE", "FR" en "fr" moeten alle drie op Frans uitkomen.
    const code = String(kandidaat).toLowerCase().slice(0, 2);
    if (TALEN.includes(code)) return code;
  }
  return STANDAARDTAAL;
}

let taal = kiesTaal();

/* De tekst bij een sleutel, met {naam} vervangen door wat er in `vars` staat. Ontbreekt
   de sleutel in de gekozen taal, dan valt hij terug op het Nederlands: een vergeten
   vertaling geeft zo een Nederlandse zin en geen lege plek of sleutelnaam in beeld. */
function t(sleutel, vars) {
  const gekozen = taalblok(taal);
  const terugval = taalblok(STANDAARDTAAL);
  let tekst = gekozen && gekozen.teksten ? gekozen.teksten[sleutel] : undefined;
  if (tekst === undefined && terugval && terugval.teksten) {
    tekst = terugval.teksten[sleutel];
  }
  // Geen enkel taalbestand geladen: dan is de sleutel zelf het eerlijkste wat we hebben.
  if (tekst === undefined) return sleutel;
  if (!vars) return tekst;
  return tekst.replace(/\{(\w+)\}/g, (heel, naam) =>
    (vars[naam] !== undefined ? String(vars[naam]) : heel));
}

/* Een waarde uit de brondata in de taal van de bezoeker; onbekend blijft onvertaald. */
function waarde(w) {
  const blok = taalblok(taal);
  return (blok && blok.waarden && blok.waarden[w]) || w;
}

function vlagLabel(sleutel) {
  const gekozen = taalblok(taal);
  const terugval = taalblok(STANDAARDTAAL);
  return (gekozen && gekozen.vlaggen && gekozen.vlaggen[sleutel]) ||
         (terugval && terugval.vlaggen && terugval.vlaggen[sleutel]) || sleutel;
}

/* De schrijfwijze voor getallen en datums, uit het taalbestand. */
function locale() {
  const blok = taalblok(taal);
  return (blok && blok.locale) || "nl-BE";
}

/* Getallen in de schrijfwijze van de taal: 1.234 wordt 1 234 in het Frans. */
function getal(n) {
  return n.toLocaleString(locale());
}

/* Alle statische teksten in de opmaak. Vier attributen, omdat een tekst nu eens de
   inhoud van een element is en dan weer een titel, een tekstballon voor een schermlezer
   of een plaatshouder. `data-i18n-html` bestaat alleen voor de legende, die een <strong>
   in het midden van haar zin heeft staan. */
function vertaalPagina() {
  document.documentElement.lang = taal;
  document.title = t("app.titel");
  const paren = [
    ["data-i18n", (el, tekst) => { el.textContent = tekst; }],
    ["data-i18n-html", (el, tekst) => { el.innerHTML = tekst; }],
    ["data-i18n-title", (el, tekst) => { el.title = tekst; }],
    ["data-i18n-aria", (el, tekst) => { el.setAttribute("aria-label", tekst); }],
    ["data-i18n-plh", (el, tekst) => { el.placeholder = tekst; }]
  ];
  for (const [attribuut, zet] of paren) {
    document.querySelectorAll("[" + attribuut + "]").forEach((el) => {
      zet(el, t(el.getAttribute(attribuut)));
    });
  }
}

/* Startbeeld — vastgelegd in SCOPE.md, sectie "Kaartinstelling". */
const CENTRUM        = [51.0553, 3.7412];   // mediaan van de vloot, Gent
const STARTBEELD_M   = 50000;               // vierkant van 50 km = ±25 km rondom
const VOLLEDIGE_BBOX = [[50.7249, 2.7098], [51.2461, 4.7341]];

/* De vlaggen uit FEEDSPEC.md. Alleen positief: een sleutel die niet in het bestand
   staat, wordt nooit getoond.

   Ze staan in twee groepen omdat ze twee verschillende dingen zijn. Wat er ín of ààn de
   wagen zit, is een toebehoren. Of je er een hond in mag zetten of ermee mag leren
   rijden, is geen eigenschap van de wagen maar een afspraak met de eigenaar — dat hoort
   niet onder dezelfde kop. Filtertechnisch gedragen ze zich identiek.

   Alleen de sleutels staan hier; het label komt uit de tabel `vlaggen` in het
   taalbestand van de bezoeker (zie `taal/nl.js`). Alfabetisch gesorteerd wordt er pas bij het tekenen, want de volgorde hangt
   van dat label af — zie vulKeuzes(). */
const TOEBEHOREN = ["aanhanger", "bed", "fietsdrager", "gps", "kinderzitje", "trekhaak"];
const AFSPRAKEN = ["huisdieren", "leren_autorijden"];
/* Voor de popup: één lijst, zodat elke vlag die een wagen draagt ook getoond wordt. */
const ALLE_VLAGGEN = [...TOEBEHOREN, ...AFSPRAKEN];

/* ==========================================================================
   EURONORM — een schaal, en waar elektrisch en hybride daarop staan
   ==========================================================================
   De euronorm staat als "Euro 3".."Euro 6" in het bestand, of hij ontbreekt. Ontbreken
   betekent "onbekend", niet "geen norm": van 60 van de 568 wagens is de bronwaarde leeg,
   'nvt' of dubbelzinnig ('5 of 6'), en de generator raadt daar niet.

   ELEKTRISCH EN HYBRIDE STAAN HIER BOVENAAN OP DE SCHAAL, boven de hoogste euronorm.
   Dat verdient uitleg, want het is een keuze van deze kaart en geen feit uit de data:

   · Waarom? De euronorm is voor de bezoeker een schaal van "vuil" naar "schoon". Een
     elektrische wagen hoort aan de schone kant, maar heeft in de bron vaak geen
     bruikbare norm — 44 van de 65 elektrische wagens staan er leeg, op 'nvt' of op '*'.
     Zonder deze afspraak zouden net de schoonste wagens uit het filter vallen, en dat
     leest als een fout in de kaart.
   · Ze krijgen daarom een eigen trede met een EIGEN NAAM, "elektrisch en hybride", en
     uitdrukkelijk NIET een verzonnen euronorm. Euro 7 bestaat echt en komt eraan; die
     naam hier gebruiken zou botsen zodra er een échte Euro 7-wagen in de vloot komt,
     en zou bovendien een keuring beweren die deze wagens niet hebben.
   · De rang is daarom 10: hoog genoeg om altijd bovenaan te staan, en ver genoeg van de
     echte reeks (Euro 1 t/m 6, straks 7) om er nooit mee te kunnen botsen. Verschijnt
     er ooit een echte Euro 7, dan schuift die gewoon op zijn eigen plek ertussen.
   · In `degage_vehicles.json` staat hier niets van. De feed draagt de echte norm of
     geen veld, en het schema laat alleen Euro 1 t/m 6 toe. Deze afspraak leeft
     uitsluitend in de kaart.

   De schuif toont dit ook letterlijk aan de bezoeker, zodat niemand denkt dat er een
   keuringsbewijs achter zit. */
const ELEKTRISCH_HYBRIDE = new Set(["elektrisch", "hybride", "plug-in hybride"]);
const ELEKTRISCH_HYBRIDE_RANG = 10;

/* De rang van een wagen op die schaal, of null als we het niet weten. Alleen wagens met
   een gekende rang kunnen door een ondergrens: "minstens Euro 5" kan niet waar zijn van
   een wagen waarvan we de norm niet kennen. */
function euronormRang(w) {
  if (ELEKTRISCH_HYBRIDE.has(w.brandstof)) return ELEKTRISCH_HYBRIDE_RANG;
  const m = /^Euro (\d)$/.exec(w.euronorm || "");
  return m ? Number(m[1]) : null;
}

/* De naam van een trede. De bovenste trede draagt geen normnummer, want ze ís er geen. */
function rangNaam(rang) {
  return rang === ELEKTRISCH_HYBRIDE_RANG ? t("norm.elektrisch") : "Euro " + rang;
}

const $ = (id) => document.getElementById(id);

/* ==========================================================================
   kaart
   ========================================================================== */
const kaart = L.map("kaart", {
  center: CENTRUM,
  zoom: 10,                                   // vangnet: zie zetStartbeeld() hieronder
  zoomControl: true,
  scrollWheelZoom: true,
  tap: true
});

/* Startbeeld pas zetten als de kaart een échte hoogte en breedte heeft.
   ------------------------------------------------------------------------------------
   Dit is geen overdreven voorzichtigheid, het is de klassieke manier waarop een Leaflet
   in een iframe stukloopt: Leaflet meet zijn container één keer bij het opstarten en
   onthoudt die maat. Krijgt de iframe zijn hoogte pas ná het laden — en dat doet hij in
   WordPress vaak, door een thema, een lazy-load of een tab die nog dicht staat — dan
   heeft Leaflet 0 bij 0 gemeten. `fitBounds` rekent dan zoomniveau 0 uit en de bezoeker
   ziet één tegel van de wereldbol met één cluster erop, zonder enige foutmelding.
   Vandaar: één keer het startbeeld zetten zodra er een echte maat is, en bij élke
   maatwijziging `invalidateSize()` zodat de kaart blijft kloppen. Het startbeeld wordt
   maar één keer gezet — wie al gepand heeft, wordt niet teruggeworpen. */
let startbeeldGezet = false;

function zetStartbeeld() {
  if (startbeeldGezet || kaart.getSize().x === 0 || kaart.getSize().y === 0) return;
  kaart.fitBounds(L.latLng(CENTRUM[0], CENTRUM[1]).toBounds(STARTBEELD_M));
  startbeeldGezet = true;
}

zetStartbeeld();

function hermeet() {
  kaart.invalidateSize({ animate: false });
  zetStartbeeld();
}

/* Bewust ALLEBEI, niet het één of het ander. Een ResizeObserver vangt wat het venster
   niet ziet — een iframe die van hoogte verandert, een tab of accordeon die opengaat —
   maar hij wordt pas afgeleverd als de pagina een tekenbeurt krijgt. Staat de kaart in
   een verborgen paneel, dan gebeurt dat niet. Het vensterevent en `pageshow` (terug uit
   de bfcache) zijn het vangnet. `invalidateSize` is goedkoop en idempotent, dus dubbel
   werk kost niets. */
if (typeof ResizeObserver === "function") {
  new ResizeObserver(hermeet).observe(document.getElementById("kaart"));
}
window.addEventListener("resize", hermeet);
window.addEventListener("orientationchange", hermeet);
window.addEventListener("pageshow", hermeet);

/* OpenStreetMap-tegels. De attributie is een LICENTIEVOORWAARDE en mag niet weg; alleen
   het zinnetje eromheen vertaalt mee, de naam en de link blijven staan. */
const OSM_LINK = '<a href="https://www.openstreetmap.org/copyright" target="_blank" ' +
                 'rel="noopener">OpenStreetMap</a>';
/* Welke tegels bij welke taal.
   ------------------------------------------------------------------------------------
   De standaardtegels van tile.openstreetmap.org tekenen de plaatsnamen zoals ze ter
   plaatse heten en kennen geen taalkeuze: "Gent", ook voor wie de kaart in het Frans
   leest. OpenStreetMap France tekent dezelfde gegevens met de Franse naam waar die
   bestaat — "Gand", "Anvers", "Courtrai" — in een stijl die dicht bij de standaardkaart
   ligt. Voor Frans nemen we dus die.

   Voor Engels bestaat er geen vrij bruikbare rasterkaart met Engelse namen; Engels krijgt
   de standaardtegels, net als Nederlands en elke taal zonder eigen regel hieronder.

   `bron` is de naamsvermelding van de tegelserver, bovenop die van OpenStreetMap zelf;
   OSM France vraagt ze uitdrukkelijk. */
const TEGELS_STANDAARD = { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", bron: null };
const TEGELS_PER_TAAL = {
  fr: {
    url: "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
    bron: '<a href="https://www.openstreetmap.fr/" target="_blank" rel="noopener">' +
          "OpenStreetMap France</a>"
  }
};
/* OSM France draait op vrijwilligers. Valt die server uit, dan schakelen we voor de rest
   van het bezoek terug naar de standaardtegels: een Nederlandse plaatsnaam is beter dan
   een lege kaart. Een paar mislukte tegels zijn nog geen storing, vandaar een drempel. */
const TEGELFOUTEN_MAX = 6;
let tegelfouten = 0;
let tegelsTerugval = false;

function tegelsVoorTaal() {
  return (!tegelsTerugval && TEGELS_PER_TAAL[taal]) || TEGELS_STANDAARD;
}

function osmAttributie() {
  const bron = tegelsVoorTaal().bron;
  return t("kaart.attributie", { link: OSM_LINK }) +
         (bron ? " | " + t("kaart.tegelbron", { link: bron }) : "");
}

const tegels = L.tileLayer(tegelsVoorTaal().url, {
  maxZoom: 19,
  attribution: osmAttributie()
}).addTo(kaart);

tegels.on("tileerror", () => {
  if (tegelsVoorTaal() === TEGELS_STANDAARD) return;
  if (++tegelfouten < TEGELFOUTEN_MAX) return;
  console.warn("De tegels voor '" + taal + "' laden niet; terug naar de standaardtegels.");
  tegelsTerugval = true;
  vertaalKaart();
});

const clusters = L.markerClusterGroup({
  maxClusterRadius: 48,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  chunkedLoading: true,
  /* Klaar met (opnieuw) inladen: nu pas is te zien welke pins los staan. Zie toonNamen().
     Niet bij nul markers: de groep meldt zich al zo bij kaart.addLayer() hieronder, nog
     vóór toonNamen() en haar constanten bestaan — en een lege lijst valt er niets te tonen.
     teken() roept toonNamen() daarna zelf ook aan. */
  chunkProgress: (verwerkt, totaal) => { if (totaal > 0 && verwerkt === totaal) toonNamen(); },
  /* De bol toont het aantal standplaatsen dat DOOR HET FILTER KOMT, niet het aantal
     markers dat er toevallig in zit. Anders zou een cluster "47" zeggen terwijl het
     paneel "12 van 568" meldt, en dan klopt een van de twee niet.

     Zit er niets passends in, dan is het een grijze bol met het aantal uitgefilterde
     standplaatsen — die is dan puur context. */
  iconCreateFunction(cluster) {
    const kinderen = cluster.getAllChildMarkers();
    const totaal = kinderen.length;
    const actief = kinderen.reduce((n, m) => n + (m.options.actief ? 1 : 0), 0);

    /* Zonder filter is elke standplaats actief en zegt "565/565" niets — dan gewoon het
       aantal. Staat er wél een filter aan, dan toont de bol "actief/totaal": zo is in
       één oogopslag te zien hoeveel er hier passen én hoeveel er staan. Alleen het
       actieve getal tonen zou de grijze stippen eronder onverklaard laten. */
    const breuk = actief < totaal;
    const tekst = breuk ? actief + "/" + totaal : String(totaal);
    const maat = totaal < 10 ? "s" : (totaal < 100 ? "m" : "l");

    return L.divIcon({
      html: '<div class="cluster cluster--' + maat +
            (breuk ? " cluster--breuk" : "") +
            (actief === 0 ? " cluster--grijs" : "") +
            '">' + tekst + "</div>",
      className: "",
      iconSize: null
    });
  }
});
kaart.addLayer(clusters);

/* Vanaf deze zoom staan de autonamen naast hun pin. Het clusteren houdt de drukte
   vanzelf in de hand: pins die te dicht bij elkaar liggen zitten dan nog in een cluster
   en staan niet als losse marker op de kaart — en zonder marker geen label. Zelfs in het
   drukste stuk van Gent blijft het daardoor bij een veertigtal labels in beeld.

   De labels hangen aan de markers (zie `teken()`); hier gaat alleen de schakelaar om,
   want een klasse op de kaart is goedkoper dan bij elke zoomstap honderden labels aan-
   en afkoppelen. */
/* Altijd vanaf NAAM_ZOOM — maar daarvóór ook al, zodra er weinig genoeg losse pins in
   beeld staan. Een vaste zoom alleen zei niets over wat je ziet: boven een dorp staan er
   op zoom 11 een handvol losse pins met ruimte genoeg voor hun naam, boven Gent honderden
   in clusters. Wat telt, is hoeveel namen er in beeld zouden komen; tot
   NAMEN_MAX_IN_BEELD blijft dat leesbaar — zoveel staan er op zoom 14 in het drukste stuk
   van Gent ook. Dezelfde gedachte als DICHTBIJ_MAX_IN_BEELD bij de balk onderaan.

   Alleen losse, passende pins tellen: een pin in een cluster heeft geen label, een grijze
   pin ook niet (zie teken()). */
const NAAM_ZOOM = 14;
const NAMEN_MAX_IN_BEELD = 40;
let markersNu = [];   // de markers van de laatste teken(), voor toonNamen()

function toonNamen() {
  let aan = kaart.getZoom() >= NAAM_ZOOM;
  if (!aan) {
    const venster = kaart.getBounds();
    let n = 0;
    for (const m of markersNu) {
      if (!m.options.actief || clusters.getVisibleParent(m) !== m) continue;
      if (venster.contains(m.getLatLng()) && ++n > NAMEN_MAX_IN_BEELD) break;
    }
    aan = n <= NAMEN_MAX_IN_BEELD;
  }
  document.getElementById("kaart").classList.toggle("toont-namen", aan);
}

/* Zoomt de kaart naar NAAM_ZOOM of verder, dan meteen aan bij het BEGIN van de animatie,
   zodat de namen met de beweging meekomen in plaats van erachteraan te hobbelen. Al het
   andere pas als de kaart stilstaat: welke pins los staan, weet de clustergroep pas na
   haar eigen animatie — vandaar ook `animationend`. */
kaart.on("zoomanim", (e) => {
  if (e.zoom >= NAAM_ZOOM) document.getElementById("kaart").classList.add("toont-namen");
});
kaart.on("moveend", toonNamen);
clusters.on("animationend", toonNamen);

/* ==========================================================================
   hulpjes
   ========================================================================== */
function ontsnap(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/* Datum uit het RFC3339-veld `last_updated`. Bewust met een regex uit de string zelf en
   niet via `new Date()`: dat zou de datum in de tijdzone van de bezoeker leggen en kan
   er een dag naast zitten. De feed beschrijft een dumpdatum, geen moment. */
function datumInWoorden(stempel) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(stempel || ""));
  if (!m) return null;
  return Number(m[3]) + " " + t("maanden")[Number(m[2]) - 1] + " " + m[1];
}

function meervoud(n) {
  return getal(n) + " " + t(n === 1 ? "telling.wagen" : "telling.wagens");
}

/* ==========================================================================
   data
   ========================================================================== */
/* Hoeveel meter de coördinaten in de feed bewust opzij gezet zijn. Komt uit
   `degage_vehicles.json` en niet uit een constante hier: de generator bepaalt het getal,
   en een tweede plek zou er stilletjes naast kunnen gaan staan. Ontbreekt het veld — een
   oudere feed — dan zegt de kaart er niets over. */
let locatieVaagheid = null;

const staat = {
  stations: [],           // { station_id, lat, lon, plaats, wagens[] }
  brandstoffen: [],       // gesorteerd op aantal, aflopend
  soorten: [],            // personenwagen / bestelwagen, gesorteerd op aantal
  zitplaatsen: [],        // de zitplaatsaantallen die voorkomen, oplopend
  minZit: null,           // gekozen ondergrens; null = geen zitplaatsfilter
  bakken: [],             // manueel / automatisch, gesorteerd op aantal
  normRangen: [],         // de rangen die voorkomen, oplopend (bv. [3,4,5,6,7])
  minNorm: null,          // gekozen ondergrens; null = geen euronormfilter
  jaren: [],              // alle bouwjaren die in de data voorkomen, oplopend
  fotos: {},              // "merk|model" -> { bestand, licentie, auteur, bronpagina }
  bereik: {},             // "merk|model|bouwjaar" (of "merk|model") -> { km: [van, tot], ... }
  ov: null,               // map/ov.json, maar alleen als het bij deze feed hoort
  jaarVan: null,          // gekozen ondergrens bouwjaar; null = geen bouwjaarfilter
  busDrempels: [],        // de standen van de halteschuif, in meter, aflopend
  maxBus: null,           // gekozen bovengrens afstand tot een halte; null = geen filter
  treinDrempels: [],      // de standen van de stationsschuif, in meter, aflopend
  maxTrein: null,         // gekozen bovengrens afstand tot een station; null = geen filter
  grijsTonen: true,       // uitgefilterde standplaatsen grijs laten staan i.p.v. verbergen
  gekozenBrandstof: new Set(),
  gekozenSoort: new Set(),
  gekozenBak: new Set(),
  gekozenVlaggen: new Set(),   // toebehoren én afspraken; de sleutels zijn uniek
  totaalWagens: 0,
  bijgewerkt: null        // `last_updated` uit de feed, voor de datumregel
};

/* ==========================================================================
   merkveld rechttrekken
   ========================================================================== */
/* Bij een handvol wagens staat het model in het MERK en het trimniveau in het model:
   merk "Fiat Panda", model "1.2 Easy". Drie andere Panda's in dezelfde vloot staan wél
   als merk "Fiat", model "Panda". De fotosleutel is "merk|model", dus zonder correctie
   is dat een andere sleutel dan "Fiat|Panda" en blijft die ene wagen zonder de foto die
   er al ligt. Elf combinaties in de huidige vloot zitten in dat geval.

   Dezelfde regel staat in `scripts/haal_stockfotos.py` (`normaliseer()`), zodat het
   script naar dezelfde sleutel zoekt als de kaart hier opvraagt. Wijzigt de ene, wijzig
   dan de andere mee.

   Er wordt niets geraden: het merkveld wordt op de spaties geknipt en een splitsing
   telt alleen als de VLOOT ZELF die combinatie elders kent. "Fiat Panda" wordt "Fiat" +
   "Panda" omdat er echte Fiat-Panda's staan; "Alfa Romeo" blijft heel omdat geen wagen
   merk "Alfa" en model "Romeo" heeft. Van achteren naar voren geknipt, dus het langste
   merk en daarbinnen het langste model winnen.

   Dit raakt alleen de FOTOSLEUTEL. In de popup blijft staan wat de dump zegt —
   "Fiat Panda 1.2 Easy" — want dat is wat er op het inschrijvingsbewijs staat. */
/* Kleine letters, zonder accenten, alleen letters en cijfers — om op te vergelijken.
   Niet `zoeksleutel()` hergebruikt: die laat leestekens staan, waardoor "CEE'D" en
   "Cee'd" wel matchen maar "Golf-Break" en "Golf Break" niet. Dit is letterlijk de
   `kaal()` uit het ophaalscript, inclusief het uit elkaar halen van letters en cijfers
   ("500L" wordt "500 l"), zodat beide kanten dezelfde combinaties herkennen. */
function vergelijkbaar(s) {
  return " " + (s || "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ")
    .replace(/([a-z])([0-9])/g, "$1 $2").replace(/([0-9])([a-z])/g, "$1 $2")
    .trim() + " ";
}

function vlootindex(wagens) {
  const index = new Map();
  const paren = [...new Set(wagens.map((w) => w.merk + "|" + w.model))].sort();
  for (const paar of paren) {
    const sleutel = vergelijkbaar(paar.split("|")[0]) + "|" +
                    vergelijkbaar(paar.split("|").slice(1).join("|"));
    if (!index.has(sleutel)) index.set(sleutel, paar);
  }
  return index;
}

function fotoSleutel(w, index) {
  const woorden = w.merk.split(/\s+/).filter(Boolean);
  for (let i = woorden.length - 1; i > 0; i--) {
    const merkdeel = woorden.slice(0, i).join(" ");
    const rest = woorden.slice(i);
    for (let j = rest.length; j > 0; j--) {
      const treffer = index.get(vergelijkbaar(merkdeel) + "|" +
                                vergelijkbaar(rest.slice(0, j).join(" ")));
      if (treffer) return treffer;
    }
  }
  return w.merk + "|" + w.model;
}

async function haal(naam) {
  const url = GBFS_BASIS.replace(/\/$/, "") + "/" + naam + ".json";
  const antwoord = await fetch(url, { cache: "no-cache" });
  if (!antwoord.ok) throw new Error(t("fout.status", { naam: naam, status: antwoord.status }));
  return antwoord.json();
}

/* De foto's zijn optioneel: is het manifest er niet, dan blijft `staat.fotos` leeg en
   toont de popup gewoon geen foto. Een ontbrekende verrijking mag de kaart niet breken,
   dus dit vangt zijn eigen fout op in plaats van `laden()` te laten struikelen. */
async function laadFotos() {
  try {
    const antwoord = await fetch(FOTO_BASIS + "/fotos.json", { cache: "no-cache" });
    if (!antwoord.ok) return;
    staat.fotos = (await antwoord.json()).fotos || {};
  } catch (e) {
    console.info("geen stockfoto's geladen:", e.message);
  }
}

/* Het rijbereik van de elektrische modellen. Optioneel, net als de foto's. */
async function laadBereik() {
  try {
    const antwoord = await fetch(BEREIK_BESTAND, { cache: "no-cache" });
    if (!antwoord.ok) return;
    staat.bereik = (await antwoord.json()).modellen || {};
  } catch (e) {
    console.info("geen rijbereik geladen:", e.message);
  }
}

/* De bereikbaarheid met openbaar vervoer. Geeft het bestand terug in plaats van het meteen
   in `staat` te zetten: eerst moet vaststaan dat het bij de feed hoort, en die is op dit
   moment nog niet binnen. Zie laden(). */
async function laadOv() {
  try {
    const antwoord = await fetch(OV_BESTAND, { cache: "no-cache" });
    if (!antwoord.ok) return null;
    return await antwoord.json();
  } catch (e) {
    console.info("geen OV-gegevens geladen:", e.message);
    return null;
  }
}

async function laden() {
  const [stationBestand, wagenBestand, , , ovBestand] = await Promise.all([
    haal("station_information"),
    haal("degage_vehicles"),
    laadFotos(),
    laadBereik(),
    laadOv()
  ]);

  const wagensPerStation = new Map();
  /* Eén keer over de hele feed voor de index, daarna per wagen de sleutel erbij zetten:
     `fotoHtml()` draait bij elke popup en hoeft dit dan niet opnieuw uit te rekenen. */
  const index = vlootindex(wagenBestand.data.vehicles);
  for (const w of wagenBestand.data.vehicles) {
    w.fotoSleutel = fotoSleutel(w, index);
    if (!wagensPerStation.has(w.station_id)) wagensPerStation.set(w.station_id, []);
    wagensPerStation.get(w.station_id).push(w);
  }

  staat.stations = stationBestand.data.stations.map((s) => ({
    station_id: s.station_id,
    lat: s.lat,
    lon: s.lon,
    wagens: wagensPerStation.get(s.station_id) || []
  })).filter((s) => s.wagens.length > 0);

  staat.totaalWagens = staat.stations.reduce((n, s) => n + s.wagens.length, 0);

  /* Brandstoffen uit de data halen in plaats van ze hier vast te leggen: duikt er in een
     volgende dump een achtste op, dan verschijnt die vanzelf in het filter. */
  const telling = new Map();
  for (const s of staat.stations) {
    for (const w of s.wagens) telling.set(w.brandstof, (telling.get(w.brandstof) || 0) + 1);
  }
  /* Alle keuzelijsten alfabetisch. Op aantal sorteren zet de grootste groep vooraan,
     maar dan verspringt de volgorde bij elke nieuwe dump en moet je elke keer opnieuw
     zoeken waar iets staat. Alfabetisch blijft staan waar het stond. */
  staat.brandstoffen = [...telling.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl"));

  /* Versnellingsbak, euronorm en bouwjaar op dezelfde manier uit de data halen: wat er
     niet in staat, verschijnt niet als keuze, en wat er wél in staat verschijnt vanzelf. */
  const bakTelling = new Map();
  const soortTelling = new Map();
  const zitTelling = new Map();
  const rangen = new Set();
  const jaren = new Set();
  for (const s of staat.stations) {
    for (const w of s.wagens) {
      if (w.versnellingsbak) {
        bakTelling.set(w.versnellingsbak, (bakTelling.get(w.versnellingsbak) || 0) + 1);
      }
      if (w.carrosserie) {
        soortTelling.set(w.carrosserie, (soortTelling.get(w.carrosserie) || 0) + 1);
      }
      if (w.zitplaatsen) zitTelling.set(w.zitplaatsen, (zitTelling.get(w.zitplaatsen) || 0) + 1);
      /* Eén keer uitrekenen en bij de wagen bewaren: `teken()` loopt bij elke
         filterwijziging over alle 568 wagens. */
      w.normRang = euronormRang(w);
      if (w.normRang !== null) rangen.add(w.normRang);
      if (w.bouwjaar) jaren.add(w.bouwjaar);
    }
  }
  staat.bakken = [...bakTelling.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl"));
  staat.soorten = [...soortTelling.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl"));
  /* Zitplaatsen blijven numeriek oplopend — het is een schaal, geen lijst namen. */
  staat.zitplaatsen = [...zitTelling.keys()].sort((a, b) => a - b);
  staat.normRangen = [...rangen].sort((a, b) => a - b);
  staat.jaren = [...jaren].sort((a, b) => a - b);
  staat.jaarVan = null;

  locatieVaagheid = wagenBestand.locatie_nauwkeurigheid_m || null;
  staat.bijgewerkt = stationBestand.last_updated;

  /* De OV-gegevens alleen als ze bij DEZE feed horen. Een standplaats kan tussen twee
     dumps verhuizen en toch hetzelfde station_id houden; zonder deze test zou ze dan de
     bereikbaarheid van haar oude adres dragen — een fout die niemand zou opmerken. */
  if (ovBestand && ovBestand.voor_feed === stationBestand.last_updated) {
    staat.ov = ovBestand;
  } else if (ovBestand) {
    console.warn("map/ov.json hoort bij een andere feed (" + ovBestand.voor_feed +
                 ") en wordt niet getoond. Draai scripts/haal_ov.py opnieuw.");
  }
  toonDatum();

  bouwFilters();
  teken();   // roept ook bijwerkenAutoDichtbij() aan — staat de kaart al ver genoeg
             // ingezoomd (of de vloot klein genoeg), dan verschijnt de balk meteen
  // Staat er een publicatiefout in beeld, dan blijft die staan: die gaat niet over laden.
  if (!TAALBESTANDEN_ONTBREKEN) $("melding").hidden = true;
}

/* De datum van de dump, in woorden en in de taal van de bezoeker. Apart, want hij moet
   ook na een taalwissel opnieuw geschreven worden. */
function toonDatum() {
  const datum = datumInWoorden(staat.bijgewerkt);
  $("datumregel").textContent = datum ? t("telling.bijgewerkt", { datum: datum }) : "";
}

/* ==========================================================================
   filters — uitsluitend positief
   ========================================================================== */
function keuzeVeld(groep, sleutel, label, aantal) {
  const wrap = document.createElement("label");
  wrap.className = "keuze";
  wrap.innerHTML =
    '<input type="checkbox" data-groep="' + groep + '" value="' + ontsnap(sleutel) + '">' +
    "<span>" + ontsnap(label) + " <em>" + aantal + "</em></span>";
  return wrap;
}

/* Hoeveel wagens deze vlag dragen. Bij elke tekenbeurt opnieuw geteld: het zijn acht
   vlaggen over een vloot van een paar honderd wagens, en dat is goedkoper dan een tweede
   plek waar hetzelfde getal kan verouderen. */
function vlagTelling(sleutel) {
  let n = 0;
  for (const s of staat.stations) {
    for (const w of s.wagens) if (w.toebehoren && w.toebehoren[sleutel]) n++;
  }
  return n;
}

/* De vier keuzegroepen (opnieuw) tekenen. Ook na een taalwissel: de labels komen uit de
   vertaling en de alfabetische volgorde verandert mee. Wat aangevinkt staat, leeft in
   `staat` en niet in de opmaak, dus opnieuw tekenen verliest geen enkele keuze. */
function vulKeuzes() {
  const groepen = [
    ["soort", "filter-soort",
     staat.soorten.map(([w, n]) => [w, waarde(w), n]), staat.gekozenSoort],
    ["brandstof", "filter-brandstof",
     staat.brandstoffen.map(([w, n]) => [w, waarde(w), n]), staat.gekozenBrandstof],
    ["bak", "filter-bak",
     staat.bakken.map(([w, n]) => [w, waarde(w), n]), staat.gekozenBak],
    ["vlag", "filter-toebehoren",
     TOEBEHOREN.map((k) => [k, vlagLabel(k), vlagTelling(k)]), staat.gekozenVlaggen],
    ["vlag", "filter-afspraken",
     AFSPRAKEN.map((k) => [k, vlagLabel(k), vlagTelling(k)]), staat.gekozenVlaggen]
  ];

  for (const [groep, vakId, rijen, gekozen] of groepen) {
    /* Alfabetisch op het label zoals het er NU staat, dus in de getoonde taal. Op aantal
       sorteren zet de grootste groep vooraan, maar dan verspringt de volgorde bij elke
       nieuwe dump en moet je elke keer opnieuw zoeken waar iets staat. */
    rijen.sort((x, y) => x[1].localeCompare(y[1], taal));
    const vak = $(vakId);
    vak.innerHTML = "";
    for (const [sleutel, label, n] of rijen) {
      const veld = keuzeVeld(groep, sleutel, label, n);
      const vakje = veld.querySelector("input");
      if (n === 0) vakje.disabled = true;
      if (gekozen.has(sleutel)) vakje.checked = true;
      vak.appendChild(veld);
    }
  }
}

function bouwFilters() {
  vulKeuzes();
  bouwZitplaatsen();
  bouwEuronorm();
  bouwBouwjaar();
  bouwAfstanden();

  /* Eén luisteraar op de hele filterlijst in plaats van één per vakje. De keuzes worden
     bij elke taalwissel opnieuw getekend; per vakje luisteren zou dan bij elke wissel
     een nieuwe laag luisteraars opleveren — of, erger, de oude vakjes achterlaten met
     een luisteraar die naar een verdwenen element wijst. */
  const groepen = {
    brandstof: staat.gekozenBrandstof,
    soort: staat.gekozenSoort,
    bak: staat.gekozenBak,
    vlag: staat.gekozenVlaggen
  };
  /* Op het paneel en niet op #filters: op een telefoon staan de chips in het zwevende
     optievak, dat wél in het paneel hangt maar buiten de filterlijst (zie plaatsOpties()). */
  $("paneel").addEventListener("change", (e) => {
    const vakje = e.target.closest('.keuze input[type="checkbox"]');
    if (!vakje) return;
    const doel = groepen[vakje.dataset.groep];
    if (vakje.checked) doel.add(vakje.value); else doel.delete(vakje.value);
    teken();
  });
}

/* Zitplaatsen als ondergrens, net als de euronorm: wie filtert, heeft plaats nodig voor
   een bepaald aantal mensen. "Vanaf 5" toont dus ook de wagens met 7 of 9 plaatsen —
   die voldoen immers ook. Een keuze op een exact aantal zou een zevenzitter verbergen
   voor iemand die er vijf zoekt, en dat is zelden wat je bedoelt. */
function bouwZitplaatsen() {
  const schuif = $("zit-schuif");
  schuif.max = String(staat.zitplaatsen.length);
  schuif.value = "0";
  schuif.addEventListener("input", () => {
    const i = Number(schuif.value);
    staat.minZit = i === 0 ? null : staat.zitplaatsen[i - 1];
    toonZitplaatsen();
    teken();
  });
  toonZitplaatsen();
}

function toonZitplaatsen() {
  const schuif = $("zit-schuif");
  const hoogste = staat.zitplaatsen[staat.zitplaatsen.length - 1];
  let tekst;
  if (staat.minZit === null) {
    tekst = t("zit.alle");
  } else if (staat.minZit === hoogste) {
    tekst = t("zit.enkel", { n: staat.minZit });
  } else {
    tekst = t("zit.vanaf", { n: staat.minZit });
  }
  $("zit-waarde").textContent = tekst;
  schuif.setAttribute("aria-label", t("zit.aria"));
  schuif.setAttribute("aria-valuetext", tekst);
}

/* De schuif loopt van "alle" (stand 0) tot de hoogste rang die in de data voorkomt.
   Elke stand betekent een ONDERGRENS: staat hij op Euro 5, dan tonen we Euro 5, 6 en 7.
   Stand 0 filtert niets weg en is daarmee de enige stand die de 60 wagens zonder
   gekende norm nog toont — bij elke andere stand vallen die weg, want van een wagen
   zonder norm kun je niet volhouden dat hij er minstens één haalt. */
function bouwEuronorm() {
  const schuif = $("euronorm-schuif");
  schuif.max = String(staat.normRangen.length);
  schuif.value = "0";
  schuif.addEventListener("input", () => {
    const i = Number(schuif.value);
    staat.minNorm = i === 0 ? null : staat.normRangen[i - 1];
    toonEuronorm();
    teken();
  });
  toonEuronorm();
}

function toonEuronorm() {
  const schuif = $("euronorm-schuif");
  const hoogste = staat.normRangen[staat.normRangen.length - 1];
  let tekst;
  if (staat.minNorm === null) {
    tekst = t("norm.alle");
  } else if (staat.minNorm === hoogste) {
    tekst = t("norm.enkel", { norm: rangNaam(staat.minNorm) });
  } else {
    tekst = t("norm.hoger", { norm: rangNaam(staat.minNorm) });
  }
  $("euronorm-waarde").textContent = tekst;
  // De schuif draagt getallen; een schermlezer moet de betekenis horen, niet "3".
  schuif.setAttribute("aria-label", t("norm.aria"));
  schuif.setAttribute("aria-valuetext", tekst);
}

/* Bouwjaar als ondergrens, net als zitplaatsen en euronorm: "vanaf 2018" toont 2018 en later.
   Een schuif en geen twee keuzelijsten van/tot: wie een nieuwere wagen zoekt, zoekt een
   ondergrens, en een bovengrens ("niet nieuwer dan") vraagt niemand. De standen komen uit
   de data — een jaar dat niet voorkomt, is niet te kiezen. Stand 0 is "alle"; "vanaf het
   oudste jaar" is dat ook, dus die stand bestaat niet apart. */
function bouwBouwjaar() {
  const schuif = $("bouwjaar-schuif");
  schuif.max = String(Math.max(0, staat.jaren.length - 1));
  schuif.value = "0";
  schuif.addEventListener("input", () => {
    const i = Number(schuif.value);
    staat.jaarVan = i === 0 ? null : staat.jaren[i];
    toonBouwjaar();
    teken();
  });
  toonBouwjaar();
}

function toonBouwjaar() {
  const schuif = $("bouwjaar-schuif");
  const hoogste = staat.jaren[staat.jaren.length - 1];
  let tekst;
  if (staat.jaarVan === null) {
    tekst = t("jaar.alle");
  } else if (staat.jaarVan === hoogste) {
    tekst = t("jaar.enkel", { jaar: staat.jaarVan });
  } else {
    tekst = t("jaar.vanaf", { jaar: staat.jaarVan });
  }
  $("bouwjaar-waarde").textContent = tekst;
  schuif.setAttribute("aria-label", t("jaar.aria"));
  schuif.setAttribute("aria-valuetext", tekst);
}

function bouwjaarFiltert() {
  return staat.jaarVan !== null;
}

/* De afstand tot het openbaar vervoer als BOVENgrens. Ze hoort bij de STANDPLAATS: een
   wagen komt door het filter als de plek waar hij staat hoogstens zo ver van een halte of
   een station ligt.

   De standen komen van een vaste ladder, niet uit de data zelf zoals bij de zitplaatsen:
   "hoogstens 500 meter" is een ronde afspraak die een mens kan inschatten, en de gemeten
   afstanden zijn allemaal verschillend. Van die ladder blijven alleen de standen over die
   iets DOEN — een stand boven de verste standplaats filtert niets weg, en een schuif die
   in de eerste helft niets verandert, liegt over wat ze kan.

   De schuif loopt van links (alles) naar rechts (het dichtst), net als elke andere schuif
   hier: verder naar rechts is altijd strenger. De ladder staat daarom aflopend. */
const AFSTAND_LADDER = [250, 500, 750, 1000, 1500, 2000, 3000, 5000, 7500, 10000];

function afstandDrempels(kies) {
  const gemeten = staat.ov
    ? Object.values(staat.ov.stations).map(kies).filter((m) => typeof m === "number")
    : [];
  if (!gemeten.length) return [];
  /* Alleen standen onder de verste standplaats: op of boven die afstand valt er niets weg.
     Aflopend, zodat stand 1 de ruimste is en de laatste stand de strengste. */
  const verste = Math.max(...gemeten);
  return AFSTAND_LADDER.filter((m) => m < verste).reverse();
}

/* Eén bouwer voor de twee schuiven: ze werken identiek en verschillen alleen in waar ze
   hun afstand halen en waar ze hun tekst zetten. */
function bouwAfstand(blokId, schuifId, drempelsVeld, grensVeld, kies, toon) {
  staat[drempelsVeld] = afstandDrempels(kies);
  const blok = $(blokId);
  if (!staat[drempelsVeld].length) {
    blok.hidden = true;
    return;
  }
  blok.hidden = false;
  const schuif = $(schuifId);
  schuif.max = String(staat[drempelsVeld].length);
  schuif.value = "0";
  schuif.addEventListener("input", () => {
    const i = Number(schuif.value);
    staat[grensVeld] = i === 0 ? null : staat[drempelsVeld][i - 1];
    toon();
    teken();
  });
  toon();
}

function bouwAfstanden() {
  bouwAfstand("filter-bushalte", "bus-schuif", "busDrempels", "maxBus",
              (o) => o.halte && o.halte.m, toonBushalte);
  bouwAfstand("filter-station", "trein-schuif", "treinDrempels", "maxTrein",
              (o) => o.trein && o.trein.m, toonStation);
}

/* De stand voluit, in dezelfde woorden als de OV-regel in de popup: "hoogstens 500 meter",
   "hoogstens 1,5 kilometer". Zo betekent hetzelfde getal op beide plaatsen hetzelfde. */
function toonAfstandSchuif(schuifId, waardeId, grens, ariaSleutel) {
  const schuif = $(schuifId);
  const tekst = grens === null ? t("afstand.alle")
                               : t("afstand.hoogstens", { afstand: ovAfstand(grens) });
  $(waardeId).textContent = tekst;
  schuif.setAttribute("aria-label", t(ariaSleutel));
  schuif.setAttribute("aria-valuetext", tekst);
}

function toonBushalte() {
  toonAfstandSchuif("bus-schuif", "bus-waarde", staat.maxBus, "bus.aria");
}

function toonStation() {
  toonAfstandSchuif("trein-schuif", "trein-waarde", staat.maxTrein, "trein.aria");
}

/* De gemeten afstand bij de standplaats van deze wagen, of null als ze er niet is. Een
   standplaats zonder gemeten afstand komt door géén enkele bovengrens: we weten niet of
   ze eraan voldoet, en een wagen tonen die misschien nergens bij een halte staat is erger
   dan er eentje missen. */
function haltAfstandVan(w) {
  const o = staat.ov && staat.ov.stations[w.station_id];
  return o && o.halte && typeof o.halte.m === "number" ? o.halte.m : null;
}

function stationAfstandVan(w) {
  const o = staat.ov && staat.ov.stations[w.station_id];
  return o && o.trein && typeof o.trein.m === "number" ? o.trein.m : null;
}

/* Een wagen komt door het filter als hij aan élke aangezette groep voldoet, en binnen
   een groep aan minstens één keuze. De vlaggen zijn de uitzondering: daar moet hij ÁLLE
   aangevinkte hebben ("met trekhaak én fietsdrager"). Er bestaat geen negatieve
   variant — op een ontbrekend toebehoren kan niet gefilterd worden. */
function wagenPast(w) {
  if (staat.gekozenBrandstof.size && !staat.gekozenBrandstof.has(w.brandstof)) return false;
  if (staat.gekozenSoort.size && !staat.gekozenSoort.has(w.carrosserie)) return false;
  if (staat.minZit !== null && !(w.zitplaatsen >= staat.minZit)) return false;
  if (staat.gekozenBak.size && !staat.gekozenBak.has(w.versnellingsbak)) return false;
  if (staat.minNorm !== null && (w.normRang === null || w.normRang < staat.minNorm)) {
    return false;
  }
  if (staat.jaarVan !== null && !(w.bouwjaar >= staat.jaarVan)) return false;
  // Een standplaats zonder gemeten afstand haalt geen enkele bovengrens; zie hierboven.
  if (staat.maxBus !== null) {
    const m = haltAfstandVan(w);
    if (m === null || m > staat.maxBus) return false;
  }
  if (staat.maxTrein !== null) {
    const m = stationAfstandVan(w);
    if (m === null || m > staat.maxTrein) return false;
  }
  for (const sleutel of staat.gekozenVlaggen) {
    if (!(w.toebehoren && w.toebehoren[sleutel])) return false;
  }
  return true;
}

/* Waarom een wagen NIET door de filters komt: per filter dat hem tegenhoudt één regel,
   met wat de wagen zelf draagt ("Brandstof: diesel"). Voor de tekstballon bij een grijze
   pin en voor de popup. Volgt dezelfde regels als wagenPast() hierboven, in de volgorde
   van de filterlijst — wie daar een filter bijzet, zet het hier ook bij.

   Een toebehoren dat ontbreekt heet "niet vermeld", nooit "nee": in de brondata zijn
   "niet aanwezig" en "nooit ingevuld" niet uit elkaar te houden. */
function redenen(w) {
  const r = [];
  const onbekend = t("reden.onbekend");
  const paar = (kop, tekst) => t("reden.paar", { kop: t(kop), waarde: tekst });
  if (staat.gekozenSoort.size && !staat.gekozenSoort.has(w.carrosserie)) {
    r.push(paar("kop.soort", w.carrosserie ? waarde(w.carrosserie) : onbekend));
  }
  if (staat.minZit !== null && !(w.zitplaatsen >= staat.minZit)) {
    r.push(paar("kop.zitplaatsen", w.zitplaatsen || onbekend));
  }
  if (staat.gekozenBrandstof.size && !staat.gekozenBrandstof.has(w.brandstof)) {
    r.push(paar("kop.brandstof", w.brandstof ? waarde(w.brandstof) : onbekend));
  }
  if (staat.gekozenBak.size && !staat.gekozenBak.has(w.versnellingsbak)) {
    r.push(paar("kop.bak", w.versnellingsbak ? waarde(w.versnellingsbak) : onbekend));
  }
  for (const sleutel of staat.gekozenVlaggen) {
    if (w.toebehoren && w.toebehoren[sleutel]) continue;
    r.push(paar(TOEBEHOREN.includes(sleutel) ? "kop.toebehoren" : "kop.afspraken",
                t("reden.nietVermeld", { vlag: vlagLabel(sleutel) })));
  }
  if (staat.maxBus !== null) {
    const m = haltAfstandVan(w);
    if (m === null || m > staat.maxBus) {
      r.push(paar("kop.bushalte", m === null ? onbekend : ovAfstand(m)));
    }
  }
  if (staat.maxTrein !== null) {
    const m = stationAfstandVan(w);
    if (m === null || m > staat.maxTrein) {
      r.push(paar("kop.station", m === null ? onbekend : ovAfstand(m)));
    }
  }
  if (staat.minNorm !== null && (w.normRang === null || w.normRang < staat.minNorm)) {
    r.push(paar("kop.euronorm", w.euronorm || onbekend));
  }
  if (staat.jaarVan !== null && !(w.bouwjaar >= staat.jaarVan)) {
    r.push(paar("kop.bouwjaar", w.bouwjaar || onbekend));
  }
  return r;
}

/* De tekstballon bij een grijze pin: de standplaats, en per wagen waarom hij buiten de
   filters valt. Bij een pin uit een divIcon is dit ook wat een schermlezer voorleest —
   Leaflet zet `alt` alleen op een pictogram dat een <img> is. */
function uitgefilterdTitel(station, naam) {
  const meer = station.wagens.length > 1;
  return [t("marker.uitgefilterd", { naam: naam })].concat(station.wagens.map((w) =>
    (meer ? w.naam + " — " : "") + redenen(w).join(" · "))).join("\n");
}

function herstelFilters() {
  staat.gekozenBrandstof.clear();
  staat.gekozenSoort.clear();
  staat.gekozenBak.clear();
  staat.gekozenVlaggen.clear();
  staat.minZit = null;
  $("zit-schuif").value = "0";
  toonZitplaatsen();
  staat.minNorm = null;
  $("euronorm-schuif").value = "0";
  toonEuronorm();
  staat.jaarVan = null;
  $("bouwjaar-schuif").value = "0";
  toonBouwjaar();
  staat.maxBus = null;
  $("bus-schuif").value = "0";
  toonBushalte();
  staat.maxTrein = null;
  $("trein-schuif").value = "0";
  toonStation();
  document.querySelectorAll('.keuze input[type="checkbox"]').forEach((v) => { v.checked = false; });
  teken();
}

/* ==========================================================================
   tekenen
   ========================================================================== */
function popupHtml(station) {
  /* Bewust álle wagens van de standplaats tonen, ook als er maar één door het filter
     komt: elke wagen draagt zijn eigen brandstof en toebehoren, dus verwarring is niet
     mogelijk, en de bezoeker ziet wat er écht staat. */
  /* De plaatsnaam komt per wagen uit zijn eigen adresrij, en op een gedeelde standplaats
     kunnen die verschillen terwijl het fysiek hetzelfde punt is: st-193 draagt "Ledeberg"
     naast "Gent", st-3523 "Vinderhoute" naast "Lievegem" (de fusiegemeente). Beide zijn
     juist. We tonen dus de verschillende schrijfwijzen naast elkaar in plaats van er
     stilzwijgend één te kiezen. */
  /* Sinds de gemeente per wagen tussen haakjes achter de naam staat, draagt elke wagen
     gewoon zijn eigen schrijfwijze. Hier is ze alleen nog nodig om te beslissen of het
     district iets toevoegt (zie onderaan). */
  const plaats = [...new Set(station.wagens.map((w) => w.plaats))].join(" / ");

  const blokken = station.wagens.map((w) => {
    /* Elk feit met zijn eigen pictogram. Het woord blijft er altijd bij staan: een
       pictogram alleen is een raadsel, en voor een schermlezer bestaat het niet. */
    /* Het soort voertuig staat hier niet meer: het model zegt het al. Het bouwjaar staat
       achter het model in de kop. */
    const feiten = [];
    if (w.zitplaatsen) feiten.push(feit("i-zit", t("popup.plaatsen", { n: w.zitplaatsen })));
    if (w.brandstof) {
      const stroom = ELEKTRISCH_HYBRIDE.has(w.brandstof);
      feiten.push(feit(stroom ? "i-stroom" : "i-brandstof", waarde(w.brandstof), false, stroom));
    }
    if (w.versnellingsbak) feiten.push(feit("i-bak", waarde(w.versnellingsbak)));
    // Ontbreekt de euronorm, dan zwijgen we erover — "onbekend" is geen feit om te tonen.
    if (w.euronorm) feiten.push(feit("i-norm", w.euronorm));

    /* Het rijbereik, alleen voor volledig elektrische wagens en alleen als het bekend is.
       Een marge waar de batterijversie niet vaststaat; één getal waar ze wel vaststaat.
       Zie scripts/haal_bereik.py voor waarom het bouwjaar daarbij niet meetelt. */
    const bereik = bereikVan(w);
    let bereikUitleg = "";
    if (bereik && bereik.km) {
      const [van, tot] = bereik.km;
      const tekst = van === tot
        ? t("popup.bereikEen", { km: getal(van) })
        : t("popup.bereikMarge", { van: getal(van), tot: getal(tot) });
      const id = nieuweUitlegId();
      feiten.push('<li class="feit feit--breed">' + pictogram("i-bereik") +
                  "<span>" + ontsnap(tekst) + "</span>" + uitlegKnop(id) + "</li>");
      /* Wat het getal is, en waar het vandaan komt — die naamsvermelding is een voorwaarde
         van de licentie van Open EV Data (de README vermeldt ze ook). Een met de hand
         ingevuld bereik komt NIET uit die bron en mag er dus ook niet naar verwijzen:
         een onterechte naamsvermelding is even fout als een ontbrekende. */
      bereikUitleg = uitlegTekst(id, bereik.bron === "handmatig"
        ? ontsnap(t("popup.bereikUitlegHandmatig"))
        : ontsnap(t("popup.bereikUitleg")) +
          ' <a href="https://github.com/KilowattApp/open-ev-data" target="_blank" ' +
          'rel="noopener">Open EV Data</a>');
    }

    /* Alleen aanwezige toebehoren en afspraken. Nooit "trekhaak: nee". */
    const labels = ALLE_VLAGGEN
      .filter((sleutel) => w.toebehoren && w.toebehoren[sleutel])
      .map((sleutel) =>
        '<span class="label">' + pictogram("i-vink") + ontsnap(vlagLabel(sleutel)) + "</span>")
      .join("");

    /* Past deze wagen niet door de filters, dan staat meteen onder zijn naam waarom. Een
       grijze pin zei tot nu toe alleen dát hij er niet door kwam. Op een gedeelde
       standplaats kan dat voor de ene wagen gelden en niet voor de andere. */
    const buiten = wagenPast(w) ? [] : redenen(w);

    return '<div class="wagen">' +
             '<p class="wagen__naam">' + ontsnap(w.naam) +
               (w.plaats ? ' <span class="wagen__plaats">(' + ontsnap(w.plaats) + ")</span>" : "") +
             "</p>" +
             '<p class="wagen__model">' + ontsnap(w.merk + " " + w.model) +
               (w.bouwjaar ? " · " + ontsnap(w.bouwjaar) : "") + "</p>" +
             (buiten.length
               ? '<p class="wagen__buiten">' +
                   ontsnap(t("reden.buiten", { redenen: buiten.join(" · ") })) + "</p>"
               : "") +
             fotoHtml(w) +
             '<ul class="feiten">' + feiten.join("") + "</ul>" + bereikUitleg +
             (labels ? '<div class="labels">' + labels + "</div>" : "") +
           "</div>";
  }).join("");

  /* De titel is van de autonaam, want daar zoekt de bezoeker op; de gemeente staat er
     tussen haakjes achter. Onderaan staan alleen nog het district en het contactadres. */
  /* District en contactadres horen bij de standplaats, niet bij één wagen: op een
     gedeeld punt zijn ze hetzelfde. Het adres staat er alleen als iemand het bij Dégage
     met de hand heeft ingevuld — zie scripts/districten.json. */
  /* Het district alleen tonen als het iets toevoegt: bij "Sint-Niklaas" in "9100
     Sint-Niklaas" is het dubbelop, bij "Gent - Brugse Poort" niet. Het krijgt een eigen
     regel onder de gemeente; naast het adres gezet leest het als een tweede plaatsnaam. */
  const districten = [...new Set(station.wagens.map((w) => w.district).filter(Boolean))]
    .filter((d) => !plaats.toLowerCase().includes(d.toLowerCase()));
  const adressen = [...new Set(station.wagens.map((w) => w.contact).filter(Boolean))];

  return '<div class="popup">' +
           blokken +
           ovHtml(station) +
           /* De gemeente staat bij elke wagen in de kop; onderaan alleen nog het district,
              en dat alleen als het iets zegt wat de gemeente niet al zegt. */
           (districten.length
             ? '<p class="popup__voet">' + pictogram("i-plaats") +
                 ontsnap(districten.join(" / ")) +
               "</p>"
             : "") +
           (adressen.length
             ? '<p class="popup__voet">' + pictogram("i-mail") +
                 adressen.map((a) =>
                   '<a href="mailto:' + ontsnap(a) + '">' + ontsnap(a) + "</a>").join(" / ") +
               "</p>"
             : "") +
           /* De stip staat met opzet niet precies op de standplaats: dat zou de voordeur
              van de eigenaar aanwijzen. Dat hoort de bezoeker te weten op de plek waar
              hij naar de locatie kijkt, en niet alleen in een document dat hij nooit
              leest. */
           (locatieVaagheid
             ? '<p class="popup__voet popup__voet--vaag">' +
                 ontsnap(t("popup.locatieVaag")) +
               "</p>"
             : "") +
         "</div>";
}

/* Het bereik van één wagen: eerst per merk+model+bouwjaar (zo rekent haal_bereik.py), dan
   per merk+model — zo kan iemand een model met de hand voor elk jaar tegelijk invullen. */
function bereikVan(w) {
  if (w.brandstof !== "elektrisch") return null;
  return staat.bereik[w.merk + "|" + w.model + "|" + (w.bouwjaar || 0)] ||
         staat.bereik[w.merk + "|" + w.model] || null;
}

/* ---------- uitleg achter een ⓘ ----------------------------------------------------
   De popup is HTML-tekst, dus de knop kan geen eigen luisteraar meekrijgen. En een
   luisteraar op het document hoort niets: Leaflet houdt klikken binnen een popup bij de
   popup (disableClickPropagation). Daarom één luisteraar per popup-element, gezet bij het
   openen. Na het openklappen moet Leaflet de popup opnieuw uitmeten — anders groeit hij
   boven het scherm uit in plaats van mee te schuiven. */
let uitlegTeller = 0;

function nieuweUitlegId() {
  return "uitleg-" + (++uitlegTeller);
}

function uitlegKnop(id) {
  return '<button type="button" class="uitleg-knop" aria-expanded="false" aria-controls="' +
         id + '" title="' + ontsnap(t("popup.uitleg")) + '">' + pictogram("i-info") +
         '<span class="enkel-schermlezer">' + ontsnap(t("popup.uitleg")) + "</span></button>";
}

function uitlegTekst(id, html) {
  return '<p class="uitleg" id="' + id + '" hidden>' + html + "</p>";
}

kaart.on("popupopen", (e) => {
  /* Op een telefoon staat de meldknop linksonder over de kaart, en hij ligt hoger dan de
     popuplaag van Leaflet: een popup die eroverheen valt, zou er een groene pil middenin
     krijgen. popupRanden() houdt daarom geen plaats voor hem vrij (de popup mag daar
     staan) en hier gaat hij zolang weg, net zoals hij dat al doet voor het
     instellingendoosje. Zie `.toont-popup .melden` in de opmaak. */
  document.body.classList.add("toont-popup");

  const el = e.popup.getElement();
  if (!el) return;

  /* En raakt hij de balk ook nog, dan gaat die zolang weg. popupRanden() houdt daar plaats
     voor vrij zolang er plaats ís; blijft er te weinig over, dan valt de popup er liever
     overheen dan half buiten beeld — maar bovenop komt hij niet, want alle lagen van
     Leaflet zitten in één stapelcontext onder de knoppen en de balk. Meten in plaats van
     rekenen: pas hier staat de popup op zijn plaats en is zijn hoogte bekend. Zie
     `.popup-over-balk` in de opmaak. */
  if (window.matchMedia("(max-width: 640px)").matches && balkInBeeld()) {
    const p = el.getBoundingClientRect();
    const b = balkDoos().getBoundingClientRect();
    const raakt = p.left < b.right && p.right > b.left && p.top < b.bottom && p.bottom > b.top;
    if (raakt) {
      document.body.classList.add("popup-over-balk");
      meetDichtbij();
    }
  }
  /* Leaflets kruisje draagt "Close popup" voor schermlezers, altijd in het Engels. Bij
     elke opening opnieuw, want een markerpopup houdt zijn element en de taal kan intussen
     gewisseld zijn. */
  const sluit = el.querySelector(".leaflet-popup-close-button");
  if (sluit) sluit.setAttribute("aria-label", t("kaart.popupSluiten"));
  if (el.dataset.uitleg) return;
  el.dataset.uitleg = "1";
  el.addEventListener("click", (klik) => {
    const knop = klik.target.closest(".uitleg-knop");
    if (!knop) return;
    const doel = el.querySelector("#" + knop.getAttribute("aria-controls"));
    if (!doel) return;
    const open = knop.getAttribute("aria-expanded") === "true";
    knop.setAttribute("aria-expanded", String(!open));
    doel.hidden = open;
    /* Opnieuw uitmeten en bijschuiven, maar NIET update(): die zet de inhoud opnieuw neer,
       en dan klapt de uitleg meteen weer dicht (bij een markerpopup krijgen de knoppen
       zelfs nieuwe id's). Dit zijn interne methodes van Leaflet — ze bestaan in de
       gepinde 1.9.4; wie Leaflet opwaardeert, test dit knopje opnieuw. */
    const p = e.popup;
    if (p._updateLayout && p._updatePosition) {
      p._updateLayout();
      p._updatePosition();
      if (p._adjustPan) p._adjustPan();
    }
  });
});

/* De Mobiscore en het openbaar vervoer bij een standplaats (scripts/haal_ov.py).

   De Mobiscore is de officiële score van de Vlaamse overheid — dezelfde als bij een
   woningzoekertje — en staat daarom bovenaan, als getal op tien. De regels eronder zijn
   onze eigen feiten over wat er rijdt: de dichtste halte met vaste lijnen en hoe vaak daar
   iets vertrekt, en het dichtste station. Die zeggen waarom een plek scoort zoals ze
   scoort, voor het deel dat over openbaar vervoer gaat. */
/* Een afstand voluit, voor de OV-regel: "480 meter", "2 kilometer", "1,5 kilometer".
   Onder de kilometer op tientallen meters, daarboven op een halve kilometer — preciezer
   zou een nauwkeurigheid beweren die een afstand in vogelvlucht niet heeft. */
function ovAfstand(m) {
  const tientallen = Math.round(m / 10) * 10;
  if (tientallen < 1000) return t("ov.meter", { n: getal(tientallen) });
  const km = Math.round(m / 500) / 2;
  return t(km === 1 ? "ov.kilometerEen" : "ov.kilometer", { n: km.toLocaleString(locale()) });
}

function ovHtml(station) {
  const ov = staat.ov && staat.ov.stations[station.station_id];
  if (!ov) return "";
  const regels = [];

  /* Twee korte, concrete regels: hoe ver de dichtste halte en het dichtste station liggen,
     en hoe vaak er daar iets vertrekt —
         Bushalte op 480 meter (5/u)
         Station Melsele op 1,5 kilometer (2/u)
     Het station met zijn naam, want "trein" zegt niet wáár je opstapt. De halte zonder:
     wie een plek beoordeelt, wil weten of er iets rijdt en hoe vaak, niet hoe de halte
     heet. Het aantal haltes in de buurt staat er ook niet meer bij.

     De frequentie is per richting, niet beide richtingen samen: wie aan de halte staat,
     wacht op de bus naar één kant. Een ouder ov.json zonder per_richting valt terug op de
     helft. Minder dan één vertrek per uur heet "<1/u", niet "0/u". Dat het per richting
     is, zegt de uitleg achter de ⓘ. */
  const perUur = (pr) => (pr >= 1 ? t("ov.perUur", { n: getal(Math.round(pr)) })
                                  : t("ov.minderDanEen"));
  const regel = (tekst) => ontsnap(tekst.charAt(0).toLocaleUpperCase(locale()) + tekst.slice(1));
  if (ov.halte) {
    const h = ov.halte;
    const pr = typeof h.per_richting === "number" ? h.per_richting : h.per_uur / 2;
    regels.push(regel(t(h.tram ? "ov.tramhalte" : "ov.bushalte",
                        { afstand: ovAfstand(h.m), freq: perUur(pr) })));
  } else {
    /* `halte_ver` is de straal waarbinnen `haal_ov.py` doorzoekt; `halte_zoek` is de oudere,
       kleinere naam en blijft als terugval staan voor een ov.json van vóór die verruiming. */
    const straal = staat.ov.stralen_m.halte_ver || staat.ov.stralen_m.halte_zoek;
    regels.push(regel(t("ov.geenHalte", { straal: ovAfstand(straal) })));
  }
  if (ov.trein) {
    const naam = ov.trein.naam[taal] || ov.trein.naam.nl || ov.trein.naam.fr;
    // Per richting: alle treinen van het station gedeeld door twee — zie haal_ov.py.
    const pr = typeof ov.trein.per_richting === "number" ? ov.trein.per_richting
                                                          : ov.trein.per_uur / 2;
    /* Een aparte sleutel voor een naam die met een klinker begint: het Frans zegt "gare
       d'Anvers", niet "gare de Anvers". In de andere talen zijn de twee gelijk. */
    const sleutel = /^[aeiouyàâäéèêëîïôöûü]/i.test(naam) ? "ov.stationKlinker" : "ov.station";
    regels.push(regel(t(sleutel, { station: naam, afstand: ovAfstand(ov.trein.m),
                                   freq: perUur(pr) })));
  }

  const score = typeof ov.mobiscore === "number"
    ? '<span class="ov__score">' + ontsnap(ov.mobiscore.toLocaleString(locale(),
        { minimumFractionDigits: 1, maximumFractionDigits: 1 })) +
      '</span><span class="ov__schaal"> / 10</span>'
    : '<span class="ov__schaal">' + ontsnap(t("ov.geenScore")) + "</span>";

  const id = nieuweUitlegId();
  return '<div class="ov">' +
           '<p class="ov__kop">' + pictogram("i-ov") +
             "<span>" + ontsnap(t("ov.titel")) + " " + score + "</span>" + uitlegKnop(id) + "</p>" +
           regels.map((r) => "<p>" + r + "</p>").join("") +
           uitlegTekst(id, ontsnap(t("ov.bron"))) +
         "</div>";
}

/* De stockfoto van dit model, met de naamsvermelding die de licentie eist.

   Twee dingen die de bezoeker moet weten en die hier dus letterlijk staan:
   het is een foto van het MODEL en niet van deze wagen, en ze komt van iemand anders.
   Voor een model zonder foto komt er niets — een verkeerde auto tonen is erger. */
function fotoHtml(w) {
  const foto = staat.fotos[w.fotoSleutel || (w.merk + "|" + w.model)];
  /* Geen foto van dit model gevonden: een tekening in plaats van een gat. Bewust een
     lijntekening en geen vage grijze vlek — het moet meteen duidelijk zijn dat dit
     géén foto van die wagen is, maar een plaatsvervanger. */
  if (!foto) {
    return '<div class="wagen__geenfoto" role="img" ' +
             'aria-label="' + ontsnap(t("popup.geenFoto")) + '">' +
             '<svg viewBox="0 0 120 68" aria-hidden="true"><use href="#i-geen-foto"/></svg>' +
           "</div>";
  }
  const bron = foto.bronpagina
    ? '<a href="' + ontsnap(foto.bronpagina) + '" target="_blank" rel="noopener">Wikimedia Commons</a>'
    : "Wikimedia Commons";
  return '<img class="wagen__foto" loading="lazy" ' +
           'src="' + ontsnap(FOTO_BASIS + "/" + foto.bestand) + '" ' +
           'alt="' + ontsnap(t("popup.fotoAlt", { model: w.merk + " " + w.model })) + '">' +
         '<p class="wagen__bron">' + t("popup.fotoBron") + " " +
           ontsnap(foto.auteur) + " · " + ontsnap(foto.licentie) + " · " + bron + "</p>";
}

function pictogram(naam) {
  return '<svg class="ico" aria-hidden="true"><use href="#' + naam + '"/></svg>';
}

function feit(icoon, tekst, breed, stroom) {
  return '<li class="feit' + (breed ? " feit--breed" : "") +
         (stroom ? " feit--stroom" : "") + '">' +
         pictogram(icoon) + "<span>" + ontsnap(tekst) + "</span></li>";
}

function teken() {
  clusters.clearLayers();

  const markers = [];
  let stationsGeteld = 0, wagensGeteld = 0;

  for (const station of staat.stations) {
    const passende = station.wagens.filter(wagenPast);
    const actief = passende.length > 0;
    // Niets passends én de grijze weergave staat uit: dan verdwijnt de standplaats echt.
    if (!actief && !staat.grijsTonen) continue;
    if (actief) {
      stationsGeteld++;
      wagensGeteld += passende.length;
    }

    const naam = station.wagens.map((w) => w.naam).join(" + ");
    /* Het merkteken volgt de wagens die nú getoond worden, niet alles wat er ooit staat:
       filtert iemand op diesel, dan hoort een elektrisch buurwagentje het beeld niet te
       kleuren. Op een gedeelde standplaats (er zijn er drie) volstaat één elektrische
       wagen voor het merkteken — de popup toont daarna per wagen wat het echt is. */
    const elektrisch = actief && passende.some((w) => w.brandstof === "elektrisch");
    const soort = !actief ? " pin--grijs" : (elektrisch ? " pin--elektrisch" : "");
    const marker = L.marker([station.lat, station.lon], {
      icon: L.divIcon({
        html: '<span class="pin' + soort + '"></span>',
        className: "pin-wrap",
        // De pin zelf is 20 px (zie `.pin`); de popup begint net boven haar rand.
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -12]
      }),
      keyboard: true,
      // Grijs: met de reden erbij, zie uitgefilterdTitel().
      title: actief ? naam : uitgefilterdTitel(station, naam),
      alt: t(actief ? (elektrisch ? "marker.elektrisch" : "marker.standplaats")
                    : "marker.uitgefilterd", { naam: naam }),
      // Gelezen door de clusterbol hierboven, en het houdt de passende pins bovenop.
      actief: actief,
      zIndexOffset: actief ? 1000 : 0
    });
    /* De randen moeten kloppen op het MOMENT van klikken — het paneel kan intussen
       ingeklapt zijn en de balk open of dicht. Deze afhandelaar wordt met opzet vóór
       `bindPopup` geregistreerd: Leaflet roept ze in volgorde van registratie aan, dus
       zo staan de nieuwe randen er al voor de popup opengaat. */
    marker.on("click", () => Object.assign(marker.getPopup().options, popupRanden()));
    marker.bindPopup(() => popupHtml(station), { closeButton: true });

    /* De naam naast de pin, zichtbaar vanaf NAAM_ZOOM (de opmaak beslist, zie
       `.naamlabel`). Alleen voor wat door de filters komt: een grijze pin is context,
       en zijn naam zou het beeld alleen voller maken. */
    if (actief) {
      marker.bindTooltip(passende.map((w) => w.naam).join(" + "), {
        permanent: true,
        direction: "right",
        offset: [14, 0],   // net naast de rand van een pin van 20 px
        className: "naamlabel"
      });
    }
    markers.push(marker);
  }

  clusters.addLayers(markers);
  // Andere filters, andere losse pins: opnieuw beslissen of de namen erbij passen.
  markersNu = markers;
  toonNamen();

  const gefilterd = staat.gekozenBrandstof.size + staat.gekozenSoort.size +
                    staat.gekozenBak.size + staat.gekozenVlaggen.size +
                    (staat.minZit !== null ? 1 : 0) +
                    (staat.minNorm !== null ? 1 : 0) +
                    (bouwjaarFiltert() ? 1 : 0) +
                    (staat.maxBus !== null ? 1 : 0) +
                    (staat.maxTrein !== null ? 1 : 0);
  /* Niets gefilterd, niets te wissen: dan is de knop alleen maar ruis. `hidden` maakt hem
     hier onzichtbaar maar laat zijn plaats staan (zie `.herstel-knop` in de opmaak), zodat
     de tellerregel niet verspringt bij de eerste filter. */
  $("knop-herstel").hidden = gefilterd === 0;
  // De telbolletjes op de labels (telefoon); zie werkKoppenBij().
  werkKoppenBij();

  /* De teller draagt bij het opstarten "bezig met laden…" als vertaalde tekst; zodra er
     een echt getal in staat, mag vertaalPagina() er niet meer aan komen. */
  $("telling").removeAttribute("data-i18n");
  if (gefilterd === 0) {
    $("telling").textContent = meervoud(wagensGeteld);
  } else if (stationsGeteld === 0) {
    $("telling").textContent = t("telling.geen");
  } else {
    $("telling").textContent = t("telling.van", {
      n: getal(wagensGeteld),
      totaal: meervoud(staat.totaalWagens)
    });
  }

  // Een filter haalt wagens uit beeld. De balk moet dus opnieuw gerekend worden — ook
  // als ze uit een zoekopdracht komt, want "de vijf dichtste" betekent dan "de vijf
  // dichtste die door dit filter komen".
  verversDichtbij();
}

/* ==========================================================================
   bediening
   ========================================================================== */
/* Uitzoomen tot heel Vlaanderen in beeld staat. Dit is een kaartbediening en geen filter,
   dus hoort ze bij de kaartknoppen: als échte Leaflet-control onder + en −, in dezelfde
   hoek. Die hoek heet bij Leaflet "topleft" maar staat door de opmaak hierboven rechts,
   en op een telefoon onderaan — de knop verhuist dus vanzelf mee. */
const AllesInBeeld = L.Control.extend({
  options: { position: "topleft" },
  onAdd() {
    const doos = L.DomUtil.create("div", "leaflet-bar leaflet-control kaartknoppen");
    const knop = L.DomUtil.create("a", "alles-knop", doos);
    knop.href = "#";
    knop.title = t("knop.alles");
    knop.setAttribute("data-i18n-title", "knop.alles");
    knop.setAttribute("role", "button");
    knop.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M9 3H3v6M15 3h6v6M15 21h6v-6M9 21H3v-6"/>' +
      '<path d="M3 3l7 7M21 3l-7 7M21 21l-7-7M3 21l7-7"/></svg>' +
      '<span class="enkel-schermlezer" data-i18n="knop.allesKort">' +
      ontsnap(t("knop.allesKort")) + "</span>";
    /* `stop` houdt de klik bij de kaart vandaan: zonder dat pant Leaflet mee en springt
       de pagina naar boven door de href. */
    L.DomEvent.on(knop, "click", L.DomEvent.stop);
    L.DomEvent.on(knop, "click", () => {
      sluitFilters();   // wie de hele kaart wil zien, wil de lijst er niet over
      kaart.fitBounds(VOLLEDIGE_BBOX, { padding: [24, 24] });
    });

    /* Het tandwiel eronder, in dezelfde balk. De weergavekeuzes stonden vroeger in het
       paneel; daar namen ze de plaats in van de kop, en het zijn geen filters. Als
       kaartbediening horen ze hier — en het paneel houdt ruimte over voor de knop om
       zichzelf te minimaliseren. */
    const tandwiel = L.DomUtil.create("a", "tandwiel-knop", doos);
    tandwiel.href = "#";
    tandwiel.title = t("knop.instellingen");
    tandwiel.setAttribute("data-i18n-title", "knop.instellingen");
    tandwiel.setAttribute("role", "button");
    tandwiel.setAttribute("aria-expanded", "false");
    tandwiel.setAttribute("aria-controls", "instellingen");
    tandwiel.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="3"/>' +
      '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 ' +
      '1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 ' +
      '0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 ' +
      '0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 ' +
      '1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a' +
      '1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 ' +
      '1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 ' +
      '0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
      '<span class="enkel-schermlezer" data-i18n="knop.instellingen">' +
      ontsnap(t("knop.instellingen")) + "</span>";
    L.DomEvent.on(tandwiel, "click", L.DomEvent.stop);
    L.DomEvent.on(tandwiel, "click", () => zetInstellingen(!instellingenOpen()));

    /* Het doosje hangt onder de knop, binnen dezelfde control. Zo verhuist het mee naar
       onderaan op een telefoon, zonder een tweede plaatsberekening. */
    doos.appendChild($("instellingen"));
    /* Klikken en scrollen binnen de control blijven bij de control: anders pant of zoomt
       de kaart mee terwijl je een vakje aankruist. */
    L.DomEvent.disableClickPropagation(doos);
    L.DomEvent.disableScrollPropagation(doos);
    return doos;
  }
});
kaart.addControl(new AllesInBeeld());

/* De instellingen open- en dichtdoen. Dicht bij een klik elders op de pagina en met
   Escape — dezelfde afspraak als bij de filters. */
function instellingenOpen() {
  return !$("instellingen").hidden;
}
/* Filters dicht bij een tik op een kaartknop (tandwiel, "alles tonen"). Wie daarop drukt,
   is klaar met filteren. Een klik buiten het paneel sluit de filters normaal al, maar
   Leaflet houdt klikken op zijn knoppen tegen (disableClickPropagation), dus die knoppen
   roepen dit expliciet aan. Het zoekveld laat ook los, anders klapt de lijst bij de
   volgende focus weer open en blijft op een telefoon het toetsenbord staan. */
function sluitFilters() {
  if ($("filters").hidden) return;
  zetFilters(false);
  $("zoekveld").blur();
}

function zetInstellingen(open) {
  $("instellingen").hidden = !open;
  if (open) sluitFilters();
  const knop = document.querySelector(".tandwiel-knop");
  if (knop) knop.setAttribute("aria-expanded", String(open));
  /* Op een telefoon klapt het doosje open op de plek waar de meldknop staat; zie
     `.toont-instellingen .melden` in de opmaak. Een klasse op <body>, want het doosje
     hangt in de kaartbediening en is dus geen buur van die knop. */
  document.body.classList.toggle("toont-instellingen", open);
}
document.addEventListener("mousedown", (e) => {
  if (!instellingenOpen()) return;
  if (!e.target.closest(".kaartknoppen")) zetInstellingen(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && instellingenOpen()) zetInstellingen(false);
});

/* ---------- filters open- en dichtdoen -------------------------------------------------
   Het zoekveld is de sleutel: erin klikken opent de filters eronder. Dat is één beweging
   voor allebei de dingen die je met de vloot kunt doen — zoeken naar een plek, of hem
   uitdunnen — en het scheelt een aparte knop in een paneel dat toch al vol stond.

   Dichtgaan doet ze bij een klik búiten het paneel of met Escape. Bewust niet bij het
   verlaten met de muis: dat sloot de lijst ook als je er alleen maar overheen streek, en
   een lijst die uit zichzelf dichtklapt terwijl je nog aan het kiezen bent, is erger dan
   een lijst die te lang openblijft. */
function zetFilters(open) {
  $("zoekveld").setAttribute("aria-expanded", String(open));
  $("filters").hidden = !open;
  /* Op een breed scherm blijft de balk onderaan staan waar ze staat: haar ruimte houdt de
     kolom van het paneel altijd vrij, ook met dichte filters (zie `.dichtbij` in de
     opmaak), zodat er niets verspringt bij het openklappen. Op een telefoon verdwijnt ze
     wél zolang de filters open staan — daar liggen paneel en balk boven elkaar — en dat
     geeft een andere hoogte, dus meteen opnieuw meten. */
  $("paneel").classList.toggle("toont-filters", open);
  meetDichtbij();
}

$("zoekveld").addEventListener("focus", () => zetFilters(true));
// Klikken in een veld dat de aandacht al heeft, geeft geen `focus` meer.
$("zoekveld").addEventListener("mousedown", () => zetFilters(true));

document.addEventListener("mousedown", (e) => {
  if (!$("paneel").contains(e.target)) zetFilters(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || $("filters").hidden) return;
  zetFilters(false);
  $("zoekveld").blur();
});
/* De sluitknop onderaan de lijst (alleen op een telefoon te zien). Het zoekveld laat ook
   de aandacht los, anders blijft het schermtoetsenbord openstaan. */
$("knop-filters-sluit").addEventListener("click", () => {
  zetFilters(false);
  $("zoekveld").blur();
});

/* Typen is zoeken.
   ------------------------------------------------------------------------------------
   Wie op de kaart begint te tikken zonder eerst in het zoekveld te klikken, bedoelt toch
   het zoekveld: niets anders op deze pagina neemt tekst aan. De eerste toets verhuist de
   aandacht naar het veld — de browser schrijft het teken dan zelf daar, want de focus
   verplaatst vóór het teken geschreven wordt — en de filters klappen open zoals bij een
   klik. Staat er nog een vorige zoekterm, dan wordt die geselecteerd: de nieuwe letters
   vervangen hem in plaats van eraan vast te plakken. Een geminimaliseerd paneel komt
   daarvoor eerst terug.

   Niet bij sneltoetsen (Ctrl, Alt, Cmd), niet bij de spatie (die bedient knoppen en
   vakjes), en niet als de aandacht al in een veld of keuzelijst staat. De + en − van
   Leaflet komen hier niet aan: heeft de kaart de aandacht, dan vangt Leaflet ze zelf af
   en is `defaultPrevented` gezet. */
document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length !== 1 || e.key === " ") return;
  const actief = document.activeElement;
  if (actief && (actief.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(actief.tagName))) {
    return;
  }
  if ($("paneel").classList.contains("is-klein")) zetPaneel(false);
  const veld = $("zoekveld");
  veld.focus();   // de `focus`-luisteraar hierboven opent de filters
  veld.select();
});

/* Filters dicht zodra je in de kaart gaat scrollen of vegen.
   ------------------------------------------------------------------------------------
   Wie aan het wieltje draait of met de vingers over de kaart schuift, is met de kaart
   bezig en niet meer met de filters — en de opengeklapte lijst neemt dan de helft van
   het beeld in. Een klik op de kaart sloot ze al (zie hierboven), maar scrollen en vegen
   geven geen `mousedown`, dus die vangen we hier apart.

   Alleen in de kaart zelf: scrollen door de filterlijst, een popup of het
   instellingendoosje laat de filters met rust. Uit te zetten in de instellingen, voor
   wie de filters open wil houden terwijl de kaart verschuift. Het zoekveld houdt de
   aandacht: wie verder typt, krijgt de filters meteen terug (zie de `input`-luisteraar
   bij het zoeken). */
let filtersSluitenBijScrollen = true;

function sluitFiltersBijScrollen(e) {
  if (!filtersSluitenBijScrollen || $("filters").hidden) return;
  if (e.target.closest && e.target.closest(".leaflet-popup, .kaartknoppen")) return;
  zetFilters(false);
}
kaart.getContainer().addEventListener("wheel", sluitFiltersBijScrollen, { passive: true });
kaart.getContainer().addEventListener("touchmove", sluitFiltersBijScrollen, { passive: true });

$("knop-herstel").addEventListener("click", herstelFilters);

/* ⓘ-knoppen in de filterlijst: dezelfde afspraak als in de popups — de uitleg staat één
   klik verder, zodat de lijst niet hoger wordt voor wie ze niet nodig heeft. Eén
   luisteraar op de hele lijst; de knop zegt via `aria-controls` welke tekst hij opent. */
$("filters").addEventListener("click", (e) => {
  const knop = e.target.closest(".uitleg-knop");
  if (!knop) return;
  const doel = $(knop.getAttribute("aria-controls"));
  if (!doel) return;
  const open = knop.getAttribute("aria-expanded") === "true";
  knop.setAttribute("aria-expanded", String(!open));
  doel.hidden = open;
});

/* ---------- labels als schakelaar, alleen op een telefoon ------------------------------
   Op een smal scherm toont de filterlijst alleen de labels, per twee naast elkaar. Tikken
   op een label toont zijn opties; nog eens tikken, of een ander label, verbergt ze.

   De labels mogen daarbij NOOIT verspringen — een knop die wegschuift op het moment dat
   je hem aanraakt, is erger dan een lange lijst. Daarom gaan de opties op een telefoon
   niet onder hun eigen label open, maar in één vak onder het hele raster van labels: de
   labels staan er dan altijd op dezelfde plek, open of dicht. Er staat telkens maar één
   label open, en dat kleurt groen; zo is duidelijk bij welk label het vak hoort.

   Daarvoor verhuizen de opties echt (net als plaatsFilterschakels()): de luisteraars en
   ids blijven gelden, en op een breed scherm gaan ze terug onder hun eigen kop, waar
   niets van dit alles speelt. Euronorm en bouwjaar zijn een <details>; op een telefoon
   klapt die zelf niet meer open maar doet mee als de andere labels. */
const smalScherm = window.matchMedia("(max-width: 640px)");
const optieVak = document.createElement("div");
optieVak.className = "filters__opties";
const optiesVan = new Map();   // sectie → haar eigen vak in `optieVak`
let openSectie = null;

function filterSecties() {
  return document.querySelectorAll("#filters .sectie");
}

function kopVan(sectie) {
  return sectie.querySelector(":scope > h2, :scope > summary");
}

function plaatsOpties() {
  if (smalScherm.matches) {
    /* In het paneel, niet in de filterlijst: die scrolt en is op een telefoon laag, dus
       daar viel het vak vaak onder de rand. Het zweeft nu onder het paneel over de kaart
       (zie `.filters__opties` en plaatsOptieVak()). Wél binnen #paneel, zodat een tik
       erin telt als een tik in het paneel en de filters niet dichtklappen. */
    $("paneel").appendChild(optieVak);
    for (const sectie of filterSecties()) {
      let vak = optiesVan.get(sectie);
      if (!vak) {
        vak = document.createElement("div");
        vak.className = "sectie__opties" +
          (sectie.classList.contains("sectie--chips") ? " sectie__opties--chips" : "");
        optiesVan.set(sectie, vak);
      }
      const kop = kopVan(sectie);
      for (const kind of [...sectie.children]) if (kind !== kop) vak.appendChild(kind);
      optieVak.appendChild(vak);
    }
  } else {
    for (const [sectie, vak] of optiesVan) {
      while (vak.firstElementChild) sectie.appendChild(vak.firstElementChild);
    }
    optieVak.remove();
  }
  toonOpenSectie();
}

function toonOpenSectie() {
  const smal = smalScherm.matches;
  optieVak.hidden = !(smal && openSectie);
  for (const sectie of filterSecties()) {
    const open = smal && sectie === openSectie;
    sectie.classList.toggle("is-open", open);
    const vak = optiesVan.get(sectie);
    if (vak) vak.hidden = !open;
    const kop = kopVan(sectie);
    if (kop.tagName !== "H2") continue;   // een <summary> is vanzelf een knop
    if (smal) {
      kop.setAttribute("role", "button");
      kop.tabIndex = 0;
      kop.setAttribute("aria-expanded", String(open));
    } else {
      kop.removeAttribute("role");
      kop.removeAttribute("tabindex");
      kop.removeAttribute("aria-expanded");
    }
  }
}

function wisselSectie(sectie) {
  openSectie = openSectie === sectie ? null : sectie;
  toonOpenSectie();
  plaatsOptieVak();
}

/* Het zwevende optievak hangt net onder het paneel en mag tot boven de kaartknoppen
   onderaan reiken; wordt het hoger, dan scrolt het zelf. Het paneel verandert van hoogte
   als de filters open- of dichtgaan of de legende verdwijnt, dus bij elke maatwijziging
   opnieuw. `position: fixed` rekent vanaf het venster, en dat is ook waar
   getBoundingClientRect() in meet. */
function plaatsOptieVak() {
  if (optieVak.hidden || !optieVak.isConnected) return;
  const onder = Math.round($("paneel").getBoundingClientRect().bottom + 6);
  optieVak.style.top = onder + "px";
  optieVak.style.maxHeight = Math.max(120, window.innerHeight - onder - 70) + "px";
}

/* Het telbolletje op een label: zoveel filters staan er in die sectie aan, zodat een dicht
   label niet verzwijgt dat de kaart uitgedund wordt. Schuiven tellen als één filter zodra
   ze niet op stand 0 staan; chips per aangevinkte keuze. Aangeroepen vanuit teken(). De
   opties kunnen in de sectie zelf of in haar vak staan, dus beide tellen mee. */
function werkKoppenBij() {
  for (const sectie of filterSecties()) {
    const kop = kopVan(sectie);
    if (!kop) continue;
    let n = 0;
    for (const bereik of [sectie, optiesVan.get(sectie)]) {
      if (!bereik) continue;
      n += bereik.querySelectorAll(".keuze input:checked").length;
      const schuif = bereik.querySelector('input[type="range"]');
      if (schuif && schuif.value !== "0") n += 1;
    }
    if (n > 0) kop.dataset.aantal = String(n);
    else delete kop.dataset.aantal;
  }
}

plaatsOpties();
smalScherm.addEventListener("change", plaatsOpties);
new ResizeObserver(plaatsOptieVak).observe($("paneel"));
window.addEventListener("resize", plaatsOptieVak);

/* De twee filterschakelaars ("grijs tonen", "sluiten bij scrollen") verhuizen op een
   telefoon naar het instellingendoosje achter het tandwiel. Daar is de filterlijst
   krap, en het zijn keuzes die je één keer zet. Op een breed scherm staan ze bovenaan
   de filters, waar ze bij het filteren meteen bij de hand zijn.

   Echt verplaatsen, niet dupliceren: de luisteraars hangen aan de vakjes zelf, dus ze
   blijven werken, en er is maar één vakje om bij te houden. */
function plaatsFilterschakels() {
  const schakels = [$("knop-grijs"), $("knop-scrollsluit")].map((v) => v.closest(".schakel"));
  if (smalScherm.matches) {
    const taal = $("taalkeuze").closest(".schakel");
    for (const s of schakels) taal.parentNode.insertBefore(s, taal);
  } else {
    const blok = document.querySelector("#filters .filterschakels");
    for (const s of schakels) blok.appendChild(s);
  }
}
plaatsFilterschakels();
smalScherm.addEventListener("change", plaatsFilterschakels);

$("filters").addEventListener("click", (e) => {
  if (!smalScherm.matches) return;
  const kop = e.target.closest("#filters .sectie > h2, #filters .sectie > summary");
  if (!kop) return;
  // Een <details> klapt hier niet zelf open: zijn opties staan in het vak eronder.
  if (kop.tagName === "SUMMARY") e.preventDefault();
  const sectie = kop.parentElement;
  // Een ⓘ op een dicht label: open de sectie mee, anders valt de uitleg in iets verborgens.
  if (e.target.closest(".uitleg-knop")) {
    if (openSectie !== sectie) wisselSectie(sectie);
    return;
  }
  wisselSectie(sectie);
});
// Enter en spatie op een label; een <summary> doet dat vanzelf via `click`.
$("filters").addEventListener("keydown", (e) => {
  if (!smalScherm.matches || (e.key !== "Enter" && e.key !== " ")) return;
  const kop = e.target.closest("#filters .sectie > h2");
  if (!kop || e.target !== kop) return;
  e.preventDefault();
  wisselSectie(kop.parentElement);
});

/* ---------- het paneel minimaliseren ---------------------------------------------------
   Ingeklapt blijft alleen de knop staan, met het hamburgerpictogram: de kaart komt vrij
   en het paneel is één klik terug. De filters gaan mee dicht — ingeklapt is er geen
   paneel om ze in te tonen.

   Maar niet vergeten: stonden ze open op het moment van minimaliseren, dan komen ze bij
   het terughalen weer open. Wie het paneel wegklapt om even de kaart te zien, is niet
   klaar met filteren, en de filters opnieuw moeten openen na elke blik op de kaart is op
   een telefoon — waar het paneel het scherm vult en dus vaak wegklapt — een klik te veel
   bij elke beurt. */
let filtersWarenOpen = false;

function zetPaneel(klein) {
  const knop = $("knop-paneel");
  /* Alleen een échte wisseling telt voor het onthouden hieronder. pasTaalToe() roept deze
     functie ook aan met de stand die er al is, enkel om de knoptitel te laten vertalen —
     dat mag de onthouden filterstand niet wissen. */
  const wisselt = $("paneel").classList.contains("is-klein") !== klein;
  $("paneel").classList.toggle("is-klein", klein);
  /* De sleutel blijft op het element staan, niet alleen de vertaalde tekst: zo weet
     vertaalPagina() bij een taalwissel welke van de twee er hoort te staan. */
  const sleutel = klein ? "paneel.tonen" : "paneel.minimaliseren";
  knop.setAttribute("data-i18n-title", sleutel);
  knop.title = t(sleutel);
  const label = $("knop-paneel-tekst");
  label.setAttribute("data-i18n", sleutel);
  label.textContent = t(sleutel);
  if (klein) {
    if (wisselt) filtersWarenOpen = !$("filters").hidden;
    zetFilters(false);
  } else if (wisselt && filtersWarenOpen) {
    filtersWarenOpen = false;
    zetFilters(true);
  }
}

$("knop-paneel").addEventListener("click", () => {
  const klein = !$("paneel").classList.contains("is-klein");
  zetPaneel(klein);
  /* Terug uit de minimale stand: meteen in het zoekveld, en daarmee gaan ook de filters
     open. Wie het paneel terughaalt, komt om te zoeken of te filteren — daar hoort geen
     tweede klik voor nodig te zijn.

     Niet op een aanraakscherm: daar schuift de focus het schermtoetsenbord omhoog, dat
     samen met de opengeklapte filters bijna de hele kaart bedekt. Wie daar wil zoeken,
     tikt zelf in het veld. */
  if (!klein && !window.matchMedia("(pointer: coarse)").matches) $("zoekveld").focus();
});

/* Weergavekeuze, geen filter: `teken()` beslist er alleen mee of de uitgefilterde
   standplaatsen blijven staan. De telling in het paneel verandert er niet door. */
$("knop-grijs").addEventListener("change", (e) => {
  staat.grijsTonen = e.target.checked;
  teken();
});

/* Uitzetten laat de balk het midden van de kaart aanhouden. Voor wie de lijst liever
   ziet stilstaan, en voor een aanraakscherm waar er toch geen muis is om te volgen. */
$("knop-volgmuis").addEventListener("change", (e) => {
  volgMuis = e.target.checked;
  if (dichtbijBron === "auto") bijwerkenAutoDichtbij();
});

/* De balk helemaal uitzetten. Uit betekent ook: niet meer vanzelf terugkomen bij de
   eerstvolgende zoom- of filterwijziging — anders zou hij de schakelaar overrulen. */
$("knop-dichtbij").addEventListener("change", (e) => {
  balkAan = e.target.checked;
  if (!balkAan) {
    $("dichtbij").hidden = true;
    meetDichtbij();
    return;
  }
  verversDichtbij();
});

// Zie sluitFiltersBijScrollen() hierboven.
$("knop-scrollsluit").addEventListener("change", (e) => {
  filtersSluitenBijScrollen = e.target.checked;
});

/* ---------- de melding "géén live beschikbaarheid" wegklikken --------------------------
   Ze staat standaard in het paneel, want het is de belangrijkste grens van deze kaart.
   Wie ze gelezen heeft, mag ze wegklikken — maar pas na een bevestiging, zodat een misklik
   haar niet stilletjes laat verdwijnen, en met de uitweg erbij: de instellingen zetten
   haar terug. De keuze wordt onthouden, net als de taal; `localStorage` kan in een strenge
   iframe gooien, en dan geldt de keuze alleen voor dit bezoek. */
const LEGENDE_SLEUTEL = "degage-kaart-legende";

function legendeVerborgen() {
  try {
    return localStorage.getItem(LEGENDE_SLEUTEL) === "verborgen";
  } catch (e) {
    return false;
  }
}

function zetLegende(tonen, bewaren) {
  $("legende").hidden = !tonen;
  $("legende-vraag").hidden = true;
  $("legende-sluit").hidden = false;
  $("knop-legende").checked = tonen;
  if (!bewaren) return;
  try {
    if (tonen) localStorage.removeItem(LEGENDE_SLEUTEL);
    else localStorage.setItem(LEGENDE_SLEUTEL, "verborgen");
  } catch (e) {
    /* Niets aan te doen; de keuze geldt dan alleen voor dit bezoek. */
  }
}

$("legende-sluit").addEventListener("click", () => {
  $("legende-sluit").hidden = true;
  $("legende-vraag").hidden = false;
  $("legende-ja").focus();
});
$("legende-ja").addEventListener("click", () => zetLegende(false, true));
$("legende-nee").addEventListener("click", () => {
  $("legende-vraag").hidden = true;
  $("legende-sluit").hidden = false;
  $("legende-sluit").focus();
});
$("knop-legende").addEventListener("change", (e) => zetLegende(e.target.checked, true));
if (legendeVerborgen()) zetLegende(false, false);

/* ==========================================================================
   adres zoeken
   ==========================================================================
   Nominatim is de geocoder van OpenStreetMap: gratis, geen sleutel, maar met een
   gebruiksbeleid — hoogstens één verzoek per seconde, en uitdrukkelijk niet voor
   aanvullen-terwijl-je-typt. Daarom zoeken we ALLEEN bij verzenden, nooit per
   toetsaanslag, en houden we één verzoek tegelijk aan.

   Zoekopdrachten worden op België begrensd. Dat scheelt verkeerde treffers: "Melle"
   bestaat ook in Duitsland en Frankrijk. */
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
/* Hoeveel het beeld rond de kaart mag uitdijen voor we een zoekopdracht loslaten: 0,5 is
   een half scherm aan elke kant. Zie de afhandeling van `moveend`. */
const ZOEK_LOSLATEN = 0.5;
const AANTAL_DICHTBIJ = 5;
const MAX_NAAMTREFFERS = 8;

/* Wanneer de balk met dichtstbijzijnde wagens vanzelf verschijnt: altijd vanaf
   DICHTBIJ_ZOOM — maar daarvóór ook al, zodra er hoogstens DICHTBIJ_MAX_IN_BEELD wagens
   IN BEELD staan.
   ------------------------------------------------------------------------------------
   Het aantal alleen zei niet genoeg, en het zoomniveau alleen ook niet, want dat zegt
   niets over wat je ziet: boven Melsele staan er op zoom 11 vijfenvijftig wagens in
   beeld, boven Gent vierhonderd — dezelfde zoom, een heel ander plaatje. Op het
   platteland moest je daarom veel te ver inzoomen voor een lijstje dat er meteen had
   kunnen staan.

   Waar het echt om draait: is "de vijf dichtste" een antwoord of een willekeurige greep?
   Staan er honderden wagens in beeld, dan is het een greep en kijk je beter naar de pins
   zelf. Blijft het bij een stuk of honderd, dan is het een antwoord — hoe ver je ook
   uitgezoomd bent. Zo staat de balk boven een dorp al op het startbeeld.

   Maar in het dichtste stuk van Gent zakt de telling zelfs op buurtniveau niet onder de
   honderd, en daar bleef de balk dus altijd weg — net waar de vraag "wat staat hier
   dichtbij?" het vaakst gesteld wordt. Vandaar de zoomondergrens ernaast: wie zo ver
   inzoomt, kijkt naar één buurt, en dan zijn de vijf dichtste opnieuw een antwoord, ook
   al staan er meer pins getekend dan we los zouden willen tellen. Dezelfde tweetrapsregel
   als NAAM_ZOOM/NAMEN_MAX_IN_BEELD bij de namen naast de pins.

   Het aantal kan bij inzoomen alleen maar dalen en de zoom alleen maar stijgen, dus de
   balk klapt nooit weer dicht terwijl je verder inzoomt. Filters tellen mee: wie op
   bestelwagens filtert, houdt er veel minder in beeld over en krijgt de balk dus
   vroeger. */
const DICHTBIJ_MAX_IN_BEELD = 100;
const DICHTBIJ_ZOOM = 15;

/* Eén vaste titel voor de automatische balk. Het meetpunt wisselt (de muis, of anders
   het midden van de kaart), maar dat in de titel zetten zou de kop laten wisselen zodra
   de cursor de kaart op of af gaat. De afstanden op de kaartjes lopen zichtbaar mee met
   de muis; die vertellen het verhaal beter dan een kop die staat te knipperen.

   Een functie en geen tekst, want de taal kan intussen gewisseld zijn — zie toonLijst(). */
const TITEL_DICHTBIJ = () => t("dichtbij.titel");

/* Wagens die door de filters komen én binnen het huidige kaartvenster vallen. */
function wagensInBeeld() {
  const venster = kaart.getBounds();
  let n = 0;
  for (const station of staat.stations) {
    if (!venster.contains(L.latLng(station.lat, station.lon))) continue;
    n += station.wagens.filter(wagenPast).length;
  }
  return n;
}

let zoekMarker = null;
/* Waar de laatste zoekopdracht over ging: het gevonden adres, of de wagen die eruit
   kwam. Nodig om te merken dat de bezoeker er intussen vandaan gepand is. */
let zoekAnker = null;
let zoekLoopt = false;
/* Waardoor de balk met dichtstbijzijnde wagens nu open staat: "zoek" (adres- of
   naamzoekopdracht, die wint altijd) of "auto" (vanzelf getoond door in te zoomen),
   of null als ze dicht is. Een naamzoekopdracht zet geen `zoekMarker`, dus die alleen
   zou niet volstaan om een automatische balk buiten de deur te houden. */
let dichtbijBron = null;
// Wat er nu in de balk staat, zodat een muisbeweging alleen de afstanden hoeft bij te
// werken zolang de volgorde niet verandert. Zie toonLijst().
let dichtbijRijen = [];
/* Hoe de kop en de lege melding van de balk luiden. Als functie bewaard en niet als
   afgewerkte tekst: bij een taalwissel moet dezelfde lijst zich opnieuw kunnen
   opschrijven, ook als ze uit een zoekopdracht van vijf minuten geleden komt. */
let dichtbijTitel = TITEL_DICHTBIJ;
let dichtbijLeeg = () => "";
// De popup die vanuit de balk geopend is, en bij welke standplaats hij hoort: samen
// laten ze een tweede klik op hetzelfde kaartje de popup weer sluiten.
let balkPopup = null;
let balkPopupStation = null;

/* De muis, bewaard als punt IN HET KAARTVENSTER en niet als coördinaat: zo blijft hij
   ook na pannen of zoomen wijzen waar de cursor werkelijk staat. Blijft null zolang er
   niet met een muis bewogen is — op een telefoon dus altijd. */
let muisPositie = null;
// Aan te zetten met "Lijst dichtstbijzijnde wagens volgt muis" in de instellingen; uit betekent: altijd het midden.
let volgMuis = true;
/* Uit te zetten met "Lijst dichtstbijzijnde wagens tonen". Voor wie de kaart zelf wil
   lezen zonder een balk die een vijfde van het scherm inneemt. */
let balkAan = true;
/* Vanaf welk punt de balk meet, als ze uit een zoekopdracht of uit "wagens in mijn buurt"
   komt — en null als ze uit een naamzoekopdracht komt. Dat verschil bepaalt of een
   filterwijziging de lijst opnieuw mag uitrekenen: een lijst met afstanden hoort mee te
   bewegen met de filters, een lijst met naamtreffers niet (die negeert de filters met
   opzet, zie naamTreffers()). */
let dichtbijMeetpunt = null;

/* Hoe dicht de cursor bij de balk mag komen voor we terugvallen op het midden. */
const BALK_MARGE = 40;

/* Vanaf welk punt "dichtstbij" gemeten wordt: de muis als die er is, anders het midden
   van de kaart.

   Komt de cursor in de buurt van de balk zelf, dan telt de muis niet mee: vlak boven de
   balk wijst hij naar een strook kaart die grotendeels ónder de balk ligt. Het midden
   beweegt niet en is daar dus het rustigste antwoord.

   Het naderen van de balk herschikt de lijst daarom niet: de muisafhandeling verderop
   stopt dan met bijwerken, zodat de volgorde blijft staan zoals ze was. Dit anker geldt
   alleen voor de bijwerkingen die tóch moeten gebeuren — na zoomen, pannen of een
   filterwijziging. */
function ankerpunt() {
  if (!volgMuis || !muisPositie || bijDeBalk(muisPositie)) return kaart.getCenter();
  return kaart.containerPointToLatLng(muisPositie);
}

/* De zichtbare doos binnen de balkruimte. Waar het om de plek op het scherm gaat — wat is
   er bedekt, waar ligt de muis — is dít het element; `#dichtbij` is alleen de ruimte die
   ervoor vrijgehouden wordt. */
function balkDoos() {
  return $("dichtbij").querySelector(".dichtbij__doos");
}

/* Staat de balk er ook écht? `hidden` is één reden om weg te zijn, de opmaak is de
   andere: op een telefoon verdwijnt ze zolang de filters open staan (zie
   `.paneel.toont-filters ~ .dichtbij`). Wie haar uitmeet, moet dat verschil kennen — een
   doos die display:none is, geeft een rechthoek van nul terug op positie nul, en daar
   zou `--dichtbij-ruimte` het hele venster van maken. */
function balkInBeeld() {
  return !$("dichtbij").hidden && balkDoos().offsetParent !== null;
}

function bijDeBalk(punt) {
  if (!balkInBeeld()) return false;
  /* De doos en niet de ruimte eromheen: naast de doos ligt gewoon kaart, en daar hoort de
     lijst gewoon mee te bewegen met de muis. Zie `.dichtbij` in de opmaak. */
  const b = balkDoos().getBoundingClientRect();
  // `punt` telt vanaf de linkerbovenhoek van de kaart, de rechthoek vanaf die van het
  // venster; het verschil ertussen moet er dus af.
  const k = document.getElementById("kaart").getBoundingClientRect();
  return punt.x >= b.left - k.left - BALK_MARGE && punt.x <= b.right - k.left + BALK_MARGE &&
         punt.y >= b.top - k.top - BALK_MARGE && punt.y <= b.bottom - k.top + BALK_MARGE;
}

function toonZoekmelding(tekst) {
  const vak = $("zoekmelding");
  vak.textContent = tekst || "";
  vak.hidden = !tekst;
}

/* ==========================================================================
   het vrije deel van de kaart
   ==========================================================================
   Het paneel, de balk onderaan, de kaartknoppen en de meldknop liggen óver de kaart. Het
   midden van het venster is dus niet het midden van wat je ziet: een wagen die je daar
   neerzet, verdwijnt onder het paneel. Deze functies rekenen uit hoeveel er aan elke kant
   bedekt is, en mikken op het midden van wat overblijft.

   De maten worden bij elke oproep gemeten, niet onthouden: het paneel groeit en krimpt
   met de filters, de balk kan dicht staan, en op een telefoon liggen het paneel bovenaan
   en de knoppen onderaan in plaats van links en rechts. */

/* Eén overlay die in een HOEK ligt — de kaartknoppen, de meldknop — bedekt geen hele
   rand. Je kunt hem langs twee kanten ontwijken: opzij of omhoog/omlaag. Deze functie
   kiest de goedkoopste van de twee, dus die het minste kaart kost.

   Voor de knoppenbalk rechtsboven is dat de rechterkant (een strookje van een knop
   breed) en niet de bovenkant (de hele balk hoog); voor de meldknop ernaast is het
   net omgekeerd: hij is breed en laag, dus wijk je eroverheen. Zo blijft er van beide
   samen niet meer bedekt dan een smalle rand rechts en een lage strook bovenaan. */
function bedekHoek(o, el, vak) {
  /* Geen offsetParent betekent display:none — de meldknop gaat op een telefoon weg
     zodra het instellingendoosje op zijn plaats openklapt. */
  if (!el || !el.offsetParent) return;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;

  /* Per as: de afstand van de verste rand van de overlay tot de rand van de kaart waar
     hij tegenaan ligt. De kleinste van de twee is de kant waar hij zit. */
  const hInzet = Math.min(r.right - vak.left, vak.right - r.left);
  const hKant = r.right - vak.left <= vak.right - r.left ? "links" : "rechts";
  const vInzet = Math.min(r.bottom - vak.top, vak.bottom - r.top);
  const vKant = r.bottom - vak.top <= vak.bottom - r.top ? "boven" : "onder";

  if (hInzet <= vInzet) o[hKant] = Math.max(o[hKant], hInzet);
  else o[vKant] = Math.max(o[vKant], vInzet);
}

/* `opties.meldknop === false` laat de meldknop buiten beschouwing: op een telefoon mag een
   popup zijn plaats innemen (zie popupRanden()). Voor het mikken van de kaart telt hij
   gewoon mee — daar valt niets weg en hoort er niets onder te verdwijnen. */
function vrijeRuimte(opties) {
  const vak = document.getElementById("kaart").getBoundingClientRect();
  const mobiel = window.matchMedia("(max-width: 640px)").matches;
  const paneel = $("paneel");
  let links = 0, boven = 0, onder = 0;

  const p = paneel.getBoundingClientRect();
  if (mobiel) boven = p.bottom - vak.top;
  else links = p.right - vak.left;

  if (balkInBeeld()) onder = vak.bottom - balkDoos().getBoundingClientRect().top;

  const o = {
    links: Math.max(0, links),
    boven: Math.max(0, boven),
    rechts: 0,
    onder: Math.max(0, onder)
  };

  /* De kaartknoppen en de meldknop erbij. Ze verhuizen van rechtsboven naar linksonder
     op een telefoon; door te meten in plaats van te rekenen hoeft dat hier niet geweten
     te zijn. De knoppenbalk wordt gemeten zoals ze staat, dus mét de uitzoomknop en het
     tandwiel eronder. */
  bedekHoek(o, document.querySelector(".leaflet-top.leaflet-left"), vak);
  if (!opties || opties.meldknop !== false) {
    bedekHoek(o, document.querySelector(".melden"), vak);
  }

  return o;
}

/* Zet `punt` in het midden van het ONBEDEKTE deel van de kaart. */
function centreerVrij(punt, zoom) {
  const o = vrijeRuimte();
  const dx = (o.links - o.rechts) / 2;
  const dy = (o.boven - o.onder) / 2;
  // Het kaartmidden moet net zoveel de andere kant op als het punt moet opschuiven.
  const doel = kaart.unproject(kaart.project(punt, zoom).subtract([dx, dy]), zoom);
  /* Zonder animatie, en dat is geen luiheid: een popup die opengaat terwijl de kaart
     nog schuift, laat Leaflets eigen bijsturing tegen een bewegend doel rekenen. De
     popup kwam dan half boven het scherm uit. Eerst stilstaan, dan openen. */
  kaart.setView(doel, zoom, { animate: false });
}

/* Popupranden die dezelfde bedekking kennen, zodat Leaflets eigen bijsturing een popup
   nooit half onder het paneel laat staan. */
function popupRanden() {
  /* Op een telefoon telt de meldknop hier niet mee. Hij ligt daar linksonder over de
     kaart en is precies breed genoeg om een flinke strook van de hoogte op te eisen —
     terwijl hij het minst belangrijke is wat er staat. Liever een popup die over die plek
     valt dan een popup die daardoor niet meer past; de knop gaat zolang weg (zie
     `.toont-popup .melden` in de opmaak en de `popupopen`-luisteraar).

     Op een breed scherm blijft hij wél meetellen: daar is ruimte genoeg, hij staat
     rechtsboven, en hij blijft staan terwijl de popup open is. */
  const mobiel = window.matchMedia("(max-width: 640px)").matches;
  const o = vrijeRuimte({ meldknop: !mobiel });

  /* RAND is de lucht die een popup van de rand van het vrije vlak houdt; CHROOM is wat de
     popup zelf bovenop zijn inhoud inneemt — de punt onderaan, de kaders en de marges.
     MINSTENS is de hoogte waaronder een popup niet meer prettig leest, KRAP die waaronder
     hij niets meer zegt. */
  const RAND = 16, CHROOM = 48, MINSTENS = 190, KRAP = 120;
  let boven = o.boven + RAND, onder = o.onder + RAND;
  const hoogte = kaart.getSize().y;

  /* Op een telefoon is de ruimte tussen het paneel en de balk soms kleiner dan de popup
     zelf. Een bovengrens alleen lost dat niet op: onder de MINSTENS wordt een popup een
     onleesbaar strookje, en Leaflet duwt hem dan tegen de bovenrand aan — waarna de
     onderkant van het scherm valt. Daarom geven we bij plaatsgebrek de plaats ONDERAAN
     terug: daar liggen de meldknop en de balk, en die stappen allebei opzij zodra een
     popup ze raakt (zie de `popupopen`-luisteraar). Zo valt de popup over hún plek in
     plaats van half buiten beeld. */
  let vrij = hoogte - boven - onder - CHROOM;
  if (vrij < MINSTENS) {
    onder = Math.max(8, onder - (MINSTENS - vrij));
    vrij = hoogte - boven - onder - CHROOM;
  }

  /* Blijft het dan nog te krap — een laag venster met een hoog paneel — dan pas over het
     paneel heen. Dat is het laatste redmiddel: het paneel blijft bovenop liggen, dus wat
     eronder komt, is niet te lezen. Liever dat dan een popup die van het scherm valt. */
  if (vrij < KRAP) {
    boven = Math.max(8, boven - (KRAP - vrij));
    vrij = hoogte - boven - onder - CHROOM;
  }

  return {
    autoPanPaddingTopLeft: L.point(o.links + RAND, boven),
    autoPanPaddingBottomRight: L.point(o.rechts + RAND, onder),
    /* Nooit hoger dan wat er is: Leaflet laat de inhoud dan binnen de popup scrollen in
       plaats van hem af te snijden. */
    maxHeight: Math.max(KRAP, Math.round(vrij))
  };
}

/* Het decimaalteken komt uit de taal: 1,4 km in het Nederlands en Frans, 1.4 km in het
   Engels. Onder de kilometer wordt er op tientallen meters afgerond — preciezer doen
   zou een nauwkeurigheid beweren die een hemelsbrede afstand niet heeft. */
function afstandInWoorden(meters) {
  if (meters < 1000) return Math.round(meters / 10) * 10 + " m";
  const cijfers = meters < 10000 ? 1 : 0;
  return (meters / 1000).toLocaleString(locale(), {
    minimumFractionDigits: cijfers, maximumFractionDigits: cijfers
  }) + " km";
}

/* De dichtstbijzijnde wagens die door de huidige filters komen. Filtert iemand op
   bestelwagen, dan wil hij de dichtstbijzijnde BESTELWAGEN zien, niet de dichtstbijzijnde
   wagen die hij toch niet kan gebruiken. */
function dichtstbijzijnde(punt) {
  const gevonden = [];
  for (const station of staat.stations) {
    const passende = station.wagens.filter(wagenPast);
    if (!passende.length) continue;
    const meters = kaart.distance(punt, L.latLng(station.lat, station.lon));
    for (const wagen of passende) gevonden.push({ station, wagen, meters });
  }
  gevonden.sort((a, b) => a.meters - b.meters);
  return gevonden.slice(0, AANTAL_DICHTBIJ);
}

/* Zoeken op autonaam. Gebeurt vóór de adreszoekopdracht en volledig lokaal: de vloot
   staat al in het geheugen, dus dit kost geen enkel verzoek naar buiten.

   Filters worden hier BEWUST genegeerd. Wie een naam intikt, zoekt één bepaalde wagen;
   die niet tonen omdat er toevallig een brandstoffilter aanstaat, zou als een fout
   voelen. De popup vertelt daarna zelf wat voor wagen het is. */
function naamTreffers(vraag) {
  const v = zoeksleutel(vraag);
  if (!v) return [];
  const treffers = [];
  for (const station of staat.stations) {
    for (const wagen of station.wagens) {
      const naam = zoeksleutel(wagen.naam);
      if (!naam.includes(v)) continue;
      // Rangschikking: precies gelijk eerst, dan wat ermee begint, dan de rest.
      const rang = naam === v ? 0 : (naam.startsWith(v) ? 1 : 2);
      treffers.push({ station, wagen, rang });
    }
  }
  treffers.sort((a, b) => a.rang - b.rang ||
                          a.wagen.naam.localeCompare(b.wagen.naam, taal));
  return treffers;
}

/* Kleine letters, zonder accenten — zodat "Zoë" ook op "zoe" gevonden wordt. */
function zoeksleutel(s) {
  // ̀-ͯ zijn de losse accenttekens die NFKD achterlaat.
  return String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim();
}

function toonDichtbij(punt, label) {
  dichtbijBron = "zoek";
  zoekAnker = punt;
  dichtbijMeetpunt = punt;
  toonLijst(dichtstbijzijnde(punt),
            () => t("dichtbij.bij", { plek: ontsnap(label) }),
            () => t("dichtbij.leeg"));
}

/* `titelFn` en `legeFn` geven de kop en de melding-bij-lege-lijst terug; ze worden hier
   bewaard zodat pasTaalToe() dezelfde lijst opnieuw kan laten opschrijven. */
function toonLijst(rijen, titelFn, legeFn) {
  const balk = $("dichtbij");
  dichtbijTitel = titelFn;
  dichtbijLeeg = legeFn;

  /* Eén poort voor de schakelaar uit de instellingen. Hier en niet bij elke oproeper,
     want de balk wordt vanaf een stuk of zes plekken gevuld en één ervan vergeten is
     precies het soort fout dat je pas maanden later merkt. */
  if (!balkAan) {
    balk.hidden = true;
    meetDichtbij();
    return;
  }

  /* Volgt de balk de muis, dan komt hier vele keren per seconde dezelfde rij wagens
     binnen met alleen een andere afstand. De hele balk opnieuw opbouwen zou dan de
     kaartjes onder de cursor wegtrekken: de hover valt weg, een kaartje dat toetsenbord-
     focus heeft verliest die, en een klik komt op een net vervangen knop terecht. Is de
     volgorde ongewijzigd, dan werken we dus alleen de afstanden bij.

     De gelijkheidstest kijkt naar de wagenobjecten zelf: die worden één keer bij het
     laden gemaakt en blijven daarna dezelfde, dus identiteit volstaat. */
  const afstanden = $("dichtbij-lijst").querySelectorAll(".dichtbij__afstand");
  if (dichtbijBron === "auto" && !balk.hidden &&
      rijen.length && rijen.length === dichtbijRijen.length &&
      afstanden.length === rijen.length &&
      rijen.every((r, i) => r.wagen === dichtbijRijen[i].wagen &&
                            r.meters !== undefined)) {
    rijen.forEach((r, i) => { afstanden[i].textContent = afstandInWoorden(r.meters); });
    dichtbijRijen = rijen;
    return;
  }

  dichtbijRijen = rijen;

  if (!rijen.length) {
    balk.hidden = true;
    meetDichtbij();
    toonZoekmelding(legeFn());
    return;
  }

  $("dichtbij-titel").innerHTML = titelFn();
  $("dichtbij-lijst").innerHTML = rijen.map((r, i) => {
    // Gemeente en brandstof: genoeg om te beslissen zonder de popup te openen.
    const waar = [r.wagen.plaats, waarde(r.wagen.brandstof)].filter(Boolean).join(" · ");
    return '<li><button type="button" class="dichtbij__kaartje" data-i="' + i + '">' +
      '<span class="dichtbij__naam">' + ontsnap(r.wagen.naam) + "</span>" +
      '<span class="dichtbij__model">' + ontsnap(r.wagen.merk + " " + r.wagen.model) + "</span>" +
      '<span class="dichtbij__waar">' + ontsnap(waar) + "</span>" +
      // Bij zoeken op naam is er geen punt om vanaf te meten, dus geen afstand.
      (r.meters === undefined ? ""
        : '<span class="dichtbij__afstand">' + ontsnap(afstandInWoorden(r.meters)) + "</span>") +
    "</button></li>";
  }).join("");

  // Klikken brengt je naar die wagen en opent zijn popup.
  $("dichtbij-lijst").querySelectorAll(".dichtbij__kaartje").forEach((knop) => {
    knop.addEventListener("click", () => {
      const r = rijen[Number(knop.dataset.i)];

      /* Nog eens op hetzelfde kaartje: de popup weer dicht. Een kaartje is zo een
         schakelaar in plaats van een eenrichtingsknop — anders moet je het kruisje in de
         popup zoeken terwijl je cursor al op het kaartje staat. `hasLayer` vangt op dat
         de bezoeker de popup intussen zelf gesloten kan hebben. */
      if (balkPopup && balkPopupStation === r.station) {
        kaart.closePopup(balkPopup);   // `popupclose` zet balkPopup weer op null
        return;
      }

      /* De popup wordt eerst gemaakt en pas daarna geopend, want het verschuiven van de
         kaart hieronder laat `moveend` afgaan — en dat zou de lijst herschikken terwijl
         je er net op geklikt hebt. Zodra `balkPopup` bestaat, staat de lijst stil. */
      const punt = L.latLng(r.station.lat, r.station.lon);
      balkPopupStation = r.station;
      balkPopup = L.popup(Object.assign({ closeButton: true }, popupRanden()))
        .setLatLng(punt)
        .setContent(popupHtml(r.station));
      centreerVrij(punt, Math.max(kaart.getZoom(), 15));
      balkPopup.openOn(kaart);
    });
  });

  balk.hidden = false;
  meetDichtbij();
}

/* De echte hoogte van de balk doorgeven aan de opmaak, zodat de zoomknoppen op een
   telefoon er niet onder verdwijnen. Wordt ook bij een venstermaatwijziging opnieuw
   gemeten: bij een smaller scherm breekt de titel en wordt de balk hoger. */
function meetDichtbij() {
  const rechthoek = balkInBeeld() ? balkDoos().getBoundingClientRect() : null;
  const hoogte = rechthoek ? Math.ceil(rechthoek.height) + 12 : 0;
  document.documentElement.style.setProperty("--dichtbij-hoogte", hoogte + "px");
  /* Hoeveel er onderaan het venster bezet is, tot de bovenrand van de balk. Op een
     telefoon is dat nul zodra de filters open staan: de balk gaat dan weg (zie
     `.paneel.toont-filters ~ .dichtbij` in de opmaak) en het paneel mag de volle hoogte
     nemen. zetFilters() roept dit aan ná het wisselen van de klasse, dus er wordt
     gemeten wat er dán staat. */
  const ruimte = rechthoek ? Math.ceil(window.innerHeight - rechthoek.top) : 0;
  document.documentElement.style.setProperty("--dichtbij-ruimte", ruimte + "px");
}
window.addEventListener("resize", meetDichtbij);

/* ==========================================================================
   automatisch dichtbij bij voldoende inzoomen
   ==========================================================================
   Een adreszoekopdracht toont expliciet de dichtstbijzijnde wagens bij dat adres. Wie
   ergens genoeg inzoomt, stelt impliciet dezelfde vraag: wat staat hier dichtbij? Zodra
   er weinig genoeg wagens in beeld staan of ver genoeg ingezoomd is (zie
   DICHTBIJ_MAX_IN_BEELD en DICHTBIJ_ZOOM) tonen we daarom dezelfde balk, maar rond het
   midden van de kaart, en ze schuift mee tijdens het pannen.

   Een zoekopdracht (adres of naam) wint altijd: zolang `dichtbijBron` op "zoek" staat,
   laten we die balk met rust. Sluit de bezoeker de automatische balk zelf, dan blijft ze
   dicht tot de volgende zoom- of filterwijziging — anders klapt ze bij de eerstvolgende
   pan meteen weer open. */
/* De balk bijwerken na een wijziging die haar inhoud raakt: een filter, een schakelaar,
   een taalwissel.
   ------------------------------------------------------------------------------------
   Hiervóór liep alles via bijwerkenAutoDichtbij(), en die stapt meteen uit zodra de balk
   uit een zoekopdracht komt — zo hoort het ook, want zoomen en pannen mogen een
   zoekresultaat niet wegduwen. Maar daardoor bleef de lijst ná een adreszoekopdracht
   staan zoals ze stond, ook als je een filter aan- of uitzette: je vinkte "bestelwagen"
   aan en onderaan stonden nog steeds dezelfde vijf personenwagens.

   Vandaar deze splitsing. Meet de balk vanaf een punt, dan rekent hij opnieuw vanaf
   datzelfde punt; in alle andere gevallen beslist bijwerkenAutoDichtbij(). */
function verversDichtbij() {
  if (!balkAan) return;
  if (dichtbijBron === "zoek" && dichtbijMeetpunt) {
    // Niet terwijl er een popup uit de balk openstaat: zie lijstBevroren().
    if (lijstBevroren()) return;
    toonLijst(dichtstbijzijnde(dichtbijMeetpunt), dichtbijTitel, dichtbijLeeg);
    return;
  }
  bijwerkenAutoDichtbij();
}

function bijwerkenAutoDichtbij() {
  if (!balkAan) return;
  if (dichtbijBron === "zoek") return;
  /* Zonder echte maat is `getBounds()` een punt en zou de telling nul geven — dan zou de
     balk juist in een nog niet uitgemeten iframe opengaan. Zie zetStartbeeld(). */
  if (kaart.getSize().x === 0 || kaart.getSize().y === 0) return;

  if (kaart.getZoom() < DICHTBIJ_ZOOM && wagensInBeeld() > DICHTBIJ_MAX_IN_BEELD) {
    if (dichtbijBron === "auto") {
      dichtbijBron = null;
      $("dichtbij").hidden = true;
      meetDichtbij();
    }
    return;
  }

  dichtbijBron = "auto";
  if (!$("dichtbij").hidden && lijstBevroren()) return;
  toonLijst(dichtstbijzijnde(ankerpunt()), TITEL_DICHTBIJ, () => "");
}

/* Staat er een popup open die vanuit de balk geopend is, dan blijft de lijst staan zoals
   ze staat.
   ------------------------------------------------------------------------------------
   Zonder dit werkt een tweede klik niet: het aanklikken van een kaartje schuift de kaart
   naar die wagen, dat verplaatst het meetpunt, en de lijst herschikt. Het kaartje onder
   je cursor is dan een ándere wagen geworden, en je tweede klik opent er een nieuwe popup
   in plaats van de vorige te sluiten. Bovendien hoort een lijst niet te bewegen terwijl
   je de popup leest die je er net uit geopend hebt. */
function lijstBevroren() {
  return balkPopup !== null;
}

/* Wie de popup zelf wegklikt — het kruisje, de Escape-toets, een klik elders op de kaart
   — laat de lijst weer meelopen. Zo hoeft alleen dit ene plekje te weten wanneer de
   popup verdwijnt, en blijft `balkPopup` nooit ten onrechte staan. */
kaart.on("popupclose", (e) => {
  // Zie `popupopen` hierboven: de meldknop en de balk mogen terug. Leaflet houdt er
  // hoogstens één popup open, dus er valt niets af te tellen.
  document.body.classList.remove("toont-popup");
  if (document.body.classList.contains("popup-over-balk")) {
    document.body.classList.remove("popup-over-balk");
    meetDichtbij();
  }
  if (e.popup === balkPopup) { balkPopup = null; balkPopupStation = null; }
});
kaart.on("zoomend", bijwerkenAutoDichtbij);
// Alleen bijwerken tijdens pannen als de balk al door het inzoomen openstaat — anders
// verschijnt ze na een handmatige sluiting bij de eerstvolgende beweging weer.
kaart.on("moveend", () => {
  /* Ver van de zoekopdracht weggevaren? Dan is die opdracht op. Zolang ze blijft staan,
     houdt ze de balk vast op "dichtst bij Gent" en volgt de lijst de muis niet meer —
     terwijl de bezoeker allang ergens anders aan het kijken is.

     Ruim gemeten: pas als het gezochte punt meer dan een half scherm buiten beeld ligt.
     Bij de rand al opruimen zou een kleine correctie op je eigen zoekopdracht afstraffen. */
  if (dichtbijBron === "zoek" && zoekAnker &&
      !kaart.getBounds().pad(ZOEK_LOSLATEN).contains(zoekAnker)) {
    wisZoekopdracht();
    return;
  }
  if (dichtbijBron === "auto") bijwerkenAutoDichtbij();
});

/* De volgorde volgt de muis: de wagen waar de cursor het dichtst bij staat, komt
   vooraan. Zo wijs je een buurt aan en zegt de balk meteen wat daar staat, zonder te
   klikken of te pannen.
   ------------------------------------------------------------------------------------
   Maar niet élke beweging is een aanwijzing. Wie naar de balk onderaan veegt om er een
   kaartje aan te klikken, wijst onderweg tientallen buurten aan die hij niet bedoelt —
   en als de lijst dan meeschuift, is het kaartje waar hij op mikte verdwenen tegen de
   tijd dat hij er is. Daarom kijken we naar de SNELHEID:

   · Traag bewegen is aanwijzen. Dan werken we bij, hoogstens één keer per MUIS_RUST
     milliseconden — vaker dan dat ziet niemand, en elke herberekening loopt over de
     hele vloot.
   · Snel bewegen is ergens naartoe gaan. Dan gebeurt er niets; de lijst blijft staan
     zoals ze staat.
   · Stilvallen na zo'n veeg telt alsnog als aanwijzen: MUIS_STIL later werken we bij.
     Zonder dat zou de lijst na een snelle beweging bevroren blijven tot je weer traag
     beweegt.

   Komt de cursor in de buurt van de balk, dan houdt het helemaal op: geen bijwerking en
   ook geen uitgestelde meer. Dat is de reden dat de drempel bestaat — de laatste meters
   naar de balk moeten de lijst met rust laten.

   Alleen herschikken, nooit openen of sluiten: wát er in beeld staat blijft aan zoom,
   pannen en filters hangen. Anders zou de balk vanzelf verschijnen zodra de cursor over
   de kaart glijdt, en dat heeft de bezoeker niet gevraagd. */
const MUIS_RUST = 90;        // ms tussen twee herberekeningen tijdens traag bewegen
const MUIS_STIL = 260;       // ms stilstand voor we na een veeg alsnog bijwerken
const MUIS_VEEG = 0.8;       // px per ms; daarboven heet het een veeg en niet een aanwijzing
const MUIS_VERS = 120;       // ouder dan dit zegt niets meer over de snelheid van nú

let muisVorige = null;       // vorige positie + tijdstip, om de snelheid uit te rekenen
let muisLaatst = 0;
let muisStilTimer = null;

function herschikDichtbij() {
  if (!volgMuis || dichtbijBron !== "auto" || lijstBevroren()) return;
  if (!muisPositie || bijDeBalk(muisPositie)) return;
  muisLaatst = performance.now();
  toonLijst(dichtstbijzijnde(ankerpunt()), TITEL_DICHTBIJ, () => "");
}

kaart.on("mousemove", (e) => {
  const nu = performance.now();
  const vorige = muisVorige;
  muisPositie = e.containerPoint;
  muisVorige = { x: muisPositie.x, y: muisPositie.y, t: nu };

  if (!volgMuis || dichtbijBron !== "auto" || lijstBevroren()) return;

  /* Eerst de vorige afspraak afzeggen: elke nieuwe beweging maakt een uitgestelde
     bijwerking ongeldig. Staat de cursor bij de balk, dan zetten we er ook geen nieuwe
     — zo verandert er niets meer terwijl je hem nadert. */
  clearTimeout(muisStilTimer);
  if (bijDeBalk(muisPositie)) return;

  muisStilTimer = setTimeout(herschikDichtbij, MUIS_STIL);

  /* De snelheid komt uit het verschil met de vorige beweging, en die moet dus vers zijn.
     Na een stilte is de eerste beweging niet te beoordelen: hij lijkt altijd traag, want
     de teller staat op honderden milliseconden. Juist die eerste stap is bij een veeg de
     verraderlijke — hij zette de lijst één keer opnieuw, precies bij het wegduiken naar
     de balk. Onbekend telt daarom als te snel: dan beslist de volgende beweging, of het
     stilvallen hierboven. */
  const verstreken = vorige ? nu - vorige.t : 0;
  const vers = verstreken > 0 && verstreken < MUIS_VERS;
  const snelheid = vers
    ? Math.hypot(muisPositie.x - vorige.x, muisPositie.y - vorige.y) / verstreken
    : Infinity;
  if (snelheid > MUIS_VEEG) return;          // veeg: de timer hierboven vangt het op
  if (nu - muisLaatst < MUIS_RUST) return;
  herschikDichtbij();
});

async function zoekAdres(vraag) {
  /* `accept-language` laat Nominatim de plaatsnamen teruggeven in de taal van de
     bezoeker waar die bestaat — "Bruxelles" naast "Brussel". */
  const url = NOMINATIM + "?" + new URLSearchParams({
    format: "jsonv2", limit: "1", countrycodes: "be", addressdetails: "0",
    "accept-language": taal, q: vraag
  });
  const antwoord = await fetch(url, { headers: { Accept: "application/json" } });
  if (!antwoord.ok) throw new Error(t("zoek.dienstStatus", { status: antwoord.status }));
  const treffers = await antwoord.json();
  return treffers[0] || null;
}

$("zoekform").addEventListener("submit", async (e) => {
  e.preventDefault();
  const vraag = $("zoekveld").value.trim();
  if (!vraag || zoekLoopt) return;

  /* Eerst de vloot zelf, maar alleen als de treffer STERK is: de naam is precies wat er
     staat, of begint ermee. Een treffer middenin een naam telt niet mee, want dan zou
     "Gent" de wagen "AstraBreakGentbrugge" opleveren in plaats van de stad — en dat
     bedoelt niemand. Zulke zwakke treffers worden bewaard en pas getoond als er ook
     geen adres blijkt te bestaan.

     Levert de naam wél iets op, dan gaat er géén verzoek naar de adressendienst. */
  const treffers = naamTreffers(vraag);
  const sterk = treffers.length && treffers[0].rang <= 1;
  if (sterk) {
    if (zoekMarker) { kaart.removeLayer(zoekMarker); zoekMarker = null; }
    const getoond = treffers.slice(0, MAX_NAAMTREFFERS);
    const titel = () => treffers.length === 1
      ? t("zoek.gevonden", { naam: ontsnap(treffers[0].wagen.naam) })
      : t("zoek.meerdere", { n: treffers.length, vraag: ontsnap(vraag) }) +
        (treffers.length > getoond.length ? t("zoek.eerste", { n: getoond.length }) : "");
    dichtbijBron = "zoek";
    // De eerste treffer is waar de kaart naartoe gaat; die telt als het ankerpunt.
    zoekAnker = L.latLng(getoond[0].station.lat, getoond[0].station.lon);
    // Geen meetpunt: een naamtreffer draagt geen afstand en negeert de filters.
    dichtbijMeetpunt = null;
    toonLijst(getoond, titel, () => "");
    toonZoekmelding("");

    if (treffers.length === 1) {
      // Eén treffer: meteen erheen, dat scheelt een klik.
      const s = treffers[0].station;
      centreerVrij(L.latLng(s.lat, s.lon), Math.max(kaart.getZoom(), 15));
      L.popup(Object.assign({ closeButton: true }, popupRanden()))
        .setLatLng([s.lat, s.lon]).setContent(popupHtml(s)).openOn(kaart);
    } else {
      // Meerdere: alles in beeld brengen in plaats van er één te kiezen.
      kaart.fitBounds(L.latLngBounds(getoond.map((r) => [r.station.lat, r.station.lon])),
                      { padding: [48, 48], maxZoom: 15 });
    }
    return;
  }

  zoekLoopt = true;
  $("zoekknop").setAttribute("aria-busy", "true");
  toonZoekmelding(t("zoek.bezig"));

  try {
    const treffer = await zoekAdres(vraag);
    if (!treffer) {
      /* Geen adres. Stonden er wél zwakke naamtreffers klaar, dan waren die toch
         bedoeld — beter die tonen dan de bezoeker met lege handen laten staan. */
      if (treffers.length) {
        const getoond = treffers.slice(0, MAX_NAAMTREFFERS);
        toonZoekmelding(t("zoek.geenAdres", { vraag: vraag }));
        dichtbijBron = "zoek";
        zoekAnker = L.latLng(getoond[0].station.lat, getoond[0].station.lon);
        dichtbijMeetpunt = null;
        toonLijst(getoond,
                  () => t("zoek.meerdere", { n: treffers.length, vraag: ontsnap(vraag) }),
                  () => "");
        kaart.fitBounds(L.latLngBounds(getoond.map((r) => [r.station.lat, r.station.lon])),
                        { padding: [48, 48], maxZoom: 15 });
        return;
      }
      toonZoekmelding(t("zoek.niets", { vraag: vraag }));
      dichtbijBron = null;
      $("dichtbij").hidden = true;
      return;
    }
    const punt = L.latLng(Number(treffer.lat), Number(treffer.lon));

    if (zoekMarker) kaart.removeLayer(zoekMarker);
    zoekMarker = L.marker(punt, {
      icon: L.divIcon({ html: '<span class="zoekpunt"></span>', className: "pin-wrap",
                        iconSize: [27, 27], iconAnchor: [13, 13] }),
      title: treffer.display_name,
      alt: t("zoek.adresMarker", { adres: treffer.display_name }),
      zIndexOffset: 2000
    }).addTo(kaart);

    kaart.setView(punt, 14);
    // Naam kort houden: Nominatim geeft het volledige adres tot en met het land terug.
    const kort = String(treffer.display_name).split(",").slice(0, 2).join(",").trim();
    toonZoekmelding("");
    toonDichtbij(punt, kort);
  } catch (fout) {
    toonZoekmelding(t("zoek.mislukt", { fout: fout.message }));
    console.error(fout);
  } finally {
    zoekLoopt = false;
    $("zoekknop").removeAttribute("aria-busy");
  }
});

/* ==========================================================================
   de huidige locatie
   ==========================================================================
   "Wagens in mijn buurt" is dezelfde vraag als een adres intikken, met dit verschil dat
   de browser het punt aanlevert. De afhandeling loopt daarom door dezelfde weg als een
   adreszoekopdracht: hetzelfde merkteken op de kaart, dezelfde balk eronder, hetzelfde
   opruimen zodra je ergens anders gaat kijken.

   Twee dingen die anders zijn dan bij een adres, en die de kaart eerlijk benoemt:

   · Een locatie draagt een NAUWKEURIGHEID. Op een telefoon met gps is dat een meter of
     tien; op een computer zonder gps komt ze uit het netwerk en kan ze kilometers naast
     zitten. Dat mag niet stilzwijgend als een punt getoond worden, dus het zoomniveau
     volgt de nauwkeurigheid en boven LOCATIE_NAUWKEURIG staat het er met zoveel woorden
     bij.
   · De vloot staat in Vlaanderen. Wie van verder kijkt, krijgt een lijst met wagens op
     honderd kilometer — een eerlijk antwoord op een vraag die dan weinig zin heeft.
     Boven LOCATIE_VER zegt de kaart hoe ver de dichtstbijzijnde staat.

   Let op bij het inbedden: in een iframe van een ander domein geeft de browser de
   locatie alleen door als de iframe `allow="geolocation"` draagt. Zonder dat komt hier een
   weigering binnen die niet van de bezoeker komt — vandaar dat de melding allebei de
   mogelijkheden noemt. */
const LOCATIE_NAUWKEURIG = 500;     // m; daarboven heet het "bij benadering"
const LOCATIE_VER = 25000;          // m; daarboven melden we hoe ver de dichtste staat
let locatieLoopt = false;

function zetLocatieBezig(bezig) {
  locatieLoopt = bezig;
  const knop = $("knop-locatie");
  if (bezig) knop.setAttribute("aria-busy", "true");
  else knop.removeAttribute("aria-busy");
}

$("knop-locatie").addEventListener("click", () => {
  if (locatieLoopt) return;
  if (!navigator.geolocation) {
    toonZoekmelding(t("locatie.geenSteun"));
    return;
  }
  zetLocatieBezig(true);
  toonZoekmelding(t("locatie.bezig"));
  /* `maximumAge` mag ruim: wie twee keer klikt, staat zelden een minuut later ergens
     anders, en een bewaard antwoord scheelt de bezoeker een tweede vraag van de browser. */
  kaart.locate({ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
});

kaart.on("locationfound", (e) => {
  zetLocatieBezig(false);

  /* Het veld leegmaken: er zou anders een oude zoekterm blijven staan boven een lijst die
     over jouw locatie gaat. Programmatisch zetten stuurt geen `input`-gebeurtenis, dus
     wisZoekopdracht() gaat hier niet vanzelf af. */
  $("zoekveld").value = "";

  if (zoekMarker) kaart.removeLayer(zoekMarker);
  zoekMarker = L.marker(e.latlng, {
    icon: L.divIcon({ html: '<span class="hierpunt"></span>', className: "pin-wrap",
                      iconSize: [27, 27], iconAnchor: [13, 13] }),
    title: t("zoek.locatie"),
    alt: t("zoek.locatie"),
    zIndexOffset: 2000
  }).addTo(kaart);

  /* Het zoomniveau volgt de nauwkeurigheid: een positie die op drie kilometer klopt,
     hoort niet op straatniveau getoond te worden alsof ze de stoep aanwijst. De
     ondergrens van 100 m houdt een scherpe gps-positie uit een onbruikbare zoom. */
  const straal = Math.max(e.accuracy || 0, 100);
  const zoom = Math.min(16, kaart.getBoundsZoom(e.latlng.toBounds(straal * 4)));
  centreerVrij(e.latlng, zoom);

  dichtbijBron = "zoek";
  zoekAnker = e.latlng;
  dichtbijMeetpunt = e.latlng;
  const rijen = dichtstbijzijnde(e.latlng);
  toonLijst(rijen, () => t("dichtbij.bijJou"), () => t("dichtbij.leeg"));

  const noten = [];
  if (e.accuracy > LOCATIE_NAUWKEURIG) {
    noten.push(t("locatie.onnauwkeurig", { afstand: afstandInWoorden(e.accuracy) }));
  }
  if (rijen.length && rijen[0].meters > LOCATIE_VER) {
    noten.push(t("locatie.ver", { afstand: afstandInWoorden(rijen[0].meters) }));
  }
  toonZoekmelding(noten.join(" "));
});

/* Code 1 is een weigering — door de bezoeker zelf, of door de pagina waarin de kaart
   hangt. Die twee zijn hier niet uit elkaar te houden, dus de melding noemt ze allebei
   in plaats van er één te kiezen. */
kaart.on("locationerror", (e) => {
  zetLocatieBezig(false);
  toonZoekmelding(t(e.code === 1 ? "locatie.geweigerd" : "locatie.mislukt"));
  console.info("locatie niet gekregen:", e.code, e.message);
});

/* Wat je typt hoort bij wat er staat.
   ------------------------------------------------------------------------------------
   Een melding als "niets gevonden voor qqzzxx" gaat over de vórige zoekopdracht; zodra
   het veld verandert, klopt ze niet meer. Ze bleef staan tot de volgende verzending —
   ook na het kruisje in het veld, want daar luisterde niets naar.

   Helemaal leegmaken is bovendien "laat maar": dan gaat ook het rode zoekpunt van de
   kaart en mag de balk onderaan terug naar de automatische lijst. */
$("zoekveld").addEventListener("input", () => {
  toonZoekmelding("");
  /* Wie typt, krijgt de filters erbij — ook als het veld de aandacht al had en de filters
     intussen dichtgingen door in de kaart te scrollen. */
  zetFilters(true);
  if (!$("zoekveld").value.trim()) wisZoekopdracht();
});

/* Alles wat bij een zoekopdracht hoort weer weghalen: het veld, de melding, het rode
   punt op de kaart en de balk die erbij hoorde. Daarna mag de automatische lijst het
   overnemen — die volgt de muis weer. */
function wisZoekopdracht() {
  $("zoekveld").value = "";
  toonZoekmelding("");
  zoekAnker = null;
  dichtbijMeetpunt = null;
  if (zoekMarker) { kaart.removeLayer(zoekMarker); zoekMarker = null; }
  if (dichtbijBron !== "zoek") return;
  dichtbijBron = null;
  $("dichtbij").hidden = true;
  meetDichtbij();
  bijwerkenAutoDichtbij();
}

$("dichtbij-sluit").addEventListener("click", () => {
  $("dichtbij").hidden = true;
  meetDichtbij();
  dichtbijBron = null;
  dichtbijMeetpunt = null;
  if (zoekMarker) { kaart.removeLayer(zoekMarker); zoekMarker = null; }
});

/* ==========================================================================
   van taal wisselen
   ==========================================================================
   Alles wat er al staat opnieuw laten opschrijven. Niets wordt herladen: de vloot zit in
   het geheugen en de filters staan in `staat`, dus een taalwissel raakt alleen wat er
   in beeld staat — geen enkel verzoek naar buiten, en geen enkele keuze kwijt. */
function pasTaalToe(nieuw) {
  if (!TALEN.includes(nieuw) || nieuw === taal) return;
  taal = nieuw;
  bewaarTaal(nieuw);

  vertaalPagina();
  // De knoptitel hangt aan de stand van het paneel, niet alleen aan de taal.
  zetPaneel($("paneel").classList.contains("is-klein"));

  vertaalKaart();

  /* Een openstaande popup draagt afgewerkte tekst en zou in de oude taal blijven staan.
     Sluiten is eerlijker dan hem half vertaald laten staan; markerpopups bouwen zich bij
     de volgende klik vanzelf opnieuw op. */
  kaart.closePopup();

  /* Een zoekmelding gaat over een zoekopdracht van daarnet en zou nu half in twee talen
     staan; ze verdwijnt dus mee. Het zoekveld en de balk blijven wel staan. */
  toonZoekmelding("");

  if (staat.stations.length) {
    vulKeuzes();
    toonZitplaatsen();
    toonEuronorm();
    toonBouwjaar();
    toonBushalte();
    toonStation();
    toonDatum();
    teken();          // telling, markerbeschrijvingen en de automatische balk
  }

  /* Staat de balk nog open met een lijst uit een zoekopdracht, dan schrijft die zich
     hier opnieuw op. `dichtbijRijen` wordt eerst leeggemaakt om de snelle weg in
     toonLijst() — "zelfde volgorde, alleen de afstanden bijwerken" — te omzeilen. */
  if (!$("dichtbij").hidden && dichtbijRijen.length) {
    const rijen = dichtbijRijen;
    dichtbijRijen = [];
    toonLijst(rijen, dichtbijTitel, dichtbijLeeg);
  }
}

/* Wat Leaflet en OpenStreetMap zelf in beeld zetten.
   ------------------------------------------------------------------------------------
   Leaflet kent geen vertalingen: de titels van + en − ("Zoom in", "Zoom out") en de
   tekstballon bij "Leaflet" in de attributie zet het één keer in het Engels neer. De
   OSM-attributie zit als afgewerkte tekst in datzelfde hoekje. Alle drie gaan ze hier bij
   het opstarten en bij elke taalwissel opnieuw in; het kruisje van een popup volgt bij
   het openen (zie `popupopen`).

   De tegels wisselen hier ook mee: in het Frans die van OpenStreetMap France, met Franse
   plaatsnamen, anders de standaardtegels — zie TEGELS_PER_TAAL. De adressen uit
   Nominatim volgen de taal via `accept-language` in zoekAdres(). */
const LEAFLET_VOORVOEGSEL = kaart.attributionControl.options.prefix;

function vertaalKaart() {
  for (const [richting, sleutel] of [["in", "kaart.inzoomen"], ["out", "kaart.uitzoomen"]]) {
    const knop = kaart.getContainer().querySelector(".leaflet-control-zoom-" + richting);
    if (!knop) continue;
    knop.title = t(sleutel);
    knop.setAttribute("aria-label", t(sleutel));
  }
  // Alleen de tekstballon vertaalt; de naam, de link en het vlaggetje blijven staan.
  if (typeof LEAFLET_VOORVOEGSEL === "string") {
    kaart.attributionControl.setPrefix(LEAFLET_VOORVOEGSEL.replace(
      /title="[^"]*"/, 'title="' + ontsnap(t("kaart.leaflet")) + '"'));
  }
  // setUrl() tekent alleen opnieuw als de url echt verandert.
  tegels.setUrl(tegelsVoorTaal().url);
  kaart.attributionControl.removeAttribution(tegels.options.attribution);
  tegels.options.attribution = osmAttributie();
  kaart.attributionControl.addAttribution(tegels.options.attribution);
}

/* De keuzelijst vullen met wat er geladen is. Elke taal staat er onder haar eigen naam
   — "Français", niet "Frans": wie de kaart in het Nederlands krijgt maar Frans zoekt,
   herkent het woord in zijn eigen taal en niet in de onze. */
function vulTaalkeuze() {
  const lijst = $("taalkeuze");
  lijst.innerHTML = "";
  for (const code of TALEN) {
    const optie = document.createElement("option");
    optie.value = code;
    optie.textContent = (taalblok(code) || {}).naam || code;
    lijst.appendChild(optie);
  }
  lijst.value = taal;
  // Eén taal is geen keuze; dan is een keuzelijst alleen maar ruis in het menu.
  lijst.closest(".schakel").hidden = TALEN.length < 2;
}

vulTaalkeuze();
$("taalkeuze").addEventListener("change", (e) => pasTaalToe(e.target.value));

/* Geen enkel taalbestand geladen — dan is `taal/` niet meegepubliceerd. De kaart blijft
   werken (de opmaak draagt de Nederlandse tekst al), maar alles wat uit JavaScript komt
   zou de sleutelnaam tonen. Dat hoort niemand stil te ontdekken, dus het staat in beeld
   én in de console. Niet vertaald: er is op dat moment niets om mee te vertalen. */
if (TAALBESTANDEN_ONTBREKEN) {
  const melding = $("melding");
  melding.hidden = false;
  melding.innerHTML =
    "<h2>Taalbestanden ontbreken</h2>" +
    "<p>De map <code>map/taal/</code> is niet mee gepubliceerd. De kaart werkt, maar " +
    "teksten uit het script blijven onvertaald.</p>";
  console.error("DEGAGE_TALEN is leeg: laadt map/taal/*.js wel?");
}

/* De eerste keer: de opmaak staat nog in het Nederlands zoals ze in het bestand staat,
   en de kaartknoppen zijn hierboven net gemaakt. Eén keer alles langslopen zet meteen de
   juiste taal neer — ook als dat gewoon Nederlands is, want dan verandert er niets. */
vertaalPagina();
vertaalKaart();

/* De filters beginnen dicht. Het paneel toont dan alleen de zoekbalk, de teller en de
   legende — genoeg om te weten waar je naar kijkt, en de kaart blijft vrij. Eén klik in
   het zoekveld haalt de rest tevoorschijn. */

laden().catch((fout) => {
  const melding = $("melding");
  melding.hidden = false;
  melding.innerHTML =
    "<h2>" + ontsnap(t("fout.titel")) + "</h2>" +
    "<p>" + ontsnap(fout.message) + "</p>" +
    "<p>" + t("fout.uitleg", { map: ontsnap(GBFS_BASIS) }) + "</p>";
  $("telling").setAttribute("data-i18n", "telling.nietGeladen");
  $("telling").textContent = t("telling.nietGeladen");
  console.error(fout);
});
