/* Engels.

   Ontbreekt hier een sleutel, dan toont de kaart de Nederlandse zin uit nl.js. Dat is
   met opzet: een half vertaald bestand levert een leesbare kaart op en geen gaten.
   --------------------------------------------------------------------------------------

   Dit bestand wordt door `index.html` ingeladen met een gewone <script>-tag, vóór de
   kaartcode zelf. Geen bouwstap, geen module: het hangt zichzelf in `window.DEGAGE_TALEN`
   en de kaart leest het daar op. De volgorde van de scripttags in `index.html` is meteen
   de volgorde van de keuzelijst in de instellingen.

   Drie tabellen, elk met een eigen taak:

   · `teksten`  alles wat vast in de kaart staat, per sleutel. {haakjes} worden door de
                kaart ingevuld — laat ze staan en vertaal er alleen omheen.
   · `waarden`  de gesloten lijstjes uit de brondata (brandstof, carrosserie, bak). De
                sleutel is de waarde zoals ze ín de feed staat, in het Nederlands; wat
                hier niet staat, toont de kaart onvertaald in plaats van te raden.
   · `vlaggen`  de toebehoren en afspraken. De sleutel komt uit de feed (FEEDSPEC.md).

   Een nieuwe taal toevoegen: kopieer `nl.js`, vertaal, en zet één scriptregel bij in
   `index.html`. Verder is er niets aan te passen — de keuzelijst en de taaldetectie
   volgen vanzelf.
*/
(window.DEGAGE_TALEN = window.DEGAGE_TALEN || {}).en = {
  naam: "English",
  /* Voor getallen en datums. België voor nl en fr, want dat is het publiek; en-GB omdat
     en-US er "9/3/2025" en "1,234" van maakt op een kaart die verder metrisch is. */
  locale: "en-GB",

  teksten: {
    "app.titel": "Dégage car-sharing map",
    "app.kaartLabel": "Map of Dégage vehicles",

    "voorbehoud.titel": "Good to know",
    "voorbehoud.sluiten": "Close",
    "voorbehoud.live": "<strong>This is not live availability.</strong> The map only shows " +
                       "where the cars are parked, not which ones are free right now.",
    "voorbehoud.aanbod": "<strong>Our offer may change</strong> after you have taken out your " +
                         "membership. We cannot guarantee that the offer and the options that " +
                         "come with it will stay the same during your membership.",
    "voorbehoud.fotos": "<strong>The photos are example photos</strong> of the model, " +
                        "not of the car itself.",
    "voorbehoud.locatie": "<strong>Locations are approximate</strong> for privacy reasons.",

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
    "filters.grijs": "Show filtered-out cars in grey",
    "filters.scrollSluit": "Close filters when scrolling the map",
    "filters.sluiten": "Close filters",
    "kop.soort": "Vehicle type",
    "kop.klasse": "Price class",
    "filter.klasse": "Class {klasse}",
    "filter.klasseOnbekend": "Class unknown",
    "klasse.uitleg": "Each car is charged at the per-kilometre rate of its price " +
                     "class. Price class B costs more per kilometre than price class A.",
    "kop.zitplaatsen": "Seats",
    "kop.brandstof": "Fuel",
    "kop.bak": "Transmission",
    "kop.toebehoren": "Equipment",
    "kop.afspraken": "Arrangements",
    "kop.euronorm": "Euro standard",
    "kop.bouwjaar": "Year built",
    "kop.ov": "Public transport",
    "filter.ovBus": "Bus",
    "filter.ovTram": "Tram",
    "filter.ovTrein": "Train",
    "filter.ovBeide": "Must meet all set modes",
    "ov.filterUitleg": "Set a distance or frequency for bus, tram or train; a slider on \"any\" does not " +
                       "filter. The distance is a straight line from the parking spot to the nearest stop " +
                       "or station; on foot the walk is a bit longer. The frequency is the number of " +
                       "departures per hour, per direction, on an ordinary weekday. If you set more than " +
                       "one, any one of them will do, unless \"Must meet all set modes\" is switched on.",
    "ov.elkeAfstand": "any distance",
    "ov.elkeFrequentie": "any frequency",
    "ov.minstensFreq": "at least {n}× per hour",
    "afstand.hoogstens": "{afstand} or less",
    "bus.aria": "Maximum distance to a bus stop",
    "tram.aria": "Maximum distance to a tram stop",
    "trein.aria": "Maximum distance to a railway station",
    "busfreq.aria": "Minimum frequency at the bus stop, per direction",
    "tramfreq.aria": "Minimum frequency at the tram stop, per direction",
    "treinfreq.aria": "Minimum frequency at the railway station, per direction",
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
    "melding.laden": "Loading the shared-car map.",
    "taalvraag.titel": "Which language would you like the map in?",
    "tandwielhint": "You can always change the language here, in the settings.",

    "instellingen.volgmuis": "Nearest-cars list follows the mouse",
    "instellingen.dichtbij": "Show the nearest-cars list",
    "instellingen.samen": "Show cars at the same spot together",
    "instellingen.taal": "Language",
    "instellingen.taalOnthouden": "Language remembered in this browser.",
    "instellingen.taalVergeten": "Forget",
    "instellingen.bronLive": "The cars and their locations are up to date. Make, model and equipment were last updated on {datum}.",
    "instellingen.bronDump": "Data as of {datum}.",
    "instellingen.pictogram": "Tab icon:",
    "melden.knop": "Problem or feedback",
    "melden.titel": "Report a problem or give feedback — opens github.com in a new tab; your feedback will be public",
    "melden.titelFormulier": "Report a problem or give feedback — your report will be public",
    /* Het issueformulier op GitHub in deze taal; zie .github/ISSUE_TEMPLATE/. */
    "melden.sjabloon": "feedback-en.yml",
    "meldformulier.titel": "Problem or feedback",
    "meldformulier.publiek": "<strong>Your report is public.</strong> What you write in the " +
                             "description is posted as a public issue on GitHub, visible to everyone. " +
                             "So leave out any personal details, such as your name, address, phone " +
                             "number, email address, membership number or a number plate. Do you need " +
                             "to report something that cannot be public? Then email " +
                             "<a href=\"mailto:info@degage.be\">info@degage.be</a>.",
    "meldformulier.soort": "What is it about?",
    "meldformulier.soortKaart": "Something on the map is wrong",
    "meldformulier.soortWerking": "The map doesn't work properly",
    "meldformulier.soortIdee": "Idea or suggestion",
    "meldformulier.soortAnders": "Something else",
    "meldformulier.beschrijving": "Description",
    "meldformulier.beschrijvingPlh": "What did you see, and what did you expect? Which car or place is it about?",
    "meldformulier.mail": "Email address (optional)",
    "meldformulier.mailUitleg": "Only if you'd like a reply. It stays private and is deleted 30 days after your report is dealt with.",
    "meldformulier.veldMail": "This doesn't look like an email address. Please check it, or leave the field empty.",
    "meldformulier.bedanktMail": "Your email address is not in the report on GitHub. We only " +
                                 "use it to reply to you.",
    "meldformulier.mailMislukt": "Your report is on GitHub, but your email address could not " +
                                 "be saved. Would you like a reply? Then email " +
                                 "<a href=\"mailto:info@degage.be\">info@degage.be</a>.",
    "meldformulier.akkoord":"I understand that my description will be public, and it contains no personal details.",
    "meldformulier.annuleren": "Cancel",
    "meldformulier.versturen": "Send",
    "meldformulier.bezig": "Sending…",
    "meldformulier.bedankt": "Thank you! Your report is now on GitHub.",
    "meldformulier.bekijk": "View your report",
    "meldformulier.veldSoort": "Choose what your report is about.",
    "meldformulier.veldBeschrijving": "Please enter a description.",
    "meldformulier.veldTeKort": "Write a little more: at least {min} characters.",
    "meldformulier.veldAkkoord": "Tick the box to confirm you understand your report is public.",
    "meldformulier.foutControle": "The spam check isn't ready yet. Wait until the box shows a tick, then try again.",
    "meldformulier.fout": "Your report could not be sent. Please try again later, or report it " +
                          "directly on {link} (you will need an account there).",

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
    "popup.nieuw": "New car",
    "popup.nieuwUitleg": "Make, model and other details will follow with the next map update.",
    "popup.ookHier": "Also at this spot:",
    "popup.lidVraag": "Feel like sharing too?",
    "popup.lidOproep": "Join Dégage! 🚗",
    "popup.tarieven": "Our rates",
    "popup.faq": "FAQ",
    "popup.uitleg": "Explanation",
    "popup.bereikEen": "± {km} km",
    "popup.bereikMarge": "{van}–{tot} km",
    "popup.bereikUitleg": "Range: estimate for mixed use, not WLTP. A spread means it " +
                          "depends on the battery. Source:",
    "popup.bereikUitlegHandmatig": "Range: estimate for mixed use, not WLTP. Supplied by " +
                          "Dégage itself, based on the battery fitted to these cars.",
    "ov.titel": "Mobiscore",
    "ov.geenScore": "not available",
    "ov.bushalte": "Bus stop",
    "ov.tramhalte": "Tram stop",
    "ov.geenHalte": "No bus or tram stop within {straal}",
    "ov.geenBushalte": "No bus stop within {straal}",
    "ov.geenTramhalte": "No tram stop within {straal}",
    "ov.station": "Train station",
    "ov.meter": "{n} metres",
    "ov.kilometer": "{n} kilometres",
    "ov.kilometerEen": "1 kilometre",
    "ov.kmKort": "{n} km",
    "ov.keer": "{n}×",
    "ov.minderDanEenKeer": "<1×",
    "ov.perUurLabel": "per hour",
    "ov.bron": "Next to the icon: departures per hour, per direction. The name of " +
              "the stop is on the icon. " +
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
