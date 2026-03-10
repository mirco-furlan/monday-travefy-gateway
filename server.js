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
const TRAVEFY_CONFIG = {
  baseUrl: process.env.TRAVEFY_BASE_URL,
  publicKey: process.env.TRAVEFY_PUBLIC_KEY,
  privateKey: process.env.TRAVEFY_PRIVATE_KEY,
  userToken: process.env.TRAVEFY_USER_TOKEN,
  userId: process.env.TRAVEFY_USER_ID,
};

// Verifica configurazione minima all'avvio
if (!TRAVEFY_CONFIG.baseUrl || !TRAVEFY_CONFIG.publicKey || !TRAVEFY_CONFIG.privateKey || !TRAVEFY_CONFIG.userToken || !TRAVEFY_CONFIG.userId) {
  console.error('WARNING: undefined TRAVEFY_PRIVATE_KEY!');
}

if (!process.env.proxySecret) {
  console.warn('WARNING: undefined PROXY_SECRET_TOKEN! Proxy server is unsecure.');
}

/**
 * Generic Proxy for all Travefy apis
 * Example: GET /api/travefy/trips -> Call Travefy /api/trips
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
    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-PUBLIC-KEY': TRAVEFY_CONFIG.publicKey,
        'X-API-PRIVATE-KEY': TRAVEFY_CONFIG.privateKey,
        'X-USER-TOKEN': TRAVEFY_CONFIG.userToken
      }
    };

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
    // config: {
    //     publicKeySet: !!TRAVEFY_CONFIG.publicKey,
    //     privateKeySet: !!TRAVEFY_CONFIG.privateKey,
    //     userTokenSet: !!TRAVEFY_CONFIG.userToken
    // }
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
