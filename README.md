# Deelautokaart van Dégage

Een publieke kaart met de auto's van de Dégage-vloot, gevoed door een **GBFS-feed** —
de internationale standaard voor deelmobiliteit. Twee dingen dus:

1. **De feed** (`gbfs/`) is het strategische stuk. Eenmaal publiek kunnen Way To Go,
   Nazka en andere aggregatoren Dégage zélf opnemen, zonder dat wij per platform een
   embed moeten laten bouwen.
2. **De kaart** (`web/kaart.html`) leest die feed en gaat als iframe op degage.be.

Er is **geen live verbinding met de databank**. De feed beschrijft de toestand van de
laatste dump, en dat staat ook zo op de kaart. Verversen gebeurt per kwartaal, met de
hand.

## Wat waar staat

| pad | waarvoor |
|---|---|
| `web/kaart.html` | de kaartpagina: opmaak en pictogrammen |
| `web/kaart.js` | de logica van de kaart |
| `web/taal/` | de teksten, één bestand per taal (`nl.js`, `fr.js`, `en.js`) |
| `FUNCTIONEEL.md` | wat de kaart doet: wat een bezoeker ziet en kan, en waarom |
| `TECHNIEK.md` | hoe ze gebouwd is: architectuur, uitbreidpunten, beperkingen |
| `web/gbfs.html` | instappagina voor aggregatoren: instapadres, bestanden, wat de feed niet belooft |
| `web/fotos/` | modelfoto's van Wikimedia Commons + `fotos.json` met licentie en auteur |
| `gbfs/` | de gegenereerde feed + de officiële JSON Schemas |
| `scripts/genereer_gbfs.py` | de generator: databank → feed |
| `scripts/carrosserie.json` | handmatige lijst: personenwagen of bestelwagen, per model |
| `scripts/districten.json` | handmatige lijst: contactadres per lokale groep |
| `scripts/haal_stockfotos.py` | haalt één vrij gelicentieerde modelfoto per merk+model |
| `scripts/haal_bereik.py` | zoekt het rijbereik van de elektrische modellen op → `web/bereik.json` |
| `scripts/haal_ov.py` | haalt de Mobiscore op en telt het openbaar vervoer → `web/ov.json` |

**Dit document gaat over het bedienen van het gereedschap** — de feed genereren, foto's
ophalen, hosten. Voor de kaart zelf zijn er twee andere documenten:

- **[`FUNCTIONEEL.md`](FUNCTIONEEL.md)** — wat de kaart doet: wat een bezoeker ziet, wat
  de filters betekenen, waarom er geen beschikbaarheid op staat. Zonder code.
- **[`TECHNIEK.md`](TECHNIEK.md)** — hoe ze gebouwd is: datastroom, de talen, en wat je
  waar moet aanpassen.

> **Een deel van de documentatie is intern en wordt niet publiek gedeeld:** `SCOPE.md`
> (afbakening, datamodel, privacygrenzen), `FEEDSPEC.md` (de volledige veldspecificatie),
> `WERKWIJZE.md` (de kwartaalverversing), `OPENSTAAND.md` en de interne controlescripts.
> Verwijzingen naar `SCOPE.md` en `FEEDSPEC.md` in de code slaan daarop.
>
> **Wie de feed wil gebruiken heeft ze niet nodig.** De feed volgt GBFS v3.0; wat je moet
> weten staat op `web/gbfs.html` en in de officiële
> [GBFS-specificatie](https://github.com/MobilityData/gbfs).

## Voor aggregatoren en partners

Er is een instappagina die alles op een rij zet — het instapadres, elk bestand met zijn
inhoud, en wat de feed uitdrukkelijk *niet* belooft:

```
https://degagemain.github.io/degage-deelautokaart-gbfs/web/gbfs.html
```

Alles op die pagina wordt uit de feed zelf gelezen: de aantallen, de datum en de
bestandsmaten kloppen dus altijd, ook na een verversing. Ze controleert ook of de URL's
die `gbfs.json` adverteert overeenkomen met waar de bestanden werkelijk staan, en
waarschuwt als dat niet zo is — want auto-discovery volgt die URL's.

**Basis-URL in de feed** De feed woont op GitHub Pages; `gbfs.json` adverteert
`https://degagemain.github.io/degage-deelautokaart-gbfs/gbfs/…`. Dat adres vindt de generator
zelf terug uit de git-remote, dus bij een gewone run hoef je niets mee te geven.

Komt er later een eigen domein, zet dat dan in een `CNAME` in de root — dat wint op het
github.io-adres. Voor een eenmalige afwijking:

```bash
python scripts/genereer_gbfs.py --basis-url https://<ander-adres>/gbfs
```

De generator print bij elke run welk adres hij gebruikt en waar het vandaan komt.

## De kaart lokaal bekijken

De pagina leest de feed via relatieve paden, dus ze heeft een webserver nodig — als
`file://` blokkeert de browser het inlezen.

```bash
python -m http.server 8000
```

Dan `http://localhost:8000/web/kaart.html`.

## De feed opnieuw genereren

Vereist de databankreplica; die zit **niet** in deze repo.

```bash
python scripts/genereer_gbfs.py
```

Meer is er niet nodig. De generator zoekt zelf uit waar de replica staat, welke dumpdatum
erbij hoort en wat de publieke basis-URL is, en **print bij elke waarde waar ze vandaan
komt** — zodat in het logboek staat waarop een feed gebouwd is:

```
waar deze run op gebouwd is
  replica        ...\degage-replica\degage.duckdb
                 <- gevonden naast de repo
  dumpdatum      2026-07-31   ->   last_updated 2026-07-31T00:00:00+02:00
                 <- uit `_meta` in de replica (combined_dump_20260731_120246.sql)
```

Wat hij niet kan vinden, vult hij niet in: dan faalt hij en zegt hij wat je mee moet
geven. De dumpdatum komt uit de tabel `_meta` in de replica en nooit van de klok —
zelfde dump in betekent byte-voor-byte dezelfde bestanden uit.

Overrulen kan, maar hoeft niet:

| vlag | in plaats van |
|---|---|
| `--replica <pad>` | `DEGAGE_REPLICA`, anders naast de repo gezocht |
| `--dump-datum <datum>` | de tabel `_meta` in de replica |
| `--basis-url <url>` | `DEGAGE_BASIS_URL`, anders `CNAME` of de git-remote |
| `--uit <map>` | de map `gbfs/` naast het script |
| `--no-interactive` | gebeurt vanzelf zonder terminal |

De generator valideert tegen de officiële GBFS-schema's en draait een privacyscan over
zijn eigen output. **Faalt er iets, dan schrijft hij niets weg** — dat is opzet, geen bug.

Zijn er nieuwe merk/model-combinaties bij gekomen, dan vraagt hij per nieuw model of het
een personenwagen of een bestelwagen is. Zonder terminal — in een geplande run — vraagt
hij niets en faalt hij luid met de ontbrekende modellen erbij.

## Modelfoto's bijwerken

```bash
python scripts/haal_stockfotos.py
```

Staat bewust **buiten** de generator: die moet deterministisch en zonder netwerk draaien.
Alles wat al in `web/fotos/fotos.json` staat wordt overgeslagen zónder netwerkverkeer, dus
een run over een ongewijzigde vloot doet nul verzoeken.

De foto's komen van **Wikimedia Commons**, uitsluitend onder een vrije licentie (CC of
publiek domein). Auteur en licentie staan per foto in `fotos.json` en **de kaart toont ze
bij de foto** — dat is de licentievoorwaarde, net als de OSM-attributie.

Modellen waarvoor niets bruikbaars gevonden wordt, krijgen geen foto: de kaart toont dan
een tekening van een auto. Beter dat dan een foto van de verkeerde auto.

### Een lelijke foto weigeren

Het script zeeft op bestandsnaam, categorie en beeldverhouding, maar smaak kun je niet
programmeren — soms is een foto technisch in orde en gewoon lelijk. Zet dan de
bestandsnaam in de lijst `geweigerd` in `web/fotos/fotos.json`:

```json
"geweigerd": ["File:Toyota Auris Touring Sports Hybrid.JPG"]
```

De volgende run gooit die foto weg en kiest de eerstvolgende kandidaat. Die lijst
**overleeft ook `--opnieuw`**: ze is met de hand gemaakt en wordt nooit weggegooid.

Wil je zelf een foto aanleveren, zet het bestand dan in `web/fotos/` en pas de regel in
`fotos.json` aan (met auteur en licentie erbij). Het script laat bestaande sleutels met
rust, dus die keuze blijft staan.

### Een model dat Commons anders noemt

De vloot noemt een wagen zoals de leden hem kennen, Commons zoals de fabrikant hem noemt.
Meestal is dat hetzelfde, soms niet: de **Mercedes A-150** van 2007 heet op Commons
nergens zo — daar is het een *Mercedes-Benz W169*. Zoeken op "Mercedes A-150" levert dan
een vooroorlogse Grosser Mercedes op, die (terecht) afgekeurd wordt, en de wagen blijft
zonder foto. Daar bestaat geen regel voor: het is geen patroon maar kennis van auto's.

Zet zo'n geval met de hand in `zoek_als` in `web/fotos/fotos.json`:

```json
"zoek_als": { "Mercedes|A-150": "Mercedes-Benz|W169" }
```

Links de sleutel zoals de vloot hem kent, rechts waarop gezocht moet worden. De foto komt
onder de **linkersleutel** in het manifest terecht, want daarmee vraagt de kaart hem op.
Ook deze lijst **overleeft `--opnieuw`**. Een sleutel die hier in staat, staat nooit in
`niet_gevonden`: je voegt zo'n regel juist toe voor een wagen die eerder niets opleverde.

## Rijbereik en openbaar vervoer bijwerken

```bash
python scripts/haal_bereik.py
python scripts/haal_ov.py
```

Allebei **ná** `genereer_gbfs.py`, want ze lezen uit de feed. Net als het fotoscript staan
ze buiten de generator: ze hebben netwerk nodig.

**`haal_ov.py` moet na elke nieuwe feed opnieuw draaien.** `web/ov.json` draagt de datum
van de feed waarvoor het berekend is, en de kaart toont het alleen als die klopt — anders
zou een verhuisde standplaats de bereikbaarheid van haar oude adres dragen. De eerste run
haalt de dienstregelingen van De Lijn (±210 MB) en de NMBS (±9 MB) binnen, in
`~/.cache/degage-gtfs/` — buiten de repo. Die worden een week hergebruikt; `--vernieuw`
haalt ze toch opnieuw.

**`haal_bereik.py`** is alleen nodig als er elektrische modellen bij komen. Het zegt welke
het niet vindt. Weet je het bereik van zo'n model wel, zet het dan in `web/bereik.json` met
`"bron": "handmatig"` — het script laat die regels daarna met rust.

Wat de cijfers betekenen en welke keuzes erachter zitten, staat in `FUNCTIONEEL.md` en in de
kop van elk script.

### Naamsvermelding

- **Open EV Data** ([github.com/KilowattApp/open-ev-data](https://github.com/KilowattApp/open-ev-data))
  levert de gegevens voor het rijbereik, onder de MIT-licentie met verplichte
  naamsvermelding. De kaart noemt de bron in elke popup met een bereik.
- **Mobiscore** — Departement Omgeving, Vlaamse overheid, laag `ni:ni_mobiscore_ha` op
  Mercator, onder de Modellicentie Gratis Hergebruik. De kaart noemt de bron onder elk
  Mobiscore-blok.
- **De Lijn** en de **NMBS** leveren de dienstregelingen, via
  [data.gtfs.be](https://data.gtfs.be) en [gtfs.irail.be](https://gtfs.irail.be). De kaart
  noemt ze onder elk OV-blok.

## Contactadressen per groep
`scripts/districten.json` koppelt elke lokale Dégage-groep aan een contactadres. De adressen zijn al ingevuld voor zover ze bekend zijn. **Een ontbrekend adres betekent gewoon dat de kaart er geen toont.**

Alleen adressen op @degage.be worden aanvaard. Een persoonlijk adres zorgt ervoor dat de generator faalt.

## Hosting

Gehost op GitHub Pages. Alleen `web/` en `gbfs/` hoeven gehost te worden; de scripts
staan erbij omdat ze bij het project horen, niet omdat ze publiek uitgevoerd worden.

**`web/kaart.js` en `web/taal/` horen er altijd bij.** De pagina laadt ze met gewone
scripttags. Ontbreekt `kaart.js`, dan blijft er een lege kaart over; ontbreken de
taalbestanden, dan werkt de kaart wel maar blijven de teksten uit het script onvertaald —
en dan zet ze een waarschuwing in beeld.

**De iframe heeft `allow="geolocation"` nodig.** Zonder dat attribuut weigert de browser
de knop "Auto's in mijn buurt", ook als de bezoeker toestemming geeft:

```html
<iframe src="https://<adres>/web/kaart.html" allow="geolocation"
        style="width:100%;height:640px;border:0" title="Deelautokaart van Dégage"></iframe>
```

**De databankreplica hoort hier nooit in.** Zie `.gitignore` — die sluit `*.duckdb`,
dumps en archieven uit. Eenmaal gecommit blijft zo'n bestand in de git-historie staan,
ook na verwijderen.
