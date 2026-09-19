const app = document.getElementById('app');

// ============================================================
// ЗАЩИТА ОТ ЧАСТОГО РЕРЕНДЕРА
// ============================================================
let _lastRenderScreen = null;
let _lastRenderTs = 0;
let _renderLock = false;

function render(force = false) {
  // Блокируем рекурсивные вызовы внутри одного кадра
  if (_renderLock) return;
  _renderLock = true;
  try {
    const now = Date.now();
    const sameScreen = _lastRenderScreen === state.screen;

    // Не рендерим тот же экран чаще, чем раз в 300 мс
    if (sameScreen && !force && now - _lastRenderTs < 300) {
      return;
    }
    _lastRenderScreen = state.screen;
    _lastRenderTs = now;

    if (!state.data && state.screen !== 'auth') {
      state.screen = 'auth';
    }
    if (state.data) {
      ensureGameData();
      regenEnergy();
    }

    switch (state.screen) {
      case 'auth':        return renderAuth();
      case 'home':        return renderHome();
      case 'quiz':        return renderQuiz();
      case 'result':      return renderResult();
      case 'collection':  return renderCollection();
      case 'searching':   return renderSearching();
      case 'duel':        return renderDuel();
      case 'duelResult':  return renderDuelResult();
      case 'leaderboard': return renderLeaderboard();
    }
  } finally {
    _renderLock = false;
  }
}

// ---------- HEADER ----------
function renderHeader() {
  if (!state.data) return '';
  const d = state.data;
  const xpNeeded = d.level * 100;
  const xpPct = Math.min(100, (d.xp / xpNeeded) * 100);
  const cardsCount = d.cards && typeof d.cards === 'object'
    ? Object.keys(d.cards).length
    : 0;
  const offlineBadge = OFFLINE_MODE
    ? `<span style="font-size:9px;color:var(--gold);background:rgba(251,191,36,.15);
                    padding:2px 6px;border-radius:6px;margin-left:6px;font-weight:700">ОФЛАЙН</span>`
    : '';
  return `
    <header>
      <div>
        <div class="logo">Манга<span>Квест</span>${offlineBadge}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">
          ${escapeHtml(state.name || '')} · lvl ${d.level} · 🏆 ${d.rating || 0}
        </div>
        <div class="progress-bar" style="width:120px"><div style="width:${xpPct}%"></div></div>
      </div>
      <div class="stats">
        <div class="stat"><b id="hdr-energy">${d.energy}/${CONFIG.maxEnergy}</b><small>энергия</small></div>
        <div class="stat"><b id="hdr-points">${d.points}</b><small>очки</small></div>
        <div class="stat"><b id="hdr-cards">${cardsCount}</b><small>карт</small></div>
      </div>
    </header>
  `;
}

function renderToast() {
  if (!state.toast) return '';
  const color = state.toast.kind === 'bad' ? 'var(--bad)'
              : state.toast.kind === 'good' ? 'var(--good)'
              : 'var(--accent)';
  return `<div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
           background:var(--card);padding:10px 20px;border-radius:12px;
           border:1px solid ${color};color:${color};font-weight:700;z-index:100;
           animation:pop .3s ease">${escapeHtml(state.toast.msg)}</div>`;
}

// ---------- AUTH ----------
function renderAuth() {
  const isLogin = state._authMode === 'login';
  app.innerHTML = `
    <header>
      <div class="logo">Манга<span>Квест</span></div>
    </header>
    <div class="panel fade-in">
      <div class="section-title">${isLogin ? 'Вход' : 'Регистрация'}</div>
      <form id="auth-form" onsubmit="event.preventDefault(); doAuth();" autocomplete="on">
        <input id="auth-name" name="username" placeholder="Имя" autocomplete="username" required
               style="width:100%;padding:12px;background:var(--card);border:1px solid #3a3654;
                      color:var(--text);border-radius:10px;margin-bottom:10px;font-family:inherit">
        <input id="auth-pass" name="password" type="password" placeholder="Пароль"
               autocomplete="${isLogin ? 'current-password' : 'new-password'}" required minlength="4"
               style="width:100%;padding:12px;background:var(--card);border:1px solid #3a3654;
                      color:var(--text);border-radius:10px;margin-bottom:14px;font-family:inherit">
        <button type="submit" class="btn">${isLogin ? 'Войти' : 'Создать аккаунт'}</button>
      </form>
      <button class="btn secondary" style="margin-top:8px" onclick="toggleAuthMode()">
        ${isLogin ? 'Нет аккаунта? Регистрация' : 'Есть аккаунт? Войти'}
      </button>
    </div>
    ${renderToast()}
  `;
}

function toggleAuthMode() {
  state._authMode = state._authMode === 'login' ? 'register' : 'login';
  render(true);
}

async function doAuth() {
  const name = document.getElementById('auth-name').value.trim();
  const pass = document.getElementById('auth-pass').value;
  if (!name || pass.length < 4) return toast('Имя и пароль (4+ символа)', 'bad');

  const isLogin = state._authMode === 'login';
  const res = isLogin ? await login(name, pass) : await register(name, pass);

  if (!res || !res.ok) {
    const errs = {
      name_taken: 'Имя занято', no_user: 'Нет такого игрока',
      bad_pass: 'Неверный пароль', network: 'Ошибка сети'
    };
    return toast(errs[res?.error] || 'Ошибка', 'bad');
  }

  ensureGameData();
  state.screen = 'home';
  saveGame();
  render(true);
  toast('Добро пожаловать!', 'good');
}

function renderTabs() {
  const tabs = [
    ['home', '🏠 Главная'],
    ['collection', '🎴 Коллекция'],
    ['leaderboard', '🏆 Топ']
  ];
  return `<div class="tabs">${tabs.map(([id, label]) =>
    `<button class="tab ${state.screen === id ? 'active' : ''}" onclick="go('${id}')">${label}</button>`
  ).join('')}</div>`;
}

// ---------- HOME ----------
function renderHome() {
  const d = state.data;
  const canPlay = d.energy >= 1;
  const streakHtml = d.streak > 0 ? `<div class="streak">🔥 Стрик: ${d.streak} дн.</div>` : '';
  const seconds = Math.ceil((CONFIG.energyRegenMs - (Date.now() - d.lastEnergyAt)) / 1000);

  app.innerHTML = `
    ${renderHeader()}
    ${renderTabs()}
    <div class="panel fade-in">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div class="section-title" style="margin:0">Играть</div>
        ${streakHtml}
      </div>
      <div class="question">📖 Ежедневная глава</div>
      <div class="question-sub">${CONFIG.dailyQuestions} вопросов · ${CONFIG.timePerQuestion} сек · +карта за идеал</div>
      <button class="btn" onclick="startQuiz()" ${canPlay ? '' : 'disabled'}>
        ${canPlayDaily() ? 'Начать главу' : 'Повторить главу'}
      </button>
    </div>

    <div class="panel fade-in">
      <div class="section-title">⚔️ PvP Дуэль</div>
      <div class="question-sub">5 вопросов · Elo-рейтинг · соперник подбирается по силе</div>
      <button class="btn secondary" onclick="startDuel()" ${canPlay ? '' : 'disabled'}>
        Найти соперника
      </button>
    </div>

    <div class="panel fade-in">
      <div class="section-title">Статистика</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">
        <div><b style="font-size:22px;color:var(--accent)">${d.totalCorrect}</b><div style="font-size:11px;color:var(--muted)">верных</div></div>
        <div><b style="font-size:22px;color:var(--accent)">${d.totalDuels || 0}</b><div style="font-size:11px;color:var(--muted)">дуэлей</div></div>
        <div><b style="font-size:22px;color:var(--accent)">${d.rating || 0}</b><div style="font-size:11px;color:var(--muted)">рейтинг</div></div>
      </div>
    </div>

    <div class="panel fade-in" style="text-align:center">
      <button class="btn secondary" onclick="logout()">Выйти</button>
    </div>

    ${renderToast()}
  `;
}

function logout() {
  clearSession();
  clearGame();
  stopSearchTimer();
  state.playerId = null; state.token = null; state.name = null; state.data = null;
  state.searching = null;
  state.screen = 'auth';
  render(true);
}

// ---------- SEARCHING ----------
function renderSearching() {
  const s = state.searching;
  if (!s) return go('home');

  const elapsed = Math.floor((Date.now() - s.startedAt) / 1000);
  const dots = '.'.repeat((elapsed % 3) + 1);
  const remaining = Math.max(0, CONFIG.searchMinSeconds - elapsed);

  app.innerHTML = `
    ${renderHeader()}
    <div class="panel fade-in" style="text-align:center;padding:40px 20px">
      <div class="search-spinner"></div>
      <h2 style="margin:20px 0 8px;font-size:22px">Поиск соперника${dots}</h2>
      <p style="color:var(--muted);font-size:14px;margin-bottom:24px">
        Ищем игрока с похожим рейтингом
      </p>

      <div style="display:flex;justify-content:center;gap:24px;margin-bottom:28px">
        <div>
          <b id="search-elapsed" style="font-size:22px;color:var(--accent)">${elapsed}с</b>
          <div style="font-size:11px;color:var(--muted)">прошло</div>
        </div>
        <div>
          <b style="font-size:22px;color:var(--accent)">${state.data.rating || 0}</b>
          <div style="font-size:11px;color:var(--muted)">твой рейтинг</div>
        </div>
      </div>

      <div id="search-actions">
        ${s.canCancel ? `
          <button class="btn secondary" onclick="cancelSearch()">
            ❌ Отменить поиск
          </button>
          <p style="color:var(--muted);font-size:12px;margin-top:12px">
            Энергия не будет списана
          </p>
        ` : `
          <p style="color:var(--muted);font-size:12px">
            Кнопка отмены появится через <span id="search-remaining">${remaining}</span>с
          </p>
        `}
      </div>
    </div>
  `;
}

// ---------- QUIZ ----------
function renderQuiz() {
  const q = state.quiz;
  if (!q) return go('home');
  const current = q.questions[q.index];

  app.innerHTML = `
    ${renderHeader()}
    <div class="panel fade-in">
      <div class="hud">
        <div class="qnum">Вопрос ${q.index + 1} / ${q.questions.length}</div>
        <div class="timer" id="timer">${q.timeLeft}</div>
      </div>
      <div class="question">${escapeHtml(current.text)}</div>
      <div class="question-sub">Выбери правильный ответ</div>
      <div class="answers" id="answers">
        ${current.options.map(opt =>
          `<button class="answer" data-answer="${escapeHtml(opt)}"
                   onclick="selectAnswer('${escapeHtml(opt).replace(/'/g, "\\'")}')">
             ${escapeHtml(opt)}
           </button>`
        ).join('')}
      </div>
    </div>
  `;
}

// ---------- RESULT ----------
function renderResult() {
  const r = state.quizResult;
  const pct = Math.round((r.correct / r.total) * 100);
  let emoji = '😐', title = 'Неплохо';
  if (pct === 100) { emoji = '🏆'; title = 'Идеально!'; }
  else if (pct >= 80) { emoji = '🎉'; title = 'Отлично!'; }
  else if (pct >= 60) { emoji = '👍'; title = 'Хорошо!'; }
  else if (pct >= 40) { emoji = '📖'; title = 'Есть куда расти'; }
  else { emoji = '💤'; title = 'Попробуй ещё'; }

  app.innerHTML = `
    ${renderHeader()}
    <div class="panel result fade-in">
      <div class="big">${emoji}</div>
      <h2>${title}</h2>
      <div class="result-stats">
        <div><b>${r.correct}/${r.total}</b><small>верных</small></div>
        <div><b>${pct}%</b><small>точность</small></div>
      </div>
      ${r.rewards.length ? `
        <div class="section-title">Получены карты</div>
        <div>${r.rewards.map(c => `
          <div class="card-reward card ${c.rarity}" style="width:90px;height:120px;
               display:inline-flex;flex-direction:column;justify-content:space-between;
               padding:8px;border-radius:10px">
            <div class="emoji" style="font-size:32px">${c.emoji}</div>
            <div class="name" style="font-size:10px">${escapeHtml(c.name)}</div>
          </div>`).join('')}</div>
      ` : ''}
      <button class="btn" style="margin-top:20px" onclick="go('home')">На главную</button>
    </div>
  `;
}

// ---------- COLLECTION ----------
function renderCollection() {
  const cardsObj = (state.data && state.data.cards && typeof state.data.cards === 'object')
    ? state.data.cards
    : {};
  const cards = Object.values(cardsObj)
    .sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);

  app.innerHTML = `
    ${renderHeader()}
    ${renderTabs()}
    <div class="panel fade-in">
      <div class="section-title">Коллекция · ${cards.length} карт</div>
      ${cards.length ? `
        <div class="cards-grid">
          ${cards.map(c => `
            <div class="card ${c.rarity}">
              <div class="lvl">${c.count > 1 ? '×' + c.count : 'lvl ' + c.lvl}</div>
              <div class="emoji">${c.emoji}</div>
              <div class="name">${escapeHtml(c.name)}</div>
            </div>`).join('')}
        </div>
      ` : `<div class="empty">Сыграй главу или дуэль, чтобы получить карты!</div>`}
    </div>
  `;
}

// ---------- DUEL ----------
function renderDuel() {
  const d = state.duel;
  if (!d) return go('home');
  const current = d.questions[d.index];
  app.innerHTML = `
    ${renderHeader()}
    <div class="panel fade-in">
      <div style="display:flex;justify-content:space-between;margin-bottom:14px;
                  font-size:13px;color:var(--muted)">
        <div>⚔️ Против: <b style="color:var(--accent)">${escapeHtml(d.opponent_name)}</b></div>
        <div>🏆 ${d.opponent_rating}</div>
      </div>
      <div class="hud">
        <div class="qnum">Вопрос ${d.index + 1} / ${d.questions.length}</div>
        <div class="timer" id="timer">${d.timeLeft}</div>
      </div>
      <div class="question">${escapeHtml(current.text)}</div>
      <div class="answers" id="answers">
        ${current.options.map(opt =>
          `<button class="answer" data-answer="${escapeHtml(opt)}"
                   onclick="selectDuelAnswer('${escapeHtml(opt).replace(/'/g, "\\'")}')">
             ${escapeHtml(opt)}
           </button>`).join('')}
      </div>
    </div>
  `;
}

// ---------- DUEL RESULT ----------
function renderDuelResult() {
  const r = state.duelResult;
  const won = r.winner === state.playerId;
  const draw = r.winner === null || r.winner === undefined;
  const emoji = won ? '🏆' : draw ? '🤝' : '💀';
  const title = won ? 'Победа!' : draw ? 'Ничья' : 'Поражение';

  app.innerHTML = `
    ${renderHeader()}
    <div class="panel result fade-in">
      <div class="big">${emoji}</div>
      <h2>${title}</h2>
      <p>Против ${escapeHtml(r.opponent_name)}</p>
      <div class="result-stats">
        <div><b>${r.score}/${r.total}</b><small>твои</small></div>
        <div><b>${r.delta >= 0 ? '+' : ''}${r.delta}</b><small>рейтинг</small></div>
        <div><b>${r.my_new_rating}</b><small>итого</small></div>
      </div>
      <button class="btn" style="margin-top:20px" onclick="go('home')">На главную</button>
    </div>
  `;
}

// ---------- LEADERBOARD ----------
async function renderLeaderboard() {
  app.innerHTML = `
    ${renderHeader()}
    ${renderTabs()}
    <div class="panel fade-in">
      <div class="section-title">🏆 Топ игроков</div>
      <div class="empty">Загрузка…</div>
    </div>
  `;

  const list = await rpcLeaderboard(100);

  if (!list.length) {
    app.innerHTML = `
      ${renderHeader()}
      ${renderTabs()}
      <div class="panel fade-in">
        <div class="section-title">🏆 Топ игроков</div>
        <div class="empty">Пока никто не играл</div>
      </div>
    `;
    return;
  }

  app.innerHTML = `
    ${renderHeader()}
    ${renderTabs()}
    <div class="panel fade-in">
      <div class="section-title">🏆 Топ игроков · ${list.length}</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${list.map((p, i) => {
          const isMe = p.player_id === state.playerId;
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
          return `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;
                        background:${isMe ? 'rgba(255,107,157,.1)' : 'var(--card)'};
                        border:1px solid ${isMe ? 'var(--accent)' : 'transparent'};
                        border-radius:10px">
              <div style="min-width:36px;font-weight:800;color:var(--muted)">${medal}</div>
              <div style="flex:1">
                <div style="font-weight:700">${escapeHtml(p.name)}${isMe ? ' (ты)' : ''}</div>
                <div style="font-size:11px;color:var(--muted)">
                  lvl ${p.level} · 🎴 ${p.cards_count} · ${p.wins}W / ${p.losses}L
                </div>
              </div>
              <div style="font-weight:800;color:var(--accent)">${p.rating}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ---------- NAV ----------
function go(screen) {
  stopQuizTimer();
  stopDuelTimer();
  if (screen !== 'searching') {
    stopSearchTimer();
    if (state.searching) {
      state.searching.cancelled = true;
      state.searching = null;
    }
  }
  state.screen = screen;
  render(true);
}
