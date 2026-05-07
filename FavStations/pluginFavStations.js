/**
 * ************************************************
 * FavStations Plugin for FM-DX Webserver
 * ************************************************
 */

"use strict";
 
(() => {
  const pluginVersion = '0.0.11a';
  const pluginId = 'favstations-plugin';

  // Custom styled tooltip to match fmdxwebserver UI style (like top plugin buttons)
  const showTip = (btn, text) => {
    hideTip();
    const tip = document.createElement('div');
    tip.id = 'favstations-custom-tip';
    tip.textContent = text;
    // Style mimicking fmdxwebserver top-bar plugin buttons (like sysinfo)
    tip.style.cssText = `
      position: fixed;
      background: rgba(15, 15, 15, 0.96);
      color: #ffffff;
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 12px;
      border: 1px solid #444;
      z-index: 20000;
      pointer-events: none;
      box-shadow: 0 4px 15px rgba(0,0,0,0.7);
      white-space: pre-wrap;
      opacity: 0;
      transition: opacity 0.15s ease-in-out;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    document.body.appendChild(tip);

    const rect = btn.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tip.offsetWidth / 2;
    let top = rect.top - tip.offsetHeight - 8;

    // Basic viewport safety
    if (left < 10) left = 10;
    if (left + tip.offsetWidth > window.innerWidth - 10) left = window.innerWidth - tip.offsetWidth - 10;
    if (top < 10) top = rect.bottom + 8;

    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    requestAnimationFrame(() => tip.style.opacity = '1');
  };

  const hideTip = () => {
    const tip = document.getElementById('favstations-custom-tip');
    if (tip) tip.remove();
  };

  const storageKey = 'FavStationsList_v1';
  const listsKey = 'FavStationsLists_v1';
  const repoBaseUrl = 'https://raw.githubusercontent.com/mm-prg/FavStations/main';
  const defaultRemoteStationsUrl = 'https://pastebin.com/raw/s7RMKj4g'; // Fallback URL if not configured
  const configKey = 'FavStations_config_v1'; // Key for configuration localStorage fallback
  let currentListName = 'Default';
  let listsObj = {};
  let stations = [];
  let updateAvailable = false;
  let remoteVersionFound = null;
  let isAdmin = false;

  function checkAdminMode() {
    const bodyText = document.body.textContent || document.body.innerText;
    const str1 = "You are logged in as an administrator.";
    const str2 = "You are logged in as an adminstrator."; // FM-DX typo compatibility
    
    const found1 = bodyText.includes(str1);
    const found2 = bodyText.includes(str2);
    const found3 = !!document.getElementById('plugin-settings') || window.location.pathname.includes('/setup');
    isAdmin = found1 || found2 || found3;

    console.log(`[FavStations] --- Admin Check ---`);
    console.log(`[FavStations] Searching for: "${str1}" -> Found: ${found1}`);
    console.log(`[FavStations] Searching for: "${str2}" -> Found: ${found2}`);
    console.log(`[FavStations] Resulting isAdmin: ${isAdmin}`);
    if (!isAdmin) {
      console.log(`[FavStations] Page Text Snippet: "${bodyText.substring(0, 250).replace(/\n/g, ' ')}..."`);
    }
    console.log(`[FavStations] ------------------`);
  }

  let tempSlots = new Array(5).fill(null);
  let config = {
    remoteStationsUrl: defaultRemoteStationsUrl,
    showLogos: true,
    autoImportDone: false,
    buttonSize: 'normal',
    customWidth: null,
    customHeight: null,
  };

  document.addEventListener('DOMContentLoaded', async () => {
    checkAdminMode();
    await loadConfigAndInitialize();
    // Se isAdmin è ancora false ma vediamo il div dei plugin, forziamo true
    if (!isAdmin && document.getElementById('plugin-settings')) {
      isAdmin = true;
    }

    if (isAdmin) {
      checkForUpdates();
    }
  });

  async function loadConfigAndInitialize() {
    // Do not show the station bar if we are on the setup page
    if (window.location.pathname.includes('/setup') || document.getElementById('plugin-settings')) return;

    try {
      const res = await fetch('/plugins/FavStations/config');
      if (res.ok) {
        const serverConfig = await res.json();
        config = { ...config, ...serverConfig }; // Merges server config with defaults
        console.log('FavStations: Loaded configuration from server (/plugins/FavStations/config)');
      } else {
        throw new Error('Unable to retrieve configuration from server');
      }
    } catch (e) {
      console.warn('FavStations: Unable to load configuration from server, falling back to local storage.', e);
      // Fallback to localStorage (for compatibility or if server is unavailable)
      try {
        const localConfigRaw = localStorage.getItem(configKey);
        if (localConfigRaw) {
          config = { ...config, ...JSON.parse(localConfigRaw) };
          console.log('FavStations: Loaded configuration from local storage fallback');
        }
      } catch (e) {
        console.error('FavStations: Error loading configuration from local storage', e);
      }
    }

    // Ensures showLogos is a boolean
    config.showLogos = !!config.showLogos;

    createBar();
    await fetchList(); // Loads current stations (local cache or server)

    // If a remote link exists, always force loading on startup
    if (config.remoteStationsUrl || defaultRemoteStationsUrl) {
      await importFromRemote(true);
    }
  }

  function getButtonDims() {
    if (config.buttonSize === 'custom' && config.customWidth && config.customHeight) {
      const w = config.customWidth;
      const h = config.customHeight;
      const scaleH = h / 44;
      const scaleW = w / 72;
      return {
        station: { w, h },
        control: { w: Math.round(36 * scaleW), h: Math.round(28 * scaleH) },
        font: Math.round(16 * scaleH),
        stationFont: Math.round(14 * scaleH),
        nameFont: Math.round(10 * scaleH)
      };
    }
    // Default 'normal' dimensions
    return { station: { w: 72, h: 44 }, control: { w: 36, h: 28 }, font: 16, stationFont: 14, nameFont: 10 };
  }

  // Function to persist configuration on server and locally
  async function persistConfig() {
    try {
      const res = await fetch('/plugins/FavStations/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      localStorage.setItem(configKey, JSON.stringify(config));
      return res.ok;
    } catch (e) {
      console.error('FavStations: Error saving config', e);
      localStorage.setItem(configKey, JSON.stringify(config));
      return false;
    }
  }

  // Imports stations from a remote JSON link
  async function importFromRemote(silent = false) {
    let url = config.remoteStationsUrl || defaultRemoteStationsUrl; // Uses value from configuration, falls back to default
    if (!silent) {
      const inputUrl = prompt('Enter Remote Stations JSON URL:', url);
      if (inputUrl === null) return false;
      url = (inputUrl.trim()) || url;
    }
    
    if (!silent) showToast('Fetching remote stations...');
    try {
      const res = await fetch('/plugins/FavStations/fetch-remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data && data.ok && data.data) {
        const parsed = data.data;
        console.log(`FavStations: Imported stations from remote URL: ${url}`);
        // Updates remote URL in configuration if changed
        if (url !== config.remoteStationsUrl) {
          config.remoteStationsUrl = url;
          await persistConfig();
        }
        
        if (Array.isArray(parsed)) {
          // Legacy format (single list)
          const sane = parsed.map(item => ({
            freq: item.freq ? String(item.freq) : '',
            name: item.name || '',
            antenna: item.antenna || '',
            logo: item.logo || '',
            itu: item.itu || '',
            picode: item.picode || generateId()
          }));
          stations = sane;
          listsObj[currentListName] = stations;
        } else if (parsed && typeof parsed === 'object') {
          // Multi-list format
          const newLists = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (!Array.isArray(v)) continue;
            newLists[k] = v.map(item => ({
              freq: item && item.freq ? String(item.freq) : '',
              name: item && item.name ? item.name : '',
              antenna: item && item.antenna ? item.antenna : '',
              logo: item && item.logo ? item.logo : '',
              itu: item && item.itu ? item.itu : '',
              picode: item && item.picode ? item.picode : generateId()
            }));
          }
          listsObj = newLists;
          if (!listsObj[currentListName]) {
            const keys = Object.keys(listsObj);
            currentListName = keys.length ? keys[0] : currentListName;
          }
          stations = listsObj[currentListName] || [];
        } else {
          throw new Error('Invalid format');
        }

        await persistStations();
        renderButtons();
        updateListSelect();
        if (!silent) showToast(`Imported stations from remote`);
        return true;
      } else {
        if (!silent) alert('Failed to import: ' + (data && data.error ? data.error : 'Unknown error'));
        return false;
      }
    } catch (e) {
      console.error('FavStations: remote import error', e);
      if (!silent) alert('Failed to fetch from remote: ' + e.message);
      return false;
    }
  }

  // Loads lists from JSON file
  function importStations() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      try {
        const txt = await file.text();
        const parsed = JSON.parse(txt);
        console.log(`FavStations: Imported stations from local file: ${file.name}`);
        if (Array.isArray(parsed)) {
          // Legacy format (single list)
          const sane = parsed.map(item => ({
            freq: item.freq ? String(item.freq) : '',
            name: item.name || '',
            antenna: item.antenna || '',
            logo: item.logo || '',
            itu: item.itu || '',
            picode: item.picode || generateId()
          }));
          stations = sane;
          listsObj[currentListName] = stations;
        } else if (parsed && typeof parsed === 'object') {
          // Multi-list format
          const newLists = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (!Array.isArray(v)) continue;
            newLists[k] = v.map(item => ({
              freq: item && item.freq ? String(item.freq) : '',
              name: item && item.name ? item.name : '',
              antenna: item && item.antenna ? item.antenna : '',
              logo: item && item.logo ? item.logo : '',
              itu: item && item.itu ? item.itu : '',
              picode: item && item.picode ? item.picode : generateId()
            }));
          }
          listsObj = newLists;
          if (!listsObj[currentListName]) {
            const keys = Object.keys(listsObj);
            currentListName = keys.length ? keys[0] : currentListName;
          }
          stations = listsObj[currentListName] || [];
        } else {
          throw new Error('Invalid format');
        }
        await persistStations();
        renderButtons();
        updateListSelect();
        showToast(`Imported ${file.name}`);
      } catch (e) {
        console.error('FavStations: import error', e);
        alert('Failed to import list: ' + (e && e.message ? e.message : String(e)));
      }
    };
    input.click();
  }

  // Exports all lists to a JSON file
  async function exportStations() {
    await persistStations();
    try {
      const dataObj = (listsObj && Object.keys(listsObj).length) ? listsObj : { [currentListName]: (stations || []) };
      const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const filename = `FavStations (${dateStr}).json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      showToast(`Exported ${filename}`);
    } catch (e) { console.error('FavStations: export error', e); showToast('Export failed'); }
  }

  function createBar() {
    if (document.getElementById(pluginId)) return;
    const dims = getButtonDims();

    const bar = document.createElement('div');
    bar.id = pluginId;
    // Position relative to flow at the bottom
    bar.style.marginTop = '16px';
    bar.style.marginLeft = '8px';
    bar.style.marginRight = '8px';
    bar.style.display = 'flex';
    bar.style.flexDirection = 'column';
    bar.style.gap = '8px';
    bar.style.alignItems = 'stretch';
    bar.style.padding = '6px';
    bar.style.borderRadius = '8px';
    bar.style.backdropFilter = 'blur(6px)';
    bar.style.background = 'rgba(0,0,0,0.45)';
    bar.style.overflowX = 'auto';

    // Main Menu (at the start of the row)
    const menuBtn = document.createElement('button');
    menuBtn.textContent = '☰';
    menuBtn.id = 'favstations-menu-btn';
    menuBtn.style.width = dims.control.w + 'px';
    menuBtn.style.height = dims.control.h + 'px';
    menuBtn.style.padding = '0';
    menuBtn.style.background = '#111';
    menuBtn.style.border = '1px solid #333';
    menuBtn.style.borderRadius = '4px';
    menuBtn.style.color = '#fff';
    menuBtn.style.fontSize = dims.font + 'px';
    menuBtn.style.display = 'inline-flex';
    menuBtn.style.alignItems = 'center';
    menuBtn.style.justifyContent = 'center';

    menuBtn.addEventListener('mouseenter', () => {
      let tooltipText = `FavStations (v${pluginVersion})`;
      if (updateAvailable && isAdmin) {
        tooltipText += `\n🚀 Update available (v${remoteVersionFound})`;
      }
      showTip(menuBtn, tooltipText);
    });
    menuBtn.addEventListener('mouseleave', hideTip);
    menuBtn.addEventListener('mousedown', hideTip);

    menuBtn.onclick = (e) => {
      hideTip();
      const rect = menuBtn.getBoundingClientRect();
      const menuItems = [
        { label: 'Manage Lists', action: openManager },
        { label: 'Import Lists (JSON)', action: importStations },
        { label: 'Export Lists (JSON)', action: exportStations },
        { label: 'Import from Remote URL', action: () => importFromRemote(false) },
        { label: 'Buttons size', action: openDimensionEditor },
        {
          label: config.showLogos ? 'Hide station icons' : 'Show station icons',
          action: async () => {
            config.showLogos = !config.showLogos;
            await persistConfig();
            renderButtons();
            renderTempSlots();
            updateListSelect();
          }
        }
      ];

      if (updateAvailable && isAdmin) {
        menuItems.unshift({
          label: `🚀 Update Now (v${remoteVersionFound})`,
          action: async () => {
            if (confirm(`Update FavStations to version ${remoteVersionFound}?`)) {
              await performUpdate();
            }
          }
        });
      }

      showStationContextMenu(rect.left, rect.bottom + 5, {
        items: menuItems
      });
    };

    // Controls row (manage, save current, list select)
    const controlsRow = document.createElement('div');
    controlsRow.style.cssText = 'display:flex; gap:8px; align-items:center;';
    controlsRow.appendChild(menuBtn);

    // List selector (shows all existing lists)
    const listSelect = document.createElement('select');
    listSelect.id = 'favstations-list-select';
    listSelect.style.cssText = `margin-left: 8px; padding: 0 8px; height: ${dims.control.h}px; background: #222; color: #fff; border: 1px solid #444; border-radius: 6px; font-size: 13px; outline: none; cursor: pointer; vertical-align: middle;`;
    listSelect.onchange = () => {
      const val = listSelect.value;
      if (!val) return;
      if (val === '__new__') {
        // create new list from dropdown
        let name = prompt('Name for new list:', `List ${new Date().toISOString().slice(0,19).replace('T',' ')}`);
        if (name === null) return; // cancelled
        name = (String(name || '').trim()) || `List ${Date.now()}`;
        createNewList(name);
        return;
      }
      currentListName = val;
      stations = listsObj[currentListName] || [];
      renderButtons();
      const span = document.getElementById('favstations-list-name'); if (span) span.textContent = currentListName;
    };
    controlsRow.appendChild(listSelect);

    // Temporary slot buttons container (5 slots)
    const tempContainer = document.createElement('div');
    tempContainer.style.display = 'flex';
    tempContainer.style.gap = '6px';
    tempContainer.style.marginLeft = '8px';
    controlsRow.appendChild(tempContainer);

    const clearTempBtn = document.createElement('button');
    clearTempBtn.textContent = '🗑️';
    clearTempBtn.style.cssText = `width:${dims.control.w}px; height:${dims.control.h}px; padding:0; background:#111; border:1px solid #333; border-radius:4px; color:#fff; font-size:${dims.font}px; display:inline-flex; align-items:center; justify-content:center; margin-left:4px; cursor:pointer;`;
    clearTempBtn.onclick = () => {
      tempSlots = new Array(5).fill(null); renderTempSlots(); showToast('All slots cleared');
    };
    clearTempBtn.addEventListener('mouseenter', () => showTip(clearTempBtn, 'Clear all temporary slots'));
    clearTempBtn.addEventListener('mouseleave', hideTip);
    clearTempBtn.addEventListener('mousedown', hideTip);
    controlsRow.appendChild(clearTempBtn);

    function renderTempSlots() {
      tempContainer.innerHTML = '';
      tempSlots.forEach((item, si) => tempContainer.appendChild(createTempButton(si)));
    }

    function createTempButton(si) {
      const dims = getButtonDims();
      const data = tempSlots[si];
      const btn = document.createElement('button');
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.padding = '4px';
      btn.style.borderRadius = '6px';
      btn.style.background = '#111';
      btn.style.border = '1px solid #333';
      btn.style.color = '#fff';
      btn.style.width = dims.station.w + 'px';
      btn.style.height = dims.station.h + 'px';
      btn.style.overflow = 'hidden';
      btn.style.fontSize = (dims.stationFont - 2) + 'px';

      const tooltipText = data 
        ? (data.freq ? `${data.freq} MHz` : '') + (data.freq && data.name ? ' — ' : '') + (data.name || '') + (data.itu ? ` [${data.itu}]` : '') + (data.picode ? ` (${data.picode})` : '')
        : `Temp slot ${si+1}: click to save current, click again to tune`;
      btn.addEventListener('mouseenter', () => showTip(btn, tooltipText));
      btn.addEventListener('mouseleave', hideTip);
      btn.addEventListener('mousedown', hideTip);

      if (config.showLogos && data && data.logo) {
        const img = document.createElement('img');
        img.src = data.logo;
        img.alt = data.name || '';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        img.style.borderRadius = '4px';
        btn.appendChild(img);
      } else {
        const ph = document.createElement('div');
        ph.style.width = '100%';
        ph.style.height = '100%';
        ph.style.background = '#333';
        ph.style.borderRadius = '4px';
        ph.style.display = 'flex';
        ph.style.flexDirection = 'column';
        ph.style.alignItems = 'center';
        ph.style.justifyContent = 'center';
        ph.style.color = '#fff';
        ph.style.padding = '2px';
        ph.style.textAlign = 'center';
        ph.style.overflow = 'hidden';
        ph.style.boxSizing = 'border-box';

        if (data && data.freq) {
          const freqEl = document.createElement('div');
          freqEl.style.fontWeight = 'bold';
          freqEl.style.fontSize = dims.stationFont + 'px';
          const freqNum = parseFloat(data.freq);
          freqEl.textContent = !isNaN(freqNum) ? (freqNum < 30 ? freqNum.toFixed(3) : freqNum.toFixed(1)) : data.freq;
          ph.appendChild(freqEl);
        }
        if (data && data.name) {
          const nameEl = document.createElement('div');
          nameEl.style.fontSize = dims.nameFont + 'px';
          nameEl.style.lineHeight = '1.1';
          nameEl.style.width = 'calc(100% - 4px)';
          nameEl.style.whiteSpace = 'nowrap';
          nameEl.style.overflow = 'hidden';
          nameEl.style.textOverflow = 'ellipsis';
          nameEl.textContent = data.name;
          ph.appendChild(nameEl);
        }
        btn.appendChild(ph);
      }

      btn.onclick = async () => {
        if (tempSlots[si]) {
          const freq = parseFloat(tempSlots[si].freq);
          if (!isNaN(freq) && window.socket && socket.readyState === WebSocket.OPEN) {
            try {
              socket.send('T' + Math.round(Number(freq) * 1000));
              showToast(`Tuned ${tempSlots[si].freq}`);
            } catch (err) { console.error('FavStations: tuning error', err); showToast(`Error tuning ${tempSlots[si].freq}`); }
          } else {
            try { await navigator.clipboard.writeText(String(tempSlots[si].freq)); showToast(`Copied ${tempSlots[si].freq}`); } catch (e) { showToast(String(tempSlots[si].freq)); }
          }
        } else {
          // save current to slot
          const info = getCurrentStationInfo();
          if (!info.freq) return showToast('No frequency to save');
          const item = { freq: String(info.freq), name: info.name || '', antenna: info.antenna || '', logo: info.logo || '', itu: info.itu || '', picode: getPiCode() || generateId() };
          tempSlots[si] = item;
          renderTempSlots();
          showToast(`Saved to slot ${si+1}`);
        }
      };

      btn.ondblclick = () => openGenericEditor({ isTemp: true, index: si });

      // long-press and right-click: open custom context menu
      (function attachContextHandlers(btnEl, slotIndex) {
        const LONG_PRESS_MS = 600;
        let pressTimer = null;
        function openMenuAt(x, y) {
          btnEl._longPressed = true;
          showStationContextMenu(x, y, {
            items: [
              { label: 'Edit station', action: () => openGenericEditor({ isTemp: true, index: slotIndex }) },
              { label: 'Delete station', action: () => { tempSlots[slotIndex] = null; renderTempSlots(); showToast(`Deleted slot ${slotIndex+1}`); } },
              { label: 'Copy current into this', action: () => {
                  const info = getCurrentStationInfo(); if (!info.freq) return showToast('No frequency to copy');
                  const item = { freq: String(info.freq), name: info.name || '', antenna: info.antenna || '', logo: info.logo || '', itu: info.itu || '', picode: getPiCode() || generateId() };
                  tempSlots[slotIndex] = item; renderTempSlots(); showToast(`Copied current to slot ${slotIndex+1}`);
              } },
              { label: 'Clear all temp slots', action: () => {
                  tempSlots = new Array(5).fill(null); renderTempSlots(); showToast('All slots cleared');
              } }
            ]
          });
        }

        btnEl.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); openMenuAt(ev.clientX, ev.clientY); });

        btnEl.addEventListener('mousedown', (ev) => {
          if (ev.button !== 0) return;
          pressTimer = setTimeout(() => {
            const rect = btnEl.getBoundingClientRect();
            openMenuAt(rect.left + rect.width/2, rect.top + rect.height/2);
          }, LONG_PRESS_MS);
        });
        ['mouseup','mouseleave'].forEach(n => btnEl.addEventListener(n, () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }));
        btnEl.addEventListener('touchstart', (ev) => {
          pressTimer = setTimeout(() => {
            const touch = ev.touches && ev.touches[0];
            openMenuAt(touch ? touch.clientX : btnEl.getBoundingClientRect().left, touch ? touch.clientY : btnEl.getBoundingClientRect().top);
          }, LONG_PRESS_MS);
        }, { passive: true });
        btnEl.addEventListener('touchend', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
      })(btn, si);

      return btn;
    }

    // render initial empty temp slots
    renderTempSlots();

    // append controls row to bar
    bar.appendChild(controlsRow);

    // populate select now if listsObj already loaded
    setTimeout(() => updateListSelect(), 50);

    // Buttons row (station buttons) placed on its own line
    const buttonsRow = document.createElement('div');
    buttonsRow.style.display = 'flex';
    buttonsRow.style.justifyContent = 'flex-start';
    buttonsRow.style.width = '100%';
    buttonsRow.style.overflowX = 'auto';
    const container = document.createElement('div');
    container.id = 'favstations-buttons';
    container.style.display = 'flex';
    container.style.gap = '6px';
    buttonsRow.appendChild(container);
    bar.appendChild(buttonsRow);

    document.body.appendChild(bar);
  }

  function renderButtons() {
    const container = document.getElementById('favstations-buttons');
    if (!container) return;
    container.innerHTML = '';
    const dims = getButtonDims();

    // Compute how many buttons fit per row based on available space
    const buttonsRow = container.parentElement || container;
    const availableWidth = (buttonsRow && buttonsRow.clientWidth) || (window.innerWidth - 32);
    const BUTTON_WIDTH = dims.station.w; // must match createStationButton width
    const GAP = 6; // gap used between buttons
    const perButtonTotal = BUTTON_WIDTH + GAP;
    const MAX_PER_ROW = Math.max(1, Math.floor(availableWidth / perButtonTotal));

    const rows = Math.ceil(stations.length / MAX_PER_ROW);
    if (rows <= 1) {
      container.style.flexDirection = 'row';
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = GAP + 'px';
      stations.forEach((st, idx) => row.appendChild(createStationButton(st, idx)));
      container.appendChild(row);
      // append save current button after the last station button
      row.appendChild(createSaveCurrentButton());
    } else {
      // create multiple rows stacked vertically
      container.style.flexDirection = 'column';
      let lastRow = null;
      for (let r = 0; r < rows; r++) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = GAP + 'px';
        if (r < rows - 1) row.style.marginBottom = '6px';
        const start = r * MAX_PER_ROW;
        const slice = stations.slice(start, start + MAX_PER_ROW);
        slice.forEach((st, i) => row.appendChild(createStationButton(st, start + i)));
        container.appendChild(row);
        lastRow = row;
      }
      if (lastRow) lastRow.appendChild(createSaveCurrentButton());
    }

    // createSaveCurrentButton: returns a button element appended after station buttons
    function createSaveCurrentButton() {
      const dims = getButtonDims();
      const btn = document.createElement('button');
      btn.textContent = '＋';
      btn.addEventListener('mouseenter', () => showTip(btn, 'Save current station to list'));
      btn.addEventListener('mouseleave', hideTip);
      btn.addEventListener('mousedown', hideTip);
      btn.style.background = '#111';
      btn.style.border = '1px solid #333';
      btn.style.borderRadius = '4px';
      btn.style.color = '#fff';
      btn.style.width = dims.control.w + 'px';
      btn.style.height = dims.control.h + 'px';
      btn.style.padding = '0';
      btn.style.fontSize = dims.font + 'px';
      btn.style.marginLeft = '6px';
      btn.onclick = async () => {
        const info = getCurrentStationInfo();
        if (!info.freq) return showToast('No frequency to save');
        const item = {
          freq: String(info.freq),
          name: info.name || '',
          antenna: info.antenna || '',
          logo: info.logo || '',
          itu: info.itu || '',
          picode: getPiCode() || generateId()
        };
        stations.push(item);
        await persistStations();
        renderButtons();
        showToast('Station saved');
      };
      return btn;
    }
  }

  // Context menu for station/temp buttons
  function showStationContextMenu(x, y, opts) {
    // remove existing menu
    const prev = document.getElementById('favstations-context-menu');
    if (prev) prev.remove();
    const menu = document.createElement('div');
    menu.id = 'favstations-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = (x || 100) + 'px';
    menu.style.top = (y || 100) + 'px';
    menu.style.zIndex = 12000;
    menu.style.background = '#222';
    menu.style.color = '#fff';
    menu.style.borderRadius = '6px';
    menu.style.padding = '6px';
    menu.style.minWidth = '140px';
    menu.style.boxShadow = '0 6px 18px rgba(0,0,0,0.5)';
    menu.style.fontSize = '13px';
    menu.style.display = 'flex';
    menu.style.flexDirection = 'column';

    function makeItem(text, cb) {
      const it = document.createElement('div');
      it.textContent = text;
      it.style.padding = '6px 8px';
      it.style.cursor = 'pointer';
      it.onmouseenter = () => it.style.background = 'rgba(255,255,255,0.06)';
      it.onmouseleave = () => it.style.background = 'transparent';
      it.onclick = (ev) => { ev.stopPropagation(); cb(); menu.remove(); };
      return it;
    }

    (opts.items || []).forEach(i => menu.appendChild(makeItem(i.label, i.action)));

    // close on any click outside or escape
    setTimeout(() => {
      const remove = () => { menu.remove(); document.removeEventListener('click', remove); document.removeEventListener('keydown', onKey); };
      function onKey(ev) { if (ev.key === 'Escape') remove(); }
      document.addEventListener('click', remove);
      document.addEventListener('keydown', onKey);
    }, 0);

    document.body.appendChild(menu);

    // Adjust position if out of bounds (e.g. bottom of screen)
    const rect = menu.getBoundingClientRect();
    if (y + rect.height > window.innerHeight) {
      menu.style.top = (y - rect.height) + 'px';
    }
    if (x + rect.width > window.innerWidth) {
      menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    }
  }

  // Helper to create a station button element
  function createStationButton(st, idx) {
    const dims = getButtonDims();
    const btn = document.createElement('button');
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.padding = '4px';
    btn.style.borderRadius = '6px';
    btn.style.background = '#111';
    btn.style.border = '1px solid #333';
    btn.style.color = '#fff';
    // tooltip: frequency and name
    const freqText = st.freq ? `${st.freq} MHz` : '';
    const tooltipText = freqText + (st.freq && st.name ? ' — ' : '') + (st.name || '') + (st.itu ? ` [${st.itu}]` : '') + (st.picode ? ` (${st.picode})` : '');
    btn.addEventListener('mouseenter', () => showTip(btn, tooltipText));
    btn.addEventListener('mouseleave', hideTip);
    btn.addEventListener('mousedown', hideTip);

    if (st.picode) btn.dataset.id = st.picode;

    // fixed, uniform size for all buttons
    btn.style.width = dims.station.w + 'px';
    btn.style.height = dims.station.h + 'px';
    btn.style.overflow = 'hidden';

    if (config.showLogos && st.logo) {
      const img = document.createElement('img');
      img.src = st.logo;
      img.alt = st.name || '';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      img.style.borderRadius = '4px';
      btn.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.style.width = '100%';
      ph.style.height = '100%';
      ph.style.background = '#333';
      ph.style.borderRadius = '4px';
      ph.style.display = 'flex';
      ph.style.flexDirection = 'column';
      ph.style.alignItems = 'center';
      ph.style.justifyContent = 'center';
      ph.style.color = '#fff';
      ph.style.padding = '2px';
      ph.style.textAlign = 'center';
      ph.style.overflow = 'hidden';
      ph.style.boxSizing = 'border-box';

      if (st.freq) {
        const freqEl = document.createElement('div');
        freqEl.style.fontWeight = 'bold';
        freqEl.style.fontSize = dims.stationFont + 'px';
        const freqNum = parseFloat(st.freq);
        freqEl.textContent = !isNaN(freqNum) ? (freqNum < 30 ? freqNum.toFixed(3) : freqNum.toFixed(1)) : st.freq;
        ph.appendChild(freqEl);
      }
      if (st.name) {
        const nameEl = document.createElement('div');
        nameEl.style.fontSize = dims.nameFont + 'px';
        nameEl.style.lineHeight = '1.1';
        nameEl.style.width = 'calc(100% - 4px)';
        nameEl.style.whiteSpace = 'nowrap';
        nameEl.style.overflow = 'hidden';
        nameEl.style.textOverflow = 'ellipsis';
        nameEl.textContent = st.name;
        ph.appendChild(nameEl);
      }
      btn.appendChild(ph);
    }

    btn.ondblclick = () => openGenericEditor({ index: idx });

    btn.onclick = async (e) => {
      if (btn._longPressed) { btn._longPressed = false; return; }
      const freq = parseFloat(st.freq);
      if (!isNaN(freq) && window.socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send("T" + Math.round(Number(freq) * 1000));
          showToast(`Tuned ${st.freq}`);
        } catch (err) {
          console.error('FavStations: tuning error', err);
          showToast(`Error tuning ${st.freq}`);
        }
      } else {
        try {
          await navigator.clipboard.writeText(String(st.freq));
          showToast(`Copied ${st.freq}`);
        } catch (err) {
          showToast(String(st.freq));
        }
      }
    };

    // Enable Drag and Drop
    btn.draggable = true;
    btn.style.cursor = 'grab';

    btn.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', String(idx));
      btn.style.opacity = '0.5';
    });

    btn.addEventListener('dragend', () => {
      btn.style.opacity = '1';
      btn.style.transform = '';
    });

    btn.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      btn.style.transform = 'scale(1.05)';
    });

    btn.addEventListener('dragleave', () => {
      btn.style.transform = '';
    });

    btn.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      btn.style.transform = '';
      const srcIdx = parseInt(ev.dataTransfer.getData('text/plain'), 10);
      if (isNaN(srcIdx) || srcIdx === idx) return;
      const [moved] = stations.splice(srcIdx, 1);
      stations.splice(idx, 0, moved);
      await persistStations();
      renderButtons();
    });

    // Keyboard move
    btn.addEventListener('keydown', async (ev) => {
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        const dir = ev.key === 'ArrowLeft' ? -1 : 1;
        const newIdx = idx + dir;
        if (newIdx >= 0 && newIdx < stations.length) {
          const temp = stations[idx];
          stations[idx] = stations[newIdx];
          stations[newIdx] = temp;
          await persistStations();
          renderButtons();
          const all = document.querySelectorAll('#favstations-buttons button');
          if (all[newIdx]) all[newIdx].focus();
        }
      }
    });

    // attach context menu and long-press similar to temp slots
    (function attachContextHandlers(btnEl, index) {
      const LONG_PRESS_MS = 600;
      let pressTimer = null;
      function openMenuAt(x, y) {
        btnEl._longPressed = true;
        showStationContextMenu(x, y, {
          items: [
            { label: 'Edit station', action: () => openGenericEditor({ index: index }) },
            { label: 'Delete station', action: async () => { stations.splice(index, 1); await persistStations(); renderButtons(); showToast('Deleted'); } },
            { label: 'Copy current into this', action: async () => {
                const info = getCurrentStationInfo(); if (!info.freq) return showToast('No frequency to copy');
                const item = { freq: String(info.freq), name: info.name || '', antenna: info.antenna || '', logo: info.logo || '', itu: info.itu || '', picode: getPiCode() || generateId() };
                stations[index] = item; await persistStations(); renderButtons(); showToast(`Copied current to slot ${index+1}`);
            } }
          ]
        });
      }

      btnEl.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); openMenuAt(ev.clientX, ev.clientY); });

      btnEl.addEventListener('dragstart', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });

      btnEl.addEventListener('mousedown', (ev) => {
        if (ev.button !== 0) return;
        pressTimer = setTimeout(() => {
          const rect = btnEl.getBoundingClientRect();
          openMenuAt(rect.left + rect.width/2, rect.top + rect.height/2);
        }, LONG_PRESS_MS);
      });
      ['mouseup','mouseleave'].forEach(n => btnEl.addEventListener(n, () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }));
      btnEl.addEventListener('touchstart', (ev) => {
        pressTimer = setTimeout(() => {
          const touch = ev.touches && ev.touches[0];
          openMenuAt(touch ? touch.clientX : btnEl.getBoundingClientRect().left, touch ? touch.clientY : btnEl.getBoundingClientRect().top);
        }, LONG_PRESS_MS);
      }, { passive: true });
      btnEl.addEventListener('touchend', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
    })(btn, idx);
    return btn;
  }

  // fetch list from server, fallback to localStorage (support multiple lists in localStorage)
  async function fetchList() {
    try {
      const res = await fetch('/plugins/FavStations/list');
      if (res.ok) {
        const serverLists = await res.json();
        // Expect an object of lists from the server
        if (serverLists && typeof serverLists === 'object' && !Array.isArray(serverLists) && Object.keys(serverLists).length > 0) {
          listsObj = serverLists;
          console.log('FavStations: Loaded station lists from server (/plugins/FavStations/list)');
          // Ensure current list exists, or default to first
          if (!listsObj[currentListName]) {
            currentListName = Object.keys(listsObj)[0] || 'Default';
          }
          stations = listsObj[currentListName] || [];
          saveListsLocal();
          renderButtons();
          updateListSelect();
          return;
        }
      }
    } catch (e) {
      // ignore
    }

    // fallback: load lists object from localStorage
    listsObj = loadListsLocal();
    console.log('FavStations: Loaded station lists from local storage fallback');
    // if no lists stored, try legacy single list key
    if (!listsObj || Object.keys(listsObj).length === 0) {
      const old = loadLocal();
      listsObj = {};
      listsObj[currentListName] = old || [];
    }
    stations = listsObj[currentListName] || [];
    renderButtons();
    const span = document.getElementById('favstations-list-name'); if (span) span.textContent = currentListName;
    updateListSelect();
  }

  async function saveServer(allLists) {
    try {
      const res = await fetch('/plugins/FavStations/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allLists),
      });
      if (res.ok) return true;
    } catch (e) {
      // ignore
    }
    return false;
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  // Save/Load lists container (multiple named lists)
  function saveListsLocal() {
    try {
      localStorage.setItem(listsKey, JSON.stringify(listsObj || {}));
    } catch (e) {
      console.warn('FavStations: cannot save lists local', e);
    }
  }

  function loadListsLocal() {
    try {
      const raw = localStorage.getItem(listsKey);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  // Manager modal: if index provided, edit existing, else create new
  function openManager() {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.zIndex = 10001;
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(0,0,0,0.6)';

    const box = document.createElement('div');
    box.style.width = '560px';
    box.style.maxWidth = '96%';
    box.style.maxHeight = '86%';
    box.style.overflow = 'auto';
    box.style.padding = '14px';
    box.style.borderRadius = '8px';
    box.style.background = '#fff';
    box.style.color = '#000';

    const title = document.createElement('h3');
    title.textContent = 'Manage Lists';
    box.appendChild(title);

    const listDiv = document.createElement('div');
    listDiv.style.display = 'flex';
    listDiv.style.flexDirection = 'column';
    listDiv.style.gap = '8px';
    listDiv.style.marginBottom = '12px';

    function renderListManager() {
      listDiv.innerHTML = '';
      const listNames = Object.keys(listsObj);

      listNames.forEach((listName, index) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.gap = '8px';
        row.style.padding = '4px';
        row.style.border = '1px solid #ccc';
        row.style.borderRadius = '4px';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = listName;
        nameSpan.style.fontWeight = 'bold';

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '6px';

        const renameBtn = document.createElement('button');
        renameBtn.textContent = 'Rename';
        renameBtn.onclick = async () => {
          let newName = prompt(`Rename list "${listName}" to:`, listName);
          if (newName === null) return;
          newName = String(newName || '').trim();
          if (!newName || newName === listName) return;
          if (listsObj[newName]) {
            return alert(`A list named "${newName}" already exists.`);
          }

          const oldLists = listsObj;
          listsObj = {};
          for (const key in oldLists) {
            if (key === listName) {
              listsObj[newName] = oldLists[key];
            } else {
              listsObj[key] = oldLists[key];
            }
          }

          if (currentListName === listName) {
            currentListName = newName;
          }

          await persistStations();
          updateListSelect();
          renderListManager();
        };
        actions.appendChild(renameBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = async () => {
          if (Object.keys(listsObj).length <= 1) {
            return alert("You cannot delete the last list.");
          }
          if (!confirm(`Are you sure you want to delete the list "${listName}"? This cannot be undone.`)) return;

          delete listsObj[listName];

          if (currentListName === listName) {
            currentListName = Object.keys(listsObj)[0];
            stations = listsObj[currentListName] || [];
            renderButtons();
          }

          await persistStations();
          updateListSelect();
          renderListManager();
        };
        actions.appendChild(deleteBtn);

        const upBtn = document.createElement('button');
        upBtn.textContent = '↑';
        upBtn.title = 'Move up';
        upBtn.disabled = index === 0;
        upBtn.onclick = async () => {
          const keys = Object.keys(listsObj);
          if (index > 0) {
            [keys[index], keys[index - 1]] = [keys[index - 1], keys[index]];
            const newLists = {};
            keys.forEach(k => { newLists[k] = listsObj[k]; });
            listsObj = newLists;
            await persistStations();
            updateListSelect();
            renderListManager();
          }
        };
        actions.appendChild(upBtn);

        const downBtn = document.createElement('button');
        downBtn.textContent = '↓';
        downBtn.title = 'Move down';
        downBtn.disabled = index === listNames.length - 1;
        downBtn.onclick = async () => {
          const keys = Object.keys(listsObj);
          if (index < keys.length - 1) {
            [keys[index], keys[index + 1]] = [keys[index + 1], keys[index]];
            const newLists = {};
            keys.forEach(k => { newLists[k] = listsObj[k]; });
            listsObj = newLists;
            await persistStations();
            updateListSelect();
            renderListManager();
          }
        };
        actions.appendChild(downBtn);

        row.appendChild(nameSpan);
        row.appendChild(actions);
        listDiv.appendChild(row);
      });
    }

    renderListManager();
    box.appendChild(listDiv);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.marginTop = '12px';
    closeBtn.onclick = () => overlay.remove();
    box.appendChild(closeBtn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function openGenericEditor(opts = {}) {
    const { index = null, isTemp = false } = opts;
    const isNew = index === null;
    const sourceArr = isTemp ? tempSlots : stations;
    const s = !isNew ? sourceArr[index] : { freq: '', name: '', antenna: '', logo: '', picode: '', itu: '' };

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.zIndex = isTemp ? 10003 : 10002;
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(0,0,0,0.6)';

    const box = document.createElement('div');
    box.style.width = isTemp ? '520px' : '560px';
    box.style.maxWidth = '96%';
    box.style.padding = '12px';
    box.style.borderRadius = '8px';
    box.style.background = '#fff';

    const title = document.createElement('h3');
    let titleText = isNew ? 'Add station' : 'Edit station';
    if (isTemp) titleText = 'Edit temp slot';
    if (isNew && isTemp) titleText = 'Add temp slot'; // Should not happen with current logic, but for completeness
    title.textContent = titleText;
    box.appendChild(title);

    const form = document.createElement('div');
    form.style.display = 'grid';
    form.style.gridTemplateColumns = '1fr 1fr';
    form.style.gap = '8px';

    const freqLabel = document.createElement('label');
    freqLabel.textContent = 'Frequency';
    const freqInput = document.createElement('input');
    freqInput.value = s.freq || '';
    freqInput.style.width = '100%';
    freqLabel.appendChild(freqInput);
    form.appendChild(freqLabel);

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Name';
    const nameInput = document.createElement('input');
    nameInput.value = s.name || '';
    nameInput.style.width = '100%';
    nameLabel.appendChild(nameInput);
    form.appendChild(nameLabel);

    const antennaLabel = document.createElement('label');
    antennaLabel.textContent = 'Antenna';
    const antennaInput = document.createElement('input');
    antennaInput.value = s.antenna || '';
    antennaInput.style.width = '100%';
    antennaLabel.appendChild(antennaInput);
    form.appendChild(antennaLabel);

    const piInput = document.createElement('input');
    piInput.value = s.picode || '';
    piInput.style.width = '100%';
    piInput.oninput = () => { piInput.value = piInput.value.toUpperCase(); };

    const ituInput = document.createElement('input');
    ituInput.value = s.itu || '';
    ituInput.style.width = '100%';
    ituInput.oninput = () => { ituInput.value = ituInput.value.toUpperCase(); };

    const logoLabel = document.createElement('label');
    logoLabel.textContent = 'Logo (URL)';
    const logoInputContainer = document.createElement('div');
    logoInputContainer.style.display = 'flex';
    logoInputContainer.style.alignItems = 'center';
    logoInputContainer.style.gap = '4px';
    const logoInput = document.createElement('input');
    logoInput.value = s.logo || '';
    logoInput.style.width = '100%';
    logoInput.style.flex = '1';
    logoInputContainer.appendChild(logoInput);

    const logoSearchBtn = document.createElement('button');
    logoSearchBtn.type = 'button';
    logoSearchBtn.textContent = '🔍';
    logoSearchBtn.title = 'Search for logo using PI Code and ITU (add them if empty!)';

    logoSearchBtn.style.width = '28px'; // Fixed width
    logoSearchBtn.style.height = '28px'; // Fixed height
    logoSearchBtn.style.padding = '0'; // Remove padding to control size precisely
    logoSearchBtn.style.fontSize = '14px'; // Smaller font size for the icon
    logoSearchBtn.style.flexShrink = '0'; // Prevent button from shrinking
    logoSearchBtn.style.display = 'flex'; // Use flex to center content

    logoSearchBtn.onclick = async (e) => {
      e.preventDefault();
      const derived = await getDerivedLogoUrl({
        name: nameInput.value,
        picode: piInput.value,
        itu: ituInput.value
      });
      if (derived) {
        logoInput.value = derived;
      } else {
        showDiscordLinkAlert();
      }
    };
    logoInputContainer.appendChild(logoSearchBtn);

    logoLabel.appendChild(logoInputContainer);
    form.appendChild(logoLabel);

    const piLabel = document.createElement('label');
    piLabel.textContent = 'PI Code';
    piLabel.appendChild(piInput);
    form.appendChild(piLabel);

    const ituLabel = document.createElement('label');
    ituLabel.textContent = 'ITU Code';
    ituLabel.appendChild(ituInput);
    form.appendChild(ituLabel);

    box.appendChild(form);

    const actions = document.createElement('div');
    actions.style.marginTop = '10px';
    actions.style.display = 'flex';
    actions.style.gap = '8px';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.onclick = async () => {
      const item = {
        freq: String(freqInput.value || '').trim(),
        name: String(nameInput.value || '').trim(),
        antenna: String(antennaInput.value || '').trim(),
        logo: String(logoInput.value || '').trim(),
        itu: String(ituInput.value || '').trim().toUpperCase(),
      };
      if (item.logo === 'https://tef.noobish.eu/logos/default-logo.png') item.logo = '';
      const inputPi = String(piInput.value || '').trim().toUpperCase();
      if (!item.freq) return alert('Frequency required');

      if (isTemp) {
        item.picode = inputPi || (!isNew && sourceArr[index] && sourceArr[index].picode) || generateId();
        sourceArr[index] = item;
        renderTempSlots();
        overlay.remove();
        showToast(`Saved slot ${index + 1}`);
      } else {
        // Regular station
        if (!isNew) {
        // editing: use provided Pi code if any, otherwise preserve existing or generate
          if (inputPi) item.picode = inputPi; else item.picode = sourceArr[index] && sourceArr[index].picode ? sourceArr[index].picode : generateId();
          sourceArr[index] = item;
        } else {
          // new entry: prefer user-provided Pi, otherwise try page Pi, otherwise generate
          if (inputPi) {
            item.picode = inputPi;
          } else {
            const pi = getPiCode();
            const currentFreqEl = document.getElementById('data-frequency');
            const currentFreq = currentFreqEl ? (currentFreqEl.textContent || '').trim() : '';
            if (pi && String(item.freq) === String(currentFreq)) {
              item.picode = pi;
            } else {
              item.picode = generateId();
            }
          }
          sourceArr.push(item);
        }
        await persistStations();
        overlay.remove();
        renderButtons();
      }
    };
    actions.appendChild(saveBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => overlay.remove();
    actions.appendChild(cancelBtn);

    box.appendChild(actions);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  async function persistStations() {
    // ensure every station has an id, then update lists object and save lists to localStorage
    stations.forEach((s) => { if (!s.picode) s.picode = generateId(); });
    listsObj[currentListName] = stations;
    saveListsLocal();

    // Save the entire lists object to the server
    const ok = await saveServer(listsObj);
    if (!ok) showToast('Saved locally (server unavailable)');
    else showToast('Saved');
  }

  // Get current antenna value
  function getCurrentAntennaValue() {
    const dataAntInput = document.querySelector('.data-ant input');
    if (dataAntInput) {
      const currentAntennaText = dataAntInput.value || dataAntInput.placeholder || '';
      const options = document.querySelectorAll('.data-ant li.option');
      for (let option of options) {
        if (option.textContent.trim() === currentAntennaText.trim()) {
          return option.getAttribute('data-value') || '';
        }
      }
    }
    return '';
  }

  // Helper to read current station info from page
  function getCurrentStationInfo() {
    const dataFrequencyElement = document.getElementById('data-frequency');
    const dataPsElement = document.getElementById('data-ps');
    const dataStationNameElement = document.getElementById('data-station-name');
    const logoEl = document.getElementById('station-logo');

    const freqText = dataFrequencyElement ? dataFrequencyElement.textContent.trim() : '';
    const freq = freqText || '';

    let name = '';
    if (dataStationNameElement && dataStationNameElement.offsetParent !== null) {
      name = dataStationNameElement.textContent.trim();
    } else if (dataPsElement) {
      name = dataPsElement.textContent.trim();
    }

    const antenna = getCurrentAntennaValue();

let logo = logoEl && logoEl.src ? logoEl.src : '';
    if (logo === 'https://tef.noobish.eu/logos/default-logo.png') logo = '';

    const itu = getItuCode() || '';
    return { freq, name, antenna, logo, itu };
  }

  // Try to find Pi Code of the currently tuned station from page elements
  function getPiCode() {
    const ids = ['data-pi','data-picode','data-pi-code','data-station-pi','station-pi','data-station-code','data-station-id','data-id'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && el.textContent && el.textContent.trim()) return el.textContent.trim();
    }

    // Check dataset attributes on known elements
    const ps = document.getElementById('data-ps');
    if (ps) {
      if (ps.dataset && (ps.dataset.pi || ps.dataset.picode || ps.dataset.picode)) return ps.dataset.pi || ps.dataset.picode;
      const attr = ps.getAttribute('data-pi') || ps.getAttribute('data-picode') || ps.getAttribute('data-pi-code');
      if (attr) return attr.trim();
    }

    const logo = document.getElementById('station-logo');
    if (logo && logo.dataset && (logo.dataset.pi || logo.dataset.picode)) return logo.dataset.pi || logo.dataset.picode;

    // Fallback: search any element with id containing 'pi' (case-insensitive)
    const candidates = Array.from(document.querySelectorAll('[id]')).filter(el => /pi/i.test(el.id));
    for (const el of candidates) {
      if (el && el.textContent && el.textContent.trim()) return el.textContent.trim();
    }

    return null;
  }

  // New constants for pluginFavStations.js
  const TEF_SERVER_PATH = 'https://tef.noobish.eu/logos/';
  const CORS_PROXY_URL = 'https://cors-proxy.de:13128/'; // Used by updateStationLogo.js for onlineradiobox
  const LOGO_CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days for resolved logo URLs

  // Session-level cache for remote directory listings (per ITU code)
  let sessionRemoteDirCache = {};

  // Function to fetch the directory index of a given ITU code (cached for the session only)
  async function getRemoteDirectoryIndex(ituCode) {
      if (sessionRemoteDirCache[ituCode]) {
          return sessionRemoteDirCache[ituCode];
      }

      try {
          const response = await fetch(`${TEF_SERVER_PATH}${ituCode}/`);
          if (!response.ok) {
              console.warn(`[FavStations] Failed to fetch directory for ${ituCode}`);
              return [];
          }

          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          
          const links = Array.from(doc.querySelectorAll('a'))
                             .map(a => a.getAttribute('href'))
                             .filter(href => href && (href.toLowerCase().endsWith('.svg') || href.toLowerCase().endsWith('.png')));
          
          const decodedLinks = links.map(link => {
              let cleanLink = link.split('?')[0]; 
              cleanLink = cleanLink.split('/').pop(); 
              return decodeURIComponent(cleanLink).trim(); 
          });

          sessionRemoteDirCache[ituCode] = decodedLinks;
          console.log(`[FavStations] Loaded ${decodedLinks.length} files for ITU: ${ituCode} for this browser session.`);
          return decodedLinks;

      } catch (err) {
          console.error(`[FavStations] Error fetching directory index for ${ituCode}:`, err);
          return [];
      }
  }

  // Function to get country name from ITU code (assuming window.countryList is available)
  function getCountryNameByItuCode(ituCode) {
      if (!Array.isArray(window.countryList)) return ""; // Return empty if list not available
      
      const country = window.countryList.find(
        item => item.itu_code === ituCode.toUpperCase()
      );
      return country ? country.country : "";
  }

  // Function to compare program name with image titles for onlineradiobox
  function compareAndSelectImage(currentStationName, imgSrcElements) {
      let selectedImgSrc = null;

      const lowerStationName = currentStationName.toLowerCase();
      for (const imgSrcElement of imgSrcElements) {
          const title = imgSrcElement.getAttribute('title');
          if (!title) continue;
          const lowerTitle = title.toLowerCase();

          if (lowerTitle === lowerStationName) { // Exact match
              selectedImgSrc = imgSrcElement.getAttribute('src');
              break;
          }
          if (lowerTitle.includes(lowerStationName) || lowerStationName.includes(lowerTitle)) { // Substring match
              if (!selectedImgSrc) { // Take the first plausible match
                  selectedImgSrc = imgSrcElement.getAttribute('src');
              }
          }
      }

      if (selectedImgSrc && !selectedImgSrc.startsWith('https://')) {
          selectedImgSrc = 'https:' + selectedImgSrc;
      }
      return selectedImgSrc;
  }

  // Function to parse a page, search for logos, and handle results from onlineradiobox
  async function parseOnlineradioboxPage(url, stationName) {
      try {
          const response = await fetch(`${CORS_PROXY_URL}${url}`);
          if (!response.ok) throw new Error('Network response was not ok.');

          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const imgSrcElements = doc.querySelectorAll('img[class="station__title__logo"]');

          const selectedImgSrc = compareAndSelectImage(stationName, imgSrcElements);

          if (selectedImgSrc) {
              console.log('[FavStations] Selected image source from OnlineRadioBox:', selectedImgSrc);
              return selectedImgSrc;
          } else {
              console.log('[FavStations] No logo found on OnlineRadioBox for:', stationName);
              return null;
          }
      } catch (error) {
          console.error('[FavStations] Error fetching from OnlineRadioBox:', error.message);
          return null;
      }
  }

  // Try to derive a logo URL from station metadata using standard repository patterns
  async function getDerivedLogoUrl(data) {
    const picode = (data.picode || '').trim().toUpperCase();
    const itu = (data.itu || '').trim().toUpperCase();
    const stationName = (data.name || '').trim();

    if (!picode && !stationName) return '';

    // Check 7-day localStorage cache for this specific station's resolved URL
    const cacheKey = `favstations_logo_url_v1_${itu}_${picode}_${stationName.replace(/\s/g, '_')}`;
    const cachedLogoDataStr = localStorage.getItem(cacheKey);
    const now = Date.now();

    if (cachedLogoDataStr) {
        try {
            const cachedData = JSON.parse(cachedLogoDataStr);
            if (now - cachedData.timestamp < LOGO_CACHE_EXPIRY_MS) {
                if (cachedData.url && cachedData.url !== "DEFAULT") {
                    console.log(`[FavStations] Using 7-day cached URL: ${cachedData.url}`);
                    return cachedData.url;
                } else if (cachedData.url === "DEFAULT") {
                    console.log(`[FavStations] Known missing logo for this station (cached state).`);
                    return ''; // Explicitly cached as not found
                }
            } else {
                localStorage.removeItem(cacheKey); // Cache expired
            }
        } catch (e) {
            console.error('[FavStations] Error parsing cached logo data, clearing cache.', e);
            localStorage.removeItem(cacheKey);
        }
    }

    let foundLogoUrl = '';

    // 1. Try tef.noobish.eu (using PI Code and ITU)
    if (itu && picode) {
        const formattedProgram = stationName.toUpperCase().replace(/[\/\-\*\+\:\.\,\§\%\&\"!\?\|\>\<\=\)\(\[\]´`'~#\s]/g, '');
        const cleanPiCode = picode;

        const priorityFiles = [
            `${cleanPiCode}_${formattedProgram}.svg`,
            `${cleanPiCode}_${formattedProgram}.png`,
            `${cleanPiCode}.svg`,
            `${cleanPiCode}.png`
        ];

        try {
            const dirFiles = await getRemoteDirectoryIndex(itu);
            for (const fileName of priorityFiles) {
                const foundFile = dirFiles.find(f => f.toLowerCase() === fileName.toLowerCase());
                if (foundFile) {
                    foundLogoUrl = `${TEF_SERVER_PATH}${itu}/${foundFile}`;
                    console.log(`[FavStations] Found logo on tef.noobish.eu: ${foundLogoUrl}`);
                    break;
                }
            }
        } catch (e) {
            console.error('[FavStations] Error searching tef.noobish.eu:', e);
        }
    }

    if (foundLogoUrl) {
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, url: foundLogoUrl }));
        return foundLogoUrl;
    }

    // 2. Try onlineradiobox.com (using Station Name and ITU)
    if (stationName && itu) {
        const country = window.countryList ? window.countryList.find(item => item.itu_code === itu) : null;
        const selectedCountryCode = country ? country.country_code : null;

        if (selectedCountryCode) {
            const searchUrl = `https://onlineradiobox.com/search?c=${selectedCountryCode}&cs=${selectedCountryCode}&q=${encodeURIComponent(stationName)}`;
            const orbLogo = await parseOnlineradioboxPage(searchUrl, stationName);
            if (orbLogo) {
                foundLogoUrl = orbLogo;
                console.log(`[FavStations] Found logo on onlineradiobox.com: ${foundLogoUrl}`);
            }
        } else {
            console.warn(`[FavStations] No country code found for ITU: ${itu} for OnlineRadioBox search.`);
        }
    }
    
    if (foundLogoUrl) {
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, url: foundLogoUrl }));
        return foundLogoUrl;
    }

    // If nothing found, cache as "DEFAULT" (not found) and return empty
    localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, url: "DEFAULT" }));
    return '';
  }

  // Try to find ITU Code of the currently tuned station from page elements
  function getItuCode() {
    const ids = ['data-itu','data-itucode','data-itu-code','data-country-itu','data-country'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && el.textContent && el.textContent.trim()) return el.textContent.trim().toUpperCase();
    }

    // Check dataset attributes on known elements
    const logo = document.getElementById('station-logo');
    if (logo && logo.dataset && (logo.dataset.itu || logo.dataset.itucode)) return (logo.dataset.itu || logo.dataset.itucode).toUpperCase();

    // Fallback: search any element with class data-flag
    const flag = document.querySelector('.data-flag');
    if (flag && flag.textContent && flag.textContent.trim()) return flag.textContent.trim().toUpperCase();

    return null;
  }

  // Generate a short unique id for stations
  function generateId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  // Create a new named list and switch to it
  function createNewList(name) {
    // sanitize name and ensure unique
    name = String(name || '').trim() || `List ${Date.now()}`;
    if (listsObj[name]) {
      let i = 1;
      while (listsObj[`${name} (${i})`]) i++;
      name = `${name} (${i})`;
    }
    currentListName = name;
    stations = [];
    listsObj[currentListName] = stations;
    saveListsLocal();
    try { localStorage.setItem(storageKey, JSON.stringify(stations)); } catch (e) {}
    renderButtons();
    const span = document.getElementById('favstations-list-name'); if (span) span.textContent = currentListName;
    showToast(`Created list: ${currentListName}`);
    updateListSelect();
  }

  // Update the lists dropdown with existing lists
  function updateListSelect() {
    const sel = document.getElementById('favstations-list-select');
    if (!sel) return;
    // clear
    sel.innerHTML = '';
    const names = Object.keys(listsObj || {});
    if (names.length === 0) {
      const opt = document.createElement('option'); opt.value = currentListName; opt.textContent = currentListName; sel.appendChild(opt);
      // add new list option
      const newOpt = document.createElement('option'); newOpt.value = '__new__'; newOpt.textContent = '➕ New list...'; sel.appendChild(newOpt);
      return;
    }
    names.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      sel.appendChild(opt);
    });
    // add New list option at the end
    const newOpt = document.createElement('option'); newOpt.value = '__new__'; newOpt.textContent = '➕ New list...'; sel.appendChild(newOpt);
    sel.value = currentListName;
  }

  // small helpers
  function showToast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.position = 'fixed';
    t.style.bottom = '80px';
    t.style.left = '50%';
    t.style.transform = 'translateX(-50%)';
    t.style.background = 'rgba(0,0,0,0.75)';
    t.style.color = '#fff';
    t.style.padding = '8px 12px';
    t.style.borderRadius = '6px';
    t.style.zIndex = 11000;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]; });
  }

  // Auto-update mechanism
  async function checkForUpdates() {
    console.log('[FavStations] Starting update check...');
    try {
      // Fetch remote FavStations.js to check version
      const remotePluginJsUrl = `${repoBaseUrl}/FavStations.js?t=${Date.now()}`;
      console.log(`[FavStations] Fetching remote plugin file from: ${remotePluginJsUrl}`);
      const res = await fetch(`${repoBaseUrl}/FavStations.js?t=${Date.now()}`);
      if (!res.ok) {
        console.warn(`[FavStations] Failed to fetch remote plugin file. Status: ${res.status}`);
        return;
      }
      console.log('[FavStations] Remote plugin file fetched successfully.');
      const text = await res.text();
      // Extract version using regex
      const match = text.match(/(?:pluginVersion|version):\s*['"]([^'"]+)['"]/);
      if (match && match[1]) {
        const remoteVersion = match[1];
        console.log(`[FavStations] Current local version: ${pluginVersion}, Remote version found: ${remoteVersion}`);
        if (isNewer(pluginVersion, remoteVersion)) {
          console.log(`[FavStations] Update available! Remote version (${remoteVersion}) is newer than local (${pluginVersion}).`);
          handleUpdateFound(remoteVersion);
        }
      }
    } catch (e) {
      console.error('[FavStations] Update check error:', e);
    }
  }

  function handleUpdateFound(remoteVer) {
    if (!isAdmin) return;
    updateAvailable = true;
    remoteVersionFound = remoteVer;

    // Passive UI notifications
    const menuBtn = document.getElementById('favstations-menu-btn');
    if (menuBtn) {
      menuBtn.style.color = '#FE0830';
    }

    // Red dot on sidenav puzzle icon
    const updateIcon = document.querySelector('.wrapper-outer #navigation .sidenav-content .fa-puzzle-piece') 
                     || document.querySelector('.wrapper-outer .sidenav-content') 
                     || document.querySelector('.sidenav-content');
    
    if (updateIcon && !updateIcon.querySelector('.favstations-update-dot')) {
      const redDot = document.createElement('span');
      redDot.className = 'favstations-update-dot';
      redDot.style.cssText = 'display:block; width:12px; height:12px; border-radius:50%; background-color:#FE0830; margin-left:82px; margin-top:-12px;';
      updateIcon.appendChild(redDot);
    }

    // Notification text in setup page (inject even if path is / as long as settings elements are present)
    if (window.location.pathname.includes('/setup') || document.getElementById('plugin-settings') || window.location.pathname === '/') {
      console.log('[FavStations] Currently on /setup page or settings found. Attempting to inject update notices.');
      const injectNotice = () => {
        console.log('[FavStations] injectNotice() called.');
        let foundInTable = false;
        // Find the specific plugin row in the setup table to match sysinfo.js style
        const rows = document.querySelectorAll('tr');
        console.log(`[FavStations] Found ${rows.length} table rows.`);
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          // Check if the first cell matches our plugin name
          if (cells.length > 1 && cells[0].textContent.trim() === 'FavStations') {
            console.log('[FavStations] Found FavStations row in plugin table.');
            const versionCell = cells[1];
            // Only add if not already present
            if (!versionCell.querySelector('.favstations-setup-update-link')) {
              const updateLink = document.createElement('a');
              updateLink.className = 'favstations-setup-update-link';
              updateLink.href = 'https://github.com/mm-prg/FavStations';
              updateLink.target = '_blank';
              updateLink.style.cssText = 'margin-left:10px; text-decoration:none;';
              updateLink.textContent = `[Update to ${remoteVer} available]`;
              versionCell.appendChild(updateLink);
              console.log(`[FavStations] Successfully injected update link into table row for version ${remoteVer}.`);
            } else {
              console.log('[FavStations] Update link already exists in table row, skipping injection.');
            }
            foundInTable = true;
          }
        });

        const pluginSettings = document.getElementById('plugin-settings');
        if (pluginSettings) {
          console.log('[FavStations] Found #plugin-settings element.');
          if (!pluginSettings.querySelector('.favstations-setup-link')) {
            const updateMsg = `<a href="https://github.com/mm-prg/FavStations" target="_blank" class="favstations-setup-link" style="text-decoration:none;">[FavStations] Update available: ${pluginVersion} --> ${remoteVer}</a><br>`;
            if (pluginSettings.textContent.trim() === 'No plugin settings are available.') {
              pluginSettings.innerHTML = updateMsg;
            } else {
              pluginSettings.innerHTML += ' ' + updateMsg;
            }
            console.log(`[FavStations] Successfully injected update message into plugin settings for version ${remoteVer}.`);
          } else {
            console.log('[FavStations] Update message already exists in plugin settings, skipping injection.');
          }
        } else {
          console.log('[FavStations] #plugin-settings element not found.');
        }
      };

      injectNotice();
      // Retry after delays because the setup table is often rendered dynamically
      setTimeout(injectNotice, 1000);
      setTimeout(injectNotice, 2000);
      setTimeout(injectNotice, 3000);
      setTimeout(injectNotice, 5000);
    }
  }

  function isNewer(curr, rem) {
    console.log(`[FavStations] isNewer check: Local = "${curr}", Remote = "${rem}"`);
    const c = curr.split('.');
    const r = rem.split('.');

    for (let i = 0; i < Math.max(c.length, r.length); i++) {
      const remotePart = r[i] || "0";
      const currentPart = c[i] || "0";
      
      // localeCompare con numeric:true gestisce correttamente i numeri (es. "10" > "2")
      // e i suffissi alfabetici (es. "1a" > "1")
      const cmp = remotePart.localeCompare(currentPart, undefined, { numeric: true, sensitivity: 'base' });
      
      console.log(`[FavStations] Step ${i}: "${remotePart}" vs "${currentPart}" -> ${cmp > 0 ? 'Remote is newer' : (cmp < 0 ? 'Local is newer' : 'Equal')}`);
      
      if (cmp > 0) return true;
      if (cmp < 0) return false;
    }
    console.log(`[FavStations] Result: Remote is NOT newer.`);
    return false;
  }

  async function performUpdate() {
    showToast('Updating plugin...');
    try {
      const res = await fetch('/plugins/FavStations/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: repoBaseUrl })
      });
      const data = await res.json();
      if (data.ok) {
        alert('Update successful! The page will reload.');
        location.reload();
      } else {
        alert('Update failed: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Update failed: ' + e.message);
    }
  }

  // Visual dimension editor
  function openDimensionEditor() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; left:0; top:0; right:0; bottom:0; z-index:20000; background:rgba(0,0,0,0.85); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-family:sans-serif; backdrop-filter:blur(4px);';

    const title = document.createElement('h3');
    title.textContent = 'Drag the corner of the box to resize the buttons';
    title.style.marginBottom = '20px';
    overlay.appendChild(title);

    const dims = getButtonDims();
    
    // Resizable container
    const resizeContainer = document.createElement('div');
    resizeContainer.style.cssText = `
      border: 2px dashed #aaa;
      background: rgba(255,255,255,0.1);
      overflow: hidden;
      resize: both;
      width: ${dims.station.w}px;
      height: ${dims.station.h}px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 40px;
      min-height: 24px;
      box-sizing: content-box;
    `;

    const sampleBtn = document.createElement('div');
    sampleBtn.textContent = 'STATION';
    sampleBtn.style.cssText = 'width:100%; height:100%; background:#222; border:1px solid #444; border-radius:6px; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px; pointer-events:none;';
    resizeContainer.appendChild(sampleBtn);
    overlay.appendChild(resizeContainer);

    const info = document.createElement('div');
    info.style.marginTop = '15px';
    info.style.fontSize = '18px';
    info.textContent = `${dims.station.w} x ${dims.station.h}`;
    overlay.appendChild(info);

    // Update info on resize using ResizeObserver for real-time feedback
    const ro = new ResizeObserver(entries => {
      for (let entry of entries) {
        const w = Math.round(entry.contentRect.width);
        const h = Math.round(entry.contentRect.height);
        info.textContent = `${w} x ${h}`;
      }
    });
    ro.observe(resizeContainer);

    const actions = document.createElement('div');
    actions.style.marginTop = '30px';
    actions.style.display = 'flex';
    actions.style.gap = '12px';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.padding = '8px 20px';
    saveBtn.onclick = async () => {
      const rect = resizeContainer.getBoundingClientRect();
      config.customWidth = Math.round(rect.width); 
      config.customHeight = Math.round(rect.height);
      config.buttonSize = 'custom';
      
      await persistConfig();
      const oldBar = document.getElementById(pluginId);
      if (oldBar) oldBar.remove();
      createBar();
      renderButtons();
      overlay.remove();
      ro.disconnect();
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '8px 20px';
    cancelBtn.onclick = () => {
      overlay.remove();
      ro.disconnect();
    };

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    overlay.appendChild(actions);

    document.body.appendChild(overlay);
  }

  // Custom alert to show Discord link
  function showDiscordLinkAlert() {
    const discordLink = "https://discord.com/channels/1053804249651359765/1233159920711368765/threads/1233160258877390959";
    const message = "Station logo not found! Please look for it and send it to the discord page:";
    const linkText = "Discord - Group FMDX - Station Logos";

    const alertOverlay = document.createElement('div');
    alertOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 99999;
    `;

    const alertBox = document.createElement('div');
    alertBox.style.cssText = `
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      text-align: center;
      color: #000;
      font-family: sans-serif;
      max-width: 80%;
    `;

    const msgParagraph = document.createElement('p');
    msgParagraph.textContent = message;
    alertBox.appendChild(msgParagraph);

    const linkElement = document.createElement('a');
    linkElement.href = discordLink;
    linkElement.textContent = linkText;
    linkElement.target = "_blank"; // Open in new tab
    linkElement.style.cssText = `
      color: #007bff;
      text-decoration: underline;
      cursor: pointer;
    `;
    alertBox.appendChild(linkElement);

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.cssText = `
      margin-top: 15px;
      padding: 8px 15px;
      background: #007bff;
      color: #fff;
      border: none;
      border-radius: 5px;
      cursor: pointer;
    `;
    closeButton.onclick = () => {
      document.body.removeChild(alertOverlay);
    };
    alertBox.appendChild(closeButton);

    alertOverlay.appendChild(alertBox);
    document.body.appendChild(alertOverlay);
  }

})();
