const CONFIG = {
  maxEnergy: 10,
  energyRegenMs: 60 * 1000,
  dailyQuestions: 5,
  duelQuestions: 5,
  timePerQuestion: 15,
  streakBonus: 0.1,
  xpPerCorrect: 20,
  pointsPerCorrect: 10,
  cardChanceOnImperfect: 0.3,
  cardChanceOnPerfect: 2,
  ratingWinBonus: 3,
  searchMinSeconds: 5,
  searchTimeoutMs: 20000
};

const state = {
  playerId: null,
  name: null,
  token: null,
  data: null,
  screen: 'auth',           // auth | home | quiz | result | collection | searching | duel | duelResult | leaderboard
  quiz: null,
  quizResult: null,
  duel: null,
  duelResult: null,
  leaderboard: null,
  opponentProfile: null,
  toast: null,
  searching: null,           // { startedAt, canCancel, cancelled }
  searchTimer: null
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

// ---------- TOAST (без двойного ререндера) ----------
let _toastTimer = null;
function toast(msg, kind = 'info') {
  state.toast = { msg, kind, ts: Date.now() };
  render(true);

  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    state.toast = null;
    render(true);
  }, 2200);
}