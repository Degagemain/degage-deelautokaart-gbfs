/* Praten met de GitHub API namens de Worker. Gedeeld door het meldformulier, de
   beheerpagina en de opruimtaak. `pad` begint met een slash, bv.
   "/repos/eigenaar/repo/issues".

   Waarmee de Worker zich aanmeldt:

   - Bij voorkeur als GitHub App (GITHUB_APP_ID + het geheim GITHUB_APP_SLEUTEL). Met de
     privésleutel van de app ondertekent de Worker een kort briefje (een JWT), en ruilt dat
     bij GitHub in voor een token die een uur geldig is. Er verloopt dus nooit iets dat een
     mens moet vernieuwen. De token wordt bewaard zolang deze Worker-instantie leeft, en
     vijf minuten voor het einde vervangen.
   - Anders met een vaste token (het geheim GITHUB_TOKEN), zoals vroeger. Die verloopt op
     de datum die bij het aanmaken gekozen is.

   Lukt het aanmelden niet, dan geeft github() een antwoord met status 503 terug in plaats
   van een fout te gooien: elke aanroeper kijkt toch al naar `ok` en `status`. */

const API = "https://api.github.com";
const KOP = {
  "Accept": "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "degage-kaart-feedback"
};

let bewaard = null;   // { token, tot }: de token van de app, met het einde in ms

export async function github(env, pad, opties = {}) {
  let token;
  try {
    token = await werktoken(env);
  } catch (e) {
    console.error("Aanmelden bij GitHub mislukt:", e.message);
    return new Response("Aanmelden bij GitHub mislukt.", { status: 503 });
  }
  return fetch(API + pad, {
    ...opties,
    headers: {
      ...KOP,
      "Authorization": "Bearer " + token,
      ...(opties.body ? { "Content-Type": "application/json" } : {}),
      ...(opties.headers || {})
    }
  });
}

async function werktoken(env) {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_SLEUTEL) {
    if (!env.GITHUB_TOKEN) throw new Error("geen GitHub App en geen GITHUB_TOKEN ingesteld");
    return env.GITHUB_TOKEN;
  }
  if (bewaard && bewaard.tot - Date.now() > 5 * 60 * 1000) return bewaard.token;

  const kop = { ...KOP, "Authorization": "Bearer " + await appJwt(env) };
  // Waar de app geïnstalleerd is, vraagt de Worker zelf na: dat is één instelling minder.
  const i = await fetch(API + "/repos/" + env.GITHUB_REPO + "/installation", { headers: kop });
  if (!i.ok) throw new Error("de app is niet geïnstalleerd op " + env.GITHUB_REPO + " (" + i.status + ")");
  const { id } = await i.json();
  const t = await fetch(API + "/app/installations/" + id + "/access_tokens",
    { method: "POST", headers: kop });
  if (!t.ok) throw new Error("GitHub gaf geen token (" + t.status + ")");
  const { token, expires_at } = await t.json();
  bewaard = { token, tot: Date.parse(expires_at) };
  return token;
}

/* Het briefje waarmee de app zich bij GitHub aanmeldt: hooguit tien minuten geldig, en
   een minuut terug in de tijd gezet voor het geval de klokken niet gelijk lopen. */
async function appJwt(env) {
  const nu = Math.floor(Date.now() / 1000);
  const deel = (o) => naarBase64url(new TextEncoder().encode(JSON.stringify(o)));
  const ongetekend = deel({ alg: "RS256", typ: "JWT" }) + "." +
                     deel({ iat: nu - 60, exp: nu + 9 * 60, iss: String(env.GITHUB_APP_ID) });
  const sleutel = await crypto.subtle.importKey("pkcs8", pemNaarBytes(env.GITHUB_APP_SLEUTEL),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const handtekening = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", sleutel,
    new TextEncoder().encode(ongetekend));
  return ongetekend + "." + naarBase64url(new Uint8Array(handtekening));
}

/* GitHub levert de sleutel als "BEGIN RSA PRIVATE KEY" (PKCS#1); de browser-crypto van de
   Worker leest alleen "BEGIN PRIVATE KEY" (PKCS#8). Omzetten doe je één keer bij het
   instellen, zie README.md. */
function pemNaarBytes(pem) {
  if (pem.includes("BEGIN RSA PRIVATE KEY")) {
    throw new Error("GITHUB_APP_SLEUTEL staat nog in PKCS#1; zet hem om naar PKCS#8 (README.md)");
  }
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function naarBase64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
