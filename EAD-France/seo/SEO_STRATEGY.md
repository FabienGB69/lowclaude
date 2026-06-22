# EAD-France — Stratégie SEO

**Auteur :** Alex (Growth Marketer)
**Date :** 2026-06-22
**Statut :** Validée par le CTO (Max) — Phase 5 du pipeline

---

## 1. Contexte et positionnement

### Audience cible (ICP)

| Segment | Profil | Intention |
|---|---|---|
| Principal | Conducteur sous obligation légale EAD (CEI judiciaire ou préfectorale) | Transactionnelle forte — trouver un centre rapidement |
| Secondaire | Conducteur anticipant (alcoolémie positive sans suspension encore prononcée) | Informationnelle / pré-transactionnelle |
| Tertiaire | Gestionnaire de flotte ou employeur | Informationnelle |

Le profil principal est **sous pression temporelle** (le permis est suspendu, la voiture est au garage, le travail attend). Ce contexte dicte l'ensemble des choix éditoriaux : pages directes, CTAs immédiats, pas de contenu superflu.

### Différenciation vs concurrence

Les pages actuellement positionnées sur "installateur EAD [ville]" sont majoritairement :
- Des annuaires généralistes (Pages Jaunes, Kompass) avec peu de valeur ajoutée
- Des pages de marques d'appareils (Dräger, Alcolock)
- Quelques sites préfectoraux en PDF non indexables

Notre avantage : **données fraîches, structurées, géolocalisées, avec scoring qualité** (EAD Score /100) — soit une utilité réelle là où les concurrents publient des listes statiques non mises à jour.

---

## 2. Clusters de mots-clés

### Cluster 1 — Transactionnel local (priorité absolue)

Ces requêtes ont une intention d'achat immédiate. Ce sont les pages `/ead-[ville]` et `/ead-departement-[XX]`.

| Gabarit | Exemple | Volume estimé | Concurrence |
|---|---|---|---|
| `installateur EAD [ville]` | installateur EAD Lyon | Faible-moyen | Faible |
| `éthylotest anti-démarrage [ville]` | éthylotest anti-démarrage Bordeaux | Faible-moyen | Faible |
| `EAD [ville]` | EAD Toulouse | Moyen | Faible |
| `pose éthylotest [ville]` | pose éthylotest Lille | Faible | Très faible |
| `installateur agréé EAD [département]` | installateur agréé EAD 69 | Faible | Très faible |
| `centre EAD [département]` | centre EAD 33 | Faible | Très faible |
| `éthylotest anti-démarrage [département]` | éthylotest anti-démarrage Gironde | Faible | Très faible |

**Logique de ciblage :** les volumes individuels sont faibles, mais la somme sur 107 pages est significative. C'est la mécanique classique de la longue traîne locale, amplifiée par le fait que l'audience est captive (obligation légale, pas d'alternative).

### Cluster 2 — Informationnel (blog / contenu support)

Ces requêtes nourrissent le maillage interne et les backlinks naturels.

| Requête | Type de page recommandée |
|---|---|
| `comment fonctionne éthylotest anti-démarrage` | Page guide `/comprendre-ead` |
| `EAD obligatoire conduite ivresse` | Page réglementaire `/ead-obligatoire` |
| `combien coûte EAD` | Page tarifs `/tarifs-ead` |
| `durée obligation EAD permis` | FAQ enrichie |
| `EAD suspension permis alcool` | Page procédure `/procedure-ead` |
| `récupérer permis après alcool EAD` | Page guide |
| `attestation EAD préfecture` | Guide procédure |

Ces pages ne génèrent pas directement des leads, mais captent le trafic informatif et alimentent le funnel vers les pages locales.

### Cluster 3 — Branded et institutionnel

| Requête | Objectif |
|---|---|
| `EAD France installateur` | Brand awareness |
| `liste installateurs EAD agréés` | Page nationale `/tous-les-installateurs` |
| `carte EAD France` | Page carte interactive `/carte` |

---

## 3. Structure des pages et rationale

### Pages de rang 1 — Département (`/ead-departement-XX`)

**Rôle :** Page d'entrée large pour la capture de trafic départemental. Cible les requêtes sans nom de ville précis.

**Structure :**
1. H1 ancré sur le département + code
2. Intro contextuelle (région, obligation légale)
3. Liste des installateurs agréés (données temps réel depuis la base)
4. Section "Comment ça marche" (confiance + engagement)
5. Liens vers les pages villes du département (maillage interne)
6. FAQ schema.org (visibilité en featured snippet)
7. CTA prise de rendez-vous

**Justification :** Les requêtes départementales ont un taux de conversion plus bas que les requêtes ville, mais un volume plus stable et une moindre concurrence. Elles servent aussi de hub pour le maillage interne.

### Pages de rang 2 — Ville (`/ead-[ville]`)

**Rôle :** Conversion directe. Cible l'utilisateur qui sait déjà dans quelle ville il cherche.

**Structure :**
1. H1 ancré sur la ville
2. Intro transactionnelle directe (pas de paragraphe introductif long)
3. Liste des installateurs avec tri par score / proximité
4. "Qu'est-ce que l'EAD" (nécessaire pour E-E-A-T, pas pour le visiteur expert)
5. FAQ schema.org (5 questions minimum)
6. Liens internes (département, régions)
7. CTA fort

**Justification :** Les 10 grandes villes concentrent l'essentiel du volume de recherche. Paris, Lyon, Marseille et Toulouse seuls peuvent représenter 40 à 60 % du trafic organique cible.

### Pages support (à créer en phase 2)

- `/comprendre-ead` — Guide complet (pillar content)
- `/procedure-ead` — Procédure pas à pas
- `/tarifs-ead` — Comparatif des coûts
- `/faq-ead` — FAQ nationale enrichie
- `/carte` — Carte interactive (Leaflet.js + Supabase)
- `/tous-les-installateurs` — Annuaire national paginé

---

## 4. Patterns de meta-descriptions

### Villes

```
[Action] + [ville] + [bénéfice] + [différenciant].
Ex : "Besoin d'un éthylotest anti-démarrage à Lyon ? Comparez les installateurs EAD agréés, prix et disponibilités. Devis gratuit en ligne."
```

Longueur cible : 140–155 caractères. Inclure toujours le nom de la ville en clair.

### Départements

```
[Existence de la page] + [dept + code] + [bénéfice] + [région].
Ex : "Liste des centres EAD agréés dans l'Ain (01). Trouvez un installateur éthylotest anti-démarrage près de chez vous en Auvergne-Rhône-Alpes."
```

Longueur cible : 140–155 caractères. Inclure le nom ET le code du département.

### Règles communes

- Jamais de majuscules inutiles en milieu de phrase
- Toujours inclure "éthylotest anti-démarrage" en toutes lettres (pas seulement l'acronyme EAD)
- Inclure un élément d'urgence ou de facilité ("rapidement", "devis gratuit", "délai court") sans être racoleur
- Ne pas répéter le title tag mot pour mot

---

## 5. Plan de maillage interne (silo)

```
[Page d'accueil]
    │
    ├── [/tous-les-installateurs] — Annuaire national
    │       └── Lien vers chaque /ead-departement-XX
    │
    ├── [/ead-departement-XX] (97 pages)
    │       ├── Lien vers /ead-[ville] si ville dans le département
    │       ├── Lien vers /comprendre-ead
    │       └── Lien vers /carte
    │
    ├── [/ead-[ville]] (10 pages)
    │       ├── Lien vers /ead-departement-XX (département parent)
    │       ├── Lien vers /comprendre-ead
    │       └── Lien vers la fiche installateur
    │
    └── [Contenu support] (/comprendre-ead, /procedure-ead, /faq-ead…)
            └── Lien vers /ead-[ville] les plus proches (contextuel)
```

**Règles de maillage :**

1. Chaque page département lie vers **toutes** les pages villes de ce département (et seulement elles). Pas de liens croisés inter-départements.
2. Chaque page ville lie vers **son** département uniquement.
3. Les pages contenu support peuvent lier vers n'importe quelle page locale (par pertinence contextuelle).
4. La page d'accueil lie vers les 10 villes prioritaires + les 13 régions (pages région, à créer en phase 2).
5. Ancres explicites : ne jamais utiliser "cliquez ici" ou "en savoir plus". Toujours "Installaeurs EAD à Lyon" ou "Voir les centres du Rhône (69)".

---

## 6. E-E-A-T — Signaux de confiance (sujet sensible / réglementé)

L'EAD est un sujet à **implication légale directe**. Google classe ce type de contenu comme "YMYL" (Your Money or Your Life adjacent) car une mauvaise information peut conduire l'utilisateur à choisir un installateur non agréé et invalider sa procédure juridique.

### Mesures obligatoires

| Signal | Action |
|---|---|
| **Expertise** | Mentionner l'UTAC et la Sécurité routière comme autorités de référence sur chaque page. Lien externe vers securite-routiere.gouv.fr. |
| **Authoritativeness** | Page "À propos" expliquant la source des données (liste officielle), la fréquence de mise à jour, et la méthodologie de scoring. |
| **Trustworthiness** | Badge/mention "Données issues de la liste nationale officielle — mise à jour mensuelle". Avertissement légal visible : "Vérifiez toujours l'agrément de votre installateur auprès de votre préfecture." |
| **Experience** | Si possible : témoignages d'utilisateurs ayant utilisé la plateforme pour trouver un installateur. Même quelques avis authentiques suffisent. |
| **Avertissement légal** | Bloc disclamer sur toutes les pages : "EAD-France est un annuaire d'information. Nous ne sommes pas un service officiel de l'État. La liste est basée sur les données publiques de securite-routiere.gouv.fr." |

### Ce qu'il ne faut PAS faire

- Prétendre être un service public ou une administration
- Affirmer qu'un installateur est agréé sans lien vers la source officielle
- Promettre des délais ou des prix sans base de données réelle
- Publier des pages vides ou avec l'emplacement "installer list placeholder" visible en production

---

## 7. KPIs et métriques de suivi

### KPIs primaires (north star)

| Métrique | Objectif à 6 mois | Outil |
|---|---|---|
| Clics organiques mensuels | > 2 000 | Google Search Console |
| Impressions organiques | > 50 000 | Google Search Console |
| Position moyenne sur les requêtes cibles | < 15 | Google Search Console |
| Pages indexées | 107 / 107 | Google Search Console > Coverage |

### KPIs secondaires

| Métrique | Objectif | Outil |
|---|---|---|
| Taux de clic (CTR) moyen | > 3 % | Google Search Console |
| Taux de rebond pages locales | < 60 % | GA4 |
| Taux de conversion visiteur → contact installateur | > 5 % | GA4 (event : `cta_click`) |
| Backlinks acquis | > 20 à 6 mois | Semrush / Ahrefs |
| Core Web Vitals (LCP) | < 2,5 s | PageSpeed Insights |

### Reporting cadence

- **Hebdomadaire (J+7 post-lancement)** : suivi indexation dans Search Console
- **Mensuel** : rapport complet positions + CTR + conversions
- **Trimestriel** : revue de la liste officielle et mise à jour des données

---

## 8. Quick wins (0–30 jours)

1. **Soumettre le sitemap** à Google Search Console dès la mise en production des 107 pages.
2. **Optimiser les Core Web Vitals** : images WebP, pas de JS bloquant au-dessus du fold.
3. **Baliser toutes les pages** en JSON-LD `LocalBusiness` + `FAQPage` (injecté par Next.js).
4. **Créer un fichier `robots.txt`** propre et un `sitemap.xml` automatique.
5. **Obtenir un premier backlink** depuis un site d'information juridique ou auto (forum permis de conduire, blog avocat spécialisé alcool au volant).

## 9. Paris à long terme (90+ jours)

1. **Pages région** (13 régions métropolitaines + DROM) : hub entre la nationale et les départements.
2. **Blog / contenu pilier** : articles informationnels ciblant les requêtes du Cluster 2 (ex. "Que faire après une suspension de permis pour alcool ?").
3. **Partenariats** avec cabinets d'avocats pénalistes ou associations d'aide aux conducteurs (liens retour naturels, très autoritaires).
4. **Fiche Google Business Profile** pour la plateforme elle-même.
5. **Données enrichies** (Google Rating, EAD Score) sur les pages locales — levier de différenciation fort une fois la base de données complète.

---

## 9. Dépendances avec les autres équipes

| Besoin SEO | Dépendance | Équipe |
|---|---|---|
| Données installateurs dans les templates | `data/enriched_centers.json` | Leo (pipeline) |
| Rendu JSON-LD FAQPage et LocalBusiness | Composant Next.js | Sam (frontend) |
| Routing `/ead-[ville]` et `/ead-departement-[XX]` | Framework routing | Sam |
| Mise à jour mensuelle automatique des pages | Cron pipeline + regeneration | Leo + Max |
| Sitemap dynamique | Next.js `sitemap.ts` | Sam |

---

*Document maintenu par Alex. Toute modification structurelle (ajout de cluster, changement de silo) doit être discutée avec Max avant implémentation.*
