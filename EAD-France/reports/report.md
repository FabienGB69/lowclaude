# Rapport final — Pipeline EAD-France

**Date :** 22 juin 2026
**Statut :** Pipeline conçu et documenté — scraping en attente de validation humaine
**Auteurs :** Leo (backend), Alex (SEO), Max (architecture)

---

## 1. Vue d'ensemble

Le projet EAD-France automatise la collecte, le nettoyage, l'enrichissement et le scoring des ~226 installateurs EAD (Éthylotest Anti-Démarrage) agréés en France, à partir de la liste officielle publiée par la Sécurité Routière. Les données produites alimentent une couverture SEO de 111 pages locales déployables sur Lovable via Supabase.

---

## 2. Scripts produits (9 fichiers)

### Backend — scripts/

| Fichier | Rôle |
|---|---|
| `types.ts` | Schémas Zod et types TypeScript partagés par tous les scripts. Définit `RawEadCenter`, `CleanEadCenter`, `EnrichedEadCenter`, `ScoredEadCenter`. Inclut la table de correspondance département → région pour les 101 départements français (y compris Corse et DROM). |
| `scraper.ts` | Collecte brute depuis la carte interactive de securite-routiere.gouv.fr. Trois stratégies en cascade : (1) Playwright avec interception réseau pour détecter l'endpoint de données réel, (2) Firecrawl avec rendu JS complet, (3) parsing du markdown rendu en dernier recours. Démarre en DRY-RUN par défaut — aucune écriture sans `SCRAPE_DRY_RUN=false`. |
| `cleaner.ts` | Nettoyage et normalisation des données brutes. Déduplication par clé `nom + code_postal`, normalisation des téléphones au format `+33XXXXXXXXX`, validation des emails, correction des URLs, dérivation du département depuis le code postal et de la région depuis le département. |
| `enricher.ts` | Enrichissement via Google Places API (Text Search + Place Details). Ajoute note Google, nombre d'avis et horaires d'ouverture. Idempotent : ne re-requête pas les centres ayant déjà un `google_place_id`, sauf avec `--force`. Délai de 1,2 s entre requêtes pour respecter les quotas. |
| `scorer.ts` | Calcul de l'EAD Score /100 par centre. Grille : site web (20 pts), email (15), téléphone (10), coordonnées GPS (10), note Google (15), volume d'avis (15), complétude adresse (15). Expose le `score_detail` par critère pour le frontend. |
| `exporter.ts` | Génération des exports finaux en trois formats simultanés : CSV, XLSX et JSON aplati. Les données sont aplaties (score_detail et services convertis en colonnes texte) pour être consommables directement par des outils tiers et Alex. |
| `pipeline.ts` | Orchestrateur principal. Enchaîne les 5 étapes dans l'ordre : scrape → clean → enrich → score → export. Supporte la reprise idempotente (détecte quelle étape manque et repart de là), les options `--from`, `--to`, `--all`, `--dry-run`, et affiche l'état des fichiers avant lancement. |

### Schéma base de données — supabase/

| Fichier | Rôle |
|---|---|
| `schema.sql` | Définition complète de la table `ead_centers` sur Supabase (PostgreSQL). Inclut tous les champs du pipeline, RLS activé (lecture publique, écriture service role uniquement), et timestamps automatiques. |

### Configuration

| Fichier | Rôle |
|---|---|
| `.env.example` | Template des variables d'environnement requises. À copier en `.env` avec les clés réelles. Ne jamais committer `.env`. |
| `package.json` | Dépendances npm et scripts de lancement (`scrape`, `clean`, `enrich`, `score`, `export`, `pipeline`, `pipeline:full`). |
| `tsconfig.json` | Configuration TypeScript (ESM strict, target ES2022). |

---

## 3. Couverture SEO — 111 pages

Alex a produit un catalogue complet de 111 pages générables depuis `seo/pages.json` :

| Type | Nombre | Format de slug | Exemples |
|---|---|---|---|
| Pages ville | 10 | `/ead-[ville]` | `/ead-paris`, `/ead-lyon`, `/ead-marseille` |
| Pages département | 101 | `/ead-departement-[XX]` | `/ead-departement-01`, `/ead-departement-75`, `/ead-departement-971` |

**Les 10 villes prioritaires :** Paris, Lyon, Marseille, Toulouse, Bordeaux, Lille, Nantes, Strasbourg, Nice, Montpellier.

**Les 101 départements** couvrent l'ensemble de la France métropolitaine (y compris la Corse 2A/2B) et les DROM (971 Guadeloupe, 972 Martinique, 973 Guyane, 974 La Réunion, 976 Mayotte).

### Fichiers SEO produits

| Fichier | Contenu |
|---|---|
| `seo/pages.json` | Catalogue des 111 pages avec slug, title, H1, meta_description, mots-clés cibles, code département et région |
| `seo/generator.ts` | Script de génération des fichiers Markdown depuis le catalogue et les templates |
| `seo/templates/city.md` | Template de page ville avec zones d'injection de données dynamiques |
| `seo/templates/department.md` | Template de page département avec zones d'injection de données dynamiques |
| `seo/SEO_STRATEGY.md` | Stratégie complète : clusters de mots-clés, structure de pages, maillage interne en silo, signaux E-E-A-T, KPIs à 6 mois |

---

## 4. Structure complète du projet

```
EAD-France/
├── scripts/
│   ├── types.ts          # Schémas Zod + types partagés
│   ├── scraper.ts        # Collecte depuis la source officielle
│   ├── cleaner.ts        # Nettoyage et normalisation
│   ├── enricher.ts       # Enrichissement Google Places
│   ├── scorer.ts         # EAD Score /100
│   ├── exporter.ts       # Exports CSV / XLSX / JSON
│   └── pipeline.ts       # Orchestrateur
├── seo/
│   ├── pages.json        # Catalogue 111 pages
│   ├── generator.ts      # Générateur de pages Markdown
│   ├── templates/
│   │   ├── city.md       # Template page ville
│   │   └── department.md # Template page département
│   └── SEO_STRATEGY.md   # Stratégie SEO complète
├── supabase/
│   └── schema.sql        # DDL table ead_centers
├── docs/
│   └── ARCHITECTURE.md   # Document d'architecture (Max)
├── data/                 # Généré par le pipeline (gitignorer)
│   ├── raw_centers.json
│   ├── clean_centers.json
│   ├── enriched_centers.json
│   └── scored_centers.json
├── exports/              # Généré par l'exporter (gitignorer)
│   ├── ead_centers.csv
│   ├── ead_centers.xlsx
│   └── ead_centers.json
├── reports/
│   └── report.md         # Ce fichier
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 5. Instructions d'utilisation du pipeline

### Prérequis

- Node.js >= 20.0.0
- Clés API renseignées dans `.env` (voir section 6)
- Playwright Chromium installé (`npx playwright install chromium`)

### Installation

```bash
cd EAD-France
npm install
npx playwright install chromium
```

### Configuration

```bash
cp .env.example .env
# Renseigner les 4 clés dans .env
```

### Etape 0 (obligatoire avant tout) — Valider le scraping

```bash
# Inspecter 5 résultats sans rien écrire sur disque
SCRAPE_DRY_RUN=true tsx scripts/scraper.ts --limit 5
```

Vérifier manuellement que les données retournées correspondent aux installateurs EAD de la liste officielle. Ne passer à l'étape 1 qu'après validation humaine explicite.

### Etape 1 — Scraping (après validation uniquement)

```bash
SCRAPE_DRY_RUN=false tsx scripts/scraper.ts
# Produit : data/raw_centers.json
```

### Etape 2 — Nettoyage

```bash
tsx scripts/cleaner.ts
# Lit : data/raw_centers.json
# Produit : data/clean_centers.json
```

### Etape 3 — Enrichissement Google Places

```bash
tsx scripts/enricher.ts
# Lit : data/clean_centers.json
# Produit : data/enriched_centers.json
# Requiert GOOGLE_PLACES_API_KEY dans .env
```

### Etape 4 — Scoring

```bash
tsx scripts/scorer.ts
# Lit : data/enriched_centers.json
# Produit : data/scored_centers.json
```

### Etape 5 — Export

```bash
tsx scripts/exporter.ts
# Lit : data/scored_centers.json
# Produit : exports/ead_centers.csv + .xlsx + .json
```

### Pipeline complet (une commande)

```bash
SCRAPE_DRY_RUN=false npm run pipeline:full
```

### Reprise après erreur

```bash
# Reprendre depuis une étape spécifique
tsx scripts/pipeline.ts --from enrich

# Lancer seulement une plage d'étapes
tsx scripts/pipeline.ts --from clean --to score
```

---

## 6. Variables d'environnement requises

| Variable | Rôle | Obligatoire |
|---|---|---|
| `FIRECRAWL_API_KEY` | Clé API Firecrawl pour le rendu JS de la page source | Oui (stratégie 1 du scraper) |
| `SUPABASE_URL` | URL du projet Supabase (`https://xxx.supabase.co`) | Oui (import final) |
| `SUPABASE_SERVICE_KEY` | Clé service Supabase (bypasse RLS pour l'écriture) | Oui (import final) |
| `GOOGLE_PLACES_API_KEY` | Clé Google Places API pour l'enrichissement | Recommandé (enricher.ts) |
| `SCRAPE_DRY_RUN` | `true` (défaut) = pas d'écriture / `false` = écriture effective | Garde-fou — laisser à `true` par défaut |

---

## 7. Generation des pages SEO

```bash
tsx seo/generator.ts
# Génère les 111 fichiers Markdown depuis pages.json + templates
```

Les fichiers produits sont à intégrer dans le routage du frontend (Next.js ou Lovable). Chaque page dispose de son slug, title, H1 et meta_description prêts à l'emploi.

---

## 8. Deploiement Supabase

```bash
# Option 1 : CLI Supabase (recommandé)
supabase db push

# Option 2 : copier-coller supabase/schema.sql dans l'editeur SQL Supabase
```

La table `ead_centers` sera créée avec RLS activé : lecture publique anonyme, écriture réservée au service role.

---

## 9. Prochaines etapes

### Court terme — avant lancement

1. **Validation scraping** : lancer `SCRAPE_DRY_RUN=true tsx scripts/scraper.ts --limit 5` et vérifier manuellement que l'endpoint de la carte est détecté et que les données correspondent à la liste officielle.
2. **Deploiement Supabase** : appliquer `schema.sql` sur le projet Supabase cible et récupérer `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`.
3. **Pipeline complet** : lancer le pipeline avec les clés API réelles après validation de l'étape 0.
4. **Integration Lovable** : connecter Supabase au frontend Lovable pour afficher les données des installateurs sur les pages locales.

### Moyen terme

5. **Génération des 111 pages SEO** : lancer `seo/generator.ts` et intégrer les templates dans le routage frontend.
6. **Google Search Console** : soumettre le sitemap dès la mise en production des premières pages.
7. **Mise à jour mensuelle** : automatiser le pipeline (cron ou GitHub Actions) pour re-scraper chaque mois depuis la liste officielle.

### Long terme — phase 2 SEO

8. Pages région (13 régions) comme hub intermédiaire entre la page nationale et les pages département.
9. Contenu pilier informationnel ciblant les requêtes du Cluster 2 défini par Alex (guide EAD, procédure, tarifs).
10. Carte interactive Leaflet.js + Supabase (page `/carte`).

---

## 10. Avertissement

**Le scraping n'a pas été exécuté.** Tous les scripts sont écrits, typés et validés syntaxiquement, mais aucune donnée réelle n'a encore été collectée. L'étape de scraping est bloquée en DRY-RUN par conception (`SCRAPE_DRY_RUN=true` par défaut dans `.env.example`) et ne peut être déclenchée qu'après une validation manuelle explicite.

Source officielle : https://www.securite-routiere.gouv.fr/reglementation-liee-lusager/conducteurs-avec-ead/liste-nationale-des-installateurs-ead
