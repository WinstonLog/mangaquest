// ============================================================
// SUPABASE КЛИЕНТ + ОФЛАЙН-РЕЖИМ
// ============================================================

const SUPABASE_URL = 'https://ybrlfjftfaoiwmimxzfo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlicmxmamZ0ZmFvaXdtaW14emZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzMDMzMzEsImV4cCI6MjEwNDg3OTMzMX0.Xvt1Lwiw2cMoHQQ7O4ZYf-puFUTmXYF714yJwcla4VU';

let sb = null;
let OFFLINE_MODE = false;

try {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
  });
} catch (e) {
  console.warn('Supabase init failed, switching to offline:', e);
  OFFLINE_MODE = true;
}

async function checkSupabaseAlive() {
  if (!sb) return false;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    // Используем POST с телом — вернёт 404/200 без красного 401
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/nonexistent_check`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: '{}',
      signal: controller.signal
    });
    clearTimeout(t);
    // 404 = RPC нет, но сервер жив. 200 = жив. 401 = тоже жив (просто anon не пустили)
    return res.status < 500;
  } catch {
    return false;
  }
}

async function rpc(name, params) {
  if (OFFLINE_MODE || !sb) {
    return offlineRpc(name, params);
  }
  try {
    const { data, error } = await sb.rpc(name, params);
    if (error) {
      console.warn(`RPC ${name} error:`, error.message);
      if (String(error.message).includes('fetch') ||
          String(error.message).includes('network')) {
        OFFLINE_MODE = true;
      }
      return { ok: false, error: 'network' };
    }
    return data;
  } catch (e) {
    console.warn(`RPC ${name} exception:`, e);
    OFFLINE_MODE = true;
    return { ok: false, error: 'network' };
  }
}

async function rpcLeaderboard(limit = 100) {
  if (OFFLINE_MODE || !sb) return offlineLeaderboard();
  try {
    const { data, error } = await sb.rpc('get_leaderboard', { p_limit: limit });
    if (error) return offlineLeaderboard();
    return data || [];
  } catch {
    return offlineLeaderboard();
  }
}

// ============================================================
// ОФЛАЙН-РЕАЛИЗАЦИЯ
// ============================================================

const OFFLINE_KEY = 'mq_offline_players';

function offlinePlayers() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '{}');
  } catch { return {}; }
}

function offlineSavePlayers(p) {
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(p));
}

function offlineRpc(name, params) {
  const players = offlinePlayers();

  switch (name) {
    case 'register_player': {
      if (players[params.p_name_lc]) {
        return { ok: false, error: 'name_taken' };
      }
      players[params.p_name_lc] = {
        player_id: params.p_player_id,
        name: params.p_name,
        name_lc: params.p_name_lc,
        hash: params.p_hash,
        salt: params.p_salt,
        data: {},
        rating: 0, wins: 0, losses: 0,
        created_at: Date.now()
      };
      offlineSavePlayers(players);
      return { ok: true, player_id: params.p_player_id, name: params.p_name, data: {} };
    }

    case 'get_salt': {
      const p = players[params.p_name_lc];
      return p ? p.salt : null;
    }

    case 'login_player': {
      const p = players[params.p_name_lc];
      if (!p) return { ok: false, error: 'no_user' };
      if (p.hash !== params.p_hash) return { ok: false, error: 'bad_pass' };
      return { ok: true, player_id: p.player_id, name: p.name, data: p.data };
    }

    case 'validate_session': {
      const p = Object.values(players).find(x => x.player_id === params.p_player_id);
      if (!p || p.hash !== params.p_hash) return { ok: false, error: 'invalid' };
      return { ok: true, player_id: p.player_id, name: p.name, data: p.data };
    }

    case 'save_data': {
      const p = Object.values(players).find(x => x.player_id === params.p_player_id);
      if (!p || p.hash !== params.p_hash) return { ok: false, error: 'invalid' };
      p.data = params.p_data;
      p.rating = params.p_data.rating || 0;
      offlineSavePlayers(players);
      return { ok: true };
    }

    case 'find_opponent':
      return offlineFindOpponent(params);

    case 'submit_duel':
      return offlineSubmitDuel(params);

    default:
      return { ok: false, error: 'unknown_rpc' };
  }
}

const BOT_NAMES = [
  'Отаку-сан', 'Сенпай', 'Кайдзю', 'Сакура-тян', 'Наруто-кун',
  'Леви-хейт', 'Годзё-сама', 'Танджиро', 'Мадара', 'Дэндзи',
  'Ичиго', 'Луффи', 'Зоро', 'Эрен', 'Микаса'
];

function offlineFindOpponent(params) {
  const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const botId = 'bot_' + Math.random().toString(36).slice(2, 8);
  const playerRating = params.p_rating || 0;
  const botRating = Math.max(0, playerRating + Math.floor((Math.random() - 0.5) * 400));

  return {
    ok: true,
    opponent_id: botId,
    opponent_name: botName + ' 🤖',
    opponent_rating: botRating,
    opponent_data: { is_bot: true }
  };
}

function offlineSubmitDuel(params) {
  const score = params.p_score;
  const players = offlinePlayers();
  const me = Object.values(players).find(x => x.player_id === params.p_player_id);

  let winner;
  if (score >= 4) winner = params.p_player_id;
  else if (score <= 1) winner = params.p_opponent_id;
  else winner = Math.random() < 0.6 ? params.p_player_id : params.p_opponent_id;

  const delta = winner === params.p_player_id
    ? Math.floor(Math.random() * 15) + 10
    : -(Math.floor(Math.random() * 15) + 5);

  const newRating = Math.max(0, (me?.rating || 0) + delta);

  if (me) {
    me.rating = newRating;
    me.wins = (me.wins || 0) + (winner === params.p_player_id ? 1 : 0);
    me.losses = (me.losses || 0) + (winner !== params.p_player_id ? 1 : 0);
    offlineSavePlayers(players);
  }

  return {
    ok: true,
    winner,
    my_new_rating: newRating,
    opp_new_rating: 0,
    delta
  };
}

function offlineLeaderboard() {
  const players = Object.values(offlinePlayers())
    .filter(p => !p.player_id.startsWith('bot_'))
    .map(p => ({
      player_id: p.player_id,
      name: p.name,
      rating: p.rating || 0,
      wins: p.wins || 0,
      losses: p.losses || 0,
      level: (p.data && p.data.level) || 1,
      cards_count: Object.keys((p.data && p.data.cards) || {}).length
    }))
    .sort((a, b) => b.rating - a.rating);

  const bots = BOT_NAMES.slice(0, 5).map((n, i) => ({
    player_id: 'bot_' + i,
    name: n + ' 🤖',
    rating: 800 - i * 80,
    wins: 20 - i * 2,
    losses: 5 + i,
    level: 10 - i,
    cards_count: 30 - i * 3
  }));

  return [...players, ...bots].sort((a, b) => b.rating - a.rating);
}