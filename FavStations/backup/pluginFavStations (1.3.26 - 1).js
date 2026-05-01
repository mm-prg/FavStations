/* FavStations plugin for fmdxwebserver
   - mostra una barra di pulsanti in basso
   - memorizza stazioni: {freq,name,antenna,logo}
   - salva/riprende da /plugins/FavStations/* (server) o fallback a localStorage
*/

"use strict";

(() => {
  const pluginId = 'favstations-plugin';
  const storageKey = 'FavStationsList_v1';
  const listsKey = 'FavStationsLists_v1';
  let currentListName = 'Default';
  let listsObj = {};
  let stations = [];
  let tempSlots = new Array(5).fill(null);

  document.addEventListener('DOMContentLoaded', () => {
    createBar();
    fetchList();
  });

  function createBar() {
    if (document.getElementById(pluginId)) return;
    const bar = document.createElement('div');
    bar.id = pluginId;
    bar.style.position = 'fixed';
    bar.style.left = '8px';
    bar.style.right = '8px';
    bar.style.bottom = '8px';
    bar.style.zIndex = 9999;
    bar.style.display = 'flex';
    bar.style.flexDirection = 'column';
    bar.style.gap = '8px';
    bar.style.alignItems = 'stretch';
    bar.style.padding = '6px';
    bar.style.borderRadius = '8px';
    bar.style.backdropFilter = 'blur(6px)';
    bar.style.background = 'rgba(0,0,0,0.45)';
    bar.style.overflowX = 'auto';

    const manageBtn = document.createElement('button');
    manageBtn.textContent = '⭐';
    manageBtn.title = 'Manage stations';
    manageBtn.style.width = '36px';
    manageBtn.style.height = '28px';
    manageBtn.style.padding = '0';
    manageBtn.style.fontSize = '16px';
    manageBtn.style.display = 'inline-flex';
    manageBtn.style.alignItems = 'center';
    manageBtn.style.justifyContent = 'center';
    manageBtn.onclick = openManager;

    // Controls row (manage, save current, list select)
    const controlsRow = document.createElement('div');
    controlsRow.style.display = 'flex';
    controlsRow.style.gap = '8px';
    controlsRow.style.alignItems = 'center';
    controlsRow.appendChild(manageBtn);

    const saveCurrentBtn = document.createElement('button');
    saveCurrentBtn.textContent = '＋';
    saveCurrentBtn.title = 'Save current station to list';
    saveCurrentBtn.style.width = '36px';
    saveCurrentBtn.style.height = '28px';
    saveCurrentBtn.style.padding = '0';
    saveCurrentBtn.style.fontSize = '16px';
    saveCurrentBtn.onclick = async () => {
      const info = getCurrentStationInfo();
      if (!info.freq) return showToast('No frequency to save');
      // Normalize frequency as string
      const item = {
        freq: String(info.freq),
        name: info.name || '',
        antenna: info.antenna || '',
        logo: info.logo || ''
      };
      // assign unique id: prefer Pi Code of current station if available
      item.id = getPiCode() || generateId();
      stations.push(item);
      await persistStations();
      renderButtons();
      showToast('Station saved');
    };
    controlsRow.appendChild(saveCurrentBtn);


    // List selector (shows all existing lists)
    const listSelect = document.createElement('select');
    listSelect.id = 'favstations-list-select';
    listSelect.style.marginLeft = '8px';
    listSelect.style.padding = '4px';
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

    function renderTempSlots() {
      tempContainer.innerHTML = '';
      tempSlots.forEach((item, si) => tempContainer.appendChild(createTempButton(si)));
    }

    function createTempButton(si) {
      const data = tempSlots[si];
      const btn = document.createElement('button');
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';
      btn.style.padding = '4px';
      btn.style.borderRadius = '6px';
      btn.style.background = '#222';
      btn.style.color = '#fff';
      btn.style.width = '72px';
      btn.style.height = '44px';
      btn.style.overflow = 'hidden';
      btn.style.fontSize = '12px';
      // tooltip and content
      if (data) {
        const freqText = data.freq ? `${data.freq} MHz` : '';
        btn.title = freqText + (data.freq && data.name ? ' — ' : '') + (data.name || '');
      } else {
        btn.title = `Temp slot ${si+1}: click to save current, click again to tune`;
      }

      if (data && data.logo) {
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
        ph.style.alignItems = 'center';
        ph.style.justifyContent = 'center';
        ph.style.color = '#fff';
        ph.style.fontSize = '12px';
        ph.style.fontWeight = '600';
        ph.style.padding = '2px';
        ph.textContent = data && data.freq ? (String(data.freq) + ' MHz') : '';
        btn.appendChild(ph);
      }

      btn.onclick = async () => {
        if (tempSlots[si]) {
          const freq = parseFloat(tempSlots[si].freq);
          if (!isNaN(freq) && window.socket && socket.readyState === WebSocket.OPEN) {
            try {
              socket.send('T' + Math.round(Number(freq) * 1000));
              if (tempSlots[si].antenna) socket.send('Z' + tempSlots[si].antenna);
              showToast(`Tuned ${tempSlots[si].freq}`);
            } catch (err) { console.error('FavStations: tuning error', err); showToast(`Error tuning ${tempSlots[si].freq}`); }
          } else {
            try { await navigator.clipboard.writeText(String(tempSlots[si].freq)); showToast(`Copied ${tempSlots[si].freq}`); } catch (e) { showToast(String(tempSlots[si].freq)); }
          }
        } else {
          // save current to slot
          const info = getCurrentStationInfo();
          if (!info.freq) return showToast('No frequency to save');
          const item = { freq: String(info.freq), name: info.name || '', antenna: info.antenna || '', logo: info.logo || '', id: getPiCode() || generateId() };
          tempSlots[si] = item;
          renderTempSlots();
          showToast(`Saved to slot ${si+1}`);
        }
      };

      btn.ondblclick = () => openEditorForTemp(si);

      btn.oncontextmenu = (ev) => { ev.preventDefault();
        // right-click: copy current station data into this temp slot
        const info = getCurrentStationInfo();
        if (!info.freq) return showToast('No frequency to copy');
        const item = { freq: String(info.freq), name: info.name || '', antenna: info.antenna || '', logo: info.logo || '', id: getPiCode() || generateId() };
        tempSlots[si] = item;
        renderTempSlots();
        showToast(`Copied current to slot ${si+1}`);
      };

      return btn;
    }

    // render initial empty temp slots
    renderTempSlots();

    // Save / Load list buttons (icons only)
    const saveListBtn = document.createElement('button');
    saveListBtn.textContent = '💾';
    saveListBtn.title = 'Export all lists to JSON file';
    saveListBtn.style.width = '36px';
    saveListBtn.style.height = '28px';
    saveListBtn.style.padding = '0';
    saveListBtn.style.fontSize = '16px';
    saveListBtn.onclick = async () => {
      // persist locally/server first
      await persistStations();
      // prepare JSON and trigger download
      try {
        // export all lists object (fallback to current list if listsObj empty)
        const dataObj = (listsObj && Object.keys(listsObj).length) ? listsObj : { [currentListName]: (stations || []) };
        const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
        const nameSafe = String(currentListName || 'all_lists').replace(/[^a-z0-9_\-]/gi, '_');
        const filename = `${nameSafe}-alllists-${Date.now()}.json`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast(`Exported ${filename}`);
      } catch (e) {
        console.error('FavStations: export error', e);
        showToast('Export failed');
      }
    };
    controlsRow.appendChild(saveListBtn);

    const loadListBtn = document.createElement('button');
    loadListBtn.textContent = '📂';
    loadListBtn.title = 'Import lists from JSON file';
    loadListBtn.style.width = '36px';
    loadListBtn.style.height = '28px';
    loadListBtn.style.padding = '0';
    loadListBtn.style.fontSize = '16px';
    loadListBtn.onclick = async () => {
      // open file picker to import JSON list
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        try {
          const txt = await file.text();
          const parsed = JSON.parse(txt);
          if (Array.isArray(parsed)) {
            // legacy single-list format: import into current list
            const sane = parsed.map(item => ({
              freq: item.freq ? String(item.freq) : '',
              name: item.name || '',
              antenna: item.antenna || '',
              logo: item.logo || '',
              id: item.id || generateId()
            }));
            stations = sane;
            listsObj[currentListName] = stations;
          } else if (parsed && typeof parsed === 'object') {
            // expected mapping: listName -> array of items
            const newLists = {};
            for (const [k, v] of Object.entries(parsed)) {
              if (!Array.isArray(v)) continue;
              newLists[k] = v.map(item => ({
                freq: item && item.freq ? String(item.freq) : '',
                name: item && item.name ? item.name : '',
                antenna: item && item.antenna ? item.antenna : '',
                logo: item && item.logo ? item.logo : '',
                id: item && item.id ? item.id : generateId()
              }));
            }
            listsObj = newLists;
            // ensure currentListName exists or pick first
            if (!listsObj[currentListName]) {
              const keys = Object.keys(listsObj);
              currentListName = keys.length ? keys[0] : currentListName;
            }
            stations = listsObj[currentListName] || [];
          } else {
            throw new Error('Invalid format: expected array or object of lists');
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
    };
    controlsRow.appendChild(loadListBtn);

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

    // Compute how many buttons fit per row based on available space
    const buttonsRow = container.parentElement || container;
    const availableWidth = (buttonsRow && buttonsRow.clientWidth) || (window.innerWidth - 32);
    const BUTTON_WIDTH = 72; // must match createStationButton width
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
    } else {
      // create multiple rows stacked vertically
      container.style.flexDirection = 'column';
      for (let r = 0; r < rows; r++) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = GAP + 'px';
        if (r < rows - 1) row.style.marginBottom = '6px';
        const start = r * MAX_PER_ROW;
        const slice = stations.slice(start, start + MAX_PER_ROW);
        slice.forEach((st, i) => row.appendChild(createStationButton(st, start + i)));
        container.appendChild(row);
      }
    }
  }

  // Helper to create a station button element
  function createStationButton(st, idx) {
    const btn = document.createElement('button');
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.padding = '4px';
    btn.style.borderRadius = '6px';
    btn.style.background = '#222';
    btn.style.color = '#fff';
    // tooltip: frequency and name
    const freqText = st.freq ? `${st.freq} MHz` : '';
    btn.title = freqText + (st.freq && st.name ? ' — ' : '') + (st.name || '');
    if (st.id) btn.dataset.id = st.id;

    // fixed, uniform size for all buttons
    btn.style.width = '72px';
    btn.style.height = '44px';
    btn.style.overflow = 'hidden';

    if (st.logo) {
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
      ph.style.alignItems = 'center';
      ph.style.justifyContent = 'center';
      ph.style.color = '#fff';
      ph.style.fontSize = '12px';
      ph.style.fontWeight = '600';
      ph.style.padding = '2px';
      ph.textContent = st.freq ? (String(st.freq) + ' MHz') : '';
      btn.appendChild(ph);
    }

    btn.ondblclick = () => openEditor(idx);

    btn.onclick = async (e) => {
      const freq = parseFloat(st.freq);
      if (!isNaN(freq) && window.socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send("T" + Math.round(Number(freq) * 1000));
          if (st.antenna) socket.send("Z" + st.antenna);
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

    btn.oncontextmenu = (ev) => { ev.preventDefault();
      // right-click: copy current station into this saved station
      const info = getCurrentStationInfo();
      if (!info.freq) return showToast('No frequency to copy');
      const item = { freq: String(info.freq), name: info.name || '', antenna: info.antenna || '', logo: info.logo || '', id: getPiCode() || generateId() };
      stations[idx] = item;
      persistStations();
      renderButtons();
      showToast(`Copied current to slot ${idx+1}`);
    };
    return btn;
  }

  // fetch list from server, fallback to localStorage (support multiple lists in localStorage)
  async function fetchList() {
    try {
      const res = await fetch('/plugins/FavStations/list');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          stations = data;
          // initialize lists object with default list from server
          listsObj = {};
          listsObj[currentListName] = stations;
          saveListsLocal();
          // keep legacy storage for compatibility
          try { localStorage.setItem(storageKey, JSON.stringify(stations)); } catch (e) {}
          renderButtons();
          const span = document.getElementById('favstations-list-name'); if (span) span.textContent = currentListName;
          return;
        }
      }
    } catch (e) {
      // ignore
    }

    // fallback: load lists object from localStorage
    listsObj = loadListsLocal();
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

  async function saveServer(list) {
    try {
      const res = await fetch('/plugins/FavStations/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(list),
      });
      if (res.ok) return true;
    } catch (e) {
      // ignore
    }
    return false;
  }

  function saveLocal(list) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(list || []));
    } catch (e) {
      console.warn('FavStations: cannot save local', e);
    }
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
  function openManager(editIndex = null) {
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
    box.style.width = '720px';
    box.style.maxWidth = '96%';
    box.style.maxHeight = '86%';
    box.style.overflow = 'auto';
    box.style.padding = '14px';
    box.style.borderRadius = '8px';
    box.style.background = '#fff';
    box.style.color = '#000';

    const title = document.createElement('h3');
    title.textContent = 'Fav Stations Manager';
    box.appendChild(title);

    const listDiv = document.createElement('div');
    listDiv.style.display = 'flex';
    listDiv.style.flexDirection = 'column';
    listDiv.style.gap = '8px';
    listDiv.style.marginBottom = '12px';

    stations.forEach((s, i) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.gap = '8px';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.gap = '8px';
      left.style.alignItems = 'center';

      if (s.logo) {
        const img = document.createElement('img');
        img.src = s.logo;
        img.style.width = '44px';
        img.style.height = '28px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '4px';
        left.appendChild(img);
      }

      const txt = document.createElement('div');
      txt.innerHTML = `<b>${s.freq}</b> — ${escapeHtml(s.name || '')} <div style="font-size:12px;color:#666">${escapeHtml(s.antenna||'')}</div>`;
      if (s.id) {
        const idDiv = document.createElement('div');
        idDiv.style.fontSize = '11px';
        idDiv.style.color = '#666';
        idDiv.textContent = `Pi: ${s.id}`;
        txt.appendChild(idDiv);
      }
      left.appendChild(txt);

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '6px';

      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => { overlay.remove(); openEditor(i); };
      actions.appendChild(editBtn);

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.onclick = async () => {
        if (!confirm('Delete this station?')) return;
        stations.splice(i, 1);
        await persistStations();
        overlay.remove();
        openManager();
      };
      actions.appendChild(delBtn);

      row.appendChild(left);
      row.appendChild(actions);
      listDiv.appendChild(row);
    });

    box.appendChild(listDiv);

    const addBtn = document.createElement('button');
    addBtn.textContent = '➕ Add new station';
    addBtn.onclick = () => { overlay.remove(); openEditor(); };
    box.appendChild(addBtn);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.marginLeft = '12px';
    closeBtn.onclick = () => overlay.remove();
    box.appendChild(closeBtn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function openEditor(index = null) {
    const s = index !== null ? stations[index] : { freq: '', name: '', antenna: '', logo: '' };

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.zIndex = 10002;
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(0,0,0,0.6)';

    const box = document.createElement('div');
    box.style.width = '560px';
    box.style.maxWidth = '96%';
    box.style.padding = '12px';
    box.style.borderRadius = '8px';
    box.style.background = '#fff';

    const title = document.createElement('h3');
    title.textContent = index !== null ? 'Edit station' : 'Add station';
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

    const logoLabel = document.createElement('label');
    logoLabel.textContent = 'Logo (URL)';
    const logoInput = document.createElement('input');
    logoInput.value = s.logo || '';
    logoInput.style.width = '100%';
    logoLabel.appendChild(logoInput);
    form.appendChild(logoLabel);

    const piLabel = document.createElement('label');
    piLabel.textContent = 'Pi Code';
    const piInput = document.createElement('input');
    piInput.value = s.id || '';
    piInput.style.width = '100%';
    piLabel.appendChild(piInput);
    form.appendChild(piLabel);

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
      };
      const inputPi = String(piInput.value || '').trim();
      if (!item.freq) return alert('Frequency required');

      if (index !== null) {
        // editing: use provided Pi code if any, otherwise preserve existing or generate
        if (inputPi) item.id = inputPi; else item.id = stations[index] && stations[index].id ? stations[index].id : generateId();
        stations[index] = item;
      } else {
        // new entry: prefer user-provided Pi, otherwise try page Pi, otherwise generate
        if (inputPi) {
          item.id = inputPi;
        } else {
          const pi = getPiCode();
          const currentFreqEl = document.getElementById('data-frequency');
          const currentFreq = currentFreqEl ? (currentFreqEl.textContent || '').trim() : '';
          if (pi && String(item.freq) === String(currentFreq)) {
            item.id = pi;
          } else {
            item.id = generateId();
          }
        }
        stations.push(item);
      }
      await persistStations();
      overlay.remove();
      renderButtons();
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

  // Editor for temp slots (separate because temp slots aren't in `stations`)
  function openEditorForTemp(slotIndex) {
    const s = tempSlots[slotIndex] || { freq: '', name: '', antenna: '', logo: '' };

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.zIndex = 10003;
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(0,0,0,0.6)';

    const box = document.createElement('div');
    box.style.width = '520px';
    box.style.maxWidth = '96%';
    box.style.padding = '12px';
    box.style.borderRadius = '8px';
    box.style.background = '#fff';

    const title = document.createElement('h3');
    title.textContent = 'Edit temp slot';
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

    const logoLabel = document.createElement('label');
    logoLabel.textContent = 'Logo (URL)';
    const logoInput = document.createElement('input');
    logoInput.value = s.logo || '';
    logoInput.style.width = '100%';
    logoLabel.appendChild(logoInput);
    form.appendChild(logoLabel);

    const piLabel = document.createElement('label');
    piLabel.textContent = 'Pi Code';
    const piInput = document.createElement('input');
    piInput.value = s.id || '';
    piInput.style.width = '100%';
    piLabel.appendChild(piInput);
    form.appendChild(piLabel);

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
      };
      const inputPi = String(piInput.value || '').trim();
      if (!item.freq) return alert('Frequency required');
      item.id = inputPi || (tempSlots[slotIndex] && tempSlots[slotIndex].id) || generateId();
      tempSlots[slotIndex] = item;
      renderTempSlots();
      overlay.remove();
      showToast(`Saved slot ${slotIndex+1}`);
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
    stations.forEach((s) => { if (!s.id) s.id = generateId(); });
    listsObj[currentListName] = stations;
    saveListsLocal();
    // keep legacy single-list key for compatibility
    try { localStorage.setItem(storageKey, JSON.stringify(stations)); } catch (e) {}

    const ok = await saveServer(stations);
    if (!ok) showToast('Saved locally (server unavailable)');
    else showToast('Saved');
  }

  // Get current antenna value similar to other plugins
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
    const logo = logoEl && logoEl.src ? logoEl.src : '';

    return { freq, name, antenna, logo };
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

})();
