# Deelautokaart van Dégage

Een publieke kaart met de auto's van de Dégage-vloot, gevoed door een **GBFS-feed** —
de internationale standaard voor deelmobiliteit. Twee dingen dus:

1. **De feed** (`gbfs/`) is het strategische stuk. Eenmaal publiek kunnen Way To Go,
   Nazka en andere aggregatoren Dégage zélf opnemen, zonder dat wij per platform een
   embed moeten laten bouwen.
2. **De kaart** (`map/`) leest die feed en gaat als iframe op degage.be.

Alles is statisch en staat op GitHub Pages. Het enige stuk dat op een server draait, is een
kleine Cloudflare Worker achter het meldformulier.

**De feed bijwerken?** Dubbelklik op `BIJWERKEN.bat`, of `py scripts/bijwerken.py`. Wat je
vooraf nodig hebt en wat er gebeurt, staat in [`BEDIENING.md`](BEDIENING.md).

## De onderdelen

**1. De bouwer — `scripts/`, één keer per kwartaal, met de hand.**
`bijwerken.py` (of `BIJWERKEN.bat`) draait vier stappen in een vaste volgorde:
`genereer_gbfs.py` maakt van de databankreplica (gelezen via de interne repo) de feed in
`gbfs/`, met elke standplaats 20 m vervaagd. Daarna halen `haal_stockfotos.py`,
`haal_bereik.py` en `haal_ov.py` de modelfoto's, het rijbereik en het openbaar vervoer op,
in `map/fotos/`, `map/bereik.json` en `map/ov.json`. Die drie lezen uit de feed, vandaar de
vaste volgorde. Publiceren gebeurt pas als je "ja" typt.

**2. De feed — `gbfs/`.** Standaard GBFS v3.0 voor partners, plus `degage_vehicles.json`:
de Dégage-uitbreiding met de details per auto (merk, model, brandstof, toebehoren...). Er
is **geen live verbinding met de databank**: de feed beschrijft de laatste dump.

**3. De kaart — `map/`.** Geen bouwstap: `index.html`, `index.css`, `index.js` en de
taalbestanden in `map/taal/`, met Leaflet ernaast. Bij het openen haalt ze alles tegelijk
op: de feed, de drie verrijkingen, en de **live vloot** van
[`degapp.be/api/v1/car/stands`](https://degapp.be/api/v1/car/stands). Die lijst is de baas
over welke auto's er zijn en waar ze staan; de feed levert alleen nog de details:

- staat een auto daar niet in, dan verdwijnt hij van de kaart — ook als hij nog in de feed staat;
- staat hij er wel in maar niet in de feed, dan komt hij erop als **"Nieuwe auto"**, met
  alleen wat die lijst weet (naam, brandstof, versnellingsbak);
- is een auto verhuisd, dan staat hij op zijn nieuwe plek, vervaagd zoals alle andere.

De GBFS-feed voor aggregatoren verandert daar niet door.

**4. De Worker — `feedback-worker/`, op Cloudflare.** Een statische site kan geen sleutel
voor GitHub bewaren, vandaar dit tussenstuk:

- `POST /api/melding` — een melding uit het formulier op de kaart wordt, na een Turnstile-controle, een
  publiek issue op GitHub. De Worker meldt zich aan als GitHub App, dus de melder heeft geen
  GitHub-account nodig.
- Een mailadres voor een antwoord komt níet in het issue maar in een D1-databank. Een
  nachtelijke taak wist het 30 dagen nadat het issue gesloten is.
- `/beheer` — de beheerders zien die adressen en zetten filters op de kaart aan of uit.
  Aanmelden met GitHub; binnen mag wie schrijfrechten op de repo heeft.
- `GET /instellingen` — welke filters de kaart toont.

**5. De koppeling — `map/config.js`.** Hier staat waar de kaart de Worker vindt
(`melden.url`, `instellingen.url`). Leeg betekent: de meldknop blijft een gewone link naar
het issueformulier op GitHub (`.github/ISSUE_TEMPLATE/`, in drie talen).

```
databankreplica ─▶ scripts/ ─▶ gbfs/ + map/{fotos,bereik.json,ov.json} ─▶ GitHub Pages
                                        │
degapp.be (live vloot) ────────────────▶ kaart (map/) ◀── GET /instellingen ──┐
                                        │                                     │
                                        └── melding ─▶ Worker ─▶ GitHub-issue  │
                                                         └─▶ D1 ◀── /beheer ───┘
```

### Waar het aan elkaar hangt

- **`verschuif()` en `station_id()` bestaan twee keer**: in `scripts/genereer_gbfs.py` en als
  kopie in `map/index.js`, voor de auto's uit de live vloot. Wijzig je de ene, wijzig dan de andere.
- **`map/ov.json` draagt de datum van de feed** waarvoor het berekend is. Klopt die niet,
  dan laat de kaart het OV-blok weg — daarom draait `bijwerken.py` alles in één keer.
- **Elke storing valt terug op iets dat werkt.** Antwoordt de live vloot niet, dan toont de
  kaart de feed. Is de Worker plat, dan krijgt de melder de link naar GitHub. Antwoordt
  `/instellingen` niet, dan staan alle filters er.

## Wat waar staat

| pad | waarvoor |
|---|---|
| `map/index.html` | de kaartpagina: structuur en pictogrammen |
| `map/index.css` | de opmaak van de kaart |
| `map/index.js` | de logica van de kaart |
| `map/taal/` | de teksten, één bestand per taal (`nl.js`, `fr.js`, `en.js`) |
| `map/config.js` | instellingen zonder code: waar de kaart de Worker vindt |
| `map/fotos/` | modelfoto's van Wikimedia Commons + `fotos.json` met licentie en auteur |
| `feedback-worker/` | het tussenstuk dat een melding van de kaart als issue op GitHub zet, zodat je er geen GitHub-account voor nodig hebt; bewaart ook, apart en niet publiek, het mailadres van wie een antwoord wil (beheerpagina `/beheer`) |
| `.github/ISSUE_TEMPLATE/feedback-{nl,fr,en}.yml` | hetzelfde formulier op GitHub zelf, één per taal, voor wie er wél een account heeft |
| `gbfs/` | de gegenereerde feed + de officiële JSON Schemas |
| `gbfs/index.html` | instappagina voor aggregatoren: instapadres, bestanden, wat de feed niet belooft |
| `index.html` | doorverwijzing: de root naar de kaart |
| `favicon.png`, `favicon-32.png` | het pictogram in het tabblad, op alle drie de pagina's (512 px en 32 px) |
| `BIJWERKEN.bat` | **dubbelklik hierop om alles bij te werken** (Windows) |
| `scripts/bijwerken.py` | hetzelfde, vanaf de opdrachtregel: roept de vier scripts hieronder in de juiste volgorde aan |
| `scripts/genereer_gbfs.py` | de bouwer: lijst wagens → feed (het inlezen van de databank gebeurt in de interne repo) |
| `scripts/voorbeeld_vloot.json` | een verzonnen vloot om de bouwer zonder databank te proberen |
| `scripts/carrosserie.json` | handmatige lijst: personenwagen of bestelwagen, per model |
| `scripts/districten.json` | handmatige lijst: contactadres per lokale groep |
| `scripts/haal_stockfotos.py` | haalt één vrij gelicentieerde modelfoto per merk+model |
| `scripts/haal_bereik.py` | zoekt het rijbereik van de elektrische modellen op → `map/bereik.json` |
| `scripts/haal_ov.py` | haalt de Mobiscore op en telt het openbaar vervoer → `map/ov.json` |

## Documentatie

| document | beantwoordt |
|---|---|
| [`BEDIENING.md`](BEDIENING.md) | **hoe bedien ik het gereedschap** — bijwerken, publiceren, hosten, per script wat je kunt bijstellen |
| [`FUNCTIONEEL.md`](FUNCTIONEEL.md) | **wat doet de kaart** — wat een bezoeker ziet en kan, en waarom. Zonder code |
| [`TECHNIEK.md`](TECHNIEK.md) | **hoe zit de kaart in elkaar** — datastroom, de talen, wat je waar moet aanpassen |
| [`feedback-worker/README.md`](feedback-worker/README.md) | **het meldformulier en de beheerpagina** — de Worker opzetten en instellen |

> **Een deel van de documentatie is intern en wordt niet publiek gedeeld:** `SCOPE.md`
> (afbakening, datamodel, privacygrenzen), `FEEDSPEC.md` (de volledige veldspecificatie),
> `WERKWIJZE.md` (de kwartaalverversing), `OPENSTAAND.md` en de interne controlescripts.
> Verwijzingen naar `SCOPE.md` en `FEEDSPEC.md` in de code slaan daarop.
> Interne notities die niet in deze repo horen, staan in de map
> `degage-deelautokaart-gbfs-private` naast deze map; "de interne notities" in de code en
> in `TECHNIEK.md` slaan daarop.

## Voor aggregatoren en partners

**Wie de feed wil gebruiken, heeft de documentatie hierboven niet nodig.** De feed volgt
GBFS v3.0; alles wat je moet weten staat op de instappagina en in de officiële
[GBFS-specificatie](https://github.com/MobilityData/gbfs):

```
https://degagemain.github.io/degage-deelautokaart-gbfs/gbfs/
```

Dat is precies het adres dat een partner overhoudt als hij het instapadres
(`…/gbfs/gbfs.json`) afkapt. Wie daar belandt, krijgt dus de uitleg in plaats van een 404.

Alles op die pagina wordt uit de feed zelf gelezen: de aantallen, de datum en de
bestandsmaten kloppen dus altijd, ook na een verversing. Ze controleert ook of de URL's
die `gbfs.json` adverteert overeenkomen met waar de bestanden werkelijk staan, en
waarschuwt als dat niet zo is — want auto-discovery volgt die URL's.

De kaart zelf inbedden: zie [Hosting](BEDIENING.md#hosting) — de iframe heeft
`allow="geolocation"` nodig.

---

## Naamsvermelding

- **OpenStreetMap** levert de kaarttegels en het zoeken op adres (Nominatim). De attributie
  staat op de kaart zelf; ze is een licentievoorwaarde.
- **Wikimedia Commons** levert de modelfoto's, elk onder een vrije licentie (CC of publiek
  domein). Auteur en licentie staan per foto in `map/fotos/fotos.json`, en de kaart toont ze
  bij de foto.
- **Open EV Data** ([github.com/KilowattApp/open-ev-data](https://github.com/KilowattApp/open-ev-data))
  levert de gegevens voor het rijbereik, onder de MIT-licentie met verplichte
  naamsvermelding. De kaart noemt de bron in elke popup met een bereik — behalve bij een
  handmatig ingevuld bereik, want dat komt daar niet vandaan.
- **Mobiscore** — Departement Omgeving, Vlaamse overheid, laag `ni:ni_mobiscore_ha` op
  Mercator, onder de Modellicentie Gratis Hergebruik. De kaart noemt de bron onder elk
  Mobiscore-blok.
- **De Lijn** en de **NMBS** leveren de dienstregelingen, via
  [data.gtfs.be](https://data.gtfs.be) en [gtfs.irail.be](https://gtfs.irail.be). De kaart
  noemt ze onder elk OV-blok.
- **Flaticon** levert het pictogram in het tabblad (`favicon.png`), onder de gratis
  licentie met verplichte naamsvermelding: *Car sharing icons created by afif fudin –
  Flaticon*. Die staat in de voettekst van `gbfs/index.html` en in het instellingenpaneel van
  de kaart, met de opgegeven formulering en link. **Vervang je het pictogram, haal die regel
  dan ook weg** — en omgekeerd.

  Het figuur is bewerkt, wat de licentie toestaat: het origineel is zwart op een
  doorzichtige achtergrond en verdwijnt daarmee in een donker tabblad. Hier staat het in
  wit op een afgeronde tegel in `--groen-diep` (`#235348`, dezelfde kleur als in
  `map/index.css`), op 72 % van de zijde. Zo houdt het stand op een lichte én een donkere
  achtergrond. Moet het opnieuw gemaakt worden, dan is dat de hele ingreep: het alfakanaal
  van het bronbestand als masker, wit ingekleurd, op die tegel gezet.

## Licentie

De **code** in deze repo — de kaart, de scripts en de instappagina — valt onder de
[GNU General Public License, versie 3](LICENSE) (GPL-3.0).

De **feed** in `gbfs/` is data, geen code, en valt onder
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), zoals `license_url` in
`system_information.json` zegt. De modelfoto's in `map/fotos/` houden elk hun eigen vrije
licentie; auteur en licentie staan per foto in `fotos.json`.
