/* Nederlands — de brontaal van deze kaart.

   Staat een sleutel hier niet, dan staat hij nergens: de andere talen vallen op dit
   bestand terug. Wie hier iets toevoegt, hoort het dus ook in fr.js en en.js te zetten.
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
(window.DEGAGE_TALEN = window.DEGAGE_TALEN || {}).nl = {
  naam: "Nederlands",
  /* Voor getallen en datums. België voor nl en fr, want dat is het publiek; en-GB omdat
     en-US er "9/3/2025" en "1,234" van maakt op een kaart die verder metrisch is. */
  locale: "nl-BE",

  teksten: {
    "app.titel": "Auto's van Dégage",
    "app.kaartLabel": "Kaart met de auto's van Dégage",

    "legende": "<strong>Dit is géén live beschikbaarheid.</strong> De kaart toont enkel " +
               "de locatie van de auto's, niet welke er op dit moment vrij zijn.",

    "legende.verbergen": "Melding verbergen",
    "legende.vraag": "Deze melding verbergen? Je kunt ze altijd terugzetten in de instellingen.",
    "legende.ja": "Verbergen",
    "legende.nee": "Laten staan",

    "zoek.plaatshouder": "Autonaam, adres of gemeente…",
    "zoek.aria": "Zoek een autonaam, adres of gemeente; klikken toont ook de filters",
    "zoek.knop": "Zoeken",
    "zoek.locatie": "Auto's in mijn buurt",
    "zoek.bezig": "Bezig met zoeken…",
    "zoek.gevonden": "Gevonden: <b>{naam}</b>",
    "zoek.meerdere": "<b>{n} auto's</b> met “{vraag}” in de naam",
    "zoek.eerste": " — eerste {n}",
    "zoek.geenAdres": "Geen adres gevonden — wel auto's met “{vraag}” in de naam.",
    "zoek.niets": "Niets gevonden voor “{vraag}” — geen autonaam en geen adres. " +
                  "Probeer een gemeente, of straat + gemeente.",
    "zoek.mislukt": "Zoeken lukte niet: {fout}",
    "zoek.dienstStatus": "de adressendienst gaf status {status}",
    "zoek.adresMarker": "Gezocht adres: {adres}",

    "locatie.bezig": "Je locatie opzoeken…",
    "locatie.geweigerd": "Geen toestemming voor je locatie. Zet die aan in je browser; " +
                         "staat de kaart in een andere pagina, dan moet die het ook toelaten.",
    "locatie.mislukt": "Je locatie kon niet bepaald worden. Zoek anders op gemeente of adres.",
    "locatie.geenSteun": "Deze browser geeft geen locatie door. Zoek op gemeente of adres.",
    "locatie.onnauwkeurig": "Je locatie is bij benadering: ongeveer {afstand} nauwkeurig.",
    "locatie.ver": "De dichtstbijzijnde auto staat op {afstand}.",

    "paneel.minimaliseren": "Paneel minimaliseren",
    "paneel.tonen": "Paneel tonen",

    "telling.laden": "bezig met laden…",
    "telling.bijgewerkt": "bijgewerkt {datum}",
    "telling.wagen": "auto",
    "telling.wagens": "auto's",
    "telling.van": "{n} van {totaal}",
    "telling.geen": "Geen enkele auto voldoet aan deze filters.",
    "telling.nietGeladen": "niet geladen",

    "filters.wissen": "Filters wissen",
    "kop.soort": "Soort auto",
    "kop.zitplaatsen": "Zitplaatsen",
    "kop.brandstof": "Brandstof",
    "kop.bak": "Versnellingsbak",
    "kop.toebehoren": "Toebehoren",
    "kop.afspraken": "Afspraken",
    "kop.euronorm": "Euronorm",
    "kop.bouwjaar": "Bouwjaar",
    "kop.mobiscore": "Mobiscore",
    "mobiscore.uitleg": "Hoe goed de standplaats ligt tegenover winkels, scholen, zorg, vrije " +
                        "tijd en openbaar vervoer, volgens de Vlaamse overheid. Elke stand " +
                        "toont die score en alles daarboven.",
    "mobi.alle": "alle standplaatsen",
    "mobi.vanaf": "vanaf {n} op 10",
    "mobi.aria": "Minimale Mobiscore",
    "jaar.alle": "alle bouwjaren",
    "jaar.vanaf": "vanaf {jaar}",
    "jaar.enkel": "enkel {jaar}",
    "jaar.aria": "Minimaal bouwjaar",

    "zit.alle": "alle auto's",
    "zit.enkel": "enkel {n} plaatsen",
    "zit.vanaf": "vanaf {n} plaatsen",
    "zit.aria": "Minimum aantal zitplaatsen",

    "euronorm.uitleg": "Elke stand toont die norm én alles daarboven. Elektrische en " +
                       "hybride auto's staan bovenaan op de schaal; zij dragen zelf " +
                       "geen euronorm.",
    "norm.alle": "alle auto's",
    "norm.enkel": "enkel {norm}",
    "norm.hoger": "{norm} en hoger",
    "norm.aria": "Minimale euronorm",
    "norm.elektrisch": "elektrisch en hybride",

    "dichtbij.titel": "Dichtstbijzijnde auto's",
    "dichtbij.bij": "Dichtst bij <b>{plek}</b>",
    "dichtbij.bijJou": "Dichtst bij <b>jouw locatie</b>",
    "dichtbij.leeg": "Geen enkele auto voldoet aan de filters — niets om te tonen.",
    "dichtbij.sluiten": "Sluiten",
    "dichtbij.sluitenLang": "Lijst sluiten",

    "melding.geduld": "Even geduld",
    "melding.laden": "De standplaatsen worden geladen.",

    "instellingen.grijs": "Gefilterde auto's grijs tonen",
    "instellingen.volgmuis": "Lijst dichtstbijzijnde auto's volgt muis",
    "instellingen.dichtbij": "Lijst dichtstbijzijnde auto's tonen",
    "instellingen.scrollSluit": "Filters sluiten bij scrollen in de kaart",
    "instellingen.legende": "Melding over beschikbaarheid tonen",
    "instellingen.taal": "Taal",

    "knop.alles": "Alles in beeld — uitzoomen tot de volledige kaart",
    "knop.allesKort": "Alles in beeld",
    "knop.instellingen": "Instellingen",
    "kaart.attributie": "Kaartgegevens &copy; {link}-bijdragers",
    "kaart.tegelbron": "kaartstijl {link}",
    "kaart.inzoomen": "Inzoomen",
    "kaart.uitzoomen": "Uitzoomen",
    "kaart.leaflet": "Een JavaScript-bibliotheek voor interactieve kaarten",
    "kaart.popupSluiten": "Venster sluiten",

    "popup.plaatsen": "{n} plaatsen",
    "popup.geenFoto": "Geen voorbeeldfoto van dit model beschikbaar",
    "popup.fotoAlt": "Voorbeeldfoto van een {model}",
    "popup.fotoBron": "Voorbeeldfoto van dit model, niet van deze auto.",
    "popup.locatieVaag": "Locatie bij benadering vanwege privacy.",
    "popup.uitleg": "Uitleg",
    "popup.bereikEen": "± {km} km bereik",
    "popup.bereikMarge": "{van}–{tot} km bereik",
    "popup.bereikUitleg": "Bereik: schatting bij gemengd gebruik, geen WLTP. Een marge " +
                          "betekent dat het van de batterij afhangt. Bron:",
    "ov.titel": "Mobiscore",
    "ov.geenScore": "niet beschikbaar",
    "ov.bushalte": "bushalte op {afstand} ({freq})",
    "ov.tramhalte": "tramhalte op {afstand} ({freq})",
    "ov.geenHalte": "geen bus- of tramhalte binnen {straal}",
    "ov.station": "station {station} op {afstand} ({freq})",
    "ov.stationKlinker": "station {station} op {afstand} ({freq})",
    "ov.perUur": "{n}/u",
    "ov.minderDanEen": "<1/u",
    "ov.meter": "{n} meter",
    "ov.kilometer": "{n} kilometer",
    "ov.kilometerEen": "1 kilometer",
    "ov.bron": "Tussen haakjes: vertrekken per uur, per richting. " +
              "Mobiscore: Departement Omgeving, Vlaamse overheid — winkels, scholen, zorg, " +
              "vrije tijd en openbaar vervoer op wandel- en fietsafstand. Bussen en trams: De " +
              "Lijn, per richting, aan de drukste kant van de halte. Treinen: NMBS, alle treinen " +
              "van het station gedeeld door twee richtingen. Een gewone weekdag van 7 tot 19 u, " +
              "in vogelvlucht; flexvervoer telt niet mee.",

    "marker.standplaats": "Standplaats {naam}",
    "marker.elektrisch": "Standplaats met elektrische auto {naam}",
    "marker.uitgefilterd": "Uitgefilterde standplaats {naam}",
    "reden.buiten": "Valt buiten de filters — {redenen}",
    "reden.paar": "{kop}: {waarde}",
    "reden.onbekend": "onbekend",
    "reden.nietVermeld": "{vlag} niet vermeld",

    "fout.titel": "De standplaatsen konden niet geladen worden",
    "fout.uitleg": "Deze pagina leest de bestanden uit <code>{map}</code>. Open ze via " +
                   "een webserver, niet als <code>file://</code>: een browser blokkeert " +
                   "dan het inlezen van de gegevens.",
    "fout.status": "{naam}.json gaf status {status}",

    "maanden": ["januari", "februari", "maart", "april", "mei", "juni", "juli",
                "augustus", "september", "oktober", "november", "december"]
  },

  waarden: {
    /* Nederlands is de taal van de brondata: niets te vertalen. */
  },

  vlaggen: {
    "aanhanger": "aanhangwagen", "bed": "bed", "fietsdrager": "fietsdrager",
    "gps": "gps", "kinderzitje": "kinderzitje", "trekhaak": "trekhaak",
    "huisdieren": "huisdieren toegelaten", "leren_autorijden": "leren autorijden"
  }
};
