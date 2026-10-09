/* Nederlands — de brontaal van deze kaart.

   Staat een sleutel hier niet, dan staat hij nergens: de andere talen vallen op dit
   bestand terug. Wie hier iets toevoegt, hoort het dus ook in fr.js en en.js te zetten.
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
(window.DEGAGE_TALEN = window.DEGAGE_TALEN || {}).nl = {
  naam: "Nederlands",
  /* Voor getallen en datums. België voor nl en fr, want dat is het publiek; en-GB omdat
     en-US er "9/3/2025" en "1,234" van maakt op een kaart die verder metrisch is. */
  locale: "nl-BE",

  teksten: {
    "app.titel": "Deelautokaart Dégage",
    "app.kaartLabel": "Kaart met de auto's van Dégage",

    "voorbehoud.titel": "Goed om te weten",
    "voorbehoud.sluiten": "Sluiten",
    "voorbehoud.live": "<strong>Geen live beschikbaarheid:</strong> je ziet waar de " +
                       "auto's staan, niet of ze vrij zijn.",
    "voorbehoud.aanbod": "<strong>Het aanbod kan wijzigen,</strong> ook tijdens je lidmaatschap.",
    "voorbehoud.fotos": "<strong>Voorbeeldfoto's</strong> van het model, niet van de auto zelf.",
    "voorbehoud.locatie": "<strong>Locaties bij benadering,</strong> vanwege privacy.",

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
    "filters.grijs": "Gefilterde auto's grijs tonen",
    "filters.scrollSluit": "Filters sluiten bij scrollen in de kaart",
    "filters.sluiten": "Filters sluiten",
    "filters.meer": "Meer filters",
    "kop.soort": "Soort auto",
    "kop.klasse": "Prijsklasse",
    "filter.klasse": "Klasse {klasse}",
    "filter.klasseOnbekend": "Klasse onbekend",
    "klasse.uitleg": "Elke auto rijdt aan de kilometerprijs van zijn prijsklasse. " +
                     "Prijsklasse B kost meer per kilometer dan prijsklasse A.",
    "kop.zitplaatsen": "Zitplaatsen",
    "kop.brandstof": "Brandstof",
    "kop.bak": "Versnellingsbak",
    "kop.toebehoren": "Toebehoren",
    "kop.afspraken": "Afspraken",
    "kop.euronorm": "Euronorm",
    "kop.bouwjaar": "Bouwjaar",
    "kop.ov": "Openbaar vervoer",
    "filter.ovBus": "Bus",
    "filter.ovTram": "Tram",
    "filter.ovTrein": "Trein",
    "filter.ovBeide": "Aan alle ingestelde voldoen",
    "ov.filterUitleg": "Stel een afstand of frequentie in voor bus, tram of trein; staat een schuif op " +
                       "\"elke\", dan filtert hij niet. De afstand is hemelsbreed, van de standplaats tot de " +
                       "dichtstbijzijnde halte of het dichtstbijzijnde station; te voet is de weg wat " +
                       "langer. De frequentie is het aantal vertrekken per uur, per richting, op een gewone " +
                       "weekdag. Stel je er meer in, dan volstaat er één, tenzij \"Aan alle ingestelde " +
                       "voldoen\" aanstaat.",
    "ov.elkeAfstand": "elke afstand",
    "ov.elkeFrequentie": "elke frequentie",
    "ov.minstensFreq": "minstens {n}× per uur",
    "afstand.hoogstens": "hoogstens {afstand}",
    "bus.aria": "Maximale afstand tot een bushalte",
    "tram.aria": "Maximale afstand tot een tramhalte",
    "trein.aria": "Maximale afstand tot een treinstation",
    "busfreq.aria": "Minimale frequentie aan de bushalte, per richting",
    "tramfreq.aria": "Minimale frequentie aan de tramhalte, per richting",
    "treinfreq.aria": "Minimale frequentie in het treinstation, per richting",
    "jaar.alle": "alle bouwjaren",
    "jaar.vanaf": "vanaf {jaar}",
    "jaar.enkel": "enkel {jaar}",
    "jaar.aria": "Minimaal bouwjaar",

    "zit.alle": "elk aantal plaatsen",
    "zit.enkel": "enkel {n} plaatsen",
    "zit.vanaf": "vanaf {n} plaatsen",
    "zit.aria": "Minimum aantal zitplaatsen",

    "euronorm.uitleg": "Kies met de twee bolletjes van welke tot welke norm. Elektrische " +
                       "auto's staan bovenaan op de schaal; zij hebben geen euronorm. " +
                       "Hybrides tellen met hun eigen euronorm.",
    "norm.alle": "maakt niet uit",
    "norm.enkel": "enkel {norm}",
    "norm.hoger": "{norm} en hoger",
    "norm.tussen": "{van} tot en met {tot}",
    "norm.ariaVan": "Laagste euronorm",
    "norm.ariaTot": "Hoogste euronorm",
    "norm.elektrisch": "elektrisch",

    "dichtbij.titel": "Dichtstbijzijnde auto's",
    "dichtbij.bij": "Dichtst bij <b>{plek}</b>",
    "dichtbij.bijJou": "Dichtst bij <b>jouw locatie</b>",
    "dichtbij.leeg": "Geen enkele auto voldoet aan de filters — niets om te tonen.",
    "dichtbij.sluiten": "Sluiten",
    "dichtbij.sluitenLang": "Lijst sluiten",

    "melding.geduld": "Even geduld",
    "melding.laden": "De kaart met deelauto's wordt geladen.",
    "taalvraag.titel": "In welke taal wil je de kaart?",
    "tandwielhint": "Je kunt de taal hier altijd aanpassen, in de instellingen.",

    "instellingen.volgmuis": "Lijst dichtstbijzijnde auto's volgt muis",
    "instellingen.dichtbij": "Lijst dichtstbijzijnde auto's tonen",
    "instellingen.samen": "Auto's op dezelfde plek samen tonen",
    "instellingen.taal": "Taal",
    "instellingen.taalOnthouden": "Taal onthouden in deze browser.",
    "instellingen.taalVergeten": "Vergeten",
    "instellingen.bronLive": "De auto's en hun standplaats zijn actueel. Merk, model en toebehoren zijn bijgewerkt op {datum}.",
    "instellingen.bronDump": "Gegevens van {datum}.",
    "instellingen.pictogram": "Tabbladpictogram:",
    "melden.knop": "Probleem of feedback",
    "melden.titel": "Probleem melden of feedback geven — opent github.com in een nieuw tabblad; je feedback is publiek zichtbaar",
    "melden.titelFormulier": "Probleem melden of feedback geven — je melding is publiek zichtbaar",
    /* Het issueformulier op GitHub in deze taal; zie .github/ISSUE_TEMPLATE/. */
    "melden.sjabloon": "feedback-nl.yml",
    "meldformulier.titel": "Probleem of feedback",
    "meldformulier.publiek": "<strong>Je melding is publiek.</strong> Wat je in de beschrijving " +
                             "schrijft, verschijnt als openbaar issue op GitHub, voor iedereen " +
                             "zichtbaar. Laat er dus persoonlijke gegevens uit, zoals je naam, adres, " +
                             "telefoonnummer, e-mailadres, lidnummer of een nummerplaat. Moet je iets " +
                             "melden dat niet openbaar mag komen? Mail dan naar " +
                             "<a href=\"mailto:info@degage.be\">info@degage.be</a>.",
    "meldformulier.soort": "Waarover gaat het?",
    "meldformulier.soortKaart": "Er klopt iets niet op de kaart",
    "meldformulier.soortWerking": "De kaart werkt niet goed",
    "meldformulier.soortIdee": "Idee of suggestie",
    "meldformulier.soortAnders": "Iets anders",
    "meldformulier.beschrijving": "Beschrijving",
    "meldformulier.beschrijvingPlh": "Wat zag je, en wat had je verwacht? Over welke auto of welke plaats gaat het?",
    "meldformulier.mail": "E-mailadres (optioneel)",
    /* De 30 dagen staan ook als BEWAARTERMIJN_DAGEN in feedback-worker/wrangler.toml. */
    "meldformulier.mailUitleg": "Alleen als je een antwoord wil. Het blijft privé en wordt 30 dagen na afhandeling gewist.",
    "meldformulier.veldMail": "Dit lijkt geen e-mailadres. Kijk het na, of laat het veld leeg.",
    "meldformulier.bedanktMail": "Je e-mailadres staat niet in de melding op GitHub. We " +
                                 "gebruiken het alleen om je te antwoorden.",
    "meldformulier.mailMislukt": "Je melding staat op GitHub, maar je e-mailadres kon niet " +
                                 "bewaard worden. Wil je een antwoord? Mail dan naar " +
                                 "<a href=\"mailto:info@degage.be\">info@degage.be</a>.",
    "meldformulier.akkoord":"Ik begrijp dat mijn beschrijving publiek wordt, en er staan geen persoonlijke gegevens in.",
    "meldformulier.annuleren": "Annuleren",
    "meldformulier.versturen": "Versturen",
    "meldformulier.bezig": "Bezig met versturen…",
    "meldformulier.bedankt": "Bedankt! Je melding staat nu op GitHub.",
    "meldformulier.bekijk": "Bekijk je melding",
    "meldformulier.veldSoort": "Kies waarover je melding gaat.",
    "meldformulier.veldBeschrijving": "Vul een beschrijving in.",
    "meldformulier.veldTeKort": "Schrijf iets meer: minstens {min} tekens.",
    "meldformulier.veldAkkoord": "Vink aan dat je begrijpt dat je melding publiek is.",
    "meldformulier.foutControle": "De spamcontrole is nog niet klaar. Wacht even tot het vakje een vinkje toont, en probeer opnieuw.",
    "meldformulier.fout": "Versturen lukte niet. Probeer het later opnieuw, of meld het " +
                          "rechtstreeks op {link} (daar heb je wel een account nodig).",

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
    "popup.nieuw": "Nieuwe auto",
    "popup.nieuwUitleg": "Merk, model en de andere details volgen bij de volgende bijwerking van de kaart.",
    "popup.ookHier": "Op deze plek staat ook:",
    "popup.lidVraag": "Zin gekregen om mee te delen?",
    "popup.lidOproep": "Word lid van Dégage! 🚗",
    "popup.tarieven": "Onze tarieven",
    "popup.faq": "Veelgestelde vragen",
    "popup.uitleg": "Uitleg",
    "popup.bereikEen": "± {km} km",
    "popup.bereikMarge": "{van}–{tot} km",
    "popup.bereikUitleg": "Bereik: schatting bij gemengd gebruik, geen WLTP. Een marge " +
                          "betekent dat het van de batterij afhangt. Bron:",
    "popup.bereikUitlegHandmatig": "Bereik: schatting bij gemengd gebruik, geen WLTP. " +
                          "Opgegeven door Dégage zelf, op basis van de batterij die in " +
                          "deze wagens zit.",
    "ov.titel": "Mobiscore",
    "ov.geenScore": "niet beschikbaar",
    "ov.bushalte": "Bushalte",
    "ov.tramhalte": "Tramhalte",
    "ov.geenHalte": "Geen bus- of tramhalte binnen {straal}",
    "ov.geenBushalte": "Geen bushalte binnen {straal}",
    "ov.geenTramhalte": "Geen tramhalte binnen {straal}",
    "ov.station": "Treinstation",
    "ov.meter": "{n} meter",
    "ov.kilometer": "{n} kilometer",
    "ov.kilometerEen": "1 kilometer",
    "ov.kmKort": "{n} km",
    "ov.keer": "{n}×",
    "ov.minderDanEenKeer": "<1×",
    "ov.perUurLabel": "per uur",
    "ov.bron": "Naast het pictogram: vertrekken per uur, per richting. De naam " +
              "van de halte staat op het pictogram. " +
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
