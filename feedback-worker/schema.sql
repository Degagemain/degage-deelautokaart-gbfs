-- De D1-databank van de Worker: wie op de kaart iets meldde en een antwoord wil.
-- Eén keer uitvoeren, zie README.md:
--   npx wrangler d1 execute degage-kaart-feedback --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS contact (
  issue         INTEGER PRIMARY KEY,     -- het nummer van het issue op GitHub
  titel         TEXT NOT NULL,           -- de titel van dat issue; die is toch al publiek
  mail          TEXT NOT NULL,           -- NIET publiek: staat nergens anders dan hier
  taal          TEXT NOT NULL DEFAULT '',-- de taal van de kaart, voor het antwoord
  aangemaakt    TEXT NOT NULL,           -- ISO 8601, UTC
  gecontroleerd TEXT NOT NULL DEFAULT '' -- wanneer de opruimtaak het issue laatst bekeek
);

-- Instellingen van de kaart die een beheerder op /beheer wijzigt (instellingen.js).
-- Opnieuw uitvoeren van dit bestand is veilig: bestaande tabellen blijven staan.
CREATE TABLE IF NOT EXISTS instellingen (
  sleutel   TEXT PRIMARY KEY,           -- "verborgen_filters", "verborgen_opties",
                                        -- "meer_filters", "datafouten_controle",
                                        -- "datacorrecties_ontvangen"
  waarde    TEXT NOT NULL,              -- JSON
  gewijzigd TEXT NOT NULL,              -- ISO 8601, UTC
  door      TEXT NOT NULL               -- de GitHub-gebruikersnaam van wie het wijzigde
);

-- Wat er niet klopt aan de auto's in de feed (datafouten.js, /beheer/datafouten).
CREATE TABLE IF NOT EXISTS datafouten (
  sleutel           TEXT PRIMARY KEY,      -- naam van de auto + "|" + regel
  auto              TEXT NOT NULL,         -- de naam van de auto
  station           TEXT NOT NULL DEFAULT '',
  plaats            TEXT NOT NULL DEFAULT '',
  regel             TEXT NOT NULL,         -- welke controle (REGELS in datafouten.js)
  fout              TEXT NOT NULL,         -- wat er mis is, in gewone woorden
  gevonden          TEXT NOT NULL,         -- ISO 8601, UTC
  opgelost          TEXT NOT NULL DEFAULT '', -- leeg: open; anders wanneer gewist
  opgelost_door     TEXT NOT NULL DEFAULT '', -- de GitHub-gebruikersnaam
  feed_bij_opgelost TEXT NOT NULL DEFAULT ''  -- last_updated van de feed bij het wissen
);

-- Wat de generator bij de laatste kwartaalrun in de bron rechtzette (POST /api/datacorrecties,
-- zie datafouten.js). Elke run vervangt de hele tabel.
CREATE TABLE IF NOT EXISTS datacorrecties (
  naam  TEXT NOT NULL,                  -- de naam van de auto
  veld  TEXT NOT NULL,                  -- merk, model, plaats of euronorm
  soort TEXT NOT NULL,                  -- schrijfwijze, hoofdletters, onbruikbaar of asterisk
  bron  TEXT NOT NULL,                  -- de waarde in de bron
  feed  TEXT,                           -- de waarde in de feed, of NULL
  PRIMARY KEY (naam, veld)
);
