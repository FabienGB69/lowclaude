/**
 * scraper.ts — Collecte brute des installateurs EAD
 *
 * Stratégie "API-first, render-fallback" définie par Max (ARCHITECTURE.md) :
 *   1. Firecrawl avec rendu JS → tente d'intercepter l'endpoint de données de la carte
 *      (GeoJSON / Esri FeatureServer / API interne renvoyant les ~226 points)
 *   2. Fallback Playwright → inspect réseau (page.on('response')) pour capturer
 *      l'appel data, puis rejoue l'URL directement.
 *   3. Si aucun endpoint n'est détecté, extrait le DOM rendu et parse les marqueurs.
 *
 * ⚠️  GARDE-FOU CRITIQUE :
 *   Ce script démarre en DRY-RUN par défaut (SCRAPE_DRY_RUN=true).
 *   En dry-run, les données collectées sont affichées mais JAMAIS écrites sur disque.
 *   Pour écrire data/raw_centers.json, passer SCRAPE_DRY_RUN=false explicitement
 *   ET valider manuellement le résultat d'un --limit 5 d'abord.
 *
 * Usage :
 *   SCRAPE_DRY_RUN=true tsx scripts/scraper.ts --limit 5   ← inspecter 5 résultats
 *   SCRAPE_DRY_RUN=false tsx scripts/scraper.ts             ← passage complet (après validation)
 */

import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { RawEadCenter } from "./types.js";
import { RawEadCenterSchema } from "./types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

/** URL source officielle — carte interactive Drupal + composant cartographique */
const SOURCE_URL =
  "https://www.securite-routiere.gouv.fr/reglementation-liee-lusager/conducteurs-avec-ead/liste-nationale-des-installateurs-ead";

/**
 * User-Agent identifiable (bonne pratique scraping éthique).
 * Se conformer à l'esprit robots.txt même si non restreint.
 */
const USER_AGENT =
  "EAD-France-Pipeline/0.1 (recherche données publiques agrément UTAC; contact: fabiengomesbancel@gmail.com)";

/** Délai poli entre requêtes réseau (ms) */
const POLITE_DELAY_MS = 1500;

const DRY_RUN = process.env["SCRAPE_DRY_RUN"] !== "false";

/** --limit N : ne garder que N résultats (pour validation) */
const limitArg = process.argv.indexOf("--limit");
const LIMIT: number | null =
  limitArg !== -1 && process.argv[limitArg + 1]
    ? parseInt(process.argv[limitArg + 1] as string, 10)
    : null;

const OUTPUT_PATH = join(PROJECT_ROOT, "data", "raw_centers.json");

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(msg: string): void {
  console.log(`[scraper] ${new Date().toISOString()} — ${msg}`);
}

function warn(msg: string): void {
  console.warn(`[scraper][WARN] ${msg}`);
}

// ---------------------------------------------------------------------------
// Stratégie 1 : Firecrawl avec rendu JS
// ---------------------------------------------------------------------------

/**
 * Patterns connus de data-endpoints pour les cartes Drupal / Leaflet / Esri
 * fréquemment utilisés sur les sites gouvernementaux français.
 *
 * NOTE : Ces patterns sont des hypothèses raisonnables basées sur l'analyse
 * de la page (Drupal + composant cartographique Leaflet ou Esri ArcGIS Online).
 * L'URL exacte de l'endpoint ne peut être confirmée qu'au runtime en inspectant
 * les requêtes réseau — c'est le rôle de la stratégie Playwright ci-dessous.
 *
 * Patterns candidats (par ordre de probabilité) :
 *   - /api/v1/map/ead-installers (API Drupal custom JSON)
 *   - /sites/default/files/...ead...json (fichier GeoJSON statique)
 *   - FeatureServer Esri : services<N>.arcgis.com/.../FeatureServer/0/query?f=json&...
 *   - /geojson?... (endpoint Drupal OpenLayers)
 */
const DATA_ENDPOINT_PATTERNS = [
  /\/api\/.*ead/i,
  /FeatureServer\/\d+\/query/i,
  /\.geojson(\?|$)/i,
  /\/map.*\.json(\?|$)/i,
  /installateur/i,
  /centers?\.json(\?|$)/i,
];

/**
 * Tente de scraper via Firecrawl (rendu JS complet).
 * Retourne le markdown rendu et les métadonnées de la page.
 */
async function scrapeWithFirecrawl(): Promise<{
  markdown: string;
  links: string[];
} | null> {
  const apiKey = process.env["FIRECRAWL_API_KEY"];
  if (!apiKey) {
    warn("FIRECRAWL_API_KEY non défini — stratégie Firecrawl ignorée.");
    return null;
  }

  try {
    // Import dynamique pour éviter l'erreur si le package n'est pas installé
    const { default: FirecrawlApp } = await import("@mendable/firecrawl-js");
    const app = new FirecrawlApp({ apiKey });

    log("Firecrawl : lancement du rendu JS de la page source...");

    const result = await app.scrapeUrl(SOURCE_URL, {
      formats: ["markdown", "links"],
      actions: [
        // Attendre que la carte soit chargée
        { type: "wait", milliseconds: 3000 },
        // Tenter de scroller pour déclencher le chargement des marqueurs
        { type: "scroll", direction: "down", amount: 500 },
        { type: "wait", milliseconds: 1000 },
        { type: "scroll", direction: "down", amount: 500 },
        { type: "wait", milliseconds: 1000 },
      ],
      headers: {
        "User-Agent": USER_AGENT,
      },
    } as Parameters<typeof app.scrapeUrl>[1]);

    if (!result.success) {
      warn(`Firecrawl échec : ${(result as { error?: string }).error ?? "erreur inconnue"}`);
      return null;
    }

    const markdown = (result as { markdown?: string }).markdown ?? "";
    const links: string[] = (result as { links?: string[] }).links ?? [];

    log(`Firecrawl : page rendue, ${markdown.length} chars, ${links.length} liens`);
    return { markdown, links };
  } catch (err) {
    warn(`Firecrawl exception : ${String(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stratégie 2 : Playwright — interception réseau
// ---------------------------------------------------------------------------

/**
 * Interface représentant une requête réseau interceptée par Playwright
 * qui semble être l'endpoint de données de la carte.
 */
interface InterceptedDataCall {
  url: string;
  responseBody: unknown;
}

/**
 * Lance Playwright sur la page source, écoute toutes les réponses réseau,
 * et capture celles qui correspondent aux patterns de data-endpoint de carte.
 *
 * C'est la stratégie la plus fiable pour trouver l'endpoint réel.
 * Une fois l'URL capturée, on peut la rejouer directement sans Playwright.
 */
async function interceptDataEndpointWithPlaywright(): Promise<InterceptedDataCall | null> {
  try {
    const { chromium } = await import("playwright");

    log("Playwright : lancement du navigateur headless...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      extraHTTPHeaders: {
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
    });
    const page = await context.newPage();

    let captured: InterceptedDataCall | null = null;

    // Écouter toutes les réponses réseau
    page.on("response", async (response) => {
      if (captured) return; // déjà trouvé

      const url = response.url();
      const contentType = response.headers()["content-type"] ?? "";

      // Filtrer les réponses JSON / GeoJSON qui correspondent aux patterns
      const isJsonish =
        contentType.includes("application/json") ||
        contentType.includes("application/geo+json") ||
        url.endsWith(".json") ||
        url.includes(".geojson");

      const matchesPattern = DATA_ENDPOINT_PATTERNS.some((p) => p.test(url));

      if (isJsonish && matchesPattern) {
        try {
          const body = await response.json() as unknown;
          const bodyStr = JSON.stringify(body);

          // Vérifier qu'il s'agit bien d'un dataset avec plusieurs points
          // (au moins 10 entrées pour éviter les faux positifs config)
          const hasMultipleFeatures =
            (typeof body === "object" &&
              body !== null &&
              "features" in body &&
              Array.isArray((body as { features: unknown[] }).features) &&
              (body as { features: unknown[] }).features.length >= 10) ||
            (Array.isArray(body) && body.length >= 10) ||
            bodyStr.includes('"installateur"') ||
            bodyStr.includes('"ead"');

          if (hasMultipleFeatures) {
            log(`Playwright : endpoint data capturé → ${url}`);
            captured = { url, responseBody: body };
          }
        } catch {
          // La réponse n'est pas du JSON valide — ignorer
        }
      }
    });

    log(`Playwright : navigation vers ${SOURCE_URL}`);
    await page.goto(SOURCE_URL, { waitUntil: "networkidle", timeout: 60_000 });

    // Donner du temps supplémentaire pour les chargements asynchrones
    await sleep(POLITE_DELAY_MS * 2);

    // Scroller pour déclencher le lazy-loading des marqueurs de carte
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await sleep(POLITE_DELAY_MS);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(POLITE_DELAY_MS);

    await browser.close();

    if (!captured) {
      log("Playwright : aucun endpoint de données détecté dans les requêtes réseau.");
    }

    return captured;
  } catch (err) {
    warn(`Playwright exception : ${String(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Parsing des différents formats de réponse possibles
// ---------------------------------------------------------------------------

/**
 * Parse un corps de réponse JSON en tableau de RawEadCenter.
 * Supporte :
 *   - GeoJSON FeatureCollection (Leaflet, Esri)
 *   - Esri FeatureServer query result { features: [{ attributes: {...}, geometry: {...} }] }
 *   - Tableau d'objets plats
 *   - Drupal Views JSON
 */
function parseDataResponse(body: unknown): RawEadCenter[] {
  if (!body || typeof body !== "object") return [];

  const centers: RawEadCenter[] = [];

  // Format GeoJSON FeatureCollection
  if (
    "type" in (body as Record<string, unknown>) &&
    (body as Record<string, unknown>)["type"] === "FeatureCollection" &&
    "features" in (body as Record<string, unknown>)
  ) {
    const fc = body as {
      features: Array<{
        type: string;
        geometry?: { type: string; coordinates?: [number, number] };
        properties?: Record<string, unknown>;
      }>;
    };
    for (const feature of fc.features) {
      const props = feature.properties ?? {};
      const [lng, lat] = feature.geometry?.coordinates ?? [undefined, undefined];
      centers.push(
        normalizeRawCenter({
          name: String(props["name"] ?? props["nom"] ?? props["raison_sociale"] ?? props["title"] ?? ""),
          address: String(props["address"] ?? props["adresse"] ?? props["voie"] ?? ""),
          city: String(props["city"] ?? props["ville"] ?? props["commune"] ?? ""),
          postal_code: String(props["postal_code"] ?? props["code_postal"] ?? props["cp"] ?? ""),
          phone: String(props["phone"] ?? props["tel"] ?? props["telephone"] ?? ""),
          email: String(props["email"] ?? props["mail"] ?? ""),
          website: String(props["website"] ?? props["site_web"] ?? props["url"] ?? ""),
          latitude: typeof lat === "number" ? lat : undefined,
          longitude: typeof lng === "number" ? lng : undefined,
          source: "map",
        })
      );
    }
    return centers.filter((c) => c.name.length > 0);
  }

  // Format Esri FeatureServer : { features: [{ attributes: {...}, geometry: {...} }] }
  if ("features" in (body as Record<string, unknown>)) {
    const esri = body as {
      features: Array<{
        attributes?: Record<string, unknown>;
        geometry?: { x?: number; y?: number };
      }>;
    };
    for (const f of esri.features) {
      const attrs = f.attributes ?? {};
      centers.push(
        normalizeRawCenter({
          name: String(attrs["nom"] ?? attrs["name"] ?? attrs["RAISON_SOCIALE"] ?? attrs["NOM"] ?? ""),
          address: String(attrs["adresse"] ?? attrs["ADRESSE"] ?? attrs["address"] ?? ""),
          city: String(attrs["ville"] ?? attrs["VILLE"] ?? attrs["city"] ?? ""),
          postal_code: String(attrs["code_postal"] ?? attrs["CP"] ?? attrs["postal_code"] ?? ""),
          phone: String(attrs["telephone"] ?? attrs["TEL"] ?? attrs["phone"] ?? ""),
          email: String(attrs["email"] ?? attrs["EMAIL"] ?? attrs["mail"] ?? ""),
          website: String(attrs["site"] ?? attrs["SITE"] ?? attrs["website"] ?? attrs["url"] ?? ""),
          latitude: typeof f.geometry?.y === "number" ? f.geometry.y : undefined,
          longitude: typeof f.geometry?.x === "number" ? f.geometry.x : undefined,
          source: "map",
        })
      );
    }
    return centers.filter((c) => c.name.length > 0);
  }

  // Format tableau plat
  if (Array.isArray(body)) {
    for (const item of body as Record<string, unknown>[]) {
      centers.push(
        normalizeRawCenter({
          name: String(item["name"] ?? item["nom"] ?? item["raison_sociale"] ?? item["title"] ?? ""),
          address: String(item["address"] ?? item["adresse"] ?? ""),
          city: String(item["city"] ?? item["ville"] ?? ""),
          postal_code: String(item["postal_code"] ?? item["code_postal"] ?? item["cp"] ?? ""),
          phone: String(item["phone"] ?? item["telephone"] ?? item["tel"] ?? ""),
          email: String(item["email"] ?? item["mail"] ?? ""),
          website: String(item["website"] ?? item["site"] ?? item["url"] ?? ""),
          latitude: typeof item["lat"] === "number" ? item["lat"] : typeof item["latitude"] === "number" ? item["latitude"] : undefined,
          longitude: typeof item["lng"] === "number" ? item["lng"] : typeof item["lon"] === "number" ? item["lon"] : typeof item["longitude"] === "number" ? item["longitude"] : undefined,
          source: "map",
        })
      );
    }
    return centers.filter((c) => c.name.length > 0);
  }

  return [];
}

/**
 * Nettoie les valeurs "undefined" / chaînes vides des champs optionnels.
 */
function normalizeRawCenter(raw: RawEadCenter): RawEadCenter {
  const cleaned: RawEadCenter = { name: raw.name };
  const fields = ["address", "city", "postal_code", "phone", "email", "website"] as const;
  for (const f of fields) {
    const val = raw[f];
    if (val && val !== "undefined" && val.trim() !== "") {
      (cleaned as Record<string, string>)[f] = val.trim();
    }
  }
  if (raw.latitude !== undefined) cleaned.latitude = raw.latitude;
  if (raw.longitude !== undefined) cleaned.longitude = raw.longitude;
  if (raw.source) cleaned.source = raw.source;
  return cleaned;
}

// ---------------------------------------------------------------------------
// Parse de secours : extraction du DOM markdown (Firecrawl)
// ---------------------------------------------------------------------------

/**
 * Tente d'extraire des centres à partir du markdown rendu par Firecrawl.
 * Dernier recours : la carte rendue contient parfois une liste HTML en plus des marqueurs.
 *
 * NOTE : Cette extraction est fragile car elle dépend du rendu HTML/Markdown
 * de la carte Drupal. À affiner dès qu'on a vu le markup réel.
 */
function parseMarkdownFallback(markdown: string): RawEadCenter[] {
  const centers: RawEadCenter[] = [];

  /**
   * Heuristique : cherche des blocs ressemblant à des fiches établissement.
   * Pattern attendu dans un rendu Leaflet popup / liste Drupal :
   *   ## Nom du garage
   *   12 rue de la Paix, 75001 Paris
   *   Tél : 01 23 45 67 89
   *   ...
   */
  const lines = markdown.split("\n");
  let current: Partial<RawEadCenter> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Début d'une nouvelle entrée (titre markdown niveau 2 ou 3)
    if (/^#{2,3}\s+.{5,}/.test(trimmed)) {
      if (current?.name) centers.push(current as RawEadCenter);
      current = { name: trimmed.replace(/^#+\s+/, "").trim(), source: "map" };
      continue;
    }

    if (!current) continue;

    // Téléphone
    const phoneMatch = trimmed.match(/(?:Tél|Tel|Téléphone|Phone)\s*[:\-]?\s*([\d\s\+\.]{8,})/i);
    if (phoneMatch?.[1]) {
      current.phone = phoneMatch[1].trim();
      continue;
    }

    // Email
    const emailMatch = trimmed.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
    if (emailMatch?.[1]) {
      current.email = emailMatch[1];
      continue;
    }

    // Site web
    const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch?.[1] && !urlMatch[1].includes("securite-routiere")) {
      current.website = urlMatch[1];
      continue;
    }

    // Adresse + code postal + ville (format : "12 rue ..., 75001 Paris")
    const addrMatch = trimmed.match(/^(.+),\s*(\d{5})\s+(.+)$/);
    if (addrMatch && !current.address) {
      current.address = addrMatch[1]?.trim();
      current.postal_code = addrMatch[2]?.trim();
      current.city = addrMatch[3]?.trim();
    }
  }

  // Flush dernier centre
  if (current?.name) centers.push(current as RawEadCenter);

  return centers.filter((c) => c.name.length > 0);
}

// ---------------------------------------------------------------------------
// Orchestration principale
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=".repeat(60));
  log("Démarrage du scraper EAD-France");
  log(`Mode : ${DRY_RUN ? "DRY-RUN (lecture seule)" : "ÉCRITURE → data/raw_centers.json"}`);
  if (LIMIT) log(`Limite : ${LIMIT} résultats`);
  log(`Source : ${SOURCE_URL}`);
  console.log("=".repeat(60));

  if (!DRY_RUN) {
    log(
      "⚠ ATTENTION : mode écriture activé. Assurez-vous d'avoir validé un --limit 5 au préalable."
    );
  }

  let centers: RawEadCenter[] = [];
  let strategyUsed = "none";

  // --- Stratégie 2 : Playwright interception réseau (priorité réelle en prod) ---
  // On la lance en premier car c'est la plus fiable pour trouver l'endpoint réel.
  log("Tentative stratégie Playwright (interception réseau)...");
  const intercepted = await interceptDataEndpointWithPlaywright();

  if (intercepted) {
    log(`Endpoint intercepté : ${intercepted.url}`);
    centers = parseDataResponse(intercepted.responseBody);
    strategyUsed = `playwright-intercept:${intercepted.url}`;
    log(`${centers.length} centres extraits de l'endpoint intercepté.`);
  }

  // --- Stratégie 1 : Firecrawl (si Playwright n'a pas trouvé d'endpoint) ---
  if (centers.length === 0) {
    log("Playwright n'a pas trouvé d'endpoint — tentative Firecrawl...");
    await sleep(POLITE_DELAY_MS);
    const firecrawlResult = await scrapeWithFirecrawl();

    if (firecrawlResult) {
      // Chercher parmi les liens un endpoint de données
      const dataLink = firecrawlResult.links.find((link) =>
        DATA_ENDPOINT_PATTERNS.some((p) => p.test(link))
      );

      if (dataLink) {
        log(`Firecrawl : lien data trouvé → ${dataLink}`);
        // Rejouer l'URL directement
        try {
          const resp = await fetch(dataLink, {
            headers: { "User-Agent": USER_AGENT },
          });
          const body: unknown = await resp.json();
          centers = parseDataResponse(body);
          strategyUsed = `firecrawl-link:${dataLink}`;
          log(`${centers.length} centres extraits via le lien data Firecrawl.`);
        } catch (err) {
          warn(`Impossible de rejouer le lien data : ${String(err)}`);
        }
      }

      // Si toujours rien, parser le markdown rendu
      if (centers.length === 0 && firecrawlResult.markdown) {
        log("Firecrawl : parsing du markdown rendu (dernier recours)...");
        centers = parseMarkdownFallback(firecrawlResult.markdown);
        strategyUsed = "firecrawl-markdown-parse";
        log(`${centers.length} centres extraits du markdown Firecrawl.`);
      }
    }
  }

  // --- Résultats ---
  if (centers.length === 0) {
    warn(
      "Aucun centre extrait par aucune stratégie. " +
        "Vérifiez manuellement l'endpoint de la carte sur " +
        SOURCE_URL +
        " (onglet Réseau des DevTools)."
    );
    warn(
      "Indice : chercher des requêtes XHR/Fetch retournant du JSON avec des coordonnées GPS."
    );
    process.exit(1);
  }

  // Validation Zod
  const validated: RawEadCenter[] = [];
  const errors: Array<{ index: number; name: string; issues: string }> = [];

  for (let i = 0; i < centers.length; i++) {
    const parsed = RawEadCenterSchema.safeParse(centers[i]);
    if (parsed.success) {
      validated.push(parsed.data);
    } else {
      errors.push({
        index: i,
        name: centers[i]?.name ?? "?",
        issues: parsed.error.issues.map((e) => e.message).join(", "),
      });
    }
  }

  if (errors.length > 0) {
    warn(`${errors.length} centres invalides ignorés (validation Zod) :`);
    for (const e of errors.slice(0, 5)) {
      warn(`  [${e.index}] "${e.name}" → ${e.issues}`);
    }
  }

  // Appliquer la limite si demandée
  const output = LIMIT ? validated.slice(0, LIMIT) : validated;

  log(`Résultat final : ${output.length} centres valides (stratégie: ${strategyUsed})`);

  // Aperçu des premières entrées (toujours affiché, même en dry-run)
  console.log("\n--- Aperçu (5 premiers) ---");
  for (const c of output.slice(0, 5)) {
    console.log(JSON.stringify(c, null, 2));
  }
  console.log("---------------------------\n");

  // En dry-run : on s'arrête ici
  if (DRY_RUN) {
    log("DRY-RUN terminé — aucune écriture sur disque.");
    log("Pour écrire data/raw_centers.json : SCRAPE_DRY_RUN=false tsx scripts/scraper.ts");
    return;
  }

  // Écriture effective
  mkdirSync(join(PROJECT_ROOT, "data"), { recursive: true });
  const payload = {
    scraped_at: new Date().toISOString(),
    strategy: strategyUsed,
    count: output.length,
    centers: output,
  };
  writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
  log(`Écrit : ${OUTPUT_PATH} (${output.length} centres)`);
}

main().catch((err) => {
  console.error("[scraper] Erreur fatale :", err);
  process.exit(1);
});
