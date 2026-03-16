# UI Framework Analyse für Forge Custom UI Apps

> **Erstellt:** März 2026  
> **Kontext:** Service Lifecycle Tracker - Forge App  
> **Status:** Lessons Learned aus gescheitertem Material UI Migrations-Versuch

---

## TL;DR

**Material UI funktioniert NICHT in Atlassian Forge Custom UI Apps** aufgrund der Content Security Policy (CSP). Verwende stattdessen **AtlasKit + Custom CSS**.

---

## 🚫 Warum Material UI in Forge NICHT funktioniert

### Das Kernproblem: Content Security Policy (CSP)

Forge Custom UI Apps laufen in einem **sandboxed Iframe** mit einer sehr restriktiven Content Security Policy. Diese CSP ist von Atlassian vorgegeben und kann **NICHT** geändert werden.

#### Was die CSP blockiert:

| Blockiert | Beschreibung | Auswirkung auf MUI |
|-----------|--------------|--------------------|
| **Inline Styles** | `style="..."` Attribute, die zur Runtime generiert werden | MUI generiert tausende inline Styles |
| **Dynamische `<style>` Tags** | JavaScript, das `<style>` Elemente ins DOM injiziert | Emotion/Styled-Components Kernfunktion |
| **`eval()` und ähnliches** | Dynamische Code-Ausführung | Manche CSS-in-JS Libraries nutzen dies |
| **Externe Ressourcen** | CDN-Links für Fonts, Icons | MUI Roboto Font, Material Icons |

### Material UI v5+ Architektur - Das Problem visualisiert

```
@mui/material (v5+)
│
├── @emotion/react      ← CSS-in-JS Runtime Engine
│   ├── Generiert Styles zur RUNTIME (nicht Build-Zeit!)
│   ├── Injiziert <style> Tags dynamisch ins DOM
│   └── Nutzt Style-Hashing für CSS Scoping
│
├── @emotion/styled     ← styled() API
│   ├── Kompiliert NICHT zur Build-Zeit
│   └── Evaluiert Template Literals zur Runtime
│
└── @mui/system         ← sx prop, Theme System
    ├── Konvertiert sx={{}} zu inline Styles zur Runtime
    └── Theme-Werte werden zur Runtime aufgelöst


Forge CSP Policy:
┌─────────────────────────────────────────────────────────┐
│  style-src 'self'     → Blockiert inline styles         │
│  script-src 'self'    → Blockiert eval(), inline JS     │
│  default-src 'self'   → Blockiert externe Ressourcen    │
└─────────────────────────────────────────────────────────┘
            │
            ▼
    🚫 ALLES BLOCKIERT
```

### Was passiert, wenn man MUI in Forge verwendet:

1. **App startet** → React rendert MUI Komponenten
2. **Emotion initialisiert** → Versucht `<style>` Tags ins DOM zu injizieren
3. **CSP blockiert** → Browser weigert sich, die Styles anzuwenden
4. **Resultat:**
   - ✅ HTML wird gerendert (Komponenten sind im DOM)
   - ❌ Kein CSS wird angewendet
   - ❌ Komponenten erscheinen "nackt" oder komplett kaputt
   - ❌ Interaktive Features (Dropdowns, Modals) funktionieren nicht

### Console Errors die du sehen wirst:

```
Refused to apply inline style because it violates the following 
Content Security Policy directive: "style-src 'self'"

Refused to execute inline script because it violates the following 
Content Security Policy directive: "script-src 'self'"
```

### Screenshot-Vergleich (konzeptionell)

```
Erwartete UI:                    Tatsächliche UI in Forge:
┌─────────────────────┐          ┌─────────────────────┐
│ ┌─────────────────┐ │          │ Click me            │
│ │   Click me      │ │          │                     │
│ └─────────────────┘ │          │ Some text here      │
│                     │          │                     │
│  Some styled text   │          │ ○ Option 1          │
│                     │          │ ○ Option 2          │
│  ◉ Option 1         │          │                     │
│  ○ Option 2         │          │                     │
└─────────────────────┘          └─────────────────────┘
     Mit Styling                    Ohne Styling (raw HTML)
```

---

## 🔴 Frameworks die NICHT funktionieren

| Framework | Grund | Getestet? |
|-----------|-------|----------|
| **Material UI (MUI) v5+** | Nutzt Emotion für Runtime Style-Injection | ✅ Ja |
| **Material UI v4** | Nutzt JSS (auch Runtime Style-Injection) | ⚠️ Wahrscheinlich |
| **Chakra UI** | Nutzt Emotion | ⚠️ Wahrscheinlich |
| **Styled-Components** | Runtime Style-Injection | ⚠️ Wahrscheinlich |
| **Emotion** | Runtime Style-Injection | ✅ Ja (durch MUI) |
| **Ant Design** | Nutzt CSS-in-JS unter der Haube | ⚠️ Wahrscheinlich |
| **Mantine** | Nutzt Emotion | ⚠️ Wahrscheinlich |
| **Theme UI** | Nutzt Emotion | ⚠️ Wahrscheinlich |

---

## 🟢 Frameworks/Ansätze die FUNKTIONIEREN

### 1. AtlasKit (Atlassian Design System) ✅ **EMPFOHLEN**

```javascript
import Button from '@atlaskit/button';
import Select from '@atlaskit/select';
import { DynamicTable } from '@atlaskit/dynamic-table';
import Modal from '@atlaskit/modal-dialog';
```

**Vorteile:**
- ✅ Native Forge-Unterstützung (von Atlassian selbst)
- ✅ Konsistent mit Jira/Confluence UI (User fühlt sich "zuhause")
- ✅ Aktiv gepflegt von Atlassian
- ✅ Accessibility eingebaut (WCAG konform)
- ✅ Dark Mode Support über Atlassian Theming

**Nachteile:**
- ❌ Begrenzte Komponenten-Auswahl (nicht so umfangreich wie MUI)
- ❌ Weniger Customization-Optionen
- ❌ Dokumentation manchmal lückenhaft oder veraltet
- ❌ Peer-Dependency auf React 16 (ältere Versionen)
- ❌ Manche Komponenten haben Breaking Changes zwischen Versionen

**Installation:**
```bash
npm install @atlaskit/button @atlaskit/select @atlaskit/css-reset @atlaskit/spinner
```

**Wichtige AtlasKit Pakete:**
```javascript
// Basis
import '@atlaskit/css-reset';              // CSS Reset (einmal im Entry Point)

// Interaktive Komponenten
import Button from '@atlaskit/button';      // Buttons
import Select from '@atlaskit/select';      // Dropdowns/Selects
import Textfield from '@atlaskit/textfield';// Text Inputs
import Toggle from '@atlaskit/toggle';      // Toggle Switches

// Feedback
import Spinner from '@atlaskit/spinner';    // Loading Spinner
import Banner from '@atlaskit/banner';      // Info/Warning Banners
import Flag from '@atlaskit/flag';          // Toast Notifications

// Layout & Navigation
import Modal from '@atlaskit/modal-dialog'; // Modal Dialogs
import Tabs from '@atlaskit/tabs';          // Tab Navigation
import { DynamicTable } from '@atlaskit/dynamic-table'; // Data Tables

// Design Tokens (für konsistente Farben/Spacing)
import { token } from '@atlaskit/tokens';
```

### 2. Plain CSS / CSS Files ✅

```css
/* App.css - wird zur Build-Zeit kompiliert */
.my-card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    padding: 16px;
}

.my-button {
    background: linear-gradient(135deg, #0052CC, #0747A6);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
}

.my-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 82, 204, 0.4);
}
```

```javascript
import './App.css';

function App() {
    return (
        <div className="my-card">
            <button className="my-button">Click me</button>
        </div>
    );
}
```

**Vorteile:**
- ✅ Volle Kontrolle über Styling
- ✅ Keine Dependencies
- ✅ Beste Performance
- ✅ Funktioniert garantiert
- ✅ Alle CSS Features verfügbar (:hover, animations, media queries)

**Nachteile:**
- ❌ Kein Komponenten-System
- ❌ Mehr manueller Code
- ❌ Potenzielle CSS-Konflikte ohne Namespacing

### 3. CSS Modules ✅

```css
/* App.module.css */
.card {
    background: white;
    padding: 16px;
}

.button {
    background: blue;
    color: white;
}

.button:hover {
    background: darkblue;
}
```

```javascript
import styles from './App.module.css';

function App() {
    return (
        <div className={styles.card}>
            <button className={styles.button}>Click</button>
        </div>
    );
}
```

**Vorteile:**
- ✅ Automatisches CSS Scoping (keine Konflikte)
- ✅ Funktioniert mit create-react-app out-of-the-box
- ✅ Typsicher mit TypeScript (generierte Typen)
- ✅ Beste beider Welten: CSS Power + Scoping

### 4. Inline Styles (React style prop) ✅

```javascript
function App() {
    const cardStyle = {
        backgroundColor: 'white',
        padding: '16px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    };

    return (
        <div style={cardStyle}>
            Content
        </div>
    );
}
```

**Vorteile:**
- ✅ Volle dynamische Kontrolle
- ✅ Keine Build-Konfiguration nötig
- ✅ Gut für dynamische Werte (z.B. Progress Bars)

**Nachteile:**
- ❌ Keine Pseudo-Selektoren (:hover, :focus, :active)
- ❌ Keine Media Queries
- ❌ Keine Keyframe Animations
- ❌ Verbose Code
- ❌ Keine CSS-Wiederverwendung

### 5. Tailwind CSS (mit korrekter Konfiguration) ⚠️

Tailwind KANN funktionieren, WENN:
- Alle Styles zur BUILD-Zeit extrahiert werden
- Keine Runtime-JavaScript für Styles verwendet wird
- JIT-Mode korrekt konfiguriert ist
- Keine dynamischen Klassen zur Runtime generiert werden

```javascript
// Funktioniert (statische Klassen):
<div className="bg-white p-4 rounded-lg shadow-md">
    <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
        Click
    </button>
</div>

// FUNKTIONIERT NICHT (dynamische Klassen):
<div className={`bg-${color}-500`}>  // ❌ Wird zur Runtime evaluiert
```

**Konfiguration für Forge:**
```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  // Safelist für dynamische Klassen die du brauchst
  safelist: [
    'bg-green-500',
    'bg-yellow-500',
    'bg-red-500',
  ],
}
```

---

## 📊 Entscheidungsmatrix

| Anforderung | AtlasKit | Plain CSS | CSS Modules | Tailwind |
|-------------|:--------:|:---------:|:-----------:|:--------:|
| Schnelle Entwicklung | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Customization | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Jira-Konsistenz | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐ |
| Wartbarkeit | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Bundle Size | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Setup-Komplexität | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| Dark Mode Support | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |

---

## 🎨 Empfohlene Strategie: Hybrid-Ansatz

### AtlasKit + Custom CSS

```
UI Layer für Service Lifecycle Tracker
│
├── AtlasKit für Standard-Komponenten
│   ├── @atlaskit/button        → Buttons (Save, Cancel, etc.)
│   ├── @atlaskit/select        → Filter Dropdowns
│   ├── @atlaskit/textfield     → Search Input
│   ├── @atlaskit/spinner       → Loading States
│   ├── @atlaskit/modal-dialog  → Confirmation Dialogs
│   ├── @atlaskit/toggle        → On/Off Switches
│   └── @atlaskit/dynamic-table → Tabellarische Daten
│
├── Custom CSS für App-spezifische Komponenten
│   ├── Pipeline-Visualisierung (Offer → Order Flow)
│   ├── Gantt/Timeline Charts
│   ├── Status Cards & Badges
│   ├── Progress Indicators
│   └── Customer Accordion Layout
│
└── Atlassian Design Tokens für Konsistenz
    ├── Farben: var(--ds-text), var(--ds-background-neutral)
    ├── Spacing: var(--ds-space-100), var(--ds-space-200)
    └── Shadows: var(--ds-shadow-raised)
```

### Konkrete Beispiele

#### AtlasKit für Filter-Bereich:
```javascript
import Select from '@atlaskit/select';
import Textfield from '@atlaskit/textfield';

function FilterSection() {
    return (
        <div className="filter-section">
            <Textfield
                placeholder="Suche..."
                onChange={e => setSearch(e.target.value)}
            />
            <Select
                options={statusOptions}
                placeholder="Status"
                onChange={setStatusFilter}
            />
        </div>
    );
}
```

#### Custom CSS für Pipeline:
```css
/* Pipeline.css */
.pipeline-stages {
    display: flex;
    gap: 8px;
    align-items: flex-start;
}

.pipeline-stage {
    flex: 1;
    padding: 12px;
    border-radius: 8px;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
}

.pipeline-stage.stage-green {
    background: linear-gradient(135deg, #36B37E 0%, #00875A 100%);
    color: white;
}

.pipeline-stage.stage-yellow {
    background: linear-gradient(135deg, #FFAB00 0%, #FF991F 100%);
    color: white;
}

.pipeline-stage:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
```

#### Atlassian Design Tokens nutzen:
```css
/* Mit Design Tokens für Jira-Konsistenz */
.my-card {
    background: var(--ds-surface-raised, white);
    color: var(--ds-text, #172B4D);
    border-radius: var(--ds-border-radius, 3px);
    box-shadow: var(--ds-shadow-raised, 0 1px 1px rgba(9,30,66,0.25));
    padding: var(--ds-space-200, 16px);
}

.my-link {
    color: var(--ds-link, #0052CC);
}

.my-link:hover {
    color: var(--ds-link-pressed, #0065FF);
}
```

---

## 🔗 Nützliche Ressourcen

### AtlasKit
- [AtlasKit Komponenten](https://atlassian.design/components) - Offizielle Dokumentation
- [AtlasKit Storybook](https://atlaskit.atlassian.com/) - Interaktive Beispiele
- [Design Tokens](https://atlassian.design/foundations/design-tokens) - Farben, Spacing, etc.

### Forge Custom UI
- [Forge Custom UI Docs](https://developer.atlassian.com/platform/forge/custom-ui/)
- [CSP in Forge](https://developer.atlassian.com/platform/forge/custom-ui-security/)
- [Forge Bridge API](https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/)

### Alternative CSS-in-JS (potenziell kompatibel - nicht getestet)
- [Vanilla Extract](https://vanilla-extract.style/) - Zero-runtime CSS-in-JS (Build-Zeit)
- [Linaria](https://linaria.dev/) - Zero-runtime CSS-in-JS
- [Compiled](https://compiledcssinjs.com/) - Atlassian's eigenes CSS-in-JS (Build-Zeit)

---

## 📝 Lessons Learned aus dem Migration-Versuch

### Was wir versucht haben (Branch: `feature/material-ui-migration`):

1. **React 18 + MUI v7 installiert**
   ```json
   {
     "@mui/material": "^7.3.9",
     "@emotion/react": "^11.14.0",
     "@emotion/styled": "^11.14.1",
     "react": "^18.3.1"
   }
   ```

2. **MUI Komponenten verwendet**
   ```javascript
   import { Box, Container, TextField, Select, ... } from '@mui/material';
   ```

3. **Build funktionierte** → Keine Fehler beim `npm run build`

4. **Runtime in Forge: KOMPLETTES VERSAGEN**
   - Keine Styles wurden angewendet
   - Console voller CSP-Fehler
   - App unbenutzbar

### Warum der Build keine Warnung gab:
- Webpack/Babel wissen nichts über die Runtime-Umgebung
- Emotion's Code ist valides JavaScript
- Der Fehler tritt erst zur **Runtime im Browser** auf
- CSP-Validierung passiert nicht beim Build

### Takeaway:
> **"Funktioniert auf localhost" ≠ "Funktioniert in Forge"**
>
> Immer in der tatsächlichen Forge-Umgebung testen, bevor du Zeit in umfangreiche UI-Migrationen investierst!

---

## ✅ Fazit & Empfehlung

**Material UI ist KEINE Option für Forge Custom UI Apps.**

**Empfehlung für den Service Lifecycle Tracker:**

1. ✅ **Behalte den Hybrid-Ansatz** (AtlasKit + Custom CSS)
2. ✅ **Investiere in Custom CSS** für Pipeline-Visualisierung
3. ✅ **Nutze AtlasKit** für Standard-UI (Buttons, Selects, Modals)
4. ✅ **Verwende Design Tokens** für konsistente Farben/Spacing
5. ✅ **Dokumentiere Custom Components** für Wiederverwendbarkeit

Der aktuelle Code auf `feature/phase1-production-ready` folgt diesem Ansatz und ist der richtige Weg.