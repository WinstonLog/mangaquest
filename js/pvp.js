// ============================================================
// ПОИСК СОПЕРНИКА + PvP ДУЭЛИ
// ============================================================

async function startDuel() {
  if (state.data.energy < 1) return toast('Нет энергии', 'bad');

  state.searching = {
    startedAt: Date.now(),
    canCancel: false,
    cancelled: false
  };
  state.screen = 'searching';
  render();

  startSearchTimer();

  try {
    await doFindOpponent();
  } catch (e) {
    console.warn('find_opponent error:', e);
  }
}

function startSearchTimer() {
  stopSearchTimer();
  state.searchTimer = setInterval(() => {
    const s = state.searching;
    if (!s) return stopSearchTimer();

    const elapsed = (Date.now() - s.startedAt) / 1000;

    // Проверяем таймаут
    if (elapsed >= CONFIG.searchTimeoutMs / 1000) {
      stopSearchTimer();
      if (!s.cancelled) {
        if (OFFLINE_MODE) {
          finalizeOpponent(offlineFindOpponent({ p_rating: state.data.rating || 0 }));
        } else {
          toast('Соперник не найден. Попробуй позже', 'bad');
          state.searching = null;
          go('home');
        }
      }
      return;
    }

    if (state.screen !== 'searching') return;

    // Обновляем ТОЛЬКО DOM, не перерисовываем весь экран
    const elapsedEl = document.getElementById('search-elapsed');
    if (elapsedEl) elapsedEl.textContent = Math.floor(elapsed) + 'с';

    const remainingEl = document.getElementById('search-remaining');
    if (remainingEl) {
      const remaining = Math.max(0, CONFIG.searchMinSeconds - Math.floor(elapsed));
      remainingEl.textContent = remaining;
    }

    // Кнопка отмены — перерисовываем один раз, когда пора
    if (!s.canCancel && elapsed >= CONFIG.searchMinSeconds) {
      s.canCancel = true;
      render(true);  // force, но это ровно один раз
    }
  }, 1000);
}

function stopSearchTimer() {
  if (state.searchTimer) {
    clearInterval(state.searchTimer);
    state.searchTimer = null;
  }
}

async function doFindOpponent() {
  const rating = state.data.rating || 0;
  const data = await rpc('find_opponent', {
    p_player_id: state.playerId,
    p_hash: state.token,
    p_rating: rating
  });

  if (!state.searching || state.searching.cancelled) return;

  if (!data || !data.ok) {
    if (data && data.error === 'no_opponent') {
      if (OFFLINE_MODE) {
        finalizeOpponent(offlineFindOpponent({ p_rating: rating }));
      } else {
        stopSearchTimer();
        toast('Соперник не найден. Попробуй позже', 'bad');
        state.searching = null;
        go('home');
      }
    } else {
      // сетевая ошибка — в офлайне даём бота, в онлайне — ошибка
      if (OFFLINE_MODE) {
        finalizeOpponent(offlineFindOpponent({ p_rating: rating }));
      } else {
        stopSearchTimer();
        toast('Ошибка сети', 'bad');
        state.searching = null;
        go('home');
      }
    }
    return;
  }

  finalizeOpponent(data);
}

function finalizeOpponent(found) {
  if (!state.searching || state.searching.cancelled) return;

  stopSearchTimer();
  state.data.energy--;

  state.opponentProfile = found;
  state.duel = {
    questions: buildDuelQuiz(),
    index: 0,
    correct: 0,
    answered: false,
    timeLeft: CONFIG.timePerQuestion,
    opponent_id: found.opponent_id,
    opponent_name: found.opponent_name,
    opponent_rating: found.opponent_rating
  };
  state.searching = null;
  state.screen = 'duel';
  saveGame();
  render();
  startDuelTimer();
}

function cancelSearch() {
  if (!state.searching) return;
  state.searching.cancelled = true;
  stopSearchTimer();
  state.searching = null;
  toast('Поиск отменён', 'info');
  go('home');
}

function buildDuelQuiz() {
  const seed = (state.opponentProfile?.opponent_id || '') + todayKey();
  const rng = mulberry32(hashCode(seed));
  const pool = [...QUESTIONS_DB];

  const chosen = [];
  const used = new Set();
  while (chosen.length < CONFIG.duelQuestions && used.size < pool.length) {
    const idx = Math.floor(rng() * pool.length);
    if (!used.has(idx)) {
      used.add(idx);
      chosen.push(pool[idx]);
    }
  }

  return chosen.map(q => ({
    text: q.text,
    correct: q.answers[0],
    options: shuffle(q.answers)
  }));
}

let duelTimer = null;

function startDuelTimer() {
  stopDuelTimer();
  duelTimer = setInterval(() => {
    if (!state.duel || state.duel.answered) return;
    state.duel.timeLeft--;
    if (state.duel.timeLeft <= 0) {
      selectDuelAnswer(null, true);
    } else {
      const el = document.getElementById('timer');
      if (el) el.textContent = state.duel.timeLeft;
    }
  }, 1000);
}

function stopDuelTimer() {
  clearInterval(duelTimer);
  duelTimer = null;
}

function selectDuelAnswer(answer, timeout = false) {
  const d = state.duel;
  if (!d || d.answered) return;
  d.answered = true;
  stopDuelTimer();

  const current = d.questions[d.index];
  const isCorrect = !timeout && answer === current.correct;
  if (isCorrect) d.correct++;

  document.querySelectorAll('.answer').forEach(btn => {
    btn.classList.add('disabled');
    const text = btn.dataset.answer;
    if (text === current.correct) btn.classList.add('correct');
    else if (text === answer && !isCorrect) btn.classList.add('wrong');
  });

  setTimeout(() => {
    d.index++;
    if (d.index >= d.questions.length) {
      finishDuel();
    } else {
      d.answered = false;
      d.timeLeft = CONFIG.timePerQuestion;
      render();
      startDuelTimer();
    }
  }, 1200);
}

async function finishDuel() {
  stopDuelTimer();
  const d = state.duel;
  const score = d.correct;

  const result = await rpc('submit_duel', {
    p_player_id: state.playerId,
    p_hash: state.token,
    p_opponent_id: d.opponent_id,
    p_score: score
  });

  if (!result || !result.ok) {
    toast('Не удалось отправить результат', 'bad');
  }

  if (result && result.ok) {
    state.data.rating = result.my_new_rating;
  }

  state.data.totalDuels = (state.data.totalDuels || 0) + 1;
  if (result && result.winner === state.playerId) {
    state.data.duelsWon = (state.data.duelsWon || 0) + 1;
  }

  state.duelResult = {
    score,
    total: d.questions.length,
    opponent_name: d.opponent_name,
    winner: result?.winner || null,
    delta: result?.delta || 0,
    my_new_rating: result?.my_new_rating || state.data.rating || 0
  };
  state.screen = 'duelResult';
  saveGame();
  render();
}

// ---------- Детерминированный PRNG ----------
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}