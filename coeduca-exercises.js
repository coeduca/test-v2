/**
 * COEDUCA Framework v1 - Exercises
 * 15 tipos de ejercicios reutilizables.
 * Depende de coeduca-core.js.
 *
 * Cada ejercicio recibe ctx = {
 *   container, exerciseId, data, config,
 *   recordAnswer(score, total, details), cheer(), comfort()
 * }
 */
(function (global) {
  'use strict';
  if (!global.COEDUCA) {
    console.error('coeduca-core.js debe cargarse antes que coeduca-exercises.js');
    return;
  }
  const C = global.COEDUCA;
  const reg = (type, fn) => C.registerExercise(type, fn);

  // Helper: feedback visual junto a un input/elemento
  function feedback(target, ok, ctx) {
    const span = document.createElement('span');
    span.className = 'coeduca-feedback ' + (ok ? 'correct' : 'wrong');
    span.textContent = ok ? 'OK' : 'X';
    target.parentNode.insertBefore(span, target.nextSibling);
    if (ok) ctx.cheer(); else ctx.comfort();
  }

  function gradeButton(onCheck) {
    const btn = document.createElement('button');
    btn.className = 'coeduca-btn coeduca-btn-success';
    btn.textContent = 'Revisar respuestas';
    btn.style.marginTop = '12px';
    btn.addEventListener('click', onCheck);
    return btn;
  }

  // =====================================================================
  // 1. WORDSEARCH (sopa de letras con celdas compartidas)
  // =====================================================================
  reg('wordsearch', function (ctx) {
    const data = ctx.data || {};
    const words = (data.words || []).map(w => String(w).toUpperCase().replace(/\s+/g, ''));
    const size = data.gridSize || Math.max(10, ...words.map(w => w.length + 2));
    const directions = [
      [0, 1], [1, 0], [1, 1], [-1, 1]  // H, V, diag down-right, diag up-right
    ];

    // Generar grid
    const grid = Array.from({ length: size }, () => Array(size).fill(''));
    const placements = []; // {word, r, c, dr, dc}

    function tryPlace(word) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const [dr, dc] = directions[Math.floor(Math.random() * directions.length)];
        const r = Math.floor(Math.random() * size);
        const c = Math.floor(Math.random() * size);
        const endR = r + dr * (word.length - 1);
        const endC = c + dc * (word.length - 1);
        if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue;
        let ok = true;
        for (let i = 0; i < word.length; i++) {
          const cell = grid[r + dr * i][c + dc * i];
          if (cell !== '' && cell !== word[i]) { ok = false; break; }
        }
        if (ok) {
          for (let i = 0; i < word.length; i++) grid[r + dr * i][c + dc * i] = word[i];
          placements.push({ word, r, c, dr, dc });
          return true;
        }
      }
      return false;
    }

    words.forEach(w => tryPlace(w));
    // Rellenar
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (grid[r][c] === '') grid[r][c] = letters[Math.floor(Math.random() * 26)];

    // Render
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;">
        <div id="ws-grid-${ctx.exerciseId}" style="display:grid;grid-template-columns:repeat(${size},1fr);
             gap:2px;background:#000;border:3px solid #1a1a1a;border-radius:8px;padding:3px;
             user-select:none;-webkit-user-select:none;touch-action:none;flex:1;min-width:280px;max-width:500px;"></div>
        <div style="flex:1;min-width:120px;">
          <h4 style="margin:0 0 6px;text-transform:uppercase;font-size:13px;">Palabras:</h4>
          <ul id="ws-list-${ctx.exerciseId}" style="list-style:none;padding:0;margin:0;font-weight:bold;">
            ${words.map(w => `<li data-w="${w}" style="padding:3px 6px;border-radius:4px;">${w}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
    ctx.container.appendChild(wrap);

    const gridEl = wrap.querySelector('#ws-grid-' + ctx.exerciseId);
    const listEl = wrap.querySelector('#ws-list-' + ctx.exerciseId);
    const cellSize = 'clamp(20px, 6vw, 32px)';

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement('div');
        cell.textContent = grid[r][c];
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.style.cssText = `width:${cellSize};height:${cellSize};background:#fff;
          display:grid;place-items:center;font-weight:900;font-size:clamp(11px,3vw,16px);
          cursor:pointer;border-radius:3px;`;
        gridEl.appendChild(cell);
      }
    }

    let selecting = false;
    let startCell = null;
    let currentSelection = [];
    const found = new Set();

    function clearTempHighlight() {
      gridEl.querySelectorAll('[data-r]').forEach(c => {
        if (!c.classList.contains('ws-found')) c.style.background = '#fff';
      });
    }

    function getCellFromPoint(x, y) {
      const el = document.elementFromPoint(x, y);
      if (el && el.dataset && el.dataset.r !== undefined) return el;
      return null;
    }

    function getLineCells(a, b) {
      const r1 = +a.dataset.r, c1 = +a.dataset.c;
      const r2 = +b.dataset.r, c2 = +b.dataset.c;
      const dr = r2 - r1, dc = c2 - c1;
      const len = Math.max(Math.abs(dr), Math.abs(dc));
      if (len === 0) return [a];
      // Solo aceptamos H, V o diagonales perfectas
      if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
      const stepR = dr === 0 ? 0 : dr / Math.abs(dr);
      const stepC = dc === 0 ? 0 : dc / Math.abs(dc);
      const cells = [];
      for (let i = 0; i <= len; i++) {
        const cell = gridEl.querySelector(`[data-r="${r1 + stepR * i}"][data-c="${c1 + stepC * i}"]`);
        if (!cell) return null;
        cells.push(cell);
      }
      return cells;
    }

    function start(e) {
      const point = e.touches ? e.touches[0] : e;
      const cell = getCellFromPoint(point.clientX, point.clientY);
      if (!cell) return;
      selecting = true;
      startCell = cell;
      currentSelection = [cell];
      clearTempHighlight();
      cell.style.background = '#FFD700';
      e.preventDefault();
    }
    function move(e) {
      if (!selecting) return;
      const point = e.touches ? e.touches[0] : e;
      const cell = getCellFromPoint(point.clientX, point.clientY);
      if (!cell) return;
      const cells = getLineCells(startCell, cell);
      if (!cells) return;
      clearTempHighlight();
      cells.forEach(c => { if (!c.classList.contains('ws-found')) c.style.background = '#FFD700'; });
      currentSelection = cells;
      e.preventDefault();
    }
    function end() {
      if (!selecting) return;
      selecting = false;
      if (!currentSelection.length) return;
      const word = currentSelection.map(c => c.textContent).join('');
      const reverse = word.split('').reverse().join('');
      const target = words.find(w => (w === word || w === reverse) && !found.has(w));
      if (target) {
        found.add(target);
        currentSelection.forEach(c => {
          c.classList.add('ws-found');
          c.style.background = '#A8E6CF';
        });
        listEl.querySelector(`[data-w="${target}"]`).style.cssText =
          'text-decoration:line-through;color:#4CAF50;background:#E8F5E9;padding:3px 6px;border-radius:4px;';
        ctx.cheer();
        ctx.recordAnswer(found.size, words.length,
          words.map(w => found.has(w) ? w + ': encontrada' : w + ': no encontrada'));
      } else {
        clearTempHighlight();
      }
      currentSelection = [];
    }

    gridEl.addEventListener('mousedown', start);
    gridEl.addEventListener('mousemove', move);
    gridEl.addEventListener('mouseup', end);
    gridEl.addEventListener('touchstart', start, { passive: false });
    gridEl.addEventListener('touchmove', move, { passive: false });
    gridEl.addEventListener('touchend', end);
  });

  // =====================================================================
  // 2. MATCHLINES (unir con líneas usando SVG)
  // =====================================================================
  reg('matchlines', function (ctx) {
    const pairs = ctx.data || []; // [{left, right}, ...]
    const left = C.shuffle(pairs.map((p, i) => ({ id: i, text: p.left })));
    const right = C.shuffle(pairs.map((p, i) => ({ id: i, text: p.right })));

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div style="position:relative;">
        <svg id="ml-svg-${ctx.exerciseId}" style="position:absolute;inset:0;width:100%;height:100%;
             pointer-events:none;z-index:1;"></svg>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;position:relative;z-index:2;">
          <div id="ml-left-${ctx.exerciseId}"></div>
          <div id="ml-right-${ctx.exerciseId}"></div>
        </div>
      </div>
    `;
    ctx.container.appendChild(wrap);

    const svg = wrap.querySelector('#ml-svg-' + ctx.exerciseId);
    const leftCol = wrap.querySelector('#ml-left-' + ctx.exerciseId);
    const rightCol = wrap.querySelector('#ml-right-' + ctx.exerciseId);

    function makeItem(item, side) {
      const el = document.createElement('div');
      el.textContent = item.text;
      el.dataset.id = item.id;
      el.dataset.side = side;
      el.style.cssText = `background:#fff;border:3px solid #1a1a1a;border-radius:10px;
        padding:10px 12px;margin-bottom:10px;font-weight:bold;cursor:pointer;
        text-align:center;box-shadow:2px 2px 0 #1a1a1a;transition:transform 0.15s;`;
      return el;
    }
    left.forEach(it => leftCol.appendChild(makeItem(it, 'L')));
    right.forEach(it => rightCol.appendChild(makeItem(it, 'R')));

    const connections = []; // {leftId, rightId, lineEl}
    let activeLeft = null;

    function getCenter(el) {
      const rect = el.getBoundingClientRect();
      const parent = wrap.getBoundingClientRect();
      return { x: rect.left + rect.width / 2 - parent.left, y: rect.top + rect.height / 2 - parent.top };
    }
    function drawLine(a, b, color) {
      const p1 = getCenter(a), p2 = getCenter(b);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', p1.x); line.setAttribute('y1', p1.y);
      line.setAttribute('x2', p2.x); line.setAttribute('y2', p2.y);
      line.setAttribute('stroke', color || '#1a1a1a');
      line.setAttribute('stroke-width', '4');
      line.setAttribute('stroke-linecap', 'round');
      svg.appendChild(line);
      return line;
    }
    function redrawAll() {
      svg.innerHTML = '';
      // Set svg size to wrap size
      const r = wrap.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
      svg.style.height = r.height + 'px';
      connections.forEach(con => {
        const a = leftCol.querySelector(`[data-id="${con.leftId}"]`);
        const b = rightCol.querySelector(`[data-id="${con.rightId}"]`);
        con.lineEl = drawLine(a, b, con.correct ? '#4CAF50' : '#E63946');
      });
    }

    [leftCol, rightCol].forEach(col => {
      col.addEventListener('click', e => {
        const item = e.target.closest('[data-id]');
        if (!item) return;
        if (item.dataset.side === 'L') {
          // limpiar conexión existente
          const idx = connections.findIndex(c => c.leftId == item.dataset.id);
          if (idx >= 0) connections.splice(idx, 1);
          leftCol.querySelectorAll('[data-id]').forEach(el => el.style.background = '#fff');
          activeLeft = item;
          item.style.background = '#FFD700';
        } else if (activeLeft) {
          // limpiar conexión existente del lado derecho
          const idx = connections.findIndex(c => c.rightId == item.dataset.id);
          if (idx >= 0) connections.splice(idx, 1);
          const correct = activeLeft.dataset.id === item.dataset.id;
          connections.push({
            leftId: activeLeft.dataset.id,
            rightId: item.dataset.id,
            correct
          });
          if (correct) ctx.cheer(); else ctx.comfort();
          activeLeft.style.background = correct ? '#A8E6CF' : '#FFCDD2';
          activeLeft = null;
          redrawAll();
          checkAll();
        }
      });
    });

    function checkAll() {
      const correct = connections.filter(c => c.correct).length;
      ctx.recordAnswer(correct, pairs.length,
        connections.map(c => `${c.leftId} -> ${c.rightId}: ${c.correct ? 'OK' : 'X'}`));
    }

    setTimeout(redrawAll, 100);
    window.addEventListener('resize', redrawAll);
  });

  // =====================================================================
  // 3. DRAGBANK (arrastrar palabras de un banco a huecos)
  // =====================================================================
  reg('dragbank', function (ctx) {
    // data: { sentences: [{text: 'I ___ to school', answer: 'go'}, ...], bank: ['extra', 'words'] }
    const sentences = (ctx.data && ctx.data.sentences) || [];
    const extraBank = (ctx.data && ctx.data.bank) || [];
    const allWords = C.shuffle([...sentences.map(s => s.answer), ...extraBank]);

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div id="db-bank-${ctx.exerciseId}" style="display:flex;flex-wrap:wrap;gap:8px;
           padding:14px;background:#FFF8E7;border:3px dashed #1a1a1a;border-radius:12px;
           margin-bottom:16px;min-height:50px;">
      </div>
      <div id="db-sentences-${ctx.exerciseId}"></div>
    `;
    ctx.container.appendChild(wrap);

    const bankEl = wrap.querySelector('#db-bank-' + ctx.exerciseId);
    const sentEl = wrap.querySelector('#db-sentences-' + ctx.exerciseId);

    function makeWord(w) {
      const el = document.createElement('div');
      el.textContent = w;
      el.className = 'db-word';
      el.dataset.word = w;
      el.style.cssText = `background:#FF6B9D;color:#fff;border:3px solid #1a1a1a;border-radius:8px;
        padding:6px 12px;font-weight:900;cursor:grab;box-shadow:2px 2px 0 #1a1a1a;
        text-shadow:1px 1px 0 #1a1a1a;user-select:none;-webkit-user-select:none;`;
      attachDrag(el);
      return el;
    }
    allWords.forEach(w => bankEl.appendChild(makeWord(w)));

    sentences.forEach((s, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin:10px 0;font-size:16px;line-height:2;font-weight:bold;';
      const parts = s.text.split('___');
      const slot = `<span class="db-slot" data-i="${i}" data-answer="${C.escapeHTML(s.answer)}"
                    style="display:inline-block;min-width:80px;min-height:30px;border:3px dashed #1a1a1a;
                    border-radius:6px;padding:2px 8px;margin:0 4px;background:#FFF;vertical-align:middle;"></span>`;
      row.innerHTML = (i + 1) + '. ' + C.escapeHTML(parts[0]) + slot + C.escapeHTML(parts[1] || '');
      sentEl.appendChild(row);
    });

    function attachDrag(el) {
      C.makeDraggable(el, {
        onDrop: ({ under }) => {
          if (!under) return;
          const slot = under.closest && under.closest('.db-slot');
          if (slot) {
            // Si ya tenía palabra, devolverla al banco
            const existing = slot.querySelector('.db-word');
            if (existing) bankEl.appendChild(existing);
            slot.appendChild(el);
            check();
          } else {
            // Volver al banco si no cae en slot
            if (el.parentElement && !el.parentElement.classList.contains('db-slot')) {
              // ya está en algún sitio, no movemos
            } else {
              bankEl.appendChild(el);
            }
          }
        }
      });
    }

    function check() {
      let correct = 0;
      const details = [];
      sentEl.querySelectorAll('.db-slot').forEach(slot => {
        const w = slot.querySelector('.db-word');
        const ans = slot.dataset.answer;
        if (w && C.normalize(w.textContent) === C.normalize(ans)) {
          correct++;
          slot.style.borderColor = '#4CAF50';
          slot.style.background = '#E8F5E9';
          details.push(ans + ': OK');
        } else {
          slot.style.borderColor = w ? '#E63946' : '#1a1a1a';
          slot.style.background = w ? '#FFEBEE' : '#FFF';
          details.push(ans + ': ' + (w ? w.textContent + ' (X)' : 'vacío'));
        }
      });
      ctx.recordAnswer(correct, sentences.length, details);
      if (correct === sentences.length) ctx.cheer();
    }
  });

  // NOTA: 'listenfill' (escuchar y rellenar) se logra usando type:'dragbank'
  // con la propiedad 'audio' a nivel de ejercicio. El core renderiza el
  // reproductor automáticamente arriba del banco de palabras.

  // =====================================================================
  // 5. REORDER_SENTENCES (reordenar oraciones desordenadas)
  // =====================================================================
  reg('reorder_sentences', function (ctx) {
    // data: [{ words: ['I', 'go', 'to', 'school'] }] o [{sentence: 'I go to school'}]
    const items = (ctx.data || []).map((it, idx) => {
      const words = it.words || it.sentence.split(/\s+/);
      return { idx, original: words.slice(), shuffled: C.shuffle(words.slice()) };
    });

    const wrap = document.createElement('div');
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin:14px 0;padding:12px;background:#FFF8E7;border:3px solid #1a1a1a;border-radius:10px;';
      row.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;">${i + 1}. Ordena las palabras:</div>
                       <div class="ro-row" data-i="${i}" style="display:flex;flex-wrap:wrap;gap:6px;min-height:44px;
                            padding:8px;background:#fff;border:2px dashed #1a1a1a;border-radius:8px;"></div>`;
      wrap.appendChild(row);
      const slot = row.querySelector('.ro-row');
      it.shuffled.forEach((w, j) => {
        const chip = document.createElement('div');
        chip.textContent = w;
        chip.dataset.word = w;
        chip.style.cssText = `background:#4FC3F7;color:#1a1a1a;border:2px solid #1a1a1a;
          border-radius:6px;padding:4px 10px;font-weight:bold;cursor:pointer;
          box-shadow:1px 1px 0 #1a1a1a;`;
        chip.addEventListener('click', () => {
          chip.parentElement.appendChild(chip); // mover al final
        });
        slot.appendChild(chip);
      });
    });
    ctx.container.appendChild(wrap);

    // Drag para reordenar
    wrap.querySelectorAll('.ro-row').forEach(row => {
      let dragEl = null;
      row.addEventListener('mousedown', e => onDown(e));
      row.addEventListener('touchstart', e => onDown(e), { passive: false });
      function onDown(e) {
        const t = (e.touches ? e.touches[0] : e).target;
        if (!t.dataset || !t.dataset.word) return;
        dragEl = t;
        const move = ev => {
          const point = ev.touches ? ev.touches[0] : ev;
          const after = getDropTarget(row, point.clientX);
          if (after == null) row.appendChild(dragEl);
          else row.insertBefore(dragEl, after);
          ev.preventDefault();
        };
        const up = () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
          window.removeEventListener('touchmove', move);
          window.removeEventListener('touchend', up);
          dragEl = null;
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('touchend', up);
        e.preventDefault();
      }
      function getDropTarget(container, x) {
        const chips = [...container.querySelectorAll('[data-word]')].filter(c => c !== dragEl);
        for (const chip of chips) {
          const r = chip.getBoundingClientRect();
          if (x < r.left + r.width / 2) return chip;
        }
        return null;
      }
    });

    wrap.appendChild(gradeButton(() => {
      let correct = 0;
      const details = [];
      items.forEach((it, i) => {
        const row = wrap.querySelector(`.ro-row[data-i="${i}"]`);
        const got = [...row.querySelectorAll('[data-word]')].map(c => c.textContent);
        const ok = got.join(' ') === it.original.join(' ');
        if (ok) correct++;
        row.style.background = ok ? '#E8F5E9' : '#FFEBEE';
        row.style.borderColor = ok ? '#4CAF50' : '#E63946';
        details.push(it.original.join(' ') + ': ' + (ok ? 'OK' : got.join(' ')));
      });
      ctx.recordAnswer(correct, items.length, details);
      if (correct === items.length) ctx.cheer(); else ctx.comfort();
    }));
  });

  // =====================================================================
  // 6. REORDER_LETTERS (formar palabra)
  // =====================================================================
  reg('reorder_letters', function (ctx) {
    // data: [{ word: 'SCHOOL', hint: 'Lugar de estudio' }]
    const items = (ctx.data || []).map((it, idx) => ({
      idx,
      word: it.word.toUpperCase(),
      hint: it.hint || '',
      shuffled: C.shuffle(it.word.toUpperCase().split('')).join('')
    }));

    const wrap = document.createElement('div');
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin:12px 0;padding:12px;background:#FFF8E7;border:3px solid #1a1a1a;border-radius:10px;';
      row.innerHTML = `
        <div style="font-weight:bold;margin-bottom:6px;">${i + 1}. ${C.escapeHTML(it.hint || 'Forma la palabra')}</div>
        <div style="font-family:monospace;font-size:22px;letter-spacing:6px;font-weight:900;
             background:#fff;border:2px solid #1a1a1a;border-radius:6px;padding:6px 12px;
             display:inline-block;margin-bottom:8px;">${it.shuffled}</div><br>
        <input type="text" class="coeduca-input rl-input" data-i="${i}" placeholder="Escribe la palabra"
               autocomplete="off" autocapitalize="characters">
      `;
      wrap.appendChild(row);
    });
    wrap.appendChild(gradeButton(() => {
      let correct = 0;
      const details = [];
      items.forEach(it => {
        const inp = wrap.querySelector(`.rl-input[data-i="${it.idx}"]`);
        const ok = C.normalize(inp.value) === C.normalize(it.word);
        if (ok) correct++;
        inp.classList.toggle('correct', ok);
        inp.classList.toggle('wrong', !ok);
        details.push(it.word + ': ' + (ok ? 'OK' : inp.value || 'vacío'));
      });
      ctx.recordAnswer(correct, items.length, details);
      if (correct === items.length) ctx.cheer(); else ctx.comfort();
    }));
    ctx.container.appendChild(wrap);
  });

  // =====================================================================
  // 7. EMOJIPHRASE (escribir frase que describa emojis)
  // =====================================================================
  reg('emojiphrase', function (ctx) {
    // data: [{ emojis: '🔍📰', accept: ['look', 'newspaper'], example: 'I look for news' }]
    const items = ctx.data || [];
    const wrap = document.createElement('div');
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin:12px 0;padding:14px;background:#FFF8E7;border:3px solid #1a1a1a;border-radius:10px;';
      row.innerHTML = `
        <div style="font-size:42px;margin-bottom:8px;text-align:center;">${C.escapeHTML(it.emojis)}</div>
        <div style="font-weight:bold;margin-bottom:6px;">${i + 1}. Escribe una oración:</div>
        <input type="text" class="coeduca-input ep-input" data-i="${i}"
               style="width:100%;" autocomplete="off" placeholder="Tu oración en inglés">
        <div class="ep-fb" data-i="${i}" style="margin-top:6px;font-size:13px;font-weight:bold;"></div>
      `;
      wrap.appendChild(row);
    });
    wrap.appendChild(gradeButton(() => {
      let correct = 0;
      const details = [];
      items.forEach((it, i) => {
        const inp = wrap.querySelector(`.ep-input[data-i="${i}"]`);
        const fb = wrap.querySelector(`.ep-fb[data-i="${i}"]`);
        const text = C.normalize(inp.value);
        // criterio: contiene todas las palabras requeridas O coincide con example
        const accept = (it.accept || []).map(C.normalize);
        const hasAll = accept.length > 0 && accept.every(a => text.includes(a));
        const matchExample = it.example && C.normalize(it.example) === text;
        const ok = hasAll || matchExample || text.length > 5; // permisivo: cualquier oración válida cuenta
        // Para ser justos: si tiene al menos las palabras clave es correcto
        const strict = hasAll || matchExample;
        if (strict) correct++;
        inp.classList.toggle('correct', strict);
        inp.classList.toggle('wrong', !strict);
        fb.textContent = strict ? 'OK' : (it.example ? 'Ejemplo: ' + it.example : 'Inténtalo de nuevo');
        fb.style.color = strict ? '#4CAF50' : '#E63946';
        details.push(it.emojis + ': ' + inp.value + ' (' + (strict ? 'OK' : 'X') + ')');
      });
      ctx.recordAnswer(correct, items.length, details);
      if (correct === items.length) ctx.cheer(); else ctx.comfort();
    }));
    ctx.container.appendChild(wrap);
  });

  // =====================================================================
  // 8. MULTIPLECHOICE (selección múltiple, radio buttons estilizados)
  // =====================================================================
  reg('multiplechoice', function (ctx) {
    // data: [{ q: '___ a teacher', options: ['I am', 'I is'], answer: 0 }]
    const items = ctx.data || [];
    const wrap = document.createElement('div');
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin:12px 0;padding:14px;background:#FFF8E7;border:3px solid #1a1a1a;border-radius:10px;';
      let opts = it.options.map((opt, j) => `
        <label style="display:block;background:#fff;border:2px solid #1a1a1a;border-radius:8px;
               padding:8px 12px;margin:6px 0;font-weight:bold;cursor:pointer;
               box-shadow:2px 2px 0 #1a1a1a;">
          <input type="radio" name="mc-${ctx.exerciseId}-${i}" value="${j}" style="margin-right:8px;">
          ${C.escapeHTML(opt)}
        </label>
      `).join('');
      row.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;">${i + 1}. ${C.escapeHTML(it.q)}</div>${opts}`;
      wrap.appendChild(row);
    });
    wrap.appendChild(gradeButton(() => {
      let correct = 0;
      const details = [];
      items.forEach((it, i) => {
        const sel = wrap.querySelector(`input[name="mc-${ctx.exerciseId}-${i}"]:checked`);
        const ok = sel && +sel.value === it.answer;
        if (ok) correct++;
        // marcar visualmente
        wrap.querySelectorAll(`input[name="mc-${ctx.exerciseId}-${i}"]`).forEach(r => {
          const lbl = r.parentElement;
          if (+r.value === it.answer) lbl.style.background = '#E8F5E9';
          else if (r.checked) lbl.style.background = '#FFEBEE';
        });
        details.push(it.q + ': ' + (ok ? 'OK' : 'X (correcta: ' + it.options[it.answer] + ')'));
      });
      ctx.recordAnswer(correct, items.length, details);
      if (correct === items.length) ctx.cheer(); else ctx.comfort();
    }));
    ctx.container.appendChild(wrap);
  });

  // =====================================================================
  // 9. SPOTERROR (clic en la palabra incorrecta)
  // =====================================================================
  reg('spoterror', function (ctx) {
    // data: [{ words: ['She', 'are', 'happy'], errorIndex: 1, fix: 'is' }]
    const items = ctx.data || [];
    const selected = {}; // { itemIdx: wordIdx }

    const wrap = document.createElement('div');
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin:12px 0;padding:14px;background:#FFF8E7;border:3px solid #1a1a1a;border-radius:10px;';
      const wordSpans = it.words.map((w, j) => `
        <span class="se-word" data-i="${i}" data-j="${j}"
              style="display:inline-block;background:#fff;border:2px solid #1a1a1a;
                     border-radius:6px;padding:3px 8px;margin:2px;font-weight:bold;cursor:pointer;">
          ${C.escapeHTML(w)}
        </span>
      `).join(' ');
      row.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;">${i + 1}. Toca la palabra incorrecta:</div>
                       <div>${wordSpans}</div>`;
      wrap.appendChild(row);
    });
    wrap.addEventListener('click', e => {
      const w = e.target.closest('.se-word');
      if (!w) return;
      const i = +w.dataset.i;
      // limpiar
      wrap.querySelectorAll(`.se-word[data-i="${i}"]`).forEach(s => s.style.background = '#fff');
      w.style.background = '#FFD700';
      selected[i] = +w.dataset.j;
    });
    wrap.appendChild(gradeButton(() => {
      let correct = 0;
      const details = [];
      items.forEach((it, i) => {
        const ok = selected[i] === it.errorIndex;
        if (ok) correct++;
        const targetWord = wrap.querySelector(`.se-word[data-i="${i}"][data-j="${it.errorIndex}"]`);
        if (targetWord) targetWord.style.background = '#A8E6CF';
        if (selected[i] !== undefined && !ok) {
          const wrong = wrap.querySelector(`.se-word[data-i="${i}"][data-j="${selected[i]}"]`);
          if (wrong) wrong.style.background = '#FFCDD2';
        }
        details.push(it.words.join(' ') + ' -> error: ' + it.words[it.errorIndex] +
          ' (corrige: ' + (it.fix || '') + ')' + ' [' + (ok ? 'OK' : 'X') + ']');
      });
      ctx.recordAnswer(correct, items.length, details);
      if (correct === items.length) ctx.cheer(); else ctx.comfort();
    }));
    ctx.container.appendChild(wrap);
  });

  // =====================================================================
  // 10. CATEGORIZE (clasificar arrastrando a columnas)
  // =====================================================================
  reg('categorize', function (ctx) {
    // data: { categories: ['Verbs', 'Nouns'], items: [{text:'run', cat:0}, ...] }
    const cats = ctx.data.categories || [];
    const items = C.shuffle((ctx.data.items || []).slice());

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div id="cat-bank-${ctx.exerciseId}" style="display:flex;flex-wrap:wrap;gap:6px;
           padding:10px;background:#FFF8E7;border:3px dashed #1a1a1a;border-radius:10px;
           margin-bottom:14px;min-height:50px;"></div>
      <div style="display:grid;grid-template-columns:repeat(${cats.length},1fr);gap:10px;">
        ${cats.map((c, i) => `
          <div class="cat-col" data-cat="${i}" style="background:#fff;border:3px solid #1a1a1a;
               border-radius:10px;padding:10px;min-height:120px;">
            <h4 style="margin:0 0 8px;text-align:center;background:#FFD700;border:2px solid #1a1a1a;
                border-radius:6px;padding:4px;text-transform:uppercase;font-size:13px;">
              ${C.escapeHTML(c)}
            </h4>
            <div class="cat-drop" data-cat="${i}" style="min-height:80px;"></div>
          </div>
        `).join('')}
      </div>
    `;
    ctx.container.appendChild(wrap);

    const bank = wrap.querySelector('#cat-bank-' + ctx.exerciseId);
    items.forEach((it, idx) => {
      const chip = document.createElement('div');
      chip.textContent = it.text;
      chip.dataset.cat = it.cat;
      chip.dataset.idx = idx;
      chip.style.cssText = `background:#FF6B9D;color:#fff;border:2px solid #1a1a1a;
        border-radius:6px;padding:5px 10px;font-weight:bold;cursor:grab;
        box-shadow:1px 1px 0 #1a1a1a;text-shadow:1px 1px 0 #1a1a1a;`;
      bank.appendChild(chip);
      C.makeDraggable(chip, {
        onDrop: ({ under }) => {
          const drop = under && under.closest && under.closest('.cat-drop');
          if (drop) drop.appendChild(chip);
          else bank.appendChild(chip);
          check();
        }
      });
    });

    function check() {
      let correct = 0;
      const details = [];
      items.forEach((it, idx) => {
        const chip = wrap.querySelector(`[data-idx="${idx}"]`);
        const parent = chip.closest('.cat-drop');
        if (parent && +parent.dataset.cat === it.cat) {
          correct++;
          chip.style.background = '#4CAF50';
          details.push(it.text + ' -> ' + cats[it.cat] + ': OK');
        } else {
          chip.style.background = '#FF6B9D';
          details.push(it.text + ' -> ' + cats[it.cat] + ': ' +
            (parent ? 'puesto en ' + cats[+parent.dataset.cat] : 'sin colocar'));
        }
      });
      ctx.recordAnswer(correct, items.length, details);
    }
  });

  // =====================================================================
  // 11. DROPDOWN (select dentro de oración)
  // =====================================================================
  reg('dropdown', function (ctx) {
    // data: [{ before: 'I', options: ['am','is','are'], answer: 0, after: 'happy' }]
    const items = ctx.data || [];
    const wrap = document.createElement('div');
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin:10px 0;padding:12px;background:#FFF8E7;border:3px solid #1a1a1a;border-radius:10px;font-size:16px;';
      const opts = it.options.map((o, j) =>
        `<option value="${j}">${C.escapeHTML(o)}</option>`).join('');
      row.innerHTML = `${i + 1}. ${C.escapeHTML(it.before || '')}
        <select class="coeduca-input dd-sel" data-i="${i}" style="font-size:15px;padding:4px 8px;">
          <option value="">-- elegir --</option>${opts}
        </select>
        ${C.escapeHTML(it.after || '')}`;
      wrap.appendChild(row);
    });
    wrap.appendChild(gradeButton(() => {
      let correct = 0;
      const details = [];
      items.forEach((it, i) => {
        const sel = wrap.querySelector(`.dd-sel[data-i="${i}"]`);
        const ok = sel.value !== '' && +sel.value === it.answer;
        if (ok) correct++;
        sel.classList.toggle('correct', ok);
        sel.classList.toggle('wrong', sel.value !== '' && !ok);
        details.push((it.before || '') + ' [' + it.options[it.answer] + '] ' +
          (it.after || '') + ': ' + (ok ? 'OK' : 'X'));
      });
      ctx.recordAnswer(correct, items.length, details);
      if (correct === items.length) ctx.cheer(); else ctx.comfort();
    }));
    ctx.container.appendChild(wrap);
  });

  // =====================================================================
  // 12. MATCHIMAGE (arrastrar texto a imagen/emoji)
  // =====================================================================
  reg('matchimage', function (ctx) {
    // data: [{ word: 'Cat', emoji: '🐈', image: 'files/cat.png' }]
    const pairs = (ctx.data || []).map((p, i) => ({ ...p, idx: i }));
    const shuffled = C.shuffle(pairs.slice());

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div id="mi-bank-${ctx.exerciseId}" style="display:flex;flex-wrap:wrap;gap:8px;
           padding:10px;background:#FFF8E7;border:3px dashed #1a1a1a;border-radius:10px;
           margin-bottom:14px;"></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;">
        ${pairs.map(p => `
          <div class="mi-target" data-idx="${p.idx}"
               style="background:#fff;border:3px solid #1a1a1a;border-radius:10px;
                      padding:8px;text-align:center;min-height:100px;display:flex;
                      flex-direction:column;align-items:center;justify-content:center;
                      box-shadow:2px 2px 0 #1a1a1a;">
            ${p.image
              ? `<img src="${C.escapeHTML(p.image)}" style="max-width:80px;max-height:80px;border:2px solid #1a1a1a;border-radius:6px;">`
              : `<div style="font-size:46px;">${C.escapeHTML(p.emoji || '?')}</div>`}
            <div class="mi-slot" style="margin-top:6px;min-height:28px;width:100%;
                 border:2px dashed #1a1a1a;border-radius:6px;padding:2px;"></div>
          </div>
        `).join('')}
      </div>
    `;
    ctx.container.appendChild(wrap);

    const bank = wrap.querySelector('#mi-bank-' + ctx.exerciseId);
    shuffled.forEach(p => {
      const chip = document.createElement('div');
      chip.textContent = p.word;
      chip.dataset.idx = p.idx;
      chip.style.cssText = `background:#4FC3F7;border:2px solid #1a1a1a;border-radius:6px;
        padding:5px 10px;font-weight:bold;cursor:grab;box-shadow:1px 1px 0 #1a1a1a;`;
      bank.appendChild(chip);
      C.makeDraggable(chip, {
        onDrop: ({ under }) => {
          const slot = under && under.closest && under.closest('.mi-slot');
          if (slot) {
            const existing = slot.querySelector('[data-idx]');
            if (existing) bank.appendChild(existing);
            slot.appendChild(chip);
          } else {
            bank.appendChild(chip);
          }
          check();
        }
      });
    });

    function check() {
      let correct = 0;
      const details = [];
      pairs.forEach(p => {
        const target = wrap.querySelector(`.mi-target[data-idx="${p.idx}"]`);
        const slot = target.querySelector('.mi-slot');
        const chip = slot.querySelector('[data-idx]');
        const ok = chip && +chip.dataset.idx === p.idx;
        if (ok) {
          correct++;
          target.style.background = '#E8F5E9';
        } else {
          target.style.background = chip ? '#FFEBEE' : '#fff';
        }
        details.push(p.word + ': ' + (ok ? 'OK' : 'X'));
      });
      ctx.recordAnswer(correct, pairs.length, details);
    }
  });

  // =====================================================================
  // 13. FILLBLANK (escribir respuesta con teclado)
  // =====================================================================
  reg('fillblank', function (ctx) {
    // data: [{ text: 'I ___ to school', answer: 'go' }] o multiple ___ con answers array
    const items = ctx.data || [];
    const wrap = document.createElement('div');
    items.forEach((it, i) => {
      const answers = Array.isArray(it.answer) ? it.answer : [it.answer];
      const parts = it.text.split('___');
      let html = (i + 1) + '. ';
      parts.forEach((p, j) => {
        html += C.escapeHTML(p);
        if (j < parts.length - 1) {
          const ans = answers[j] || '';
          html += `<input type="text" class="coeduca-input fb-input" data-i="${i}" data-j="${j}"
                          data-answer="${C.escapeHTML(ans)}"
                          style="width:${Math.max(70, ans.length * 14)}px;margin:0 4px;"
                          autocomplete="off">`;
        }
      });
      const row = document.createElement('div');
      row.style.cssText = 'margin:12px 0;font-size:16px;font-weight:bold;line-height:2;';
      row.innerHTML = html;
      wrap.appendChild(row);
    });
    wrap.appendChild(gradeButton(() => {
      let correct = 0, total = 0;
      const details = [];
      items.forEach((it, i) => {
        const answers = Array.isArray(it.answer) ? it.answer : [it.answer];
        answers.forEach((ans, j) => {
          total++;
          const inp = wrap.querySelector(`.fb-input[data-i="${i}"][data-j="${j}"]`);
          const ok = C.normalize(inp.value) === C.normalize(ans);
          if (ok) correct++;
          inp.classList.toggle('correct', ok);
          inp.classList.toggle('wrong', !ok);
          details.push(ans + ': ' + (ok ? 'OK' : (inp.value || 'vacío')));
        });
      });
      ctx.recordAnswer(correct, total, details);
      if (correct === total) ctx.cheer(); else ctx.comfort();
    }));
    ctx.container.appendChild(wrap);
  });

  // =====================================================================
  // 14. TRUEFALSE (verdadero / falso)
  // =====================================================================
  reg('truefalse', function (ctx) {
    // data: [{ statement: '...', answer: true }]
    const items = ctx.data || [];
    const selections = {};
    const wrap = document.createElement('div');
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin:10px 0;padding:12px;background:#FFF8E7;border:3px solid #1a1a1a;border-radius:10px;';
      row.innerHTML = `
        <div style="font-weight:bold;margin-bottom:8px;">${i + 1}. ${C.escapeHTML(it.statement)}</div>
        <div style="display:flex;gap:10px;">
          <button class="coeduca-btn tf-btn" data-i="${i}" data-v="true"
                  style="background:#4CAF50;color:#fff;flex:1;">TRUE</button>
          <button class="coeduca-btn tf-btn" data-i="${i}" data-v="false"
                  style="background:#E63946;color:#fff;flex:1;">FALSE</button>
        </div>
      `;
      wrap.appendChild(row);
    });
    wrap.addEventListener('click', e => {
      const b = e.target.closest('.tf-btn');
      if (!b) return;
      const i = +b.dataset.i;
      selections[i] = b.dataset.v === 'true';
      wrap.querySelectorAll(`.tf-btn[data-i="${i}"]`).forEach(btn => {
        btn.style.outline = btn === b ? '4px solid #FFD700' : 'none';
      });
    });
    wrap.appendChild(gradeButton(() => {
      let correct = 0;
      const details = [];
      items.forEach((it, i) => {
        const ok = selections[i] === it.answer;
        if (ok) correct++;
        details.push(it.statement.substring(0, 40) + ': ' +
          (ok ? 'OK' : 'X (correcta: ' + (it.answer ? 'TRUE' : 'FALSE') + ')'));
      });
      ctx.recordAnswer(correct, items.length, details);
      if (correct === items.length) ctx.cheer(); else ctx.comfort();
    }));
    ctx.container.appendChild(wrap);
  });

})(typeof window !== 'undefined' ? window : this);
