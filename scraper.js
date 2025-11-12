// scraper.js
const cheerio = require('cheerio');

// --- Pengaturan API ---
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
if (!SCRAPER_API_KEY) {
  throw new Error("SCRAPER_API_KEY tidak ada di file .env.");
}
const BASE_PROXY_URL = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}`;
const START_URL = 'https://www.ebay.com/sch/i.html?_from=R40&_nkw=nike&_sacat=0&rt=nc&_pgn=1';
const maxPagesToScrape = 2;

/**
 * FUNGSI getPageHtml dengan retry mechanism
 */
async function getPageHtml(urlToScrape, retries = 3) {
  const encodedUrl = encodeURIComponent(urlToScrape);
  const fullProxyUrl = `${BASE_PROXY_URL}&url=${encodedUrl}`;

  console.log(`Proxy Fetch: Meminta HTML untuk ${urlToScrape}`);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Percobaan ${attempt} dari ${retries}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(fullProxyUrl, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive'
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Proxy API gagal dengan status ${response.status} ${response.statusText}`);
      }
      
      const html = await response.text();
      if (html && html.length > 100) {
        return html;
      } else {
        throw new Error('HTML terlalu pendek atau kosong');
      }
    } catch (error) {
      console.error(`Error percobaan ${attempt}: ${error.message}`);
      if (attempt < retries) {
        const delay = 2000 * attempt; // Exponential backoff
        console.log(`Menunggu ${delay/1000} detik sebelum mencoba lagi...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`Semua ${retries} percobaan gagal untuk URL: ${urlToScrape}`);
  return null;
}

/**
 * FUNGSI extractLinksWithCheerio - ekstrak link produk dari halaman pencarian
 */
async function extractLinksWithCheerio(htmlContent) {
    try {
        const $ = cheerio.load(htmlContent);
        const productUrls = [];
        
        console.log('Mencari link produk dengan Cheerio...');
        
        // Multiple selectors untuk menemukan link produk eBay
        const productSelectors = [
            'a[href*="/itm/"]',
            '.s-item__wrapper > .s-item__link',
            '.s-item__info > a',
            '.srp-results .s-item a'
        ];
        
        for (const selector of productSelectors) {
            $(selector).each((i, elem) => {
                if (productUrls.length >= 15) return false; // Batasi jumlah produk
                
                const href = $(elem).attr('href');
                if (href && href.includes('/itm/')) {
                    // Filter URL yang tidak valid
                    if (href.includes('ebay.com/itm/123456') || 
                        href.includes('ebay.com/itm/0') ||
                        href.includes('sig=') ||
                        href.includes('fake') ||
                        href.includes('example')) {
                        return;
                    }
                    
                    let fullUrl = href.startsWith('http') ? href : `https://www.ebay.com${href}`;
                    
                    // Bersihkan URL dari parameter tracking
                    try {
                        const urlObj = new URL(fullUrl);
                        urlObj.searchParams.forEach((value, key) => {
                            if (key.includes('_trk') || key.includes('_trksid') || key.includes('_from')) {
                                urlObj.searchParams.delete(key);
                            }
                        });
                        fullUrl = urlObj.toString();
                    } catch (e) {
                        // Jika URL parsing gagal, gunakan URL asli
                    }
                    
                    // Hindari duplikat
                    if (!productUrls.includes(fullUrl)) {
                        productUrls.push(fullUrl);
                    }
                }
            });
            
            if (productUrls.length > 0) break; // Stop jika sudah menemukan produk
        }
        
        // Cari next page dengan multiple selectors
        let nextPageUrl = null;
        const nextSelectors = [
            'a.pagination__next',
            'a[rel="next"]',
            '.pagination .pagination__next',
            '.srp-river-answer .pagination__next',
            'a[aria-label*="Next"]',
            'a[class*="next"]',
            '.pagination__next'
        ];
        
        for (const selector of nextSelectors) {
            const nextElem = $(selector).first();
            if (nextElem.length) {
                const href = nextElem.attr('href');
                if (href) {
                    nextPageUrl = href.startsWith('http') ? href : `https://www.ebay.com${href}`;
                    console.log(`Found next page: ${nextPageUrl}`);
                    break;
                }
            }
        }
        
        const uniqueUrls = [...new Set(productUrls)].slice(0, 10);
        
        console.log(`Cheerio menemukan ${uniqueUrls.length} link produk`);
        return {
            productUrls: uniqueUrls,
            nextPageUrl: nextPageUrl
        };
    } catch (error) {
        console.log('Cheerio extraction gagal:', error.message);
        return { productUrls: [], nextPageUrl: null };
    }
}

/**
 * FUNGSI runAIWithFetch - menggunakan AI tanpa Puppeteer
 */
async function runAIWithFetch(prompt, htmlContent) {
    try {
        console.log('Menggunakan AI via fetch...');
        
        // Potong dan bersihkan HTML
        const cleanHtml = htmlContent
            .substring(0, 10000) // Lebih kecil untuk API
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<!--.*?-->/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        
        console.log('HTML setelah pembersihan:', cleanHtml.length, 'karakter');
        
        // Gunakan API AI yang tersedia - contoh dengan OpenAI compatible API
        // Anda bisa mengganti dengan Deepseek API atau lainnya
        const AI_API_URL = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
        const AI_API_KEY = process.env.AI_API_KEY;
        
        if (!AI_API_KEY) {
            console.log('AI_API_KEY tidak tersedia, menggunakan fallback extraction');
            return await extractDetailWithCheerio(cleanHtml);
        }
        
        const requestBody = {
            model: "gpt-3.5-turbo", // atau "deepseek-chat" jika menggunakan Deepseek API
            messages: [
                {
                    role: "system",
                    content: prompt
                },
                {
                    role: "user", 
                    content: `HTML Content: ${cleanHtml}`
                }
            ],
            max_tokens: 1000,
            temperature: 0.1
        };
        
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            throw new Error(`AI API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        const aiResponse = data.choices[0].message.content;
        
        // Parse JSON dari response AI
        try {
            const result = JSON.parse(aiResponse);
            return result;
        } catch (parseError) {
            console.log('Gagal parse JSON dari AI, mencoba extract manually...');
            // Fallback: coba extract data dari text response
            return extractFromAIResponse(aiResponse);
        }
        
    } catch (error) {
        console.error('Error di runAIWithFetch:', error.message);
        return await extractDetailWithCheerio(htmlContent);
    }
}

/**
 * FUNGSI extractFromAIResponse - fallback extraction dari text AI
 */
function extractFromAIResponse(aiResponse) {
    try {
        // Coba extract pattern JSON dari response
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        
        // Fallback manual extraction
        const nameMatch = aiResponse.match(/name["']?\s*:\s*["']([^"']+)["']/i);
        const priceMatch = aiResponse.match(/price["']?\s*:\s*["']([^"']+)["']/i);
        const descMatch = aiResponse.match(/description["']?\s*:\s*["']([^"']+)["']/i);
        
        return {
            name: nameMatch ? nameMatch[1] : '-',
            price: priceMatch ? priceMatch[1] : '-',
            description: descMatch ? descMatch[1].substring(0, 500) : '-'
        };
    } catch (error) {
        console.log('Manual extraction gagal:', error.message);
        return { name: '-', price: '-', description: '-' };
    }
}

/**
 * FUNGSI extractDetailWithCheerio - ekstrak detail produk dengan Cheerio
 */
async function extractDetailWithCheerio(htmlContent) {
    try {
        const $ = cheerio.load(htmlContent);
        
        console.log('Mengekstrak detail produk dengan Cheerio...');
        
        // 1. Ekstrak Nama Produk
        let name = '-';
        const nameSelectors = [
            'h1[class*="product-title"]',
            'h1[class*="item-title"]',
            'h1.x-item-title',
            '.product-title',
            '.item-title',
            '#itemTitle',
            '.x-item-title__mainTitle',
            'h1[data-testid="x-item-title"]',
            'h1'
        ];
        
        for (const selector of nameSelectors) {
            const nameElem = $(selector).first();
            if (nameElem.length) {
                const text = nameElem.text().trim().replace(/\s+/g, ' ');
                if (text && text.length > 3 && text !== '-') {
                    name = text;
                    break;
                }
            }
        }
        
        // 2. Ekstrak Harga
        let price = '-';
        const priceSelectors = [
            '.x-price-primary .ux-textspans',
            '[class*="price"]',
            '.mainPrice',
            '.itemPrice',
            '.x-price-primary',
            '.x-bin-price',
            '.display-price',
            '#prcIsum',
            '.notranslate',
            '.vi-price',
            '.itemPrice .bold'
        ];
        
        for (const selector of priceSelectors) {
            const priceElem = $(selector).first();
            if (priceElem.length) {
                let priceText = priceElem.text().trim();
                // Filter hanya yang mengandung simbol currency atau angka
                if (priceText && (priceText.includes('$') || priceText.includes('USD') || /\d+\.\d{2}/.test(priceText))) {
                    price = priceText.replace(/\s+/g, ' ').substring(0, 50);
                    break;
                }
            }
        }
        
        // 3. Ekstrak Deskripsi
        let description = '-';
        const descSelectors = [
            '#desc',
            '.item-desc',
            '.product-desc',
            '.description',
            '.x-item-description',
            '[class*="description"]',
            '#ds_div',
            '.d-item-description'
        ];
        
        for (const selector of descSelectors) {
            const descElem = $(selector).first();
            if (descElem.length) {
                let descText = descElem.text().trim();
                if (descText && descText.length > 10) {
                    description = descText
                        .replace(/\s+/g, ' ')
                        .substring(0, 500)
                        .trim();
                    break;
                }
            }
        }
        
        // Fallback untuk deskripsi
        if (description === '-') {
            const metaDesc = $('meta[name="description"]').attr('content');
            if (metaDesc && metaDesc.length > 10) {
                description = metaDesc.substring(0, 500);
            }
        }
        
        const result = {
            name: name || '-',
            price: price || '-',
            description: description || '-',
            extracted_with: 'cheerio'
        };
        
        console.log('Detail produk berhasil diekstrak dengan Cheerio');
        return result;
        
    } catch (error) {
        console.log('Cheerio detail extraction gagal:', error.message);
        return { 
            name: '-', 
            price: '-', 
            description: '-',
            extracted_with: 'error'
        };
    }
}

/**
 * FUNGSI extractWithAI untuk detail produk - MENGGUNAKAN AI via HTTP
 */
async function extractWithAI(htmlContent) {
  const prompt = `
    Anda adalah asisten AI untuk ekstraksi data produk eBay. 
    Analisis HTML yang diberikan dan ekstrak informasi berikut dalam format JSON:
    - "name": Nama/judul produk lengkap
    - "price": Harga produk 
    - "description": Deskripsi produk dari penjual
    
    Jika informasi tidak ditemukan, gunakan '-' sebagai nilai default.
    Hanya kembalikan data dalam format JSON, tanpa penjelasan tambahan.
    Contoh output: {"name": "Nike Air Max", "price": "$99.99", "description": "Sepatu olahraga..."}
  `;

  console.log('Mencoba AI untuk detail produk...');
  
  // Coba AI maksimal 2 kali
  for (let attempt = 1; attempt <= 2; attempt++) {
    console.log(`Percobaan AI detail ke-${attempt}`);
    
    try {
        const result = await runAIWithFetch(prompt, htmlContent);
        
        if (result && result.name && result.name !== '-') {
            console.log('AI berhasil mengekstrak detail produk');
            return result;
        }
    } catch (error) {
        console.log(`Percobaan AI ${attempt} gagal:`, error.message);
    }
    
    if (attempt < 2) {
        console.log('AI detail gagal, mencoba lagi dalam 3 detik...');
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log('Semua percobaan AI detail gagal, menggunakan fallback Cheerio...');
  return await extractDetailWithCheerio(htmlContent);
}

/**
 * FUNGSI UTAMA: scrapeAllProducts
 */
async function scrapeAllProducts() {
  let allProductUrls = [];
  let currentUrl = START_URL;
  let pagesScraped = 0;

  try {
    console.log('Memulai scraping tanpa Puppeteer...');
    
    // Phase 1: Kumpulkan semua URL produk dari multiple pages
    while (currentUrl && pagesScraped < maxPagesToScrape) { 
      console.log(`\n--- Halaman ${pagesScraped + 1} ---`); 
      console.log(`URL: ${currentUrl}`);
      
      const searchPageHtml = await getPageHtml(currentUrl); 
      if (!searchPageHtml) {
        console.log('Gagal mendapatkan HTML, skip halaman');
        break;
      }
      
      console.log('Memproses halaman dengan Cheerio...');
      const { productUrls, nextPageUrl } = await extractLinksWithCheerio(searchPageHtml);

      // Filter URL yang valid
      const validUrls = productUrls.filter(url => 
        url && 
        url.includes('ebay.com/itm/') && 
        !url.includes('ebay.com/itm/123456') &&
        !url.includes('ebay.com/itm/0')
      );
      
      if (validUrls.length > 0) {
        allProductUrls.push(...validUrls);
        console.log(`Ditemukan ${validUrls.length} URL produk valid`);
      } else {
        console.log('Tidak ditemukan URL produk valid di halaman ini');
        
        // Debug: Check HTML structure
        if (searchPageHtml.length < 1000) {
            console.log('HTML terlalu pendek, mungkin diblokir');
        }
      }

      currentUrl = nextPageUrl;
      pagesScraped++;
      
      if (!currentUrl) {
        console.log('Tidak ada halaman berikutnya');
        break;
      }
      
      // Delay antar halaman
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`\nTotal ${allProductUrls.length} URL produk valid ditemukan dari ${pagesScraped} halaman.`);
    
    if (allProductUrls.length === 0) {
      console.log('Tidak ada produk yang ditemukan');
      return [];
    }
    
    // Phase 2: Scrape detail setiap produk
    const allProductData = [];
    console.log(`\nMemproses ${allProductUrls.length} produk...`);
    
    for (let i = 0; i < allProductUrls.length; i++) {
      const url = allProductUrls[i];
      console.log(`\n[${i + 1}/${allProductUrls.length}] Memproses: ${url.substring(0, 80)}...`);
      
      try {
        const productPageHtml = await getPageHtml(url);
        if (!productPageHtml) {
          console.log('Gagal mendapatkan HTML produk, skip');
          allProductData.push({ 
            source_url: url, 
            name: '-', 
            price: '-', 
            description: '-',
            error: 'Failed to fetch HTML'
          });
          continue;
        }

        console.log('Mengekstrak detail produk...');
        const data = await extractWithAI(productPageHtml);
        allProductData.push({ 
          source_url: url, 
          ...data 
        });
        
        console.log(`✓ Berhasil: ${data.name ? data.name.substring(0, 50) : 'No name'}...`);
        console.log(`  Harga: ${data.price}`);
        
      } catch (error) {
        console.error(`Error memproses produk ${i + 1}:`, error.message);
        allProductData.push({ 
          source_url: url, 
          name: '-', 
          price: '-', 
          description: '-',
          error: error.message
        });
      }
      
      // Delay antar produk
      if (i < allProductUrls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    
    // Statistik hasil
    const successfulScrapes = allProductData.filter(item => item.name !== '-').length;
    console.log(`\n✅ Scraping selesai!`);
    console.log(`📊 Statistik:`);
    console.log(`   - Total produk diproses: ${allProductData.length}`);
    console.log(`   - Berhasil diekstrak: ${successfulScrapes}`);
    console.log(`   - Gagal: ${allProductData.length - successfulScrapes}`);
    
    return allProductData;

  } catch (error) {
    console.error('Terjadi error besar di scrapeAllProducts:', error);
    return []; 
  }
}

// API Endpoint untuk Express.js
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/scrape', async (req, res) => {
  try {
    console.log('Scraping request received...');
    const products = await scrapeAllProducts();
    
    res.json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    console.error('Error in API:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: 'Ebay AI Scraper API - No Puppeteer Version',
    endpoints: {
      '/api/scrape': 'GET - Scrape eBay products'
    },
    note: 'This version uses Cheerio + AI API instead of Puppeteer'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 API available at: http://localhost:${PORT}/api/scrape`);
    console.log(`🔧 Using Cheerio + AI API (No Puppeteer)`);
  });
}

module.exports = { scrapeAllProducts, app };