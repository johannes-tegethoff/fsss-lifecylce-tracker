# Service Lifecycle Tracker

Forge App für Jira Cloud, die einen konsolidierten Überblick über Service-Angebote (Offers) und Aufträge (Orders) gruppiert nach Kunden bietet. Die App verknüpft Issues aus dem `FSSS`-Projekt mit den zugehörigen Epics in kundenspezifischen Projekten sowie mit Kunden-/Unit-Informationen aus JSM Assets und visualisiert den Fortschritt des gesamten Service-Lebenszyklus.

Details zum Konzept und Datenmodell siehe [CONCEPT.md](CONCEPT.md).

## Module

- **Global Page** (`static/hello-world`) — Kunden-Übersicht mit Offers/Orders, Epic-Fortschritt und Statistik-Dashboard
- **Admin Page** (`static/admin`) — Konfiguration der App (erlaubte Gruppen, Feld-Mappings)
- **Backend** (`src/`) — Resolver, Jira/Assets-API-Anbindung und Caching

## Aufbau

```
src/
  api/          Jira- und Assets-API-Clients
  data/         Lifecycle-Datenaggregation
  resolvers/    Forge-Resolver (lifecycle, settings, discovery)
static/
  hello-world/  Frontend der Global Page (React, AtlasKit)
  admin/        Frontend der Admin Page (React, AtlasKit)
```

## Voraussetzungen

- [Forge CLI](https://developer.atlassian.com/platform/forge/set-up-forge/) eingerichtet und bei Atlassian authentifiziert
- Zugriff auf die Ziel-Jira-Instanz mit JSM Assets

## Setup

Abhängigkeiten installieren (Root sowie beide Frontends):

```bash
npm install
npm install --prefix static/hello-world
npm install --prefix static/admin
```

Frontends bauen:

```bash
npm run build --prefix static/hello-world
npm run build --prefix static/admin
```

Deployen und installieren:

```bash
forge deploy
forge install
```

### Hinweise

- `forge deploy` persistiert Code-Änderungen, `forge install` installiert die App neu auf einer Site.
- Nach dem Deploy übernehmen bereits installierte Sites die Änderungen automatisch — ein erneutes `forge install` ist nicht nötig.
- UI-Komponenten basieren auf **AtlasKit**, nicht auf Material UI — Material UI ist wegen der restriktiven CSP von Forge Custom UI Apps nicht nutzbar.

## Support

Siehe [Get help](https://developer.atlassian.com/platform/forge/get-help/) für Hilfe und Feedback zu Forge.
