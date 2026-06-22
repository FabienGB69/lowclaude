import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const captured: Array<{url: string; ct: string; preview: string}> = [];

  page.on('response', async (response) => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (
      url.includes('MapServer') || url.includes('FeatureServer') ||
      url.includes('arcgis') || url.includes('geojson') ||
      url.includes('installateur') ||
      (ct.includes('json') && !url.includes('analytics') && !url.includes('google') && !url.includes('drupal') && !url.includes('jquery'))
    ) {
      try {
        const body = await response.text();
        if (body.length > 100) captured.push({ url, ct, preview: body.slice(0, 500) });
      } catch {}
    }
  });

  console.log('Navigation...');
  await page.goto('https://www.securite-routiere.gouv.fr/reglementation-liee-lusager/conducteurs-avec-ead/liste-nationale-des-installateurs-ead', {
    waitUntil: 'networkidle', timeout: 30000
  });
  await page.waitForTimeout(6000);

  if (captured.length === 0) {
    console.log('Aucun endpoint JSON direct — analyse HTML...');
    const html = await page.content();
    const arcgis = [...html.matchAll(/https?:\/\/[^"'\s<>]+(?:MapServer|FeatureServer)[^"'\s<>]*/g)].map((m: RegExpMatchArray) => m[0]);
    const iframes = await page.$$eval('iframe', (els: Element[]) => (els as HTMLIFrameElement[]).map(e => ({ src: e.src, id: e.id })));
    console.log('ArcGIS URLs:', [...new Set(arcgis)]);
    console.log('Iframes:', JSON.stringify(iframes, null, 2));
    const dataUrls = [...html.matchAll(/["'](https?:\/\/[^"']{10,200}(?:query|\.json|geojson|installateur)[^"']*)/g)].map((m: RegExpMatchArray) => m[1]);
    console.log('Data URLs:', [...new Set(dataUrls)].slice(0, 15));
  } else {
    console.log(`\n✅ ${captured.length} endpoint(s):`);
    captured.forEach(c => {
      console.log(`\nURL: ${c.url}`);
      console.log(`Preview: ${c.preview}`);
    });
  }

  await browser.close();
}

main().catch(console.error);
