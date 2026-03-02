const express = require('express');
const puppeteer = require('puppeteer-core');

const PORT = Number(process.env.PORT || 3000);
const JSON_LIMIT = process.env.JSON_LIMIT || '15mb';
const BLOCK_REMOTE_FONTS = String(process.env.BLOCK_REMOTE_FONTS || '').toLowerCase() === 'true';

const app = express();
app.use(express.json({ limit: JSON_LIMIT }));

let browserPromise;

function resolveExecutablePath() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (envPath) return envPath;
  // Debian/Ubuntu (Dockerfile instala chromium)
  return '/usr/bin/chromium';
}

async function getBrowser() {
  if (!browserPromise) {
    const executablePath = resolveExecutablePath();
    browserPromise = puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browserPromise;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/render', async (req, res) => {
  const {
    html,
    width,
    height,
    selector,
    baseUrl,
    waitUntil,
    timeoutMs,
    forceFontSynthesis,
    fontWeights
  } = req.body || {};

  if (typeof html !== 'string' || !html.trim()) {
    return res.status(400).json({ error: 'html obrigatório' });
  }

  const w = Number(width || 720);
  const h = Number(height || 1280);
  const sel = typeof selector === 'string' && selector.trim() ? selector.trim() : '#rg-card';
  const navigationWaitUntil =
    waitUntil === 'load' || waitUntil === 'networkidle0' || waitUntil === 'networkidle2' || waitUntil === 'domcontentloaded'
      ? waitUntil
      : 'networkidle0';
  const setContentTimeout = Number(timeoutMs || 45000);
  const shouldForceFontSynthesis = forceFontSynthesis !== false;
  const requestedWeights = Array.isArray(fontWeights)
    ? fontWeights.map(v => Number(v)).filter(v => Number.isFinite(v) && v >= 100 && v <= 900)
    : [400, 500, 600, 700];
  const weightsToWarmup = [...new Set(requestedWeights)].slice(0, 8);
  const safeBaseUrl = typeof baseUrl === 'string' && /^https?:\/\//i.test(baseUrl.trim())
    ? baseUrl.trim()
    : null;

  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0 || w > 4000 || h > 4000) {
    return res.status(400).json({ error: 'width/height inválidos (1..4000)' });
  }

  if (!Number.isFinite(setContentTimeout) || setContentTimeout < 1000 || setContentTimeout > 120000) {
    return res.status(400).json({ error: 'timeoutMs inválido (1000..120000)' });
  }

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: Math.floor(w), height: Math.floor(h), deviceScaleFactor: 2 });

    // Por padrão, permite fontes externas (Google Fonts, CDN, etc).
    // Opcionalmente bloqueia apenas domínios de fontes se BLOCK_REMOTE_FONTS=true.
    if (BLOCK_REMOTE_FONTS) {
      await page.setRequestInterception(true);
      page.on('request', (r) => {
        const url = r.url();
        if (url.startsWith('https://fonts.googleapis.com') || url.startsWith('https://fonts.gstatic.com')) {
          return r.abort();
        }
        return r.continue();
      });
    }

    let htmlToRender = html;
    if (safeBaseUrl && /<head[^>]*>/i.test(htmlToRender)) {
      htmlToRender = htmlToRender.replace(/<head([^>]*)>/i, `<head$1><base href="${safeBaseUrl}">`);
    }

    await page.setContent(htmlToRender, { waitUntil: navigationWaitUntil, timeout: Math.floor(setContentTimeout) });

    if (shouldForceFontSynthesis) {
      await page.addStyleTag({
        content: `
          html, body, * {
            font-synthesis: weight style small-caps !important;
            font-synthesis-weight: auto !important;
          }
        `
      });
    }

    // Seletor alvo
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
    } catch {
      // cai para screenshot da página toda
    }

    // Espera de fontes/layout final para aumentar chance de render correto.
    try {
      await page.evaluate(async ({ weights }) => {
        if (!document.fonts || typeof window.getComputedStyle !== 'function') return;

        const cleanFamily = (family) => {
          if (!family) return '';
          const first = String(family).split(',')[0].trim();
          return first.replace(/^['"]|['"]$/g, '');
        };

        const families = new Set();
        const all = document.querySelectorAll('*');

        for (const node of all) {
          const family = cleanFamily(window.getComputedStyle(node).fontFamily);
          if (family) families.add(family);
          if (families.size >= 30) break;
        }

        const loads = [];
        for (const family of families) {
          for (const weight of weights) {
            loads.push(document.fonts.load(`${weight} 16px "${family}"`));
          }
        }

        if (loads.length) {
          await Promise.allSettled(loads);
        }
      }, { weights: weightsToWarmup });

      await Promise.race([
        page.evaluate(() => (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve()),
        new Promise(resolve => setTimeout(resolve, 4000))
      ]);
    } catch {}

    const el = await page.$(sel);
    const buf = el ? await el.screenshot({ type: 'png' }) : await page.screenshot({ type: 'png' });

    res.setHeader('Content-Type', 'image/png');
    res.send(buf);
  } catch (err) {
    const msg = String(err?.message || err || 'erro');
    res.status(500).json({ error: 'render_failed', message: msg });
  } finally {
    if (page) {
      try { await page.close(); } catch {}
    }
  }
});

async function shutdown() {
  try {
    const browser = await browserPromise;
    if (browser) await browser.close();
  } catch {}
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

app.listen(PORT, () => {
  console.log(`renderer-api ouvindo em :${PORT}`);
});
