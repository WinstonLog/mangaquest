function defaultData() {
  return {
    level: 1, xp: 0, points: 0,
    streak: 0, lastDailyAt: 0,
    energy: CONFIG.maxEnergy, lastEnergyAt: Date.now(),
    cards: {},
    totalCorrect: 0, totalAnswered: 0, totalQuizzes: 0,
    totalDuels: 0, duelsWon: 0,
    rating: 0
  };
}

function ensureGameData() {
  const d = defaultData();
  if (!state.data || typeof state.data !== 'object') {
    state.data = d;
    return state.data;
  }
  for (const k in d) {
    if (!(k in state.data) || state.data[k] === null || state.data[k] === undefined) {
      state.data[k] = d[k];
    }
  }
  if (typeof state.data.cards !== 'object' || state.data.cards === null) {
    state.data.cards = {};
  }
  return state.data;
}

function regenEnergy() {
  const now = Date.now();
  const elapsed = now - state.data.lastEnergyAt;
  const gained = Math.floor(elapsed / CONFIG.energyRegenMs);
  if (gained > 0) {
    const before = state.data.energy;
    state.data.energy = Math.min(CONFIG.maxEnergy, state.data.energy + gained);
    state.data.lastEnergyAt += gained * CONFIG.energyRegenMs;
    return state.data.energy - before;
  }
  return 0;
}

function grantXp(amount) {
  state.data.xp += amount;
  while (state.data.xp >= state.data.level * 100) {
    state.data.xp -= state.data.level * 100;
    state.data.level++;
  }
}

function rollRarity() {
  const r = Math.random();
  if (r < 0.05) return 'legendary';
  if (r < 0.20) return 'epic';
  if (r < 0.50) return 'rare';
  return 'common';
}

function grantRandomCard() {
  const rarity = rollRarity();
  const base = CARD_POOL[Math.floor(Math.random() * CARD_POOL.length)];
  const id = base.name + '_' + rarity;
  if (!state.data.cards[id]) {
    state.data.cards[id] = { ...base, rarity, lvl: 1, count: 1 };
  } else {
    state.data.cards[id].count++;
  }
  return state.data.cards[id];
}

function canPlayDaily() {
  return state.data.lastDailyAt !== todayKey();
}

function buildQuiz() {
  const qs = shuffle(QUESTIONS_DB).slice(0, CONFIG.dailyQuestions);
  return qs.map(q => ({
    text: q.text,
    correct: q.answers[0],
    options: shuffle(q.answers)
  }));
}

let quizTimer = null;

function startQuiz() {
  if (state.data.energy < 1) return;
  state.data.energy--;
  state.quiz = {
    questions: buildQuiz(),
    index: 0, correct: 0, answered: false,
    timeLeft: CONFIG.timePerQuestion
  };
  state.screen = 'quiz';
  render();
  startQuizTimer();
}

function startQuizTimer() {
  stopQuizTimer();
  quizTimer = setInterval(() => {
    if (!state.quiz || state.quiz.answered) return;
    state.quiz.timeLeft--;
    if (state.quiz.timeLeft <= 0) selectAnswer(null, true);
    else {
      const el = document.getElementById('timer');
      if (el) el.textContent = state.quiz.timeLeft;
    }
  }, 1000);
}

function stopQuizTimer() {
  clearInterval(quizTimer);
  quizTimer = null;
}

function selectAnswer(answer, timeout = false) {
  const q = state.quiz;
  if (!q || q.answered) return;
  q.answered = true;
  stopQuizTimer();

  const current = q.questions[q.index];
  const isCorrect = !timeout && answer === current.correct;

  state.data.totalAnswered++;
  if (isCorrect) {
    state.data.totalCorrect++;
    q.correct++;
    const bonus = 1 + (state.data.streak * CONFIG.streakBonus);
    state.data.points += Math.round(CONFIG.pointsPerCorrect * bonus);
    grantXp(CONFIG.xpPerCorrect);
  }

  document.querySelectorAll('.answer').forEach(btn => {
    btn.classList.add('disabled');
    const text = btn.dataset.answer;
    if (text === current.correct) btn.classList.add('correct');
    else if (text === answer && !isCorrect) btn.classList.add('wrong');
  });

  setTimeout(() => {
    q.index++;
    if (q.index >= q.questions.length) finishQuiz();
    else {
      q.answered = false;
      q.timeLeft = CONFIG.timePerQuestion;
      render();
      startQuizTimer();
    }
  }, 1400);
}

function finishQuiz() {
  stopQuizTimer();
  const q = state.quiz;
  state.data.totalQuizzes++;

  const isPerfect = q.correct === q.questions.length;

  if (canPlayDaily()) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    state.data.streak = state.data.lastDailyAt === yesterday ? state.data.streak + 1 : 1;
    state.data.lastDailyAt = todayKey();
  }

  const rewards = [];
  if (isPerfect) {
    for (let i = 0; i < CONFIG.cardChanceOnPerfect; i++) rewards.push(grantRandomCard());
  } else if (Math.random() < CONFIG.cardChanceOnImperfect) {
    rewards.push(grantRandomCard());
  }

  state.quizResult = { correct: q.correct, total: q.questions.length, rewards };
  state.screen = 'result';
  saveGame();
  render();
}