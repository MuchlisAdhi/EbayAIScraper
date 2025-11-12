// index.js
const express = require('express');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { scrapeAllProducts, closeBrowser } = require('./scraper');

const app = express();
const port = 3000;

let productDatabase = [];
let isScraping = false;

app.get('/scrape', async (req, res) => {
  if (isScraping) {
    return res.status(429).json({ error: "Scraping sedang berlangsung. Harap tunggu." });
  }

  console.log('Scraping request received...');
  isScraping = true;
  
  let retryCount = 0;
  const maxRetries = 1; // Kurangi retry karena sudah ada retry internal
  
  try {
    console.log(`Memulai scraping...`);
    const products = await scrapeAllProducts();
    
    productDatabase = products.map(p => ({
      id: uuidv4(),
      ...p
    }));
    
    console.log(`Scraping finished. Found ${productDatabase.length} products.`);
    res.json({
      success: true,
      total_products: productDatabase.length,
      products: productDatabase
    });
      
  } catch (error) {
    console.error('Error during scraping:', error);
    await closeBrowser();
    res.status(500).json({ 
      error: 'Failed to scrape data',
      details: error.message 
    });
  } finally {
    isScraping = false;
  }
});

/**
 * @api {get} /products
 * @description Mendapatkan semua list produk yang sudah di-scrape.
 */
app.get('/products', (req, res) => {
  res.json(productDatabase);
});

/**
 * @api {get} /products/:id
 * @description Mendapatkan detail satu produk berdasarkan ID.
 */
app.get('/products/:id', (req, res) => {
  const { id } = req.params;
  const product = productDatabase.find(p => p.id === id);

  if (product) {
    res.json(product);
  } else {
    res.status(404).json({ error: 'Product not found' });
  }
});

/**
 * @api {delete} /products/:id
 * @description Menghapus satu produk berdasarkan ID.
 */
app.delete('/products/:id', (req, res) => {
  const { id } = req.params;
  const index = productDatabase.findIndex(p => p.id === id);

  if (index > -1) {
    productDatabase.splice(index, 1);
    console.log(`Removed product with id: ${id}`);
    res.status(204).send();
  } else {
    res.status(404).json({ error: 'Product not found' });
  }
});


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('--- API Endpoints ---');
  console.log(`  GET /scrape     -> Mulai scraping`);
  console.log(`  GET /products   -> Lihat semua hasil scrape`);
  console.log(`  GET /products/:id -> Lihat detail produk`);
  console.log(`  DELETE /products/:id -> Hapus produk`);
});