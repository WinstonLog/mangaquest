async function init() {
  state._authMode = 'register';

  console.log('Проверка Supabase…');
  const alive = await checkSupabaseAlive();
  if (!alive) {
    OFFLINE_MODE = true;
    console.warn('⚠️ Supabase недоступен — офлайн-режим');
  } else {
    console.log('✅ Supabase доступен');
  }

  const session = await autoLogin();
  if (session) {
    state.data = session.data || defaultData();
    ensureGameData();
    if (!OFFLINE_MODE) {
      await syncFromServer();
      ensureGameData();
    }
    state.screen = 'home';
  } else {
    state.data = loadGame() || defaultData();
    ensureGameData();
    state.screen = 'auth';
  }

  Object.assign(window, {
    go,
    startQuiz,
    selectAnswer,
    logout,
    doAuth,
    toggleAuthMode,
    startDuel,
    selectDuelAnswer,
    cancelSearch
  });

  setupAutoSave();
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}