/**
 * COEDUCA Framework v1 - Core
 * Profesor José Eliseo Martínez - COEDUCA
 *
 * Maneja: login (NIE), PDF (con fix iOS), anti-copy, hooks de Rigo,
 *         pool A/B, score global, drag&drop con touch + auto-scroll,
 *         renderizado declarativo de ejercicios y juegos.
 *
 * Uso:
 *   COEDUCA.init({
 *     container: '#app',
 *     topic: 'Present Simple',
 *     level: 'Noveno',
 *     colors: { primary: '#FFD700', accent: '#8E44AD' },
 *     exercises: [...],
 *     game: { type: 'hangman', words: [...] }
 *   });
 */
(function (global) {
  'use strict';

  const STORAGE_KEY_PREFIX = 'coeduca_';
  const VERSION = '1.0.0';

  // =====================================================================
  // 1. STATE GLOBAL
  // =====================================================================
  const state = {
    config: null,
    student: null,        // { nie, name, grade }
    partner: null,        // { nie, name, grade } | null  (compatibilidad: primer compañero)
    partners: [],         // array de hasta 4 compañeros
    poolVersion: null,    // 'A' | 'B'
    answers: {},          // { exerciseId: { score, total, details } }
    extraPoints: 0,       // del juego final
    storageKey: '',
    appRoot: null,
    exerciseRegistry: {}, // tipos registrados por coeduca-exercises.js
    gameRegistry: {}      // tipos registrados por coeduca-games.js
  };

  // =====================================================================
  // 2. SANITIZADOR PARA PDF (Latin-1 only)
  // =====================================================================
  function sanitizeForPDF(text) {
    if (text === null || text === undefined) return '';
    let s = String(text);

    // 1) Strip HTML preservando texto
    s = s.replace(/<br\s*\/?>/gi, '\n')
         .replace(/<\/p>/gi, '\n')
         .replace(/<[^>]*>/g, '');

    // 2) Decodificar entidades HTML básicas
    s = s.replace(/&nbsp;/g, ' ')
         .replace(/&amp;/g, '&')
         .replace(/&lt;/g, '<')
         .replace(/&gt;/g, '>')
         .replace(/&quot;/g, '"')
         .replace(/&#39;/g, "'");

    // 3) Reemplazos seguros (flechas, comillas, dashes, ellipsis)
    const replacements = {
      '\u2192': '->', '\u2190': '<-', '\u2191': '^', '\u2193': 'v',
      '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201B': "'",
      '\u201C': '"', '\u201D': '"', '\u201E': '"', '\u201F': '"',
      '\u2013': '-',  '\u2014': '-', '\u2015': '-',
      '\u2026': '...',
      '\u00A0': ' ', '\u2009': ' ', '\u200A': ' ', '\u200B': '',
      '\u2022': '*', '\u00B7': '*',
      '\u2713': 'OK', '\u2714': 'OK', '\u2717': 'X', '\u2718': 'X',
      '\u00BF': '?', '\u00A1': '!'
    };
    s = s.replace(/[\u2013\u2014\u2015\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F\u2022\u00B7\u2026\u00A0\u2009\u200A\u200B\u2190\u2191\u2192\u2193\u2713\u2714\u2717\u2718\u00BF\u00A1]/g,
      ch => replacements[ch] || '');

    // 4) Eliminar emojis y todo char fuera de Latin-1 (0-255)
    s = s.split('').filter(ch => ch.charCodeAt(0) <= 255).join('');

    return s.trim();
  }

  // =====================================================================
  // 3. ANTI-COPY
  // =====================================================================
  function setupAntiCopy() {
    const block = e => { e.preventDefault(); return false; };
    ['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'dragstart']
      .forEach(evt => document.addEventListener(evt, block, { passive: false }));

    // Permitir copy/paste solo en inputs específicos del login
    document.addEventListener('copy', e => {
      const t = e.target;
      if (t && t.classList && t.classList.contains('coeduca-input-allow-copy')) return;
      e.preventDefault();
    }, true);
  }

  // =====================================================================
  // 4. NO TRANSLATE (refuerzo)
  // =====================================================================
  function ensureNoTranslate() {
    document.documentElement.setAttribute('translate', 'no');
    document.documentElement.lang = 'es';
    if (!document.querySelector('meta[name="google"]')) {
      const m = document.createElement('meta');
      m.name = 'google';
      m.content = 'notranslate';
      document.head.appendChild(m);
    }
    if (!document.querySelector('meta[http-equiv="Content-Language"]')) {
      const m = document.createElement('meta');
      m.setAttribute('http-equiv', 'Content-Language');
      m.content = 'es';
      document.head.appendChild(m);
    }
  }

  // =====================================================================
  // 5. POOL A/B SELECTOR (persistente)
  // =====================================================================
  function pickPoolVersion() {
    const key = state.storageKey + 'pool';
    let v = null;
    try { v = localStorage.getItem(key); } catch (e) {}
    if (v !== 'A' && v !== 'B') {
      v = Math.random() < 0.5 ? 'A' : 'B';
      try { localStorage.setItem(key, v); } catch (e) {}
    }
    state.poolVersion = v;
    return v;
  }

  function getPoolData(exercise) {
    if (exercise.dataA && exercise.dataB) {
      return state.poolVersion === 'A' ? exercise.dataA : exercise.dataB;
    }
    return exercise.data || exercise.dataA || exercise.dataB;
  }

  // =====================================================================
  // 6. STORAGE HELPERS
  // =====================================================================
  function saveState() {
    try {
      const snapshot = {
        student: state.student,
        partner: state.partner,
        partners: state.partners,
        poolVersion: state.poolVersion,
        answers: state.answers,
        extraPoints: state.extraPoints
      };
      localStorage.setItem(state.storageKey + 'state', JSON.stringify(snapshot));
    } catch (e) { /* silencioso */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(state.storageKey + 'state');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function recordAnswer(exerciseId, score, total, details) {
    state.answers[exerciseId] = { score, total, details: details || null };
    saveState();
    updateScoreDisplay();
  }

  function getTotalScore() {
    let earned = 0, total = 0;
    Object.values(state.answers).forEach(a => {
      earned += a.score;
      total += a.total;
    });
    if (total === 0) return { earned: 0, total: 0, grade: 0 };
    const baseGrade = (earned / total) * 10;
    return {
      earned, total,
      grade: Math.min(10, baseGrade + state.extraPoints).toFixed(1),
      baseGrade: baseGrade.toFixed(1)
    };
  }

  function updateScoreDisplay() {
    const badge = document.getElementById('coeduca-extra-badge');
    if (badge) {
      badge.textContent = '+' + state.extraPoints.toFixed(1) + ' pts extra';
      badge.style.display = state.extraPoints > 0 ? 'block' : 'none';
    }
    const finalDisplay = document.getElementById('coeduca-final-score-display');
    if (finalDisplay) {
      const s = getTotalScore();
      finalDisplay.innerHTML = `
        <h2>Tu puntaje</h2>
        <span class="score-number">${s.grade} / 10</span>
        <p>${s.earned} de ${s.total} respuestas correctas
        ${state.extraPoints > 0 ? '+ ' + state.extraPoints.toFixed(1) + ' puntos extra' : ''}</p>
      `;
    }
  }

  function addExtraPoints(pts) {
    state.extraPoints = Math.min(2, state.extraPoints + pts);
    saveState();
    updateScoreDisplay();
  }

  // =====================================================================
  // 7. LOGIN MODAL
  // =====================================================================
  function showLoginModal() {
    return new Promise((resolve) => {
      const MAX_PARTNERS = 4;

      // Llamar welcome de Rigo apenas exista y posicionarlo en esquina del modal
      const tryWelcome = () => {
        if (global.rigo && typeof global.rigo.welcome === 'function') {
          global.rigo.welcome();
          // Mover Rigo a la esquina superior izquierda mientras está el login
          try {
            const rigoEl = global.rigo;
            rigoEl.dataset.savedTop = rigoEl.style.top || '';
            rigoEl.dataset.savedLeft = rigoEl.style.left || '';
            rigoEl.dataset.savedRight = rigoEl.style.right || '';
            rigoEl.dataset.savedBottom = rigoEl.style.bottom || '';
            rigoEl.style.top = '20px';
            rigoEl.style.left = '20px';
            rigoEl.style.right = 'auto';
            rigoEl.style.bottom = 'auto';
            rigoEl.style.zIndex = '10000';
          } catch (e) {}
        } else {
          setTimeout(tryWelcome, 200);
        }
      };
      tryWelcome();

      const overlay = document.createElement('div');
      overlay.className = 'coeduca-login-overlay';
      overlay.innerHTML = `
        <div class="coeduca-login-modal">
          <div class="coeduca-login-header">
            <div class="coeduca-login-badge">COEDUCA</div>
            <h2>BIENVENIDO</h2>
            <p>Ingresa tu NIE para comenzar</p>
          </div>

          <div class="coeduca-login-modal-scroll">
            <div class="coeduca-login-field" data-role="main">
              <label><span class="coeduca-login-icon">1</span> NIE del estudiante</label>
              <input type="text" id="coeduca-nie-input" class="coeduca-input coeduca-input-allow-copy"
                     inputmode="numeric" autocomplete="off" placeholder="Ej. 12379">
              <div class="coeduca-login-info" id="coeduca-nie-info"></div>
              <div class="coeduca-login-error" id="coeduca-nie-error">NIE no encontrado</div>
            </div>

            <div id="coeduca-partners-list"></div>
          </div>

          <div class="coeduca-login-actions">
            <button class="coeduca-btn coeduca-btn-info" id="coeduca-add-partner-btn" type="button">
              + Compañero <span id="coeduca-partner-counter" style="font-size:11px;opacity:0.85;"></span>
            </button>
            <button class="coeduca-btn coeduca-btn-success" id="coeduca-login-submit" disabled type="button">
              Comenzar
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const nieInput = overlay.querySelector('#coeduca-nie-input');
      const nieInfo = overlay.querySelector('#coeduca-nie-info');
      const nieError = overlay.querySelector('#coeduca-nie-error');
      const partnersList = overlay.querySelector('#coeduca-partners-list');
      const addPartnerBtn = overlay.querySelector('#coeduca-add-partner-btn');
      const partnerCounter = overlay.querySelector('#coeduca-partner-counter');
      const submitBtn = overlay.querySelector('#coeduca-login-submit');

      let mainStudent = null;
      const partners = []; // [{ student, fieldEl, inputEl }]

      function lookupNIE(nie) {
        // STUDENTS puede estar como global (var) o lexical (const/let).
        let DB = null;
        try { DB = global.STUDENTS; } catch (e) {}
        if (!DB) { try { DB = STUDENTS; } catch (e) {} }
        if (!DB) return null;
        const clean = String(nie || '').trim();
        return clean && DB[clean] ? { nie: clean, ...DB[clean] } : null;
      }

      function updateCounter() {
        if (partners.length === 0) {
          partnerCounter.textContent = '';
        } else {
          partnerCounter.textContent = '(' + partners.length + '/' + MAX_PARTNERS + ')';
        }
        addPartnerBtn.disabled = partners.length >= MAX_PARTNERS;
        addPartnerBtn.style.opacity = partners.length >= MAX_PARTNERS ? '0.5' : '1';
      }

      function validateMain() {
        const found = lookupNIE(nieInput.value);
        if (found) {
          mainStudent = found;
          nieInfo.innerHTML = '<b>' + escapeHTML(found.name) + '</b><br><small>' + escapeHTML(found.grade) + '</small>';
          nieInfo.classList.add('show');
          nieError.classList.remove('show');
          if (global.rigo && global.rigo.setGrade) global.rigo.setGrade(found.grade);
          submitBtn.disabled = false;
        } else {
          mainStudent = null;
          nieInfo.classList.remove('show');
          if (nieInput.value.trim().length >= 4) nieError.classList.add('show');
          else nieError.classList.remove('show');
          submitBtn.disabled = true;
        }
      }

      function addPartnerField() {
        if (partners.length >= MAX_PARTNERS) return;
        const slot = { student: null };
        const num = partners.length + 2; // 2,3,4,5
        const field = document.createElement('div');
        field.className = 'coeduca-login-field coeduca-login-field-partner';
        field.innerHTML = `
          <label>
            <span class="coeduca-login-icon">${num}</span>
            NIE del compañero ${num - 1}
            <button type="button" class="coeduca-login-remove" title="Quitar">×</button>
          </label>
          <input type="text" class="coeduca-input coeduca-input-allow-copy coeduca-partner-input"
                 inputmode="numeric" autocomplete="off" placeholder="NIE del compañero">
          <div class="coeduca-login-info"></div>
          <div class="coeduca-login-error">NIE no encontrado</div>
        `;
        partnersList.appendChild(field);

        const inp = field.querySelector('input');
        const info = field.querySelector('.coeduca-login-info');
        const err = field.querySelector('.coeduca-login-error');
        const removeBtn = field.querySelector('.coeduca-login-remove');

        slot.fieldEl = field;
        slot.inputEl = inp;

        const validate = () => {
          const v = inp.value.trim();
          if (!v) {
            slot.student = null;
            info.classList.remove('show');
            err.classList.remove('show');
            return;
          }
          // Evitar duplicados
          if (mainStudent && mainStudent.nie === v) {
            slot.student = null;
            info.classList.remove('show');
            err.textContent = 'Ya está como estudiante principal';
            err.classList.add('show');
            return;
          }
          if (partners.some(p => p !== slot && p.student && p.student.nie === v)) {
            slot.student = null;
            info.classList.remove('show');
            err.textContent = 'NIE ya agregado';
            err.classList.add('show');
            return;
          }
          const found = lookupNIE(v);
          if (found) {
            slot.student = found;
            info.innerHTML = '<b>' + escapeHTML(found.name) + '</b><br><small>' + escapeHTML(found.grade) + '</small>';
            info.classList.add('show');
            err.classList.remove('show');
          } else {
            slot.student = null;
            info.classList.remove('show');
            if (v.length >= 4) {
              err.textContent = 'NIE no encontrado';
              err.classList.add('show');
            } else {
              err.classList.remove('show');
            }
          }
        };
        inp.addEventListener('input', validate);

        removeBtn.addEventListener('click', () => {
          const idx = partners.indexOf(slot);
          if (idx >= 0) partners.splice(idx, 1);
          field.style.transition = 'opacity 0.2s, transform 0.2s';
          field.style.opacity = '0';
          field.style.transform = 'translateX(20px)';
          setTimeout(() => {
            field.remove();
            renumberPartners();
            updateCounter();
          }, 200);
        });

        partners.push(slot);
        updateCounter();
        setTimeout(() => inp.focus(), 50);
      }

      function renumberPartners() {
        partners.forEach((p, i) => {
          const num = i + 2;
          const label = p.fieldEl.querySelector('label');
          // Reemplazar solo el texto del badge y el número de compañero
          label.innerHTML = `
            <span class="coeduca-login-icon">${num}</span>
            NIE del compañero ${num - 1}
            <button type="button" class="coeduca-login-remove" title="Quitar">×</button>
          `;
          // Reasignar listener al nuevo botón
          label.querySelector('.coeduca-login-remove').addEventListener('click', () => {
            const idx = partners.indexOf(p);
            if (idx >= 0) partners.splice(idx, 1);
            p.fieldEl.style.transition = 'opacity 0.2s';
            p.fieldEl.style.opacity = '0';
            setTimeout(() => { p.fieldEl.remove(); renumberPartners(); updateCounter(); }, 200);
          });
        });
      }

      nieInput.addEventListener('input', validateMain);
      addPartnerBtn.addEventListener('click', addPartnerField);

      const finish = () => {
        if (!mainStudent) return;
        state.student = mainStudent;
        // Solo guardamos compañeros válidos
        state.partners = partners.filter(p => p.student).map(p => p.student);
        // Compatibilidad: state.partner = el primero (si hay)
        state.partner = state.partners[0] || null;
        saveState();
        if (global.rigo && global.rigo.loginSuccess) {
          global.rigo.loginSuccess(mainStudent.name);
        }
        // Restaurar Rigo a su posición original tras el login
        try {
          const rigoEl = global.rigo;
          if (rigoEl && rigoEl.dataset.savedTop !== undefined) {
            rigoEl.style.top = rigoEl.dataset.savedTop;
            rigoEl.style.left = rigoEl.dataset.savedLeft;
            rigoEl.style.right = rigoEl.dataset.savedRight;
            rigoEl.style.bottom = rigoEl.dataset.savedBottom;
            // Si no había guardado nada, regresarlo al default (esquina inferior derecha)
            if (!rigoEl.style.top && !rigoEl.style.bottom) {
              rigoEl.style.top = 'auto';
              rigoEl.style.left = 'auto';
              rigoEl.style.right = '20px';
              rigoEl.style.bottom = '20px';
            }
            rigoEl.style.zIndex = '9999';
          }
        } catch (e) {}
        overlay.style.transition = 'opacity 0.3s';
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.remove();
          resolve();
        }, 300);
      };

      submitBtn.addEventListener('click', finish);
      nieInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !submitBtn.disabled) finish();
      });

      // Restaurar sesión si existe
      const prev = loadState();
      if (prev && prev.student) {
        nieInput.value = prev.student.nie;
        validateMain();
        // Restaurar compañeros (soporta state.partners[] nuevo o state.partner viejo)
        const prevPartners = prev.partners || (prev.partner ? [prev.partner] : []);
        prevPartners.forEach(p => {
          addPartnerField();
          const last = partners[partners.length - 1];
          if (last) {
            last.inputEl.value = p.nie;
            last.inputEl.dispatchEvent(new Event('input'));
          }
        });
      }

      updateCounter();
      setTimeout(() => nieInput.focus(), 400);
    });
  }

  // =====================================================================
  // 8. RENDER LAYOUT
  // =====================================================================
  function applyTheme(colors) {
    if (!colors) return;
    const root = document.documentElement;
    if (colors.primary) root.style.setProperty('--coeduca-primary', colors.primary);
    if (colors.accent) root.style.setProperty('--coeduca-accent', colors.accent);
    if (colors.bg) root.style.setProperty('--coeduca-bg', colors.bg);
  }

  function renderLayout() {
    const cfg = state.config;
    const containerSel = cfg.container || '#app';
    let appRoot = document.querySelector(containerSel);
    if (!appRoot) {
      appRoot = document.createElement('div');
      appRoot.id = 'app';
      document.body.appendChild(appRoot);
    }
    appRoot.className = 'coeduca-app';
    appRoot.innerHTML = `
      <div class="coeduca-extra-badge" id="coeduca-extra-badge" style="display:none">+0 pts extra</div>
      <header class="coeduca-header">
        <h1>${escapeHTML(cfg.topic || 'Ejercicio de Inglés')}</h1>
        <p>${escapeHTML(cfg.level || '')} - COEDUCA - Prof. José Eliseo Martínez</p>
      </header>
      <div id="coeduca-exercises"></div>
      <div id="coeduca-game-section"></div>
      <div class="coeduca-final-score" id="coeduca-final-score-display">
        <h2>Tu puntaje</h2>
        <span class="score-number">- / 10</span>
        <p>Completa los ejercicios</p>
      </div>
      <div class="coeduca-center">
        <button class="coeduca-btn coeduca-btn-accent" id="coeduca-pdf-btn">
          Descargar PDF para Classroom
        </button>
      </div>
    `;
    state.appRoot = appRoot;

    // Botón de PDF
    document.getElementById('coeduca-pdf-btn').addEventListener('click', generatePDF);

    // Renderizar ejercicios
    const container = document.getElementById('coeduca-exercises');
    let exerciseNumber = 0;
    (cfg.exercises || []).forEach((ex, idx) => {
      if (ex.type === 'note') {
        const note = document.createElement('div');
        note.className = 'coeduca-note';
        note.innerHTML = ex.html || '';
        container.appendChild(note);
        return;
      }
      exerciseNumber++;
      const wrap = document.createElement('div');
      wrap.className = 'coeduca-exercise';
      wrap.id = 'coeduca-ex-' + idx;
      const title = ex.title || ('Ejercicio ' + exerciseNumber);
      let inner = `<div class="coeduca-exercise-title">${escapeHTML(title)}</div>`;
      if (ex.instruction) {
        inner += `<div class="coeduca-exercise-instruction">${escapeHTML(ex.instruction)}</div>`;
      }
      if (ex.image) {
        inner += `<img src="${escapeAttr(ex.image)}" alt="" class="coeduca-exercise-image">`;
      }
      if (ex.audio) {
        inner += renderAudioPlayer(ex.audio, idx);
      }
      inner += `<div class="coeduca-exercise-body" id="coeduca-ex-body-${idx}"></div>`;
      wrap.innerHTML = inner;
      container.appendChild(wrap);

      // Delegar al renderer del tipo
      const renderer = state.exerciseRegistry[ex.type];
      if (renderer) {
        const body = document.getElementById('coeduca-ex-body-' + idx);
        try {
          renderer({
            container: body,
            exerciseId: 'ex_' + idx,
            data: getPoolData(ex),
            config: ex,
            recordAnswer: (score, total, details) => recordAnswer('ex_' + idx, score, total, details),
            cheer: () => global.rigo && global.rigo.cheer && global.rigo.cheer(),
            comfort: () => global.rigo && global.rigo.comfort && global.rigo.comfort()
          });
        } catch (err) {
          console.error('Error rendering exercise', ex.type, err);
          body.innerHTML = '<p style="color:red">Error: tipo "' + ex.type + '" no disponible</p>';
        }
      } else {
        const body = document.getElementById('coeduca-ex-body-' + idx);
        body.innerHTML = '<p style="color:red">Tipo de ejercicio desconocido: ' + escapeHTML(ex.type) + '</p>';
      }
    });

    // Renderizar juego
    if (cfg.game) {
      renderGame(cfg.game);
    }
  }

  function renderAudioPlayer(src, idx) {
    return `
      <div class="coeduca-audio">
        <button class="coeduca-audio-btn" data-audio-idx="${idx}" type="button" aria-label="Play audio">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <span class="coeduca-audio-label">Listen</span>
        <audio id="coeduca-audio-${idx}" src="${escapeAttr(src)}" preload="metadata"></audio>
      </div>
    `;
  }

  function renderGame(gameCfg) {
    if (global.rigo && global.rigo.inviteGame) global.rigo.inviteGame();
    const section = document.getElementById('coeduca-game-section');
    section.innerHTML = `
      <div class="coeduca-exercise">
        <div class="coeduca-exercise-title">Juego final</div>
        <div id="coeduca-game-body"></div>
      </div>
    `;
    const renderer = state.gameRegistry[gameCfg.type];
    if (renderer) {
      try {
        renderer({
          container: document.getElementById('coeduca-game-body'),
          config: gameCfg,
          onWin: () => {
            if (global.rigo) global.rigo.setEmotion && global.rigo.setEmotion('excited');
            if (global.rigo) global.rigo.say && global.rigo.say('Felicidades, eres bueno en este juego, ten 1 punto extra', 4500);
            addExtraPoints(1);
          },
          onTie: () => {
            if (global.rigo) global.rigo.setEmotion && global.rigo.setEmotion('neutral');
            if (global.rigo) global.rigo.say && global.rigo.say('Estamos a mano, ten 0.5 extra para tu nota', 4500);
            addExtraPoints(0.5);
          },
          onLose: () => {
            if (global.rigo) global.rigo.setEmotion && global.rigo.setEmotion('sad');
            if (global.rigo) global.rigo.say && global.rigo.say('Oops, más suerte para la próxima.', 4500);
          }
        });
      } catch (err) {
        console.error('Error rendering game', gameCfg.type, err);
        document.getElementById('coeduca-game-body').innerHTML =
          '<p style="color:red">Error: juego "' + gameCfg.type + '" no disponible</p>';
      }
    }
  }

  // =====================================================================
  // 9. AUDIO BUTTONS WIRING
  // =====================================================================
  function setupAudioButtons() {
    document.body.addEventListener('click', e => {
      const btn = e.target.closest('.coeduca-audio-btn');
      if (!btn) return;
      const idx = btn.dataset.audioIdx;
      const audio = document.getElementById('coeduca-audio-' + idx);
      if (!audio) return;
      if (audio.paused) {
        // Pausar otros
        document.querySelectorAll('audio').forEach(a => { if (a !== audio) a.pause(); });
        audio.play().catch(() => {});
        btn.querySelector('svg').innerHTML = '<path d="M6 6h4v12H6zm8 0h4v12h-4z"/>';
      } else {
        audio.pause();
        btn.querySelector('svg').innerHTML = '<path d="M8 5v14l11-7z"/>';
      }
      audio.onended = () => {
        btn.querySelector('svg').innerHTML = '<path d="M8 5v14l11-7z"/>';
      };
    });
  }

  // =====================================================================
  // 10. PDF GENERATION (con fix iOS)
  // =====================================================================
  function generatePDF() {
    if (!global.jspdf || !global.jspdf.jsPDF) {
      alert('Error: jsPDF no está cargado');
      return;
    }
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });

    const cfg = state.config;
    const stu = state.student || { nie: '-', name: '-', grade: '-' };
    const partners = (state.partners && state.partners.length)
      ? state.partners
      : (state.partner ? [state.partner] : []);
    const score = getTotalScore();
    const today = new Date().toLocaleDateString('es-SV');

    let y = 15;
    const left = 15;
    const right = 200;

    // Título
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(sanitizeForPDF(cfg.topic || 'Ejercicio de Ingles'), 105, y, { align: 'center' });
    y += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('COEDUCA - Prof. Jose Eliseo Martinez', 105, y, { align: 'center' });
    y += 8;

    // Puntos extra (esquina superior derecha)
    if (state.extraPoints > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(230, 57, 70);
      doc.text('+' + state.extraPoints.toFixed(1) + ' pts extra', right, 15, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    }

    // Encabezado tabla (altura dinámica según número de compañeros)
    const headerLines = [
      ['Profesor:', 'Jose Eliseo Martinez', 'Escuela:', 'COEDUCA'],
      ['Seccion:', 'A', 'Nivel:', sanitizeForPDF(cfg.level || '-')],
      ['Tema:', sanitizeForPDF(cfg.topic || '-'), 'Fecha:', today],
      ['NIE:', sanitizeForPDF(stu.nie), 'Nombre:', sanitizeForPDF(stu.name)],
      ['Grado:', sanitizeForPDF(stu.grade), '', '']
    ];
    partners.forEach((p, i) => {
      headerLines.push([
        'NIE compa ' + (i + 1) + ':', sanitizeForPDF(p.nie),
        'Compa ' + (i + 1) + ':', sanitizeForPDF(p.name)
      ]);
    });
    const headerHeight = headerLines.length * 7 + 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setDrawColor(0, 0, 0);
    doc.rect(left, y, right - left, headerHeight);

    doc.setFontSize(9);
    let yy = y + 5;
    headerLines.forEach(row => {
      doc.setFont('helvetica', 'bold');
      doc.text(row[0], left + 2, yy);
      doc.setFont('helvetica', 'normal');
      doc.text(row[1] || '', left + 28, yy);
      doc.setFont('helvetica', 'bold');
      doc.text(row[2] || '', 110, yy);
      doc.setFont('helvetica', 'normal');
      doc.text(row[3] || '', 130, yy);
      yy += 7;
    });
    y = yy + 4;

    // Calificación
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Calificacion: ' + score.grade + ' / 10', left, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Aciertos: ' + score.earned + ' / ' + score.total +
             '  |  Nota base: ' + score.baseGrade +
             '  |  Pts extra: +' + state.extraPoints.toFixed(1), left, y);
    y += 8;

    // Detalle por ejercicio
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Detalle por ejercicio:', left, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    let exNum = 0;
    (cfg.exercises || []).forEach((ex, idx) => {
      if (ex.type === 'note') return;
      exNum++;
      const ans = state.answers['ex_' + idx];
      const title = sanitizeForPDF(ex.title || ('Ejercicio ' + exNum));
      const result = ans ? (ans.score + '/' + ans.total) : 'sin completar';
      if (y > 260) { doc.addPage(); y = 15; }
      doc.setFont('helvetica', 'bold');
      doc.text(exNum + '. ' + title, left, y);
      doc.setFont('helvetica', 'normal');
      doc.text(result, right - 20, y);
      y += 5;

      // Detalles si existen
      if (ans && ans.details && Array.isArray(ans.details)) {
        ans.details.forEach(d => {
          if (y > 270) { doc.addPage(); y = 15; }
          const line = '   ' + sanitizeForPDF(d);
          const split = doc.splitTextToSize(line, right - left - 5);
          doc.text(split, left, y);
          y += split.length * 4;
        });
        y += 2;
      }
    });

    if (cfg.game) {
      if (y > 270) { doc.addPage(); y = 15; }
      doc.setFont('helvetica', 'bold');
      doc.text('Juego final: ' + sanitizeForPDF(cfg.game.type), left, y);
      doc.setFont('helvetica', 'normal');
      doc.text('+' + state.extraPoints.toFixed(1) + ' pts', right - 20, y);
      y += 6;
    }

    // FIX iOS: usar blob + URL en lugar de doc.save()
    try {
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const filename = 'coeduca_' + sanitizeForPDF(stu.name).replace(/\s+/g, '_') + '_' +
                       sanitizeForPDF(cfg.topic || 'tarea').replace(/\s+/g, '_') + '.pdf';
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1500);
    } catch (e) {
      console.error('PDF error:', e);
      alert('No se pudo generar el PDF. Recarga e intenta de nuevo.');
    }
  }

  // =====================================================================
  // 11. UTILS
  // =====================================================================
  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHTML(s); }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // =====================================================================
  // 12. DRAG & DROP HELPER (touch + auto-scroll 70px)
  // =====================================================================
  function makeDraggable(el, opts) {
    opts = opts || {};
    const onPickup = opts.onPickup || (() => {});
    const onMove = opts.onMove || (() => {});
    const onDrop = opts.onDrop || (() => {});
    const SCROLL_ZONE = 70;
    const SCROLL_SPEED = 12;
    let dragging = false;
    let scrollInterval = null;
    let lastClientY = 0;
    let ghost = null;
    let startX = 0, startY = 0;

    function startScroll() {
      if (scrollInterval) return;
      scrollInterval = setInterval(() => {
        if (!dragging) return;
        const y = lastClientY;
        if (y < SCROLL_ZONE) {
          window.scrollBy(0, -SCROLL_SPEED);
        } else if (y > window.innerHeight - SCROLL_ZONE) {
          window.scrollBy(0, SCROLL_SPEED);
        }
      }, 16);
    }
    function stopScroll() {
      if (scrollInterval) clearInterval(scrollInterval);
      scrollInterval = null;
    }

    function pickup(e) {
      const point = e.touches ? e.touches[0] : e;
      startX = point.clientX;
      startY = point.clientY;
      dragging = true;
      lastClientY = point.clientY;

      // Crear ghost
      const rect = el.getBoundingClientRect();
      ghost = el.cloneNode(true);
      ghost.style.position = 'fixed';
      ghost.style.left = rect.left + 'px';
      ghost.style.top = rect.top + 'px';
      ghost.style.width = rect.width + 'px';
      ghost.style.height = rect.height + 'px';
      ghost.style.pointerEvents = 'none';
      ghost.style.opacity = '0.85';
      ghost.style.zIndex = '9999';
      ghost.style.transform = 'rotate(3deg) scale(1.05)';
      ghost.style.transition = 'none';
      document.body.appendChild(ghost);
      el.style.opacity = '0.3';

      onPickup({ el, ghost, clientX: point.clientX, clientY: point.clientY });
      startScroll();
      e.preventDefault();
    }

    function move(e) {
      if (!dragging) return;
      const point = e.touches ? e.touches[0] : e;
      lastClientY = point.clientY;
      if (ghost) {
        const dx = point.clientX - startX;
        const dy = point.clientY - startY;
        ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(3deg) scale(1.05)`;
      }
      // Detectar elemento debajo
      ghost && (ghost.style.display = 'none');
      const under = document.elementFromPoint(point.clientX, point.clientY);
      ghost && (ghost.style.display = '');
      onMove({ el, ghost, clientX: point.clientX, clientY: point.clientY, under });
      e.preventDefault();
    }

    function drop(e) {
      if (!dragging) return;
      dragging = false;
      stopScroll();
      const point = e.changedTouches ? e.changedTouches[0] : e;
      ghost && (ghost.style.display = 'none');
      const under = document.elementFromPoint(point.clientX, point.clientY);
      ghost && ghost.remove();
      ghost = null;
      el.style.opacity = '';
      onDrop({ el, clientX: point.clientX, clientY: point.clientY, under });
    }

    el.addEventListener('mousedown', pickup);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', drop);
    el.addEventListener('touchstart', pickup, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', drop);
  }

  // =====================================================================
  // 13. PUBLIC API
  // =====================================================================
  const COEDUCA = {
    version: VERSION,
    sanitizeForPDF,
    shuffle,
    normalize,
    escapeHTML,
    makeDraggable,
    addExtraPoints,
    recordAnswer,

    registerExercise(type, renderer) {
      state.exerciseRegistry[type] = renderer;
    },
    registerGame(type, renderer) {
      state.gameRegistry[type] = renderer;
    },

    init(config) {
      state.config = config;
      state.storageKey = STORAGE_KEY_PREFIX +
        (config.id || (config.topic || 'page').replace(/\W+/g, '_').toLowerCase()) + '_';

      ensureNoTranslate();
      setupAntiCopy();
      applyTheme(config.colors);
      pickPoolVersion();

      // Restaurar progreso
      const prev = loadState();
      if (prev) {
        state.answers = prev.answers || {};
        state.extraPoints = prev.extraPoints || 0;
      }

      // Esperar DOM
      const start = () => {
        showLoginModal().then(() => {
          renderLayout();
          setupAudioButtons();
          updateScoreDisplay();
        });
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
      } else {
        start();
      }
    },

    reset() {
      try { localStorage.removeItem(state.storageKey + 'state'); } catch (e) {}
      try { localStorage.removeItem(state.storageKey + 'pool'); } catch (e) {}
      location.reload();
    }
  };

  global.COEDUCA = COEDUCA;
})(typeof window !== 'undefined' ? window : this);
