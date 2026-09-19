const STORAGE_KEY = 'mangaquest_data';

function saveGame() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  } catch (e) { /* ignore */ }
  scheduleSyncToServer();
}

function loadGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function clearGame() {
  localStorage.removeItem(STORAGE_KEY);
}

let _syncTimer = null;
function scheduleSyncToServer() {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    saveProgress().catch(() => {});
  }, 1500);
}

async function syncFromServer() {
  if (OFFLINE_MODE) return;
  if (!state.playerId || !state.token) return;
  const data = await rpc('validate_session', {
    p_player_id: state.playerId,
    p_hash: state.token
  });
  if (data && data.ok && data.data && Object.keys(data.data).length > 0) {
    const merged = { ...state.data };
    for (const k in data.data) {
      const v = data.data[k];
      if (v === null || v === undefined) continue;
      if (k === 'cards' && typeof v !== 'object') continue;
      merged[k] = v;
    }
    state.data = merged;
  }
}

function setupAutoSave() {
  setInterval(saveGame, 5000);
  window.addEventListener('beforeunload', () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    } catch (e) {}
    if (state.playerId && state.token && !OFFLINE_MODE) {
      sb.rpc('save_data', {
        p_player_id: state.playerId,
        p_hash: state.token,
        p_data: state.data
      });
    }
  });
}