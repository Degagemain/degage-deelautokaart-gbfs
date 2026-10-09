# De kaart van binnen

Technische documentatie bij `map/index.js` en `map/index.html` — voor wie de kaart moet wijzigen, overnemen
of ergens anders opnieuw opbouwen.

Dit document beschrijft **hoe het gebouwd is**. Wát de kaart voor een bezoeker doet en
waarom, staat in [`FUNCTIONEEL.md`](FUNCTIONEEL.md) — de regels achter de filters, de balk
en de talen worden daar uitgelegd en hier niet herhaald. Het gaat ook niet over de feed:
wat daarin staat leest een partner op `gbfs/index.html` en in de
[GBFS-specificatie](https://github.com/MobilityData/gbfs). Voor het bedienen van het
gereedschap is `BEDIENING.md` de plek; hoe alle onderdelen samenhangen staat in `README.md`.

---

## 1. Uitgangspunten

Vier keuzes waar de rest uit volgt. Wie er één omgooit, gooit meer om dan hij denkt.

**Geen bouwstap.** Geen bundler, geen `npm install`, geen transpilatie. Je opent een
bestand in een editor, je slaat op, je ververst de browser. Dat is met opzet: dit ding moet
over vijf jaar nog te wijzigen zijn door iemand die de toenmalige gereedschapsketen niet
kent.

De kaart bestaat daarom uit **zes bestanden die de browser rechtstreeks leest**:

| bestand | inhoud |
|---|---|
| `map/index.html` | de structuur en de pictogrammen |
| `map/index.css` | alle opmaak |
| `map/index.js` | alle logica |
| `map/taal/nl.js` · `fr.js` · `en.js` | alles wat de bezoeker leest, per taal |

Alles hangt aan gewone `<script>`-tags onderaan de body, in deze volgorde: **de talen, dan
Leaflet, dan `index.js`**. Klassieke scripttags blokkeren en draaien op volgorde, dus er is
geen module, geen `await` en geen laadvolgorde om over na te denken — maar de volgorde
zelf is wel echt:

- `index.js` gebruikt `L` meteen, dus Leaflet moet er al zijn;
- `TALEN` wordt afgeleid uit `window.DEGAGE_TALEN` zodra `index.js` begint;
- `index.js` zoekt rechtstreeks in de pagina (`$("paneel")`), vandaar onderaan de body.

Zet er dus geen `async` op en verplaats de tag niet naar de kop zonder `defer`: dan breekt
het op een plek die niets met de oorzaak te maken heeft.

**Geen eigen backend.** De pagina leest twee JSON-bestanden, legt ze naast de live vloot
van Dégage (één publiek GET-verzoek, zie "De live vloot") en tekent wat eruit komt. Geen
eigen server, geen databank, geen sessie. Ze draait van elke statische hosting.

**Geen tracking, geen externe fonts.** Het enige verkeer naar buiten: de kaarttegels van
OpenStreetMap, de twee bibliotheken van unpkg, de live vloot van degapp.be, en — alleen
als de bezoeker een adres intikt — één verzoek naar Nominatim.

**Bedoeld als iframe.** De pagina hangt in een WordPress-omgeving die haar maat pas ná het
laden vaststelt. Alles wat met afmetingen te maken heeft, houdt daar rekening mee (zie
"Iframe, maten en mobiel").

## 2. Wat er van buiten komt

| bron | wat | hoe vastgezet |
|---|---|---|
| unpkg.com | Leaflet 1.9.4 | versie gepind + SRI-hash |
| unpkg.com | Leaflet.markercluster 1.5.3 | versie gepind + SRI-hash |
| tile.openstreetmap.org | de kaarttegels | attributie is een licentievoorwaarde |
| tile.openstreetmap.fr | de kaarttegels in het Frans (Franse plaatsnamen) | eigen naamsvermelding; bij storing terug naar de standaardtegels (`TEGELS_PER_TAAL`) |
| nominatim.openstreetmap.org | adres → coördinaat | alleen bij verzenden, zie "Zoeken" |
| degapp.be/api/v1/car/stands | de live vloot: welke auto's er zijn en waar | `VLOOT_API`; bij fout of na `VLOOT_WACHTTIJD_MS` terug naar de feed, zie "De live vloot" |
| de Cloudflare Worker | het meldformulier → een issue op GitHub | `melden.url` in `config.js`; leeg = de knop linkt gewoon naar GitHub, zie "Melden" |
| challenges.cloudflare.com | Turnstile, de spamcontrole in het meldformulier | pas geladen als iemand het formulier opent; `melden.turnstileSitekey` |

De SRI-hashes (`integrity=`) zijn geen sier: verandert het bestand op de CDN, dan weigert
de browser het uit te voeren. Wie een versie opwaardeert, moet dus **ook de hash
vervangen** — anders laadt de kaart niet meer, en de reden staat alleen in de console.

## 3. De feed die de kaart leest

De kaart haalt **twee** bestanden op uit `../gbfs` (`GBFS_BASIS`, bovenaan `index.js`):

- `station_information.json` — de standplaatsen: `station_id`, `lat`, `lon`. De velden
  `name` en `post_code` worden **niet** gebruikt: plaatsnaam en postcode komen per auto
  uit `degage_vehicles.json`, omdat auto's op een gedeeld punt verschillende (en allebei
  juiste) schrijfwijzen kunnen dragen.
- `degage_vehicles.json` — de Dégage-uitbreiding op GBFS, met per auto: `station_id`,
  `naam`, `merk`, `model`, `carrosserie`, `brandstof`, `zitplaatsen`, `bouwjaar`,
  `versnellingsbak`, `klasse`, `euronorm`, `toebehoren`, `plaats`, `postcode`, `district`, `contact`.
  `plaats` is de gemeente met rechtgezette hoofdletters ("GENTBRUGGE" en "gent"
  worden "Gentbrugge" en "Gent"); dat gebeurt in `plaatsnaam()` in de generator, die
  alleen hoofdletters verandert en nooit letters. De kaart toont wat de feed draagt.

`station_status.json`, `vehicle_types.json`, `system_information.json` en `gbfs.json` horen
bij de feed voor partners, maar **de kaart leest ze niet**. Verhuist de feed, dan is
`GBFS_BASIS` het enige dat je aanpast; bij een absolute URL op een ander domein moet die
server CORS toestaan.

Daarnaast drie **verrijkingen**, alle drie optioneel — ontbreekt het bestand, dan staat dat
stuk gewoon niet in de popup:

| bestand | gemaakt door | sleutel | inhoud |
|---|---|---|---|
| `map/fotos/fotos.json` | `scripts/haal_stockfotos.py` | merk\|model | modelfoto met auteur en licentie |
| `map/bereik.json` | `scripts/haal_bereik.py` | merk\|model\|bouwjaar | rijbereik `km: [van, tot]` |
| `map/ov.json` | `scripts/haal_ov.py` | station_id | Mobiscore, dichtste halte, station |

Alle drie komen uit een script dat **buiten de generator** draait, want ze hebben netwerk
nodig en een externe bron kan morgen iets anders zeggen; de generator blijft zo zonder
netwerk en deterministisch.

`ov.json` is gesleuteld op `station_id` en draagt daarom `voor_feed`: de `last_updated` van
de feed waarvoor het berekend is. De kaart gebruikt het **alleen** als dat overeenkomt met
`station_information.json` (zie `laden()`). Een standplaats kan tussen twee dumps verhuizen
en toch hetzelfde `station_id` houden; zonder die test zou ze de bereikbaarheid van haar
oude adres dragen. Past het niet, dan staat er een waarschuwing in de console en geen
OV-blok in de popup.

### De live vloot

De feed is een kwartaaldump; de vloot verandert elke week. Daarom haalt `laden()` ook
**`VLOOT_API`** op (`https://degapp.be/api/v1/car/stands`, publiek, CORS `*`). Die geeft
per auto alleen dit (verzonnen voorbeeld):

```json
{ "displayName": "Voorbeeld Korenmarkt",
  "geoPosition": { "latitude": 51.0545, "longitude": 3.7213 },
  "vehicleInformation": { "fuelType": "diesel", "type": "manual" },
  "stationType": "fixed" }
```

Daar staat ook een nummer per auto bij. De kaart gebruikt dat bewust nergens voor.

**De regel: die lijst beslist wélke auto's er zijn en wáár ze staan. De feed levert alleen
nog de details.** `metLiveVloot()` herschikt de feed daarnaar en geeft stations, wagens en
een OV-bestand terug in precies de vorm van de feed, zodat de rest van `laden()` en de hele
kaart niet hoeft te weten waar ze vandaan komen.

**1. Koppelen.** Op naam, en alleen op naam: namen zijn uniek in de vloot (nagekeken op
28-09-2026, aan beide kanten). De feed draagt bewust geen nummer van een auto. Gevolg: een
auto die sinds de dump een andere naam kreeg, staat als nieuw op de kaart tot de volgende
feed, en de oude naam verdwijnt.

**2. Wat met elke auto gebeurt.**

| | in de API | niet in de API |
|---|---|---|
| **in de feed** | feedwagen, met de naam uit de API en de standplaats van hieronder | **weg** — bestaat niet meer |
| **niet in de feed** | **nieuw**: `{ naam, brandstof?, versnellingsbak?, toebehoren: {}, nieuw: true }` | — |

Een nieuwe wagen draagt **alleen** wat de API weet. `fuelType` en `type` worden vertaald
met `API_BRANDSTOF` en `API_BAK` naar de woorden van de feed; een waarde die daar niet in
staat, wordt weggelaten in plaats van geraden. Alle andere velden ontbreken, en de kaart
kan daar al tegen: een popup toont wat er is, en een filter op een ontbrekend gegeven laat
de wagen vallen (`wagenPast()`, dezelfde regel als voor een onbekende euronorm). De popup
toont het label `popup.nieuw` op de plaats van merk en model, met `popup.nieuwUitleg`
eronder; de balk met dichtstbijzijnde auto's toont hetzelfde label. De stijl is
`.wagen__nieuw` in `index.css`.

Een API-auto zonder bruikbare `geoPosition` (ontbrekend, geen getal, of 0) wordt
overgeslagen: een auto zonder plek kan niet op een kaart.

**3. Waar de stip komt.** Eerst groeperen op het exacte API-punt (op 6 decimalen, net als
de generator). Dan per punt:

- ligt er een **gekoppelde auto die niet verhuisd is** — zijn API-punt ligt binnen
  `locatie_nauwkeurigheid_m` + `VERHUIS_MARGE_M` (20 + 10 m) van zijn feedstip — dan blijft
  de plek **op die feedstip**, met haar OV-gegevens. Een nieuwe auto op datzelfde punt komt
  erbij. Twee API-punten bij dezelfde feedstip worden één plek;
- anders (**nieuwe plek of verhuisd**) wordt het API-punt vervaagd met **`verschuif()`**,
  de regel-voor-regel-kopie van `verschuif()` in `scripts/genereer_gbfs.py`: SHA-256 van
  `"lat,lon"` op 6 decimalen, de eerste 8 bytes big-endian als hoek, en
  `locatie_nauwkeurigheid_m` meter in die richting. Zo'n plek heeft geen OV-gegevens.

Het `station_id` van een nieuwe plek volgt de regel van de generator: `stationId()`, de
kopie van `station_id()` in `scripts/genereer_gbfs.py` — `"st-"` + twaalf letters uit een
SHA-256 van het **vervaagde** punt. Een plek op een feedstip houdt het id van die stip.

*Waarom niet gewoon elk API-punt opnieuw vervagen?* De coördinaten in de API en in de dump
zijn niet bit voor bit gelijk, en de hash ziet elk verschil: opnieuw vervagen gaf bijna
élke stip een andere richting — verspringende stippen tegenover de feed, en geen enkele
OV-regel meer. Wijzig je `verschuif()` in de generator, wijzig dan deze mee; dat beide
versies dezelfde uitkomst geven, is op 28-09-2026 nagekeken.

*Waarom `VERHUIS_MARGE_M = 10`?* Bepaald op een meting van 28-09-2026; de cijfers staan in
de interne notities (zie `README.md`).

**4. Terugvallen.** De kaart toont gewoon de feed, met een waarschuwing in de console, als:

- de API niet antwoordt binnen `VLOOT_WACHTTIJD_MS` (8 s), een fout geeft, of geen lijst;
- de lijst leeg is (of geen enkele auto met een plek bevat) — een lege vloot is eerder een
  storing dan de waarheid;
- de feed geen `locatie_nauwkeurigheid_m` draagt — dan is er geen afstand om mee te vervagen;
- de browser geen `crypto.subtle` heeft (alleen op `https` of `localhost`) — zonder
  vervaging komt er niets uit de API op de kaart.

`staat.live` zegt welke van de twee er getoond wordt, en `toonDatum()` volgt dat: live
staat er geen datum naast de teller en zegt `#bronregel` in de instellingen hoe oud de
details zijn (`instellingen.bronLive`); zonder live vloot staat `telling.bijgewerkt` naast
de teller en in de instellingen `instellingen.bronDump`. Bij succes staat er een regel in de
console met het aantal nieuwe, verhuisde en verdwenen auto's, en de namen van die laatste.

**Wat dit niet raakt:** de GBFS-feed zelf. Aggregatoren lezen nog altijd de kwartaaldump;
de live vloot bestaat alleen in de kaart.

## 4. Datastroom

```
taal/nl.js · fr.js · en.js          <- blokkerende scripttags, vóór alles
        │
        └─ window.DEGAGE_TALEN = { nl: {...}, fr: {...}, en: {...} }

laden()
  ├── haal("station_information") ─┐
  ├── haal("degage_vehicles")  ────┤
  ├── laadFotos()              ────┤ parallel
  ├── laadBereik()             ────┤
  ├── laadOv()                 ────┤  (daarna de test op voor_feed)
  └── laadVloot()              ────┘  (VLOOT_API; null bij fout)
        │
        ├─ metLiveVloot()  → stations, wagens en OV volgens de live vloot
        │                    (overgeslagen bij fout: dan gewoon de feed)
        ├─ wagens groeperen per station_id
        ├─ staat.stations vullen (alleen stations mét wagens)
        ├─ filterwaarden uit de data afleiden (brandstoffen, soorten, bakken,
        │  zitplaatsen, euronormrangen, bouwjaren)
        ├─ bouwFilters()  → de filterlijst in het paneel, één keer
        └─ teken()        → markers, telling, en de balk onderaan
```

Alles wat de kaart weet, staat in het object **`staat`**. De gekozen filters leven daar als
`Set`'s (`gekozenBrandstof`, `gekozenSoort`, `gekozenBak`, `gekozenVlaggen`) en als losse
ondergrenzen (`minZit`, `minNorm`, `jaarVan`), en voor het OV-filter als `gekozenOvModi`,
`ovBeide` en per modus de grenzen in `ovModus` (`maxM`, `minFreq`). De
aangevinkte vakjes in de
opmaak zijn daar een afspiegeling van, nooit de bron — daarom kan de filterlijst opnieuw
getekend worden (bij een taalwissel) zonder dat er een keuze sneuvelt.

**`teken()` is de enige weg naar het scherm.** Elke wijziging — een filter, een schakelaar,
een taalwissel — eindigt daar. De functie gooit alle markers weg en bouwt ze opnieuw op.
Dat klinkt duur en is het niet: het gaat om een paar honderd markers, en de eenvoud van
"één plek die tekent" is meer waard dan het verschil.

Filterwaarden worden **uit de data afgeleid, niet vastgelegd**. Duikt er in een volgende
dump een achtste brandstof op, dan verschijnt die vanzelf in het filter. Alleen het label
moet je bijwerken — zie "Iets wijzigen".

## 5. Het stationsmodel

Een station is één uniek coördinaat, niet één adresrij. In de brondata heeft elke auto
zijn eigen adresrij, ook waar twee auto's fysiek op hetzelfde punt staan; groeperen op
adres zou die twee uit elkaar trekken. De feed lost dat op, de kaart erft het resultaat:
**568 auto's op 565 stations**, drie stations dragen er twee.

In de code zie je dat terug in `popupHtml()`: elke auto draagt zijn **eigen plaatsnaam**
tussen haakjes achter zijn naam (op hetzelfde punt dus "Ledeberg" bij de ene en "Gent"
bij de andere), en het merkteken op de pin volgt `passende` en niet `station.wagens`. De postcode
wordt niet meer getoond.

**Eén popup per auto, niet per stip.** Een stip blijft één standplaats, maar de popup toont
standaard één wagen: `popupHtml(station, wagen)` vraagt `popupWagens()` welke. Uit de balk
en na een zoekopdracht is dat de aangeklikte wagen. Bij een klik op de stip is het de eerste
die door de filters komt. De andere wagens op die plek staan eronder als `.ook-knop`
(`ookHierHtml()`). Die knop draagt het `station_id` en de plaats van de wagen in
`station.wagens`, want de popup is HTML-tekst. `wisselWagen()` zet de andere wagen met
`setContent()` in dezelfde popup.

Drie dingen die je daarbij niet mag vergeten:

- **De klik op `.ook-knop` stopt bij de popup** (`stopPropagation`). Leaflet beslist pas bij
  de kaart of een klik binnen een popup viel, door vanaf het doel omhoog te lopen. Na
  `setContent()` hangt de knop nergens meer, dus zonder die stop sloot de popup zich meteen.
- **`setContent()` vervangt bij een stip de inhoudsfunctie van `bindPopup`.** De
  `click`-afhandelaar in `teken()` zet die functie daarom bij elke klik terug, anders opent
  de stip de volgende keer met de wagen van daarnet.
- **De balk onthoudt naast `balkPopupStation` ook `balkPopupWagen`.** Een tweede klik op
  hetzelfde kaartje sluit de popup, en een klik op de buurwagen wisselt hem.

Met `staat.samenTonen` (de schakelaar `#knop-samen` in de instellingen, standaard uit) geeft
`popupWagens()` gewoon `station.wagens` terug, zoals vroeger. Omzetten sluit een
openstaande popup, want die draagt afgewerkte tekst volgens de oude keuze.

## 6. Filters

`wagenPast(w)` is de enige plek waar beslist wordt of een auto door de filters komt.
Het OV-filter is het enige dat niet naar de auto kijkt maar naar zijn standplaats
(`ovPast()`, `ovModusPast()`). Elke modus (`OV_MODI`: bus, tram, trein) is een blok in de
opmaak met twee schuiven, zonder aanvinkvakje. `staat.gekozenOvModi` wordt afgeleid uit de
schuiven (`ovModiBijwerken()`): een modus filtert zodra `maxM` of `minFreq` niet `null` is.
`wisOvModus()` zet beide schuiven terug op "alles". Bij twee of meer modi is het "of",
tenzij `ovBeide` aanstaat. Een modus zonder gegevens verdwijnt, en het hele blok als er
geen OV-gegevens bij de feed horen (`bouwOv()`).

**De afstandsschuif** begint links met "elke afstand", en daar staat hij in rust; daarna
volgen de afstanden van klein naar groot (250 m eerst). Welke stand "alles" is, draagt
elke OV-schuif als `data-rust` (nu overal `0`). `wisOvModus()` en het telbolletje op
de kop (`werkKoppenBij()`) kijken daarnaar; wie een nieuwe schuif toevoegt, hoeft niets te
doen zolang 0 zijn ruststand is.

**De stand staat ín de balk** bij de zes OV-schuiven (`.schuif--in`), niet eronder: de balk
is een pil van 26 px met de tekst erin. `zetSchuifIn()`, aangeroepen vanuit
`zetSchuiftekst()`, zet `duim-links` als het bolletje op de linkerhelft staat (dan gaat de
tekst naar rechts) en `is-gezet` als de schuif niet in rust staat. De balk is getekend met
pseudo-elementen voor zowel WebKit als Firefox; wie hem aanpast, test in beide.

`ovDeel()` leest per modus `bus`, `tram` of `trein` uit `ov.json`. Bus en tram zijn elk de
dichtste halte met alleen die soort ritten. De gemengde `halte`, de dichtste met bus óf
tram, dient alleen nog als terugval in de popup (`ovHtml()`) voor zo'n ouder bestand. Een `ov.json` van vóór 08-10-2026 heeft geen `bus` en
`tram`; dan verdwijnen die twee blokken tot `haal_ov.py` opnieuw gedraaid heeft.

De afstanden komen uit `AFSTAND_LADDER` — ronde afstanden van 250 m tot 10 km — waarvan
`ovStanden()` alles wegsnijdt wat op of boven de verste standplaats ligt: een stand die
niets wegfiltert, doet de schuif over haar bereik liegen. Die ladder staat **oplopend**,
met "elke afstand" er links voor. De frequenties komen uit `FREQ_LADDER` (per modus),
oplopend, met alleen de standen boven de rustigste en tot de drukste halte; ze rekenen
per richting, net als de popup (`freqPerRichting()`). Dat de filters op iets
kunnen staan, hangt aan `haal_ov.py`: dat zoekt tot 10 km door, zodat er bij élke standplaats
een gemeten afstand staat in plaats van een gat.
Tussen groepen geldt EN, binnen een groep OF — behalve bij de vlaggen, waar ook binnen de
groep EN geldt. De redenen achter die regels, en achter het ontbreken van een negatief
filter, staan in `FUNCTIONEEL.md`.

De keuzelijsten worden getekend door `vulKeuzes()`, die ook na een taalwissel opnieuw
draait: de labels komen uit het taalbestand en de alfabetische volgorde verandert mee. De
luisteraar zit **op `#filters`** en niet op elk vakje apart — anders zou elke taalwissel een
nieuwe laag luisteraars opleveren.

De euronormschaal draait om `euronormRang()`: `"Euro 3"` t/m `"Euro 6"` leveren 3 t/m 6,
volledig elektrisch krijgt `ELEKTRISCH_RANG = 10` (hybrides tellen met hun eigen norm), en
een onbekende norm levert
`null` — die valt weg zodra de schuif iets filtert (`euronormPast()`).
In het telbolletje (`werkKoppenBij()`) telt zo'n schuif als één filter; het rechterbolletje
draagt `data-rust` = de hoogste stand, want daar filtert het niets. De schuif met twee
bolletjes is twee `<input type="range">` over elkaar (`#euronorm-van`, `#euronorm-tot`),
met `pointer-events` alleen op de bolletjes; `staat.minNorm` en `staat.maxNorm` zijn de
grenzen, `null` als er aan die kant geen is. Rang 10 staat ver genoeg van de echte
reeks om nooit te botsen als er ooit een echte Euro 7 komt. Deze afspraak leeft
**uitsluitend in de kaart**; in de feed staat er niets van.

## 7. Tekenen: markers, clusters en labels

**Clusterbol.** `iconCreateFunction` telt `m.options.actief` over de kindermarkers, zodat de
bol het aantal *passende* standplaatsen toont en niet het aantal markers dat er toevallig
in zit. Anders zou een cluster "47" zeggen terwijl het paneel "12 van 568" meldt.

**Naamlabels.** De autonaam staat onder de pin zodra er hoogstens `NAMEN_MAX_IN_BEELD` (40)
losse, passende pins in beeld staan, en altijd vanaf `NAAM_ZOOM` (14). `toonNamen()` telt
met `clusters.getVisibleParent(m) === m` welke pins los staan, en draait na elke `moveend`,
na de `animationend` van de clustergroep en na het (opnieuw) inladen (`chunkProgress`).
De schakelaar is één klasse op de kaart (`.toont-namen`), niet honderden labels aan- en
afkoppelen. Bij `zoomanim` naar `NAAM_ZOOM` of verder gaat ze meteen aan, zodat de namen
mét de beweging meekomen. Daarna verbergt `schikNamen()` elke naam die over een andere
naam, pin of clusterbol zou vallen (klasse `.naamlabel--botst`), van boven naar onder: het
clusteren kijkt alleen naar de pins, niet naar de namen. Daardoor kan de clusterstraal
ingezoomd krap blijven (`maxClusterRadius`: 44 px, vanaf zoom 13 34 px).

## 8. Popups, de vrije ruimte en de balk onderaan

### Het vrije deel van de kaart

Het paneel linksboven en de balk onderaan liggen **over** de kaart, dus het midden van het
venster is niet het midden van wat je ziet. `vrijeRuimte()` meet bij elke oproep hoeveel er
aan elke kant bedekt is; `centreerVrij()` mikt op het midden van wat overblijft, en
`popupRanden()` geeft Leaflet dezelfde bedekking mee zodat zijn eigen bijsturing een popup
nooit half onder het paneel laat staan.

Bewust bij elke oproep méten en niet onthouden: het paneel groeit en krimpt met de filters,
de balk kan dicht staan, en op een telefoon ligt het paneel bovenaan in plaats van links.

`centreerVrij()` verschuift **zonder animatie**. Dat is geen luiheid: een popup die opengaat
terwijl de kaart nog schuift, laat Leaflets bijsturing tegen een bewegend doel rekenen — de
popup kwam dan half boven het scherm uit. Eerst stilstaan, dan openen.

### Een popup die niet past

Een popup krijgt **nooit een scrollbalk**. `popupRanden()` geeft Leaflet daarom geen
`maxHeight` meer (dan scrolt Leaflet de inhoud), maar de vrije hoogte als `pasHoogte`. Na
het openen, en na het openklappen van een uitleg, meet `pasPopupIn()` de popup; is hij
hoger, dan krijgt de inhoud een CSS-`zoom` tot hij past, nooit onder `MIN_ZOOM` (0,6).
`zoom` en geen `transform: scale`, zodat Leaflet de verkleinde maat meet en de punt op de
stip blijft.

Op een telefoon is wat er tussen het paneel en de balk overblijft soms kleiner dan de popup
zelf. Een kleinere popup alleen lost dat niet op: onder een leesbare hoogte duwt Leaflet de
popup tegen de bovenrand en valt de onderkant van het scherm. `popupRanden()` geeft daarom
bij plaatsgebrek de plaats **onderaan** terug — daar liggen de meldknop en de balk — en pas
als het dan nog steeds te krap is, die bovenaan.

Onderaan mag dat, want allebei die dingen stappen opzij:

- de **meldknop** verdwijnt zolang er een popup openstaat (`toont-popup`, gezet bij
  `popupopen`), net zoals hij dat al deed voor het instellingendoosje;
- de **balk** verdwijnt alleen als de popup haar écht raakt. Dat wordt ná het openen
  gemeten — pas dan staat de popup op zijn plaats — en zet `popup-over-balk`.

Waarom wegnemen en niet eroverheen leggen: alle lagen van Leaflet zitten samen in één
stapelcontext (`.leaflet-map-pane`, `z-index: 400`) en komen dus nooit boven de 1000 van de
knoppen, de balk en het paneel. Die z-index optrekken zou de tegels óók boven het paneel
leggen. Het paneel blijft daarom wél bovenop: daar komt de popup enkel onder in het
allerlaatste geval, als er anders niets van hem in beeld zou staan.

### De balk met dichtstbijzijnde auto's

De balk is **twee elementen**: `.dichtbij` is de ruimte waarin ze mag staan — onzichtbaar,
`pointer-events: none`, en de container waarop de kaartjes hun containerquery doen — en
`.dichtbij__doos` is de balk zelf, niet breder dan haar inhoud. De ruimte houdt links altijd
de kolom van het filterpaneel vrij (404 px), ook met dichte filters: zo verspringt er niets
bij het openklappen. Alleen `.paneel.is-klein` geeft die kolom terug.

Dat onderscheid zit ook in het script: waar het om een plek op het scherm gaat — `bijDeBalk()`,
`vrijeRuimte()`, `meetDichtbij()` — wordt `balkDoos()` gemeten en niet `#dichtbij`, want naast
de doos ligt gewoon kaart.

`dichtbijBron` houdt bij waardoor de balk openstaat: `"zoek"` (na een zoekopdracht, wint
altijd), `"auto"` (vanzelf, bij hoogstens `DICHTBIJ_MAX_IN_BEELD` auto's in beeld óf vanaf
zoom `DICHTBIJ_ZOOM`) of `null`. Die zoomondergrens is er voor het centrum van Gent: daar
blijft de telling ook op buurtniveau boven de honderd, en zonder hem verscheen de balk er
nooit.

De muisafhandeling kijkt naar snelheid, niet alleen naar positie:

| constante | waarde | betekenis |
|---|---|---|
| `MUIS_VEEG` | 0,8 px/ms | daarboven: onderweg naar iets, niets doen |
| `MUIS_RUST` | 90 ms | hoogstens zo vaak herberekenen tijdens traag bewegen |
| `MUIS_STIL` | 260 ms | stilvallen na een veeg telt alsnog als aanwijzen |
| `MUIS_VERS` | 120 ms | oudere metingen zeggen niets over de snelheid van nú |
| `BALK_MARGE` | 40 px | zo dicht bij de balk stopt het bijwerken helemaal |

**`verversDichtbij()` is de weg voor alles wat de INHOUD van de balk raakt** (een filter,
een schakelaar, een taalwissel); `bijwerkenAutoDichtbij()` blijft de weg voor alles wat
het BEELD raakt (zoomen, pannen). Dat onderscheid is nodig omdat de tweede meteen uitstapt
zodra de balk uit een zoekopdracht komt — terecht, want pannen mag een zoekresultaat niet
wegduwen, maar daardoor volgde de lijst na een adreszoekopdracht de filters niet meer.

`dichtbijMeetpunt` bepaalt welke van de twee: is er een punt om vanaf te meten (een adres
of "auto's in mijn buurt"), dan rekent `verversDichtbij()` opnieuw vanaf datzelfde punt.
Bij een naamzoekopdracht staat het op `null` — die lijst draagt geen afstanden en negeert
de filters met opzet.

`balkAan` (de schakelaar in de instellingen) wordt bewaakt in **`toonLijst()` zelf**, niet
bij elke oproeper: de balk wordt vanaf een stuk of zes plekken gevuld, en één ervan
vergeten is precies het soort fout dat je pas maanden later merkt.

`lijstBevroren()` houdt de lijst stil zolang er een popup openstaat die vanuit de balk
geopend is. Zonder dat werkt een tweede klik niet: klikken verschuift de kaart, dat
verplaatst het meetpunt, de lijst herschikt, en het kaartje onder je cursor is een andere
auto geworden.

`toonLijst()` heeft een snelle weg: is de volgorde ongewijzigd, dan worden alleen de
afstanden bijgewerkt. Anders zou de hele balk opnieuw opgebouwd worden terwijl je cursor
erboven hangt — hover weg, toetsenbordfocus weg, klik op een net vervangen knop.

Kop en lege-meldingstekst worden als **functie** bewaard (`dichtbijTitel`, `dichtbijLeeg`),
niet als afgewerkte tekst: bij een taalwissel moet dezelfde lijst zich opnieuw kunnen
opschrijven, ook als ze uit een zoekopdracht van vijf minuten geleden komt.

## 9. Zoeken

`naamTreffers()` draait volledig lokaal over `staat.stations` — de vloot staat al in het
geheugen. Een treffer heet *sterk* bij rang 0 of 1 (exact, of begint ermee); alleen dan
blijft het verzoek naar Nominatim achterwege. Zwakke treffers worden bewaard en alsnog
getoond als er ook geen adres blijkt te bestaan.

**Het Nominatim-gebruiksbeleid is bindend**: hoogstens één verzoek per seconde, en
uitdrukkelijk niet voor aanvullen-terwijl-je-typt. De kaart zoekt daarom alleen bij
`submit`, nooit per toetsaanslag, en houdt één verzoek tegelijk aan (`zoekLoopt`).
Verzoeken dragen `countrycodes=be` en `accept-language`.

`ZOEK_LOSLATEN` (0,5 scherm) bepaalt wanneer een zoekopdracht losgelaten wordt bij pannen.

### De huidige locatie

De knop naast de zoekknop roept `kaart.locate()` aan en hangt aan Leaflets
`locationfound` en `locationerror`. De afhandeling loopt daarna door dezelfde weg als een
adreszoekopdracht: hetzelfde `zoekMarker` (met een andere klasse, `.hierpunt`), dezelfde
`dichtbijBron = "zoek"`, hetzelfde opruimen bij wegpannen. Er is dus geen tweede
levenscyclus bijgekomen.

Twee dingen zijn wél anders en staan in de code benoemd:

- **Het zoomniveau volgt `e.accuracy`** — `getBoundsZoom()` over een gebied van vier keer
  de nauwkeurigheid, gemaximeerd op 16. Een positie die op drie kilometer klopt, hoort
  niet op straatniveau getoond te worden. Boven `LOCATIE_NAUWKEURIG` (500 m) komt er een
  melding bij.
- **Boven `LOCATIE_VER` (25 km)** meldt de kaart hoe ver de dichtstbijzijnde auto staat.

> **Bij het inbedden:** in een iframe van een ander domein geeft de browser de locatie
> alleen door als de iframe **`allow="geolocation"`** draagt. Zonder dat attribuut komt er
> een weigering binnen (code 1) die niet van de bezoeker komt, en die is in de kaart niet
> te onderscheiden van een bezoeker die zelf weigert — vandaar dat de melding allebei de
> mogelijkheden noemt. Geolocatie vraagt bovendien een beveiligde verbinding: `https` of
> `localhost`.

## 10. De talen

Elk taalbestand hangt zichzelf in `window.DEGAGE_TALEN` en draagt vijf dingen:

```js
(window.DEGAGE_TALEN = window.DEGAGE_TALEN || {}).nl = {
  naam:    "Nederlands",   // zoals het in de keuzelijst komt te staan
  locale:  "nl-BE",        // voor getallen en datums
  teksten: { "kop.soort": "Soort voertuig", ... },
  waarden: { "benzine": "essence", ... },    // gesloten lijstjes uit de brondata
  vlaggen: { "trekhaak": "attelage", ... }   // toebehoren en afspraken
};
```

`TALEN` wordt **afgeleid** uit `Object.keys(window.DEGAGE_TALEN)`, dus uit de volgorde van
de scripttags. Die volgorde is meteen de volgorde van de keuzelijst, die `vulTaalkeuze()`
opbouwt uit de `naam` van elk bestand. Een taal die niet geladen is, is dus ook niet te
kiezen; is er maar één, dan verdwijnt de keuzelijst helemaal.

**In de opmaak** dragen elementen een sleutel als attribuut; `vertaalPagina()` loopt ze
langs:

| attribuut | zet |
|---|---|
| `data-i18n` | `textContent` |
| `data-i18n-html` | `innerHTML` (alleen voor de legende, die een `<strong>` bevat) |
| `data-i18n-title` | `title` |
| `data-i18n-aria` | `aria-label` |
| `data-i18n-plh` | `placeholder` |

**In het script** gaat alles door `t("sleutel", {vars})`. Ontbreekt een sleutel in de gekozen
taal, dan valt hij terug op `STANDAARDTAAL` ("nl"). Ontbreekt hij daar ook, dan geeft `t()`
de sleutel zelf terug — zichtbaar, en dus vindbaar.

Is er **geen enkel** taalbestand geladen (`TAALBESTANDEN_ONTBREKEN`), dan blijft het
meldingsvak in beeld staan, ook nadat het laden klaar is. Dat is een publicatiefout — de map
`map/taal/` is niet meegegaan — en die hoort niemand stil te ontdekken.

**Wisselen herlaadt niets.** `pasTaalToe()` laat alles wat er al staat zich opnieuw
opschrijven: de opmaak, de filterchips (die ook opnieuw sorteren, want de volgorde hangt van
het label af), de schuiven, de telling, de datum, de markers en de balk. Filters en
zoekresultaten blijven staan. Een openstaande popup gaat dicht — die draagt afgewerkte tekst
en zou half vertaald blijven staan.

## 11. Iframe, maten en mobiel

Dit is de klassieke manier waarop een Leaflet in een iframe stukloopt: Leaflet meet zijn
container één keer bij het opstarten en onthoudt die maat. Krijgt het iframe zijn hoogte pas
ná het laden — en dat doet het in WordPress vaak, door een thema, een lazy-load of een tab
die nog dicht staat — dan heeft Leaflet 0 bij 0 gemeten, rekent `fitBounds` zoomniveau 0
uit, en ziet de bezoeker één wereldbol met één cluster erop. Zonder foutmelding.

Daarom:

- Het startbeeld wordt **pas gezet zodra er een echte maat is** (`zetStartbeeld()`), en maar
  één keer — wie al gepand heeft, wordt niet teruggeworpen.
- Bij elke maatwijziging volgt `invalidateSize()`. Er wordt **zowel** naar een
  `ResizeObserver` **als** naar `resize`, `orientationchange` en `pageshow` geluisterd: de
  observer vangt wat het venster niet ziet (een iframe dat van hoogte verandert), maar hij
  wordt pas afgeleverd bij een tekenbeurt — staat de kaart in een verborgen paneel, dan
  gebeurt dat niet.
- Ook `bijwerkenAutoDichtbij()` weigert te werken zolang de kaart 0 bij 0 meet; anders zou de
  balk juist in een nog niet uitgemeten iframe opengaan.

Op een telefoon (`max-width: 640px`) beslaat het paneel de volle breedte en verhuizen de
zoomknoppen naar linksonder. De echte hoogte van de balk onderaan gaat via de CSS-variabele
`--dichtbij-hoogte` naar de opmaak, zodat die knoppen er niet onder verdwijnen — een vast
getal zou bij de eerste tekstwijziging niet meer kloppen.

Op een breed scherm hangt de linkerrand van de balk aan de filters: `zetFilters()` zet
`toont-filters` op het paneel, en alleen dan begint de balk rechts ervan (`left: 404px`: 12 + 380 + 12);
met dichte filters loopt ze door tot de linkerrand. Onder 380 px hoogte blijft ze altijd
naast het paneel, want dan reikt zelfs de kop tot waar de balk staat. De kaartjes krijgen
nooit een schuifbalk: ze delen de breedte (`flex: 1 1 0`, minstens 112 px), en
containerqueries op `.dichtbij` verbergen van achteren af wat niet meer past.

Op een telefoon liggen paneel en balk boven elkaar. Met open filters verdwijnt de balk
(`.paneel.toont-filters ~ .dichtbij { display: none }`) en houdt het paneel
`max-height: calc(100% - 16px - var(--dichtbij-ruimte))` over: `meetDichtbij()` meet
hoeveel er onderaan het venster bezet is tot de bovenrand van de balk, en dat is nul
zolang de balk er niet staat. Meten gebeurt via `balkInBeeld()` en niet via `hidden`
alleen — een doos die `display: none` is, geeft een rechthoek van nul terug op positie
nul, en `--dichtbij-ruimte` zou daar het hele venster van maken.

## 12. Melden

De knop **"Probleem of feedback"** rechtsboven is in de opmaak een gewone link naar het
issueformulier op GitHub. Dat staat er in drie talen — `feedback-nl.yml`, `-fr` en `-en`
in `.github/ISSUE_TEMPLATE/` — en `zetMeldlink()` zet bij het opstarten en bij elke
taalwissel het juiste sjabloon achter `?template=`. De `href` in `index.html` wijst naar
de Nederlandse, als vangnet voor wie geen JavaScript heeft; daar staat ook als enige het
adres van de repo. Dat werkt zonder JavaScript, maar het vraagt wel een GitHub-account —
en dat hebben de meeste leden niet.

Staat er in `config.js` een `melden.url`, dan hangt `index.js` zich aan die link en opent
hij in de plaats daarvan het venster `#meldvenster` op de kaart zelf. Wat daar verstuurd
wordt, gaat naar een Cloudflare Worker, en die maakt het issue aan:

```
formulier op de kaart  ──POST──▶  Worker  ──GitHub API──▶  issue met label "feedback"
                                  (meldt zich aan als GitHub App,
                                   controleert Turnstile)
```

Het tussenstuk is nodig omdat een statische site geen sleutel voor GitHub kan bewaren
zonder hem aan iedereen te geven. De Worker meldt zich aan als **GitHub App** van de
organisatie: met de privésleutel van de app maakt hij zelf een token aan die een uur
geldig is. Er is dus geen token die verloopt en die iemand moet vernieuwen, en de issues
staan op naam van de app (`…[bot]`), niet van een persoon. Opzetten doe je één keer; dat
staat in [`feedback-worker/README.md`](feedback-worker/README.md). Zonder `melden.url`
verandert er niets en blijft de knop een link.

**Wat de bezoeker te zien krijgt**, in alle drie de talen: bovenaan in een gele kader dat
de melding publiek wordt, en onderaan een verplicht vinkje dat hij dat begrepen heeft en er
geen persoonlijke gegevens in gezet heeft. Het `required`-attribuut doet dat werk; er is
geen scriptcontrole die ernaast kan gaan staan.

**Wat de Worker tegenhoudt:** een `Origin` die niet in `TOEGESTANE_HERKOMST` staat, een
onbekende soort, een beschrijving die te kort of te lang is, een ingevuld lokveld (dat
alleen een robot ziet), en een Turnstile-token dat niet klopt. De tekst van de bezoeker
komt in een **codeblok** in het issue terecht, met een omheining die langer is dan de
langste reeks backticks in die tekst zelf: zo kan er geen @vermelding, afbeelding of link
uit een melding ontsnappen. Er gaat geen IP-adres en geen browsergegeven mee.

**Een mailadres voor een antwoord** (alleen met `melden.antwoordPerMail` in `config.js`):
het enige veld dat niet in het issue komt. De Worker bewaart het in zijn D1-databank,
bij het nummer van het issue, en zet in het issue alleen *Antwoord gevraagd: ja*. De
beheerders zien de adressen op `/beheer` van de Worker. Daar meld je je aan met GitHub, en
binnen mag wie schrijfrechten op de repo heeft. Een nachtelijke taak wist een adres 30
dagen nadat zijn issue gesloten is. Lukt het bewaren niet, dan staat het issue er wel, en
zegt het bedankscherm dat er geen antwoord per mail komt. Alles over de opzet staat in
[`feedback-worker/README.md`](feedback-worker/README.md), stap 5.

**Als het misloopt** — Worker plat, netwerk weg, Turnstile stuk — dan staat in de
foutmelding de link naar GitHub. Dat is de uitweg die altijd blijft werken.

Het venster is `aria-modal`: bij het openen krijgt het kader zelf de focus, zodat een
schermlezer bij de titel en de waarschuwing begint en niet halverwege bij een keuzelijst,
en Tab loopt rond binnen het venster in plaats van de kaart erachter in te stappen. Een
klik naast het venster sluit het **niet**, alleen het kruisje, "Annuleren" en Escape: wie
al een halve tekst getypt heeft, mag die niet kwijtspelen door mis te tikken.

## 13. Iets wijzigen

**Een tekst.** Nooit in de opmaak: zoek de sleutel in `map/taal/nl.js` en pas hem in alle
drie de bestanden aan. Staat er een `{haakje}` in, laat dat staan — de kaart vult het in.

**Een nieuwe taal.** Kopieer `map/taal/nl.js` naar `map/taal/<code>.js`, vertaal, en zet één
`<script>`-regel bij in `index.html`. Verder niets: de keuzelijst, de taaldetectie en de
terugval volgen vanzelf. Een half vertaald bestand breekt niets — ontbrekende sleutels komen
uit het Nederlands.

**Een nieuwe brandstof (of carrosserie, of versnellingsbak) uit de feed.** Niets nodig om
hem te tónen — hij verschijnt vanzelf in het filter. Voor het label: een rij in `waarden` in
`fr.js` en `en.js`. Om hem op `/beheer/kaartfilters` te kunnen verbergen: een rij bij zijn
filter in `OPTIES` in `feedback-worker/instellingen.js`.

**Een nieuwe toebehorenvlag.** De sleutel in `TOEBEHOREN` of `AFSPRAKEN` in `index.js` (dat
verschil gaat over wat er ín de auto zit tegenover wat je met de eigenaar afspreekt), plus
een rij in `vlaggen` in alle drie de taalbestanden. De feed moet de vlag natuurlijk al
dragen: de sleutel in `TOEBEHOREN_SLEUTELS` in `scripts/genereer_gbfs.py` en in het eigen
schema `gbfs/schema/degage_vehicles.json`, plus de koppeling met de bron in de interne
repo. Wil je hem op `/beheer/kaartfilters` kunnen verbergen, zet hem dan ook in `OPTIES` in
`feedback-worker/instellingen.js`.

**Een nieuwe filtergroep.** Vier plekken: een `<div class="keuzes">` met een kop in de
opmaak, een regel in `vulKeuzes()`, een `Set` in `staat`, en een regel in `wagenPast()`.

**Het rijbereik of de OV-score bijwerken.** Draai `scripts/haal_bereik.py` of
`scripts/haal_ov.py` opnieuw, na de generator. De keuzes staan als constanten bovenaan die
scripts — `EEN_GETAL_KM`, `BATTERIJ_MARGE_KWH`, `MODELJAAR_NIEUW` en `MODELJAAR_OUD` voor het bereik, `HALTE_M`,
`HALTE_ZOEK_M` en `TREIN_M` voor het openbaar vervoer — met in de kop van elk script waarom ze zo staan. Een
bereik met de hand zetten kan in `map/bereik.json`, met `"bron": "handmatig"`: dat laat het
script daarna ongemoeid.

**Een bibliotheek opwaarderen.** Versie én SRI-hash, in het `<link>` én in het `<script>`.
Vergeet je de hash, dan laadt de kaart niet meer en staat de reden alleen in de console.

**Iets aan de logica.** Dat staat allemaal in `map/index.js`; de kop van dat bestand zet
op een rij wat waar staat. `index.html` draagt alleen nog structuur en pictogrammen, en
`index.css` alleen nog opmaak.

## 14. Bekende beperkingen

- **`alt` op de markers bereikt de DOM niet.** De markers gebruiken `divIcon`, en Leaflet zet
  `alt` alleen op een `<img>`-pictogram. De beschrijving wordt dus wel opgebouwd en vertaald,
  maar een schermlezer krijgt hem niet te zien; die krijgt de `title` met de autonaam. Een
  grijze pin draagt in die `title` ook waarom elke auto buiten de filters valt
  (`uitgefilterdTitel()`); dat komt dus wél aan. Wie de rest wil oplossen, doet dat in het
  icoon, niet in de tekst.
- **OSM-tegels, OSM France en Nominatim hebben een gebruiksbeleid** voor publieke sites. De
  kaart houdt zich aan de zoekregels, maar bij veel bezoekers kan het tegelverkeer knellen.
  Dan is een andere tegelbron of een eigen Nominatim nodig.
- **De kaart toont geen live beschikbaarheid** en zegt dat ook. De feed kent die informatie
  niet: het aantal in `station_status` is het aantal auto's dát er staat, niet het aantal dat
  nu vrij is.
- **De coördinaten zijn vervaagd.** De generator zet elke standplaats 20 m opzij; zolang `degage_vehicles.json` het veld
  `locatie_nauwkeurigheid_m` draagt, zegt de kaart in elke popup dat de locatie bij
  benadering is. Afstanden in de balk zijn dus tot op tientallen meters juist, niet preciezer.
  Het getal hoort nergens hardgecodeerd te staan — één bron, in de feed.

## 15. Lokaal draaien

De pagina leest de feed, `index.js` en de taalbestanden via relatieve paden, dus
`file://` werkt niet — de browser blokkeert dan het inlezen. Start een webserver in de
root van de repo:

```bash
python -m http.server 8000
```

Dan `http://localhost:8000/map/index.html`. Een andere taal afdwingen:
`http://localhost:8000/map/index.html?taal=fr`.
