# Het meldformulier: van de kaart naar GitHub

De knop **Probleem melden** op de kaart opent een formulier. Wat iemand daar invult, komt
als **openbaar issue** in deze repository terecht — ook als die persoon geen
GitHub-account heeft. Het formulier zegt dat uitdrukkelijk, en wie het invult, moet dat
aanvinken voor het verstuurd kan worden.

```
kaart (formulier)  ──POST──▶  Cloudflare Worker  ──GitHub API──▶  issue met label "feedback"
                               (houdt de token geheim,
                                controleert Turnstile)
```

Een statische site kan geen GitHub-token bewaren zonder hem aan iedereen te geven. Vandaar
dit kleine tussenstuk. Het draait gratis op Cloudflare.

Staat er in `map/config.js` geen adres voor de Worker, dan doet de knop wat hij altijd
deed: hij opent het formulier op GitHub zelf (`.github/ISSUE_TEMPLATE/`, één sjabloon per taal),
waarvoor je wél een account nodig hebt.

## Eenmalig instellen

Je hebt een (gratis) Cloudflare-account nodig en Node.js voor `npx`.

### 1. Een GitHub-token die alleen issues mag aanmaken

GitHub → *Settings* → *Developer settings* → *Personal access tokens* →
**Fine-grained tokens** → *Generate new token*:

- **Resource owner:** `Degagemain`
- **Repository access:** *Only select repositories* → `degage-deelautokaart-gbfs`
- **Permissions → Repository permissions → Issues:** *Read and write*
- verder niets

De issues verschijnen op naam van de eigenaar van de token. Wie dat liever niet onder
een persoonlijke naam heeft, maakt de token aan met een apart account (bv. een
"degage-bot") dat schrijfrechten op de repo heeft.

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
npx wrangler secret put GITHUB_TOKEN        # plak de token uit stap 1
npx wrangler secret put TURNSTILE_SECRET    # plak de secret key uit stap 2
```

Eerst `deploy`, dan de geheimen: `secret put` wil een Worker die al bestaat. De geheimen
gelden meteen — je hoeft daarna niet opnieuw uit te rollen.

`deploy` toont het adres van de Worker, iets als
`https://degage-kaart-feedback.<jouw-naam>.workers.dev`.

Tussen de eerste `deploy` en de twee `secret put`-regels staat de Worker even online
zonder token en zonder spamcontrole. Dat is ongevaarlijk: zonder `GITHUB_TOKEN` maakt hij
geen enkel issue aan, hij antwoordt alleen met een fout.

Staat de kaart ook op een ander domein, zet dat dan bij `TOEGESTANE_HERKOMST` in
`wrangler.toml` en voer `deploy` opnieuw uit.

### 4. De kaart laten weten waar de Worker staat

In `map/config.js`:

```js
melden: {
  url: "https://degage-kaart-feedback.<jouw-naam>.workers.dev",
  turnstileSitekey: "0x4AAAA…"
},
```

Publiceer, en de knop opent voortaan het formulier op de kaart.

## Wat er in het issue komt

- de titel: `[Feedback]` en de eerste regel van de beschrijving;
- de soort melding, de taal van de kaart, en dat het via het formulier kwam;
- de beschrijving, in een codeblok. Zo verschijnen er geen @vermeldingen, links of
  afbeeldingen die iemand anders lastigvallen of volgen.

Er komen **geen** IP-adres, browsergegevens of andere gegevens over de bezoeker in.

## Een melding die er niet hoort

Staat er toch iets persoonlijks in een issue, dan kan een beheerder de tekst aanpassen of
het issue verwijderen (*Delete issue* onderaan rechts; daarvoor heb je adminrechten op de
repo nodig).
