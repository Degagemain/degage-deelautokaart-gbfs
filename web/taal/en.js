/* Engels.

   Ontbreekt hier een sleutel, dan toont de kaart de Nederlandse zin uit nl.js. Dat is
   met opzet: een half vertaald bestand levert een leesbare kaart op en geen gaten.
   --------------------------------------------------------------------------------------

   Dit bestand wordt door `kaart.html` ingeladen met een gewone <script>-tag, vóór de
   kaartcode zelf. Geen bouwstap, geen module: het hangt zichzelf in `window.DEGAGE_TALEN`
   en de kaart leest het daar op. De volgorde van de scripttags in `kaart.html` is meteen
   de volgorde van de keuzelijst in de instellingen.

   Drie tabellen, elk met een eigen taak:

   · `teksten`  alles wat vast in de kaart staat, per sleutel. {haakjes} worden door de
                kaart ingevuld — laat ze staan en vertaal er alleen omheen.
   · `waarden`  de gesloten lijstjes uit de brondata (brandstof, carrosserie, bak). De
                sleutel is de waarde zoals ze ín de feed staat, in het Nederlands; wat
                hier niet staat, toont de kaart onvertaald in plaats van te raden.
   · `vlaggen`  de toebehoren en afspraken. De sleutel komt uit de feed (FEEDSPEC.md).

   Een nieuwe taal toevoegen: kopieer `nl.js`, vertaal, en zet één scriptregel bij in
   `kaart.html`. Verder is er niets aan te passen — de keuzelijst en de taaldetectie
   volgen vanzelf.
*/
(window.DEGAGE_TALEN = window.DEGAGE_TALEN || {}).en = {
  naam: "English",
  /* Voor getallen en datums. België voor nl en fr, want dat is het publiek; en-GB omdat
     en-US er "9/3/2025" en "1,234" van maakt op een kaart die verder metrisch is. */
  locale: "en-GB",

  teksten: {
    "app.titel": "Dégage vehicles",
    "app.kaartLabel": "Map of Dégage vehicles",

    "legende": "<strong>This is not live availability.</strong> The map only shows where " +
               "the cars are parked, not which ones are free right now.",

    "legende.verbergen": "Hide notice",
    "legende.vraag": "Hide this notice? You can always turn it back on in the settings.",
    "legende.ja": "Hide",
    "legende.nee": "Keep",

    "zoek.plaatshouder": "Car name, address or town…",
    "zoek.aria": "Search for a car name, address or town; clicking also shows the filters",
    "zoek.knop": "Search",
    "zoek.locatie": "Cars near me",
    "zoek.bezig": "Searching…",
    "zoek.gevonden": "Found: <b>{naam}</b>",
    "zoek.meerdere": "<b>{n} cars</b> with “{vraag}” in the name",
    "zoek.eerste": " — first {n}",
    "zoek.geenAdres": "No address found — but there are cars with “{vraag}” in the name.",
    "zoek.niets": "Nothing found for “{vraag}” — no car name and no address. " +
                  "Try a town, or street + town.",
    "zoek.mislukt": "Search failed: {fout}",
    "zoek.dienstStatus": "the address service returned status {status}",
    "zoek.adresMarker": "Searched address: {adres}",

    "locatie.bezig": "Finding your location…",
    "locatie.geweigerd": "No permission for your location. Allow it in your browser; if " +
                         "the map is embedded in another page, that page has to allow it too.",
    "locatie.mislukt": "Your location could not be determined. Try a town or address instead.",
    "locatie.geenSteun": "This browser does not provide a location. Search for a town or address.",
    "locatie.onnauwkeurig": "Your location is approximate: accurate to about {afstand}.",
    "locatie.ver": "The nearest car is {afstand} away.",

    "paneel.minimaliseren": "Minimise panel",
    "paneel.tonen": "Show panel",

    "telling.laden": "loading…",
    "telling.bijgewerkt": "updated {datum}",
    "telling.wagen": "car",
    "telling.wagens": "cars",
    "telling.van": "{n} of {totaal}",
    "telling.geen": "No car matches these filters.",
    "telling.nietGeladen": "not loaded",

    "filters.wissen": "Clear filters",
    "kop.soort": "Vehicle type",
    "kop.zitplaatsen": "Seats",
    "kop.brandstof": "Fuel",
    "kop.bak": "Transmission",
    "kop.toebehoren": "Equipment",
    "kop.afspraken": "Arrangements",
    "kop.euronorm": "Euro standard",
    "kop.bouwjaar": "Year built",
    "kop.bushalte": "Distance to a bus stop",
    "kop.station": "Distance to a train station",
    "bushalte.uitleg": "The straight-line distance from the parking spot to the nearest bus or " +
                       "tram stop served by scheduled lines. Each step shows that distance and " +
                       "everything below it. On foot the walk is always a bit longer.",
    "station.uitleg": "The straight-line distance from the parking spot to the nearest railway " +
                      "station. Each step shows that distance and everything below it. People " +
                      "cycle or drive to a station, which is why this scale reaches further " +
                      "than the one for a stop.",
    "afstand.alle": "all parking spots",
    "afstand.hoogstens": "{afstand} or less",
    "bus.aria": "Maximum distance to a bus or tram stop",
    "trein.aria": "Maximum distance to a railway station",
    "jaar.alle": "all years",
    "jaar.vanaf": "{jaar} or newer",
    "jaar.enkel": "only {jaar}",
    "jaar.aria": "Minimum year built",

    "zit.alle": "all cars",
    "zit.enkel": "only {n} seats",
    "zit.vanaf": "{n} seats or more",
    "zit.aria": "Minimum number of seats",

    "euronorm.uitleg": "Each step shows that standard and everything above it. Electric " +
                       "and hybrid cars sit at the top of the scale; they carry no Euro " +
                       "standard of their own.",
    "norm.alle": "all cars",
    "norm.enkel": "only {norm}",
    "norm.hoger": "{norm} and higher",
    "norm.aria": "Minimum Euro standard",
    "norm.elektrisch": "electric and hybrid",

    "dichtbij.titel": "Nearest cars",
    "dichtbij.bij": "Closest to <b>{plek}</b>",
    "dichtbij.bijJou": "Closest to <b>your location</b>",
    "dichtbij.leeg": "No car matches the filters — nothing to show.",
    "dichtbij.sluiten": "Close",
    "dichtbij.sluitenLang": "Close list",

    "melding.geduld": "One moment",
    "melding.laden": "Loading the parking spots.",

    "instellingen.grijs": "Show filtered-out cars in grey",
    "instellingen.volgmuis": "Nearest-cars list follows the mouse",
    "instellingen.dichtbij": "Show the nearest-cars list",
    "instellingen.scrollSluit": "Close filters when scrolling the map",
    "instellingen.legende": "Show the availability notice",
    "instellingen.taal": "Language",
    "melden.knop": "Report a problem",
    "melden.titel": "Report a problem or give feedback — opens github.com in a new tab",

    "knop.alles": "Show everything — zoom out to the whole map",
    "knop.allesKort": "Show everything",
    "knop.instellingen": "Settings",
    "kaart.attributie": "Map data &copy; {link} contributors",
    "kaart.tegelbron": "map style {link}",
    "kaart.inzoomen": "Zoom in",
    "kaart.uitzoomen": "Zoom out",
    "kaart.leaflet": "A JavaScript library for interactive maps",
    "kaart.popupSluiten": "Close popup",

    "popup.plaatsen": "{n} seats",
    "popup.geenFoto": "No example photo available for this model",
    "popup.fotoAlt": "Example photo of a {model}",
    "popup.fotoBron": "Example photo of this model, not of this car.",
    "popup.locatieVaag": "Approximate location for privacy reasons.",
    "popup.uitleg": "Explanation",
    "popup.bereikEen": "± {km} km range",
    "popup.bereikMarge": "{van}–{tot} km range",
    "popup.bereikUitleg": "Range: estimate for mixed use, not WLTP. A spread means it " +
                          "depends on the battery. Source:",
    "ov.titel": "Mobiscore",
    "ov.geenScore": "not available",
    "ov.bushalte": "bus stop at {afstand} ({freq})",
    "ov.tramhalte": "tram stop at {afstand} ({freq})",
    "ov.geenHalte": "no bus or tram stop within {straal}",
    "ov.station": "{station} station at {afstand} ({freq})",
    "ov.stationKlinker": "{station} station at {afstand} ({freq})",
    "ov.perUur": "{n}/h",
    "ov.minderDanEen": "<1/h",
    "ov.meter": "{n} metres",
    "ov.kilometer": "{n} kilometres",
    "ov.kilometerEen": "1 kilometre",
    "ov.bron": "In brackets: departures per hour, per direction. " +
              "Mobiscore: Flemish government (Departement Omgeving) — shops, schools, care, " +
              "leisure and public transport within walking and cycling distance. Buses and " +
              "trams: De Lijn, per direction, on the busier side of the stop. Trains: NMBS, all " +
              "trains at the station divided by two directions. An ordinary weekday, 7am to " +
              "7pm, as the crow flies; on-demand transport not included.",

    "marker.standplaats": "Parking spot {naam}",
    "marker.elektrisch": "Parking spot with electric car {naam}",
    "marker.uitgefilterd": "Filtered-out parking spot {naam}",
    "reden.buiten": "Outside the filters — {redenen}",
    "reden.paar": "{kop}: {waarde}",
    "reden.onbekend": "unknown",
    "reden.nietVermeld": "{vlag} not listed",

    "fout.titel": "The parking spots could not be loaded",
    "fout.uitleg": "This page reads its files from <code>{map}</code>. Open it through a " +
                   "web server, not as <code>file://</code>: a browser blocks reading " +
                   "the data that way.",
    "fout.status": "{naam}.json returned status {status}",

    "maanden": ["January", "February", "March", "April", "May", "June", "July",
                "August", "September", "October", "November", "December"]
  },

  waarden: {
    "benzine": "petrol",
    "diesel": "diesel",
    "elektrisch": "electric",
    "hybride": "hybrid",
    "plug-in hybride": "plug-in hybrid",
    "Personenwagen": "Car",
    "Bestelwagen": "Van",
    "manueel": "manual",
    "automatisch": "automatic"
  },

  vlaggen: {
    "aanhanger": "trailer", "bed": "bed", "fietsdrager": "bike rack",
    "gps": "GPS", "kinderzitje": "child seat", "trekhaak": "tow bar",
    "huisdieren": "pets allowed", "leren_autorijden": "learner drivers"
  }
};
