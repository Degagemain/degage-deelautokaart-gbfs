# Het meldformulier: van de kaart naar GitHub

De knop **Probleem melden** op de kaart opent een formulier. Wat iemand daar invult, komt
als **openbaar issue** in deze repository terecht — ook als die persoon geen
GitHub-account heeft. Het formulier zegt dat uitdrukkelijk, en wie het invult, moet dat
aanvinken voor het verstuurd kan worden.

```
kaart (formulier)  ──POST──▶  Cloudflare Worker  ──GitHub API──▶  issue met label "feedback"
                               (meldt zich aan als GitHub App,
                                controleert Turnstile)
                                      │
                                      └──▶  D1-databank: het mailadres, als de melder
                                            een antwoord wil  ◀──  /beheer (beheerders)
```

Een statische site kan geen sleutel voor GitHub bewaren zonder hem aan iedereen te geven.
Vandaar dit kleine tussenstuk. Het draait gratis op Cloudflare.

De Worker doet drie dingen:

- **`POST /`** — een melding van de kaart wordt een issue (`feedback.js`);
- **`/beheer`** — de beheerders zien wie een antwoord per mail vroeg (`beheer.js`);
- **elke nacht** — de mailadressen van afgehandelde meldingen wissen (`beheer.js`).

Met GitHub praten ze allemaal via `github.js`.

### Eén GitHub App, twee rollen

Alles met GitHub loopt via **één GitHub App** van de organisatie Degagemain. Er is
**geen aparte OAuth-app** nodig. De app heeft twee rollen, elk met een eigen sleutel:

| | **De Worker als app** | **Een beheerder aanmelden** |
|---|---|---|
| Waarvoor | issues aanmaken, issues lezen voor de opruimtaak, nagaan welke rechten iemand op de repo heeft | een mens laten aanmelden op `/beheer`, zodat de Worker weet wie er kijkt |
| Namens wie | de Worker (`…[bot]`) | de beheerder die zich aanmeldt |
| Waarmee | App ID `GITHUB_APP_ID` + privésleutel `GITHUB_APP_SLEUTEL` | Client ID `GITHUB_OAUTH_ID` + client secret `GITHUB_OAUTH_GEHEIM` |
| Instellen | stap 1 en 3 | stap 5 |

Bij het aanmelden op `/beheer` werken de twee samen. Als beheerder meld je je aan via de
app: zo weet de Worker **wie** je bent. Daarna vraagt de Worker, als app, aan GitHub of
die persoon schrijfrechten op de repo heeft.

Valt de app weg (van de repo gehaald, of sleutel ongeldig), dan valt alles tegelijk
stil: geen issues van de kaart, geen `/beheer`, geen opruimtaak.

Staat er in `map/config.js` geen adres voor de Worker, dan doet de knop wat hij altijd
deed: hij opent het formulier op GitHub zelf (`.github/ISSUE_TEMPLATE/`, één sjabloon per taal),
waarvoor je wél een account nodig hebt.

## Eenmalig instellen

Je hebt een (gratis) Cloudflare-account nodig en Node.js voor `npx`.

### 1. Een GitHub App die alleen issues mag aanmaken

De Worker meldt zich bij GitHub aan als **GitHub App** van de organisatie. Hij maakt
daarmee zelf, telkens opnieuw, een token aan die een uur geldig is. Er verloopt dus
nooit iets dat iemand moet vernieuwen, en de issues verschijnen op naam van de app
(`<naam van de app>[bot]`) en niet op een persoonlijke naam.

**De app aanmaken.** GitHub → organisatie **Degagemain** → *Settings* → *Developer
settings* → *GitHub Apps* → *New GitHub App*:

- **GitHub App name:** bv. `Degage deelautokaart` (de naam moet uniek zijn op heel GitHub)
- **Homepage URL:** `https://github.com/Degagemain/degage-deelautokaart-gbfs`
- **Webhook:** vink *Active* **uit**
- **Permissions → Repository permissions → Issues:** *Read and write*
  (*Metadata: Read-only* staat er vanzelf bij; dat is nodig voor de beheerpagina)
- **Where can this GitHub App be installed?** *Only on this account*

Na *Create GitHub App* zie je bovenaan het **App ID** (een getal). Zet dat bij
`GITHUB_APP_ID` in `wrangler.toml`.

**De privésleutel.** Onderaan dezelfde pagina: *Private keys* → *Generate a private
key*. Je browser downloadt een `.pem`-bestand. GitHub levert het in een vorm (PKCS#1)
die de Worker niet kan lezen. In stap 3 zet je het om en geef je het aan de Worker.

**De app installeren.** Links op de pagina van de app: *Install App* → *Install* naast
Degagemain → *Only select repositories* → `degage-deelautokaart-gbfs`. Op welke repo
de app staat, zoekt de Worker zelf op.

**Zonder GitHub App** kan het ook met een vaste token: een fine-grained personal access
token met als *Resource owner* `Degagemain`, alleen deze repo, en *Issues: Read and
write*. Zet die met `npx wrangler secret put GITHUB_TOKEN`, en laat `GITHUB_APP_ID`
leeg. Zo'n token verloopt wel; dan maakt de Worker geen issues meer aan tot iemand hem
vernieuwt. Staat de app ingesteld, dan wordt `GITHUB_TOKEN` genegeerd.

Maak in de repo ook het label `feedback` aan (*Issues* → *Labels*, of
`gh label create feedback`).

### 2. Turnstile, de spamcontrole van Cloudflare

Cloudflare-dashboard → **Turnstile** → *Add widget*:

- **Hostnames:** `degagemain.github.io` (en `localhost` om lokaal te testen)
- **Widget mode:** *Managed*

Je krijgt een **site key** (publiek, komt in `config.js`) en een **secret key**
(geheim, komt in de Worker).

Turnstile is niet verplicht: zonder `TURNSTILE_SECRET` controleert de Worker niets. Maar
dan kan iedereen met een scriptje issues aanmaken. Laat het dus alleen weg om te testen.

### 3. De Worker uitrollen

Vanuit deze map:

```sh
npx wrangler login
npx wrangler deploy                         # maakt de Worker aan en toont zijn adres
npx wrangler secret put TURNSTILE_SECRET    # plak de secret key uit stap 2
```

Dan de privésleutel van de app uit stap 1. Deze regel zet hem om naar PKCS#8 en geeft
hem meteen aan de Worker, zonder dat de omgezette sleutel ergens op schijf belandt:

```sh
node -e "const c=require('crypto'),f=require('fs');process.stdout.write(c.createPrivateKey(f.readFileSync(process.argv[1])).export({type:'pkcs8',format:'pem'}))" "PAD/NAAR/sleutel.pem" | npx wrangler secret put GITHUB_APP_SLEUTEL
```

Verwijder daarna het `.pem`-bestand. Je hoeft het niet te bewaren: raak je de sleutel
kwijt, dan maak je op de pagina van de app een nieuwe aan en verwijder je de oude.

Eerst `deploy`, dan de geheimen: `secret put` wil een Worker die al bestaat. De geheimen
gelden meteen — je hoeft daarna niet opnieuw uit te rollen.

`deploy` toont het adres van de Worker, iets als
`https://degage-kaart-feedback.<jouw-naam>.workers.dev`.

Tussen de eerste `deploy` en de geheimen staat de Worker even online zonder sleutel en
zonder spamcontrole. Dat is ongevaarlijk: zonder sleutel maakt hij geen enkel issue aan,
hij antwoordt alleen met een fout.

Staat de kaart ook op een ander domein, zet dat dan bij `TOEGESTANE_HERKOMST` in
`wrangler.toml` en voer `deploy` opnieuw uit.

### 4. De kaart laten weten waar de Worker staat

In `map/config.js`:

```js
melden: {
  url: "https://degage-kaart-feedback.<jouw-naam>.workers.dev",
  turnstileSitekey: "0x4AAAA…",
  antwoordPerMail: false     // true pas na stap 5
},
```

Publiceer, en de knop opent voortaan het formulier op de kaart.

### 5. Antwoorden per mail (optioneel)

Hiermee kan wie iets meldt, een e-mailadres achterlaten om een antwoord te krijgen. Dat
adres komt **niet** in het issue, dat is openbaar. Het gaat naar een kleine databank (D1)
van de Worker. De beheerders zien het op de beheerpagina, `/beheer` op het adres van de
Worker. Het issue zelf krijgt alleen de regel *Antwoord gevraagd: ja, per mail*, met een
link naar die pagina.

**De databank.** Vanuit deze map:

```sh
npx wrangler d1 create degage-kaart-feedback
```

Zet het `database_id` dat je krijgt in `wrangler.toml` (in de plaats van `VUL-IN`), en
maak dan de tabel aan:

```sh
npx wrangler d1 execute degage-kaart-feedback --remote --file=schema.sql
```

**Wat de beheerpagina toont.** Alle meldingen: de issues met het label `feedback`, open
en gesloten, zowel die via de kaart als die via het formulier op GitHub. Per melding:
het issue en langs welke weg het binnenkwam, de toestand op GitHub (open of gesloten,
het aantal reacties), de taal en de datum.

Liet de melder op de kaart een mailadres achter, dan krijgt de melding het label
**antwoord gewenst**, met het adres als `mailto:`-link (het onderwerp staat in de taal
van de melder). Bij een gesloten issue staat erbij wanneer het adres gewist wordt. Dat
label bestaat alleen op deze pagina, niet op GitHub: het volgt rechtstreeks uit de
databank, en verdwijnt dus vanzelf met het adres.

Bovenaan filter je op status (standaard: open), op antwoord (alle meldingen, antwoord
gewenst, of zonder mailadres), op taal, of zoek je op titel, mailadres, `#nummer` of
`@naam`. De lijst komt in één keer van GitHub, niet met één vraag per issue.

**Aanmelden met GitHub.** Op de beheerpagina meld je je aan met je GitHub-account. Wie
**schrijfrechten (of meer) op deze repo** heeft, mag binnen; wie niet, krijgt "Geen
toegang". Er is dus geen aparte lijst met beheerders: geef of ontneem iemand de rechten
op de repo, en de pagina volgt vanzelf. De Worker kijkt dat bij elk bezoek opnieuw na.

Dat aanmelden loopt via dezelfde GitHub App uit stap 1; een aparte OAuth-app is niet
nodig. Op de pagina van de app (organisatie **Degagemain** → *Settings* → *Developer
settings* → *GitHub Apps* → de app → *Edit*):

- **Callback URL:** het adres van de Worker + `/beheer/terug`, bv.
  `https://degage-kaart-feedback.<jouw-naam>.workers.dev/beheer/terug`
- **Request user authorization (OAuth) during installation:** uit. `/beheer` vraagt
  het aanmelden zelf.
- **Enable Device Flow:** uit.
- **Expire user authorization tokens:** maakt niet uit; de Worker trekt de token van
  een aanmelding meteen weer in.

Zet de **Client ID** van de app (begint met `Iv23`, niet te verwarren met het App ID)
bij `GITHUB_OAUTH_ID` in `wrangler.toml`; die is niet geheim. Maak onder *Client
secrets* een client secret aan, en stel de geheimen in:

```sh
npx wrangler secret put GITHUB_OAUTH_GEHEIM   # de client secret van de GitHub App
npx wrangler secret put SESSIE_GEHEIM         # een lange willekeurige reeks, zie hieronder
npx wrangler deploy
```

Het sessiegeheim kun je in één keer aanmaken en zetten, zonder dat iemand het ziet:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" | npx wrangler secret put SESSIE_GEHEIM
```

Bij het aanmelden vraagt de Worker geen enkele toegang tot je account: hij wil alleen
weten wie je bent. De rechten op de repo vraagt hij daarna na als app (zie *Eén GitHub
App, twee rollen* bovenaan). Daar hoeft niets bij: de app
mag de *Metadata* van de repo lezen, en daar horen de rechten van een gebruiker bij.

**Aanzetten op de kaart.** Pas als dit alles klaar is: zet `antwoordPerMail: true` bij
`melden` in `map/config.js`, en publiceer. Het formulier krijgt dan een optioneel veld
voor een e-mailadres. Stond het eerder aan, dan zou de Worker meldingen met een
mailadres weigeren: zonder databank kan hij ze nergens kwijt.

**Opruimen gebeurt vanzelf.** Elke nacht (zie `[triggers]` in `wrangler.toml`) kijkt de
Worker welke issues gesloten zijn. Een mailadres verdwijnt **30 dagen** nadat zijn
issue gesloten werd, of meteen als het issue verwijderd is. Dat getal staat bij
`BEWAARTERMIJN_DAGEN` in `wrangler.toml`, en het formulier belooft het aan de bezoeker
(`meldformulier.mailUitleg` in `map/taal/`). Verander het dus op beide plaatsen.
Antwoord je niet via GitHub maar per mail, dan kun je het adres op de beheerpagina ook
meteen zelf wissen.

Ruim genoeg binnen het gratis plan van Cloudflare: D1 geeft 5 GB en 100.000
schrijfopdrachten per dag, en een melding met mailadres is er één.

## Wat er in het issue komt

- de titel: `[Feedback]` en de eerste regel van de beschrijving;
- de soort melding, de taal van de kaart, en dat het via het formulier kwam;
- als de melder een mailadres gaf: dat er een antwoord gevraagd is. Het adres zelf niet;
- de beschrijving, in een codeblok. Zo verschijnen er geen @vermeldingen, links of
  afbeeldingen die iemand anders lastigvallen of volgen.

Er komen **geen** IP-adres, browsergegevens of andere gegevens over de bezoeker in.

## Een melding die er niet hoort

Staat er toch iets persoonlijks in een issue, dan kan een beheerder de tekst aanpassen of
het issue verwijderen (*Delete issue* onderaan rechts; daarvoor heb je adminrechten op de
repo nodig). Een verwijderd issue neemt ook zijn mailadres mee: de opruimtaak wist het de
nacht erna.

## Onderhoud

Alle opdrachten vanuit deze map.

| Wat | Hoe |
|---|---|
| Iemand toegang geven tot `/beheer` | Schrijfrechten op de repo geven. Afnemen werkt meteen. |
| Zien wat de Worker doet of welke fout hij geeft | `npx wrangler tail`, en dan een melding sturen of `/beheer` openen |
| De databank bekijken | `npx wrangler d1 execute degage-kaart-feedback --remote --command "SELECT issue, aangemaakt, gecontroleerd FROM contact"` |
| Welke geheimen er zijn | `npx wrangler secret list` (toont alleen de namen) |
| De privésleutel van de app vervangen | Pagina van de GitHub App → *Generate a private key*, zetten zoals in stap 3, dan de oude sleutel op GitHub verwijderen |
| Het client secret van de app vervangen | Pagina van de GitHub App → *Generate a new client secret*, `npx wrangler secret put GITHUB_OAUTH_GEHEIM`, oude verwijderen |
| Iedereen afmelden op `/beheer` | Een nieuw `SESSIE_GEHEIM` zetten (zie stap 5) |

Geen van deze geheimen verloopt vanzelf, en geen ervan hoeft bewaard te worden:
wat je kwijt bent, maak je opnieuw aan. Bewaar wél de aanmeldgegevens van het
Cloudflare-account en van een eigenaar van de organisatie Degagemain op GitHub: daarmee
kan alles opnieuw.

**Als `/beheer` zegt "GitHub onbereikbaar"** en GitHub zelf werkt, dan kon de Worker zich
niet aanmelden als app. Meestal is de app van de repo gehaald, of hoort de sleutel niet
(meer) bij de app. `npx wrangler tail` zegt welke van de twee.
