/* De beheerpagina (/beheer) en de opruimtaak: de mailadressen van wie een antwoord vroeg,
   en op /beheer/kaartfilters welke filters de kaart toont (instellingen.js).
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
import { FILTERS, OPTIES, leesVerborgen, leesVerborgenOpties, leesMeer, bewaarVerborgen,
         laatsteWijziging }
  from "./instellingen.js";
import { werkBij, leesOpen, markeerOpgelost, nieuweAutos, SOORTEN, soortVan }
  from "./datafouten.js";

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

  if (pad === "/beheer/datafouten.js") {
    return new Response(DATAFOUTENSCRIPT, { headers: {
      "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" } });
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
    if (!komtVanHier(request, url)) {
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
  if (pad === "/beheer/kaartfilters" && request.method === "POST") {
    if (!komtVanHier(request, url)) {
      return pagina(403, "Geweigerd", "<p>Dit verzoek kwam niet van deze pagina.</p>");
    }
    const formulier = await request.formData();
    // Per filter één keuze: "lijst", "meer" of "uit". Ontbreekt ze, dan in de lijst.
    const plek = (k) => String(formulier.get("plek/" + k) || "lijst");
    const aan = new Set(formulier.getAll("optie").map(String));
    const opties = {};
    for (const [filter, keuzes] of Object.entries(OPTIES)) {
      opties[filter] = Object.keys(keuzes).filter((k) => !aan.has(filter + "/" + k));
    }
    try {
      await bewaarVerborgen(env, Object.keys(FILTERS).filter((k) => plek(k) === "uit"),
                            opties, Object.keys(FILTERS).filter((k) => plek(k) === "meer"),
                            wie);
    } catch (e) {
      console.error("Instellingen bewaren:", e.message);
      return pagina(500, "Niet bewaard",
        "<p>De keuze kon niet bewaard worden. Staat de tabel <code>instellingen</code> al in " +
        "de databank? Voer <code>schema.sql</code> opnieuw uit (README.md, stap 5).</p>" +
        '<p><a href="/beheer/kaartfilters">Terug</a></p>');
    }
    return doorsturen(url.origin + "/beheer/kaartfilters?bewaard=1", [], 303);
  }
  if (pad === "/beheer/kaartfilters") return kaartfilters(env, wie, url);
  if (pad === "/beheer/datafouten/opgelost" && request.method === "POST") {
    if (!komtVanHier(request, url)) {
      return pagina(403, "Geweigerd", "<p>Dit verzoek kwam niet van deze pagina.</p>");
    }
    const formulier = await request.formData();
    const sleutel = String(formulier.get("sleutel") || "");
    if (sleutel) await markeerOpgelost(env, sleutel, wie);
    // Terug naar dezelfde gefilterde lijst. Alleen een zoekstring, nooit een adres.
    const terug = String(formulier.get("terug") || "");
    return doorsturen(url.origin + "/beheer/datafouten" + (terug.startsWith("?") ? terug : ""),
                      [], 303);
  }
  if (pad === "/beheer/datafouten/controleer" && request.method === "POST") {
    if (!komtVanHier(request, url)) {
      return pagina(403, "Geweigerd", "<p>Dit verzoek kwam niet van deze pagina.</p>");
    }
    let uitslag;
    try {
      uitslag = await werkBij(env);
    } catch (e) {
      console.error("Datafouten:", e.message);
      return pagina(500, "Niet gecontroleerd",
        "<p>De feed kon niet nagekeken worden: " + ontsnap(e.message) + ". Staat de tabel " +
        "<code>datafouten</code> al in de databank? Voer <code>schema.sql</code> opnieuw uit " +
        "(README.md, stap 5).</p><p><a href=\"/beheer/datafouten\">Terug</a></p>");
    }
    // Wat de controle vond, in de zoekstring: de pagina zegt het dan na het doorsturen.
    const { aantal, nieuw, weg, verborgen } = uitslag;
    return doorsturen(url.origin + "/beheer/datafouten?" +
      new URLSearchParams({ gecontroleerd: aantal, nieuw, weg, verborgen }), [], 303);
  }
  if (pad === "/beheer/datafouten") return datafouten(env, wie, url);
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
        '" class="melding">#' + i.number + " " + ontsnap(i.title) + "</a><br>" +
        '<span class="zacht">' + herkomst(i) + "</span></td>" +
      "<td>" + toestand(i, dagen, !!m) + "</td>" +
      "<td>" + contact + "</td>" +
      "<td>" + ontsnap(k.taal || "?") + "</td>" +
      "<td>" + ontsnap(String(i.created_at).slice(0, 10)) + "</td>" +
      "<td>" + (m
        ? '<details><summary>Wissen</summary><form method="post" action="/beheer/wis">' +
          '<input type="hidden" name="issue" value="' + i.number + '">' +
          '<input type="hidden" name="terug" value="' + ontsnap(terug) + '">' +
          '<button class="knop knop--gevaar">Ja, wis dit adres</button></form></details>'
        : "") + "</td>" +
      "</tr>";
  }).join("");

  const keuze = (naam, opties, gekozen) =>
    '<select name="' + naam + '">' + Object.entries(opties).map(([waarde, label]) =>
      '<option value="' + waarde + '"' + (waarde === gekozen ? " selected" : "") + ">" +
      label + "</option>").join("") + "</select>";
  const gefilterd = status !== "open" || antwoord !== "alle" || taal !== "alle" || zoek;

  return pagina(200, "Meldingen",
    "<p class=\"inleiding\">Alle meldingen over de kaart: de issues met het label <code>feedback</code>. Wie op " +
      'de kaart een mailadres achterliet, krijgt hier het label <span class="label">antwoord ' +
      "gewenst</span>. Dat adres staat niet op GitHub, alleen hier, en verdwijnt vanzelf " +
      dagen + " dagen nadat het issue gesloten is. Heb je het niet meer nodig, dan kun je " +
      "het ook meteen wissen.</p>" +
    '<form class="vlak filters" method="get" action="/beheer">' +
      "<label>Status " + keuze("status", STATUSSEN, status) + "</label>" +
      "<label>Antwoord " + keuze("antwoord", ANTWOORD, antwoord) + "</label>" +
      "<label>Taal " + keuze("taal", TALEN, taal) + "</label>" +
      '<label>Zoeken <input type="search" name="zoek" value="' + ontsnap(zoek) + '" ' +
        'placeholder="titel, mailadres, #nummer of @naam"></label>' +
      // Alleen voor wie geen JavaScript heeft; filters.js verbergt hem.
      '<button class="knop knop--hoofd" id="toon">Toon</button>' +
      ' <a href="/beheer" id="wisfilters"' + (gefilterd ? "" : " hidden") + ">Wis filters</a>" +
    "</form>" +
    (storing
      ? '<p class="let-op">GitHub gaf de meldingen niet door. Hieronder staan alleen de ' +
        "meldingen met een mailadres, zonder hun toestand.</p>" : "") +
    '<p class="telling"><span id="zichtbaar">' + zichtbaar + "</span> van " + rijen.length +
      " meldingen</p>" +
    (html
      ? '<div class="vlak lijst"><table><thead><tr><th>Melding</th><th>Op GitHub</th>' +
        "<th>Antwoord</th><th>Taal</th><th>Gemeld</th><th></th></tr></thead><tbody>" + html +
        "</tbody></table>" +
        '<p id="geen"' + (zichtbaar ? " hidden" : "") +
        "><em>Geen meldingen die aan deze filters voldoen.</em></p></div>"
      : '<p class="vlak leeg"><em>Er zijn nog geen meldingen.</em></p>') +
    '<script src="/beheer/filters.js"></script>', kopregel(env, wie, "meldingen"));
}

/* In de kopbalk van elke beheerpagina: de weg naar de andere pagina, naar de kaart zelf,
   en wie er aangemeld is. De kaart opent in een nieuw tabblad, zodat de beheerpagina
   blijft staan: wie een filter uitzet, wil meteen kijken en dan terug. */
function kopregel(env, wie, hier) {
  const naar = (sleutel, href, tekst) => '<a class="tab" href="' + href + '"' +
    (sleutel === hier ? ' aria-current="page"' : "") + ">" + tekst + "</a>";
  return '<nav class="tabs">' + naar("meldingen", "/beheer", "Meldingen") +
      naar("kaartfilters", "/beheer/kaartfilters", "Filters op de kaart") +
      naar("datafouten", "/beheer/datafouten", "Datafouten") + "</nav>" +
    '<p class="wie"><span>aangemeld als <strong>@' + ontsnap(wie) + "</strong></span>" +
      kaartknop(env, "knop", "Naar de kaart") +
      '<a class="knop" href="/beheer/uit">Afmelden</a></p>';
}

/* Wat er niet klopt aan de auto's in de feed (datafouten.js): per fout de auto, wat er
   mis is en wanneer het gevonden werd, en een knop om het als opgelost te wissen. Een
   gewiste fout komt terug als een nieuwere feed ze nog altijd bevat. */
async function datafouten(env, wie, url) {
  let gelezen;
  try {
    gelezen = await leesOpen(env);
  } catch (e) {
    console.error("Datafouten lezen:", e.message);
    return pagina(500, "Datafouten",
      "<p>De lijst kon niet gelezen worden. Staat de tabel <code>datafouten</code> al in de " +
      "databank? Voer <code>schema.sql</code> opnieuw uit (README.md, stap 5).</p>",
      kopregel(env, wie, "datafouten"));
  }
  const { fouten, laatst, ontvangen } = gelezen;
  // Filters in de zoekstring, zoals bij de meldingen: een gefilterde lijst is een link.
  const tellingen = {};
  for (const f of fouten) {
    const s = soortVan(f.regel);
    tellingen[s] = (tellingen[s] || 0) + 1;
  }
  const soorten = { ...SOORTEN, andere: "Andere" };
  const soort = Object.hasOwn(tellingen, url.searchParams.get("soort"))
    ? url.searchParams.get("soort") : "alle";
  const zoek = (url.searchParams.get("zoek") || "").trim().slice(0, 100);
  const kleiner = zoek.toLowerCase();
  // Zonder filters geen zoekstring: dan komt "Probleem opgelost" terug op /beheer/datafouten.
  const terug = soort === "alle" && !zoek ? "" : "?" + new URLSearchParams({ soort, zoek });
  // De live vloot: niet bewaard, bij elk bezoek opnieuw. Lukt het niet, dan zegt de pagina dat.
  let nieuw = null, nieuwFout = "";
  try {
    nieuw = await nieuweAutos(env);
  } catch (e) {
    nieuwFout = e.message;
  }
  const nieuwHtml = nieuw === null
    ? '<p class="let-op">De live vloot kon niet gelezen worden (' + ontsnap(nieuwFout) + ").</p>"
    : nieuw.length
      ? '<div class="vlak lijst"><table class="nieuw"><thead><tr><th>Auto</th><th>Brandstof</th>' +
        "<th>Versnellingsbak</th></tr></thead><tbody>" + nieuw.map((a) =>
          "<tr><td><strong>" + ontsnap(a.naam) + "</strong></td><td>" +
          (ontsnap(a.brandstof) || '<span class="zacht">?</span>') + "</td><td>" +
          (ontsnap(a.bak) || '<span class="zacht">?</span>') + "</td></tr>").join("") +
        "</tbody></table></div>"
      : '<p class="vlak leeg"><em>Elke auto in de live vloot staat ook in de feed.</em></p>';
  const dag = (iso) => ontsnap(String(iso || "").slice(0, 10));
  let zichtbaar = 0;
  const rijen = fouten.map((f) => {
    const s = soortVan(f.regel);
    const zoekTekst = (f.auto + " " + f.plaats + " " + f.fout).toLowerCase();
    const toon = (soort === "alle" || s === soort) && (!kleiner || zoekTekst.includes(kleiner));
    if (toon) zichtbaar++;
    return '<tr data-soort="' + s + '" data-zoek="' + ontsnap(zoekTekst) + '"' +
      (toon ? "" : " hidden") + ">" +
      "<td><strong>" + ontsnap(f.auto) + "</strong>" +
        (f.plaats ? '<br><span class="zacht">' + ontsnap(f.plaats) + "</span>" : "") + "</td>" +
      '<td><span class="soort">' + ontsnap(soorten[s]) + "</span><br>" + ontsnap(f.fout) + "</td>" +
      '<td class="datum">' + dag(f.gevonden) + "</td>" +
      '<td><form method="post" action="/beheer/datafouten/opgelost">' +
        '<input type="hidden" name="sleutel" value="' + ontsnap(f.sleutel) + '">' +
        '<input type="hidden" name="terug" value="' + ontsnap(terug) + '">' +
        '<button class="knop">Probleem opgelost, wissen</button></form></td>' +
    "</tr>";
  }).join("");
  const keuzes = '<select name="soort"><option value="alle">Alle soorten (' + fouten.length +
    ")</option>" + Object.entries(soorten).filter(([k]) => tellingen[k]).map(([k, l]) =>
      '<option value="' + k + '"' + (k === soort ? " selected" : "") + ">" + ontsnap(l) +
      " (" + tellingen[k] + ")</option>").join("") + "</select>";
  const gefilterd = soort !== "alle" || zoek;
  return pagina(200, "Datafouten",
    "<p class=\"inleiding\">Wat er niet klopt aan de auto's in de feed: een elektrische auto " +
      "met een euronorm, een euronorm die niet bij het bouwjaar past, een veld dat " +
      "ontbreekt. Daarbij wat de generator bij de kwartaalrun al rechtzette maar in de bron " +
      "nog fout staat, zoals een merk in een andere schrijfwijze of een gemeente in " +
      "hoofdletters. Elke nacht kijkt de Worker de feed na. Verbeter de fout in de bron en druk " +
      "dan op <b>Probleem opgelost, wissen</b>. De feed wordt maar per kwartaal ververst: " +
      "een gewiste fout blijft weg tot de volgende feed, en staat ze daar nog altijd in, dan " +
      "komt ze terug. Een fout die uit de feed verdwijnt, gaat vanzelf van de lijst.</p>" +
    controleUitslag(url.searchParams) +
    '<form class="vlak controle" method="post" action="/beheer/datafouten/controleer">' +
      '<span class="zacht">' + (laatst
        ? "Laatst nagekeken op " + dag(laatst.wanneer) + ", in de feed van " +
          dag(laatst.feed) + "."
        : "Nog nooit nagekeken.") + " " + (ontvangen
        ? "Rechtzettingen van de generator ontvangen op " + dag(ontvangen.wanneer) +
          " (dump van " + dag(ontvangen.feed) + ")" +
"."
        : "Nog geen rechtzettingen van de generator ontvangen; die komen met de volgende " +
          "kwartaalrun.") + "</span>" +
      '<button class="knop">Nu controleren</button>' +
    "</form>" +
    (fouten.length
      ? '<form class="vlak filters" id="foutfilters" method="get" action="/beheer/datafouten">' +
          "<label>Soort fout " + keuzes + "</label>" +
          '<label>Zoeken <input type="search" name="zoek" value="' + ontsnap(zoek) + '" ' +
            'placeholder="auto, gemeente of tekst"></label>' +
          // Alleen voor wie geen JavaScript heeft; datafouten.js verbergt hem.
          '<button class="knop knop--hoofd" id="toon">Toon</button>' +
          ' <a href="/beheer/datafouten" id="wisfilters"' + (gefilterd ? "" : " hidden") +
          ">Wis filters</a>" +
        "</form>" +
        '<p class="telling"><span id="zichtbaar">' + zichtbaar + "</span> van " + fouten.length +
          (fouten.length === 1 ? " fout" : " fouten") + "</p>" +
        '<div class="vlak lijst"><table class="datafouten"><thead><tr><th>Auto</th>' +
        "<th>Fout in de data</th><th>Gevonden</th><th></th></tr></thead><tbody>" + rijen +
        "</tbody></table>" +
        '<p id="geen"' + (zichtbaar ? " hidden" : "") +
        "><em>Geen datafouten die aan deze filters voldoen.</em></p></div>" +
        '<script src="/beheer/datafouten.js"></script>'
      : '<p class="vlak leeg"><em>Geen datafouten gevonden.</em></p>') +
    '<h2 id="nieuw">Nieuwe auto\'s zonder gegevens' +
      (nieuw && nieuw.length ? ' <span class="zacht">(' + nieuw.length + ")</span>" : "") + "</h2>" +
    '<p class="inleiding">Deze auto\'s staan in de live vloot van Dégage, maar nog niet in de ' +
      "feed. De kaart toont ze met alleen hun naam, brandstof en versnellingsbak; merk, model, " +
      "bouwjaar, zitplaatsen, euronorm en toebehoren volgen met de volgende feed. Geen fout: " +
      "zo gaat het tussen twee kwartaalruns.</p>" + nieuwHtml,
    kopregel(env, wie, "datafouten"));
}

/* Na "Nu controleren": wat er gevonden werd, in een zin. Leest de aantallen uit de
   zoekstring die het doorsturen meegaf; zonder die zoekstring niets. */
function controleUitslag(vraag) {
  if (!vraag.has("gecontroleerd")) return "";
  const getal = (naam) => Math.max(0, parseInt(vraag.get(naam), 10) || 0);
  const fouten = (n) => n + (n === 1 ? " fout" : " fouten");
  const aantal = getal("gecontroleerd"), nieuw = getal("nieuw");
  const weg = getal("weg"), verborgen = getal("verborgen");
  let zin = "Gecontroleerd: " + (aantal
    ? fouten(aantal) + " gevonden" + (nieuw ? ", waarvan " + nieuw + " nieuw" : ", geen nieuwe")
    : "geen fouten gevonden") + ".";
  if (weg) {
    zin += " " + fouten(weg) + (weg === 1 ? " staat" : " staan") + " niet meer in de feed en " +
      (weg === 1 ? "is" : "zijn") + " van de lijst gehaald.";
  }
  if (verborgen) {
    zin += " " + fouten(verborgen) + " als opgelost gewist: " + (verborgen === 1 ? "die blijft" :
      "die blijven") + " verborgen tot een nieuwere feed.";
  }
  return '<p class="bewaard">' + ontsnap(zin) + "</p>";
}

/* Een link naar de kaart, in een nieuw tabblad; niets als KAART_URL niet ingesteld is. */
function kaartknop(env, klasse, tekst) {
  if (!env.KAART_URL) return "";
  return '<a class="' + klasse + '" href="' + ontsnap(env.KAART_URL) +
    '" target="_blank" rel="noopener">' + ontsnap(tekst) + " ↗</a>";
}

/* Welke filters de kaart toont en waar, en per filter met vakjes welke keuzes. Per
   filter drie knoppen: in de gewone lijst, onder "Meer filters" (een uitklapper onderaan
   de lijst), of niet. Per keuze een vinkje; wat uit staat, verdwijnt van de kaart. De
   kaart leest dit bij het laden (GET /instellingen), met een minuut cache. Werkt zonder
   JavaScript: een gewoon formulier. Een keuze die uit staat, blijft uit als je het hele
   filter uit- en weer aanzet: de twee staan los van elkaar. */
const PLEKKEN = { lijst: "In de lijst", meer: "Onder Meer filters", uit: "Niet tonen" };

async function kaartfilters(env, wie, url) {
  const [verborgen, verborgenOpties, meer, laatst] = await Promise.all(
    [leesVerborgen(env), leesVerborgenOpties(env), leesMeer(env), laatsteWijziging(env)]);
  const vakje = (naam, waarde, aan, label) =>
    '<label class="vakje"><input type="checkbox" name="' + naam + '" value="' + ontsnap(waarde) +
    '"' + (aan ? " checked" : "") + "> " + ontsnap(label) + "</label>";
  const vakjes = Object.entries(FILTERS).map(([sleutel, label]) => {
    const uit = verborgenOpties[sleutel] || [];
    const nu = verborgen.includes(sleutel) ? "uit" : meer.includes(sleutel) ? "meer" : "lijst";
    const plekken = '<span class="plekken">' + Object.entries(PLEKKEN).map(([p, l]) =>
      '<label class="plek"><input type="radio" name="plek/' + ontsnap(sleutel) + '" value="' + p +
      '"' + (p === nu ? " checked" : "") + "> " + l + "</label>").join("") + "</span>";
    const keuzes = OPTIES[sleutel]
      ? '<div class="keuzes">' + Object.entries(OPTIES[sleutel]).map(([k, l]) =>
          vakje("optie", sleutel + "/" + k, !uit.includes(k), l)).join("") + "</div>"
      : "";
    return '<div class="filter"><div class="filter__kop"><span class="filter__naam">' +
      ontsnap(label) + "</span>" + plekken + "</div>" + keuzes + "</div>";
  }).join("");
  return pagina(200, "Filters op de kaart",
    "<p class=\"inleiding\">Welke filters bezoekers in de filterlijst van de kaart zien, " +
      "waar, en welke keuzes erin staan. Een filter staat in de gewone lijst, onder " +
      "<b>Meer filters</b> (een uitklapper onderaan de lijst, voor wat de meeste bezoekers " +
      "niet zoeken), of niet. Wat je verbergt, verdwijnt uit de lijst; de auto's blijven " +
      "gewoon op de kaart. Een toebehoren of afspraak die uit staat, verdwijnt ook uit de " +
      "popup van elke auto. Een wijziging is binnen een minuut zichtbaar, zonder de kaart " +
      "opnieuw te publiceren.</p>" +
    (url.searchParams.get("bewaard")
      ? '<p class="bewaard">Bewaard. ' + kaartknop(env, "", "Bekijk het op de kaart") + "</p>"
      : "") +
    '<form class="vlak" method="post" action="/beheer/kaartfilters">' +
      '<fieldset class="vakjes"><legend>Tonen op de kaart</legend>' + vakjes + "</fieldset>" +
      '<div class="voet"><button class="knop knop--hoofd">Bewaren</button>' +
      (laatst ? '<span class="zacht">Laatst gewijzigd op ' + ontsnap(laatst.gewijzigd.slice(0, 10)) +
        " door @" + ontsnap(laatst.door) + ".</span>" : "") + "</div>" +
    "</form>", kopregel(env, wie, "kaartfilters"));
}

/* Het script achter de filters van de datafouten, zoals FILTERSCRIPT hieronder voor de
   meldingen: elke wijziging werkt meteen, en het adres en de terugweg van "Probleem
   opgelost" houden de filters bij. */
const DATAFOUTENSCRIPT = `"use strict";
const formulier = document.getElementById("foutfilters");
const rijen = [...document.querySelectorAll("table.datafouten tbody tr")];
const wis = document.getElementById("wisfilters");
document.getElementById("toon").hidden = true;

function pas() {
  const soort = formulier.elements.soort.value;
  const zoek = formulier.elements.zoek.value.trim();
  const kleiner = zoek.toLowerCase();
  let zichtbaar = 0;
  for (const rij of rijen) {
    const past = (soort === "alle" || rij.dataset.soort === soort) &&
      (!kleiner || rij.dataset.zoek.includes(kleiner));
    rij.hidden = !past;
    if (past) zichtbaar++;
  }
  document.getElementById("zichtbaar").textContent = zichtbaar;
  document.getElementById("geen").hidden = zichtbaar > 0;
  const standaard = soort === "alle" && !zoek;
  const terug = standaard ? "" : "?" + new URLSearchParams({ soort, zoek });
  for (const veld of document.querySelectorAll('input[name="terug"]')) veld.value = terug;
  history.replaceState(null, "", "/beheer/datafouten" + terug);
  wis.hidden = standaard;
}

formulier.addEventListener("change", pas);
formulier.addEventListener("input", pas);
formulier.addEventListener("submit", (e) => { e.preventDefault(); pas(); });
wis.addEventListener("click", (e) => {
  e.preventDefault();
  formulier.elements.soort.value = "alle";
  formulier.elements.zoek.value = "";
  pas();
});
`;

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

/* De pagina rond de inhoud, in dezelfde opmaak als de kaart (map/index.css): dezelfde kleuren,
   witte vlakken met een zachte schaduw op een lichtgrijze grond, groene hoofdknoppen. Met `nav`
   (de tabs en wie er aangemeld is, zie kopregel) staat de inhoud los op de pagina, in haar
   eigen vlakken; zonder (de foutmeldingen, het afmelden) komt ze in één vlak. Alleen licht,
   net als de kaart. Alles staat in de pagina zelf: de Worker deelt geen bestanden met de kaart. */
function pagina(status, titel, inhoud, nav = "") {
  return new Response(`<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${ontsnap(titel)} — deelautokaart Dégage</title>
<style>
  :root {
    color-scheme: light;
    --inkt: #1d2a28; --inkt-zacht: #5a6a67;
    --groen: #2f6f5e; --groen-diep: #235348; --groen-licht: #e3efeb;
    --lijn: #dfe4e2; --vlak: #ffffff; --vlak-zacht: #f4f6f5;
    --schaduw: 0 1px 2px rgba(29,42,40,.08), 0 4px 16px rgba(29,42,40,.10);
    --radius: 10px;
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
            Arial, "Noto Sans", sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.45 var(--font); color: var(--inkt); background: var(--vlak-zacht);
         -webkit-text-size-adjust: 100%; }
  a { color: var(--groen-diep); }
  [hidden] { display: none !important; }
  :focus-visible { outline: 2px solid var(--groen); outline-offset: 2px; }

  /* de kopbalk */
  .kop { background: var(--vlak); border-bottom: 1px solid var(--lijn); box-shadow: var(--schaduw); }
  .kop__binnen { max-width: 1040px; margin: 0 auto; padding: 10px 16px;
                 display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; }
  .merk { display: flex; align-items: center; gap: 10px; margin-right: auto; }
  .merk__teken { flex: none; display: grid; place-items: center; width: 34px; height: 34px;
                 color: #fff; background: var(--groen); border-radius: 9px; }
  .merk__teken svg { width: 19px; height: 19px; }
  .merk__naam { display: block; font-size: 15px; font-weight: 600; line-height: 1.2; }
  .merk__sub { display: block; font-size: 12px; color: var(--inkt-zacht); }
  .tabs { display: flex; gap: 4px; padding: 3px; background: var(--vlak-zacht);
          border: 1px solid var(--lijn); border-radius: 999px; }
  .tab { padding: 6px 14px; font-size: 13.5px; font-weight: 500; color: var(--inkt);
         text-decoration: none; border-radius: 999px; white-space: nowrap; }
  .tab:hover { background: var(--vlak); }
  .tab[aria-current="page"] { color: #fff; background: var(--groen); }
  .wie { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 13px; color: var(--inkt-zacht); }
  .wie strong { color: var(--inkt); font-weight: 600; }

  /* de inhoud */
  main { max-width: 1040px; margin: 0 auto; padding: 20px 16px 40px; }
  h1 { margin: 0 0 6px; font-size: 20px; }
  .inleiding { margin: 0 0 16px; max-width: 72ch; color: var(--inkt-zacht); }
  .vlak { margin: 0 0 14px; padding: 14px 16px; background: var(--vlak);
          border: 1px solid var(--lijn); border-radius: var(--radius); box-shadow: var(--schaduw); }
  .vlak > :first-child { margin-top: 0; }
  .vlak > :last-child { margin-bottom: 0; }
  .zacht, .leeg { color: var(--inkt-zacht); }

  /* knoppen, zoals .knop en .zoek__knop op de kaart */
  .knop { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          min-height: 36px; padding: 6px 14px; font: inherit; font-size: 13.5px; font-weight: 500;
          color: var(--inkt); text-decoration: none; background: var(--vlak);
          border: 1px solid var(--lijn); border-radius: 8px; cursor: pointer;
          transition: background .12s, border-color .12s; }
  .knop:hover { background: var(--vlak-zacht); border-color: #cfd6d3; }
  .knop--hoofd { color: #fff; font-weight: 600; background: var(--groen); border-color: var(--groen); }
  .knop--hoofd:hover { background: var(--groen-diep); border-color: var(--groen-diep); }
  .knop--gevaar { margin-top: 6px; min-height: 32px; color: #8a1f1f; background: #fdecec; border-color: #f0c4c4; }
  .knop--gevaar:hover { background: #f9dcdc; border-color: #e4a9a9; }

  /* de filters */
  .filters { display: flex; flex-wrap: wrap; gap: 10px 12px; align-items: end; }
  .filters label { display: flex; flex-direction: column; gap: 4px;
                   font-size: 12px; font-weight: 600; color: var(--inkt-zacht); }
  .filters label:has(input) { flex: 1 1 220px; }
  .filters select, .filters input {
    min-height: 38px; padding: 7px 10px; font: inherit; font-size: 13.5px; font-weight: 400;
    color: var(--inkt); background: var(--vlak); border: 1px solid var(--lijn); border-radius: 8px; }
  .filters select:hover, .filters input:hover { border-color: #cfd6d3; }
  .filters input::placeholder { color: var(--inkt-zacht); }
  .filters select:focus-visible, .filters input:focus-visible { outline-offset: -1px; }
  #wisfilters { align-self: center; margin-top: 18px; font-size: 13px; }
  .telling { margin: 0 0 10px; font-size: 13px; color: var(--inkt-zacht); font-variant-numeric: tabular-nums; }

  /* de lijst */
  .lijst { padding: 0; overflow: hidden; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th { padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 600; color: var(--inkt-zacht);
       text-transform: uppercase; letter-spacing: .03em; background: var(--vlak-zacht);
       border-bottom: 1px solid var(--lijn); }
  td { padding: 11px 14px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--lijn); }
  tbody tr:hover { background: #fafbfa; }
  tbody tr:last-child td { border-bottom: 0; }
  td:first-child a { font-weight: 600; text-decoration: none; }
  /* Het nummer én de titel zijn de link naar GitHub: alleen "#12" was te klein om te raken. */
  .melding { display: inline-block; padding: 3px 0; }
  .melding:hover { text-decoration: underline; }
  td:nth-child(3) { word-break: break-all; }
  td .zacht { font-size: 12.5px; }
  #geen { margin: 0; padding: 14px; color: var(--inkt-zacht); }
  .label { display: inline-block; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 600;
           line-height: 20px; white-space: nowrap; color: var(--groen-diep); background: var(--groen-licht);
           border: 1px solid #b9d6cc; }
  summary { cursor: pointer; font-size: 13px; color: var(--inkt-zacht); }
  summary:hover { color: var(--inkt); }

  /* meldingen, zoals het voorbehoud in het meldvenster van de kaart */
  .let-op, .bewaard { margin: 0 0 14px; padding: 9px 12px; border-radius: 8px; }
  .let-op { color: var(--inkt); background: #fff7e0; border: 1px solid #ecd9a0; border-left: 4px solid #c99a1e; }
  .bewaard { color: var(--groen-diep); background: var(--groen-licht); border: 1px solid #b9d6cc;
             border-left: 4px solid var(--groen); font-weight: 600; }

  /* de datafouten */
  .controle { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
              gap: 8px 14px; font-size: 13.5px; }
  .datafouten td:nth-child(2) { word-break: normal; max-width: 52ch; }
  .datafouten td.datum { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .datafouten .knop { min-height: 32px; white-space: nowrap; }
  .datafouten .soort { font-size: 12px; font-weight: 600; color: var(--inkt-zacht);
                       text-transform: uppercase; letter-spacing: .03em; }
  main h2 { margin: 26px 0 6px; font-size: 17px; }

  /* de kaartfilters */
  .vakjes { display: grid; gap: 2px; margin: 0; padding: 0; border: 0; }
  .filter { padding: 2px 0 6px; border-bottom: 1px solid var(--lijn); }
  .filter:last-child { border-bottom: 0; }
  .filter__kop { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; padding: 6px 8px; }
  .filter__naam { flex: 1 1 200px; font-weight: 600; }
  .plekken { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--lijn); border-radius: 8px;
             overflow: hidden; font-size: 13px; }
  .plek { display: flex; align-items: center; gap: 6px; padding: 5px 10px; cursor: pointer; }
  .plek + .plek { border-left: 1px solid var(--lijn); }
  .plek:hover { background: var(--vlak-zacht); }
  .plek:has(input:checked) { background: var(--groen); color: #fff; }
  .plek:has(input[value="uit"]:checked) { background: var(--inkt-zacht); }
  .plek input { margin: 0; accent-color: #fff; }
  .plek:has(input:focus-visible) { outline: 2px solid var(--groen); outline-offset: -2px; }
  .filter .keuzes { display: flex; flex-wrap: wrap; gap: 0 6px; padding-left: 8px; font-size: 14px; }
  .filter:has(input[value="uit"]:checked) .keuzes { opacity: .5; }
  .vakjes legend { margin-bottom: 8px; padding: 0; font-weight: 600; }
  .vakje { display: flex; gap: 9px; align-items: center; padding: 6px 8px; border-radius: 8px; cursor: pointer; }
  .vakje:hover { background: var(--vlak-zacht); }
  .vakje input { flex: none; width: 16px; height: 16px; margin: 0; accent-color: var(--groen); }
  .voet { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px;
          margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--lijn); font-size: 13px; }

  @media (max-width: 640px) {
    .kop__binnen { padding: 10px 12px; }
    .tabs { order: 3; width: 100%; }
    .tab { flex: 1; text-align: center; }
    /* Wie er aangemeld is op een eigen regel, de twee knoppen eronder naast elkaar: met
       "Naar de kaart" erbij past het niet meer op één regel. */
    .wie { width: 100%; flex-wrap: wrap; gap: 8px; }
    .wie span { flex: 1 1 100%; }
    .wie .knop { flex: 1; }
    main { padding: 16px 12px 32px; }
    .filters label { flex: 1 1 140px; }
    thead { display: none; }
    tr, td { display: block; }
    tr { padding: 10px 14px; border-bottom: 1px solid var(--lijn); }
    tbody tr:last-child { border-bottom: 0; }
    td { border: 0; padding: 2px 0; }
  }
</style>
</head>
<body>
<header class="kop"><div class="kop__binnen">
  <div class="merk">
    <span class="merk__teken"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/></svg></span>
    <span><span class="merk__naam">Deelautokaart Dégage</span><span class="merk__sub">Beheer</span></span>
  </div>
  ${nav}
</div></header>
<main>
<h1>${ontsnap(titel)}</h1>
${nav ? inhoud : '<div class="vlak">' + inhoud + "</div>"}
</main>
</body>
</html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
      /* `same-origin` en niet `no-referrer`: met `no-referrer` zet de browser bij het
         versturen van een formulier `Origin: null`, en dan weigerde komtVanHier() elk
         formulier op deze pagina's ("Dit verzoek kwam niet van deze pagina"). Naar andere
         sites gaat er met `same-origin` nog altijd geen verwijzer mee. */
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff"
    }
  });
}


/* ---- hulpjes ------------------------------------------------------------------------- */

/* Kwam dit formulier van een beheerpagina zelf, en niet van een andere site? De `Origin`
   moet ons eigen adres zijn. Een browser die `Origin: null` stuurt — een pagina die nog
   met de oude `Referrer-Policy: no-referrer` in een tabblad openstaat — zegt het ook met
   `Sec-Fetch-Site`, dat een pagina niet zelf kan zetten. Geen van beide: weigeren. */
function komtVanHier(request, url) {
  const herkomst = request.headers.get("Origin");
  if (herkomst && herkomst !== "null") return herkomst === url.origin;
  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

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
