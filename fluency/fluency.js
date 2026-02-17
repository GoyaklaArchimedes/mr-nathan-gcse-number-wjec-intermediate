/* Mental Fluency Bank — Pillar B (Tables, Squares & Roots)
   No frameworks. Local progress via localStorage.
*/
(function () {
  "use strict";

  const STORAGE_KEY = "mn_fluency_pillarB_v1";

  const TOPICS = {
    B1: { id: "B1", name: "Tables (×)", kind: "tables" },
    B2: { id: "B2", name: "Division (÷)", kind: "division", requiresSecure: ["B1"] }, // optional lock
    B3: { id: "B3", name: "Squares (²)", kind: "squares" },
    B4: { id: "B4", name: "Square Roots (√)", kind: "roots", requiresSecure: ["B3"] } // optional lock
  };

  const MODES = {
    flash:   { id: "flash",   label: "Flash Recall",  n: Infinity, timed: false, secs: 0 },
    timed:   { id: "timed",   label: "Timed Burst",   n: 10,       timed: true,  secs: 60, minAccForTimePB: 80 },
    mastery: { id: "mastery", label: "Mastery Check", n: 20,       timed: false, secs: 0, passAcc: 90 }
  };

  // Question Formats: A Direct, B Missing, C Inverse
  const FORMATS = ["A", "B", "C"];

  function nowMs() { return Date.now(); }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return normaliseState(parsed);
    } catch {
      return defaultState();
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function defaultState() {
    const topicState = {};
    Object.values(TOPICS).forEach(t => {
      topicState[t.id] = {
        secure: false,
        bestAccuracy: null,
        bestTimeMs: null  // only for timed mode PB (with ≥80% accuracy)
      };
    });
    return { topicState };
  }

  function normaliseState(s) {
    const d = defaultState();
    if (!s || !s.topicState) return d;
    for (const tid of Object.keys(d.topicState)) {
      if (!s.topicState[tid]) continue;
      d.topicState[tid].secure = !!s.topicState[tid].secure;
      d.topicState[tid].bestAccuracy = numberOrNull(s.topicState[tid].bestAccuracy);
      d.topicState[tid].bestTimeMs = numberOrNull(s.topicState[tid].bestTimeMs);
    }
    return d;
  }

  function numberOrNull(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  function randInt(min, max) {
    // inclusive
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pick(arr) {
    return arr[randInt(0, arr.length - 1)];
  }

  function fmtTime(ms) {
    const s = Math.round(ms / 100) / 10;
    return `${s}s`;
  }

  function isTopicLocked(topicId, state, locksEnabled) {
    if (!locksEnabled) return false;
    const t = TOPICS[topicId];
    if (!t.requiresSecure || t.requiresSecure.length === 0) return false;
    return t.requiresSecure.some(reqId => !state.topicState[reqId]?.secure);
  }

  // ---------- Question generation ----------
  // Returns: { id, prompt, answer } where answer is integer string
  function generateQuestion(topicKind, format, usedSet) {
    // Try a few times to avoid duplicates in a session
    for (let attempt = 0; attempt < 50; attempt++) {
      let q = null;
      if (topicKind === "tables") q = genTables(format);
      else if (topicKind === "division") q = genDivision(format);
      else if (topicKind === "squares") q = genSquares(format);
      else if (topicKind === "roots") q = genRoots(format);
      else q = genTables(format);

      if (!usedSet.has(q.id)) {
        usedSet.add(q.id);
        return q;
      }
    }
    // Fallback: allow duplicate if exhausted
    return genTables(format);
  }

  function genTables(format) {
    // a,b in 1..12
    const a = randInt(1, 12);
    const b = randInt(1, 12);
    const ans = a * b;

    if (format === "B") {
      // Missing number: ? × b = ans OR a × ? = ans
      if (Math.random() < 0.5) {
        return {
          id: `T:B:?x${b}=${ans}`,
          prompt: `? × ${b} = ${ans}`,
          answer: String(a)
        };
      }
      return {
        id: `T:B:${a}x?=${ans}`,
        prompt: `${a} × ? = ${ans}`,
        answer: String(b)
      };
    }

    // A or C: direct recall variant
    return {
      id: `T:${format}:${a}x${b}`,
      prompt: `${a} × ${b} = ?`,
      answer: String(ans)
    };
  }

  function genDivision(format) {
    // Use inverse of tables: pick a,b in 1..12; dividend = a*b
    const a = randInt(1, 12);
    const b = randInt(1, 12);
    const dividend = a * b;

    if (format === "B") {
      // Missing divisor: 144 ÷ ? = 12
      return {
        id: `D:B:${dividend}/?=${b}`,
        prompt: `${dividend} ÷ ? = ${b}`,
        answer: String(a)
      };
    }

    // A or C: direct
    return {
      id: `D:${format}:${dividend}/${a}`,
      prompt: `${dividend} ÷ ${a} = ?`,
      answer: String(b)
    };
  }

  function genSquares(format) {
    const n = randInt(1, 25);
    const sq = n * n;

    if (format === "B") {
      return {
        id: `S:B:?^2=${sq}`,
        prompt: `?² = ${sq}`,
        answer: String(n)
      };
    }
    // A or C: direct
    return {
      id: `S:${format}:${n}^2`,
      prompt: `${n}² = ?`,
      answer: String(sq)
    };
  }

  function genRoots(format) {
    const n = randInt(1, 25);
    const sq = n * n;

    if (format === "B") {
      // √? = n  (so ? = n^2)
      return {
        id: `R:B:sqrt?=${n}`,
        prompt: `√? = ${n}`,
        answer: String(sq)
      };
    }
    // A or C: direct root
    return {
      id: `R:${format}:sqrt${sq}`,
      prompt: `√${sq} = ?`,
      answer: String(n)
    };
  }

  // ---------- Dashboard ----------
  function renderDashboard({ mountId, resetBtnId, locksEnabled }) {
    const mount = document.getElementById(mountId);
    const resetBtn = document.getElementById(resetBtnId);
    if (!mount) return;

    const state = loadState();

    const rows = Object.values(TOPICS).map(t => {
      const locked = isTopicLocked(t.id, state, locksEnabled);
      const ts = state.topicState[t.id];

      const bestAcc = (ts.bestAccuracy == null) ? "—" : `${ts.bestAccuracy}%`;
      const bestTime = (ts.bestTimeMs == null) ? "—" : fmtTime(ts.bestTimeMs);
      const secureMark = ts.secure ? "✔ Secure" : "⬜ Not secure";

      const buttons = [
        mkLinkBtn(t, "flash", locked),
        mkLinkBtn(t, "timed", locked),
        mkLinkBtn(t, "mastery", locked)
      ].join("");

      return `
        <div class="topic-row ${locked ? "locked" : ""}">
          <div class="topic-name">
            <div class="t-title">${t.name}</div>
            <div class="t-sub">Best accuracy: <strong>${bestAcc}</strong> · Best time: <strong>${bestTime}</strong></div>
          </div>
          <div class="topic-btns">${buttons}</div>
          <div class="topic-secure">${secureMark}</div>
        </div>
      `;
    }).join("");

    mount.innerHTML = rows;

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        localStorage.removeItem(STORAGE_KEY);
        renderDashboard({ mountId, resetBtnId, locksEnabled });
      });
    }
  }

  function mkLinkBtn(topic, modeId, locked) {
    const label = modeId === "flash" ? "Flash" : modeId === "timed" ? "Timed" : "Mastery";
    const href = locked ? "#" : `quiz.html?topic=${encodeURIComponent(topic.id)}&mode=${encodeURIComponent(modeId)}`;
    const disabledAttr = locked ? `aria-disabled="true" tabindex="-1"` : "";
    const cls = locked ? "btn btn-disabled" : "btn";
    return `<a class="${cls}" ${disabledAttr} href="${href}">${label}</a>`;
  }

  // ---------- Quiz runner ----------
  function startQuizFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const topicId = (params.get("topic") || "B1").toUpperCase();
    const modeId = (params.get("mode") || "flash").toLowerCase();

    const topic = TOPICS[topicId] || TOPICS.B1;
    const mode = MODES[modeId] || MODES.flash;

    runQuiz(topic, mode);
  }

  function runQuiz(topic, mode) {
    const els = getQuizEls();
    if (!els) return;
       // --- Mode-based UI control (Flash only shows Reveal + Next) ---
  const isFlash = mode.id === "flash";

  if (els.revealBtn) {
    els.revealBtn.style.display = isFlash ? "inline-block" : "none";
  }

  if (els.nextFlashBtn) {
    els.nextFlashBtn.style.display = isFlash ? "inline-block" : "none";
  }

  if (els.modeHint) {
    els.modeHint.style.display = isFlash ? "block" : "none";
  }

     
    

    const state = loadState();

    els.quizTitle.textContent = `Pillar B — ${topic.name}`;
    els.quizSubtitle.textContent = mode.label;

    els.modeHint.textContent = modeIdLabel(mode.id);

    // Back button
    els.backBtn.addEventListener("click", () => {
      window.location.href = "index.html";
    });

    // Session config
    const totalQuestions = (mode.id === "flash") ? Infinity : mode.n;
    const used = new Set();
    const startTime = nowMs();

    let timerId = null;
    let timeLeft = mode.secs;
    let ended = false;

    const session = {
      topic,
      mode,
      totalQuestions,
      used,
      index: 0,
      correct: 0,
      attempted: 0,
      startTime,
      questions: [],
      current: null
    };

    // Timer (timed mode only)
    if (mode.timed) {
      els.timerWrap.hidden = false;
      els.timer.textContent = String(timeLeft);
      timerId = setInterval(() => {
        if (ended) return;
        timeLeft -= 1;
        els.timer.textContent = String(Math.max(0, timeLeft));
        if (timeLeft <= 0) {
          endSession(session, state, els);
           
        }
      }, 1000);
    }

    // Controls visibility
    if (mode.id === "flash") {
      els.flashControls.hidden = false;
      els.answerForm.hidden = true;
      setupFlashControls(session, state, els);
      nextQuestion(session, els); // show first
    } else {
      els.flashControls.hidden = true;
      els.answerForm.hidden = false;
      setupQuizControls(session, state, els);
      nextQuestion(session, els); // show first
      els.answerInput.focus();
    }

    function cleanup() {
      ended = true;
      if (timerId) clearInterval(timerId);
    }

    function endSession(session, state, els) {
      if (ended) return;
      cleanup();

      // Hide input controls
      els.answerForm.hidden = true;
      els.flashControls.hidden = true;

      const durationMs = nowMs() - session.startTime;
      const acc = session.attempted === 0 ? 0 : Math.round((session.correct / session.attempted) * 100);

      // Update per-topic PBs (for timed + mastery)
      const ts = state.topicState[session.topic.id];

      // Best accuracy (any non-flash session)
      if (session.mode.id !== "flash") {
        if (ts.bestAccuracy == null || acc > ts.bestAccuracy) ts.bestAccuracy = acc;
      }

      // Best time (timed mode only, with accuracy threshold)
      if (session.mode.id === "timed") {
        if (acc >= MODES.timed.minAccForTimePB) {
          if (ts.bestTimeMs == null || durationMs < ts.bestTimeMs) ts.bestTimeMs = durationMs;
        }
      }

      // Secure logic (mastery only)
      let masteryPassed = false;
      if (session.mode.id === "mastery") {
        masteryPassed = (acc >= MODES.mastery.passAcc);
        if (masteryPassed) ts.secure = true;
      }

      saveState(state);

      // Results
      const lines = [];
      lines.push(`<h3>Results</h3>`);
      lines.push(`<p><strong>Score:</strong> ${session.correct} / ${session.attempted} (${acc}%)</p>`);
      if (session.mode.id === "timed") {
        lines.push(`<p><strong>Time taken:</strong> ${fmtTime(durationMs)}</p>`);
        lines.push(`<p class="small-note">Best time only updates when accuracy is ${MODES.timed.minAccForTimePB}% or higher.</p>`);
      } else if (session.mode.id === "mastery") {
        lines.push(`<p><strong>Mastery requirement:</strong> ${MODES.mastery.passAcc}%</p>`);
        lines.push(`<p><strong>Status:</strong> ${masteryPassed ? "✔ Secure" : "Not secure yet"}</p>`);
        lines.push(`<p class="small-note">If you had to think, repeat Flash mode until answers feel instant.</p>`);
      }

      // Add review of incorrect attempts
      const wrongs = session.questions.filter(q => q.userAnswer != null && q.userAnswer !== q.answer);
      if (wrongs.length > 0) {
        const list = wrongs.slice(0, 8).map(q => `<li>${escapeHtml(q.prompt)} <span class="muted">(answer: ${escapeHtml(q.answer)})</span></li>`).join("");
        lines.push(`<details><summary>Review a few you missed (${wrongs.length})</summary><ul>${list}</ul></details>`);
      }

      lines.push(`<div class="actions">
        <a class="btn" href="quiz.html?topic=${encodeURIComponent(session.topic.id)}&mode=${encodeURIComponent(session.mode.id)}">Repeat</a>
        <a class="btn btn-ghost" href="index.html">Back to Pillar B</a>
      </div>`);

      els.results.innerHTML = lines.join("");
      els.results.hidden = false;
      els.feedback.textContent = "";
    }

    // Wire session end on unload safety
    window.addEventListener("beforeunload", () => cleanup(), { once: true });

    // Make endSession accessible in controls:
    session._end = () => endSession(session, state, els);
  }

  function setupFlashControls(session, state, els) {
    els.revealBtn.addEventListener("click", () => {
      if (!session.current) return;
      els.answerBox.textContent = session.current.answer;
      els.answerBox.hidden = false;
      els.nextFlashBtn.focus();
    });

    els.nextFlashBtn.addEventListener("click", () => {
      els.answerBox.hidden = true;
      els.answerBox.textContent = "";
      nextQuestion(session, els);
    });
  }

  function setupQuizControls(session, state, els) {
    els.answerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!session.current) return;

      const raw = (els.answerInput.value || "").trim();
      if (raw.length === 0) return;

      const user = sanitiseIntegerString(raw);
      if (user == null) {
        els.feedback.textContent = "Please enter a whole number.";
        return;
      }

      recordAnswer(session, user, els);
      els.answerInput.value = "";
      
      if (session.mode.id !== "flash") els.answerInput.focus();
    });
  }
function recordAnswer(session, userAnswerOrNull, els) {

  session.attempted += 1;

  const q = session.current;
  q.userAnswer = (userAnswerOrNull === null) ? null : String(userAnswerOrNull);

  const correct =
    (userAnswerOrNull !== null &&
     String(userAnswerOrNull) === q.answer);

  if (correct) session.correct += 1;

  /* ---------- FLASH ---------- */
  if (session.mode.id === "flash") {

    if (correct) {
      els.feedback.textContent = "✓";
      setTimeout(() => nextQuestion(session, els), 500);
    } else {
      els.feedback.textContent = `✗  ${q.answer}`;
      setTimeout(() => nextQuestion(session, els), 2000);
    }

    return;
  }

  /* ---------- TIMED ---------- */
  if (session.mode.id === "timed") {

  if (session.attempted >= session.totalQuestions) {
    session._end();
    return;
  }

  if (correct) {
    els.feedback.textContent = "✓";
    setTimeout(() => nextQuestion(session, els), 200);
  } else {
    els.feedback.textContent = `✗  ${q.answer}`;
    setTimeout(() => nextQuestion(session, els), 2000);
  }

  return;
}


  /* ---------- MASTERY ---------- */
  if (session.mode.id === "mastery") {

    if (!correct) {
      els.feedback.textContent = `✗  ${q.answer}`;
    } else {
      els.feedback.textContent = "✓";
    }

    if (session.attempted >= session.totalQuestions) {
      session._end();
      return;
    }

    setTimeout(() => {
      els.feedback.textContent = "";
      nextQuestion(session, els);
    }, 300);
  }
}




  function nextQuestion(session, els) {
    const topicKind = session.topic.kind;

    // Decide format
    const fmt = pick(FORMATS);

    // Generate
    const q = generateQuestion(topicKind, fmt, session.used);
    session.current = q;

    // Track for review in non-flash
    if (session.mode.id !== "flash") session.questions.push(q);

    // Render
    els.questionText.textContent = q.prompt;

    // Progress label
    if (session.mode.id === "flash") {
      els.progress.textContent = "Flash mode (no score)";
    } else {
      const n = session.attempted + 1;
      els.progress.textContent = `Question ${n} of ${session.totalQuestions}`;
    }
  }

  function updateProgress(session, els) {
    // already updated in nextQuestion
  }

  function modeIdLabel(modeId) {
    if (modeId === "flash") return "Say it first";
    if (modeId === "timed") return "Steady speed";
    return "Secure it";
  }

  function getQuizEls() {
    const ids = [
      "quizTitle","quizSubtitle","timerWrap","timer","progress","modeHint",
      "backBtn","questionText","flashControls","revealBtn","answerBox","nextFlashBtn",
      "answerForm","answerInput","feedback","results"
    ];
    const els = {};
    for (const id of ids) {
      els[id] = document.getElementById(id);
      if (!els[id] && id !== "timerWrap") {
        // timerWrap may be absent in some future reuse; tolerate
      }
    }
    // normalise names
    return {
      quizTitle: els.quizTitle,
      quizSubtitle: els.quizSubtitle,
      timerWrap: els.timerWrap,
      timer: els.timer,
      progress: els.progress,
      modeHint: els.modeHint,
      backBtn: els.backBtn,
      questionText: els.questionText,
      flashControls: els.flashControls,
      revealBtn: els.revealBtn,
      answerBox: els.answerBox,
      nextFlashBtn: els.nextFlashBtn,
      answerForm: els.answerForm,
      answerInput: els.answerInput,
      feedback: els.feedback,
      results: els.results
    };
  }

  function sanitiseIntegerString(raw) {
    // Allow leading minus just in case future extensions add negatives
    if (!/^[-]?\d+$/.test(raw)) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return String(Math.trunc(n));
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------- Public API ----------
  window.Fluency = {
    renderDashboard,
    startQuizFromQuery
  };
})();
