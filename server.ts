import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CORE_ADMIN_EMAILS = new Set([
  'rawi@mashaer.store',
  'a.ayman@mashaer.store',
  'abdoun@mashaer.store',
  'a.ashry@mashaer.store',
  's.refaat@mashaer.store',
  'sararefaat79@gmail.com',
  'mayadamashaer@gmail.com',
]);

function readFirebaseApiKey(): string {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { apiKey?: string };
    return (parsed.apiKey || '').trim();
  } catch {
    return '';
  }
}

async function verifyAdminBearerToken(
  authHeader: string | undefined
): Promise<{ ok: true; email: string } | { ok: false; status: number; error: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'مطلوب مصادقة مدير النظام (Firebase ID Token).' };
  }
  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    return { ok: false, status: 401, error: 'رمز التحقق غير صالح.' };
  }

  const apiKey = readFirebaseApiKey();
  if (!apiKey) {
    return { ok: false, status: 500, error: 'تعذر قراءة إعدادات مصادقة Firebase على الخادم.' };
  }

  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      return { ok: false, status: 401, error: 'انتهت صلاحية الجلسة أو الرمز غير صالح. يُرجى إعادة المحاولة.' };
    }
    const payload = (await res.json()) as {
      users?: Array<{ email?: string; emailVerified?: boolean }>;
    };
    const user = payload.users?.[0];
    const email = (user?.email || '').trim().toLowerCase();
    if (!email || !user?.emailVerified) {
      return { ok: false, status: 401, error: 'الحساب غير موثق بالبريد الإلكتروني.' };
    }
    if (!CORE_ADMIN_EMAILS.has(email)) {
      return { ok: false, status: 403, error: 'مزامنة المتجر مخصصة للمديرين السبعة المعتمدين فقط.' };
    }
    return { ok: true, email };
  } catch {
    return { ok: false, status: 502, error: 'تعذر التحقق من صلاحية الجلسة عبر خادم الهوية.' };
  }
}

const STORE_COUNTRIES = [
  { code: 'KW', prefix: 'ar-kw', nameAr: 'الكويت', currency: 'KWD' },
  { code: 'SA', prefix: 'ar-sa', nameAr: 'السعودية', currency: 'SAR' },
  { code: 'AE', prefix: 'ar-ae', nameAr: 'الإمارات', currency: 'AED' },
  { code: 'QA', prefix: 'ar-qa', nameAr: 'قطر', currency: 'QAR' },
  { code: 'BH', prefix: 'ar-bh', nameAr: 'البحرين', currency: 'BHD' },
  { code: 'OM', prefix: 'ar-om', nameAr: 'عمان', currency: 'OMR' },
] as const;

interface LiveCountryPrice {
  countryCode: string;
  countryNameAr: string;
  currency: string;
  price: number | null;
  oldPrice: number | null;
  discountPercent: number | null;
  availability: string;
  storeUrl: string;
}

interface LiveScrapedProduct {
  slug: string;
  sku: string;
  nameAr: string;
  nameEn: string;
  category: 'perfumes' | 'mamoul' | 'spray';
  officialDescription: string;
  imageUrl: string;
  availability: string;
  size: string;
  sourceUrl: string;
  countryPrices: Record<string, LiveCountryPrice>;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function extractMeta(html: string, key: string): string {
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? decodeHtmlEntities(m[1]) : '';
}

function extractProductObj(html: string): Record<string, unknown> | null {
  const match = html.match(/window\.productObj\s*=\s*(\{[\s\S]*?\});/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function detectCategory(slug: string, nameAr: string, nameEn: string): 'perfumes' | 'mamoul' | 'spray' {
  const combined = `${slug} ${nameAr} ${nameEn}`.toLowerCase();
  if (combined.includes('mamoul') || combined.includes('معمول')) return 'mamoul';
  if (combined.includes('spray') || combined.includes('سبراي')) return 'spray';
  return 'perfumes';
}

function inferSize(descAr: string, descEn: string, category: 'perfumes' | 'mamoul' | 'spray'): string {
  const text = `${descAr} ${descEn}`;
  const mlMatch = text.match(/(\d+)\s*(?:مل|ml)/i);
  if (mlMatch) return `${mlMatch[1]} مل`;
  const gmMatch = text.match(/(\d+)\s*(?:جم|غرام|g\b)/i);
  if (gmMatch) return `${gmMatch[1]} جم`;
  if (category === 'mamoul') return '30 جم';
  if (category === 'spray') return '100 مل';
  return '200 مل';
}

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MashaerCareHubSync/2.0 (+https://mashaer.store)',
        Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeCountryPage(slug: string, prefix: string) {
  const url = `https://mashaer.store/${prefix}/products/${slug}`;
  const res = await fetchWithTimeout(url, 12000);
  if (!res.ok) {
    return null;
  }
  const html = await res.text();
  if (!html || html.length < 500) return null;

  const obj = extractProductObj(html);
  const ogTitle = extractMeta(html, 'og:title');
  const ogDesc = extractMeta(html, 'og:description') || extractMeta(html, 'description');
  const ogPrice = extractMeta(html, 'product:price:amount');
  const ogCurrency = extractMeta(html, 'product:price:currency');
  const ogAvail = extractMeta(html, 'product:availability');
  const ogImage = extractMeta(html, 'og:image');

  let objImages = '';
  let sku = '';
  let priceNum: number | null = ogPrice ? Number(ogPrice) : null;
  let oldPriceNum: number | null = null;
  let avail = ogAvail || '';

  if (obj) {
    sku = typeof obj.sku === 'string' ? obj.sku : '';
    const images = Array.isArray(obj.images) ? obj.images : [];
    const firstImg = images[0] as { image?: { large?: string; medium?: string; full_size?: string } } | undefined;
    objImages = firstImg?.image?.large || firstImg?.image?.medium || firstImg?.image?.full_size || '';

    const rawPrice = typeof obj.price === 'number' ? obj.price : Number(obj.price);
    const rawSale = typeof obj.sale_price === 'number' ? obj.sale_price : obj.sale_price ? Number(obj.sale_price) : null;
    if (Number.isFinite(rawSale) && rawSale !== null && rawSale > 0 && Number.isFinite(rawPrice) && rawPrice > rawSale) {
      priceNum = rawSale;
      oldPriceNum = rawPrice;
    } else if (Number.isFinite(rawPrice) && rawPrice > 0) {
      priceNum = rawPrice;
    }

    if (!avail) {
      const qty = typeof obj.quantity === 'number' ? obj.quantity : 0;
      const isInf = Boolean(obj.is_infinite);
      avail = isInf || qty > 0 ? 'in stock' : 'out of stock';
    }
  }

  return {
    url,
    sku,
    title: ogTitle.replace(/\s*[-|]\s*(?:مشاعر|Mashaer).*$/i, '').trim(),
    description: ogDesc.trim(),
    price: Number.isFinite(priceNum) ? priceNum : null,
    oldPrice: Number.isFinite(oldPriceNum) ? oldPriceNum : null,
    currency: ogCurrency,
    availability: avail || 'out of stock',
    imageUrl: objImages || ogImage,
  };
}

async function scrapeFullMashaerCatalog(): Promise<{
  syncedAt: string;
  totalCount: number;
  products: LiveScrapedProduct[];
}> {
  const sitemapRes = await fetchWithTimeout('https://mashaer.store/sitemap_products.xml', 15000);
  if (!sitemapRes.ok) {
    throw new Error(`فشل الاتصال بخريطة منتجات المتجر (${sitemapRes.status})`);
  }
  const xml = await sitemapRes.text();
  const slugMatches = Array.from(xml.matchAll(/<loc>https:\/\/mashaer\.store\/(?:ar(?:-[a-z]{2})?\/)?products\/([^<]+)<\/loc>/gi));
  const uniqueSlugs = Array.from(new Set(slugMatches.map((m) => m[1].trim()).filter(Boolean)));

  if (uniqueSlugs.length === 0) {
    throw new Error('لم يتم العثور على روابط منتجات صالحة داخل sitemap_products.xml');
  }

  const results: LiveScrapedProduct[] = [];
  const batchSize = 4;

  for (let i = 0; i < uniqueSlugs.length; i += batchSize) {
    const chunk = uniqueSlugs.slice(i, i + batchSize);
    const chunkProducts = await Promise.all(
      chunk.map(async (slug): Promise<LiveScrapedProduct | null> => {
        const [kwData, enData, ...otherCountries] = await Promise.all([
          scrapeCountryPage(slug, 'ar-kw').catch(() => null),
          scrapeCountryPage(slug, 'en').catch(() => null),
          ...STORE_COUNTRIES.slice(1).map((c) => scrapeCountryPage(slug, c.prefix).catch(() => null)),
        ]);

        if (!kwData) return null;

        const nameAr = kwData.title || decodeURIComponent(slug);
        const nameEn = enData?.title || '';
        const category = detectCategory(slug, nameAr, nameEn);
        const descAr = kwData.description || enData?.description || nameAr;
        const size = inferSize(descAr, enData?.description || '', category);

        const countryPrices: Record<string, LiveCountryPrice> = {};
        const allPages = [kwData, ...otherCountries];

        STORE_COUNTRIES.forEach((country, idx) => {
          const pageData = allPages[idx];
          if (pageData && pageData.price !== null) {
            const discountPercent =
              pageData.oldPrice && pageData.oldPrice > pageData.price
                ? Math.round(((pageData.oldPrice - pageData.price) / pageData.oldPrice) * 100)
                : null;
            countryPrices[country.code] = {
              countryCode: country.code,
              countryNameAr: country.nameAr,
              currency: pageData.currency || country.currency,
              price: pageData.price,
              oldPrice: pageData.oldPrice,
              discountPercent,
              availability: pageData.availability,
              storeUrl: pageData.url,
            };
          } else {
            countryPrices[country.code] = {
              countryCode: country.code,
              countryNameAr: country.nameAr,
              currency: country.currency,
              price: null,
              oldPrice: null,
              discountPercent: null,
              availability: 'unavailable',
              storeUrl: `https://mashaer.store/${country.prefix}/products/${slug}`,
            };
          }
        });

        return {
          slug,
          sku: kwData.sku || enData?.sku || '',
          nameAr,
          nameEn,
          category,
          officialDescription: descAr,
          imageUrl: kwData.imageUrl || enData?.imageUrl || '',
          availability: kwData.availability === 'in stock' ? 'متوفر' : 'غير متوفر حالياً',
          size,
          sourceUrl: `https://mashaer.store/ar-kw/products/${slug}`,
          countryPrices,
        };
      })
    );

    for (const prod of chunkProducts) {
      if (prod) results.push(prod);
    }
  }

  if (results.length < 5) {
    throw new Error('البيانات المستلمة من المتجر غير مكتملة، تم إيقاف التحديث لحماية البيانات الحالية.');
  }

  return {
    syncedAt: new Date().toISOString(),
    totalCount: results.length,
    products: results,
  };
}

async function startServer() {
  const app = express();
  const PORT = process.env.DEFAULT_APP_PORT
    ? Number(process.env.DEFAULT_APP_PORT)
    : process.env.NODE_ENV === 'production'
      ? Number(process.env.PORT || 3000)
      : 3000;

  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'mashaer-customer-care-hub', timestamp: new Date().toISOString() });
  });

  app.post('/api/mashaer/sync', async (req, res) => {
    const authCheck = await verifyAdminBearerToken(req.headers.authorization);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ ok: false, error: authCheck.error });
      return;
    }
    try {
      const data = await scrapeFullMashaerCatalog();
      res.json({ ok: true, triggeredBy: authCheck.email, ...data });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'تعذر الاتصال بمتجر mashaer.store حالياً';
      res.status(502).json({ ok: false, error: msg });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: !hmrDisabled,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Mashaer Customer Care Hub server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Mashaer server:', err);
  process.exit(1);
});
