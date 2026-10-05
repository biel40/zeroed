import { hasBetaAccess } from './access.js';

if (!hasBetaAccess()) {
  location.replace(`./index.html${location.search}`);
} else {
  const scenes = [...document.querySelectorAll('[data-scene]')];
  const tracks = [...document.querySelectorAll('.tracks span')];
  const next = document.getElementById('next');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const SCENE_DURATION_MS = 10000;
  // Matches the curtain-fall animation in welcome.css.
  const EXIT_FADE_MS = 600;
  let current = 0;
  let timer;

  function enterGame() {
    clearTimeout(timer);
    if (document.body.classList.contains('leaving')) return;
    document.body.classList.add('leaving');
    setTimeout(() => location.replace(`/${location.search}`), motion.matches ? 0 : EXIT_FADE_MS);
  }

  function schedule() {
    clearTimeout(timer);
    if (!motion.matches && !document.hidden && current < scenes.length - 1) {
      timer = setTimeout(() => showScene(current + 1), SCENE_DURATION_MS);
    }
  }

  function showScene(index) {
    current = index;
    document.querySelector('main').scrollTop = 0;
    scenes.forEach((scene, i) => { scene.hidden = i !== current; });
    tracks.forEach((track, i) => track.classList.toggle('active', i <= current));
    document.getElementById('step').textContent = `${current + 1} / ${scenes.length}`;
    next.textContent = current === scenes.length - 1 ? 'Jugar' : 'Siguiente';
    schedule();
  }

  next.addEventListener('click', () => current < scenes.length - 1 ? showScene(current + 1) : enterGame());
  document.getElementById('skip').addEventListener('click', enterGame);
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', schedule);
  window.addEventListener('pagehide', () => clearTimeout(timer), { once: true });

  document.getElementById('share').addEventListener('click', async () => {
    const status = document.getElementById('share-status');
    const url = 'https://zeroed.es';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Zeroed', text: 'Estoy probando la beta cerrada de Zeroed. Apoya este proyecto y sigue su evolucion.', url });
      } else {
        await navigator.clipboard.writeText(url);
        status.textContent = 'Enlace copiado. Gracias por compartir Zeroed.';
      }
    } catch (error) {
      if (error.name !== 'AbortError') status.textContent = `Puedes compartir este enlace: ${url}`;
    }
  });
  showScene(0);
}
