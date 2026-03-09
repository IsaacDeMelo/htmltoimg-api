const express = require('express');
const puppeteer = require('puppeteer-core');

const PORT = Number(process.env.PORT || 3000);
const JSON_LIMIT = process.env.JSON_LIMIT || '15mb';
const BLOCK_REMOTE_FONTS = String(process.env.BLOCK_REMOTE_FONTS || '').toLowerCase() === 'true';
const ASSET_CACHE_TTL_MS = Number(process.env.ASSET_CACHE_TTL_MS || 10 * 60 * 1000);
const ASSET_CACHE_MAX_BYTES = Number(process.env.ASSET_CACHE_MAX_BYTES || 20 * 1024 * 1024);
const ASSET_CACHE_MAX_ITEMS = Number(process.env.ASSET_CACHE_MAX_ITEMS || 200);
const ASSET_CACHE_MAX_ENTRY_BYTES = Number(process.env.ASSET_CACHE_MAX_ENTRY_BYTES || 2 * 1024 * 1024);
const REMOTE_FETCH_TIMEOUT_MS = Number(process.env.REMOTE_FETCH_TIMEOUT_MS || 8000);

const app = express();
app.use(express.json({ limit: JSON_LIMIT }));

let browserPromise;
let persistentPage = null;
let profileRenderQueue = Promise.resolve();
const assetCache = new Map();
const assetInflight = new Map();
let assetCacheBytes = 0;

function buildDebugPayload(err, context) {
  const message = String(err?.message || err || 'erro');
  return {
    message,
    name: err?.name || 'Error',
    stage: context?.stage || 'unknown',
    details: context?.details || {},
    stack: typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 8).join('\n') : undefined,
    timestamp: new Date().toISOString()
  };
}

function isCacheEntryExpired(entry) {
  return !entry || entry.expiresAt <= Date.now();
}

function deleteCacheEntry(cache, key, bytesRefName) {
  const entry = cache.get(key);
  if (!entry) return;
  cache.delete(key);

  if (bytesRefName === 'asset') {
    assetCacheBytes -= entry.size;
  }
}

function pruneExpiredEntries(cache, bytesRefName) {
  for (const [key, entry] of cache.entries()) {
    if (isCacheEntryExpired(entry)) {
      deleteCacheEntry(cache, key, bytesRefName);
    }
  }
}

function touchCacheEntry(cache, key, entry) {
  cache.delete(key);
  cache.set(key, entry);
}

function getFromCache(cache, key, bytesRefName) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (isCacheEntryExpired(entry)) {
    deleteCacheEntry(cache, key, bytesRefName);
    return null;
  }

  entry.lastAccessAt = Date.now();
  touchCacheEntry(cache, key, entry);
  return entry;
}

function enforceCacheLimits(cache, bytesRefName, maxBytes, maxItems) {
  while (cache.size > maxItems) {
    const oldestKey = cache.keys().next().value;
    deleteCacheEntry(cache, oldestKey, bytesRefName);
  }

  while (assetCacheBytes > maxBytes && cache.size > 0) {
    const oldestKey = cache.keys().next().value;
    deleteCacheEntry(cache, oldestKey, bytesRefName);
  }
}

function setInCache(cache, key, entry, bytesRefName, maxBytes, maxItems) {
  pruneExpiredEntries(cache, bytesRefName);

  if (cache.has(key)) {
    deleteCacheEntry(cache, key, bytesRefName);
  }

  cache.set(key, entry);
  if (bytesRefName === 'asset') {
    assetCacheBytes += entry.size;
  }

  enforceCacheLimits(cache, bytesRefName, maxBytes, maxItems);
}

async function fetchRemoteAsset(url) {
  const cached = getFromCache(assetCache, url, 'asset');
  if (cached) return cached;

  if (assetInflight.has(url)) {
    return assetInflight.get(url);
  }

  const pending = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'htmltoimg-api/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`asset_fetch_failed:${response.status}`);
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      if (!contentType.startsWith('image/')) {
        throw new Error(`asset_invalid_content_type:${contentType}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (!buffer.length || buffer.length > ASSET_CACHE_MAX_ENTRY_BYTES) {
        return {
          buffer,
          contentType,
          size: buffer.length,
          expiresAt: Date.now() + ASSET_CACHE_TTL_MS,
          cacheable: false
        };
      }

      const entry = {
        buffer,
        contentType,
        size: buffer.length,
        expiresAt: Date.now() + ASSET_CACHE_TTL_MS,
        lastAccessAt: Date.now(),
        cacheable: true
      };

      setInCache(assetCache, url, entry, 'asset', ASSET_CACHE_MAX_BYTES, ASSET_CACHE_MAX_ITEMS);
      return entry;
    } finally {
      clearTimeout(timeout);
      assetInflight.delete(url);
    }
  })();

  assetInflight.set(url, pending);
  return pending;
}

function enqueueProfileRender(task) {
  const run = profileRenderQueue.then(task, task);
  profileRenderQueue = run.catch(() => {});
  return run;
}

async function warmupPageFonts(page) {
  await page.evaluate(async () => {
    if (!document.fonts) return;
    const weights = [400, 500, 600, 700, 1000];
    const families = ['Helvetica Neue', 'Helvetica', 'Arial', 'Yellowtail'];
    const loads = [];

    for (const family of families) {
      for (const weight of weights) {
        loads.push(document.fonts.load(`${weight} 16px "${family}"`).catch(() => {}));
      }
    }

    await Promise.allSettled(loads);
    if (document.fonts.ready) await document.fonts.ready;
  });
}

async function waitForProfileAssets(page, timeoutMs = 8000) {
  await page.evaluate(async (timeout) => {
    const backgroundImageUrls = new Set();
    const urlRegex = /url\((['"]?)(.*?)\1\)/g;

    const collectUrls = (value) => {
      if (!value || value === 'none') return;
      for (const match of value.matchAll(urlRegex)) {
        if (match[2]) backgroundImageUrls.add(match[2]);
      }
    };

    for (const node of document.querySelectorAll('*')) {
      const inlineStyle = node.getAttribute('style') || '';
      collectUrls(inlineStyle);
      collectUrls(window.getComputedStyle(node).backgroundImage);
    }

    const imagePromises = [];

    for (const img of document.images) {
      if (img.complete) continue;
      imagePromises.push(new Promise((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }));
    }

    for (const url of backgroundImageUrls) {
      imagePromises.push(new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => resolve();
        image.src = url;
      }));
    }

    if (!imagePromises.length) return;

    await Promise.race([
      Promise.allSettled(imagePromises),
      new Promise((resolve) => setTimeout(resolve, timeout))
    ]);
  }, timeoutMs);
}

async function handlePersistentPageRequest(request) {
  const url = request.url();

  if (BLOCK_REMOTE_FONTS && (url.startsWith('https://fonts.googleapis.com') || url.startsWith('https://fonts.gstatic.com'))) {
    return request.abort();
  }

  if (request.resourceType() !== 'image' || !/^https?:\/\//i.test(url)) {
    return request.continue();
  }

  try {
    const asset = await fetchRemoteAsset(url);
    return request.respond({
      status: 200,
      contentType: asset.contentType,
      body: asset.buffer,
      headers: {
        'Cache-Control': 'public, max-age=600'
      }
    });
  } catch (err) {
    console.error('[asset_cache_error]', buildDebugPayload(err, {
      stage: 'asset_intercept',
      details: { url }
    }));
    return request.continue();
  }
}


function resolveExecutablePath() {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (envPath) return envPath;
  
  // Tenta múltiplos caminhos comuns
  const fs = require('fs');
  const candidates = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  
  for (const path of candidates) {
    if (fs.existsSync(path)) return path;
  }
  
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

// Função de build HTML do Perfil Academy
function buildRgPerfilHtmlV2(data) {
    const inventoryHtml = (data.inventory || Array(18).fill('')).concat(Array(18)).slice(0, 18).map((url) => {
        let style = '';
        if (url) {
            style = `background-image: url('${url}'); background-size: cover; background-position: center;`;
        }
        return `<div class="inv-slot" style="${style}"></div>`;
    }).join('');

    // Lógica para badge: BOT tem prioridade total sobre DEVS+
    const devTagHtml = data.isBot
        ? `<span class="tag-devs">BOT</span>`
        : (data.isDev ? `<span class="tag-devs">DEVS+</span>` : '');
    // Pin (Broche)
    const pinHtml = `<img class="pin" src="https://res.cloudinary.com/dhdkifjdt/image/upload/v1771599125/20260211_203129_o4fzuy.png" width="70px">`;

    // Detecta se a cor é clara (para mudar texto se necessário)
    const isLightColor = (color) => {
        if (!color) return false;
        const hex = color.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.6;
    };

    const bgColor = data.backgroundColor || '';
    const isDarkBg = !isLightColor(bgColor);
    const textColorWhite = '#ffffff';

    // Define a imagem de fundo com padrão se não tiver imagem
    const defaultBackgroundUrl = 'https://res.cloudinary.com/dhdkifjdt/image/upload/v1771961288/ZjZncDdleTByYjJnN251bHE0eWU=';
    const finalBackgroundUrl = data.backgroundUrl || "https://res.cloudinary.com/dhdkifjdt/image/upload/v1772716794/WhatsApp_Image_2026-03-04_at_15.12.40_p4wk79.jpg";

    // Cria o gradiente dinâmico baseado na cor de fundo
    let dynamicGradientsStyle = '';
    if (bgColor) {
        // Converte hex para RGB para trabalhar com opacidade
        const hex = bgColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        dynamicGradientsStyle = `
            <style>
                .header-image::after {
                    background: linear-gradient(to bottom, transparent 66%, rgba(${r},${g},${b},1) 85%, rgba(${r},${g},${b},1) 100%) !important;
                }
                .stat-val {
                    color: ${textColorWhite} !important;
                    text-shadow: 0 0 4px rgba(0,0,0,0.8) !important;
                }
                .char-name {
                    color: ${textColorWhite} !important;
                    text-shadow: 0 0 4px rgba(0,0,0,0.8) !important;
                }
                .role-secondary {
                    color: #dcdcdc !important;
                    text-shadow: 0 0 3px rgba(0,0,0,0.7) !important;
                }
                .divider {
                    background: ${isDarkBg ? 'var(--text-gold)' : '#8B7500'} !important;
                }
                .money-box {
                    background-color: ${isDarkBg ? 'var(--box-money)' : 'rgba(255, 200, 80, 0.08)'} !important;
                    border-color: ${isDarkBg ? '#5c4030' : 'rgba(139, 117, 0, 0.3)'} !important;
                }
                .inv-slot {
                    background-color: rgba(255, 200, 80, 0.1) !important;
                    border-color: rgba(255, 200, 80, 0.2) !important;
                }
            </style>
        `;
    }

    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RG Academy</title>
    <link href="https://fonts.googleapis.com/css2?family=Yellowtail&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-dark: #251032;
            --bg-card: #281b35;
            --text-gold: #ffc850;
            --text-white: #ffffff;
            --text-gray: #b1a7bc;
            --border-color: #3e2d4d;
            --purple-bar: #7d12ff;
            --box-money: #3d2a1e;
            --card-width: 420px;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background-color: transparent; /* Transparente para o Puppeteer printar só o card */
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            font-weight: 1000;
            font-family: 'Helvetica Neue', 'HelveticaNeue-CondensedBlack', Helvetica, Arial, sans-serif;
            font-synthesis: weight;
            -webkit-font-smoothing: antialiased;
        }
        .profile-container {
            width: 100%;
            max-width: var(--card-width);
            background-color: var(--bg-dark);
            position: relative;
            padding-bottom: 60px;
            box-shadow: 0 0 30px rgba(0, 0, 0, 0.8);
            overflow: hidden;
            font-weight: 1000;
            font-family: 'Helvetica Neue', 'HelveticaNeue-CondensedBlack', Helvetica, Arial, sans-serif;
        }
        .header-image {
            width: 100%;
            height: 420px;
            background-image: url('${finalBackgroundUrl}');
            background-size: cover;
            background-position: center top;
            position: relative;
            z-index: 1;
        }
        .header-image::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 100%;
            /* Gradiente curto: mantém transparência maior e aplica escuro apenas no final */
            background: linear-gradient(to bottom, transparent 66%, var(--bg-dark) 85%, var(--bg-dark) 100%);
            z-index: 2;
        }
        .avatar-section {
            position: relative;
            display: flex;
            justify-content: center;
            margin-top: -260px;
            z-index: 10;
        }
        .avatar-circle {
            width: 144px;
            height: 144px;
            border-radius: 50%;
            border: 3px solid var(--border-color);
            background-image: url('${data.avatarUrl || data.realAvatarUrl || 'https://res.cloudinary.com/dhdkifjdt/image/upload/v1772638834/WhatsApp_Image_2026-03-04_at_12.37.26_nkes8y.jpg'}');
            background-size: cover;
            background-position: center;
            box-shadow: 0 5px 25px rgba(0, 0, 0, 0.6);
            position: relative;
            overflow: visible;
        }

        /* Borda dourada para canonizados */
        .avatar-circle.canonized {
            border: 4px solid var(--text-gold);
        }
        .rank-badge {
            position: absolute;
            bottom: -18px;
            left: 50%;
            transform: translateX(-50%);
            font-family: 'Yellowtail', cursive;
            font-size: 22px;
            font-weight: 700;
            color: #e5ff61;
            text-shadow: -2px 1px 2px rgba(0, 0, 0, 0.95);
            padding: 0px 10px 4px 10px;
            z-index: 12;
            white-space: nowrap;
        }
        .info-section {
            text-align: center;
            padding: 0 15px;
            position: relative;
            z-index: 20;
            margin-top: 15px;
        }
        .char-name {
            font-size: 36px;
            letter-spacing: -1.5px;
            color: var(--text-white);
            text-transform: uppercase;
            margin-bottom: 5px;
            letter-spacing: -1px;
            /* text-shadow intentionally removed to keep bold from the font glyphs */
            display: inline-flex;
            justify-content: center;
            align-items: center;
            position: relative;
            line-height: 1;
            gap: 8px;
            font-weight: 1000;
            /* removed extra stroke to use real font weight */
        }
        .tag-devs {
            position: absolute;
            left: 100%;
            top: -5%;
            font-size: 13px;
            color: var(--text-gold);
            padding: 4px 6px;
            border-radius: 3px;
            transform: translateY(-6px) scale(1.05);
            font-weight: 1000;
        }
        .role-primary {
            font-size: 11px;
            font-weight: 1000;
            color: var(--text-gold);
            letter-spacing: 0.5px;
            /* removed shadow/stroke to rely on font weight */
        }
        .role-primary .role-sep {
            color: #ffffff; /* bolinha branca */
            margin: 0 6px;
        }
        .role-primary .role-item { display: inline; }
        .role-secondary {
            font-size: 12px;
            display: flex; justify-content: center; align-items: center; flex-direction: column;
            color: #dcdcdc;
            line-height: 1.2;
            max-width: 95%;
            height: 40px;
            margin: 0 auto;
            font-weight: 500;
        }
        .divider {
            height: 1px;
            background: var(--text-gold);
            margin-bottom: 10px;
            margin-top: 0px;
            margin-left: auto;
            margin-right: auto;
            width: 90%;
            position: relative;
            z-index: 5;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            text-align: center;
            margin-bottom: 25px;
            padding: 0 10px;
            position: relative;
            z-index: 5;
        }
        .stat-val {
            display: block;
            color: var(--text-white);
            font-weight: 1000;
            font-size: 19px;
            margin-bottom: 2px;
            /* removed stroke/shadow to rely on font glyph weight */
        }
        .stat-label {
            display: block;
            color: var(--text-gray);
            font-size: 8px;
            text-transform: uppercase;
            font-weight: 300;
       
        }
        .resources-wrapper {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            padding: 0 25px;
            margin-bottom: 30px;
            gap: 15px;
            position: relative;
            z-index: 5;
        }
        .money-container {
            display: flex;
            flex-direction: column;
            position: relative;
        }
        .money-label {
            font-size: 9px;
            color: #a496b0;
            text-transform: uppercase;
            margin-bottom: -5px;
            margin-left: 2px;
            position: relative;
            top: -5px;
            text-align: right;
            /* removed stroke/shadow to rely on font glyph weight */
        }
        .money-box {
            position: relative;
            background-color: var(--box-money);
            border: 1px solid #5c4030;
            border-radius: 6px;
            padding: 2px 6px;
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 120px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        }
        .money-value {
            color: var(--text-gold);
            font-weight: 1000;
            font-size: 16px;
            margin-left: 30px;
        }
        .inventory-grid {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 6px;
            padding: 0 20px;
            position: relative;
            z-index: 5;
        }
        .inv-slot {
            background-color: rgba(255, 200, 80, 0.1);
            border: 1px solid rgba(255, 200, 80, 0.2);
            height: 55px;
            width: 55px;
            transition: 0.2s;
        }
        .inv-slot:nth-child(6n+2),
        .inv-slot:nth-child(6n+4) {
            margin-right: 9px; /* Espaço extra visual */
        }
        .pin {
            position: absolute;
            left: -25px;
            top: 50%;
            transform: translateY(-50%);
            filter: drop-shadow(2px 2px 2px rgba(0,0,0,0.5));
        }
    </style>
    ${dynamicGradientsStyle}
</head>
<body>
    <div class="profile-container" id="rg-card" style="${data.backgroundColor ? `background-color: ${data.backgroundColor};` : ''}">
        <div class="header-image"></div>
        <div class="avatar-section">
            <div class="avatar-circle${data.isCanonized ? ' canonized' : ''}">
                <div class="rank-badge">${data.rankTag}</div>
            </div>
        </div>
        <div class="info-section">
            <h1 class="char-name">
                <p style="
            letter-spacing: -1.5px; font-size: 25px; font-weight: 1000">${data.displayName}</p>
                ${devTagHtml}
            </h1>
            <div class="role-primary">${data.roles}</div>
            <div class="role-secondary">${data.description}</div>
        </div>
        <div class="divider"></div>
        <div class="stats-grid">
            <div><span class="stat-val">${data.groupCount}</span><span class="stat-label">Grupos</span></div>
            <div><span class="stat-val">${data.messageCount}</span><span class="stat-label">Mensagens</span></div>
            <div><span class="stat-val">${data.charisma}</span><span class="stat-label">Carisma</span></div>
            <div><span class="stat-val">${data.prestige}</span><span class="stat-label">Prestígio</span></div>
            <div><span class="stat-val">${data.collection}</span><span class="stat-label">Coleção</span></div>
        </div>
        <div class="resources-wrapper">
            <div class="money-container">
       
                <div class="money-box">
                    ${pinHtml}
                    <span class="money-value">${data.academyCash}</span>
                </div>
            </div>
        </div>
        <div class="inventory-grid">
            ${inventoryHtml}
        </div>
    </div>
</body>
</html>`;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});
// Inicializa página persistente com template base
async function getPersistentPage() {
  if (persistentPage) {
    try {
      // Testa se a página ainda está válida
      await persistentPage.evaluate(() => true);
      return persistentPage;
    } catch {
      persistentPage = null;
    }
  }

  const browser = await getBrowser();
  persistentPage = await browser.newPage();
  await persistentPage.setViewport({ width: 420, height: 720, deviceScaleFactor: 2 });

  await persistentPage.setRequestInterception(true);
  persistentPage.on('request', handlePersistentPageRequest);

  // Carrega template base com dados vazios
  const baseHtml = buildRgPerfilHtmlV2({
    displayName: 'Loading',
    rankTag: 'Loading',
    avatarUrl: '',
    backgroundUrl: '',
    backgroundColor: '',
    isBot: false,
    isDev: false,
    isCanonized: false,
    roles: '',
    description: '',
    groupCount: '0',
    messageCount: '0',
    charisma: '0',
    prestige: '0',
    collection: '0',
    academyCash: '0',
    inventory: []
  });

  await persistentPage.setContent(baseHtml, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await persistentPage.waitForSelector('#rg-card', { timeout: 5000 });

  // Força síntese de fontes
  await persistentPage.addStyleTag({
    content: `
      html, body, * {
        font-synthesis: weight style small-caps !important;
        font-synthesis-weight: auto !important;
      }
    `
  });

  // Pré-carrega fontes
  await warmupPageFonts(persistentPage);
  await waitForProfileAssets(persistentPage, 8000);

  console.log('✓ Página persistente inicializada e fontes carregadas');
  return persistentPage;
}


app.post('/render', async (req, res) => {
  let stage = 'init';
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
    stage = 'get_browser';
    const browser = await getBrowser();
    stage = 'new_page';
    page = await browser.newPage();
    stage = 'set_viewport';
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

    stage = 'set_content';
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

    stage = 'screenshot';
    const el = await page.$(sel);
    const buf = el ? await el.screenshot({ type: 'png' }) : await page.screenshot({ type: 'png' });

    res.setHeader('Content-Type', 'image/png');
    res.send(buf);
  } catch (err) {
    const debug = buildDebugPayload(err, {
      stage,
      details: {
        route: '/render',
        selector: sel,
        width: w,
        height: h,
        waitUntil: navigationWaitUntil
      }
    });
    console.error('[render_error]', debug);
    res.status(500).json({ error: 'render_failed', message: debug.message, debug });
  } finally {
    if (page) {
      try { await page.close(); } catch {}
    }
  }
});

// Rota otimizada para renderizar perfil (HTML pré-definido)
app.post('/render-profile', async (req, res) => {
  let stage = 'init';
  try {
    stage = 'read_body';
    const data = req.body || {};

    // Validações mínimas
    if (!data.displayName || !data.rankTag) {
      return res.status(400).json({ error: 'displayName e rankTag obrigatórios' });
    }

    // Defaults
    stage = 'normalize_data';
    const profileData = {
      displayName: data.displayName || 'Desconhecido',
      rankTag: data.rankTag || 'Novato',
      avatarUrl: data.avatarUrl || data.realAvatarUrl || 'https://res.cloudinary.com/dhdkifjdt/image/upload/v1772638834/WhatsApp_Image_2026-03-04_at_12.37.26_nkes8y.jpg',
      backgroundUrl: data.backgroundUrl || 'https://res.cloudinary.com/dhdkifjdt/image/upload/v1772716794/WhatsApp_Image_2026-03-04_at_15.12.40_p4wk79.jpg',
      backgroundColor: data.backgroundColor || '',
      isBot: data.isBot || false,
      isDev: data.isDev || false,
      isCanonized: data.isCanonized || false,
      roles: data.roles || '',
      description: data.description || '',
      groupCount: data.groupCount || '0',
      messageCount: data.messageCount || '0',
      charisma: data.charisma || '0',
      prestige: data.prestige || '0',
      collection: data.collection || '0',
      academyCash: data.academyCash || '0',
      inventory: Array.isArray(data.inventory) ? data.inventory : [],
    };

    stage = 'validate_dimensions';
    const width = Number(data.width || 420);
    const height = Number(data.height || 720);

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 4000 || height > 4000) {
      return res.status(400).json({ error: 'width/height inválidos (1..4000)' });
    }

    stage = 'build_html';
    const html = buildRgPerfilHtmlV2(profileData);

    const buf = await enqueueProfileRender(async () => {
      // Obtém página persistente (já com browser reutilizado)
      stage = 'get_persistent_page';
      const page = await getPersistentPage();

      // Ajusta viewport se necessário
      stage = 'set_viewport';
      const currentViewport = page.viewport();
      if (currentViewport.width !== Math.floor(width) || currentViewport.height !== Math.floor(height)) {
        await page.setViewport({ width: Math.floor(width), height: Math.floor(height), deviceScaleFactor: 2 });
      }

      // Reescreve o template inteiro para garantir estado limpo a cada request.
      stage = 'set_content';
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });

      stage = 'wait_selector';
      await page.waitForSelector('#rg-card', { timeout: 5000 });

      stage = 'apply_font_synthesis';
      await page.addStyleTag({
        content: `
          html, body, * {
            font-synthesis: weight style small-caps !important;
            font-synthesis-weight: auto !important;
          }
        `
      });

      stage = 'wait_fonts';
      await warmupPageFonts(page);

  stage = 'wait_assets';
  await waitForProfileAssets(page, 8000);

      stage = 'screenshot';
      const el = await page.$('#rg-card');
      return el ? await el.screenshot({ type: 'png' }) : await page.screenshot({ type: 'png' });
    });

    res.setHeader('Content-Type', 'image/png');
    res.send(buf);
  } catch (err) {
    const requestData = req.body || {};
    const debug = buildDebugPayload(err, {
      stage,
      details: {
        route: '/render-profile',
        hasDisplayName: Boolean(requestData.displayName),
        hasRankTag: Boolean(requestData.rankTag),
        width: Number(requestData.width || 420),
        height: Number(requestData.height || 720),
        inventoryLength: Array.isArray(requestData.inventory) ? requestData.inventory.length : 0
      }
    });
    console.error('[render_profile_error]', debug);
    res.status(500).json({ error: 'render_profile_failed', message: debug.message, debug });
  }
});

async function shutdown() {
  try {
    if (persistentPage) {
      await persistentPage.close().catch(() => {});
      persistentPage = null;
    }
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
