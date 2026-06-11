/**
 * ************************************************
 * FavStations Plugin for FM-DX Webserver (v0.1.3)
 * ************************************************
 */

"use strict";

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const express = require('express');
const endpointsRouter = require('../../server/endpoints');
const { logInfo, logError } = require('../../server/console');

logInfo("[FavStations] Backend script is being loaded...");

const pluginName = "FavStations";
const dataPath = path.join(__dirname, 'FavStations_data.json');

// Plugin configuration (options like remote URL, icon display)
const configDir = path.resolve(__dirname, '../../plugins_configs');
const configPath = path.join(configDir, 'FavStations.json');

logInfo(`[FavStations] Config path set to: ${configPath}`);

function loadConfig() {
  try {
    if (!fs.existsSync(configPath)) {
      // Default configuration values
      const defaultConfig = {
        remoteStationsUrl: '',
        showLogos: true,
        showStationsMode: 'all',
        tempSlotCount: 8,
        buttonSize: 'custom',
        customWidth: 120,
        customHeight: 60,
        startupMode: 'server'
      };
      saveConfig(defaultConfig); // Creates the file with default values
      return defaultConfig;
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    logInfo(`[${pluginName}] Loading configuration file from: ${configPath}`);
    return JSON.parse(raw || '{}');
  } catch (e) {
    logError(`[${pluginName}] Error during configuration loading:`, e);
    return {};
  }
}

function saveConfig(config) {
  try {
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config || {}, null, 2), 'utf8');
    return true;
  } catch (e) {
    logError(`[${pluginName}] Error while saving configuration:`, e);
    return false;
  }
}

function loadData() {
  try {
    if (!fs.existsSync(dataPath)) return {}; // Return empty object for lists
    const raw = fs.readFileSync(dataPath, 'utf8');
    logInfo(`[${pluginName}] Loading station data file from: ${dataPath}`);
    return JSON.parse(raw || '{}');
  } catch (e) {
    logError(`[${pluginName}] Error loading data:`, e);
    return {};
  }
}

function saveData(list) {
  try {
    const dir = path.dirname(dataPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dataPath, JSON.stringify(list || {}, null, 2), 'utf8');
    return true;
  } catch (e) {
    logError(`[${pluginName}] Error saving data:`, e);
    return false;
  }
}

// GET list
endpointsRouter.get('/plugins/FavStations/list', (req, res) => {
  try {
    if (!fs.existsSync(dataPath)) {
      return res.json({ data: {}, metadata: { source: 'None', date: 'N/A' } });
    }

    const stats = fs.statSync(dataPath);
    const raw = fs.readFileSync(dataPath, 'utf8');
    const parsed = JSON.parse(raw || '{}');

    let responseData = parsed;
    let responseMeta = { source: 'FavStations_data.json', date: stats.mtime.toLocaleString() };

    // Se il file contiene metadati salvati (es. quelli originali di GitHub), usiamo quelli
    if (parsed && parsed.data && parsed.metadata && parsed.metadata.date) {
      responseData = parsed.data;
      responseMeta = parsed.metadata;
    }

    res.json({ data: responseData, metadata: responseMeta, serverDate: stats.mtime.toLocaleString() });
  } catch (e) {
    logError(`[${pluginName}] Error in /list:`, e);
    res.status(500).json({});
  }
});

// SAVE whole list (client posts full array)
endpointsRouter.post('/plugins/FavStations/save', express.json(), (req, res) => {
  try {
    // Expect an object of lists, not a simple array
    const lists = (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) ? req.body : {};
    const ok = saveData(lists);
    if (ok) {
      logInfo(`[${pluginName}] Saved ${Object.keys(lists).length} list(s)`);
      res.json({ ok: true });
    } else {
      res.status(500).json({ ok: false });
    }
  } catch (e) {
    logError(`[${pluginName}] Error in /save:`, e);
    res.status(500).json({ ok: false });
  }
});

// GET config
endpointsRouter.get('/plugins/FavStations/config', (req, res) => {
  try {
    const config = loadConfig();
    res.json(config);
  } catch (e) {
    logError(`[${pluginName}] Error in /config GET:`, e);
    res.status(500).json({});
  }
});

// POST config (saves the entire configuration object)
endpointsRouter.post('/plugins/FavStations/config', express.json(), (req, res) => {
  try {
    const newConfig = req.body;
    const currentConfig = loadConfig();
    const updatedConfig = { ...currentConfig, ...newConfig }; // Merges new config with existing one
    const ok = saveConfig(updatedConfig);
    if (ok) {
      logInfo(`[${pluginName}] Configuration saved`);
      res.json({ ok: true });
    } else {
      res.status(500).json({ ok: false });
    }
  } catch (e) {
    logError(`[${pluginName}] Error in /config POST:`, e);
    res.status(500).json({ ok: false });
  }
});

const fetchRemoteData = (url, maxRedirects = 5) => {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) {
      return reject(new Error('Too many redirects'));
    }

    const client = url.startsWith('https') ? https : http;
    const options = {
      headers: { 'User-Agent': 'FavStations-Plugin/1.0' }
    };

    client.get(url, options, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Resolves the redirect URL (handles both full links and relative paths)
        const nextUrl = new URL(res.headers.location, url).href;
        logInfo(`[${pluginName}] Redirecting to ${nextUrl}`);
        return fetchRemoteData(nextUrl, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) return reject(new Error(`Status ${res.statusCode} for ${url}`));
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(body);
          // GitHub e la maggior parte dei server usano 'last-modified'. Fallback su 'date' (ora del server remoto).
          let rawDate = res.headers['last-modified'] || res.headers['date'];
          let lastModified = 'N/A';
          if (rawDate) {
            lastModified = new Date(rawDate).toLocaleString();
          }
          resolve({ data: jsonData, lastModified });
        }
        catch (e) { reject(new Error('Invalid JSON from remote')); }
      });
    }).on('error', reject);
  });
};

endpointsRouter.post('/plugins/FavStations/fetch-remote', express.json(), async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ ok: false, error: 'URL missing' });
    logInfo(`[${pluginName}] Fetching remote stations from ${url}...`);
    const { data, lastModified } = await fetchRemoteData(url);
    res.json({ ok: true, data, lastModified });
  } catch (e) {
    logError(`[${pluginName}] Remote fetch failed:`, e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Initialization: ensures configuration exists on startup
loadConfig();

logInfo(`[${pluginName}] Backend endpoints initialized: /plugins/FavStations/list, /plugins/FavStations/save, /plugins/FavStations/config`);
