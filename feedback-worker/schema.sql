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
