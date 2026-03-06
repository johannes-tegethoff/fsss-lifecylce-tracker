# Service Lifecycle Tracker – App-Konzept

> Version: 1.0  
> Datum: Januar 2025  
> Status: Konzeptphase

---

## 1. Executive Summary

Der **Service Lifecycle Tracker** ist eine Forge App für Jira Cloud, die einen konsolidierten Überblick über alle Service-Angebote (Offers) und Aufträge (Orders) gruppiert nach Kunden bietet. Die App visualisiert den Fortschritt verknüpfter Epics und deren Aufgaben, um den Status des gesamten Service-Lebenszyklus auf einen Blick zu erfassen.

---

## 2. Problemstellung

### Aktuelle Situation
- **Offers und Orders** werden im Jira-Projekt `FSSS` als Issues erfasst
- **Epics mit Arbeitsaufgaben** liegen in separaten, kundenspezifischen Projekten (z.B. `VEST`, `GAB`, `KVV`)
- **Kunden- und Unit-Informationen** sind in JSM Assets gespeichert und mit Issues verknüpft
- Es gibt keine zentrale Ansicht, die alle diese Informationen zusammenführt

### Herausforderungen
1. Kein Überblick über alle Kunden und deren aktive Offers/Orders
2. Epic-Fortschritt ist nur durch manuelle Navigation zu den jeweiligen Projekten sichtbar
3. Fehlende Verknüpfungen (z.B. Offer ohne Epic) werden nicht systematisch erkannt
4. Keine aggregierte Statistik über den Gesamtstatus

---

## 3. Lösungsansatz

### 3.1 Zielgruppe
- **Service Manager**: Überblick über alle Kunden und deren Projektstatus
- **Sales Team**: Status von Offers und Conversion zu Orders
- **Projektleiter**: Fortschritt der Epics und Tasks

### 3.2 Kernfunktionen

| Funktion | Beschreibung |
|----------|--------------|
| **Kunden-Übersicht** | Gruppierte Ansicht aller Kunden mit deren Offers/Orders |
| **Progress-Tracking** | Visualisierung des Epic-Fortschritts (Tasks Done / Total) |
| **Unit-Details** | Anzeige von Turbinen-/Generator-Informationen pro Offer/Order |
| **Warnungen** | Hinweise auf fehlende Verknüpfungen (kein Epic, kein Customer) |
| **Statistik-Dashboard** | Zusammenfassung: Anzahl Kunden, offene Offers/Orders, Durchschnitts-Fortschritt |

---

## 4. Datenmodell

### 4.1 Entitäten und Beziehungen

```
┌─────────────────────────────────────────────────────────────────────┐
│                           DATENMODELL                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐     1:n      ┌──────────────┐                    │
│  │   CUSTOMER   │─────────────▶│ OFFER/ORDER  │                    │
│  │  (JSM Asset) │              │ (FSSS Issue) │                    │
│  │              │              │              │                    │
│  │ • Name       │              │ • Key        │                    │
│  │ • ObjectKey  │              │ • Type       │                    │
│  └──────────────┘              │ • Status     │                    │
│                                │ • Summary    │                    │
│                                └──────┬───────┘                    │
│                                       │                            │
│                          ┌────────────┴────────────┐               │
│                          │                         │               │
│                          ▼ 1:1                     ▼ 1:1           │
│                   ┌──────────────┐          ┌──────────────┐       │
│                   │     UNIT     │          │     EPIC     │       │
│                   │  (JSM Asset) │          │ (Jira Issue) │       │
│                   │              │          │              │       │
│                   │ • Serial No  │          │ • Key        │       │
│                   │ • Model      │          │ • Status     │       │
│                   │ • MW         │          │ • FixVersion │       │
│                   │ • OEM        │          │ • Project    │       │
│                   └──────────────┘          └──────┬───────┘       │
│                                                    │               │
│                                                    ▼ 1:n           │
│                                             ┌──────────────┐       │
│                                             │     TASK     │       │
│                                             │ (Jira Issue) │       │
│                                             │              │       │
│                                             │ • Key        │       │
│                                             │ • Summary    │       │
│                                             │ • Status     │       │
│                                             └──────────────┘       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Custom Fields (FSSS-Projekt)

| Field ID | Name | Typ | Beschreibung |
|----------|------|-----|--------------|
| `customfield_10246` | Customer | Assets Object | Referenz zum Kunden-Asset |
| `customfield_10245` | Unit | Assets Object | Referenz zum Unit-Asset (Turbine/Generator) |

### 4.3 Issue-Verknüpfungen

- **Offer/Order → Epic**: Über Standard-Jira `issuelinks` (beliebiger Link-Typ)
- **Epic → Tasks**: Über `parent` oder `Epic Link` Feld

---

## 5. Technische Architektur

### 5.1 Forge Module

```yaml
modules:
  jira:globalPage:
    - key: service-lifecycle-tracker
      title: Service Lifecycle Tracker
      resource: main
      resolver:
        function: resolver
```

### 5.2 API-Endpunkte

| API | Zweck | Authentifizierung |
|-----|-------|-------------------|
| `/rest/api/3/search/jql` | JQL-Suche für Offers/Orders/Epics/Tasks | `asUser()` oder `asApp()` |
| `/rest/api/3/issue/{key}` | Einzelne Issue-Details | `asUser()` oder `asApp()` |
| `api.atlassian.com/.../jsm/assets/.../object/{id}` | Asset-Details (Customer/Unit) | `asApp()` mit Bearer Token |

### 5.3 Erforderliche Scopes

```yaml
permissions:
  scopes:
    - read:jira-work              # Issues lesen
    - read:jira-user              # User-Kontext
    - read:servicedesk-request    # JSM Assets Workspace
  external:
    fetch:
      backend:
        - api.atlassian.com       # Assets Gateway API
```

### 5.4 Datenfluss

```
┌─────────────────────────────────────────────────────────────────────┐
│                          DATENFLUSS                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │   Browser   │───▶│  Forge UI   │───▶│  Resolver   │             │
│  │             │    │  (UI Kit)   │    │  (Backend)  │             │
│  └─────────────┘    └─────────────┘    └──────┬──────┘             │
│                                               │                     │
│                     ┌─────────────────────────┼──────────────┐      │
│                     │                         │              │      │
│                     ▼                         ▼              ▼      │
│              ┌─────────────┐          ┌─────────────┐ ┌───────────┐│
│              │  Jira REST  │          │ Assets API  │ │  Caching  ││
│              │     API     │          │  (Gateway)  │ │  (optional)│
│              └─────────────┘          └─────────────┘ └───────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. UI-Design

### 6.1 Hauptansicht (Global Page)

```
┌─────────────────────────────────────────────────────────────────────┐
│  SERVICE LIFECYCLE TRACKER                                    [⚙️]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─ 📊 Summary ───────────────────────────────────────────────────┐ │
│  │  Active Customers: 34    Open Offers: 30    Open Orders: 8     │ │
│  │  Avg. Completion: 62%                                          │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  [🔍 Filter: ____________] [Status: All ▼] [Sort: Customer ▼]      │
│                                                                     │
│  ┌─ Eneco Bio Golden Raand CV ──────────────────────────── [▼] ───┐ │
│  │                                                                 │ │
│  │  📋 FSSS-454: Offer [Open]                                     │ │
│  │     🔧 Unit: BB000038SA0 (NK71/4,0, 50.9 MW)                   │ │
│  │     ⚠️  No Epic linked                                         │ │
│  │                                                                 │ │
│  │  📋 FSSS-453: Offer [Open]                                     │ │
│  │     🔧 Unit: BB001125SA0 (BEEH32/400, 17.1 MW)                 │ │
│  │     ⚠️  No Epic linked                                         │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─ I/S Vestforbrænding ────────────────────────────────── [▼] ───┐ │
│  │                                                                 │ │
│  │  📦 FSSS-449: Order [Resolved]                                 │ │
│  │     🔧 Unit: 19418 (ATP2-V36AHH, 23.7 MW)                      │ │
│  │     📊 Epic: VEST-11 [████████████] 100%                       │ │
│  │        └─ VEST | 2/2 tasks done                                │ │
│  │        ├─ ✅ VEST-14: EA Number creation                       │ │
│  │        └─ ✅ VEST-12: Briefing Package creation                │ │
│  │                                                                 │ │
│  │  📋 FSSS-444: Offer [Closed Won]                               │ │
│  │     🔧 Unit: 19418 (ATP2-V36AHH, 23.7 MW)                      │ │
│  │     📊 Epic: VEST-1 [░░░░░░░░░░░░] 0%                          │ │
│  │        └─ VEST | 0/0 tasks done                                │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─ ⚠️ No Customer Assigned ───────────────────────────── [▼] ───┐  │
│  │  📋 FSSS-418: Offer - T8333 - Röhm GmbH...                     │ │
│  │  📋 FSSS-392: DR20916 - Navigator Pulp Figueira...             │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 UI Kit Komponenten

| Komponente | Verwendung |
|------------|------------|
| `Heading` | Seitentitel, Kunden-Namen |
| `Text` | Beschreibungen, Labels |
| `Badge` | Status (Open, Resolved, etc.) |
| `Lozenge` | Issue-Typ (Offer, Order) |
| `ProgressBar` | Epic-Fortschritt |
| `Stack` / `Inline` | Layout |
| `Box` | Container für Kunden-Sektionen |
| `Button` | Expand/Collapse |
| `Link` | Navigation zu Issues |
| `SectionMessage` | Warnungen (No Epic linked) |
| `Spinner` | Ladezustand |
| `Textfield` | Suchfilter |
| `Select` | Dropdown-Filter |

---

## 7. Implementierungsplan

### Phase 1: Grundgerüst (MVP)
- [ ] Forge App erstellen (`jira:globalPage`)
- [ ] Resolver: JQL-Suche für Offers/Orders
- [ ] Resolver: Asset-Details abrufen (Customer, Unit)
- [ ] Resolver: Epic + Tasks abrufen
- [ ] UI: Statische Liste aller Kunden mit Offers/Orders

### Phase 2: Interaktivität
- [ ] Expandable/Collapsible Kunden-Sektionen
- [ ] Progress-Bar für Epic-Fortschritt
- [ ] Klickbare Links zu Issues
- [ ] Warnungs-Anzeige (SectionMessage)

### Phase 3: Filter & Suche
- [ ] Textsuche nach Kunde/Issue
- [ ] Filter nach Status (Open, Resolved, etc.)
- [ ] Filter nach Typ (Offer/Order)
- [ ] Sortierung

### Phase 4: Optimierung
- [ ] Caching der Asset-Daten
- [ ] Pagination für große Datenmengen
- [ ] Performance-Optimierung (parallele API-Calls)

---

## 8. Offene Fragen / Entscheidungen

### 8.1 Zu klären

| # | Frage | Optionen | Entscheidung |
|---|-------|----------|--------------|
| 1 | **Wo soll die App erscheinen?** | Global Page / Project Page / Dashboard Gadget | Global Page |
| 2 | **Sollen Tasks expandierbar sein?** | Immer sichtbar / Expandable / Nur Anzahl | Expandable (max. 3 + "mehr") |
| 3 | **Echtzeit-Updates?** | Manueller Refresh / Auto-Refresh / Keins | Manueller Refresh-Button |
| 4 | **FixVersion anzeigen?** | Ja / Nein | Ja, wenn vorhanden |
| 5 | **Export-Funktion?** | CSV / Excel / Keins | Spätere Phase |

### 8.2 Bekannte Einschränkungen

1. **Assets API**: Nur über Gateway (`api.atlassian.com`) erreichbar, nicht direkt über Site-URL
2. **Pagination**: JQL-Suche liefert max. 100 Issues pro Request
3. **Rate Limits**: Atlassian APIs haben Rate Limits (ca. 100 Requests/Minute)
4. **UI Kit Limitationen**: Keine vollständig custom-styled Komponenten möglich

---

## 9. Erfolgskriterien

| Kriterium | Messung | Zielwert |
|-----------|---------|----------|
| **Ladezeit** | Zeit bis zur vollständigen Anzeige | < 5 Sekunden |
| **Datenaktualität** | Verzögerung zu Jira-Änderungen | < 1 Minute (nach Refresh) |
| **Vollständigkeit** | Alle FSSS Offers/Orders angezeigt | 100% |
| **Benutzerfreundlichkeit** | Klicks bis zur gewünschten Information | ≤ 2 Klicks |

---

## 10. Anhang

### 10.1 API-Validierung (Stand: Januar 2025)

Die folgenden APIs wurden mit dem Test-Skript `test-api-flow.mjs` validiert:

| API | Status | Anmerkung |
|-----|--------|-----------|
| JQL Search (`/rest/api/3/search/jql`) | ✅ | POST mit Body |
| Issue Details (`/rest/api/3/issue/{key}`) | ✅ | GET |
| Assets Workspace (`/rest/servicedeskapi/assets/workspace`) | ✅ | GET |
| Assets Object (Gateway) | ✅ | `api.atlassian.com/ex/jira/{cloudId}/jsm/assets/...` |
| Assets Object (Direct) | ❌ | 404 - nicht verfügbar |

### 10.2 Testdaten-Zusammenfassung

```
Site:           siemens-energy-fssitesupport.atlassian.net
Projekt:        FSSS
Workspace ID:   b39193ee-87e9-4806-97a0-2edee30daa74
Cloud ID:       928e89cc-3068-4bb6-81be-1a68a743ddae

Offers/Orders:  50
Kunden:         34
Units:          37
Epics:          42
Mit Epic:       42 (84%)
Ohne Epic:      8 (16%)
Ohne Customer:  2 (4%)
```

### 10.3 Referenzen

- [Forge UI Kit Components](https://developer.atlassian.com/platform/forge/ui-kit/components/)
- [Jira REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [JSM Assets REST API](https://developer.atlassian.com/cloud/assets/rest/)
- [Forge Permissions & Scopes](https://developer.atlassian.com/platform/forge/manifest-reference/permissions/)

---

*Dokument erstellt: Januar 2025*
*Letzte Aktualisierung: Januar 2025*