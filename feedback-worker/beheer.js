/* De beheerpagina (/beheer) en de opruimtaak: de mailadressen van wie een antwoord vroeg.
   ------------------------------------------------------------------------------------
   Wie mag kijken, beslist GitHub, niet een eigen lijst. Je logt in met je GitHub-account
   (via de GitHub App van de Worker, met haar Client ID en client secret), en de Worker
   vraagt daarna als app (github.js) aan GitHub welke rechten je op GITHUB_REPO hebt. Schrijfrechten of meer: je mag binnen.
   Dat gebeurt bij elk bezoek opnieuw, dus wie zijn rechten op de repo verliest, verliest
   meteen ook deze pagina — niet pas als zijn sessie afloopt.

   De token die je bij het inloggen van GitHub krijgt, dient alleen om te vragen wie je
   bent; daarna trekt de Worker hem meteen weer in. In het koekje staat alleen je
   gebruikersnaam en tot wanneer de sessie geldt, ondertekend met SESSIE_GEHEIM.

   Instellen: zie README.md in deze map. Zolang de databank, het Client ID en
   client secret, of het sessiegeheim ontbreekt, toont de pagina alleen dat ze nog niet ingesteld is.
*/

import { github, naarBase64url } from "./github.js";

const SESSIE_DUUR = 8 * 60 * 60;        // seconden
const RECHTEN = ["admin", "write"];     // GitHub geeft "write" ook voor maintain
const MAX_CONTROLES = 40;               // issues per opruimbeurt; een Worker mag er 50 subrequests doen

/* Het onderwerp van een antwoordmail, in de taal waarin de melder de kaart gebruikte. */
const ONDERWERP = {
  nl: "Je melding over de deelautokaart",
  fr: "Votre signalement sur la carte des voitures partagées",
  en: "Your report about the car-sharing map"
};

export async function beheer(request, env) {
  const url = new URL(request.url);
  const pad = url.pathname.replace(/\/+$/, "");

  if (!env.DB || !env.GITHUB_OAUTH_ID || !env.GITHUB_OAUTH_GEHEIM || !env.SESSIE_GEHEIM) {
    return pagina(503, "Niet ingesteld",
      "<p>De beheerpagina is nog niet ingesteld. Zie <code>feedback-worker/README.md</code>.</p>");
  }

  if (pad === "/beheer/filters.js") {
    return new Response(FILTERSCRIPT, { headers: {
      "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" } });
  }
  if (pad === "/beheer/login") return naarGitHub(url, env);
  if (pad === "/beheer/terug") return terugVanGitHub(request, url, env);
  if (pad === "/beheer/uit") {
    return doorsturen(url.origin + "/beheer/afgemeld", [koekje("beheer_sessie", "", 0)]);
  }
  if (pad === "/beheer/afgemeld") {
    return pagina(200, "Afgemeld",
      '<p>Je bent afgemeld. <a href="/beheer/login">Opnieuw aanmelden</a></p>');
  }

  const wie = await sessie(request, env);
  if (!wie) return doorsturen(url.origin + "/beheer/login");
  const mag = await magBeheren(env, wie);
  if (mag === null) {
    return pagina(503, "GitHub onbereikbaar",
      "<p>De Worker kon bij GitHub niet nagaan welke rechten je hebt. Ligt GitHub niet " +
      "plat, kijk dan de GitHub App of de token van de Worker na (README.md, stap 1).</p>" +
      '<p><a href="/beheer">Opnieuw proberen</a></p>');
  }
  if (!mag) {
    return pagina(403, "Geen toegang",
      "<p><strong>" + ontsnap(wie) + "</strong> heeft geen schrijfrechten op " +
      ontsnap(env.GITHUB_REPO) + ", en mag deze pagina dus niet zien.</p>" +
      '<p><a href="/beheer/uit">Afmelden</a></p>');
  }

  if (pad === "/beheer/wis" && request.method === "POST") {
    // Het koekje is SameSite=Lax, maar dubbel is hier niet te veel: wissen is voorgoed.
    if (request.headers.get("Origin") !== url.origin) {
      return pagina(403, "Geweigerd", "<p>Dit verzoek kwam niet van deze pagina.</p>");
    }
    const formulier = await request.formData();
    const issue = Number(formulier.get("issue"));
    if (Number.isInteger(issue)) {
      await env.DB.prepare("DELETE FROM contact WHERE issue = ?").bind(issue).run();
    }
    // Terug naar het overzicht met dezelfde filters. Alleen een zoekstring, nooit een adres.
    const terug = String(formulier.get("terug") || "");
    return doorsturen(url.origin + "/beheer" + (terug.startsWith("?") ? terug : ""), [], 303);
  }
  if (pad === "/beheer") return overzicht(env, wie, url);
  return pagina(404, "Niet gevonden", '<p><a href="/beheer">Naar het overzicht</a></p>');
}


/* ---- de opruimtaak -------------------------------------------------------------------

   Wist het mailadres zodra het issue langer dan BEWAARTERMIJN_DAGEN gesloten is, of als
   het issue niet meer bestaat. Wat de taak niet kan nakijken (GitHub plat, geen token),
   laat ze staan tot de volgende dag. Per beurt hooguit MAX_CONTROLES issues, de langst
   niet bekeken eerst: bij meer adressen komt de rest de dagen erna aan de beurt. */
export async function ruimOp(env) {
  if (!env.DB) return;
  const dagen = Number(env.BEWAARTERMIJN_DAGEN) || 30;
  const grens = Date.now() - dagen * 24 * 60 * 60 * 1000;
  const nu = new Date().toISOString();

  const { results } = await env.DB.prepare(
    "SELECT issue FROM contact ORDER BY gecontroleerd LIMIT ?"
  ).bind(MAX_CONTROLES).all();

  const opdrachten = [];
  for (const { issue } of results) {
    const r = await github(env, "/repos/" + env.GITHUB_REPO + "/issues/" + issue);
    let weg = r.status === 404 || r.status === 410;   // 410: het issue is verwijderd
    if (r.ok) {
      const { state, closed_at } = await r.json();
      weg = state === "closed" && Date.parse(closed_at) < grens;
    } else if (!weg) {
      console.error("Opruimen: GitHub gaf", r.status, "voor issue", issue);
      continue;
    }
    opdrachten.push(weg
      ? env.DB.prepare("DELETE FROM contact WHERE issue = ?").bind(issue)
      : env.DB.prepare("UPDATE contact SET gecontroleerd = ? WHERE issue = ?").bind(nu, issue));
  }
  if (opdrachten.length) await env.DB.batch(opdrachten);
}


/* ---- aanmelden via GitHub ------------------------------------------------------------ */

function naarGitHub(url, env) {
  const staat = willekeurig();
  const doel = new URL("https://github.com/login/oauth/authorize");
  doel.searchParams.set("client_id", env.GITHUB_OAUTH_ID);
  doel.searchParams.set("redirect_uri", url.origin + "/beheer/terug");
  doel.searchParams.set("state", staat);
  doel.searchParams.set("allow_signup", "false");
  // Geen `scope`: de Worker wil alleen weten wie je bent, en dat is openbaar.
  return doorsturen(doel.href, [koekje("beheer_staat", staat, 600)]);
}

async function terugVanGitHub(request, url, env) {
  const mislukt = (reden) => pagina(400, "Aanmelden mislukt",
    "<p>" + reden + ' <a href="/beheer/login">Probeer opnieuw.</a></p>');

  const code = url.searchParams.get("code");
  const staat = url.searchParams.get("state");
  if (!code || !staat || staat !== leesKoekje(request, "beheer_staat")) {
    return mislukt("Het aanmelden is verlopen of kwam niet van hier.");
  }

  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json",
               "User-Agent": "degage-kaart-feedback" },
    body: JSON.stringify({
      client_id: env.GITHUB_OAUTH_ID,
      client_secret: env.GITHUB_OAUTH_GEHEIM,
      code,
      redirect_uri: url.origin + "/beheer/terug"
    })
  });
  const { access_token, error } = await r.json().catch(() => ({}));
  /* De foutcode van GitHub zegt wat er mis is, en is niet geheim: "incorrect_client_credentials"
     (GITHUB_OAUTH_GEHEIM hoort niet bij GITHUB_OAUTH_ID), "redirect_uri_mismatch" (de
     callback-URL van de app klopt niet), "bad_verification_code" (code verlopen). */
  if (!access_token) {
    console.error("Aanmelden: GitHub gaf geen token:", r.status, error);
    return mislukt("GitHub gaf geen toegang" + (error ? " (" + ontsnap(error) + ")" : "") + ".");
  }

  const u = await fetch("https://api.github.com/user", {
    headers: { "Authorization": "Bearer " + access_token,
               "Accept": "application/vnd.github+json",
               "User-Agent": "degage-kaart-feedback" }
  });
  const { login } = await u.json().catch(() => ({}));

  // De token heeft zijn werk gedaan; laat hem niet rondslingeren.
  await fetch("https://api.github.com/applications/" + env.GITHUB_OAUTH_ID + "/token", {
    method: "DELETE",
    headers: { "Authorization": "Basic " + btoa(env.GITHUB_OAUTH_ID + ":" + env.GITHUB_OAUTH_GEHEIM),
               "Accept": "application/vnd.github+json",
               "User-Agent": "degage-kaart-feedback",
               "Content-Type": "application/json" },
    body: JSON.stringify({ access_token })
  }).catch(() => {});

  if (!login) return mislukt("GitHub zei niet wie je bent.");
  const tot = Math.floor(Date.now() / 1000) + SESSIE_DUUR;
  const inhoud = login + "|" + tot;
  return doorsturen(url.origin + "/beheer", [
    koekje("beheer_sessie", inhoud + "." + await onderteken(env, inhoud), SESSIE_DUUR),
    koekje("beheer_staat", "", 0)
  ]);
}

/* De gebruikersnaam uit een geldig, niet verlopen sessiekoekje, of null. */
async function sessie(request, env) {
  const waarde = leesKoekje(request, "beheer_sessie");
  const punt = waarde ? waarde.lastIndexOf(".") : -1;
  if (punt < 0) return null;
  const inhoud = waarde.slice(0, punt);
  let echt = false;
  try {
    echt = await crypto.subtle.verify("HMAC", await sleutel(env),
      vanBase64url(waarde.slice(punt + 1)), new TextEncoder().encode(inhoud));
  } catch (e) {
    return null;
  }
  if (!echt) return null;
  const [login, tot] = inhoud.split("|");
  return login && Number(tot) > Date.now() / 1000 ? login : null;
}

/* true of false; null als GitHub geen antwoord gaf. Dat laatste is een storing aan onze
   kant (bv. de app is niet meer geïnstalleerd), en geen reden om iemand "geen rechten" te
   zeggen. Een 404 betekent wel echt: geen medewerker van deze repo. */
async function magBeheren(env, login) {
  const r = await github(env, "/repos/" + env.GITHUB_REPO + "/collaborators/" +
    encodeURIComponent(login) + "/permission");
  if (r.status === 404) return false;
  if (!r.ok) return null;
  const { permission } = await r.json().catch(() => ({}));
  return RECHTEN.includes(permission);
}


/* ---- de pagina zelf ------------------------------------------------------------------ */

const STATUSSEN = { open: "Open", gesloten: "Gesloten", alle: "Alle" };
const TALEN = { alle: "Alle talen", nl: "Nederlands", fr: "Frans", en: "Engels" };
const ANTWOORD = { alle: "Alle meldingen", ja: "Antwoord gewenst", nee: "Zonder mailadres" };

/* Het overzicht: alle meldingen (issues met het label "feedback") van GitHub, aangevuld met
   wat alleen in de databank staat, het mailadres. Een melding met een mailadres krijgt
   het label "antwoord gewenst". Dat label bestaat alleen op deze pagina, niet op GitHub:
   het volgt rechtstreeks uit de databank, dus niemand hoeft het bij te houden, en het
   verdwijnt vanzelf met het mailadres.

   De filters staan in de zoekstring (?status=…&antwoord=…&taal=…&zoek=…), zodat een
   gefilterde lijst een gewone link is en "Wissen" naar dezelfde lijst terugkeert. */
async function overzicht(env, wie, url) {
  const vraag = url.searchParams;
  const kies = (naam, opties, standaard) =>
    Object.hasOwn(opties, vraag.get(naam)) ? vraag.get(naam) : standaard;
  const status = kies("status", STATUSSEN, "open");
  const antwoord = kies("antwoord", ANTWOORD, "alle");
  const taal = kies("taal", TALEN, "alle");
  const zoek = (vraag.get("zoek") || "").trim().slice(0, 100);

  const { results } = await env.DB.prepare(
    "SELECT issue, titel, mail, taal, aangemaakt FROM contact"
  ).all();
  const mails = new Map(results.map((r) => [r.issue, r]));
  const dagen = Number(env.BEWAARTERMIJN_DAGEN) || 30;
  const { issues, storing } = await meldingenOpGitHub(env, [...mails.keys()]);

  // Een mailadres waarvan het issue niet (meer) op GitHub te vinden is, toch tonen.
  const rijen = [...issues.values()];
  for (const r of results) {
    if (!issues.has(r.issue)) {
      rijen.push({ number: r.issue, title: r.titel, created_at: r.aangemaakt, onbekend: true });
    }
  }
  rijen.sort((a, b) => b.number - a.number);

  /* Elke rij krijgt haar kenmerken mee als data-attributen; filters.js filtert daarop in
     de browser, zonder de pagina te herladen. De server filtert hier op dezelfde manier,
     zodat de eerste weergave (en de pagina zonder JavaScript) meteen klopt. */
  const kenmerken = (i) => {
    const m = mails.get(i.number);
    return {
      status: i.onbekend ? "" : i.state === "closed" ? "gesloten" : "open",
      antwoord: m ? "ja" : "nee",
      taal: (m && m.taal) || taalUitIssue(i),
      zoek: (i.title + " " + (m ? m.mail : "") + " #" + i.number +
             (i.user ? " @" + i.user.login : "")).toLowerCase()
    };
  };
  const kleiner = zoek.toLowerCase();
  const past = (k) =>
    (status === "alle" || !k.status || k.status === status) &&
    (antwoord === "alle" || k.antwoord === antwoord) &&
    (taal === "alle" || k.taal === taal) &&
    (!kleiner || k.zoek.includes(kleiner));

  const terug = "?" + new URLSearchParams({ status, antwoord, taal, zoek }).toString();
  let zichtbaar = 0;
  const html = rijen.map((i) => {
    const m = mails.get(i.number);
    const k = kenmerken(i);
    const toon = past(k);
    if (toon) zichtbaar++;
    let contact = '<span class="zacht">—</span>';
    if (m) {
      const onderwerp = (ONDERWERP[m.taal] || ONDERWERP.nl) + " (#" + i.number + ")";
      const mailto = "mailto:" + m.mail + "?subject=" + encodeURIComponent(onderwerp);
      contact = '<span class="label">antwoord gewenst</span><br>' +
        '<a href="' + ontsnap(mailto) + '">' + ontsnap(m.mail) + "</a>";
    } else if (i.user && i.user.type !== "Bot") {
      contact = '<span class="zacht">op GitHub, aan @' + ontsnap(i.user.login) + "</span>";
    }
    return '<tr data-status="' + k.status + '" data-antwoord="' + k.antwoord + '" ' +
        'data-taal="' + ontsnap(k.taal) + '" data-zoek="' + ontsnap(k.zoek) + '"' +
        (toon ? "" : " hidden") + ">" +
      '<td><a href="https://github.com/' + ontsnap(env.GITHUB_REPO) + "/issues/" + i.number +
        '">#' + i.number + "</a> " + ontsnap(i.title) + "<br>" +
        '<span class="zacht">' + herkomst(i) + "</span></td>" +
      "<td>" + toestand(i, dagen, !!m) + "</td>" +
      "<td>" + contact + "</td>" +
      "<td>" + ontsnap(k.taal || "?") + "</td>" +
      "<td>" + ontsnap(String(i.created_at).slice(0, 10)) + "</td>" +
      "<td>" + (m
        ? '<details><summary>Wissen</summary><form method="post" action="/beheer/wis">' +
          '<input type="hidden" name="issue" value="' + i.number + '">' +
          '<input type="hidden" name="terug" value="' + ontsnap(terug) + '">' +
          "<button>Ja, wis dit adres</button></form></details>"
        : "") + "</td>" +
      "</tr>";
  }).join("");

  const keuze = (naam, opties, gekozen) =>
    '<select name="' + naam + '">' + Object.entries(opties).map(([waarde, label]) =>
      '<option value="' + waarde + '"' + (waarde === gekozen ? " selected" : "") + ">" +
      label + "</option>").join("") + "</select>";
  const gefilterd = status !== "open" || antwoord !== "alle" || taal !== "alle" || zoek;

  return pagina(200, "Meldingen",
    '<p class="wie">Aangemeld als <strong>' + ontsnap(wie) + '</strong> · ' +
      '<a href="/beheer/uit">Afmelden</a></p>' +
    "<p>Alle meldingen over de kaart: de issues met het label <code>feedback</code>. Wie op " +
      'de kaart een mailadres achterliet, krijgt hier het label <span class="label">antwoord ' +
      "gewenst</span>. Dat adres staat niet op GitHub, alleen hier, en verdwijnt vanzelf " +
      dagen + " dagen nadat het issue gesloten is. Heb je het niet meer nodig, dan kun je " +
      "het ook meteen wissen.</p>" +
    '<form class="filters" method="get" action="/beheer">' +
      "<label>Status " + keuze("status", STATUSSEN, status) + "</label>" +
      "<label>Antwoord " + keuze("antwoord", ANTWOORD, antwoord) + "</label>" +
      "<label>Taal " + keuze("taal", TALEN, taal) + "</label>" +
      '<label>Zoeken <input type="search" name="zoek" value="' + ontsnap(zoek) + '" ' +
        'placeholder="titel, mailadres, #nummer of @naam"></label>' +
      // Alleen voor wie geen JavaScript heeft; filters.js verbergt hem.
      '<button id="toon">Toon</button>' +
      ' <a href="/beheer" id="wisfilters"' + (gefilterd ? "" : " hidden") + ">Wis filters</a>" +
    "</form>" +
    (storing
      ? '<p class="let-op">GitHub gaf de meldingen niet door. Hieronder staan alleen de ' +
        "meldingen met een mailadres, zonder hun toestand.</p>" : "") +
    '<p class="telling"><span id="zichtbaar">' + zichtbaar + "</span> van " + rijen.length +
      " meldingen</p>" +
    (html
      ? "<table><thead><tr><th>Melding</th><th>Op GitHub</th><th>Antwoord</th><th>Taal</th>" +
        "<th>Gemeld</th><th></th></tr></thead><tbody>" + html + "</tbody></table>" +
        '<p id="geen"' + (zichtbaar ? " hidden" : "") +
        "><em>Geen meldingen die aan deze filters voldoen.</em></p>"
      : "<p><em>Er zijn nog geen meldingen.</em></p>") +
    '<script src="/beheer/filters.js"></script>');
}

/* Het script achter de filters: elke wijziging werkt meteen, zonder herladen. Het filtert
   op de data-attributen van de rijen, op dezelfde manier als overzicht() hierboven, en
   houdt het adres en de terugweg van "Wissen" bij, zodat herladen dezelfde lijst geeft.
   Een apart bestand, omdat de Content-Security-Policy geen script in de pagina toelaat. */
const FILTERSCRIPT = `"use strict";
const formulier = document.querySelector(".filters");
const rijen = [...document.querySelectorAll("tbody tr")];
const wis = document.getElementById("wisfilters");
const STANDAARD = { status: "open", antwoord: "alle", taal: "alle", zoek: "" };
document.getElementById("toon").hidden = true;

function pas() {
  const f = Object.fromEntries(new FormData(formulier));
  f.zoek = f.zoek.trim();
  const zoek = f.zoek.toLowerCase();
  let zichtbaar = 0;
  for (const rij of rijen) {
    const d = rij.dataset;
    const past = (f.status === "alle" || !d.status || d.status === f.status) &&
      (f.antwoord === "alle" || d.antwoord === f.antwoord) &&
      (f.taal === "alle" || d.taal === f.taal) &&
      (!zoek || d.zoek.includes(zoek));
    rij.hidden = !past;
    if (past) zichtbaar++;
  }
  document.getElementById("zichtbaar").textContent = zichtbaar;
  const geen = document.getElementById("geen");
  if (geen) geen.hidden = zichtbaar > 0;

  const standaard = Object.keys(STANDAARD).every((k) => f[k] === STANDAARD[k]);
  const terug = "?" + new URLSearchParams(f);
  for (const veld of document.querySelectorAll('input[name="terug"]')) veld.value = terug;
  history.replaceState(null, "", standaard ? "/beheer" : "/beheer" + terug);
  wis.hidden = standaard;
}

formulier.addEventListener("change", pas);
formulier.addEventListener("input", pas);
formulier.addEventListener("submit", (e) => { e.preventDefault(); pas(); });
wis.addEventListener("click", (e) => {
  e.preventDefault();
  for (const k of Object.keys(STANDAARD)) formulier.elements[k].value = STANDAARD[k];
  pas();
});
`;

/* Langs welke weg de melding binnenkwam: via het formulier op de kaart maakt de app het
   issue aan (een "Bot"), via het formulier op GitHub de melder zelf. */
function herkomst(i) {
  if (i.onbekend) return "niet gevonden op GitHub";
  return i.user && i.user.type === "Bot" ? "via de kaart" : "op GitHub, door @" + ontsnap(i.user.login);
}

/* De toestand van een issue op GitHub, in een paar woorden. Bij een gesloten issue met een
   mailadres ook wanneer de opruimtaak dat adres wist. */
function toestand(i, dagen, metMail) {
  if (i.onbekend) return '<span class="zacht">onbekend</span>';
  const reacties = i.comments === 1 ? "1 reactie" : i.comments + " reacties";
  if (i.state !== "closed") return "open · " + reacties;
  const hoe = i.state_reason === "not_planned" ? "gesloten, niet opgepakt" : "gesloten";
  let tekst = hoe + " op " + i.closed_at.slice(0, 10) + " · " + reacties;
  if (metMail) {
    const gewist = new Date(Date.parse(i.closed_at) + dagen * 24 * 60 * 60 * 1000);
    tekst += '<br><span class="zacht">adres gewist rond ' + gewist.toISOString().slice(0, 10) + "</span>";
  }
  return tekst;
}

/* De taal van een melding zonder mailadres: die staat in het issue zelf, in de regel die
   feedback.js schrijft ("**Taal van de kaart:** fr"). Een melding via GitHub zelf heeft
   die regel niet; dan is de taal onbekend. */
function taalUitIssue(i) {
  const m = /\*\*Taal van de kaart:\*\* ([a-z]{2})\b/.exec(i.body || "");
  return m ? m[1] : "";
}

/* Alle issues met het label "feedback", open en gesloten, in hooguit vijf vragen van
   honderd. Een issue met een mailadres dat er niet tussen zit (bv. het label werd
   weggehaald), wordt apart opgevraagd, voor hooguit tien zulke issues. `storing` als
   GitHub de lijst niet gaf. */
async function meldingenOpGitHub(env, metMail) {
  const issues = new Map();
  const repo = "/repos/" + env.GITHUB_REPO + "/issues";
  for (let blad = 1; blad <= 5; blad++) {
    const r = await github(env, repo + "?labels=feedback&state=all&per_page=100&page=" + blad);
    if (!r.ok) {
      console.error("Overzicht: GitHub gaf", r.status);
      return { issues: new Map(), storing: true };
    }
    const lijst = await r.json();
    for (const i of lijst) if (!i.pull_request) issues.set(i.number, i);
    if (lijst.length < 100) break;
  }
  for (const nummer of metMail.filter((n) => !issues.has(n)).slice(0, 10)) {
    const r = await github(env, repo + "/" + nummer);
    if (r.ok) issues.set(nummer, await r.json());
  }
  return { issues, storing: false };
}

function pagina(status, titel, inhoud) {
  return new Response(`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${ontsnap(titel)} — deelautokaart Dégage</title>
<style>
  :root { color-scheme: light dark; --lijn: #8884; }
  body { font: 15px/1.5 system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 20px; }
  .wie { color: GrayText; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid var(--lijn); }
  td:nth-child(3) { word-break: break-all; }
  .label { display: inline-block; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 600;
           line-height: 20px; white-space: nowrap; color: #0a5a2c; background: #d6f5e0; border: 1px solid #9fd9b3; }
  @media (prefers-color-scheme: dark) { .label { color: #b8f0cb; background: #12391f; border-color: #2e7046; } }
  summary { cursor: pointer; }
  [hidden] { display: none !important; }
  .zacht, .telling { color: GrayText; }
  .telling { font-size: 13px; margin: 8px 0 4px; }
  .let-op { padding: 6px 10px; border-left: 4px solid #c99a1e; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: end; margin: 14px 0; }
  .filters label { display: flex; flex-direction: column; font-size: 13px; gap: 2px; }
  .filters select, .filters input, .filters button { font: inherit; padding: 4px 6px; }
  @media (max-width: 640px) {
    thead { display: none; }
    tr, td { display: block; }
    tr { padding: 8px 0; border-bottom: 1px solid var(--lijn); }
    td { border: 0; padding: 2px 0; }
  }
</style>
</head>
<body>
<h1>${ontsnap(titel)}</h1>
${inhoud}
</body>
</html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    }
  });
}


/* ---- hulpjes ------------------------------------------------------------------------- */

function doorsturen(waarheen, koekjes = [], status = 302) {
  const headers = new Headers({ "Location": waarheen, "Cache-Control": "no-store" });
  for (const k of koekjes) headers.append("Set-Cookie", k);
  return new Response(null, { status, headers });
}

function koekje(naam, waarde, seconden) {
  return naam + "=" + waarde + "; Path=/beheer; Max-Age=" + seconden +
    "; HttpOnly; Secure; SameSite=Lax";
}

function leesKoekje(request, naam) {
  for (const deel of (request.headers.get("Cookie") || "").split(";")) {
    const [n, ...rest] = deel.trim().split("=");
    if (n === naam) return rest.join("=");
  }
  return "";
}

async function sleutel(env) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(env.SESSIE_GEHEIM),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function onderteken(env, inhoud) {
  const h = await crypto.subtle.sign("HMAC", await sleutel(env), new TextEncoder().encode(inhoud));
  return naarBase64url(new Uint8Array(h));
}

function willekeurig() {
  return naarBase64url(crypto.getRandomValues(new Uint8Array(24)));
}

function vanBase64url(tekst) {
  const b64 = tekst.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function ontsnap(tekst) {
  return String(tekst).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
