/**
 * COEDUCA Framework v1 - Games
 * 5 juegos: tictactoe, snake, dino, hangman, trivia
 * Depende de coeduca-core.js.
 *
 * Cada juego recibe ctx = { container, config, onWin, onTie, onLose }
 * onWin: +1 pt extra, onTie: +0.5, onLose: 0.
 */
(function (global) {
  'use strict';
  if (!global.COEDUCA) {
    console.error('coeduca-core.js debe cargarse antes que coeduca-games.js');
    return;
  }
  const C = global.COEDUCA;
  const reg = (type, fn) => C.registerGame(type, fn);

  // =====================================================================
  // 1. TICTACTOE (XO contra IA imperfecta)
  // =====================================================================
  reg('tictactoe', function (ctx) {
    let board = Array(9).fill('');
    let gameOver = false;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div style="text-align:center;">
        <div style="font-weight:bold;margin-bottom:10px;">Tú: X | CPU: O</div>
        <div id="ttt-grid" style="display:grid;grid-template-columns:repeat(3,80px);
             gap:4px;justify-content:center;background:#000;padding:4px;border-radius:8px;
             width:fit-content;margin:0 auto;"></div>
        <div id="ttt-status" style="margin-top:10px;font-weight:bold;font-size:16px;"></div>
        <button class="coeduca-btn" id="ttt-reset" style="margin-top:10px;">Reiniciar</button>
      </div>
    `;
    ctx.container.appendChild(wrap);

    const grid = wrap.querySelector('#ttt-grid');
    const status = wrap.querySelector('#ttt-status');
    function render() {
      grid.innerHTML = '';
      board.forEach((c, i) => {
        const cell = document.createElement('button');
        cell.style.cssText = `width:80px;height:80px;background:#fff;border:none;
          font-size:42px;font-weight:900;cursor:pointer;border-radius:4px;
          color:${c === 'X' ? '#FF6B9D' : '#4FC3F7'};`;
        cell.textContent = c;
        cell.disabled = c !== '' || gameOver;
        cell.addEventListener('click', () => playerMove(i));
        grid.appendChild(cell);
      });
    }
    function checkWinner(b) {
      const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      for (const [a, c, d] of lines) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
      return b.includes('') ? null : 'tie';
    }
    function playerMove(i) {
      if (board[i] || gameOver) return;
      board[i] = 'X';
      render();
      const w = checkWinner(board);
      if (w) return endGame(w);
      setTimeout(cpuMove, 350);
    }
    function cpuMove() {
      // IA imperfecta: 50% mejor jugada, 50% aleatoria
      let move = -1;
      if (Math.random() < 0.5) {
        // intentar ganar
        for (let i = 0; i < 9; i++) {
          if (!board[i]) { board[i] = 'O'; if (checkWinner(board) === 'O') { move = i; break; } board[i] = ''; }
        }
        // bloquear
        if (move === -1) {
          for (let i = 0; i < 9; i++) {
            if (!board[i]) { board[i] = 'X'; if (checkWinner(board) === 'X') { board[i] = ''; move = i; break; } board[i] = ''; }
          }
        }
      }
      if (move === -1) {
        const empty = board.map((c, i) => c ? -1 : i).filter(i => i >= 0);
        move = empty[Math.floor(Math.random() * empty.length)];
      }
      if (move >= 0) board[move] = 'O';
      render();
      const w = checkWinner(board);
      if (w) endGame(w);
    }
    function endGame(winner) {
      gameOver = true;
      if (winner === 'X') { status.textContent = '¡Ganaste!'; ctx.onWin(); }
      else if (winner === 'O') { status.textContent = 'Perdiste'; ctx.onLose(); }
      else { status.textContent = 'Empate'; ctx.onTie(); }
    }
    wrap.querySelector('#ttt-reset').addEventListener('click', () => {
      board = Array(9).fill(''); gameOver = false; status.textContent = ''; render();
    });
    render();
  });

  // =====================================================================
  // 2. SNAKE (culebrita)
  // =====================================================================
  reg('snake', function (ctx) {
    const SIZE = 15, CELL = 20;
    let snake, dir, food, score, gameOver, loop;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div style="text-align:center;">
        <div id="snake-score" style="font-weight:bold;margin-bottom:8px;">Puntos: 0</div>
        <canvas id="snake-canvas" width="${SIZE * CELL}" height="${SIZE * CELL}"
                style="border:3px solid #1a1a1a;border-radius:8px;background:#FFF8E7;
                       max-width:100%;height:auto;touch-action:none;"></canvas>
        <div style="margin-top:10px;display:grid;grid-template-columns:repeat(3,60px);
             gap:4px;justify-content:center;">
          <span></span>
          <button class="coeduca-btn snake-dir" data-d="up">↑</button>
          <span></span>
          <button class="coeduca-btn snake-dir" data-d="left">←</button>
          <button class="coeduca-btn" id="snake-start">Start</button>
          <button class="coeduca-btn snake-dir" data-d="right">→</button>
          <span></span>
          <button class="coeduca-btn snake-dir" data-d="down">↓</button>
          <span></span>
        </div>
        <div id="snake-status" style="margin-top:8px;font-weight:bold;"></div>
      </div>
    `;
    ctx.container.appendChild(wrap);

    const canvas = wrap.querySelector('#snake-canvas');
    const cctx = canvas.getContext('2d');
    const scoreEl = wrap.querySelector('#snake-score');
    const statusEl = wrap.querySelector('#snake-status');
    const winThreshold = (ctx.config && ctx.config.winScore) || 5;

    function reset() {
      snake = [{ x: 7, y: 7 }];
      dir = { x: 1, y: 0 };
      placeFood();
      score = 0;
      gameOver = false;
      scoreEl.textContent = 'Puntos: 0';
      statusEl.textContent = '';
    }
    function placeFood() {
      do {
        food = { x: Math.floor(Math.random() * SIZE), y: Math.floor(Math.random() * SIZE) };
      } while (snake.some(s => s.x === food.x && s.y === food.y));
    }
    function step() {
      if (gameOver) return;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.x >= SIZE || head.y < 0 || head.y >= SIZE ||
          snake.some(s => s.x === head.x && s.y === head.y)) {
        return end();
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score++;
        scoreEl.textContent = 'Puntos: ' + score;
        if (score >= winThreshold) return win();
        placeFood();
      } else {
        snake.pop();
      }
      draw();
    }
    function draw() {
      cctx.fillStyle = '#FFF8E7'; cctx.fillRect(0, 0, canvas.width, canvas.height);
      cctx.fillStyle = '#FF6B9D';
      cctx.fillRect(food.x * CELL + 2, food.y * CELL + 2, CELL - 4, CELL - 4);
      cctx.fillStyle = '#4CAF50';
      snake.forEach((s, i) => {
        cctx.fillStyle = i === 0 ? '#1a1a1a' : '#4CAF50';
        cctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
      });
    }
    function end() {
      gameOver = true; clearInterval(loop);
      statusEl.textContent = 'Game Over';
      ctx.onLose();
    }
    function win() {
      gameOver = true; clearInterval(loop);
      statusEl.textContent = '¡Ganaste!';
      ctx.onWin();
    }
    wrap.querySelectorAll('.snake-dir').forEach(b => {
      b.addEventListener('click', () => {
        const d = b.dataset.d;
        if (d === 'up' && dir.y !== 1) dir = { x: 0, y: -1 };
        if (d === 'down' && dir.y !== -1) dir = { x: 0, y: 1 };
        if (d === 'left' && dir.x !== 1) dir = { x: -1, y: 0 };
        if (d === 'right' && dir.x !== -1) dir = { x: 1, y: 0 };
      });
    });
    document.addEventListener('keydown', e => {
      if (gameOver) return;
      if (e.key === 'ArrowUp' && dir.y !== 1) dir = { x: 0, y: -1 };
      else if (e.key === 'ArrowDown' && dir.y !== -1) dir = { x: 0, y: 1 };
      else if (e.key === 'ArrowLeft' && dir.x !== 1) dir = { x: -1, y: 0 };
      else if (e.key === 'ArrowRight' && dir.x !== -1) dir = { x: 1, y: 0 };
    });
    wrap.querySelector('#snake-start').addEventListener('click', () => {
      reset(); draw();
      clearInterval(loop);
      loop = setInterval(step, 180);
    });
    reset(); draw();
  });

  // =====================================================================
  // 3. DINO (jumper estilo Chrome)
  // =====================================================================
  reg('dino', function (ctx) {
    const W = 400, H = 140;
    let dino, obstacles, vy, gravity, onGround, score, gameOver, loop, speed;
    const winThreshold = (ctx.config && ctx.config.winScore) || 30;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div style="text-align:center;">
        <div id="dino-score" style="font-weight:bold;margin-bottom:8px;">Puntos: 0</div>
        <canvas id="dino-canvas" width="${W}" height="${H}"
                style="border:3px solid #1a1a1a;border-radius:8px;background:#FFF8E7;
                       max-width:100%;height:auto;touch-action:none;cursor:pointer;"></canvas>
        <div style="margin-top:8px;font-size:13px;font-weight:bold;">Toca o presiona ESPACIO para saltar</div>
        <button class="coeduca-btn" id="dino-start" style="margin-top:8px;">Start</button>
        <div id="dino-status" style="margin-top:6px;font-weight:bold;"></div>
      </div>
    `;
    ctx.container.appendChild(wrap);

    const canvas = wrap.querySelector('#dino-canvas');
    const cctx = canvas.getContext('2d');
    const scoreEl = wrap.querySelector('#dino-score');
    const statusEl = wrap.querySelector('#dino-status');

    function reset() {
      dino = { x: 30, y: H - 30, w: 24, h: 28 };
      obstacles = [];
      vy = 0; gravity = 0.7; onGround = true;
      score = 0; gameOver = false; speed = 4;
      scoreEl.textContent = 'Puntos: 0';
      statusEl.textContent = '';
    }
    function jump() {
      if (gameOver) return;
      if (onGround) { vy = -11; onGround = false; }
    }
    function step() {
      if (gameOver) return;
      vy += gravity;
      dino.y += vy;
      const groundY = H - dino.h - 2;
      if (dino.y >= groundY) { dino.y = groundY; vy = 0; onGround = true; }
      // Obstáculos
      if (Math.random() < 0.018) {
        obstacles.push({ x: W, y: H - 22, w: 14, h: 22 });
      }
      obstacles.forEach(o => o.x -= speed);
      obstacles = obstacles.filter(o => o.x + o.w > 0);
      // Colisión
      for (const o of obstacles) {
        if (dino.x < o.x + o.w && dino.x + dino.w > o.x &&
            dino.y < o.y + o.h && dino.y + dino.h > o.y) {
          return end();
        }
      }
      score++;
      if (score % 5 === 0) scoreEl.textContent = 'Puntos: ' + Math.floor(score / 5);
      if (score % 100 === 0) speed += 0.4;
      if (score / 5 >= winThreshold) return win();
      draw();
    }
    function draw() {
      cctx.fillStyle = '#FFF8E7'; cctx.fillRect(0, 0, W, H);
      cctx.fillStyle = '#1a1a1a'; cctx.fillRect(0, H - 2, W, 2);
      cctx.fillStyle = '#4CAF50';
      cctx.fillRect(dino.x, dino.y, dino.w, dino.h);
      cctx.fillStyle = '#1a1a1a';
      cctx.fillRect(dino.x + dino.w - 7, dino.y + 5, 3, 3);
      cctx.fillStyle = '#FF6B9D';
      obstacles.forEach(o => cctx.fillRect(o.x, o.y, o.w, o.h));
    }
    function end() {
      gameOver = true; clearInterval(loop);
      statusEl.textContent = 'Game Over';
      ctx.onLose();
    }
    function win() {
      gameOver = true; clearInterval(loop);
      statusEl.textContent = '¡Ganaste!';
      ctx.onWin();
    }
    canvas.addEventListener('click', jump);
    canvas.addEventListener('touchstart', e => { jump(); e.preventDefault(); }, { passive: false });
    document.addEventListener('keydown', e => { if (e.code === 'Space') { jump(); e.preventDefault(); } });
    wrap.querySelector('#dino-start').addEventListener('click', () => {
      reset(); draw();
      clearInterval(loop);
      loop = setInterval(step, 30);
    });
    reset(); draw();
  });

  // =====================================================================
  // 4. HANGMAN (ahorcado)
  // =====================================================================
  reg('hangman', function (ctx) {
    const words = (ctx.config && ctx.config.words) || ['ENGLISH', 'TEACHER', 'SCHOOL'];
    let word, guessed, mistakes, gameOver;
    const MAX = 6;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div style="text-align:center;">
        <svg id="hm-svg" viewBox="0 0 200 200" style="width:200px;height:200px;
             border:3px solid #1a1a1a;border-radius:8px;background:#FFF8E7;"></svg>
        <div id="hm-word" style="font-family:monospace;font-size:32px;letter-spacing:8px;
             font-weight:900;margin:14px 0;"></div>
        <div id="hm-letters" style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center;
             max-width:380px;margin:0 auto;"></div>
        <div id="hm-status" style="margin-top:10px;font-weight:bold;font-size:16px;"></div>
        <button class="coeduca-btn" id="hm-reset" style="margin-top:10px;">Nueva palabra</button>
      </div>
    `;
    ctx.container.appendChild(wrap);

    const svg = wrap.querySelector('#hm-svg');
    const wordEl = wrap.querySelector('#hm-word');
    const lettersEl = wrap.querySelector('#hm-letters');
    const statusEl = wrap.querySelector('#hm-status');

    function drawHangman() {
      const parts = [
        '<line x1="20" y1="180" x2="120" y2="180" stroke="#1a1a1a" stroke-width="4"/>' +
        '<line x1="50" y1="180" x2="50" y2="20" stroke="#1a1a1a" stroke-width="4"/>' +
        '<line x1="50" y1="20" x2="120" y2="20" stroke="#1a1a1a" stroke-width="4"/>' +
        '<line x1="120" y1="20" x2="120" y2="40" stroke="#1a1a1a" stroke-width="4"/>',
        '<circle cx="120" cy="55" r="15" fill="none" stroke="#1a1a1a" stroke-width="3"/>',
        '<line x1="120" y1="70" x2="120" y2="120" stroke="#1a1a1a" stroke-width="3"/>',
        '<line x1="120" y1="85" x2="100" y2="105" stroke="#1a1a1a" stroke-width="3"/>',
        '<line x1="120" y1="85" x2="140" y2="105" stroke="#1a1a1a" stroke-width="3"/>',
        '<line x1="120" y1="120" x2="100" y2="150" stroke="#1a1a1a" stroke-width="3"/>',
        '<line x1="120" y1="120" x2="140" y2="150" stroke="#1a1a1a" stroke-width="3"/>'
      ];
      svg.innerHTML = parts.slice(0, mistakes + 1).join('');
    }
    function renderWord() {
      wordEl.textContent = word.split('').map(c => guessed.has(c) ? c : '_').join(' ');
    }
    function reset() {
      word = words[Math.floor(Math.random() * words.length)].toUpperCase();
      guessed = new Set();
      mistakes = 0;
      gameOver = false;
      statusEl.textContent = '';
      lettersEl.innerHTML = '';
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(letter => {
        const b = document.createElement('button');
        b.textContent = letter;
        b.className = 'coeduca-btn';
        b.style.cssText = 'min-width:32px;padding:6px 8px;font-size:14px;';
        b.addEventListener('click', () => guess(letter, b));
        lettersEl.appendChild(b);
      });
      drawHangman();
      renderWord();
    }
    function guess(letter, btn) {
      if (gameOver || guessed.has(letter)) return;
      guessed.add(letter);
      btn.disabled = true;
      btn.style.opacity = '0.4';
      if (word.includes(letter)) {
        btn.style.background = '#4CAF50';
        btn.style.color = '#fff';
        renderWord();
        if (word.split('').every(c => guessed.has(c))) {
          gameOver = true;
          statusEl.textContent = '¡Ganaste! La palabra era ' + word;
          ctx.onWin();
        }
      } else {
        btn.style.background = '#E63946';
        btn.style.color = '#fff';
        mistakes++;
        drawHangman();
        if (mistakes >= MAX) {
          gameOver = true;
          statusEl.textContent = 'Game Over. La palabra era ' + word;
          ctx.onLose();
        }
      }
    }
    wrap.querySelector('#hm-reset').addEventListener('click', reset);
    reset();
  });

  // =====================================================================
  // 5. TRIVIA (preguntas estilo "Quién Quiere Ser Millonario")
  // =====================================================================
  reg('trivia', function (ctx) {
    // ctx.config.questions: [{ q: '...', options: ['a','b','c','d'], answer: 0 }]
    const questions = (ctx.config && ctx.config.questions) || [];
    const winThreshold = Math.ceil(questions.length * 0.7); // 70%
    let idx = 0, correct = 0, wrong = 0, finished = false;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div style="text-align:center;">
        <div id="tr-progress" style="font-weight:bold;margin-bottom:10px;"></div>
        <div id="tr-card" style="background:#1a1a1a;color:#FFD700;border:4px solid #FFD700;
             border-radius:14px;padding:16px;margin-bottom:14px;font-weight:900;
             text-shadow:1px 1px 0 #000;font-size:17px;"></div>
        <div id="tr-options" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>
        <div id="tr-status" style="margin-top:14px;font-weight:bold;font-size:16px;"></div>
      </div>
    `;
    ctx.container.appendChild(wrap);

    const card = wrap.querySelector('#tr-card');
    const opts = wrap.querySelector('#tr-options');
    const prog = wrap.querySelector('#tr-progress');
    const status = wrap.querySelector('#tr-status');
    const colors = ['#FF6B9D', '#4FC3F7', '#FFD700', '#A8E6CF'];

    function render() {
      if (idx >= questions.length || finished) return finish();
      prog.textContent = 'Pregunta ' + (idx + 1) + ' de ' + questions.length +
        '  |  Aciertos: ' + correct;
      const q = questions[idx];
      card.textContent = q.q;
      opts.innerHTML = '';
      q.options.forEach((o, j) => {
        const b = document.createElement('button');
        b.className = 'coeduca-btn';
        b.style.cssText = `background:${colors[j % 4]};color:#1a1a1a;
                           text-align:left;padding:10px;font-size:14px;`;
        b.innerHTML = '<b>' + 'ABCD'[j] + '.</b> ' + C.escapeHTML(o);
        b.addEventListener('click', () => answer(j, b, q.answer));
        opts.appendChild(b);
      });
    }
    function answer(picked, btn, correctIdx) {
      if (finished) return;
      [...opts.children].forEach((b, j) => {
        b.disabled = true;
        if (j === correctIdx) b.style.outline = '4px solid #4CAF50';
        if (j === picked && picked !== correctIdx) b.style.outline = '4px solid #E63946';
      });
      if (picked === correctIdx) correct++; else wrong++;
      setTimeout(() => { idx++; render(); }, 900);
    }
    function finish() {
      finished = true;
      status.textContent = 'Resultado: ' + correct + ' / ' + questions.length;
      if (correct >= winThreshold) {
        ctx.onWin();
      } else if (correct >= Math.floor(questions.length / 2)) {
        ctx.onTie();
      } else {
        ctx.onLose();
      }
    }
    render();
  });

})(typeof window !== 'undefined' ? window : this);
