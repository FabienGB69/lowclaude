/**
 * EAD-France — SEO Page Generator
 * --------------------------------
 * Reads seo/pages.json and the two Markdown templates, then emits one
 * .md file per entry into seo/output/.
 *
 * Usage (do NOT run during design phase):
 *   tsx seo/generator.ts
 *   tsx seo/generator.ts --type city          # only city pages
 *   tsx seo/generator.ts --type department    # only department pages
 *   tsx seo/generator.ts --dry-run            # print paths, no I/O
 *
 * Output structure:
 *   seo/output/
 *     ead-paris.md
 *     ead-lyon.md
 *     ...
 *     ead-departement-01.md
 *     ead-departement-75.md
 *     ...
 *
 * Template variables supported:
 *   City pages    : {{city}}, {{city_upper}}, {{department_code}}, {{region}},
 *                   {{slug}}, {{title}}, {{h1}}, {{meta_description}},
 *                   {{keywords}}, {{installer_list}}
 *   Dept pages    : {{department}}, {{department_upper}}, {{dept_code}},
 *                   {{region}}, {{slug}}, {{title}}, {{h1}}, {{meta_description}},
 *                   {{keywords}}, {{installer_list}}, {{city_links}}
 *
 * NOTE: This file is written but NOT executed. Phase 5 execution is gated
 * on human validation per ARCHITECTURE.md.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths (resolved relative to this file so tsx can be run from any cwd)
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PAGES_JSON = path.join(__dirname, "pages.json");
const CITY_TEMPLATE = path.join(__dirname, "templates", "city.md");
const DEPT_TEMPLATE = path.join(__dirname, "templates", "department.md");
const OUTPUT_DIR = path.join(__dirname, "output");

// ---------------------------------------------------------------------------
// Type definitions (mirrors pages.json schema)
// ---------------------------------------------------------------------------

interface BasePage {
  slug: string;
  type: "city" | "department";
  title: string;
  h1: string;
  meta_description: string;
  target_keywords: string[];
}

interface CityPage extends BasePage {
  type: "city";
  department_code: string;
  region: string;
}

interface DepartmentPage extends BasePage {
  type: "department";
  dept_code: string;
  dept_name: string;
  region: string;
}

type Page = CityPage | DepartmentPage;

interface PagesJson {
  _meta: {
    total_pages: number;
    breakdown: { city_pages: number; department_pages: number };
  };
  pages: Page[];
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const TYPE_FILTER: string | null = (() => {
  const idx = args.indexOf("--type");
  return idx !== -1 ? args[idx + 1] ?? null : null;
})();

// ---------------------------------------------------------------------------
// Template interpolation
// ---------------------------------------------------------------------------

/**
 * Replace all {{variable}} placeholders in a template string.
 * Unknown placeholders are left as-is so the caller can spot gaps.
 */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{{${key}}}`;
  });
}

/**
 * Derive the human-readable city name from a city slug.
 * e.g. "ead-paris" → "Paris"
 */
function cityNameFromSlug(slug: string): string {
  return slug
    .replace(/^ead-/, "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("-");
}

// ---------------------------------------------------------------------------
// Installer list placeholder (will be replaced with real data post-scrape)
// ---------------------------------------------------------------------------

const INSTALLER_LIST_PLACEHOLDER = `<!-- INSTALLER_LIST_START -->
> Les données d'installateurs seront injectées ici par le pipeline de données (data/enriched_centers.json).
> Chaque entrée contiendra : nom, adresse, téléphone, horaires, EAD Score et lien vers la fiche détaillée.
<!-- INSTALLER_LIST_END -->`;

// ---------------------------------------------------------------------------
// City links block for department pages (links to same-region city pages)
// ---------------------------------------------------------------------------

/**
 * Build an internal-linking block listing city pages that belong to this dept.
 * At generation time we cross-reference the pages array.
 */
function buildCityLinks(deptCode: string, allPages: Page[]): string {
  const cityPagesInDept = allPages.filter(
    (p): p is CityPage =>
      p.type === "city" && (p as CityPage).department_code === deptCode
  );

  if (cityPagesInDept.length === 0) {
    return `_Aucune page ville spécifique pour ce département — consultez la [carte nationale](/carte)._`;
  }

  return cityPagesInDept
    .map((p) => {
      const city = cityNameFromSlug(p.slug);
      return `- [Installateur EAD agréé à ${city}](/${p.slug})`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Core generation logic
// ---------------------------------------------------------------------------

function generateCityPage(page: CityPage, template: string): string {
  const city = cityNameFromSlug(page.slug);
  const vars: Record<string, string> = {
    city,
    city_upper: city.toUpperCase(),
    department_code: page.department_code,
    region: page.region,
    slug: page.slug,
    title: page.title,
    h1: page.h1,
    meta_description: page.meta_description,
    keywords: page.target_keywords.join(", "),
    installer_list: INSTALLER_LIST_PLACEHOLDER,
  };
  return interpolate(template, vars);
}

function generateDepartmentPage(
  page: DepartmentPage,
  template: string,
  allPages: Page[]
): string {
  const vars: Record<string, string> = {
    department: page.dept_name,
    department_upper: page.dept_name.toUpperCase(),
    dept_code: page.dept_code,
    region: page.region,
    slug: page.slug,
    title: page.title,
    h1: page.h1,
    meta_description: page.meta_description,
    keywords: page.target_keywords.join(", "),
    installer_list: INSTALLER_LIST_PLACEHOLDER,
    city_links: buildCityLinks(page.dept_code, allPages),
  };
  return interpolate(template, vars);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(): void {
  // 1. Load data
  if (!fs.existsSync(PAGES_JSON)) {
    console.error(`[generator] pages.json not found at ${PAGES_JSON}`);
    process.exit(1);
  }
  const pagesData = JSON.parse(fs.readFileSync(PAGES_JSON, "utf-8")) as PagesJson;
  const allPages = pagesData.pages;

  // 2. Load templates
  if (!fs.existsSync(CITY_TEMPLATE)) {
    console.error(`[generator] city template not found at ${CITY_TEMPLATE}`);
    process.exit(1);
  }
  if (!fs.existsSync(DEPT_TEMPLATE)) {
    console.error(`[generator] department template not found at ${DEPT_TEMPLATE}`);
    process.exit(1);
  }
  const cityTemplate = fs.readFileSync(CITY_TEMPLATE, "utf-8");
  const deptTemplate = fs.readFileSync(DEPT_TEMPLATE, "utf-8");

  // 3. Filter pages if --type flag supplied
  const pages = TYPE_FILTER
    ? allPages.filter((p) => p.type === TYPE_FILTER)
    : allPages;

  if (pages.length === 0) {
    console.warn(`[generator] No pages matched filter "${TYPE_FILTER}". Exiting.`);
    process.exit(0);
  }

  // 4. Ensure output directory exists
  if (!DRY_RUN && !fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`[generator] Created output directory: ${OUTPUT_DIR}`);
  }

  // 5. Generate files
  let written = 0;
  let skipped = 0;

  for (const page of pages) {
    const outputPath = path.join(OUTPUT_DIR, `${page.slug}.md`);

    let content: string;
    if (page.type === "city") {
      content = generateCityPage(page as CityPage, cityTemplate);
    } else {
      content = generateDepartmentPage(page as DepartmentPage, deptTemplate, allPages);
    }

    if (DRY_RUN) {
      console.log(`[dry-run] Would write → ${outputPath}`);
      skipped++;
    } else {
      fs.writeFileSync(outputPath, content, "utf-8");
      console.log(`[generator] Written → ${path.relative(process.cwd(), outputPath)}`);
      written++;
    }
  }

  // 6. Summary
  const label = DRY_RUN ? "Would generate" : "Generated";
  console.log(
    `\n[generator] Done. ${label} ${written + skipped} pages` +
      ` (${pages.filter((p) => p.type === "city").length} city,` +
      ` ${pages.filter((p) => p.type === "department").length} department).`
  );

  if (!DRY_RUN) {
    console.log(`[generator] Output: ${OUTPUT_DIR}`);
  }
}

main();
