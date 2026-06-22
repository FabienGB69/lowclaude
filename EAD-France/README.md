# EAD-France

Pipeline de collecte, d'enrichissement et de scoring des installateurs EAD (Ethylotest Anti-Démarrage) agréés en France, avec génération automatique de 111 pages SEO locales.

Les données sont issues de la liste nationale officielle publiée par la Sécurité Routière (securite-routiere.gouv.fr) et alimentent un annuaire géolocalisé déployable sur Lovable via Supabase.

**Statut :** Pipeline complet développé — scraping en attente de validation humaine avant premier lancement.

---

## Stack technique

| Composant | Technologie |
|---|---|
| Runtime | Node.js >= 20 + TypeScript (ESM strict) |
| Scraping | Firecrawl (rendu JS) + Playwright (interception réseau) |
| Validation | Zod |
| Enrichissement | Google Places API v1 |
| Base de données | Supabase (PostgreSQL) |
| Exports | csv-stringify, xlsx |
| Frontend cible | Lovable |

---

## Structure du projet

```
EAD-France/
├── scripts/
│   ├── types.ts          # Schemas Zod + types partages
│   ├── scraper.ts        # Collecte depuis la source officielle
│   ├── cleaner.ts        # Nettoyage et normalisation
│   ├── enricher.ts       # Enrichissement Google Places
│   ├── scorer.ts         # EAD Score /100
│   ├── exporter.ts       # Exports CSV / XLSX / JSON
│   └── pipeline.ts       # Orchestrateur
├── seo/
│   ├── pages.json        # Catalogue 111 pages SEO
│   ├── generator.ts      # Generateur de pages Markdown
│   ├── templates/
│   │   ├── city.md       # Template page ville
│   │   └── department.md # Template page departement
│   └── SEO_STRATEGY.md   # Strategie SEO complete
├── supabase/
│   └── schema.sql        # DDL table ead_centers
├── docs/
│   └── ARCHITECTURE.md   # Architecture (CTO)
├── data/                 # Genere par le pipeline (ne pas committer)
├── exports/              # Genere par l'exporter (ne pas committer)
├── reports/
│   └── report.md         # Rapport final de livraison
├── .env.example          # Template variables d'environnement
├── package.json
└── tsconfig.json
```

---

## Installation

```bash
cd EAD-France
npm install
npx playwright install chromium
```

---

## Configuration

Copier `.env.example` en `.env` et renseigner les quatre clés :

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `FIRECRAWL_API_KEY` | Clé API Firecrawl (rendu JS de la page source) |
| `SUPABASE_URL` | URL de votre projet Supabase |
| `SUPABASE_SERVICE_KEY` | Clé service Supabase (ecriture) |
| `GOOGLE_PLACES_API_KEY` | Clé Google Places API (enrichissement) |
| `SCRAPE_DRY_RUN` | Laisser à `true` par défaut — garde-fou écriture |

> Ne jamais committer le fichier `.env` dans le dépôt.

---

## Usage — scripts individuels

Chaque script peut être lancé indépendamment :

```bash
# Scraping (DRY-RUN par defaut — inspecter sans ecrire)
SCRAPE_DRY_RUN=true tsx scripts/scraper.ts --limit 5

# Nettoyage
tsx scripts/cleaner.ts

# Enrichissement Google Places
tsx scripts/enricher.ts

# Re-enrichir tout (ignore le cache google_place_id)
tsx scripts/enricher.ts --force

# Scoring EAD /100
tsx scripts/scorer.ts

# Export CSV + XLSX + JSON
tsx scripts/exporter.ts
```

---

## Pipeline complet

### Ordre d'execution

```
scrape → clean → enrich → score → export
```

### Avant le premier lancement : valider le scraping

```bash
# Inspecter 5 resultats sans ecrire sur disque
SCRAPE_DRY_RUN=true tsx scripts/scraper.ts --limit 5
```

Vérifier manuellement que les données retournées correspondent à des installateurs EAD réels. Ne lancer le pipeline complet qu'après cette validation.

### Lancer le pipeline complet

```bash
# Via npm
SCRAPE_DRY_RUN=false npm run pipeline:full

# Via tsx
SCRAPE_DRY_RUN=false tsx scripts/pipeline.ts --all
```

### Reprendre depuis une etape specifique

```bash
# Reprendre depuis le nettoyage (si le scraping est deja fait)
tsx scripts/pipeline.ts --from clean

# Lancer uniquement l'export
tsx scripts/pipeline.ts --from export

# Lancer de clean jusqu'a score (sans export)
tsx scripts/pipeline.ts --from clean --to score
```

Le pipeline est idempotent : sans l'option `--all`, il détecte automatiquement la première étape dont le fichier de sortie est manquant et repart de là.

### Scripts npm disponibles

```bash
npm run scrape          # tsx scripts/scraper.ts
npm run clean           # tsx scripts/cleaner.ts
npm run enrich          # tsx scripts/enricher.ts
npm run score           # tsx scripts/scorer.ts
npm run export          # tsx scripts/exporter.ts
npm run pipeline        # tsx scripts/pipeline.ts
npm run pipeline:full   # SCRAPE_DRY_RUN=false tsx scripts/pipeline.ts --all
npm run build           # tsc --noEmit (verification TypeScript)
```

---

## SEO — generer les pages locales

Le catalogue `seo/pages.json` contient 111 pages pretes a l'emploi :

- 10 pages ville : `/ead-paris`, `/ead-lyon`, `/ead-marseille`, etc.
- 101 pages departement : `/ead-departement-01` a `/ead-departement-976`

```bash
# Generer les fichiers Markdown depuis le catalogue et les templates
tsx seo/generator.ts
```

Chaque page dispose de son slug, title, H1, meta_description et mots-cles cibles. Les templates (`seo/templates/city.md` et `department.md`) contiennent les zones d'injection de données dynamiques issues de Supabase.

Pour la strategie complete (clusters de mots-cles, maillage interne en silo, E-E-A-T, KPIs) : voir `seo/SEO_STRATEGY.md`.

---

## Supabase — appliquer le schema

```bash
# Option 1 : CLI Supabase (recommande)
supabase db push

# Option 2 : copier-coller dans l'editeur SQL Supabase
# Fichier : supabase/schema.sql
```

La table `ead_centers` est créée avec :
- RLS activé : lecture publique anonyme, écriture service role uniquement
- Champs : identite, contacts, coordonnees GPS, enrichissement Google, EAD Score, traçabilité source
- Timestamps automatiques (`created_at`, `updated_at`)

---

## Avertissement — ne pas lancer le scraping sans validation

Le script `scraper.ts` cible une page officielle de l'État (`securite-routiere.gouv.fr`). Par conception, il démarre en **DRY-RUN** (`SCRAPE_DRY_RUN=true`) et n'écrit aucune donnée sur disque tant que vous ne basculez pas explicitement en mode écriture.

**Avant de lancer le pipeline complet :**

1. Exécuter `SCRAPE_DRY_RUN=true tsx scripts/scraper.ts --limit 5`
2. Vérifier visuellement que les 5 résultats correspondent à des installateurs EAD réels
3. Inspecter si nécessaire l'onglet Réseau des DevTools sur la page source pour identifier l'endpoint de données
4. Seulement ensuite basculer `SCRAPE_DRY_RUN=false`

Le scraper utilise un User-Agent identifiable et un délai poli (1,5 s entre requêtes) pour respecter l'esprit du robots.txt même si la page n'est pas restreinte.

---

## Architecture

Le document d'architecture complet (choix techniques, flux de données, schema Supabase, decisions de conception) est disponible dans `docs/ARCHITECTURE.md`.

---

## Licence

Usage privé — données issues d'une source publique officielle (securite-routiere.gouv.fr). Ne pas redistribuer les données brutes sans vérifier les conditions de réutilisation du service public.
