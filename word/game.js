/*
 * Word Trails — adaptive DOM/CSS playable ad.
 *
 * The creative and level data live in creative.json so producers can change a
 * hook, word set or funnel without editing interaction code. The source demo
 * loads that file; build.js embeds the exact same JSON into the single-file ad.
 */
(function () {
  'use strict';

  var config, creative;
  var board = document.getElementById('board');
  var wheel = document.getElementById('wheel');
  var candidate = document.getElementById('candidate');
  var traceLine = document.getElementById('trace-line');
  var selected = [];
  var letterButtons = [];
  var found = {};
  var selecting = false;
  var locked = false;
  var hintGeneration = 0;
  var hintWord = '';
  var hintDepth = 0;
  var cellByKey = {};

  // A small pause-aware scheduler keeps funnel transitions from completing while
  // an ad is hidden. It replaces gameplay setTimeout calls and survives an
  // orientation change without resetting state.
  var scheduled = [];
  var schedulerPaused = false;
  var pausedAt = 0;
  function after(ms, fn) { scheduled.push({ at: performance.now() + ms, fn: fn }); }
  function schedulerFrame(now) {
    if (!schedulerPaused) {
      for (var i = scheduled.length - 1; i >= 0; i--) {
        if (now >= scheduled[i].at) {
          var task = scheduled.splice(i, 1)[0];
          try { task.fn(); } catch (e) { setTimeout(function () { throw e; }, 0); }
        }
      }
    }
    requestAnimationFrame(schedulerFrame);
  }
  requestAnimationFrame(schedulerFrame);

  function loadCreative(done) {
    var el = document.getElementById('creative-config');
    var embedded = el.textContent.replace(/^\s+|\s+$/g, '');
    if (embedded) {
      try { done(null, JSON.parse(embedded)); } catch (e) { done(e); }
      return;
    }
    fetch(el.getAttribute('data-src'))
      .then(function (r) { if (!r.ok) throw new Error('Creative config returned ' + r.status); return r.json(); })
      .then(function (data) { done(null, data); })
      .catch(function (err) { done(err); });
  }

  function boot(data) {
    config = data;
    creative = config.variants[PlayableAd.variant()] || config.variants.a;
    if (!creative) throw new Error('No playable variant is configured');

    document.getElementById('hook').textContent = creative.hook;
    document.getElementById('instruction').textContent = creative.instruction;
    document.getElementById('end-title').textContent = creative.endTitle;
    document.getElementById('end-copy').textContent = creative.endCopy;

    buildBoard();
    buildProgress();
    buildWheel();
    wireControls();
    resetHintTimer();

    document.getElementById('loader').classList.add('hide');
    PlayableAd.track('game_loaded', {
      game: config.id,
      variant: PlayableAd.variant(),
      orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
    });
  }

  function buildBoard() {
    var lettersAt = {};
    creative.words.forEach(function (word) {
      if (word.cells.length !== word.text.length) throw new Error('Cell count mismatch for ' + word.text);
      word.cells.forEach(function (pos, i) {
        var key = pos[0] + ':' + pos[1];
        if (lettersAt[key] && lettersAt[key] !== word.text.charAt(i)) throw new Error('Conflicting letter at ' + key);
        lettersAt[key] = word.text.charAt(i);
      });
    });

    board.style.gridTemplateColumns = 'repeat(' + creative.cols + ', 1fr)';
    board.style.gridTemplateRows = 'repeat(' + creative.rows + ', 1fr)';
    board.style.aspectRatio = creative.cols + ' / ' + creative.rows;
    for (var row = 0; row < creative.rows; row++) {
      for (var col = 0; col < creative.cols; col++) {
        var key = row + ':' + col;
        var cell = document.createElement('div');
        cell.className = lettersAt[key] ? 'cell' : 'cell empty';
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', lettersAt[key] ? 'Hidden letter' : '');
        cell.dataset.letter = lettersAt[key] || '';
        board.appendChild(cell);
        cellByKey[key] = cell;
      }
    }
  }

  function buildProgress() {
    var wrap = document.getElementById('progress-dots');
    creative.words.forEach(function (_, i) {
      var dot = document.createElement('span');
      dot.className = 'progress-dot';
      dot.dataset.index = i;
      wrap.appendChild(dot);
    });
  }

  function buildWheel() {
    var count = creative.letters.length;
    creative.letters.forEach(function (letter, i) {
      var angle = -Math.PI / 2 + i * Math.PI * 2 / count;
      var x = 50 + Math.cos(angle) * 34;
      var y = 50 + Math.sin(angle) * 34;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'letter';
      button.textContent = letter;
      button.dataset.index = i;
      button.dataset.x = x;
      button.dataset.y = y;
      button.setAttribute('aria-label', 'Letter ' + letter);
      button.style.left = x + '%';
      button.style.top = y + '%';
      button.addEventListener('pointerdown', beginSelection);
      wheel.appendChild(button);
      letterButtons.push(button);
    });
  }

  function beginSelection(e) {
    if (locked || selecting) return;
    e.preventDefault();
    SFX.unlock();
    selecting = true;
    selected = [];
    candidate.className = 'candidate';
    addLetter(e.currentTarget);
    resetHintTimer();
    PlayableAd.track('word_swipe_started');
  }

  function onPointerMove(e) {
    if (!selecting) return;
    e.preventDefault();
    var hit = document.elementFromPoint(e.clientX, e.clientY);
    if (!hit) return;
    var button = hit.closest ? hit.closest('.letter') : null;
    if (button && wheel.contains(button)) addLetter(button);
  }

  function addLetter(button) {
    var index = Number(button.dataset.index);
    if (selected.indexOf(index) !== -1) return;
    selected.push(index);
    button.classList.add('selected');
    button.classList.remove('hinted');
    SFX.tick();
    redrawSelection();
  }

  function redrawSelection() {
    var text = '';
    var points = [];
    selected.forEach(function (index) {
      var b = letterButtons[index];
      text += creative.letters[index];
      points.push(b.dataset.x + ',' + b.dataset.y);
    });
    candidate.textContent = text;
    traceLine.setAttribute('points', points.join(' '));
  }

  function finishSelection() {
    if (!selecting) return;
    selecting = false;
    var text = selected.map(function (i) { return creative.letters[i]; }).join('');
    var match = null;
    for (var i = 0; i < creative.words.length; i++) {
      if (creative.words[i].text === text && !found[text]) { match = creative.words[i]; break; }
    }
    if (match) acceptWord(match, i);
    else rejectWord(text);
  }

  function acceptWord(word, wordIndex) {
    locked = true;
    found[word.text] = true;
    hintWord = '';
    hintDepth = 0;
    candidate.textContent = word.text;
    candidate.className = 'candidate success';
    SFX.win();

    word.cells.forEach(function (pos, i) {
      var cell = cellByKey[pos[0] + ':' + pos[1]];
      cell.textContent = word.text.charAt(i);
      cell.setAttribute('aria-label', 'Letter ' + word.text.charAt(i));
      cell.classList.remove('just-revealed');
      // force a fresh animation when a crossing word reuses this square
      void cell.offsetWidth;
      cell.classList.add('just-revealed');
    });

    document.querySelector('.progress-dot[data-index="' + wordIndex + '"]').classList.add('done');
    var complete = Object.keys(found).length;
    var flowers = document.querySelectorAll('.flower');
    if (flowers[complete - 1]) flowers[complete - 1].classList.add('bloom');
    PlayableAd.track('word_found', { word: word.text, number: complete });

    after(560, function () {
      clearSelection();
      locked = false;
      if (complete === creative.words.length) completePuzzle();
      else resetHintTimer();
    });
  }

  function rejectWord(text) {
    candidate.textContent = text.length > 1 ? 'TRY AGAIN' : 'KEEP SWIPING';
    candidate.className = 'candidate error';
    SFX.lose();
    PlayableAd.track('word_rejected', { letters: text });
    after(430, clearSelection);
    resetHintTimer();
  }

  function clearSelection() {
    selected = [];
    letterButtons.forEach(function (b) { b.classList.remove('selected'); });
    traceLine.setAttribute('points', '');
    candidate.textContent = '';
    candidate.className = 'candidate';
  }

  function completePuzzle() {
    locked = true;
    candidate.textContent = 'GARDEN COMPLETE!';
    candidate.className = 'candidate success';
    SFX.bigWin();
    PlayableAd.track('puzzle_complete');
    after(config.timing.endCardDelayMs, showEndCard);
  }

  function showEndCard() {
    var endcard = document.getElementById('endcard');
    endcard.classList.add('show');
    endcard.setAttribute('aria-hidden', 'false');
    PlayableAd.track('endcard_shown');
  }

  function showHint(advance) {
    var next = null;
    for (var i = 0; i < creative.words.length; i++) {
      if (!found[creative.words[i].text]) { next = creative.words[i]; break; }
    }
    if (!next) return;

    // The first hint supplies the starting letter. Each deliberate press of the
    // hint button advances one more character instead of repeating the same tip.
    if (hintWord !== next.text) {
      hintWord = next.text;
      hintDepth = 0;
    }
    if (hintDepth === 0 || advance) hintDepth = Math.min(next.text.length, hintDepth + 1);

    var hintedLetter = next.text.charAt(hintDepth - 1);
    var wheelIndex = creative.letters.indexOf(hintedLetter);
    if (wheelIndex >= 0) {
      letterButtons[wheelIndex].classList.remove('hinted');
      void letterButtons[wheelIndex].offsetWidth;
      letterButtons[wheelIndex].classList.add('hinted');
    }

    var prefix = next.text.slice(0, hintDepth).split('').join(' → ');
    candidate.textContent = hintDepth === 1 ? 'START WITH ' + hintedLetter : 'NEXT: ' + hintedLetter + '  ·  ' + prefix;
    candidate.className = 'candidate';
    var hintButton = document.getElementById('hint');
    hintButton.textContent = hintDepth < next.text.length ? 'Show next letter' : 'Word revealed';
    hintButton.disabled = hintDepth >= next.text.length;
    PlayableAd.track('hint_used', { wordLength: next.text.length, letterPosition: hintDepth });
  }

  function resetHintTimer() {
    var generation = ++hintGeneration;
    var hintButton = document.getElementById('hint');
    hintButton.disabled = false;
    hintButton.textContent = hintDepth ? 'Show next letter' : 'Need a hint?';
    after(config.timing.hintDelayMs, function () {
      if (generation === hintGeneration && !selecting && !locked) showHint(false);
    });
  }

  function wireControls() {
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', finishSelection);
    window.addEventListener('pointercancel', finishSelection);
    document.getElementById('hint').addEventListener('click', function () { hintGeneration++; showHint(true); });
    document.getElementById('mute').addEventListener('click', function () {
      var muted = SFX.toggleMuted();
      this.textContent = muted ? '🔇' : '🔊';
      this.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.install'), function (button) {
      button.addEventListener('click', function () { PlayableAd.install(); });
    });

    var orientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    window.addEventListener('resize', function () {
      var next = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
      if (next !== orientation) {
        orientation = next;
        PlayableAd.track('orientation_changed', { orientation: next });
      }
    });

    PlayableAd.onPauseChange(function (paused) {
      schedulerPaused = paused;
      document.body.classList.toggle('paused', paused);
      if (paused) {
        pausedAt = performance.now();
        SFX.suspend();
      } else {
        var delta = performance.now() - pausedAt;
        scheduled.forEach(function (task) { task.at += delta; });
        pausedAt = 0;
        SFX.resume();
      }
    });
  }

  PlayableAd.onReady(function () {
    loadCreative(function (err, data) {
      if (err) {
        document.getElementById('loader').textContent = 'CREATIVE CONFIG ERROR';
        console.error(err);
        return;
      }
      try { boot(data); }
      catch (e) {
        document.getElementById('loader').textContent = 'PLAYABLE SETUP ERROR';
        console.error(e);
      }
    });
  });
})();
