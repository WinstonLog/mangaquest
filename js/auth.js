// ============================================================
// АВТОРИЗАЦИЯ (с офлайн-fallback)
// ============================================================

function makeSalt(len = 16) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPass(pass, salt) {
  const buf = new TextEncoder().encode(salt + ':' + pass);
  const out = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(out)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function makeId() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function saveSession() {
  localStorage.setItem('mq_session', JSON.stringify({
    playerId: state.playerId,
    name: state.name,
    token: state.token,
    offline: OFFLINE_MODE
  }));
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem('mq_session')); }
  catch { return null; }
}

function clearSession() {
  localStorage.removeItem('mq_session');
}

async function register(name, pass) {
  const nameLc = name.toLowerCase();
  const salt = makeSalt();
  const hash = await hashPass(pass, salt);
  const id = makeId();

  const data = await rpc('register_player', {
    p_name: name, p_name_lc: nameLc, p_player_id: id, p_hash: hash, p_salt: salt
  });
  if (!data || !data.ok) return data || { ok: false, error: 'network' };

  state.playerId = id;
  state.name = name;
  state.token = hash;
  state.data = data.data || {};
  ensureGameData();
  saveSession();
  return data;
}

async function login(name, pass) {
  const nameLc = name.toLowerCase();

  const salt = await rpc('get_salt', { p_name_lc: nameLc });
  if (!salt) return { ok: false, error: 'no_user' };

  const hash = await hashPass(pass, salt);

  const data = await rpc('login_player', { p_name_lc: nameLc, p_hash: hash });
  if (!data || !data.ok) return data || { ok: false, error: 'network' };

  state.playerId = data.player_id;
  state.name = data.name;
  state.token = hash;
  state.data = data.data || {};
  ensureGameData();
  saveSession();
  return data;
}

async function autoLogin() {
  const s = loadSession();
  if (!s) return null;

  const data = await rpc('validate_session', {
    p_player_id: s.playerId, p_hash: s.token
  });
  if (!data || !data.ok) {
    clearSession();
    return null;
  }

  state.playerId = data.player_id;
  state.name = data.name;
  state.token = s.token;
  state.data = data.data || {};
  return data;
}

async function saveProgress() {
  if (!state.playerId || !state.token) return;
  await rpc('save_data', {
    p_player_id: state.playerId,
    p_hash: state.token,
    p_data: state.data
  });
}