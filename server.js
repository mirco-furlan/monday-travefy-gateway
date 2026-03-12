require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurazione CORS - permetti monday.com
app.use(cors({
  origin: ['https://monday.com', /\.monday\.com$/],
  credentials: true
}));

app.use(express.json());

// Credenziali Travefy
const TRAVEFY_CONFIG = {baseUrl: process.env.TRAVEFY_BASE_URL};

// Verifica configurazione minima all'avvio
if (!TRAVEFY_CONFIG.baseUrl) {
  console.error('WARNING: undefined TRAVEFY_BASE_URL!');
}

/**
 * Generic Proxy for all Travefy apis
 * Example: GET /travefy/trips -> Call Travefy /api/trips
 */
app.all('/travefy/*', async (req, res) => {
  // 1. Verifica Autorizzazione (se configurata)
  if (process.env.proxySecret) {
    const authHeader = req.headers.authorization;
    const expectedAuth = `Bearer ${process.env.proxySecret}`;

    if (!authHeader || authHeader !== expectedAuth) {
      console.warn(`[Proxy] request not authorized: ${req.method} ${req.url}`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authorization.'
      });
    }
  }

  // Estrai il percorso dopo /api/travefy/
  // req.params[0] contiene la parte corrispondente all'asterisco
  const travefyPath = req.params[0];
  console.log(`[Proxy] ${travefyPath}`);
  const url = `${TRAVEFY_CONFIG.baseUrl}/${travefyPath}`;

  console.log(`[Proxy] ${req.method} ${url}`);

  try {
    const publicKey = req.headers['x-public-key'] || req.headers['x-api-public-key'] || process.env.TRAVEFY_PUBLIC_KEY || '';
    const privateKey = req.headers['x-private-key'] || req.headers['x-api-private-key'] || process.env.TRAVEFY_PRIVATE_KEY || '';
    const userToken = req.headers['x-user-token'] || process.env.TRAVEFY_USER_TOKEN || '';

    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (publicKey) fetchOptions.headers['X-API-PUBLIC-KEY'] = publicKey;
    if (privateKey) fetchOptions.headers['X-API-PRIVATE-KEY'] = privateKey;
    if (userToken) fetchOptions.headers['X-USER-TOKEN'] = userToken;

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, fetchOptions);

    // Gestione risposte non-JSON o errori HTTP
    const contentType = response.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }


    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      error: 'Proxy server error',
      message: error.message
    });
  }
});

/**
 * Health check endpoint per monitoraggio e deployment (Heroku/Vercel)
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    config: {
        baseUrl: TRAVEFY_CONFIG.baseUrl,
        proxySecretConfigured: !!process.env.proxySecret
    }
  });
});

// Avvio server
if (!process.env.NETLIFY) {
  app.listen(PORT, () => {
    console.log(`Proxy server running on port ${PORT}`);
    console.log(`Targeting Travefy API: ${TRAVEFY_CONFIG.baseUrl}`);
  });
}

module.exports = app;
