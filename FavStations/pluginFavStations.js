/**
 * ************************************************
 * FavStations Plugin for FM-DX Webserver
 * ************************************************
 */

"use strict";

(() => {
  const pluginVersion = '0.1.3';
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
  const defaultRemoteStationsUrl = ''; // Fallback URL if not configured
  const configKey = 'FavStations_config_v1'; // Key for configuration localStorage fallback
  let currentListName = 'Default';
  let listsObj = {};
  let stations = [];
  let isAdmin = false;
  let loadMetadata = { origin: 'None', source: 'None', date: 'N/A' };

  function checkAdminMode() {
    const bodyText = document.body.textContent || document.body.innerText;
    const str1 = "You are logged in as an administrator.";
    const str2 = "You are logged in as an adminstrator."; // FM-DX typo compatibility

    const found1 = bodyText.includes(str1);
    const found2 = bodyText.includes(str2);
    const found3 = !!document.getElementById('plugin-settings') || window.location.pathname.includes('/setup');
    isAdmin = found1 || found2 || found3;

    //    console.log(`[FavStations] --- Admin Check ---`);
    //    console.log(`[FavStations] Searching for: "${str1}" -> Found: ${found1}`);
    //    console.log(`[FavStations] Searching for: "${str2}" -> Found: ${found2}`);
    //    console.log(`[FavStations] Resulting isAdmin: ${isAdmin}`);
    if (!isAdmin) {
      console.log(`[FavStations] Page Text Snippet: "${bodyText.substring(0, 250).replace(/\n/g, ' ')}..."`);
    }
    //    console.log(`[FavStations] ------------------`);
  }

  let tempSlots = [];
  let config = {
    remoteStationsUrl: defaultRemoteStationsUrl,
    showLogos: true,
    showStationsMode: 'all',
    buttonSize: 'custom',
    customWidth: 120,
    customHeight: 60,
    tempSlotCount: 8,
    startupMode: 'server',
  };

  document.addEventListener('DOMContentLoaded', async () => {
    checkAdminMode();
    await loadConfigAndInitialize();
    // If isAdmin is still false but we see the plugins div, force true
    if (!isAdmin && document.getElementById('plugin-settings')) {
      isAdmin = true;
    }
  });

  async function loadConfigAndInitialize() {
    // Do not show the station bar if we are on the setup page
    if (window.location.pathname.includes('/setup') || document.getElementById('plugin-settings')) return;
    let serverLoaded = false;

    try {
      const res = await fetch('/plugins/FavStations/config');
      if (res.ok) {
        const serverConfig = await res.json();
        config = { ...config, ...serverConfig }; // Merges server config with defaults
        console.log('FavStations: Loaded configuration from server (/plugins/FavStations/config)');
        serverLoaded = true;
      }
    } catch (e) {
      console.warn('FavStations: Unable to load configuration from server.', e);
    }

    // Load local storage overrides (personal/temporary settings for this browser)
    // This allows even admins to have personal display preferences that differ from global defaults
    const localConfigRaw = localStorage.getItem(configKey);
    if (localConfigRaw) {
      config = { ...config, ...JSON.parse(localConfigRaw) };
      console.log('FavStations: Loaded configuration from local storage');
    }

    // Ensures showLogos is a boolean
    config.showLogos = !!config.showLogos;
    if (!config.showStationsMode) config.showStationsMode = 'all';

    if (config.tempSlotCount === undefined) config.tempSlotCount = 8;
    tempSlots = new Array(config.tempSlotCount).fill(null);

    createBar();

    const mode = config.startupMode || 'server';
    if (mode === 'empty') {
      listsObj = { 'Default': [] };
      stations = [];
      currentListName = 'Default';
      loadMetadata = { origin: 'Empty Startup', source: 'Generated', date: new Date().toLocaleString() };
      renderButtons();
      updateListSelect();
    } else if (mode === 'remote') {
      await importFromRemote(true);
    } else {
      // Default: server
      await fetchList();
    }
  }

  // Helper to open the stream in a small popup with a title
  const playStream = (st) => {
    if (!st) return;
    const title = st.name || st.freq || 'Station';
    let url = st.streamUrl;

    if (!url) {
      const q = (st.name || st.freq || '').trim();
      if (!q) return showToast('No stream URL or name to search');
      url = `https://fmstream.org/index.php?s=${encodeURIComponent(q)}`;
    }

    const win = window.open('', 'StationStream', 'width=450,height=300,menubar=no,toolbar=no,location=no,status=no,resizable=yes');
    if (win) {
      win.document.open();
      win.document.write(`
        <html>
          <head>
            <title>${title}</title>
            <style>
              body { margin: 0; background: #111; color: #eee; font-family: sans-serif; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
              .header { padding: 12px; background: #222; border-bottom: 1px solid #333; text-align: center; box-shadow: 0 2px 5px rgba(0,0,0,0.5); z-index: 10; }
              h2 { margin: 0; font-size: 18px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
              iframe { flex: 1; border: none; background: #000; width: 100%; height: 100%; }
            </style>
          </head>
          <body>
            <div class="header"><h2>${title}</h2></div>
            <iframe src="${url}" allow="autoplay"></iframe>
          </body>
        </html>
      `);
      win.document.close();
      showToast(st.streamUrl ? `Playing stream for ${title}` : `Searching stream for ${title}`);
    }
  };

  function getButtonDims() {
    if (config.buttonSize === 'custom' && config.customWidth && config.customHeight) {
      const w = config.customWidth;
      const h = config.customHeight;
      const scaleH = h / 44;
      return {
        station: { w, h },
        control: { w: Math.round(48 * scaleH), h: Math.round(28 * scaleH) },
        font: Math.round(16 * scaleH),
        stationFont: Math.round(14 * scaleH),
        nameFont: Math.round(10 * scaleH),
        tempFont: Math.round(12 * scaleH),
        tempNameFont: Math.round(9 * scaleH)
      };
    }
    // Default 'normal' dimensions
    return { station: { w: 120, h: 60 }, control: { w: 48, h: 28 }, font: 16, stationFont: 14, nameFont: 10, tempFont: 12, tempNameFont: 9 };
  }

  // Function to persist configuration on server and locally
  // Function to persist configuration locally
  async function persistConfig() {
    try {
      localStorage.setItem(configKey, JSON.stringify(config));
      return true;
    } catch (e) {
      console.error('FavStations: Error saving config', e);
      return false;
    }
  }

  // Function to persist configuration on the server as new defaults
  async function persistConfigToServer() {
    if (!isAdmin) return;
    try {
      const res = await fetch('/plugins/FavStations/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        showToast('Global configuration updated on server.');
        return true;
      }
    } catch (e) {
      console.error('FavStations: Error saving config to server', e);
    }
    showToast('Failed to save configuration to server.');
    return false;
  }

  // Imports stations from a remote JSON link
  async function importFromRemote(silent = false) {
    let url = config.remoteStationsUrl || defaultRemoteStationsUrl; // Uses value from configuration, falls back to default

    // If preloaded stations are restricted to admin and we are at startup (silent), skip for normal users
    if (silent && config.showStationsMode === 'admin' && !isAdmin) {
      return false;
    }

    if (!silent) {
      const inputUrl = prompt('Enter Remote Stations JSON URL (Supports GitHub):', url);
      if (inputUrl === null) return false;
      url = (inputUrl.trim()) || url;
    }

    // Auto-convert standard GitHub URLs to Raw URLs
    if (url.includes('github.com') && !url.includes('gist.github.com')) {
      url = url.replace('github.com', 'raw.githubusercontent.com')
        .replace(/\/(blob|raw)\//, '/');
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
        const rawData = data.data;
        // Check if data is wrapped in our new metadata format
        const parsed = (rawData && rawData.data && !Array.isArray(rawData.data)) ? rawData.data : rawData;

        console.log(`FavStations: Imported stations from remote URL`);
        // Updates remote URL in configuration if changed
        if (url !== config.remoteStationsUrl) {
          config.remoteStationsUrl = url;
          await persistConfig(); // No prompt here, it's an internal update
        }

        if (Array.isArray(parsed)) {
          // Legacy format (single list)
          const sane = parsed.map(item => ({
            freq: item.freq ? String(item.freq) : '',
            name: item.name || '',
            antenna: item.antenna || '',
            logo: item.logo || '',
            itu: item.itu || '',
            picode: item.picode || generateId(),
            streamUrl: item.streamUrl || '' // Added streamUrl
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
              picode: item && item.picode ? item.picode : generateId(),
              streamUrl: item && item.streamUrl ? item.streamUrl : '' // Added streamUrl
            }));
          }
          listsObj = newLists;
          // Dopo aver caricato le liste, assicurati che currentListName sia valido o imposta la prima lista
          const listNames = Object.keys(listsObj);
          if (listNames.length > 0 && !listsObj[currentListName]) {
            currentListName = listNames[0];
          } else if (listNames.length === 0) {
            listsObj = { 'Default': [] };
            currentListName = 'Default';
          }
          stations = listsObj[currentListName] || [];
        } else {
          throw new Error('Invalid format');
        }

        loadMetadata = { origin: 'Remote URL', source: url, date: data.lastModified || new Date().toLocaleString() };
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
        const rawData = JSON.parse(txt);
        // Check for metadata wrapper
        const parsed = (rawData && rawData.data && !Array.isArray(rawData.data)) ? rawData.data : rawData;

        console.log(`FavStations: Imported stations from local file: ${file.name}`);
        if (Array.isArray(parsed)) {
          // Legacy format (single list)
          const sane = parsed.map(item => ({
            freq: item.freq ? String(item.freq) : '',
            name: item.name || '',
            antenna: item.antenna || '',
            logo: item.logo || '',
            itu: item.itu || '',
            picode: item.picode || generateId(),
            streamUrl: item.streamUrl || '' // Added streamUrl
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
              picode: item && item.picode ? item.picode : generateId(),
              streamUrl: item && item.streamUrl ? item.streamUrl : '' // Added streamUrl
            }));
          }
          listsObj = newLists;
          // Dopo aver caricato le liste, assicurati che currentListName sia valido o imposta la prima lista
          const listNames = Object.keys(listsObj);
          if (listNames.length > 0 && !listsObj[currentListName]) {
            currentListName = listNames[0];
          } else if (listNames.length === 0) {
            listsObj = { 'Default': [] };
            currentListName = 'Default';
          }
          stations = listsObj[currentListName] || [];
        } else {
          throw new Error('Invalid format');
        }
        loadMetadata = { origin: 'Local File', source: file.name, date: new Date(file.lastModified).toLocaleString() };
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
      const dataToExport = {
        data: (listsObj && Object.keys(listsObj).length) ? listsObj : { [currentListName]: (stations || []) },
        metadata: loadMetadata
      };
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
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
    const wrapper = document.getElementById('wrapper');

    const bar = document.createElement('div');
    bar.id = pluginId;

    bar.style.marginTop = '16px';
    bar.style.boxSizing = 'border-box';
    bar.style.display = 'flex';
    bar.style.flexDirection = 'column';
    bar.style.gap = '8px';
    bar.style.alignItems = 'stretch';
    bar.style.padding = '6px';
    bar.style.borderRadius = '8px';
    bar.style.backdropFilter = 'blur(6px)';
    bar.style.background = 'rgba(0,0,0,0.45)';
    bar.style.overflowX = 'auto';

    // Settings Button (next to Menu)
    const settingsBtn = document.createElement('button');
    settingsBtn.textContent = '⚙️';
    settingsBtn.id = 'favstations-settings-btn';
    settingsBtn.style.width = dims.control.w + 'px';
    settingsBtn.style.height = dims.control.h + 'px';
    settingsBtn.style.padding = '0';
    settingsBtn.style.boxSizing = 'border-box';
    settingsBtn.style.background = '#111';
    settingsBtn.style.border = '1px solid #333';
    settingsBtn.style.borderRadius = '4px';
    settingsBtn.style.color = '#fff';
    settingsBtn.style.fontSize = dims.font + 'px';
    settingsBtn.style.display = 'inline-flex';
    settingsBtn.style.alignItems = 'center';
    settingsBtn.style.justifyContent = 'center';

    settingsBtn.addEventListener('mouseenter', () => showTip(settingsBtn, `FavStations v${pluginVersion}\nSettings Menu:\nManage your station lists, customize button sizes, and configure server sync.`));
    settingsBtn.addEventListener('mouseleave', hideTip);
    settingsBtn.addEventListener('mousedown', hideTip);

    settingsBtn.onclick = (ev) => {
      ev.stopPropagation();
      hideTip();
      const prev = document.getElementById('favstations-context-menu');
      if (prev) {
        prev.remove();
        return;
      }
      const rect = settingsBtn.getBoundingClientRect();
      let items = [
        { label: 'Manage Lists', tooltip: 'Add, rename, delete, or reorder your station collections. Also handles Import/Export.', action: openManager },
        {
          label: 'Edit Settings',
          tooltip: isAdmin ? 'Global Admin Settings: Define startup behavior and layout for all users.' : 'Personal Settings: Customize button dimensions and local preferences.',
          action: () => openSettingsEditor(true)
        },
        {
          label: config.showLogos ? 'Hide Logos' : 'Show Logos',
          tooltip: 'Toggle the display of station logos on the buttons (browser-only setting).',
          action: async () => {
            config.showLogos = !config.showLogos;
            await persistConfig();
            renderButtons();
            renderTempSlots();
            showToast(`Logos ${config.showLogos ? 'enabled' : 'disabled'}`);
          }
        },
        {
          label: '?',
          tooltip: 'Open the project documentation and support page on GitHub.',
          action: () => window.open('https://github.com/mm-prg/FavStations', '_blank')
        }
      ];

      showStationContextMenu(rect.left, rect.bottom + 5, {
        items: items
      });
    };

    // Controls row (manage, save current, list select)
    const controlsRow = document.createElement('div');
    controlsRow.style.cssText = 'display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
    controlsRow.appendChild(settingsBtn);

    // List selector (shows all existing lists)
    const listSelect = document.createElement('select');
    listSelect.id = 'favstations-list-select';
    listSelect.style.cssText = `padding: 0 8px; height: ${dims.control.h}px; background: #222; color: #fff; border: 1px solid #444; border-radius: 6px; font-size: ${Math.round(13 * (dims.control.h / 28))}px; outline: none; cursor: pointer; vertical-align: middle; box-sizing:border-box;`;
    listSelect.addEventListener('mouseenter', () => showTip(listSelect, 'Active List:\nSwitch between your station groups or create a new empty list.'));
    listSelect.addEventListener('mouseleave', hideTip);
    listSelect.addEventListener('mousedown', hideTip);
    listSelect.onchange = () => {
      const val = listSelect.value;
      if (!val) return;
      if (val === '__new__') {
        // create new list from dropdown
        let name = prompt('Name for new list:', `List ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
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

    const clearTempBtn = document.createElement('button');
    clearTempBtn.textContent = '❌'; // Red cross icon
    clearTempBtn.style.cssText = `width:${dims.control.w}px; height:${dims.control.h}px; padding:0; background:#111; border:1px solid #333; border-radius:4px; color:#FF0000; font-size:${dims.font}px; display:inline-flex; align-items:center; justify-content:center; margin-left:4px; cursor:pointer; box-sizing:border-box;`;
    clearTempBtn.onclick = () => {
      tempSlots = new Array(config.tempSlotCount).fill(null); renderTempSlots(); showToast('All slots cleared');
    };
    clearTempBtn.addEventListener('mouseenter', () => showTip(clearTempBtn, 'Clear All Slots:\nRemove all stations from the temporary bank.'));
    clearTempBtn.addEventListener('mouseleave', hideTip);
    clearTempBtn.addEventListener('mousedown', hideTip);
    controlsRow.appendChild(clearTempBtn);

    // Temporary slot buttons container (8 slots)
    const tempContainer = document.createElement('div');
    tempContainer.id = 'favstations-temp-container';
    tempContainer.style.display = 'flex';
    tempContainer.style.flexWrap = 'wrap';
    tempContainer.style.gap = '6px';
    tempContainer.style.marginLeft = '8px';
    controlsRow.appendChild(tempContainer);

    // populate select now if listsObj already loaded
    setTimeout(() => updateListSelect(), 50);

    // Buttons row (station buttons) placed on its own line
    const buttonsRow = document.createElement('div');
    buttonsRow.style.display = 'flex';
    buttonsRow.style.justifyContent = 'stretch';
    buttonsRow.style.width = '100%';
    buttonsRow.style.overflowX = 'auto';
    const container = document.createElement('div');
    container.id = 'favstations-buttons';
    container.style.display = 'flex';
    container.style.gap = '6px';
    buttonsRow.appendChild(container);

    bar.appendChild(controlsRow);
    bar.appendChild(buttonsRow);

    if (wrapper) {
      wrapper.appendChild(bar);
    } else {
      bar.style.marginLeft = '8px';
      bar.style.marginRight = '8px';
      document.body.appendChild(bar);
    }

    renderTempSlots();
    renderButtons();
  }

  function renderTempSlots() {
    const tempContainer = document.getElementById('favstations-temp-container');
    if (!tempContainer) return;
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
    btn.style.boxSizing = 'border-box';
    btn.style.width = dims.control.w + 'px';
    btn.style.height = dims.control.h + 'px';
    btn.style.overflow = 'hidden';
    btn.style.fontSize = dims.tempFont + 'px';

    let tooltipText = `Temp Slot ${si + 1}:\n`;
    if (data) {
      tooltipText += `${data.freq} MHz - ${data.name || 'Unnamed'}\nClick to tune. Alt+Click for stream. Ctrl+Click to overwrite. Right-click for options.`;
    } else {
      tooltipText += `Empty slot. Click to save the currently tuned station here for this session.`;
    }

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
        freqEl.style.fontSize = dims.tempFont + 'px';
        const freqNum = parseFloat(data.freq);
        freqEl.textContent = !isNaN(freqNum) ? (freqNum > 30 ? freqNum.toFixed(2) : freqNum.toFixed(3)) : data.freq;
        ph.appendChild(freqEl);
      }
      if (data && data.name) {
        const nameEl = document.createElement('div');
        nameEl.style.fontSize = dims.tempNameFont + 'px';
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

    btn.onclick = async (e) => {
      if (btn._longPressed) { btn._longPressed = false; return; }

      // Ctrl+Click to overwrite temp slot
      if (e.ctrlKey) {
        const info = getCurrentStationInfo();
        if (!info.freq) return showToast('No frequency to save');
        const item = {
          freq: String(info.freq),
          name: info.name || '',
          antenna: info.antenna || '',
          logo: info.logo || '',
          itu: info.itu || '',
          picode: getPiCode() || generateId(),
          streamUrl: '' // New stations added this way won't have a stream URL initially
        };
        tempSlots[si] = item;
        renderTempSlots();
        return showToast(`Temp slot ${si + 1} overwritten with current: ${item.freq}`);
      }

      // Alt+Click to play stream
      if (e.altKey && tempSlots[si]) {
        playStream(tempSlots[si]);
        return;
      }

      if (tempSlots[si]) {
        const freq = parseFloat(tempSlots[si].freq);
        if (!isNaN(freq) && window.socket && socket.readyState === WebSocket.OPEN) {
          try {
            socket.send('T' + Math.round(Number(freq) * 1000));
            showToast(`Tuned ${tempSlots[si].freq}`);
            // Send antenna command if specified
            const ant = tempSlots[si].antenna;
            if (ant !== '' && ant !== undefined && ant !== null) {
              // In FM-DX Webserver '0' is Ant 1, '1' is Ant 2, etc.
              // Command 'Z' is the standard for antenna switching
              socket.send('Z' + ant);
            }
          } catch (err) { console.error('FavStations: tuning error', err); showToast(`Error tuning ${tempSlots[si].freq}`); }
        } else {
          try { await navigator.clipboard.writeText(String(tempSlots[si].freq)); showToast(`Copied ${tempSlots[si].freq}`); } catch (e) { showToast(String(tempSlots[si].freq)); }
        }
      } else {
        // save current to slot
        const info = getCurrentStationInfo();
        if (!info.freq && !info.streamUrl) return showToast('No frequency or stream to save'); // Allow saving stream-only
        const item = { freq: String(info.freq), name: info.name || '', antenna: info.antenna || '', logo: info.logo || '', itu: info.itu || '', picode: getPiCode() || generateId(), streamUrl: info.streamUrl || '' };
        tempSlots[si] = item;
        renderTempSlots();
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
            {
              label: 'Play Stream',
              action: () => {
                playStream(data);
              }
            },
            { label: 'Edit station', action: () => openGenericEditor({ isTemp: true, index: slotIndex }) },
            { label: 'Delete station', action: () => { tempSlots[slotIndex] = null; renderTempSlots(); showToast(`Deleted slot ${slotIndex + 1}`); } },
            {
              label: 'Copy current into this', action: () => {
                const info = getCurrentStationInfo(); if (!info.freq && !info.streamUrl) return showToast('No frequency or stream to copy');
                const item = { freq: String(info.freq), name: info.name || '', antenna: info.antenna || '', logo: info.logo || '', itu: info.itu || '', picode: getPiCode() || generateId(), streamUrl: info.streamUrl || '' };
                tempSlots[slotIndex] = item; renderTempSlots();
                showToast(`Copied current to temp slot ${slotIndex + 1}`);
              }
            }
          ]
        });
      }

      btnEl.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); openMenuAt(ev.clientX, ev.clientY); });

      btnEl.addEventListener('mousedown', (ev) => {
        if (ev.button !== 0) return;
        pressTimer = setTimeout(() => {
          const rect = btnEl.getBoundingClientRect();
          openMenuAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }, LONG_PRESS_MS);
      });
      ['mouseup', 'mouseleave'].forEach(n => btnEl.addEventListener(n, () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }));
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

  function renderButtons() {
    const container = document.getElementById('favstations-buttons');
    if (!container) return;
    container.innerHTML = '';
    const dims = getButtonDims();
    const GAP = 6;

    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.gap = GAP + 'px';
    container.style.flexDirection = 'row';
    container.style.justifyContent = 'flex-start';
    container.style.alignItems = 'flex-start';
    container.style.width = '100%';

    // Synchronize visibility of the main menu, list selector and settings with the stations visibility
    const listSelect = document.getElementById('favstations-list-select');
    const settingsBtn = document.getElementById('favstations-settings-btn');
    if (listSelect) listSelect.style.display = 'inline-block';
    if (settingsBtn) settingsBtn.style.display = 'inline-flex';

    stations.forEach((st, idx) => {
      container.appendChild(createStationButton(st, idx));
    });
    container.appendChild(createSaveCurrentButton());

    // createSaveCurrentButton: returns a button element appended after station buttons
    function createSaveCurrentButton() {
      const dims = getButtonDims();
      const btn = document.createElement('button');
      btn.textContent = '＋';
      btn.addEventListener('mouseenter', () => showTip(btn, 'Add New Station:\nSave the current frequency, name, and PI code to this list.'));
      btn.addEventListener('mouseleave', hideTip);
      btn.addEventListener('mousedown', hideTip);
      btn.style.background = '#111';
      btn.style.border = '1px solid #333';
      btn.style.borderRadius = '4px';
      btn.style.color = '#fff';
      btn.style.boxSizing = 'border-box';
      btn.style.width = dims.control.w + 'px';
      btn.style.height = dims.control.h + 'px';
      btn.style.padding = '0';
      btn.style.fontSize = dims.font + 'px';
      btn.style.marginLeft = '6px';
      btn.onclick = async () => {
        const info = getCurrentStationInfo();
        if (!info.freq && !info.streamUrl) return showToast('No frequency or stream to save');
        const item = {
          freq: String(info.freq),
          name: info.name || '',
          antenna: info.antenna || '',
          logo: info.logo || '',
          itu: info.itu || '',
          picode: getPiCode() || generateId(),
          streamUrl: info.streamUrl || '' // New stations added this way won't have a stream URL initially
        };
        stations.push(item);
        await persistStations();
        renderButtons();
        showToast('Station saved');
      };
      btn.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        const container = document.getElementById('favstations-buttons');
        const dragging = container.querySelector('.favstations-is-dragging');
        if (dragging) container.insertBefore(dragging, btn);
      });
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

    function makeItem(text, cb, tooltip) {
      const it = document.createElement('div');
      it.textContent = text;
      it.style.padding = '6px 8px';
      it.style.cursor = 'pointer';
      it.onmouseenter = () => {
        it.style.background = 'rgba(255,255,255,0.06)';
        if (tooltip) showTip(it, tooltip);
      };
      it.onmouseleave = () => {
        it.style.background = 'transparent';
        hideTip();
      };
      it.onclick = (ev) => { ev.stopPropagation(); hideTip(); cb(ev); menu.remove(); };
      return it;
    }

    (opts.items || []).forEach(i => menu.appendChild(makeItem(i.label, i.action, i.tooltip)));

    // close on any click outside or escape
    setTimeout(() => {
      const remove = () => { hideTip(); menu.remove(); document.removeEventListener('click', remove); document.removeEventListener('keydown', onKey); };
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

    const tooltipText = `Station: ${st.freq} MHz\n${st.name || 'No Name'} (${st.itu || '??'})\nClick to tune. Alt+Click for stream. Ctrl+Click to update. Drag to reorder. Right-click to edit.`;

    btn.addEventListener('mouseenter', () => showTip(btn, tooltipText));
    btn.addEventListener('mouseleave', hideTip);
    btn.addEventListener('mousedown', hideTip);

    btn.setAttribute('data-station-idx', idx);
    if (st.picode) btn.dataset.id = st.picode;

    btn.style.boxSizing = 'border-box';
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
        freqEl.textContent = !isNaN(freqNum) ? (freqNum > 30 ? freqNum.toFixed(2) : freqNum.toFixed(3)) : st.freq;
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

      // Ctrl+Click to overwrite station
      if (e.ctrlKey) {
        const info = getCurrentStationInfo();
        if (!info.freq) return showToast('No frequency to save');
        const item = {
          freq: String(info.freq),
          name: info.name || '',
          antenna: info.antenna || '',
          logo: info.logo || '',
          itu: info.itu || '',
          picode: getPiCode() || generateId(),
          streamUrl: info.streamUrl || ''
        };
        stations[idx] = item;
        await persistStations();
        renderButtons();
        return showToast(`Station overwritten with current: ${item.freq}`);
      }

      // Alt+Click to play stream
      if (e.altKey) {
        playStream(st);
        return;
      }

      const freq = parseFloat(st.freq);
      if (!isNaN(freq) && window.socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send("T" + Math.round(Number(freq) * 1000));
          showToast(`Tuned ${st.freq}`);
          // Send antenna command if specified
          const ant = st.antenna;
          if (ant !== '' && ant !== undefined && ant !== null) {
            // Send 'Z' command with the 0-based index
            socket.send('Z' + ant);
          }
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
      setTimeout(() => {
        btn.style.opacity = '0.4';
        btn.classList.add('favstations-is-dragging');
      }, 0);
    });

    btn.addEventListener('dragend', () => {
      btn.style.opacity = '1';
      btn.classList.remove('favstations-is-dragging');
    });

    btn.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      const container = document.getElementById('favstations-buttons');
      const dragging = container.querySelector('.favstations-is-dragging');
      if (!dragging || dragging === btn) return;
      const rect = btn.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      if (ev.clientX < midpoint) {
        container.insertBefore(dragging, btn);
      } else {
        container.insertBefore(dragging, btn.nextSibling);
      }
    });

    btn.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      const container = document.getElementById('favstations-buttons');
      const buttonEls = Array.from(container.querySelectorAll('button[data-station-idx]'));
      stations = buttonEls.map(el => stations[parseInt(el.getAttribute('data-station-idx'), 10)]);
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
            {
              label: 'Play Stream',
              action: () => {
                playStream(st);
              }
            },
            { label: 'Edit station', action: () => openGenericEditor({ index: index }) },
            { label: 'Delete station', action: async () => { stations.splice(index, 1); await persistStations(); renderButtons(); showToast('Deleted'); } },
            {
              label: 'Copy current into this', action: async () => {
                const info = getCurrentStationInfo(); if (!info.freq && !info.streamUrl) return showToast('No frequency or stream to copy');
                const item = { freq: String(info.freq), name: info.name || '', antenna: info.antenna || '', logo: info.logo || '', itu: info.itu || '', picode: getPiCode() || generateId(), streamUrl: info.streamUrl || '' };
                stations[index] = item; await persistStations(); renderButtons(); showToast(`Copied current to slot ${index + 1}`);
              }
            }
          ]
        });
      }

      btnEl.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); openMenuAt(ev.clientX, ev.clientY); });

      btnEl.addEventListener('dragstart', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });

      btnEl.addEventListener('mousedown', (ev) => {
        if (ev.button !== 0) return;
        pressTimer = setTimeout(() => {
          const rect = btnEl.getBoundingClientRect();
          openMenuAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }, LONG_PRESS_MS);
      });
      ['mouseup', 'mouseleave'].forEach(n => btnEl.addEventListener(n, () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }));
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
  async function fetchList(forceServer = false) {
    let serverLoaded = false;
    // Initialize loadMetadata to a default state. It will be updated if data is successfully loaded.
    loadMetadata = { origin: 'None', source: 'N/A', date: 'N/A' };


    // Only fetch from server if mode is 'all' or if user is admin
    const canLoadServer = (config.showStationsMode === 'all') || isAdmin;

    if (canLoadServer) {
      try {
        // Use a timestamp to bypass browser cache when loading from server
        const res = await fetch(`/plugins/FavStations/list?t=${Date.now()}`);
        if (res.ok) {
          const result = await res.json();
          // Support both old format (object) and new format ({data, metadata})
          const serverLists = result.data || {};
          const metadata = result.metadata || { origin: 'Server', source: 'FavStations_data.json', date: 'N/A' };

          // Expect an object of lists from the server
          if (serverLists && typeof serverLists === 'object' && !Array.isArray(serverLists) && Object.keys(serverLists).length > 0) {
            listsObj = serverLists;

            if (forceServer) {
              // Quando forziamo il caricamento dal server, mostriamo i dati del file locale
              loadMetadata = {
                origin: 'Server',
                source: 'FavStations_data.json',
                date: result.serverDate || metadata.date || 'N/A'
              };
            } else {
              // Caricamento normale (es. all'avvio): preserviamo la genealogia originale dei dati
              loadMetadata = {
                origin: metadata.origin || 'Server',
                source: metadata.source || 'FavStations_data.json',
                date: metadata.date || 'N/A'
              };
            }

            console.log('FavStations: Loaded station lists from server (/plugins/FavStations/list)');
            serverLoaded = true;
          }
        }
      } catch (e) { /* ignore */ }
    }

    // If not admin, or server failed, load/merge from local storage
    const localLists = loadListsLocal();
    if (!forceServer && localLists && Object.keys(localLists).length > 0) {
      if (!isAdmin || !serverLoaded) {
        // If server didn't load, or user is not admin, local storage is the primary or overriding source.
        listsObj = { ...listsObj, ...localLists };
        loadMetadata = { origin: 'Local Storage', source: 'Browser Cache', date: 'N/A' }; // Set metadata if local storage is the effective source
        console.log('FavStations: Loaded station lists from local storage');
      }
    }

    // If no lists are loaded, initialize with a "Default" list
    if (!listsObj || Object.keys(listsObj).length === 0) {
      const oldSingleList = loadLocal(); // Try to load from old single-list format
      if (oldSingleList && oldSingleList.length > 0) {
        listsObj = { 'Default': oldSingleList };
        loadMetadata = { origin: 'Legacy Local Storage', source: 'Browser Cache (v1)', date: 'N/A' };
      } else {
        listsObj = { 'Default': [] };
        loadMetadata = { origin: 'New Default List', source: 'Generated', date: new Date().toLocaleString() };
      }
      currentListName = 'Default'; // Ensure currentListName is set to 'Default'
    }

    // Assicurati che currentListName sia valido, o imposta la prima lista disponibile
    const listNames = Object.keys(listsObj);
    if (listNames.length > 0 && !listsObj[currentListName]) {
      currentListName = listNames[0];
    } else if (listNames.length === 0) { // Questo caso dovrebbe essere già coperto, ma come salvaguardia
      listsObj = { 'Default': [] };
      currentListName = 'Default';
      loadMetadata = { origin: 'New Default List', source: 'Generated', date: new Date().toLocaleString() };
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

    const closeOverlay = () => {
      overlay.remove();
      document.removeEventListener('keydown', handleEsc);
    };
    const handleEsc = (e) => { if (e.key === 'Escape') closeOverlay(); };
    document.addEventListener('keydown', handleEsc);

    overlay.onclick = (e) => { if (e.target === overlay) closeOverlay(); };

    const box = document.createElement('div');
    box.style.width = '560px';
    box.style.maxWidth = '96%';
    box.style.maxHeight = '86%';
    box.style.overflow = 'hidden'; // Evita che la scrollbar tagli gli angoli
    box.title = 'Manage your station lists: add, rename, delete, import, export, and reorder.';
    box.style.cssText = 'width:560px; maxWidth:96%; maxHeight:86%; padding:10px 14px; border-radius:12px; background:#fff; color:#000; display:flex; flex-direction:column; box-shadow: 0 10px 30px rgba(0,0,0,0.5);';

    const title = document.createElement('h3');
    title.innerHTML = `Manage Lists<br><span style="font-size: 11px; font-weight: normal; color: #777;">(FavStations v${pluginVersion})</span>`;
    title.style.margin = '0 0 10px 0';
    box.appendChild(title);
    makeDraggable(box, title);

    const metaInfo = document.createElement('div');
    metaInfo.id = 'favstations-meta-info';
    metaInfo.style.cssText = 'font-size: 12px; color: #555; background: #f5f5f5; padding: 8px 10px; border-radius: 6px; margin-bottom: 10px; border: 1px solid #ddd; line-height: 1.4;';
    const updateMetadataDisplay = () => {
      if (!isAdmin) return;
      metaInfo.innerHTML = `
        <div style="display:grid; grid-template-columns: 80px 1fr; gap: 4px;">
          <b>Origin:</b> <span>${loadMetadata.origin}</span>
          <b>Source:</b> <span style="word-break: break-all;">${loadMetadata.source}</span>
        </div>
      `;
    };
    if (isAdmin) {
      updateMetadataDisplay();
      box.appendChild(metaInfo);
    }

    // Action buttons for Quick Management
    const actionsBar = document.createElement('div');
    actionsBar.style.cssText = 'display:flex; gap:10px; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #eee; flex-wrap: wrap;';

    const btnStyle = 'padding: 6px 12px; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: #f8f8f8; flex: 1; text-align: center; white-space: nowrap; font-size: 13px; min-width: 120px;';

    const addBtn = document.createElement('button');
    addBtn.textContent = '➕ Add New List';
    addBtn.style.cssText = btnStyle;
    addBtn.title = 'Create a new empty collection of stations.';
    addBtn.onclick = () => {
      let name = prompt('Enter a name for the new list:', `List ${new Date().toISOString().slice(0, 10)}`);
      if (name === null) return;
      createNewList(name);
      renderListManager(); // Refresh this panel
    };

    const importBtn = document.createElement('button');
    importBtn.textContent = '📥 Import (JSON)';
    importBtn.style.cssText = btnStyle;
    importBtn.title = 'Load lists from a previously exported FavStations JSON file.';
    importBtn.onclick = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        try {
          const txt = await file.text();
          const rawData = JSON.parse(txt);
          const dataToImport = (parsed && parsed.data && !Array.isArray(parsed.data)) ? parsed.data : parsed; // Handle metadata wrapper
          if (Array.isArray(dataToImport)) {
            const sane = dataToImport.map(item => ({ freq: item.freq ? String(item.freq) : '', name: item.name || '', antenna: item.antenna || '', logo: item.logo || '', itu: item.itu || '', picode: item.picode || generateId(), streamUrl: item.streamUrl || '' }));
            stations = sane; listsObj[currentListName] = stations;
          } else if (dataToImport && typeof dataToImport === 'object') {
            for (const [k, v] of Object.entries(dataToImport)) {
              if (Array.isArray(v)) listsObj[k] = v.map(item => ({ freq: item && item.freq ? String(item.freq) : '', name: item && item.name ? item.name : '', antenna: item && item.antenna ? item.antenna : '', logo: item && item.logo ? item.logo : '', itu: item && item.itu ? item.itu : '', picode: item && item.picode ? item.picode : generateId(), streamUrl: item.streamUrl || '' }));
            }
            if (Object.keys(listsObj).length > 0 && !listsObj[currentListName]) currentListName = Object.keys(listsObj)[0]; // Ensure currentListName is valid
            stations = listsObj[currentListName] || [];
          }
          loadMetadata = { origin: 'Local File', source: file.name, date: new Date(file.lastModified).toLocaleString() };
          saveListsLocal();
          await persistStations();
          renderButtons();
          updateListSelect();
          renderListManager(); // Refresh the manager view
          updateMetadataDisplay();
          showToast(`Imported ${file.name}`);
        } catch (e) { alert('Import failed: ' + e.message); }
      };
      input.click();
    };

    const exportBtn = document.createElement('button');
    exportBtn.textContent = '📤 Export (JSON)';
    exportBtn.style.cssText = btnStyle;
    exportBtn.title = 'Download all current lists as a JSON file for backup.';
    exportBtn.onclick = () => exportStations();

    actionsBar.appendChild(addBtn);
    actionsBar.appendChild(importBtn);
    actionsBar.appendChild(exportBtn);

    const reloadBtn = document.createElement('button');
    reloadBtn.textContent = '🔄 Reload';
    reloadBtn.style.cssText = btnStyle;
    reloadBtn.title = 'Refresh the station lists from the server or local storage.';
    reloadBtn.onclick = async () => {
      const mode = config.startupMode || 'server';
      if (mode === 'empty') {
        listsObj = { 'Default': [] };
        stations = [];
        currentListName = 'Default';
        loadMetadata = { origin: 'Empty Startup', source: 'Generated', date: new Date().toLocaleString() };
        showToast('Lists reset to empty');
      } else if (mode === 'remote') {
        showToast('Reloading from remote URL...');
        await importFromRemote(true); // silent = true, so it will show its own success/failure toast
      } else {
        // Default: server
        await fetchList(true);
        showToast('Lists reloaded from server');
      }
      renderListManager();
      updateMetadataDisplay();
      renderButtons(); // Ensure buttons are re-rendered after data changes
      updateListSelect(); // Ensure list select is updated after data changes
    };
    actionsBar.appendChild(reloadBtn);

    if (isAdmin) {
      // New: Load from Server button (Admin only)
      const loadFromServerBtn = document.createElement('button');
      loadFromServerBtn.textContent = '☁️ Load from Server';
      loadFromServerBtn.style.cssText = btnStyle;
      loadFromServerBtn.title = 'Admin: Force reload all lists from the server\'s FavStations_data.json file, overriding local changes.';
      loadFromServerBtn.onclick = async () => {
        showToast('Loading lists from server...');
        await fetchList(true); // Pass true to force server and bypass local storage
        renderListManager();
        updateMetadataDisplay();
        renderButtons();
        updateListSelect();
        showToast('Lists loaded from server');
      };
      actionsBar.appendChild(loadFromServerBtn);

      // New: Load from Remote button (Admin only)
      const loadFromRemoteBtn = document.createElement('button');
      loadFromRemoteBtn.textContent = '🌐 Load from Remote';
      loadFromRemoteBtn.style.cssText = btnStyle;
      loadFromRemoteBtn.title = 'Admin: Force import lists from a remote JSON URL (will prompt for URL if not configured), overriding local changes.';
      loadFromRemoteBtn.onclick = async () => {
        showToast('Loading lists from remote URL...');
        const success = await importFromRemote(false); // silent = false, so it will prompt for URL if needed
        if (success) {
          renderListManager();
          updateMetadataDisplay();
          renderButtons();
          updateListSelect();
        }
      };
      actionsBar.appendChild(loadFromRemoteBtn);
    }

    if (isAdmin) {
      const serverSaveBtn = document.createElement('button');
      serverSaveBtn.textContent = '💾 Save to Server';
      serverSaveBtn.style.cssText = btnStyle;
      serverSaveBtn.title = 'Admin: Permanently save these lists as the global default on the server.';
      serverSaveBtn.onclick = async () => {
        await persistStations(); // Salva prima localmente
        const dataToSave = { data: listsObj, metadata: loadMetadata };
        const ok = await saveServer(dataToSave);
        if (ok) {
          showToast('Successfully saved to server');
          // Dopo il salvataggio, aggiorniamo i dati per recuperare i nuovi metadati (es. data file)
          await fetchList();
          updateMetadataDisplay();
        } else {
          showToast('Failed to save to server');
        }
      };
      actionsBar.appendChild(serverSaveBtn);
    }

    box.appendChild(actionsBar);

    const scrollContent = document.createElement('div');
    scrollContent.style.cssText = 'flex:1; overflow-y:auto; padding-right:4px; max-height:200px;';

    const listDiv = document.createElement('div');
    listDiv.style.cssText = 'display:flex; flex-direction:column; gap:4px; margin-bottom:8px;';

    function renderListManager() {
      listDiv.innerHTML = '';
      const listNames = Object.keys(listsObj);
      const actionBtnBase = 'width:28px; height:28px; display:flex; align-items:center; justify-content:center; border:1px solid #ddd; border-radius:4px; background:#fff; cursor:pointer; font-size:14px; transition:all 0.1s ease; padding:0; outline:none;';

      listNames.forEach((listName, index) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:12px; padding:3px 8px; border:1px solid #eee; border-radius:6px; background:#f9f9f9; transition:background 0.2s; margin-bottom:2px;';
        row.onmouseenter = () => row.style.background = '#f1f1f1';
        row.onmouseleave = () => row.style.background = '#f9f9f9';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = listName;
        nameSpan.style.cssText = 'font-weight:600; font-size:13px; color:#333; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; gap:4px;';

        const renameBtn = document.createElement('button');
        renameBtn.textContent = '✏️';
        renameBtn.title = 'Rename this list';
        renameBtn.style.cssText = actionBtnBase;
        renameBtn.onmouseenter = () => { renameBtn.style.background = '#eef6ff'; renameBtn.style.borderColor = '#007bff'; };
        renameBtn.onmouseleave = () => { renameBtn.style.background = '#fff'; renameBtn.style.borderColor = '#ddd'; };
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
        deleteBtn.textContent = '🗑️';
        deleteBtn.title = 'Delete this list';
        deleteBtn.style.cssText = actionBtnBase;
        deleteBtn.onmouseenter = () => { deleteBtn.style.background = '#fff0f0'; deleteBtn.style.borderColor = '#dc3545'; };
        deleteBtn.onmouseleave = () => { deleteBtn.style.background = '#fff'; deleteBtn.style.borderColor = '#ddd'; };
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
        upBtn.textContent = '🔼';
        upBtn.title = 'Move up';
        upBtn.style.cssText = actionBtnBase;
        upBtn.disabled = index === 0;
        if (upBtn.disabled) upBtn.style.opacity = '0.35';
        else {
          upBtn.onmouseenter = () => { upBtn.style.background = '#f0f0f0'; upBtn.style.borderColor = '#999'; };
          upBtn.onmouseleave = () => { upBtn.style.background = '#fff'; upBtn.style.borderColor = '#ddd'; };
        }
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
        downBtn.textContent = '🔽';
        downBtn.title = 'Move down';
        downBtn.style.cssText = actionBtnBase;
        downBtn.disabled = index === listNames.length - 1;
        if (downBtn.disabled) downBtn.style.opacity = '0.35';
        else {
          downBtn.onmouseenter = () => { downBtn.style.background = '#f0f0f0'; downBtn.style.borderColor = '#999'; };
          downBtn.onmouseleave = () => { downBtn.style.background = '#fff'; downBtn.style.borderColor = '#ddd'; };
        }
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
    scrollContent.appendChild(listDiv);
    box.appendChild(scrollContent);

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex; justify-content:flex-end; gap:10px; margin-top:10px;';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.padding = '6px 16px';
    closeBtn.onclick = closeOverlay;
    footer.appendChild(closeBtn);

    box.appendChild(footer);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function openGenericEditor(opts = {}) {
    const { index = null, isTemp = false } = opts;
    const isNew = index === null;
    const sourceArr = isTemp ? tempSlots : stations; // Use sourceArr for tempSlots or stations
    const s = !isNew ? sourceArr[index] : { freq: '', name: '', antenna: '', logo: '', picode: '', itu: '', streamUrl: '' };

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

    const closeOverlay = () => {
      overlay.remove();
      document.removeEventListener('keydown', handleEsc);
    };
    const handleEsc = (e) => { if (e.key === 'Escape') closeOverlay(); };
    document.addEventListener('keydown', handleEsc);

    overlay.onclick = (e) => { if (e.target === overlay) closeOverlay(); };

    const box = document.createElement('div');
    box.style.width = isTemp ? '520px' : '560px';
    box.style.maxWidth = '96%';
    box.style.padding = '12px';
    box.style.borderRadius = '12px';
    box.style.background = '#fff';
    box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';

    const title = document.createElement('h3');
    let titleText = isNew ? 'Add station' : 'Edit station';
    if (isTemp) titleText = 'Edit temp slot';
    if (isNew && isTemp) titleText = 'Add temp slot'; // Should not happen with current logic, but for completeness
    title.innerHTML = `${titleText}<br><span style="font-size: 11px; font-weight: normal; color: #777;">(FavStations v${pluginVersion})</span>`;
    box.appendChild(title);
    makeDraggable(box, title);

    const form = document.createElement('div');
    form.style.display = 'grid';
    form.style.gridTemplateColumns = '1fr 1fr'; // Default to two columns
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

    const piInput = document.createElement('input');
    piInput.value = s.picode || '';
    piInput.style.width = '100%';
    piInput.oninput = () => { piInput.value = piInput.value.toUpperCase(); };
    const piLabel = document.createElement('label');
    piLabel.textContent = 'PI Code';
    piLabel.appendChild(piInput);
    form.appendChild(piLabel);

    const ituInput = document.createElement('input');
    ituInput.value = s.itu || '';
    ituInput.style.width = '100%';
    ituInput.oninput = () => { ituInput.value = ituInput.value.toUpperCase(); };
    const ituLabel = document.createElement('label');
    ituLabel.textContent = 'ITU Code';
    ituLabel.appendChild(ituInput);
    form.appendChild(ituLabel);

    const antennaLabel = document.createElement('label');
    antennaLabel.textContent = 'Antenna';
    const antennaSelect = document.createElement('select');
    antennaSelect.style.width = '100%';
    antennaSelect.style.padding = '4px';
    [
      { v: '', t: 'Don\'t change' },
      { v: '0', t: 'Go to Ant A' },
      { v: '1', t: 'Go to Ant B' },
      { v: '2', t: 'Go to Ant C' },
      { v: '3', t: 'Go to Ant D' }
    ].forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.v;
      o.textContent = opt.t;
      if (String(s.antenna || '') === opt.v) o.selected = true;
      antennaSelect.appendChild(o);
    });
    antennaLabel.appendChild(antennaSelect);
    form.appendChild(antennaLabel);

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
    logoSearchBtn.title = 'Search for logo: Tries to find a matching icon using PI Code, Name, and ITU.';

    logoSearchBtn.style.width = '28px'; // Fixed width
    logoSearchBtn.style.height = '28px'; // Fixed height
    logoSearchBtn.style.padding = '0'; // Remove padding to control size precisely
    logoSearchBtn.style.fontSize = '14px'; // Smaller font size for the icon
    logoSearchBtn.style.flexShrink = '0'; // Prevent button from shrinking
    logoSearchBtn.style.display = 'flex'; // Use flex to center content
    logoSearchBtn.style.alignItems = 'center';
    logoSearchBtn.style.justifyContent = 'center';

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

    const logoBrowseBtn = document.createElement('button');
    logoBrowseBtn.type = 'button';
    logoBrowseBtn.textContent = '🌐';
    logoBrowseBtn.title = 'Logo Browser: Open the station logo repository to manually find a logo.';
    logoBrowseBtn.style.width = '28px';
    logoBrowseBtn.style.height = '28px';
    logoBrowseBtn.style.padding = '0';
    logoBrowseBtn.style.fontSize = '14px';
    logoBrowseBtn.style.flexShrink = '0';
    logoBrowseBtn.style.display = 'flex';
    logoBrowseBtn.style.alignItems = 'center';
    logoBrowseBtn.style.justifyContent = 'center';
    logoBrowseBtn.onclick = () => window.open('https://tef.noobish.eu/logos/logo_preview.html', '_blank');
    logoInputContainer.appendChild(logoBrowseBtn);

    logoLabel.appendChild(logoInputContainer);
    form.appendChild(logoLabel);

    // Stream URL field (full width)
    const streamUrlLabel = document.createElement('label');
    streamUrlLabel.textContent = 'Stream URL';
    streamUrlLabel.style.gridColumn = '1 / -1'; // Span full width

    const streamUrlContainer = document.createElement('div');
    streamUrlContainer.style.display = 'flex';
    streamUrlContainer.style.alignItems = 'center';
    streamUrlContainer.style.gap = '4px';

    const streamUrlInput = document.createElement('input');
    streamUrlInput.value = s.streamUrl || '';
    streamUrlInput.style.flex = '1';
    streamUrlInput.placeholder = 'https://... (e.g., MP3 stream)';
    streamUrlContainer.appendChild(streamUrlInput);

    const streamSearchBtn = document.createElement('button');
    streamSearchBtn.type = 'button';
    streamSearchBtn.textContent = '🔍';
    streamSearchBtn.title = 'Search Stream: Choose a website to search for the stream of this station.';
    streamSearchBtn.style.cssText = 'width:28px; height:28px; padding:0; font-size:14px; flex-shrink:0; display:flex; align-items:center; justify-content:center;';
    const searchResultsPanel = document.createElement('div');
    searchResultsPanel.id = 'favstations-stream-search-results';
    searchResultsPanel.style.display = 'none';
    searchResultsPanel.style.gridColumn = '1 / -1';
    searchResultsPanel.style.marginTop = '8px';
    searchResultsPanel.style.padding = '8px';
    searchResultsPanel.style.borderRadius = '6px';
    searchResultsPanel.style.background = '#f9f9f9';
    searchResultsPanel.style.border = '1px solid #e0e0e0';
    searchResultsPanel.style.maxHeight = '180px';
    searchResultsPanel.style.overflowY = 'auto';
    searchResultsPanel.style.fontSize = '12px';
    searchResultsPanel.style.color = '#333';
    searchResultsPanel.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.05)';

    async function performAutoSearch(query) {
      searchResultsPanel.style.display = 'block';
      searchResultsPanel.innerHTML = '<div style="padding: 10px; text-align: center; color: #666;">🔍 Searching Radio-Browser database...</div>';
      searchResultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      const rbServers = [
        'https://de1.api.radio-browser.info',
        'https://nl1.api.radio-browser.info',
        'https://at1.api.radio-browser.info'
      ];

      const servers = [...rbServers].sort(() => Math.random() - 0.5);
      let data = null;

      for (const server of servers) {
        try {
          const url = `${server}/json/stations/search?name=${encodeURIComponent(query)}&limit=6&hidebroken=true`;
          const res = await fetch(url);
          if (res.ok) {
            data = await res.json();
            if (data && data.length > 0) {
              break;
            }
          }
        } catch (e) {
          console.warn(`[FavStations] Failed to fetch from mirror ${server}:`, e);
        }
      }

      if (!data || data.length === 0) {
        searchResultsPanel.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px;">
            <span style="color: #c0392b; font-weight: bold;">No streams found on Radio-Browser.</span>
            <button type="button" style="padding: 2px 6px; cursor: pointer; font-size: 11px; background:#fff; border:1px solid #ccc; border-radius:3px;" id="favstations-close-search">Close</button>
          </div>
        `;
        const closeBtn = searchResultsPanel.querySelector('#favstations-close-search');
        if (closeBtn) closeBtn.onclick = () => { searchResultsPanel.style.display = 'none'; };
        return;
      }

      searchResultsPanel.innerHTML = '';

      const header = document.createElement('div');
      header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 6px;';
      header.innerHTML = `
        <span>Select stream to import:</span>
        <button type="button" style="padding: 2px 6px; cursor: pointer; font-size: 11px; background:#fff; border:1px solid #ccc; border-radius:3px;" id="favstations-close-search">Close</button>
      `;
      searchResultsPanel.appendChild(header);

      const closeBtn = header.querySelector('#favstations-close-search');
      if (closeBtn) closeBtn.onclick = () => { searchResultsPanel.style.display = 'none'; };

      const listContainer = document.createElement('div');
      listContainer.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';

      data.forEach(item => {
        const itemRow = document.createElement('div');
        itemRow.style.cssText = 'padding: 6px; border-radius: 4px; border: 1px solid #eee; background: #fff; cursor: pointer; transition: background 0.15s; display: flex; flex-direction: column; gap: 2px;';

        itemRow.onmouseenter = () => { itemRow.style.background = '#f0f7ff'; itemRow.style.borderColor = '#a3d2ff'; };
        itemRow.onmouseleave = () => { itemRow.style.background = '#fff'; itemRow.style.borderColor = '#eee'; };

        const titleSpan = document.createElement('span');
        titleSpan.style.cssText = 'font-weight: 600; color: #2c3e50;';
        titleSpan.textContent = item.name;

        const infoSpan = document.createElement('span');
        infoSpan.style.cssText = 'font-size: 11px; color: #7f8c8d;';
        const bitrateInfo = item.bitrate ? `${item.bitrate}kbps` : '';
        const codecInfo = item.codec ? item.codec.toUpperCase() : '';
        const streamDetails = [codecInfo, bitrateInfo].filter(Boolean).join(' @ ');

        const countryInfo = item.country || '';
        const genresInfo = item.tags ? item.tags.split(',').slice(0, 3).join(', ') : '';
        const detailsArray = [streamDetails, countryInfo, genresInfo].filter(Boolean);
        infoSpan.textContent = detailsArray.join(' | ');

        itemRow.appendChild(titleSpan);
        itemRow.appendChild(infoSpan);

        itemRow.onclick = () => {
          if (item.url_resolved) {
            streamUrlInput.value = item.url_resolved;
            showToast('Stream URL imported');
          }
          if (item.favicon && !logoInput.value) {
            logoInput.value = item.favicon;
            showToast('Logo imported');
          }
          if (item.countrycode && !ituInput.value) {
            let resolvedItu = item.countrycode.toUpperCase();
            if (Array.isArray(window.countryList)) {
              const matchedCountry = window.countryList.find(c => c.country_code === item.countrycode.toUpperCase());
              if (matchedCountry && matchedCountry.itu_code) {
                resolvedItu = matchedCountry.itu_code;
              }
            }
            ituInput.value = resolvedItu;
            showToast(`ITU Code (${resolvedItu}) imported`);
          }
          searchResultsPanel.style.display = 'none';
        };

        listContainer.appendChild(itemRow);
      });

      searchResultsPanel.appendChild(listContainer);
    }

    streamSearchBtn.onclick = (ev) => {
      ev.stopPropagation();
      const q = (nameInput.value || freqInput.value).trim();
      if (!q) return showToast('Enter name or frequency to search');

      const rect = streamSearchBtn.getBoundingClientRect();
      showStationContextMenu(rect.left, rect.bottom + 5, {
        items: [
          {
            label: '🔍 Auto-search & Import URL',
            action: () => performAutoSearch(nameInput.value || q),
            tooltip: 'Search public databases and import streaming URL directly'
          },
          {
            label: 'FMStream.org',
            action: () => window.open(`https://fmstream.org/index.php?s=${encodeURIComponent(q)}`, '_blank'),
            tooltip: 'Search streaming URLs on FMStream.org'
          },
          {
            label: 'Radio-Browser.info',
            action: () => window.open(`https://www.radio-browser.info/#/search?name=${encodeURIComponent(nameInput.value || q)}`, '_blank'),
            tooltip: 'Search on Radio-Browser database'
          },
          {
            label: 'OnlineRadioBox.com',
            action: () => window.open(`https://onlineradiobox.com/search?q=${encodeURIComponent(nameInput.value || q)}`, '_blank'),
            tooltip: 'Search on OnlineRadioBox'
          },
          {
            label: 'FMScan.org',
            action: () => window.open(`https://fmscan.org/net.php?r=f&q=${encodeURIComponent(nameInput.value || q)}`, '_blank'),
            tooltip: 'Search transmitter networks on FMScan'
          },
          {
            label: 'Google Search',
            action: () => {
              const googleQuery = `${q} radio stream live url`;
              window.open(`https://www.google.com/search?q=${encodeURIComponent(googleQuery)}`, '_blank');
            },
            tooltip: 'Google search for live stream URLs'
          }
        ]
      });
    };
    streamUrlContainer.appendChild(streamSearchBtn);
    streamUrlLabel.appendChild(streamUrlContainer);
    form.appendChild(streamUrlLabel);
    form.appendChild(searchResultsPanel);

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
        antenna: String(antennaSelect.value || '').trim(),
        logo: String(logoInput.value || '').trim(),
        itu: String(ituInput.value || '').trim().toUpperCase(),
        streamUrl: String(streamUrlInput.value || '').trim(), // Capture stream URL
      };
      if (item.logo === 'https://tef.noobish.eu/logos/default-logo.png') item.logo = '';
      const inputPi = String(piInput.value || '').trim().toUpperCase();
      if (!item.freq) return alert('Frequency required');

      if (isTemp) {
        item.picode = inputPi || (!isNew && sourceArr[index] && sourceArr[index].picode) || generateId();
        sourceArr[index] = item;
        renderTempSlots();
        overlay.remove();
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
        closeOverlay();
        renderButtons();
      }
    };
    actions.appendChild(saveBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = closeOverlay;
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
    showToast('Saved (locally)');
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

    const freqText = dataFrequencyElement ? dataFrequencyElement.textContent.trim() : ''; // Frequency is always from the tuner
    const freq = freqText || '';

    let name = '';
    if (dataStationNameElement && dataStationNameElement.offsetParent !== null) {
      name = dataStationNameElement.textContent.trim();
    } else if (dataPsElement) {
      name = dataPsElement.textContent.trim();
    }

    // Default to '' (Don't change) when capturing station info
    const antenna = '';

    let logo = logoEl && logoEl.src ? logoEl.src : '';
    if (logo === 'https://tef.noobish.eu/logos/default-logo.png') logo = '';

    const itu = getItuCode() || '';
    const streamUrl = ''; // Stream URL is not typically derived from live tuner data
    return { freq, name, antenna, logo, itu, streamUrl };
  }

  // Try to find Pi Code of the currently tuned station from page elements
  function getPiCode() {
    const ids = ['data-pi', 'data-picode', 'data-pi-code', 'data-station-pi', 'station-pi', 'data-station-code', 'data-station-id', 'data-id'];
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
    const ids = ['data-itu', 'data-itucode', 'data-itu-code', 'data-country-itu', 'data-country'];
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
    try { localStorage.setItem(storageKey, JSON.stringify(stations)); } catch (e) { }
    renderButtons();
    const span = document.getElementById('favstations-list-name'); if (span) span.textContent = currentListName;
    showToast(`Created list: ${currentListName}`);
    updateListSelect();
  }

  // Update the lists dropdown with existing lists
  function updateListSelect() {
    const sel = document.getElementById('favstations-list-select');
    if (!sel) return;
    sel.style.display = 'inline-block';

    // clear
    sel.innerHTML = '';
    const names = Object.keys(listsObj || {});
    if (names.length === 0) {
      const opt = document.createElement('option'); opt.value = currentListName; opt.textContent = currentListName; sel.appendChild(opt);
      // add new list option
      const newOpt = document.createElement('option'); newOpt.value = '__new__'; newOpt.textContent = '➕ New list...'; sel.appendChild(newOpt);
      updateSelectWidth(sel);
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
    updateSelectWidth(sel);
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

  function updateSelectWidth(sel) {
    if (!sel || sel.options.length === 0) return;

    // If the selector is hidden, don't try to calculate width (would be 0)
    if (sel.style.display === 'none') return;

    const tempSpan = document.createElement('span');
    tempSpan.style.visibility = 'hidden';
    tempSpan.style.position = 'absolute';
    tempSpan.style.whiteSpace = 'nowrap';
    tempSpan.style.font = getComputedStyle(sel).font;
    document.body.appendChild(tempSpan);

    let maxWidth = 0;
    for (let i = 0; i < sel.options.length; i++) {
      tempSpan.textContent = sel.options[i].text;
      const w = tempSpan.getBoundingClientRect().width;
      if (w > maxWidth) maxWidth = w;
    }

    sel.style.width = (maxWidth + 32) + 'px';
    document.body.removeChild(tempSpan);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" }[c]; });
  }

  // Helper to make panels draggable by their title
  function makeDraggable(el, handle) {
    handle.style.cursor = 'move';
    handle.style.userSelect = 'none';
    handle.onmousedown = (e) => {
      // Don't trigger drag if clicking buttons or inputs inside the handle
      if (['INPUT', 'BUTTON', 'SELECT'].includes(e.target.tagName)) return;

      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Switch from flex centering to absolute positioning for free movement
      el.style.position = 'absolute';
      el.style.margin = '0';
      el.style.left = rect.left + 'px';
      el.style.top = rect.top + 'px';

      let startX = e.clientX;
      let startY = e.clientY;

      const onMouseMove = (me) => {
        const dx = me.clientX - startX;
        const dy = me.clientY - startY;
        el.style.left = (el.offsetLeft + dx) + 'px';
        el.style.top = (el.offsetTop + dy) + 'px';
        startX = me.clientX;
        startY = me.clientY;
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
  }

  // Visual dimension editor
  function openDimensionEditor(params = {}) {
    // Support both direct callback (old way) or options object
    const callbackOnSave = (typeof params === 'function') ? params : params.callbackOnSave;
    const initialWidth = params.initialWidth;
    const initialHeight = params.initialHeight;

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; left:0; top:0; right:0; bottom:0; z-index:20000; background:rgba(0,0,0,0.85); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-family:sans-serif; backdrop-filter:blur(4px);';

    const title = document.createElement('h3');
    title.innerHTML = `Resize buttons<br><span style="font-size: 11px; font-weight: normal; color: #777;">(FavStations v${pluginVersion})</span>`;
    title.style.marginBottom = '20px';
    overlay.appendChild(title);

    const dims = getButtonDims();
    const startW = initialWidth || dims.station.w;
    const startH = initialHeight || dims.station.h;

    // Resizable container
    const resizeContainer = document.createElement('div');
    resizeContainer.style.cssText = `
      border: 2px dashed #aaa;
      background: rgba(255,255,255,0.1);
      overflow: hidden;
      resize: both;
      width: ${startW}px;
      height: ${startH}px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 40px;
      min-height: 24px;
      box-sizing: border-box;
    `;

    const sampleBtn = document.createElement('div');
    sampleBtn.textContent = 'STATION';
    sampleBtn.style.cssText = 'width:100%; height:100%; background:#222; border:1px solid #444; border-radius:6px; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:12px; pointer-events:none;';
    resizeContainer.appendChild(sampleBtn);
    overlay.appendChild(resizeContainer);

    const info = document.createElement('div');
    info.style.marginTop = '15px';
    info.style.fontSize = '18px';
    info.textContent = `${startW} x ${startH}`;
    overlay.appendChild(info);

    // Update info on resize using ResizeObserver for real-time feedback
    const ro = new ResizeObserver(entries => {
      for (let entry of entries) {
        const rect = entry.target.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
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

      if (callbackOnSave) {
        callbackOnSave(config.customWidth, config.customHeight);
      } else {
        config.buttonSize = 'custom';
        await persistConfig(); // Persist locally
        const oldBar = document.getElementById(pluginId);
        if (oldBar) oldBar.remove();
        createBar();
        renderButtons();
      }
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

    const versionInfo = document.createElement('div');
    versionInfo.textContent = `v${pluginVersion}`;
    versionInfo.style.cssText = 'font-size: 10px; color: #888; margin-top: 10px; text-align: right;';
    alertBox.appendChild(versionInfo);

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

  function openStartupModeSelector() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; left:0; top:0; right:0; bottom:0; z-index:20002; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.6);';

    const box = document.createElement('div');
    box.style.cssText = 'width:420px; max-width:96%; padding:20px; border-radius:8px; background:#fff; color:#000; font-family:sans-serif; display:flex; flex-direction:column; gap:16px; box-shadow:0 10px 25px rgba(0,0,0,0.5);';

    const title = document.createElement('h3');
    title.innerHTML = `Startup Loading Mode<br><span style="font-size: 11px; font-weight: normal; color: #777;">(FavStations v${pluginVersion})</span>`;
    title.style.margin = '0';
    box.appendChild(title);

    const form = document.createElement('div');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '12px';

    let selectedMode = config.startupMode || 'server';

    const modes = [
      { id: 'server', label: 'Server (Local JSON)' },
      { id: 'remote', label: 'Remote (URL/GitHub)' },
      { id: 'empty', label: 'Empty list' }
    ];

    const remoteContainer = document.createElement('div');
    remoteContainer.style.display = (selectedMode === 'remote' ? 'block' : 'none');
    remoteContainer.style.marginTop = '4px';
    remoteContainer.style.paddingLeft = '24px';

    const remoteLabel = document.createElement('div');
    remoteLabel.textContent = 'Remote Stations JSON URL:';
    remoteLabel.style.fontSize = '12px';
    remoteLabel.style.marginBottom = '4px';
    remoteLabel.style.color = '#555';
    remoteContainer.appendChild(remoteLabel);

    const remoteInput = document.createElement('input');
    remoteInput.type = 'text';
    remoteInput.value = config.remoteStationsUrl || '';
    remoteInput.style.width = '100%';
    remoteInput.style.padding = '6px';
    remoteInput.style.boxSizing = 'border-box';
    remoteInput.placeholder = 'https://...';
    remoteContainer.appendChild(remoteInput);

    modes.forEach(m => {
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '8px';
      label.style.cursor = 'pointer';
      label.style.fontSize = '14px';

      const rb = document.createElement('input');
      rb.type = 'radio';
      rb.name = 'fs-startup-mode';
      rb.value = m.id;
      rb.checked = (selectedMode === m.id);
      rb.onchange = () => {
        selectedMode = m.id;
        remoteContainer.style.display = (selectedMode === 'remote' ? 'block' : 'none');
      };

      label.appendChild(rb);
      label.appendChild(document.createTextNode(m.label));
      form.appendChild(label);
      if (m.id === 'remote') form.appendChild(remoteContainer);
    });

    box.appendChild(form);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '10px';
    actions.style.justifyContent = 'flex-end';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.padding = '6px 16px';
    saveBtn.onclick = async () => {
      config.startupMode = selectedMode;
      if (selectedMode === 'remote') {
        let url = remoteInput.value.trim();
        if (url.includes('github.com') && !url.includes('gist.github.com')) {
          url = url.replace('github.com', 'raw.githubusercontent.com')
            .replace(/\/(blob|raw)\//, '/');
        }
        config.remoteStationsUrl = url;
      }
      await persistConfig();
      showToast(`Startup configuration saved`);
      overlay.remove();
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '6px 16px';
    cancelBtn.onclick = () => overlay.remove();

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    box.appendChild(actions);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // Unified Settings Editor for both local and global configuration
  async function openSettingsEditor(isGlobal = false) {
    let baseConfig = {};
    if (isGlobal) {
      try {
        const res = await fetch('/plugins/FavStations/config');
        if (res.ok) {
          baseConfig = await res.json();
        }
      } catch (e) {
        console.error('FavStations: Failed to fetch fresh config for editor', e);
        baseConfig = { ...config };
      }
    } else {
      baseConfig = { ...config };
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; left:0; top:0; right:0; bottom:0; z-index:20002; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.6);';

    const closeOverlay = () => {
      overlay.remove();
      document.removeEventListener('keydown', handleEsc);
    };
    const handleEsc = (e) => { if (e.key === 'Escape') closeOverlay(); };
    document.addEventListener('keydown', handleEsc);

    overlay.onclick = (e) => { if (e.target === overlay) closeOverlay(); };

    const box = document.createElement('div');
    box.style.cssText = 'width:480px; max-width:96%; padding:20px; border-radius:8px; background:#fff; color:#000; font-family:sans-serif; display:flex; flex-direction:column; gap:16px; box-shadow:0 10px 25px rgba(0,0,0,0.5);';
    box.style.borderRadius = '12px';
    box.title = isGlobal ? 'Configure global settings for all users, including startup mode, station visibility, and button dimensions.' : 'Customize your local display settings, such as button dimensions and temporary slots.';
    const title = document.createElement('h3');
    const mainTitle = isGlobal ? 'Edit Default Settings' : 'Edit Settings';
    title.innerHTML = `${mainTitle}<br><span style="font-size: 11px; font-weight: normal; color: #777;">(FavStations v${pluginVersion})</span>`;
    title.style.margin = '0';
    box.appendChild(title);
    makeDraggable(box, title);

    const form = document.createElement('div');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '12px';

    // --- Startup Mode ---
    let currentStartupMode = baseConfig.startupMode || 'server';
    let remoteInput;
    let modeSelect;
    if (isAdmin) {
      const startupModeGroup = document.createElement('fieldset');
      startupModeGroup.style.border = '1px solid #ccc';
      startupModeGroup.style.borderRadius = '4px';
      startupModeGroup.style.padding = '10px';
      startupModeGroup.style.margin = '0';
      const legend = document.createElement('legend');
      legend.textContent = 'Startup Loading Mode';
      legend.style.fontWeight = 'bold';
      startupModeGroup.appendChild(legend);

      const modes = [
        { id: 'server', label: 'Server (Local JSON)' },
        { id: 'remote', label: 'Remote (URL/GitHub)' },
        { id: 'empty', label: 'Empty list' }
      ];

      const remoteContainer = document.createElement('div');
      remoteContainer.style.display = (currentStartupMode === 'remote' ? 'block' : 'none');
      remoteContainer.style.marginTop = '4px';
      remoteContainer.style.paddingLeft = '24px';

      const remoteLabel = document.createElement('div');
      remoteLabel.textContent = 'Remote Stations JSON URL:';
      remoteLabel.style.fontSize = '12px';
      remoteLabel.style.marginBottom = '4px';
      remoteLabel.style.color = '#555';
      remoteContainer.appendChild(remoteLabel);

      remoteInput = document.createElement('input');
      remoteInput.type = 'text';
      remoteInput.value = baseConfig.remoteStationsUrl || '';
      remoteInput.style.width = '100%';
      remoteInput.style.padding = '6px';
      remoteInput.style.boxSizing = 'border-box';
      remoteInput.placeholder = 'https://...';
      remoteContainer.appendChild(remoteInput);

      modes.forEach(m => {
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '8px';
        label.style.cursor = 'pointer';
        label.style.fontSize = '14px';

        const rb = document.createElement('input');
        rb.type = 'radio';
        rb.name = 'fs-global-startup-mode';
        rb.value = m.id;
        rb.checked = (currentStartupMode === m.id);
        rb.onchange = () => {
          currentStartupMode = m.id;
          remoteContainer.style.display = (currentStartupMode === 'remote' ? 'block' : 'none');
        };
        label.appendChild(rb);
        label.appendChild(document.createTextNode(m.label));
        startupModeGroup.appendChild(label);
      });
      startupModeGroup.appendChild(remoteContainer);
      form.appendChild(startupModeGroup);

      // --- Show Stations Mode Selector ---
      if (isGlobal) {
        const modeLabel = document.createElement('label');
        modeLabel.textContent = 'Preloaded Stations Visibility:';
        modeLabel.style.display = (currentStartupMode === 'empty' ? 'none' : 'flex');
        modeLabel.style.flexDirection = 'column';
        modeLabel.style.gap = '4px';
        modeSelect = document.createElement('select');
        modeSelect.style.padding = '6px';
        [
          { val: 'all', text: 'Show for all users' },
          { val: 'admin', text: 'Show only for Administrator' }
        ].forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.val;
          opt.textContent = m.text;
          if ((baseConfig.showStationsMode || 'all') === m.val) opt.selected = true;
          modeSelect.appendChild(opt);
        });
        modeLabel.appendChild(modeSelect);
        form.appendChild(modeLabel);

        // Add listener to radios to toggle the mode label
        form.querySelectorAll('input[name="fs-global-startup-mode"]').forEach(radio => {
          const oldHandler = radio.onchange;
          radio.onchange = () => {
            oldHandler();
            modeLabel.style.display = (currentStartupMode === 'empty' ? 'none' : 'flex');
          };
        });
      }
    }

    // --- Show Logos ---
    let showLogosCheckbox;
    if (isAdmin) {
      const showLogosLabel = document.createElement('label');
      showLogosLabel.style.display = 'flex';
      showLogosLabel.style.alignItems = 'center';
      showLogosLabel.style.gap = '8px';
      showLogosLabel.style.cursor = 'pointer';
      showLogosCheckbox = document.createElement('input');
      showLogosCheckbox.type = 'checkbox';
      showLogosCheckbox.checked = baseConfig.showLogos !== false;
      showLogosLabel.appendChild(showLogosCheckbox);
      showLogosLabel.appendChild(document.createTextNode('Show Station Logos'));
      form.appendChild(showLogosLabel);
    }

    // --- Temp Slot Count ---
    const tempSlotLabel = document.createElement('label');
    tempSlotLabel.textContent = 'Number of Temporary Slots (1-30):';
    tempSlotLabel.style.display = 'flex';
    tempSlotLabel.style.flexDirection = 'column';
    tempSlotLabel.style.gap = '4px';
    const tempSlotInput = document.createElement('input');
    tempSlotInput.type = 'number';
    tempSlotInput.min = '1';
    tempSlotInput.max = '30';
    tempSlotInput.value = baseConfig.tempSlotCount || 8;
    tempSlotInput.style.padding = '6px';
    tempSlotInput.style.boxSizing = 'border-box';
    tempSlotInput.style.width = '100px'; // Make it smaller
    tempSlotLabel.appendChild(tempSlotInput);
    form.appendChild(tempSlotLabel);

    // --- Button Dimensions ---
    const dimsLabel = document.createElement('label');
    dimsLabel.textContent = 'Default Button Dimensions (Width x Height):';
    dimsLabel.style.display = 'flex';
    dimsLabel.style.flexDirection = 'column';
    dimsLabel.style.gap = '4px';

    const dimsRow = document.createElement('div');
    dimsRow.style.display = 'flex';
    dimsRow.style.gap = '8px';
    dimsRow.style.alignItems = 'center';

    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.min = '40';
    widthInput.value = baseConfig.customWidth || 120;
    widthInput.style.padding = '6px';
    widthInput.style.width = '80px';

    const heightInput = document.createElement('input');
    heightInput.type = 'number';
    heightInput.min = '24';
    heightInput.value = baseConfig.customHeight || 60;
    heightInput.style.padding = '6px';
    heightInput.style.width = '80px';

    dimsRow.appendChild(widthInput);
    dimsRow.appendChild(document.createTextNode(' x '));
    dimsRow.appendChild(heightInput);
    dimsLabel.appendChild(dimsRow);

    // NEW: Visual Editor Button
    const visualEditorBtn = document.createElement('button');
    visualEditorBtn.textContent = 'Visual Editor';
    visualEditorBtn.style.padding = '6px 10px';
    visualEditorBtn.style.marginLeft = '10px';
    visualEditorBtn.style.background = '#007bff';
    visualEditorBtn.style.color = '#fff';
    visualEditorBtn.style.border = 'none';
    visualEditorBtn.style.borderRadius = '4px';
    visualEditorBtn.style.cursor = 'pointer';
    visualEditorBtn.addEventListener('mouseenter', () => showTip(visualEditorBtn, 'Resize Utility:\nOpen a live preview where you can drag the corner of a button to set dimensions.'));
    visualEditorBtn.addEventListener('mouseleave', hideTip);
    visualEditorBtn.addEventListener('mousedown', hideTip);

    visualEditorBtn.onclick = () => {
      // Hide this modal temporarily
      overlay.style.display = 'none';

      openDimensionEditor({
        initialWidth: parseInt(widthInput.value, 10),
        initialHeight: parseInt(heightInput.value, 10),
        callbackOnSave: (newWidth, newHeight) => {
          // Callback from openDimensionEditor
          widthInput.value = newWidth;
          heightInput.value = newHeight;
          // Show this modal again
          overlay.style.display = 'flex';
        }
      });
    };
    dimsRow.appendChild(visualEditorBtn); // Add the new button
    form.appendChild(dimsLabel);

    box.appendChild(form);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '10px';
    actions.style.justifyContent = 'space-between';
    actions.style.alignItems = 'center';

    const leftActions = document.createElement('div');
    leftActions.style.display = 'flex';
    leftActions.style.gap = '10px';

    const rightActions = document.createElement('div');
    rightActions.style.display = 'flex';
    rightActions.style.gap = '10px';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.padding = '6px 16px';
    saveBtn.onclick = async () => {
      // Update global config object with values from the modal
      if (isAdmin) {
        config.startupMode = currentStartupMode;
        if (currentStartupMode === 'remote' && remoteInput) {
          let url = remoteInput.value.trim();
          if (url.includes('github.com') && !url.includes('gist.github.com')) {
            url = url.replace('github.com', 'raw.githubusercontent.com')
              .replace(/\/(blob|raw)\//, '/');
          }

          // Validate the URL format
          try {
            new URL(url);
          } catch (e) {
            showToast('Invalid Remote Stations URL format.');
            return; // Prevent saving if URL is invalid
          }

          // Validate if the remote URL is reachable and returns valid data before saving
          showToast('Checking remote URL...');
          try {
            const testRes = await fetch('/plugins/FavStations/fetch-remote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url })
            });
            const testData = await testRes.json();
            if (!testData || !testData.ok) {
              alert(`Remote validation failed: ${testData.error || 'Resource not found or invalid JSON'}`);
              return; // Prevent saving if the URL returns 404 or other errors
            }
          } catch (err) {
            alert(`Could not validate remote URL: ${err.message}`);
            return;
          }

          config.remoteStationsUrl = url;
        } else if (currentStartupMode !== 'remote') {
          // If not remote, ensure remoteStationsUrl is cleared or set to default
          config.remoteStationsUrl = defaultRemoteStationsUrl;
        }
        if (showLogosCheckbox) config.showLogos = showLogosCheckbox.checked;
      }

      if (isGlobal && isAdmin && modeSelect) config.showStationsMode = modeSelect.value;

      const newTempSlotCount = parseInt(tempSlotInput.value, 10);
      if (!isNaN(newTempSlotCount) && newTempSlotCount >= 1 && newTempSlotCount <= 30) {
        config.tempSlotCount = newTempSlotCount;
      } else {
        showToast('Invalid temporary slot count. Must be between 1 and 30.');
        return;
      }

      // Update dimensions
      config.customWidth = parseInt(widthInput.value, 10) || 120;
      config.customHeight = parseInt(heightInput.value, 10) || 60;
      config.buttonSize = 'custom';

      if (isGlobal && isAdmin) {
        // Persist to server (only for admins)
        await persistConfigToServer();
      }

      // Always persist locally for the current user
      await persistConfig();

      closeOverlay();

      // Update temporary slots if count changed
      tempSlots = new Array(config.tempSlotCount).fill(null);

      const oldBar = document.getElementById(pluginId);
      if (oldBar) oldBar.remove();
      createBar();
      renderButtons();
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '6px 16px';
    cancelBtn.onclick = closeOverlay;

    rightActions.appendChild(cancelBtn);
    rightActions.appendChild(saveBtn);
    actions.appendChild(leftActions);
    actions.appendChild(rightActions);
    box.appendChild(actions);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

})();
