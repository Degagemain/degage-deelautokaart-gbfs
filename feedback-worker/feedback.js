/* Het tussenstuk tussen het meldformulier op de kaart en GitHub.
   ------------------------------------------------------------------------------------
   Een Cloudflare Worker. De kaart is een statische site: ze kan geen GitHub-token
   bewaren zonder hem aan iedereen te geven. Deze Worker houdt de token geheim en maakt
   namens de bezoeker een issue aan — zo kan ook wie geen GitHub-account heeft iets
   melden. Installeren en instellen: zie README.md in deze map.

   Wat de kaart stuurt (POST, JSON):

     soort         één van de sleutels in SOORTEN hieronder
     beschrijving  de tekst van de bezoeker
     taal          de taal van de kaart (nl, fr, en)
     token         het antwoord van Turnstile, de spamcontrole van Cloudflare
     website       een lokveld dat een mens niet ziet; ingevuld = een robot

   Wat ze terugkrijgt: `{ url, nummer }` van het nieuwe issue, of `{ fout }` met een
   foutstatus.

   Wat hier bewust NIET gebeurt: de tekst van de bezoeker wordt nergens als Markdown
   getoond. Hij gaat in een codeblok, zodat er geen @vermeldingen, afbeeldingen of
   links in het issue verschijnen die iemand anders lastigvallen of volgen.
*/

/* De soorten melding, met de kop zoals ze in het issue komt. De issues zelf staan in het
   Nederlands, de taal van de beheerders; de taal van de bezoeker staat erbij. */
const SOORTEN = {
  kaart: "Er klopt iets niet op de kaart",
  werking: "De kaart werkt niet goed",
  idee: "Idee of suggestie",
  anders: "Iets anders"
};

const MIN_LENGTE = 5;
const MAX_LENGTE = 5000;
const MAX_VERZOEK = 20000;   // bytes; ruim genoeg voor MAX_LENGTE tekens in UTF-8

export default {
  async fetch(request, env) {
    const herkomst = request.headers.get("Origin") || "";
    const toegestaan = (env.TOEGESTANE_HERKOMST || "")
      .split(",").map((h) => h.trim()).filter(Boolean);
    const cors = toegestaan.includes(herkomst)
      ? {
          "Access-Control-Allow-Origin": herkomst,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      : null;

    const antwoord = (status, inhoud) => new Response(JSON.stringify(inhoud), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", ...(cors || {}) }
    });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    }
    if (request.method !== "POST") return antwoord(405, { fout: "Alleen POST." });
    /* Geen bescherming tegen wie zelf verzoeken knutselt — een Origin is na te maken.
       Wel tegen een andere website die dit formulier in haar eigen pagina zou hangen.
       De echte drempel is Turnstile. */
    if (!cors) return antwoord(403, { fout: "Herkomst niet toegestaan." });

    const lengte = Number(request.headers.get("Content-Length") || 0);
    if (lengte > MAX_VERZOEK) return antwoord(413, { fout: "Te groot." });

    let gegevens;
    try {
      const tekst = await request.text();
      if (tekst.length > MAX_VERZOEK) return antwoord(413, { fout: "Te groot." });
      gegevens = JSON.parse(tekst);
    } catch (e) {
      return antwoord(400, { fout: "Geen geldige JSON." });
    }

    // Het lokveld: een robot vult alles in. Doe alsof het gelukt is, zodat hij niet leert.
    if (gegevens.website) return antwoord(200, { url: "", nummer: 0 });

    const soort = String(gegevens.soort || "");
    const beschrijving = String(gegevens.beschrijving || "").trim();
    const taal = String(gegevens.taal || "").slice(0, 5).replace(/[^a-z-]/gi, "");
    if (!SOORTEN[soort]) return antwoord(400, { fout: "Onbekende soort." });
    if (beschrijving.length < MIN_LENGTE || beschrijving.length > MAX_LENGTE) {
      return antwoord(400, { fout: "Beschrijving te kort of te lang." });
    }

    if (env.TURNSTILE_SECRET) {
      const echt = await controleerTurnstile(env.TURNSTILE_SECRET, gegevens.token,
        request.headers.get("CF-Connecting-IP"));
      if (!echt) return antwoord(403, { fout: "Spamcontrole mislukt." });
    }

    const issue = await maakIssue(env, {
      title: titel(soort, beschrijving),
      body: inhoud(soort, beschrijving, taal),
      labels: ["feedback"]
    });
    if (!issue) return antwoord(502, { fout: "GitHub weigerde het issue." });
    return antwoord(201, { url: issue.html_url, nummer: issue.number });
  }
};

async function controleerTurnstile(geheim, token, ip) {
  if (!token) return false;
  const formulier = new FormData();
  formulier.append("secret", geheim);
  formulier.append("response", String(token));
  if (ip) formulier.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: formulier });
  const uitslag = await r.json().catch(() => ({}));
  return uitslag.success === true;
}

async function maakIssue(env, issue) {
  const r = await fetch("https://api.github.com/repos/" + env.GITHUB_REPO + "/issues", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.GITHUB_TOKEN,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "degage-kaart-feedback",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(issue)
  });
  if (!r.ok) {
    console.error("GitHub", r.status, await r.text());
    return null;
  }
  return r.json();
}

/* De eerste regel van de beschrijving, ingekort. In een titel toont GitHub geen Markdown
   en verstuurt het geen meldingen voor @vermeldingen, dus daar hoeft niets ontsnapt. */
function titel(soort, beschrijving) {
  const regel = beschrijving.split("\n")[0].replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  const kort = regel.length > 70 ? regel.slice(0, 69).trimEnd() + "…" : regel;
  return "[Feedback] " + kort;
}

function inhoud(soort, beschrijving, taal) {
  // Een omheining die langer is dan elke reeks backticks in de tekst zelf.
  const langste = Math.max(0, ...(beschrijving.match(/`+/g) || []).map((s) => s.length));
  const hek = "`".repeat(Math.max(3, langste + 1));
  return [
    "**Soort:** " + SOORTEN[soort],
    "**Taal van de kaart:** " + (taal || "onbekend"),
    "**Via:** het meldformulier op de kaart (zonder GitHub-account)",
    "",
    "### Beschrijving",
    "",
    hek + "text",
    beschrijving,
    hek
  ].join("\n");
}
