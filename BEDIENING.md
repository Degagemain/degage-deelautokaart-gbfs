# Bediening

Hoe je het gereedschap bedient: de feed en de kaart bijwerken, publiceren en hosten.
Wat het project is en hoe de onderdelen in elkaar haken, staat in de [README](README.md).
Wat de kaart doet, staat in [`FUNCTIONEEL.md`](FUNCTIONEEL.md), hoe ze gebouwd is in
[`TECHNIEK.md`](TECHNIEK.md).

## Bijwerken: alles in één keer

**Dit is het hele verhaal. Eén opdracht, en de kaart is bij.**

```
py scripts/bijwerken.py
```

Op Windows hoef je daar zelfs geen venster voor te openen: **dubbelklik op `BIJWERKEN.bat`**
in deze map. Dat doet precies hetzelfde en houdt het venster daarna open, zodat je kunt lezen
wat er gebeurd is.

### Wat je vooraf nodig hebt

1. **Python.** Staat het er niet, dan zegt `BIJWERKEN.bat` dat en waar je het haalt. Vink bij
   het installeren *"Add python.exe to PATH"* aan.
2. **Twee modules**, eenmalig te installeren:

   ```
   py -m pip install duckdb jsonschema
   ```

3. **De databankreplica** — het bestand `degage.duckdb`. Dat zit **niet** in deze map en
   hoort daar ook nooit in te komen: er staan persoonsgegevens in. Pak de laatste
   replica-zip uit in een map `degage-replica` **naast** deze map:

   ```
   ...\Degage\degage-replica\degage.duckdb          <- de replica
   ...\Degage\degage-deelautokaart-gbfs\            <- deze map
   ```

   Staat ze ergens anders, geef het pad dan mee:
   `py scripts/bijwerken.py --replica <pad naar degage.duckdb>`

4. **De interne repo** `degage-deelautokaart-gbfs-private`, **naast** deze map. Daarin staat
   het script dat de replica leest; zie [De feed](#de-feed--genereer_gbfspy).

   ```
   ...\Degage\degage-deelautokaart-gbfs-private\  <- de interne repo
   ```

Het script kijkt dit allemaal na **vóór** het begint, en zegt in gewone taal wat er
ontbreekt en hoe je het oplost. Klopt er iets niet, dan draait er niets en verandert er
niets.

### Wat er dan gebeurt

Vier stappen, in deze volgorde, samen ongeveer een minuut:

| | wat | waarvandaan | resultaat |
|---|---|---|---|
| 1 | de feed | de databankreplica | `gbfs/` |
| 2 | de modelfoto's | Wikimedia Commons | `map/fotos/` |
| 3 | het rijbereik | Open EV Data | `map/bereik.json` |
| 4 | openbaar vervoer en Mobiscore | De Lijn, NMBS, Mercator | `map/ov.json` |

De volgorde ligt vast en dáárom bestaat dit script: stap 2 tot 4 lezen uit de feed die stap 1
schrijft. `map/ov.json` draagt zelfs de datum van die feed, en de kaart toont die gegevens
alleen als ze klopt — vergeet je stap 4, dan verdwijnt het OV-blok uit alle popups. Met één
opdracht kan dat niet meer misgaan.

Je hoeft niets te beslissen onderweg. Eén uitzondering: zit er een **auto van een merk of
model dat er nog nooit was** bij, dan vraagt stap 1 of dat een personenwagen of een
bestelwagen is. Dat kan de databank niet beantwoorden. Typ het antwoord en het script gaat
verder; het onthoudt het voorgoed in `scripts/carrosserie.json`.

Aan het eind staat er wat er veranderd is. **Geen enkel bestand veranderd is geen fout:**
dezelfde dump erin betekent byte-voor-byte dezelfde feed eruit.

### Als er iets misgaat

Het script **stopt meteen** bij het eerste probleem en draait de volgende stappen niet — met
een half resultaat verder gaan levert een kaart op die niet klopt. Onderaan staat wat er
misging en wat je eraan kunt doen.

Er raakt daarbij niets stuk. Faalt de feedcontrole of de privacyscan, dan wordt er **niets**
weggeschreven en blijft de vorige feed ongeschonden staan. Dat is opzet, geen bug.

Los het op en start gewoon opnieuw. Wat al gelukt was, is meestal in een oogwenk over; alleen
wat nog moet:

```
py scripts/bijwerken.py --alleen fotos,bereik,ov
```

### Nakijken en publiceren

Vóór het online gaat, kijk je even naar de kaart zelf:

```
py -m http.server 8000
```

Open dan <http://localhost:8000/map/>. Staan de auto's op de kaart, opent er een
popup als je erop klikt, werken de filters en de taalwissel (`?taal=nl`, `?taal=fr`,
`?taal=en`)? Dan is het goed.

Daarna vraagt het script of het mag publiceren. **Het doet dat nooit uit zichzelf** — pas als
je `ja` typt. Het legt alleen de bijgewerkte gegevens vast (`gbfs/`, `map/fotos/`,
`map/bereik.json`, `map/ov.json`, `scripts/carrosserie.json`) en laat werk aan de kaart zelf
met rust. Wat er precies online gaat, staat op je scherm voor je antwoordt.

Heb je "nee" geantwoord en wil je het later alsnog:

```
py scripts/bijwerken.py --alleen-publiceren
```

Een paar minuten later staat het op GitHub Pages. Controleer dan nog de feed op
[gbfs-validator.mobilitydata.org](https://gbfs-validator.mobilitydata.org) — elke fout én
elke waarschuwing hoort opgelost te worden.

### De vlaggen

Je hebt ze zelden nodig; zonder vlaggen doet het script wat nodig is.

| vlag | waarvoor |
|---|---|
| `--alleen feed,fotos,bereik,ov` | draai alleen deze stappen |
| `--alleen-publiceren` | werk niets bij, zet alleen online wat al klaar staat |
| `--replica <pad>` | een replica die ergens anders staat |
| `--dump-datum <datum>` | een replica zonder `_meta`-tabel |
| `--basis-url <url>` | een ander adres dan `CNAME` of de git-remote |
| `--opnieuw-fotos` | ⚠ **af te raden**: gooit alle met de hand gekozen modelfoto's weg en zoekt ze opnieuw zonder bouwjaar — zie [De juiste generatie](#de-juiste-generatie). Vraagt eerst bevestiging |
| `--vernieuw-ov` | haal de dienstregelingen opnieuw op in plaats van uit de cache |
| `--publiceer` | publiceer na afloop zonder het te vragen |
| `--niet-publiceren` | vraag achteraf niets over publiceren |
| `--no-interactive` | vraag niets, aan niemand; faal luid in plaats van te vragen |

Verderop staat per onderdeel wat het doet en wat je eraan kunt bijstellen — een lelijke foto
weigeren, een bereik met de hand invullen. Voor een gewone verversing hoef je dat niet te
lezen.

## Basis-URL in de feed

De feed woont op GitHub Pages; `gbfs.json` adverteert
`https://degagemain.github.io/degage-deelautokaart-gbfs/gbfs/…`. Dat adres vindt de generator
zelf terug uit de git-remote, dus bij een gewone run hoef je niets mee te geven.

Komt er later een eigen domein, zet dat dan in een `CNAME` in de root — dat wint op het
github.io-adres. Voor een eenmalige afwijking:

```bash
py scripts/bijwerken.py --alleen feed --basis-url https://<ander-adres>/gbfs
```

De generator print bij elke run welk adres hij gebruikt en waar het vandaan komt.

## De kaart lokaal bekijken

```bash
py -m http.server 8000
```

Dan `http://localhost:8000/map/`. Een webserver is nodig omdat de pagina de feed
via relatieve paden leest — als `file://` blokkeert de browser dat.

## De beheerpagina

**<https://degage-kaart-feedback.degage.workers.dev/beheer>**

Je meldt je aan met je GitHub-account. Binnen mag wie schrijfrechten heeft op deze repo;
voor de anderen blijft de pagina dicht. Toegang geven doe je dus op GitHub, onder
*Settings → Collaborators*, niet op de pagina zelf. Het adres is geen geheim: de aanmelding
beschermt de pagina. Na acht uur meld je je opnieuw aan.

- **Meldingen** — alles wat op de kaart gemeld werd, met een link naar het issue op GitHub.
  Wie een mailadres achterliet, krijgt het label *antwoord gewenst*; een klik op het adres
  opent een mail met het issuenummer als onderwerp. Dat adres staat alleen hier, nooit op
  GitHub, en verdwijnt vanzelf dertig dagen nadat het issue gesloten is. Wissen kan ook
  meteen.
- **Filters op de kaart** — welke filters bezoekers zien, en per filter welke keuzes. Een
  toebehoren dat uit staat (zoals *bed*), verdwijnt ook uit de popup. Een wijziging is
  binnen een minuut op de kaart te zien.

Hoe je de pagina opzet, staat in [`feedback-worker/README.md`](feedback-worker/README.md).

---

# De onderdelen apart

Hieronder staat per script wat het doet en wat je eraan kunt bijstellen. **Voor een gewone
verversing hoef je dit niet te lezen** — `py scripts/bijwerken.py` doet alles hierboven al in
de juiste volgorde. Dit is er voor wie iets met de hand wil aanpassen, of wil weten waarom
iets gaat zoals het gaat.

## De feed — `genereer_gbfs.py`

De feed wordt in twee helften gebouwd:

- **`scripts/genereer_gbfs.py`** (deze repo) is de **bouwer**. Hij kent de databank niet:
  hij neemt een lijst wagens in een vast, neutraal formaat (zie `INVOERVELDEN` bovenaan het
  script) en maakt daar de zes bestanden van. Normaliseren, vervagen, stations vormen,
  valideren en de privacyscan gebeuren hier.
- **`scripts/lees_replica.py`** in de interne repo leest de wagens uit de databankreplica,
  zet ze om naar dat formaat en roept de bouwer aan. `bijwerken.py` start dat script
  vanzelf als de interne repo naast deze map staat.

De gewone manier is dus gewoon:

```bash
py scripts/bijwerken.py --alleen feed
```

Wie de interne repo niet heeft, kan de bouwer proberen op het verzonnen voorbeeld:

```bash
py scripts/genereer_gbfs.py --invoer scripts/voorbeeld_vloot.json --uit voorbeeld-uit
```

`--uit` is daar verplicht, zodat een proefrun de echte feed in `gbfs/` nooit overschrijft.

De generator zoekt zelf uit welke datum erbij hoort en wat de publieke basis-URL is, en
**print bij elke waarde waar ze vandaan komt** — zodat in het logboek staat waarop een feed
gebouwd is. Wat hij niet kan vinden, vult hij niet in: dan faalt hij en zegt hij wat je mee
moet geven. De datum komt uit de gegevens en nooit van de klok — zelfde invoer betekent
byte-voor-byte dezelfde bestanden.

Overrulen kan, maar hoeft niet. Al deze vlaggen kun je ook aan `bijwerken.py` meegeven:

| vlag | in plaats van |
|---|---|
| `--replica <pad>` | `DEGAGE_REPLICA`, anders naast de repo gezocht |
| `--dump-datum <datum>` | de datum die in de replica staat |
| `--basis-url <url>` | `DEGAGE_BASIS_URL`, anders `CNAME` of de git-remote |
| `--no-interactive` | gebeurt vanzelf zonder terminal |

De generator valideert tegen de officiële GBFS-schema's en draait een privacyscan over
zijn eigen output. **Faalt er iets, dan schrijft hij niets weg** — dat is opzet, geen bug.

Zijn er nieuwe merk/model-combinaties bij gekomen, dan vraagt hij per nieuw model of het
een personenwagen of een bestelwagen is. Zonder terminal — in een geplande run — vraagt
hij niets en faalt hij luid met de ontbrekende modellen erbij.

**Het `station_id`** is een korte hash van het vervaagde punt (`station_id()` in de bouwer),
twaalf letters na `st-`. Het zegt dus niets wat niet al in de feed staat; een nummer van
een auto staat nergens in de feed.

## Modelfoto's — `haal_stockfotos.py`

```bash
py scripts/haal_stockfotos.py
```

Staat bewust **buiten** de generator: die moet deterministisch en zonder netwerk draaien.
Alles wat al in `map/fotos/fotos.json` staat wordt overgeslagen zónder netwerkverkeer, dus
een run over een ongewijzigde vloot doet nul verzoeken.

De foto's komen van **Wikimedia Commons**, uitsluitend onder een vrije licentie (CC of
publiek domein). Auteur en licentie staan per foto in `fotos.json` en **de kaart toont ze
bij de foto** — dat is de licentievoorwaarde, net als de OSM-attributie.

Modellen waarvoor niets bruikbaars gevonden wordt, krijgen geen foto: de kaart toont dan
een tekening van een auto. Beter dat dan een foto van de verkeerde auto.

### Een lelijke foto weigeren

Het script zeeft op bestandsnaam, categorie en beeldverhouding, maar smaak kun je niet
programmeren — soms is een foto technisch in orde en gewoon lelijk. Zet dan de
bestandsnaam in de lijst `geweigerd` in `map/fotos/fotos.json`:

```json
"geweigerd": ["File:Toyota Auris Touring Sports Hybrid.JPG"]
```

De volgende run gooit die foto weg en kiest de eerstvolgende kandidaat. Die lijst
**overleeft ook `--opnieuw`**: ze is met de hand gemaakt en wordt nooit weggegooid.

Wil je zelf een foto aanleveren, zet het bestand dan in `map/fotos/` en pas de regel in
`fotos.json` aan (met auteur en licentie erbij). Het script laat bestaande sleutels met
rust, dus die keuze blijft staan.

### De juiste generatie

Het script zoekt op merk en model, niet op bouwjaar. Het vond dus vaak het goede model in
de verkeerde generatie: een Corolla uit 1969 bij wagens van 2020, een Tiguan III bij wagens
van 2014. Op 28-09-2026 zijn alle foto's daarom met de hand nagekeken tegen het bouwjaar
van de wagens die ze gebruiken, en 133 foto's vervangen door een foto uit de Commons-
categorie van de juiste generatie. Die categorie staat per foto in `gezocht_op`
(bijvoorbeeld `Toyota Corolla (E210) hatchback`). Draagt een sleutel wagens van
verschillende generaties ("Volkswagen|Polo" van 2007 tot 2023), dan kreeg hij de generatie
van de meerderheid.

De 108 foto's die eruit gingen, staan in `geweigerd`. **Gebruik `--opnieuw-fotos` dus
liever niet:** het zoekt élke foto opnieuw op merk en model, en dan kan een verkeerde
generatie terugkomen, alleen niet meer dezelfde foto. Het script zegt dat ook en vraagt
eerst of je het zeker weet (typ `ja`); antwoord je iets anders, dan draait het gewoon
zonder `--opnieuw` verder. Zonder terminal weigert het, tenzij je er `--ja` bij zet.

Eén foto vervangen kan zonder `--opnieuw`: zet hem in `geweigerd` (zie hierboven), en
alleen die ene wordt opnieuw gezocht. Komt er een nieuw model bij, kijk zijn foto dan
even na tegen het bouwjaar.

### Een model dat Commons anders noemt

De vloot noemt een wagen zoals de leden hem kennen, Commons zoals de fabrikant hem noemt.
Meestal is dat hetzelfde, soms niet: de **Mercedes A-150** van 2007 heet op Commons
nergens zo — daar is het een *Mercedes-Benz W169*. Zoeken op "Mercedes A-150" levert dan
een vooroorlogse Grosser Mercedes op, die (terecht) afgekeurd wordt, en de wagen blijft
zonder foto. Daar bestaat geen regel voor: het is geen patroon maar kennis van auto's.

Zet zo'n geval met de hand in `zoek_als` in `map/fotos/fotos.json`:

```json
"zoek_als": { "Mercedes|A-150": "Mercedes-Benz|W169" }
```

Links de sleutel zoals de vloot hem kent, rechts waarop gezocht moet worden. De foto komt
onder de **linkersleutel** in het manifest terecht, want daarmee vraagt de kaart hem op.
Ook deze lijst **overleeft `--opnieuw`**. Een sleutel die hier in staat, staat nooit in
`niet_gevonden`: je voegt zo'n regel juist toe voor een wagen die eerder niets opleverde.

## Rijbereik en openbaar vervoer — `haal_bereik.py`, `haal_ov.py`

```bash
py scripts/haal_bereik.py
py scripts/haal_ov.py
```

Allebei **ná** `genereer_gbfs.py`, want ze lezen uit de feed — `bijwerken.py` regelt dat. Net als het fotoscript staan
ze buiten de generator: ze hebben netwerk nodig.

**`haal_ov.py` moet na elke nieuwe feed opnieuw draaien.** `map/ov.json` draagt de datum
van de feed waarvoor het berekend is, en de kaart toont het alleen als die klopt — anders
zou een verhuisde standplaats de bereikbaarheid van haar oude adres dragen. De eerste run
haalt de dienstregelingen van De Lijn (±210 MB) en de NMBS (±9 MB) binnen, in
`~/.cache/degage-gtfs/` — buiten de repo. Die worden een week hergebruikt; `--vernieuw`
haalt ze toch opnieuw.

**`haal_bereik.py`** is alleen nodig als er elektrische modellen bij komen. Het zegt welke
het niet vindt. Weet je het bereik van zo'n model wel, zet het dan in `map/bereik.json` met
`"bron": "handmatig"` — het script laat die regels daarna met rust. Dat werkt ook om een
schatting te **overschrijven**: kent Open EV Data voor een bouwjaar meerdere batterijversies,
dan komt er een brede marge uit, en weet je welke versie in de vloot zit, dan is één
handmatige regel nauwkeuriger.

De sleutel is `merk|model|bouwjaar`, of `merk|model` voor een regel die voor elk bouwjaar
geldt. **Per wagen kan niet** — een handmatige regel geldt voor élke wagen van dat model en
bouwjaar. De kaart schrijft zo'n bereik ook niet toe aan Open EV Data maar aan Dégage zelf
(`popup.bereikUitlegHandmatig` in `map/taal/`); een onterechte naamsvermelding is even fout
als een ontbrekende.

Wat de cijfers betekenen en welke keuzes erachter zitten, staat in `FUNCTIONEEL.md` en in de
kop van elk script.

### Naamsvermelding

Elke bron die de kaart gebruikt, en hoe ze vermeld wordt, staat in de
[README](README.md#naamsvermelding). Komt er een bron bij of gaat er een weg, pas dat
dan daar aan.

## Contactadressen per groep
`scripts/districten.json` koppelt elke lokale Dégage-groep aan een contactadres. De adressen zijn al ingevuld voor zover ze bekend zijn. **Een ontbrekend adres betekent gewoon dat de kaart er geen toont.**

Alleen adressen op @degage.be worden aanvaard. Een persoonlijk adres zorgt ervoor dat de generator faalt.

---

# Hosting

Gehost op GitHub Pages. Alleen `map/`, `gbfs/` en de twee `favicon`-bestanden in de root
hoeven gehost te worden; de scripts staan erbij omdat ze bij het project horen, niet omdat
ze publiek uitgevoerd worden.

**`map/index.js` en `map/taal/` horen er altijd bij.** De pagina laadt ze met gewone
scripttags. Ontbreekt `index.js`, dan blijft er een lege kaart over; ontbreken de
taalbestanden, dan werkt de kaart wel maar blijven de teksten uit het script onvertaald —
en dan zet ze een waarschuwing in beeld.

**De iframe heeft `allow="geolocation"` nodig.** Zonder dat attribuut weigert de browser
de knop "Auto's in mijn buurt", ook als de bezoeker toestemming geeft:

```html
<iframe src="https://<adres>/map/" allow="geolocation"
        style="width:100%;height:640px;border:0" title="Deelautokaart van Dégage"></iframe>
```

**De databankreplica hoort hier nooit in.** Zie `.gitignore` — die sluit `*.duckdb`,
dumps en archieven uit. Eenmaal gecommit blijft zo'n bestand in de git-historie staan,
ook na verwijderen.
