"use strict";

const fs = require('fs');
const path = require('path');
const express = require('express');
const endpointsRouter = require('../../server/endpoints');
const { logInfo, logError } = require('../../server/console');

const pluginName = "FavStations";
const dataDir = path.join(__dirname, 'files');
const dataPath = path.join(dataDir, 'favstations.json');

function loadData() {
  try {
    if (!fs.existsSync(dataPath)) return {}; // Return empty object for lists
    const raw = fs.readFileSync(dataPath, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    logError(`[${pluginName}] Error loading data:`, e);
    return {};
  }
}

function saveData(list) {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
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
    const data = loadData();
    res.json(data);
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

logInfo(`[${pluginName}] Backend endpoints initialized: /plugins/FavStations/list, /plugins/FavStations/save`);
