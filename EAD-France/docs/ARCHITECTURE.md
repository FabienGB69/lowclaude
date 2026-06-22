# ARCHITECTURE.md — EAD-France

> Décision architecturale par Max (CTO). Date : 2026-06-22.
> Statut : **validée — code à écrire, exécution gelée jusqu'à validation humaine.**

---

## 1. Contraintes & exigences

### Découvertes sur la source officielle
Analyse menée via WebFetch / WebSearch sur la source officielle
`securite-routiere.gouv.fr/.../liste-nationale-des-installateurs-ead`.

| Fait | Conséquence architecturale |
|------|----------------------------|
| **Dataset fini et petit : ~226 établissements** agréés UTAC + préfecture, sur tout le territoire | Pas besoin de scraping distribué, ni de file/queue, ni de gestion de rate-limit agressive. **Un seul passage soigné suffit.** |
| La page nationale est une **carte interactive rendue en JS** (Drupal + composant cartographique). WebFetch ne voit que le shell HTML, pas les données. | Le scraping HTTP simple **ne fonctionne pas**. Il faut soit (a) intercepter l'endpoint de données de la carte (JSON/GeoJSON/FeatureServer), soit (b) un rendu JS (Firecrawl `formats:["markdown"]` + `actions`, ou Playwright). |
| Les **préfectures publient des PDF** par département (ex. Aveyron, Hérault). Certains PDF sont **scannés (image, DCTDecode)** → OCR nécessaire. | Source de **fallback** robuste mais hétérogène. À ne pas privilégier en source primaire. |
| Aucun dataset structuré CSV/XLSX confirmé sur data.gouv.fr | Pas de raccourci open-data. La carte nationale reste la meilleure source unique. |

### Exigences fonctionnelles
- Pour chaque centre : nom, adresse, ville, code postal, département, région, téléphone, email, site web, GPS.
- Enrichissement : note Google, nb avis, horaires, services.
- Scoring qualité /100.
- Exports CSV / XLSX / JSON + ingestion Supabase.

### Contrainte critique (non négociable)
**Aucun scraping massif sans validation humaine.** Tout le code est écrit mais **jamais exécuté** dans cette mission. L'étape 1 est l'analyse + la stratégie.

---

## 2. Approche recommandée + rationale

### Stratégie de collecte : "API-first, render-fallback, PDF-safety-net"

**Priorité 1 — Endpoint de données de la carte (à découvrir au runtime).**
Une carte interactive charge ses points depuis un endpoint (GeoJSON / Esri FeatureServer / API REST interne).
C'est la source **la plus propre** : données déjà structurées et géocodées (lat/lng fournis).
→ `scraper.ts` lance Firecrawl/Playwright sur la page, **inspecte les requêtes réseau** (`page.on('response')`), repère l'appel qui ramène les ~226 points, et le rejoue directement.

**Priorité 2 — Rendu JS de la page (Firecrawl avec rendu, ou Playwright).**
Si l'endpoint n'est pas isolable, on rend la carte, on déclenche les interactions (zoom/liste), et on extrait le DOM.

**Priorité 3 — PDF préfectoraux (fallback / cross-check).**
Parser les PDF départementaux. Si scanné → OCR (`tesseract`). Utilisé pour **compléter / vérifier**, pas comme source primaire.

> **Pourquoi pas du scraping massif ?** Le dataset fait ~226 lignes. Un crawl agressif serait
> sur-dimensionné, plus fragile, et inutilement coûteux. La sobriété (cf. esprit `lowclaude`)
> est ici la bonne ingénierie : **un fetch ciblé > mille requêtes**.

### Stack retenue
- **Node.js + TypeScript** (typage du schéma de données, exécution simple).
- **`@mendable/firecrawl-js`** : source primaire (rendu JS + extraction structurée).
- **Playwright** : uniquement si interception réseau fine nécessaire (Firecrawl ne l'expose pas).
- **Supabase (Postgres + PostGIS-friendly)** : stockage cible, RLS, API auto.
- Exports : `csv-stringify`, `xlsx`, `JSON` natif.

### Pipeline (séparation des responsabilités)
```
scraper.ts  → data/raw_centers.json        (collecte brute, AUCUNE transfo)
cleaner.ts  → data/clean_centers.json       (dédup, normalisation, validation)
enricher.ts → data/enriched_centers.json    (Google/Pages Jaunes, note/avis/horaires)
scorer.ts   → data/scored_centers.json      (EAD Score /100)
exporter.ts → exports/ead_centers.{csv,xlsx,json}
pipeline.ts → orchestre 1→5, idempotent, reprenable par étape
```
Chaque étape lit/écrit un fichier JSON → **idempotence, débogage par étape, reprise sans tout relancer.** Aucune étape n'exécute la suivante automatiquement sans flag explicite.

---

## 3. Schéma de données final

Table Supabase `ead_centers` (clé naturelle = `name` + `postal_code` pour la dédup) :

| Colonne | Type | Note |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `name` | text NOT NULL | raison sociale |
| `address` | text | voie |
| `postal_code` | text | 5 chiffres, conservé en `text` (zéros de tête) |
| `city` | text | |
| `department` | text | code dérivé du CP (01–95, 2A/2B, 971–976) |
| `region` | text | dérivée du département |
| `phone` | text | normalisé `+33` |
| `email` | text | validé (regex + MX optionnel) |
| `website` | text | URL normalisée |
| `latitude` | double precision | de la carte si dispo, sinon géocodage |
| `longitude` | double precision | |
| `google_rating` | numeric(2,1) | enrichissement |
| `google_reviews` | integer | enrichissement |
| `services` | jsonb | liste services / horaires |
| `ead_score` | integer | /100 |
| `source` | text | `map` \| `pdf:<dept>` — traçabilité |
| `created_at` | timestamptz | `now()` |
| `updated_at` | timestamptz | trigger `set_updated_at` |

Contrainte d'unicité : `UNIQUE (name, postal_code)` pour upsert idempotent.

### EAD Score /100 (défini par le CTO, implémenté par Leo)
| Critère | Points |
|---|---|
| Site web présent & valide | 20 |
| Email valide | 15 |
| Téléphone présent | 10 |
| Coordonnées GPS présentes | 10 |
| Note Google présente | 15 |
| Volume d'avis (≥50 → 15, ≥10 → 10, ≥1 → 5) | 15 |
| Complétude adresse (CP+ville+région) | 15 |
| **Total** | **100** |

---

## 4. Chemin d'implémentation par phases

| Phase | Contenu | État |
|---|---|---|
| **0. Analyse** (cette mission) | Source analysée, stratégie & schéma figés, code écrit | ✅ |
| **1. Collecte validée** | **Validation humaine** → exécuter `scraper.ts` en mode `--limit 5` (dry run), inspecter l'endpoint réel, puis passage complet ~226 lignes | ⏸️ gelé |
| **2. Clean + Score** | `cleaner` → `scorer` sur données brutes | à venir |
| **3. Enrichissement** | Google Business Profile / Pages Jaunes (clés API requises) | à venir |
| **4. Export + Supabase** | `exporter` + `supabase db push schema.sql` | à venir |
| **5. SEO** | Génération pages villes + départements (Alex) | en parallèle |

### Garde-fous d'exécution (à respecter en phase 1)
- `scraper.ts` démarre **en mode dry-run** par défaut (`SCRAPE_DRY_RUN=true`).
- Délai poli entre requêtes, User-Agent identifiable, respect `robots.txt`.
- Le passage complet n'est lancé **qu'après validation humaine explicite**.
