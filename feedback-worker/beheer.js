/* De beheerpagina (/beheer) en de opruimtaak: de meldingen, met de mailadressen van wie
   een antwoord vroeg en wie al antwoordde; op /beheer/kaartfilters welke filters de kaart
   toont (instellingen.js); op /beheer/datafouten wat er niet klopt aan de feed
   (datafouten.js), ook als CSV.
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
         laatsteWijziging, telKeuzes }
  from "./instellingen.js";
import { werkBij, leesOpen, markeerOpgelost, zetTerug, telOpen, vergelijkVloot, SOORTEN,
         soortVan }
  from "./datafouten.js";
import { SOORTEN as MELDSOORTEN } from "./meldsoorten.js";

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
      await vergeetBeantwoord(env);
    }
    // Terug naar het overzicht met dezelfde filters. Alleen een zoekstring, nooit een adres.
    const terug = String(formulier.get("terug") || "");
    return doorsturen(url.origin + "/beheer" + (terug.startsWith("?") ? terug : ""), [], 303);
  }
  if (pad === "/beheer/beantwoord" && request.method === "POST") {
    if (!komtVanHier(request, url)) {
      return pagina(403, "Geweigerd", "<p>Dit verzoek kwam niet van deze pagina.</p>");
    }
    const formulier = await request.formData();
    const issue = Number(formulier.get("issue"));
    const terug = String(formulier.get("terug") || "");
    if (Number.isInteger(issue)) {
      try {
        await (formulier.get("aan") === "1"
          ? env.DB.prepare("INSERT OR REPLACE INTO beantwoord (issue, door, wanneer) " +
              "SELECT issue, ?, ? FROM contact WHERE issue = ?")
              .bind(wie, new Date().toISOString(), issue)
          : env.DB.prepare("DELETE FROM beantwoord WHERE issue = ?").bind(issue)).run();
      } catch (e) {
        console.error("Beantwoord bewaren:", e.message);
        return pagina(500, "Niet bewaard",
          "<p>Dat de melding beantwoord is, kon niet bewaard worden. Staat de tabel " +
          "<code>beantwoord</code> al in de databank? Voer <code>schema.sql</code> opnieuw " +
          "uit (README.md, stap 5).</p>" +
          '<p><a href="/beheer' + ontsnap(terug.startsWith("?") ? terug : "") + '">Terug</a></p>');
      }
    }
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
  if (pad === "/beheer/datafouten/terugzetten" && request.method === "POST") {
    if (!komtVanHier(request, url)) {
      return pagina(403, "Geweigerd", "<p>Dit verzoek kwam niet van deze pagina.</p>");
    }
    const formulier = await request.formData();
    const sleutel = String(formulier.get("sleutel") || "");
    if (sleutel) await zetTerug(env, sleutel);
    return doorsturen(url.origin + "/beheer/datafouten?teruggezet=1", [], 303);
  }
  if (pad === "/beheer/datafouten.csv") return datafoutenCsv(env);
  if (pad === "/beheer/datafouten/controleer" && request.method === "POST") {
    if (!komtVanHier(request, url)) {
      return pagina(403, "Geweigerd", "<p>Dit verzoek kwam niet van deze pagina.</p>");
    }
    let uitslag;
    try {
      uitslag = await werkBij(env);
    } catch (e) {
      console.error("Datafouten:", e.message);
      // Alleen bij een ontbrekende tabel de raad om schema.sql uit te voeren.
      const tabel = /no such table/i.test(e.message)
        ? " Staat de tabel <code>datafouten</code> al in de databank? Voer " +
          "<code>schema.sql</code> opnieuw uit (README.md, stap 5)."
        : "";
      return pagina(500, "Niet gecontroleerd",
        "<p>De feed kon niet nagekeken worden: " + ontsnap(e.message) + ". De lijst is niet " +
        "gewijzigd." + tabel + '</p><p><a href="/beheer/datafouten">Terug</a></p>');
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
  await vergeetBeantwoord(env);
}

/* Wat er in `beantwoord` staat over een melding waarvan het adres weg is, gaat mee weg.
   Apart van het wissen zelf, en zonder fout als de tabel er (nog) niet is: dat het wissen
   van een mailadres lukt, mag daar nooit van afhangen. */
async function vergeetBeantwoord(env) {
  try {
    await env.DB.prepare(
      "DELETE FROM beantwoord WHERE issue NOT IN (SELECT issue FROM contact)").run();
  } catch (e) {
    console.error("Beantwoord opruimen:", e.message);
  }
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
const ANTWOORD = {
  alle: "Alle meldingen", wacht: "Wacht op antwoord", beantwoord: "Beantwoord",
  ja: "Met mailadres", nee: "Zonder mailadres"
};
const SOORT = { alle: "Alle soorten", ...MELDSOORTEN, onbekend: "Soort onbekend" };
/* Zoveel dagen vóór het adres gewist wordt, valt een onbeantwoorde melding op. */
const DRINGEND_DAGEN = 7;

/* Het overzicht: alle meldingen (issues met het label "feedback") van GitHub, aangevuld met
   wat alleen in de databank staat: het mailadres, en of iemand al antwoordde. Een melding
   met een mailadres krijgt het label "antwoord gewenst", tot een beheerder ze als
   beantwoord markeert. Die labels bestaan alleen op deze pagina, niet op GitHub: ze volgen
   rechtstreeks uit de databank, en verdwijnen vanzelf met het mailadres.

   Per melding ook wat er gemeld werd (soort en beschrijving, uit het issue zelf), zodat
   je niet elk issue op GitHub hoeft te openen om te weten waarover het gaat.

   De filters staan in de zoekstring (?status=…&antwoord=…&soort=…&taal=…&zoek=…), zodat
   een gefilterde lijst een gewone link is en "Wissen" naar dezelfde lijst terugkeert. */
async function overzicht(env, wie, url) {
  const vraag = url.searchParams;
  const kies = (naam, opties, standaard) =>
    Object.hasOwn(opties, vraag.get(naam)) ? vraag.get(naam) : standaard;
  const status = kies("status", STATUSSEN, "open");
  const antwoord = kies("antwoord", ANTWOORD, "alle");
  const soort = kies("soort", SOORT, "alle");
  const taal = kies("taal", TALEN, "alle");
  const zoek = (vraag.get("zoek") || "").trim().slice(0, 100);

  const { results } = await env.DB.prepare(
    "SELECT issue, titel, mail, taal, aangemaakt FROM contact"
  ).all();
  const mails = new Map(results.map((r) => [r.issue, r]));
  const beantwoord = await leesBeantwoord(env);
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
  const kenmerken = (i, inhoud) => {
    const m = mails.get(i.number);
    return {
      status: i.onbekend ? "" : i.state === "closed" ? "gesloten" : "open",
      antwoord: !m ? "nee" : beantwoord.has(i.number) ? "beantwoord" : "wacht",
      soort: inhoud.soort,
      taal: (m && m.taal) || inhoud.taal,
      zoek: (i.title + " " + inhoud.tekst + " " + (m ? m.mail : "") + " #" + i.number +
             (i.user ? " @" + i.user.login : "")).toLowerCase()
    };
  };
  const kleiner = zoek.toLowerCase();
  const past = (k) =>
    (status === "alle" || !k.status || k.status === status) &&
    (antwoord === "alle" || k.antwoord === antwoord || (antwoord === "ja" && k.antwoord !== "nee")) &&
    (soort === "alle" || k.soort === soort) &&
    (taal === "alle" || k.taal === taal) &&
    (!kleiner || k.zoek.includes(kleiner));

  const terug = "?" + new URLSearchParams({ status, antwoord, soort, taal, zoek }).toString();
  // Per keuze in de filters: hoeveel meldingen er zo zijn, los van de andere filters.
  const tel = { status: {}, antwoord: {}, soort: {}, taal: {} };
  const plus = (filter, waarde) => { tel[filter][waarde] = (tel[filter][waarde] || 0) + 1; };
  let zichtbaar = 0;
  const html = rijen.map((i) => {
    const m = mails.get(i.number);
    const inhoud = uitIssue(i);
    const k = kenmerken(i, inhoud);
    if (k.status) plus("status", k.status);
    plus("antwoord", k.antwoord);
    if (k.antwoord !== "nee") plus("antwoord", "ja");
    plus("soort", k.soort);
    if (k.taal) plus("taal", k.taal);
    const toon = past(k);
    if (toon) zichtbaar++;
    const klaar = beantwoord.get(i.number);
    let contact = '<span class="zacht">—</span>';
    if (m) {
      const onderwerp = (ONDERWERP[m.taal] || ONDERWERP.nl) + " (#" + i.number + ")";
      const mailto = "mailto:" + m.mail + "?subject=" + encodeURIComponent(onderwerp) +
        "&body=" + encodeURIComponent(mailtekst(m.taal, inhoud.tekst));
      contact = (klaar
          ? '<span class="label label--klaar">beantwoord</span><br><span class="zacht">door @' +
            ontsnap(klaar.door) + ', op <span class="datum">' + ontsnap(klaar.wanneer.slice(0, 10)) +
            "</span></span><br>"
          : '<span class="label">antwoord gewenst</span><br>') +
        '<a href="' + ontsnap(mailto) + '">' + ontsnap(m.mail) + "</a>" +
        '<form method="post" action="/beheer/beantwoord">' +
          '<input type="hidden" name="issue" value="' + i.number + '">' +
          '<input type="hidden" name="aan" value="' + (klaar ? "0" : "1") + '">' +
          '<input type="hidden" name="terug" value="' + ontsnap(terug) + '">' +
          '<button class="knop knop--klein">' +
            (klaar ? "Toch niet beantwoord" : "Markeer als beantwoord") + "</button></form>";
    } else if (i.user && i.user.type !== "Bot") {
      contact = '<span class="zacht">op GitHub, aan @' + ontsnap(i.user.login) + "</span>";
    }
    return '<tr data-status="' + k.status + '" data-antwoord="' + k.antwoord + '" ' +
        'data-soort="' + k.soort + '" data-taal="' + ontsnap(k.taal) + '" ' +
        'data-zoek="' + ontsnap(k.zoek) + '"' + (toon ? "" : " hidden") + ">" +
      '<td><a href="https://github.com/' + ontsnap(env.GITHUB_REPO) + "/issues/" + i.number +
        '" class="melding">#' + i.number + " " + ontsnap(korteTitel(i.title)) + "</a><br>" +
        (k.soort !== "onbekend" ? '<span class="soort">' + ontsnap(SOORT[k.soort]) + "</span> · " : "") +
        '<span class="zacht">' + herkomst(i) + "</span>" + beschrijving(inhoud.tekst) + "</td>" +
      "<td>" + toestand(i, dagen, !!m && !klaar) + "</td>" +
      "<td>" + contact + "</td>" +
      "<td>" + ontsnap(TALEN[k.taal] || "?") + "</td>" +
      '<td class="datum">' + ontsnap(String(i.created_at).slice(0, 10)) + "</td>" +
      "<td>" + (m
        ? '<details><summary>Adres wissen</summary><form method="post" action="/beheer/wis">' +
          '<input type="hidden" name="issue" value="' + i.number + '">' +
          '<input type="hidden" name="terug" value="' + ontsnap(terug) + '">' +
          '<button class="knop knop--gevaar">Ja, wis dit adres</button></form></details>'
        : "") + "</td>" +
      "</tr>";
  }).join("");

  const keuze = (naam, opties, gekozen) =>
    '<select name="' + naam + '">' + Object.entries(opties).map(([waarde, label]) =>
      '<option value="' + waarde + '"' + (waarde === gekozen ? " selected" : "") + ">" +
      ontsnap(label) + (waarde === "alle" ? "" : " (" + (tel[naam][waarde] || 0) + ")") +
      "</option>").join("") + "</select>";
  const gefilterd = status !== "open" || antwoord !== "alle" || soort !== "alle" ||
    taal !== "alle" || zoek;

  return pagina(200, "Meldingen",
    "<p class=\"inleiding\">Alle meldingen over de kaart: de issues met het label <code>feedback</code>. Wie op " +
      'de kaart een mailadres achterliet, krijgt hier het label <span class="label">antwoord ' +
      "gewenst</span>: klik op het adres, en je mail staat klaar in de taal van de melder, " +
      "met de melding erin. Gemaild? Markeer de melding dan als beantwoord, zodat de andere " +
      "beheerders het weten. Het adres staat niet op GitHub, alleen hier, en verdwijnt " +
      "vanzelf " + dagen + " dagen nadat het issue gesloten is.</p>" +
    '<form class="vlak filters" method="get" action="/beheer">' +
      "<label>Status " + keuze("status", STATUSSEN, status) + "</label>" +
      "<label>Antwoord " + keuze("antwoord", ANTWOORD, antwoord) + "</label>" +
      "<label>Soort " + keuze("soort", SOORT, soort) + "</label>" +
      "<label>Taal " + keuze("taal", TALEN, taal) + "</label>" +
      '<label>Zoeken <input type="search" name="zoek" value="' + ontsnap(zoek) + '" ' +
        'placeholder="titel, tekst, mailadres, #nummer of @naam"></label>' +
      // Alleen voor wie geen JavaScript heeft; filters.js verbergt hem.
      '<button class="knop knop--hoofd" id="toon">Toon</button>' +
      ' <a href="/beheer" id="wisfilters"' + (gefilterd ? "" : " hidden") + ">Wis filters</a>" +
    "</form>" +
    (storing
      ? '<p class="let-op">GitHub gaf de meldingen niet door. Hieronder staan alleen de ' +
        "meldingen met een mailadres, zonder hun toestand en inhoud.</p>" : "") +
    '<p class="telling"><span id="zichtbaar">' + zichtbaar + "</span> van " + rijen.length +
      " meldingen</p>" +
    (html
      ? '<div class="vlak lijst"><table class="meldingen"><thead><tr><th>Melding</th>' +
        "<th>Op GitHub</th><th>Antwoord</th><th>Taal</th><th>Gemeld</th><th></th></tr></thead>" +
        "<tbody>" + html + "</tbody></table>" +
        '<p id="geen"' + (zichtbaar ? " hidden" : "") +
        "><em>Geen meldingen die aan deze filters voldoen.</em></p></div>"
      : '<p class="vlak leeg"><em>Er zijn nog geen meldingen.</em></p>') +
    '<script src="/beheer/filters.js"></script>', await kopregel(env, wie, "meldingen"));
}

/* Wie welke melding beantwoordde, als Map issue → { door, wanneer }. Leeg als de tabel
   er (nog) niet is: dan is gewoon niets beantwoord, en werkt de rest van de pagina. */
async function leesBeantwoord(env) {
  try {
    const { results } = await env.DB.prepare("SELECT issue, door, wanneer FROM beantwoord").all();
    return new Map(results.map((r) => [r.issue, r]));
  } catch (e) {
    console.error("Beantwoord lezen:", e.message);
    return new Map();
  }
}

/* De tekst van een antwoordmail, klaar om verder te schrijven: een aanspreking, de melding
   geciteerd, en ruimte voor het antwoord. Het citaat is ingekort: een mailto-link van
   meer dan een paar duizend tekens opent niet in elk mailprogramma. */
const MAILTEKST = {
  nl: ["Hallo,", "Bedankt voor je melding over de deelautokaart van Dégage:", "Groeten,"],
  fr: ["Bonjour,", "Merci pour votre signalement sur la carte des voitures partagées de Dégage :",
       "Cordialement,"],
  en: ["Hello,", "Thank you for your report about the Dégage car-sharing map:", "Kind regards,"]
};

function mailtekst(taal, tekst) {
  const [aanspreking, inleiding, groet] = MAILTEKST[taal] || MAILTEKST.nl;
  const kort = tekst.length > 500 ? tekst.slice(0, 499).trimEnd() + "…" : tekst;
  const citaat = kort ? "\n\n" + kort.split("\n").map((r) => "> " + r).join("\n") : "";
  return aanspreking + "\n\n" + inleiding + citaat + "\n\n\n\n" + groet + "\n";
}

/* De beschrijving in de rij: is ze kort, dan helemaal; anders het begin, en de rest open
   te klappen. */
function beschrijving(tekst) {
  if (!tekst) return "";
  if (tekst.length <= 180) return '<p class="tekst">' + ontsnap(tekst) + "</p>";
  return '<details class="tekst"><summary>' + ontsnap(tekst.slice(0, 160).trimEnd()) +
    "…</summary>" + ontsnap(tekst) + "</details>";
}

/* De titel zonder "[Feedback] ": dat staat voor elke melding, en zegt hier dus niets. */
function korteTitel(titel) {
  return String(titel).replace(/^\s*\[feedback\]\s*/i, "") || String(titel);
}

/* In de kopbalk van elke beheerpagina: de weg naar de andere pagina, naar de kaart zelf,
   en wie er aangemeld is. De kaart opent in een nieuw tabblad, zodat de beheerpagina
   blijft staan: wie een filter uitzet, wil meteen kijken en dan terug.

   Bij Meldingen en Datafouten een teller met wat er te doen is: de meldingen die op een
   antwoord wachten, de open datafouten. Alleen uit de databank, zonder GitHub te vragen;
   lukt het niet, dan geen teller. */
async function kopregel(env, wie, hier) {
  const [wacht, fouten] = await Promise.all([telWacht(env), telOpen(env).catch(() => 0)]);
  const naar = (sleutel, href, tekst, aantal, uitleg) => '<a class="tab" href="' + href + '"' +
    (sleutel === hier ? ' aria-current="page"' : "") + ">" + tekst +
    (aantal ? ' <span class="teller" title="' + uitleg + '">' + aantal + "</span>" : "") +
    "</a>";
  return '<nav class="tabs">' +
      naar("meldingen", "/beheer", "Meldingen", wacht, wacht === 1
        ? "1 melding wacht op antwoord" : wacht + " meldingen wachten op antwoord") +
      naar("kaartfilters", "/beheer/kaartfilters", "Filters op de kaart") +
      naar("datafouten", "/beheer/datafouten", "Datafouten", fouten,
        fouten === 1 ? "1 datafout open" : fouten + " datafouten open") + "</nav>" +
    '<p class="wie"><span>aangemeld als <strong>@' + ontsnap(wie) + "</strong></span>" +
      kaartknop(env, "knop", "Naar de kaart") +
      '<a class="knop" href="/beheer/uit">Afmelden</a></p>';
}

/* Hoeveel meldingen met een mailadres nog niet als beantwoord gemarkeerd zijn. Zonder
   tabel `beantwoord`: alle meldingen met een mailadres. */
async function telWacht(env) {
  try {
    const rij = await env.DB.prepare("SELECT COUNT(*) AS n FROM contact " +
      "WHERE issue NOT IN (SELECT issue FROM beantwoord)").first();
    return rij ? rij.n : 0;
  } catch (e) {
    const rij = await env.DB.prepare("SELECT COUNT(*) AS n FROM contact").first().catch(() => null);
    return rij ? rij.n : 0;
  }
}

/* Wat er niet klopt aan de auto's in de feed (datafouten.js), per auto bij elkaar: wie de
   bron verbetert, opent een auto één keer en ziet zo alles wat eraan schort. Per fout wat
   er mis is, wanneer het gevonden werd, en een knop om het als opgelost te wissen. Een
   gewiste fout komt terug als een nieuwere feed ze nog altijd bevat, en staat tot dan
   onderaan, terug te zetten.

   Een auto die niet meer in de live vloot staat, toont de kaart niet; zijn fouten staan
   standaard verborgen (filter "Vloot"). */
const VLOOT = { in: "Alleen in de vloot", alle: "Ook niet meer in de vloot" };

async function datafouten(env, wie, url) {
  let gelezen;
  try {
    gelezen = await leesOpen(env);
  } catch (e) {
    console.error("Datafouten lezen:", e.message);
    return pagina(500, "Datafouten",
      "<p>De lijst kon niet gelezen worden. Staat de tabel <code>datafouten</code> al in de " +
      "databank? Voer <code>schema.sql</code> opnieuw uit (README.md, stap 5).</p>",
      await kopregel(env, wie, "datafouten"));
  }
  const { fouten, gewist, laatst, ontvangen } = gelezen;
  // De live vloot: niet bewaard, bij elk bezoek opnieuw. Lukt het niet, dan zegt de pagina
  // dat, en verbergt ze niets.
  let vloot = null, vlootFout = "";
  try {
    vloot = await vergelijkVloot(env);
  } catch (e) {
    vlootFout = e.message;
  }
  const uitDienst = vloot ? vloot.nietMeerInVloot : new Set();

  // Filters in de zoekstring, zoals bij de meldingen: een gefilterde lijst is een link.
  const tellingen = {};
  for (const f of fouten) {
    const s = soortVan(f.regel);
    tellingen[s] = (tellingen[s] || 0) + 1;
  }
  const soorten = { ...SOORTEN, andere: "Andere" };
  const vraag = url.searchParams;
  const soort = Object.hasOwn(tellingen, vraag.get("soort")) ? vraag.get("soort") : "alle";
  const welke = Object.hasOwn(VLOOT, vraag.get("vloot")) ? vraag.get("vloot") : "in";
  const zoek = (vraag.get("zoek") || "").trim().slice(0, 100);
  const kleiner = zoek.toLowerCase();
  const standaard = soort === "alle" && welke === "in" && !zoek;
  // Zonder filters geen zoekstring: dan komt "Opgelost, wissen" terug op /beheer/datafouten.
  const terug = standaard ? "" : "?" + new URLSearchParams({ soort, vloot: welke, zoek });

  const dag = (iso) => ontsnap(String(iso || "").slice(0, 10));
  // Per auto bij elkaar; leesOpen() gaf ze al op naam gesorteerd.
  const perAuto = new Map();
  for (const f of fouten) {
    if (!perAuto.has(f.auto)) perAuto.set(f.auto, []);
    perAuto.get(f.auto).push(f);
  }
  let zichtbaar = 0, autos = 0, uitDienstFouten = 0;
  const rijen = [...perAuto].map(([auto, lijst]) => {
    const weg = uitDienst.has(auto);
    if (weg) uitDienstFouten += lijst.length;
    const autoTekst = (auto + " " + lijst[0].plaats).toLowerCase();
    let hier = 0;
    const items = lijst.map((f) => {
      const s = soortVan(f.regel);
      const zoekTekst = autoTekst + " " + f.fout.toLowerCase();
      const toon = (welke === "alle" || !weg) && (soort === "alle" || s === soort) &&
        (!kleiner || zoekTekst.includes(kleiner));
      if (toon) hier++;
      return '<li data-soort="' + s + '" data-zoek="' + ontsnap(zoekTekst) + '"' +
        (toon ? "" : " hidden") + ">" +
        '<div><span class="soort">' + ontsnap(soorten[s]) + "</span> " +
          '<span class="zacht">gevonden ' + dag(f.gevonden) + "</span><br>" +
          ontsnap(f.fout) + "</div>" +
        '<form method="post" action="/beheer/datafouten/opgelost">' +
          '<input type="hidden" name="sleutel" value="' + ontsnap(f.sleutel) + '">' +
          '<input type="hidden" name="terug" value="' + ontsnap(terug) + '">' +
          '<button class="knop knop--klein">Opgelost, wissen</button></form>' +
      "</li>";
    }).join("");
    zichtbaar += hier;
    if (hier) autos++;
    return '<tr data-vloot="' + (weg ? "uit" : "in") + '"' + (hier ? "" : " hidden") + ">" +
      "<td><strong>" + ontsnap(auto) + "</strong>" +
        (lijst[0].plaats ? '<br><span class="zacht">' + ontsnap(lijst[0].plaats) + "</span>" : "") +
        (weg ? '<br><span class="label label--uit">niet meer in de vloot</span>' : "") + "</td>" +
      '<td><ul class="fouten">' + items + "</ul></td>" +
    "</tr>";
  }).join("");

  const keuzes = '<select name="soort"><option value="alle">Alle soorten (' + fouten.length +
    ")</option>" + Object.entries(soorten).filter(([k]) => tellingen[k]).map(([k, l]) =>
      '<option value="' + k + '"' + (k === soort ? " selected" : "") + ">" + ontsnap(l) +
      " (" + tellingen[k] + ")</option>").join("") + "</select>";
  const vlootKeuze = '<select name="vloot">' + Object.entries(VLOOT).map(([k, l]) =>
    '<option value="' + k + '"' + (k === welke ? " selected" : "") + ">" + ontsnap(l) +
    (k === "alle" ? " (+" + uitDienstFouten + ")" : "") + "</option>").join("") + "</select>";

  const nieuw = vloot && vloot.nieuw;
  const nieuwHtml = !vloot
    ? '<p class="let-op">De live vloot kon niet gelezen worden (' + ontsnap(vlootFout) + ").</p>"
    : nieuw.length
      ? '<div class="vlak lijst"><table class="nieuw"><thead><tr><th>Auto</th><th>Brandstof</th>' +
        "<th>Versnellingsbak</th></tr></thead><tbody>" + nieuw.map((a) =>
          "<tr><td><strong>" + ontsnap(a.naam) + "</strong></td><td>" +
          (ontsnap(a.brandstof) || '<span class="zacht">?</span>') + "</td><td>" +
          (ontsnap(a.bak) || '<span class="zacht">?</span>') + "</td></tr>").join("") +
        "</tbody></table></div>"
      : '<p class="vlak leeg"><em>Elke auto in de live vloot staat ook in de feed.</em></p>';

  const gewistHtml = gewist.length
    ? '<details class="vlak gewist"><summary>Als opgelost gewist (' + gewist.length + ")</summary>" +
      '<p class="zacht">Verborgen tot een nieuwere feed; staat de fout daar nog in, dan komt ze ' +
        "vanzelf terug. Per vergissing gewist? Zet ze terug.</p>" +
      '<table><thead><tr><th>Auto</th><th>Fout</th><th>Gewist</th><th></th></tr></thead><tbody>' +
      gewist.map((f) =>
        "<tr><td><strong>" + ontsnap(f.auto) + "</strong></td>" +
        "<td>" + ontsnap(f.fout) + "</td>" +
        '<td class="datum">' + dag(f.opgelost) +
          (f.opgelost_door ? '<br><span class="zacht">door @' + ontsnap(f.opgelost_door) + "</span>" : "") +
        "</td>" +
        '<td><form method="post" action="/beheer/datafouten/terugzetten">' +
          '<input type="hidden" name="sleutel" value="' + ontsnap(f.sleutel) + '">' +
          '<button class="knop knop--klein">Terugzetten</button></form></td></tr>').join("") +
      "</tbody></table></details>"
    : "";

  return pagina(200, "Datafouten",
    "<p class=\"inleiding\">Wat er niet klopt aan de auto's in de feed, per auto. Verbeter het " +
      "in de bron en druk dan op <b>Opgelost, wissen</b>. Auto's die niet meer in de live " +
      "vloot staan, toont de kaart niet: hun fouten staan standaard verborgen.</p>" +
    '<details class="uitleg"><summary>Hoe dit werkt</summary>' +
      "<p>Elke nacht kijkt de Worker de feed na: een elektrische auto met een euronorm, een " +
      "euronorm die niet bij het bouwjaar past, een veld dat ontbreekt. Daarbij komt wat de " +
      "generator bij de kwartaalrun al rechtzette maar in de bron nog fout staat, zoals een " +
      "merk in een andere schrijfwijze of een gemeente in hoofdletters.</p>" +
      "<p>De feed wordt maar per kwartaal ververst. Een gewiste fout blijft weg tot de " +
      "volgende feed; staat ze daar nog altijd in, dan komt ze terug. Een fout die uit de " +
      "feed verdwijnt, gaat vanzelf van de lijst.</p></details>" +
    controleUitslag(vraag) +
    (vraag.get("teruggezet") ? '<p class="bewaard">Teruggezet: de fout staat weer open.</p>' : "") +
    '<form class="vlak controle" method="post" action="/beheer/datafouten/controleer">' +
      '<span class="zacht">' + (laatst
        ? "Laatst nagekeken op " + dag(laatst.wanneer) + ", in de feed van " +
          dag(laatst.feed) + "."
        : "Nog nooit nagekeken.") + " " + (ontvangen
        ? "Rechtzettingen van de generator ontvangen op " + dag(ontvangen.wanneer) +
          " (dump van " + dag(ontvangen.feed) + ")."
        : "Nog geen rechtzettingen van de generator ontvangen; die komen met de volgende " +
          "kwartaalrun.") + "</span>" +
      '<button class="knop">Nu controleren</button>' +
    "</form>" +
    (fouten.length
      ? '<form class="vlak filters" id="foutfilters" method="get" action="/beheer/datafouten">' +
          "<label>Soort fout " + keuzes + "</label>" +
          (uitDienstFouten ? "<label>Vloot " + vlootKeuze + "</label>"
                           : '<input type="hidden" name="vloot" value="' + welke + '">') +
          '<label>Zoeken <input type="search" name="zoek" value="' + ontsnap(zoek) + '" ' +
            'placeholder="auto, gemeente of tekst"></label>' +
          // Alleen voor wie geen JavaScript heeft; datafouten.js verbergt hem.
          '<button class="knop knop--hoofd" id="toon">Toon</button>' +
          ' <a href="/beheer/datafouten" id="wisfilters"' + (standaard ? " hidden" : "") +
          ">Wis filters</a>" +
        "</form>" +
        '<p class="telling"><span id="zichtbaar">' + zichtbaar + "</span> van " + fouten.length +
          (fouten.length === 1 ? " fout" : " fouten") + ', bij <span id="autos">' + autos +
          "</span> auto's · " +
          '<a href="/beheer/datafouten.csv" download>Alles als CSV, voor wie de bron beheert</a></p>' +
        '<div class="vlak lijst"><table class="datafouten"><thead><tr><th>Auto</th>' +
        "<th>Fouten in de data</th></tr></thead><tbody>" + rijen +
        "</tbody></table>" +
        '<p id="geen"' + (zichtbaar ? " hidden" : "") +
        "><em>Geen datafouten die aan deze filters voldoen.</em></p></div>" +
        '<script src="/beheer/datafouten.js"></script>'
      : '<p class="vlak leeg"><em>Geen datafouten gevonden.</em></p>') +
    gewistHtml +
    '<h2 id="nieuw">Nieuwe auto\'s zonder gegevens' +
      (nieuw && nieuw.length ? ' <span class="zacht">(' + nieuw.length + ")</span>" : "") + "</h2>" +
    '<p class="inleiding">Deze auto\'s staan in de live vloot van Dégage, maar nog niet in de ' +
      "feed. De kaart toont ze met alleen hun naam, brandstof en versnellingsbak; merk, model, " +
      "bouwjaar, zitplaatsen, euronorm en toebehoren volgen met de volgende feed. Geen fout: " +
      "zo gaat het tussen twee kwartaalruns.</p>" + nieuwHtml,
    await kopregel(env, wie, "datafouten"));
}

/* De open datafouten als CSV, om door te geven aan wie de bron beheert en geen toegang
   tot deze pagina heeft. Puntkomma's en een BOM vooraan: zo opent Excel het met een
   Belgische of Nederlandse instelling meteen in kolommen, met de accenten goed. */
async function datafoutenCsv(env) {
  let fouten;
  try {
    ({ fouten } = await leesOpen(env));
  } catch (e) {
    return pagina(500, "Datafouten", "<p>De lijst kon niet gelezen worden.</p>");
  }
  let uitDienst = null;
  try {
    uitDienst = (await vergelijkVloot(env)).nietMeerInVloot;
  } catch (e) { /* dan weten we het niet: de kolom blijft leeg */ }
  const soorten = { ...SOORTEN, andere: "Andere" };
  const cel = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const regels = [["Auto", "Gemeente", "Soort fout", "Fout", "Gevonden", "In de live vloot"]]
    .concat(fouten.map((f) => [f.auto, f.plaats, soorten[soortVan(f.regel)], f.fout,
      String(f.gevonden).slice(0, 10), uitDienst ? (uitDienst.has(f.auto) ? "nee" : "ja") : ""]));
  const datum = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + regels.map((r) => r.map(cel).join(";")).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="datafouten-' + datum + '.csv"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
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
  const [verborgen, verborgenOpties, meer, laatst, aantallen] = await Promise.all(
    [leesVerborgen(env), leesVerborgenOpties(env), leesMeer(env), laatsteWijziging(env),
     aantallenInFeed(env)]);
  const vakje = (naam, waarde, aan, label, aantal) =>
    '<label class="vakje"><input type="checkbox" name="' + naam + '" value="' + ontsnap(waarde) +
    '"' + (aan ? " checked" : "") + "> " + ontsnap(label) +
    (aantal === undefined ? ""
      : aantal ? ' <span class="zacht">(' + aantal + ")</span>"
      : ' <span class="zacht">(komt niet voor)</span>') + "</label>";
  const vakjes = Object.entries(FILTERS).map(([sleutel, label]) => {
    const uit = verborgenOpties[sleutel] || [];
    const nu = verborgen.includes(sleutel) ? "uit" : meer.includes(sleutel) ? "meer" : "lijst";
    const plekken = '<span class="plekken">' + Object.entries(PLEKKEN).map(([p, l]) =>
      '<label class="plek"><input type="radio" name="plek/' + ontsnap(sleutel) + '" value="' + p +
      '"' + (p === nu ? " checked" : "") + "> " + l + "</label>").join("") + "</span>";
    // De kaart laat een filter waarvan elke keuze uit staat, zelf weg (vulKeuzes() in
    // map/index.js). De zin hieronder zegt dat; CSS toont hem zodra het laatste vinkje weg is.
    const keuzes = OPTIES[sleutel]
      ? '<div class="keuzes">' + Object.entries(OPTIES[sleutel]).map(([k, l]) =>
          vakje("optie", sleutel + "/" + k, !uit.includes(k), l,
                aantallen && aantallen[sleutel][k])).join("") + "</div>" +
        '<p class="alles-uit">Alle keuzes staan uit: dit filter verdwijnt dan van de kaart.</p>'
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
      "opnieuw te publiceren. Achter elke keuze staat hoeveel auto's in de feed ze hebben.</p>" +
    (aantallen ? "" : '<p class="let-op">De feed kon niet gelezen worden: zonder aantallen ' +
      "per keuze.</p>") +
    (url.searchParams.get("bewaard")
      ? '<p class="bewaard">Bewaard. ' + kaartknop(env, "", "Bekijk het op de kaart") + "</p>"
      : "") +
    '<form class="vlak" method="post" action="/beheer/kaartfilters">' +
      '<fieldset class="vakjes"><legend>Tonen op de kaart</legend>' + vakjes + "</fieldset>" +
      '<div class="voet"><button class="knop knop--hoofd">Bewaren</button>' +
      (laatst ? '<span class="zacht">Laatst gewijzigd op ' + ontsnap(laatst.gewijzigd.slice(0, 10)) +
        " door @" + ontsnap(laatst.door) + ".</span>" : "") + "</div>" +
    "</form>", await kopregel(env, wie, "kaartfilters"));
}

/* Per keuze hoeveel auto's in de feed ze hebben (telKeuzes() in instellingen.js), of null
   als de feed niet te lezen is. */
async function aantallenInFeed(env) {
  if (!env.FEED_URL) return null;
  try {
    const r = await fetch(env.FEED_URL, { cf: { cacheTtl: 300 } });
    return r.ok ? telKeuzes(await r.json()) : null;
  } catch (e) {
    console.error("Feed voor de aantallen:", e.message);
    return null;
  }
}

/* Het script achter de filters van de datafouten, zoals FILTERSCRIPT hieronder voor de
   meldingen: elke wijziging werkt meteen, en het adres en de terugweg van "Opgelost,
   wissen" houden de filters bij. Er wordt per fout gefilterd; een auto zonder zichtbare
   fout verdwijnt mee. */
const DATAFOUTENSCRIPT = `"use strict";
const formulier = document.getElementById("foutfilters");
const rijen = [...document.querySelectorAll("table.datafouten tbody tr")];
const wis = document.getElementById("wisfilters");
document.getElementById("toon").hidden = true;

function pas() {
  const soort = formulier.elements.soort.value;
  const vloot = formulier.elements.vloot.value;
  const zoek = formulier.elements.zoek.value.trim();
  const kleiner = zoek.toLowerCase();
  let zichtbaar = 0, autos = 0;
  for (const rij of rijen) {
    let hier = 0;
    for (const fout of rij.querySelectorAll("li")) {
      const past = (vloot === "alle" || rij.dataset.vloot === "in") &&
        (soort === "alle" || fout.dataset.soort === soort) &&
        (!kleiner || fout.dataset.zoek.includes(kleiner));
      fout.hidden = !past;
      if (past) hier++;
    }
    rij.hidden = !hier;
    zichtbaar += hier;
    if (hier) autos++;
  }
  document.getElementById("zichtbaar").textContent = zichtbaar;
  document.getElementById("autos").textContent = autos;
  document.getElementById("geen").hidden = zichtbaar > 0;
  const standaard = soort === "alle" && vloot === "in" && !zoek;
  const terug = standaard ? "" : "?" + new URLSearchParams({ soort, vloot, zoek });
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
  formulier.elements.vloot.value = "in";
  formulier.elements.zoek.value = "";
  pas();
});
`;

/* Het script achter de filters: elke wijziging werkt meteen, zonder herladen. Het filtert
   op de data-attributen van de rijen, op dezelfde manier als overzicht() hierboven, en
   houdt het adres en de terugweg van "Wissen" en "Beantwoord" bij, zodat herladen
   dezelfde lijst geeft. Een apart bestand, omdat de Content-Security-Policy geen script
   in de pagina toelaat. */
const FILTERSCRIPT = `"use strict";
const formulier = document.querySelector(".filters");
const rijen = [...document.querySelectorAll("tbody tr")];
const wis = document.getElementById("wisfilters");
const STANDAARD = { status: "open", antwoord: "alle", soort: "alle", taal: "alle", zoek: "" };
document.getElementById("toon").hidden = true;

function pas() {
  const f = Object.fromEntries(new FormData(formulier));
  f.zoek = f.zoek.trim();
  const zoek = f.zoek.toLowerCase();
  let zichtbaar = 0;
  for (const rij of rijen) {
    const d = rij.dataset;
    const past = (f.status === "alle" || !d.status || d.status === f.status) &&
      (f.antwoord === "alle" || d.antwoord === f.antwoord ||
       (f.antwoord === "ja" && d.antwoord !== "nee")) &&
      (f.soort === "alle" || d.soort === f.soort) &&
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
   mailadres dat nog op antwoord wacht, ook wanneer de opruimtaak dat adres wist — en valt
   dat binnen DRINGEND_DAGEN, dan in de kleur van een waarschuwing. */
function toestand(i, dagen, wacht) {
  if (i.onbekend) return '<span class="zacht">onbekend</span>';
  const reacties = i.comments === 1 ? "1 reactie" : i.comments + " reacties";
  if (i.state !== "closed") return "open · " + reacties;
  const hoe = i.state_reason === "not_planned" ? "gesloten, niet opgepakt" : "gesloten";
  let tekst = hoe + " op " + i.closed_at.slice(0, 10) + " · " + reacties;
  if (wacht) {
    const gewist = Date.parse(i.closed_at) + dagen * 24 * 60 * 60 * 1000;
    const dringend = gewist - Date.now() < DRINGEND_DAGEN * 24 * 60 * 60 * 1000;
    tekst += '<br><span class="' + (dringend ? "dringend" : "zacht") + '">' +
      (dringend ? "nog niet beantwoord, " : "") + "adres gewist rond " +
      new Date(gewist).toISOString().slice(0, 10) + "</span>";
  }
  return tekst;
}

/* Wat er in een melding staat: de soort (een sleutel uit MELDSOORTEN, of "onbekend"), de
   beschrijving en de taal. Twee vormen:
   · via de kaart (feedback.js, inhoud()): "**Soort:** …", "**Taal van de kaart:** fr", en
     de beschrijving in een omheind blok onder "### Beschrijving";
   · via het formulier op GitHub (.github/ISSUE_TEMPLATE/feedback-*.yml): per veld een kop
     "### …" met de waarde eronder. De taal volgt uit welk formulier het was. */
const FORMULIER = {
  "Waarover gaat het?": "nl", "De quoi s'agit-il ?": "fr", "What is it about?": "en"
};
const FORMULIERSOORT = {
  "Er klopt iets niet op de kaart": "kaart", "De kaart werkt niet goed": "werking",
  "Idee of suggestie": "idee", "Iets anders": "anders",
  "Quelque chose est incorrect sur la carte": "kaart", "La carte ne fonctionne pas bien": "werking",
  "Idée ou suggestion": "idee", "Autre chose": "anders",
  "Something on the map is wrong": "kaart", "The map doesn't work properly": "werking",
  "Idea or suggestion": "idee", "Something else": "anders"
};

function uitIssue(i) {
  const body = String(i.body || "").replace(/\r\n/g, "\n");
  const uit = { soort: "onbekend", tekst: "", taal: "" };
  const soort = /^\*\*Soort:\*\* (.+)$/m.exec(body);
  if (soort) {
    uit.soort = Object.keys(MELDSOORTEN).find((k) => MELDSOORTEN[k] === soort[1].trim()) || "onbekend";
    const taal = /\*\*Taal van de kaart:\*\* ([a-z]{2})\b/.exec(body);
    uit.taal = taal ? taal[1] : "";
    const blok = /### Beschrijving\s*\n+(`{3,})[^\n]*\n([\s\S]*?)\n\1/.exec(body);
    uit.tekst = blok ? blok[2].trim() : "";
    return uit;
  }
  // Het formulier op GitHub: de velden als { kop: waarde }.
  const velden = {};
  for (const deel of body.split(/^### /m).slice(1)) {
    const [kop, ...rest] = deel.split("\n");
    velden[kop.trim()] = rest.join("\n").trim();
  }
  for (const [kop, taal] of Object.entries(FORMULIER)) {
    if (Object.hasOwn(velden, kop)) {
      uit.taal = taal;
      uit.soort = FORMULIERSOORT[velden[kop]] || "onbekend";
    }
  }
  uit.tekst = velden.Beschrijving || velden.Description || (i.onbekend ? "" : body.trim());
  return uit;
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
  .meldingen td:nth-child(3) a { word-break: break-all; }
  .meldingen td:first-child { max-width: 46ch; }
  td .zacht { font-size: 12.5px; }
  .soort { font-size: 12px; font-weight: 600; color: var(--inkt-zacht);
           text-transform: uppercase; letter-spacing: .03em; }
  .tekst { margin: 6px 0 0; padding: 6px 10px; font-size: 13.5px; white-space: pre-wrap;
           overflow-wrap: anywhere; background: var(--vlak-zacht); border-radius: 6px; }
  details.tekst summary { color: var(--inkt); font-size: 13.5px; }
  details.tekst[open] summary { display: none; }
  .dringend { font-size: 12.5px; font-weight: 600; color: #7a5a00; background: #fff7e0;
              padding: 0 4px; border-radius: 4px; }
  .knop--klein { min-height: 30px; margin-top: 6px; padding: 4px 10px; font-size: 12.5px; }
  .teller { display: inline-block; min-width: 20px; margin-left: 4px; padding: 0 6px;
            font-size: 11.5px; font-weight: 700; line-height: 18px; text-align: center;
            color: var(--groen-diep); background: var(--groen-licht); border-radius: 999px; }
  .tab[aria-current="page"] .teller { color: var(--groen-diep); background: #fff; }
  #geen { margin: 0; padding: 14px; color: var(--inkt-zacht); }
  .label { display: inline-block; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 600;
           line-height: 20px; white-space: nowrap; color: var(--groen-diep); background: var(--groen-licht);
           border: 1px solid #b9d6cc; }
  .label--klaar { color: var(--inkt-zacht); background: var(--vlak-zacht); border-color: var(--lijn); }
  .label--uit { color: #7a5a00; background: #fff7e0; border-color: #ecd9a0; }
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
  .datafouten td:first-child { width: 26%; }
  .fouten { margin: 0; padding: 0; list-style: none; }
  .fouten li { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between;
               gap: 4px 14px; padding: 8px 0; border-top: 1px dashed var(--lijn); }
  .fouten li:first-child { padding-top: 0; border-top: 0; }
  .fouten li:last-child { padding-bottom: 0; }
  .fouten li > div { flex: 1 1 36ch; max-width: 64ch; }
  .fouten .knop, .gewist .knop { margin-top: 0; white-space: nowrap; }
  .datum { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .uitleg { margin: -8px 0 14px; max-width: 72ch; font-size: 13.5px; color: var(--inkt-zacht); }
  .uitleg p { margin: 6px 0 0; }
  .gewist summary { font-weight: 600; color: var(--inkt); }
  .gewist[open] { padding-bottom: 6px; }
  .gewist table { margin-top: 10px; font-size: 13.5px; }
  .gewist td, .gewist th { padding-left: 0; }
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
  .alles-uit { display: none; margin: 4px 8px 0; font-size: 13px; font-weight: 600; color: #7a5a00; }
  .filter:not(:has(input[value="uit"]:checked)):not(:has(.keuzes input:checked)) .alles-uit { display: block; }
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
