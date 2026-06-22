/**
 * pipeline.ts — Orchestrateur du pipeline EAD-France
 *
 * Enchaîne les 5 étapes : scrape → clean → enrich → score → export
 * Chaque étape est indépendante, idempotente et reprénable.
 *
 * ⚠️  GARDE-FOU :
 *   Par défaut, le pipeline s'arrête avant le scraping si SCRAPE_DRY_RUN=true
 *   (comportement par défaut). Pour lancer le pipeline complet :
 *     SCRAPE_DRY_RUN=false tsx scripts/pipeline.ts --all
 *   Sans --all, le pipeline commence à partir de l'étape où les données existent.
 *
 * Options :
 *   --from <stage>  Reprendre depuis une étape (scrape|clean|enrich|score|export)
 *   --to   <stage>  S'arrêter à une étape
 *   --all           Lancer toutes les étapes (y compris scraping si non dry-run)
 *   --dry-run       Forcer dry-run même si SCRAPE_DRY_RUN=false
 *
 * Exemples :
 *   tsx scripts/pipeline.ts --from clean --to score   ← clean + enrich + score
 *   tsx scripts/pipeline.ts --from export             ← uniquement l'export
 *   SCRAPE_DRY_RUN=false tsx scripts/pipeline.ts --all ← pipeline complet
 */

import "dotenv/config";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Stage = "scrape" | "clean" | "enrich" | "score" | "export";

const STAGE_ORDER: Stage[] = ["scrape", "clean", "enrich", "score", "export"];

/** Fichiers produits par chaque étape (pour vérifier l'idempotence) */
const STAGE_OUTPUT: Record<Stage, string> = {
  scrape: join(PROJECT_ROOT, "data", "raw_centers.json"),
  clean: join(PROJECT_ROOT, "data", "clean_centers.json"),
  enrich: join(PROJECT_ROOT, "data", "enriched_centers.json"),
  score: join(PROJECT_ROOT, "data", "scored_centers.json"),
  export: join(PROJECT_ROOT, "exports", "ead_centers.json"),
};

/** Script associé à chaque étape */
const STAGE_SCRIPT: Record<Stage, string> = {
  scrape: join(__dirname, "scraper.ts"),
  clean: join(__dirname, "cleaner.ts"),
  enrich: join(__dirname, "enricher.ts"),
  score: join(__dirname, "scorer.ts"),
  export: join(__dirname, "exporter.ts"),
};

// ---------------------------------------------------------------------------
// Parsing des arguments
// ---------------------------------------------------------------------------

function parseArgs(): {
  fromStage: Stage;
  toStage: Stage;
  runAll: boolean;
  forceDryRun: boolean;
} {
  const args = process.argv.slice(2);

  const fromIdx = args.indexOf("--from");
  const toIdx = args.indexOf("--to");
  const runAll = args.includes("--all");
  const forceDryRun = args.includes("--dry-run");

  const fromArg = fromIdx !== -1 ? args[fromIdx + 1] : undefined;
  const toArg = toIdx !== -1 ? args[toIdx + 1] : undefined;

  const fromStage = (fromArg && STAGE_ORDER.includes(fromArg as Stage))
    ? (fromArg as Stage)
    : "scrape";

  const toStage = (toArg && STAGE_ORDER.includes(toArg as Stage))
    ? (toArg as Stage)
    : "export";

  return { fromStage, toStage, runAll, forceDryRun };
}

// ---------------------------------------------------------------------------
// Exécution d'une étape
// ---------------------------------------------------------------------------

function log(msg: string): void {
  console.log(`[pipeline] ${new Date().toISOString()} — ${msg}`);
}

/**
 * Lance un script TypeScript via tsx.
 * Retourne true si le script s'est terminé avec succès (exit code 0).
 */
function runStage(stage: Stage, env: NodeJS.ProcessEnv): boolean {
  const script = STAGE_SCRIPT[stage];
  log(`Lancement étape "${stage}" : ${script}`);

  const result = spawnSync("tsx", [script], {
    stdio: "inherit", // hériter stdin/stdout/stderr du parent → logs visibles
    env: { ...process.env, ...env },
    cwd: PROJECT_ROOT,
  });

  if (result.error) {
    console.error(`[pipeline] Erreur de spawn pour "${stage}" :`, result.error);
    return false;
  }

  if (result.status !== 0) {
    console.error(`[pipeline] L'étape "${stage}" a échoué (exit code ${result.status ?? "?"})`);
    return false;
  }

  log(`Étape "${stage}" terminée avec succès.`);
  return true;
}

// ---------------------------------------------------------------------------
// Logique de reprise idempotente
// ---------------------------------------------------------------------------

/**
 * Détermine quelle est la première étape à lancer.
 * Si --from est spécifié, on part de là.
 * Sinon, on cherche la première étape dont le fichier de sortie n'existe pas encore.
 */
function findStartStage(fromStage: Stage, runAll: boolean): Stage {
  if (runAll) return fromStage; // --all : on recommence depuis fromStage

  // Trouver la première étape dont la sortie manque
  const stagesInRange = STAGE_ORDER.slice(STAGE_ORDER.indexOf(fromStage));
  for (const stage of stagesInRange) {
    if (!existsSync(STAGE_OUTPUT[stage])) {
      log(`Reprise automatique : première étape sans sortie = "${stage}"`);
      return stage;
    }
  }

  // Tout existe → l'export est le plus probable à relancer
  log("Toutes les étapes ont déjà leurs fichiers de sortie. Relancer avec --all pour tout reprocesser.");
  return "export";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=".repeat(60));
  log("Démarrage du pipeline EAD-France");

  const { fromStage, toStage, runAll, forceDryRun } = parseArgs();

  const isDryRun = forceDryRun || process.env["SCRAPE_DRY_RUN"] !== "false";

  log(`Configuration :
  - Étape de départ : ${fromStage}
  - Étape d'arrivée : ${toStage}
  - Mode dry-run    : ${isDryRun}
  - Forcer tout     : ${runAll}`);

  if (isDryRun) {
    log("ATTENTION : SCRAPE_DRY_RUN=true (défaut). L'étape scrape sera en lecture seule.");
    log("Pour un pipeline complet : SCRAPE_DRY_RUN=false tsx scripts/pipeline.ts --all");
  }

  console.log("=".repeat(60));

  // Déterminer les étapes à exécuter
  const startIdx = STAGE_ORDER.indexOf(fromStage);
  const endIdx = STAGE_ORDER.indexOf(toStage);

  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
    console.error(`[pipeline] Plage d'étapes invalide : ${fromStage} → ${toStage}`);
    process.exit(1);
  }

  const stagesToRun = STAGE_ORDER.slice(startIdx, endIdx + 1);

  // Reprise idempotente si pas de --all
  const actualStart = runAll
    ? fromStage
    : findStartStage(fromStage, false);
  const actualStartIdx = stagesToRun.indexOf(actualStart);
  const effectiveStages = actualStartIdx >= 0 ? stagesToRun.slice(actualStartIdx) : stagesToRun;

  log(`Étapes à exécuter : ${effectiveStages.join(" → ")}`);

  // Résumé d'état avant lancement
  log("\nÉtat actuel des fichiers :");
  for (const stage of STAGE_ORDER) {
    const exists = existsSync(STAGE_OUTPUT[stage]);
    const marker = exists ? "OK" : "MANQUANT";
    console.log(`  ${marker.padEnd(8)} ${STAGE_OUTPUT[stage]}`);
  }
  console.log("");

  // Exécution
  const startTime = Date.now();
  const failed: Stage[] = [];

  for (const stage of effectiveStages) {
    const stageEnv: NodeJS.ProcessEnv = {};

    // L'étape scrape respecte le dry-run
    if (stage === "scrape") {
      stageEnv["SCRAPE_DRY_RUN"] = isDryRun ? "true" : "false";
    }

    const success = runStage(stage, stageEnv);

    if (!success) {
      failed.push(stage);
      log(`Arrêt du pipeline à l'étape "${stage}" suite à une erreur.`);
      log(`Corrigez le problème et relancez avec : tsx scripts/pipeline.ts --from ${stage}`);
      break;
    }

    // Vérifier que le fichier de sortie a bien été créé
    if (stage !== "scrape" || !isDryRun) {
      if (!existsSync(STAGE_OUTPUT[stage])) {
        log(`ATTENTION : L'étape "${stage}" s'est terminée sans créer ${STAGE_OUTPUT[stage]}`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("=".repeat(60));

  if (failed.length === 0) {
    log(`Pipeline terminé avec succès en ${elapsed}s`);
    log(`Exports disponibles dans : ${join(PROJECT_ROOT, "exports")}`);
  } else {
    log(`Pipeline interrompu après ${elapsed}s. Étapes échouées : ${failed.join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[pipeline] Erreur fatale :", err);
  process.exit(1);
});
