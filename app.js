// /help-copyedit — Glossary Modal

function openGlossary() {
  document.getElementById("glossaryModal").classList.remove("hidden");
}

function closeGlossary() {
  document.getElementById("glossaryModal").classList.add("hidden");
}


// /help-copyedit — Feedback Modal

function openFeedback() {
  document.getElementById("feedbackModal").classList.remove("hidden");
  document.getElementById("feedback-form").classList.remove("hidden");
  document.getElementById("feedback-thanks").classList.add("hidden");
}

function closeFeedback() {
  document.getElementById("feedbackModal").classList.add("hidden");
  document.getElementById("feedback-text").value = "";
  document.getElementById("feedback-role").value = "";
  document.getElementById("feedback-name").value = "";
}

function submitFeedback() {
  var text = document.getElementById("feedback-text").value.trim();
  if (!text) return;

  var role = document.getElementById("feedback-role").value;
  var name = document.getElementById("feedback-name").value.trim();

  var payload = {
    feedback: text,
    role: role,
    name: name,
    source: "/help-copyedit"
  };

  navigator.sendBeacon(
    "https://hooks.slack.com/triggers/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",
    JSON.stringify(payload)
  );

  document.getElementById("feedback-form").classList.add("hidden");
  document.getElementById("feedback-thanks").classList.remove("hidden");
}

// /help-copyedit — Checking Engine & Renderer

(function () {
  "use strict";

  let rules = [];
  let compiledRules = [];
  let currentMode = "general";
  let liveCheckEnabled = false;
  let liveCheckTimer = null;

  // DOM refs — general mode
  const inputArea = document.getElementById("input-area");
  const checkBtn = document.getElementById("check-btn");
  const clearBtn = document.getElementById("clear-btn");
  const charCount = document.getElementById("char-count");
  const liveCheckToggle = document.getElementById("live-check-toggle");

  // DOM refs — results
  const resultsSection = document.getElementById("results-section");
  const resultsTitle = document.getElementById("results-title");
  const outputArea = document.getElementById("output-area");
  const issuePanel = document.getElementById("issue-panel");
  const emptyState = document.getElementById("empty-state");

  // ── Loading Toast ────────────────────────────────────────────

  var loadingMessages = [
    "Warming up the red pen…",
    "Hunting down jargon…",
    "Loading 328 ways to say \"actually, it's…\"",
    "Sharpening the style guide…",
    "Your copy called — it wants a second opinion.",
    "Proofreading the proofreader…",
    "Channeling our inner copy editor…",
    "Synergizing our — wait, that's jargon.",
    "Almost ready to judge your copy (lovingly).",
    "Let's make some copy sparkle ✨",
    "Removing the word \"utilize\" from the internet…",
    "Ctrl+Z won't save you here.",
    "Spellcheck, but make it fashion.",
    "This isn't a workflow. It's a vibe check.",
    "Making sure nobody writes \"seamless\" on our watch.",
    "One does not simply use the Oxford comma… or does one?",
    "Please hold while we highlight your copy.",
    "Don't worry, we won't tell anyone about the em dashes.",
    "We take \"first draft\" personally.",
    "Finding the perfect emoji 🤔",
    "Not selling saddles 🐴",
    "Uninstalling Teams...",
  ];

  (function showLoadingToast() {
    var toast = document.getElementById("loadingToast");
    var msgEl = document.getElementById("loadingMsg");
    var idx = Math.floor(Math.random() * loadingMessages.length);
    msgEl.textContent = loadingMessages[idx];
    toast.classList.remove("hidden");
  })();

  function dismissToast() {
    var toast = document.getElementById("loadingToast");
    toast.classList.add("fade-out");
    setTimeout(function () { toast.classList.add("hidden"); }, 400);
  }

  // ── Rule Loader ──────────────────────────────────────────────

  async function loadRules() {
    try {
      const res = await fetch("rules.json?v=" + Date.now());
      rules = await res.json();
      compiledRules = rules.map(function (rule) {
        return {
          id: rule.id,
          type: rule.type,
          regex: new RegExp(rule.pattern, rule.flags),
          message: rule.message,
          suggestion: rule.suggestion,
        };
      });
      setTimeout(dismissToast, 5000);
    } catch (e) {
      console.error("Failed to load rules:", e);
      setTimeout(dismissToast, 5000);
    }
  }

  // ── Checking Engine ──────────────────────────────────────────

  function checkText(text) {
    const matches = [];

    compiledRules.forEach(function (rule) {
      rule.regex.lastIndex = 0;
      let m;
      while ((m = rule.regex.exec(text)) !== null) {
        matches.push({
          start: m.index,
          end: m.index + m[0].length,
          matched: m[0],
          ruleId: rule.id,
          type: rule.type,
          message: rule.message,
          suggestion: rule.suggestion,
        });
        if (m[0].length === 0) rule.regex.lastIndex++;
      }
    });

    matches.sort(function (a, b) {
      if (a.start !== b.start) return a.start - b.start;
      return b.end - a.end;
    });

    return deduplicateMatches(matches);
  }

  function deduplicateMatches(matches) {
    const result = [];
    let lastEnd = -1;

    for (var i = 0; i < matches.length; i++) {
      if (matches[i].start >= lastEnd) {
        result.push(matches[i]);
        lastEnd = matches[i].end;
      }
    }

    return result;
  }

  // ── Renderer: Highlighted Output ─────────────────────────────

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderHighlights(text, matches) {
    if (matches.length === 0) {
      outputArea.textContent = text;
      return;
    }

    let html = "";
    let cursor = 0;

    matches.forEach(function (match, idx) {
      if (match.start > cursor) {
        html += escapeHtml(text.slice(cursor, match.start));
      }

      var cls = match.type === "jargon" ? "highlight-jargon" : match.type === "ai" ? "highlight-ai" : "highlight-editorial";
      html +=
        '<mark class="' + cls + '" data-issue-index="' + idx + '">' +
        escapeHtml(text.slice(match.start, match.end)) +
        "</mark>";

      cursor = match.end;
    });

    if (cursor < text.length) {
      html += escapeHtml(text.slice(cursor));
    }

    outputArea.innerHTML = html;
    bindHighlightHovers();
  }

  function renderStructuredHighlights(fields, allMatches) {
    let html = "";
    let globalIdx = 0;

    fields.forEach(function (field) {
      if (!field.text.trim()) return;

      html += '<span class="field-label">' + escapeHtml(field.label) + '</span>';

      let cursor = 0;
      field.matches.forEach(function (match) {
        if (match.start > cursor) {
          html += escapeHtml(field.text.slice(cursor, match.start));
        }
        var cls = match.type === "jargon" ? "highlight-jargon" : match.type === "ai" ? "highlight-ai" : "highlight-editorial";
        html +=
          '<mark class="' + cls + '" data-issue-index="' + globalIdx + '">' +
          escapeHtml(field.text.slice(match.start, match.end)) +
          "</mark>";
        cursor = match.end;
        globalIdx++;
      });

      if (cursor < field.text.length) {
        html += escapeHtml(field.text.slice(cursor));
      }

      html += "\n";
    });

    outputArea.innerHTML = html;
    bindHighlightHovers();
  }

  function bindHighlightHovers() {
    var marks = outputArea.querySelectorAll("mark");
    marks.forEach(function (mark) {
      mark.addEventListener("mouseenter", function () {
        var idx = mark.getAttribute("data-issue-index");
        var card = issuePanel.querySelector('[data-issue-index="' + idx + '"]');
        if (card) {
          card.classList.add("active");
          card.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
      mark.addEventListener("mouseleave", function () {
        var idx = mark.getAttribute("data-issue-index");
        var card = issuePanel.querySelector('[data-issue-index="' + idx + '"]');
        if (card) card.classList.remove("active");
      });
    });
  }

  // ── Copy to Clipboard ────────────────────────────────────────

  function copySuggestion(text, el) {
    var original = el.textContent;
    navigator.clipboard.writeText(text).then(function () {
      el.classList.add("copied");
      el.textContent = "Copied!";
      setTimeout(function () {
        el.classList.remove("copied");
        el.textContent = original;
      }, 1500);
    });
  }

  // ── Issue Count Badge ────────────────────────────────────────

  function updateBadge(btn, count) {
    // Remove existing badge
    var existing = btn.querySelector(".issue-badge-count");
    if (existing) existing.remove();

    if (count === null) return; // no badge (hasn't been checked yet)

    var badge = document.createElement("span");
    badge.className = "issue-badge-count" + (count === 0 ? " zero" : "");
    badge.textContent = count;
    btn.appendChild(badge);
  }

  // ── Renderer: Issue List ─────────────────────────────────────

  function renderIssueList(matches, charIssues) {
    issuePanel.innerHTML = "";

    matches.forEach(function (match, idx) {
      var card = document.createElement("div");
      card.className = "issue-card";
      card.setAttribute("data-issue-index", idx);

      var badge = document.createElement("div");
      badge.className = "issue-badge " + match.type;

      var body = document.createElement("div");
      body.className = "issue-body";

      var matched = document.createElement("div");
      matched.className = "issue-matched";
      matched.textContent = '"' + match.matched + '"';

      var message = document.createElement("div");
      message.className = "issue-message";
      if (match.type === "ai") {
        message.textContent = '"' + match.matched.charAt(0).toUpperCase() + match.matched.slice(1) + '" can sometimes be an AI tell. ' + match.message + ' Double-check before using.';
      } else {
        message.textContent = match.message;
      }

      var suggestion = document.createElement("div");
      suggestion.className = "issue-suggestion";
      var parts = match.suggestion.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      var tryLabel = document.createElement("strong");
      tryLabel.textContent = "Try: ";
      suggestion.appendChild(tryLabel);
      parts.forEach(function (part, i) {
        var chip = document.createElement("span");
        chip.className = "suggestion-chip";
        chip.textContent = part;
        chip.title = "Click to copy";
        chip.addEventListener("click", function (e) {
          e.stopPropagation();
          copySuggestion(part, chip);
        });
        suggestion.appendChild(chip);
        if (i < parts.length - 1) {
          suggestion.appendChild(document.createTextNode(", "));
        }
      });

      body.appendChild(matched);
      body.appendChild(message);
      body.appendChild(suggestion);
      card.appendChild(badge);
      card.appendChild(body);

      card.addEventListener("mouseenter", function () {
        var mark = outputArea.querySelector('mark[data-issue-index="' + idx + '"]');
        if (mark) mark.classList.add("active");
      });
      card.addEventListener("mouseleave", function () {
        var mark = outputArea.querySelector('mark[data-issue-index="' + idx + '"]');
        if (mark) mark.classList.remove("active");
      });
      card.addEventListener("click", function () {
        var mark = outputArea.querySelector('mark[data-issue-index="' + idx + '"]');
        if (mark) mark.scrollIntoView({ behavior: "smooth", block: "center" });
      });

      issuePanel.appendChild(card);
    });

    // Character limit issues
    if (charIssues && charIssues.length > 0) {
      charIssues.forEach(function (issue) {
        var card = document.createElement("div");
        card.className = "issue-card";

        var badge = document.createElement("div");
        badge.className = "issue-badge charlimit";

        var body = document.createElement("div");
        body.className = "issue-body";

        var matched = document.createElement("div");
        matched.className = "issue-matched";
        matched.textContent = issue.field;

        var message = document.createElement("div");
        message.className = "issue-message";
        message.textContent = issue.message;

        body.appendChild(matched);
        body.appendChild(message);
        card.appendChild(badge);
        card.appendChild(body);

        issuePanel.appendChild(card);
      });
    }
  }

  // ── Character Counter (General) ──────────────────────────────

  function updateCharCount() {
    var count = inputArea.value.length;
    charCount.textContent = count + " character" + (count !== 1 ? "s" : "");
  }

  // ── Field Character Counters (Structured) ────────────────────

  function updateFieldCounter(input) {
    var counter = input.closest(".field-group").querySelector(".field-counter");
    var countSpan = counter.querySelector(".field-count");
    var max = parseInt(counter.getAttribute("data-max") || "0", 10);
    var min = parseInt(counter.getAttribute("data-min") || "0", 10);
    var len = input.value.length;

    countSpan.textContent = len;

    counter.classList.remove("over", "near", "good");
    input.classList.remove("over-limit");

    if (max > 0 && len > max) {
      counter.classList.add("over");
      input.classList.add("over-limit");
    } else if (max > 0 && len > max * 0.9) {
      counter.classList.add("near");
    } else if (min > 0 && len >= min && len <= max) {
      counter.classList.add("good");
    }
  }

  let liveCheckStructured = { web: false, social: false };
  let liveCheckStructuredTimer = null;

  function scheduleStructuredLiveCheck(mode) {
    if (!liveCheckStructured[mode]) return;
    if (liveCheckStructuredTimer) clearTimeout(liveCheckStructuredTimer);
    liveCheckStructuredTimer = setTimeout(function () {
      runStructuredCheck(mode);
    }, 400);
  }

  function initFieldCounters() {
    var inputs = document.querySelectorAll(".field-input");
    inputs.forEach(function (input) {
      input.addEventListener("input", function () {
        updateFieldCounter(input);
        var panel = input.closest(".mode-panel");
        if (panel) {
          var mode = panel.id.replace("mode-", "");
          scheduleStructuredLiveCheck(mode);
        }
      });

      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          var mode = input.closest(".mode-panel").id.replace("mode-", "");
          runStructuredCheck(mode);
        }
      });
    });
  }

  // ── Live Check (debounced) ───────────────────────────────────

  function scheduleLiveCheck() {
    if (!liveCheckEnabled) return;
    if (liveCheckTimer) clearTimeout(liveCheckTimer);
    liveCheckTimer = setTimeout(function () {
      runGeneralCheck();
    }, 400);
  }

  // ── Structured Check (Web + Social) ──────────────────────────

  function getStructuredFields(mode) {
    var fields = [];
    var charIssues = [];
    var container;

    if (mode === "web") {
      container = document.getElementById("web-fields");
    } else if (mode === "social") {
      var activePlatform = document.querySelector(".platform-panel:not(.hidden)");
      container = activePlatform;
    }

    if (!container) return { fields: fields, charIssues: charIssues };

    var groups = container.querySelectorAll(".field-group");
    groups.forEach(function (group) {
      var label = group.querySelector("label").textContent;
      var input = group.querySelector(".field-input");
      var text = input.value;
      var counter = group.querySelector(".field-counter");
      var max = parseInt(counter.getAttribute("data-max") || "0", 10);
      var min = parseInt(counter.getAttribute("data-min") || "0", 10);

      if (text.trim()) {
        var matches = checkText(text);
        fields.push({ label: label, text: text, matches: matches });

        if (max > 0 && text.length > max) {
          charIssues.push({
            field: label,
            message: "Over limit: " + text.length + " / " + max + " characters (" + (text.length - max) + " over)."
          });
        }
        if (min > 0 && text.length < min) {
          charIssues.push({
            field: label,
            message: "Under recommended minimum: " + text.length + " / " + min + "–" + max + " characters."
          });
        }
      }
    });

    return { fields: fields, charIssues: charIssues };
  }

  function runStructuredCheck(mode) {
    var data = getStructuredFields(mode);
    var fields = data.fields;
    var charIssues = data.charIssues;

    // Find the check button for this mode
    var btn = document.querySelector('.check-structured-btn[data-mode="' + mode + '"]');

    if (fields.length === 0) {
      resultsSection.classList.add("hidden");
      emptyState.classList.add("hidden");
      if (btn) updateBadge(btn, null);
      return;
    }

    var allMatches = [];
    fields.forEach(function (field) {
      field.matches.forEach(function (m) {
        allMatches.push(m);
      });
    });

    var total = allMatches.length + charIssues.length;

    if (btn) updateBadge(btn, total);

    if (total === 0) {
      resultsSection.classList.add("hidden");
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");
    resultsSection.classList.remove("hidden");

    var jargonCount = allMatches.filter(function (m) { return m.type === "jargon"; }).length;
    var editorialCount = allMatches.filter(function (m) { return m.type === "editorial"; }).length;
    var aiCount = allMatches.filter(function (m) { return m.type === "ai"; }).length;

    var parts = [];
    if (editorialCount > 0) parts.push(editorialCount + " editorial");
    if (jargonCount > 0) parts.push(jargonCount + " jargon");
    if (aiCount > 0) parts.push(aiCount + " AI");
    if (charIssues.length > 0) parts.push(charIssues.length + " character limit");
    resultsTitle.textContent = total + " issue" + (total !== 1 ? "s" : "") + " found (" + parts.join(", ") + ")";

    renderStructuredHighlights(fields, allMatches);
    renderIssueList(allMatches, charIssues);
  }

  // ── Mode Switching ───────────────────────────────────────────

  function switchMode(mode) {
    currentMode = mode;

    document.querySelectorAll(".mode-tab").forEach(function (tab) {
      tab.classList.toggle("active", tab.getAttribute("data-mode") === mode);
    });

    document.querySelectorAll(".mode-panel").forEach(function (panel) {
      panel.classList.toggle("hidden", panel.id !== "mode-" + mode);
    });

    resultsSection.classList.add("hidden");
    emptyState.classList.add("hidden");
  }

  function switchPlatform(platform) {
    document.querySelectorAll(".platform-tab").forEach(function (tab) {
      tab.classList.toggle("active", tab.getAttribute("data-platform") === platform);
    });

    document.querySelectorAll(".platform-panel").forEach(function (panel) {
      panel.classList.toggle("hidden", panel.id !== "platform-" + platform);
    });

    resultsSection.classList.add("hidden");
    emptyState.classList.add("hidden");
  }

  // ── General Mode Actions ─────────────────────────────────────

  function runGeneralCheck() {
    var text = inputArea.value;
    if (!text.trim()) {
      resultsSection.classList.add("hidden");
      emptyState.classList.add("hidden");
      updateBadge(checkBtn, null);
      return;
    }

    var matches = checkText(text);

    updateBadge(checkBtn, matches.length);

    if (matches.length === 0) {
      resultsSection.classList.add("hidden");
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");
    resultsSection.classList.remove("hidden");

    var jargonCount = matches.filter(function (m) { return m.type === "jargon"; }).length;
    var editorialCount = matches.filter(function (m) { return m.type === "editorial"; }).length;
    var aiCount = matches.filter(function (m) { return m.type === "ai"; }).length;

    var parts = [];
    if (editorialCount > 0) parts.push(editorialCount + " editorial");
    if (jargonCount > 0) parts.push(jargonCount + " jargon");
    if (aiCount > 0) parts.push(aiCount + " AI");
    resultsTitle.textContent = matches.length + " issue" + (matches.length !== 1 ? "s" : "") + " found (" + parts.join(", ") + ")";

    renderHighlights(text, matches);
    renderIssueList(matches, []);
  }

  function clearGeneral() {
    inputArea.value = "";
    updateCharCount();
    updateBadge(checkBtn, null);
    resultsSection.classList.add("hidden");
    emptyState.classList.add("hidden");
    outputArea.innerHTML = "";
    issuePanel.innerHTML = "";
  }

  function clearStructured(mode) {
    var container;
    if (mode === "web") {
      container = document.getElementById("web-fields");
    } else if (mode === "social") {
      container = document.getElementById("mode-social");
    }

    if (container) {
      container.querySelectorAll(".field-input").forEach(function (input) {
        input.value = "";
        updateFieldCounter(input);
      });
    }

    var btn = document.querySelector('.check-structured-btn[data-mode="' + mode + '"]');
    if (btn) updateBadge(btn, null);

    resultsSection.classList.add("hidden");
    emptyState.classList.add("hidden");
    outputArea.innerHTML = "";
    issuePanel.innerHTML = "";
  }

  // ── Event Listeners ──────────────────────────────────────────

  // General mode
  inputArea.addEventListener("input", function () {
    updateCharCount();
    scheduleLiveCheck();
  });
  checkBtn.addEventListener("click", runGeneralCheck);
  clearBtn.addEventListener("click", clearGeneral);
  inputArea.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runGeneralCheck();
    }
  });

  // Live check toggle
  liveCheckToggle.addEventListener("change", function () {
    liveCheckEnabled = liveCheckToggle.checked;
    if (liveCheckEnabled && inputArea.value.trim()) {
      runGeneralCheck();
    }
  });

  // Structured live check toggles
  document.querySelectorAll(".live-check-structured").forEach(function (toggle) {
    toggle.addEventListener("change", function () {
      var mode = toggle.getAttribute("data-mode");
      liveCheckStructured[mode] = toggle.checked;
      if (toggle.checked) {
        runStructuredCheck(mode);
      }
    });
  });

  // Mode tabs
  document.querySelectorAll(".mode-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      switchMode(tab.getAttribute("data-mode"));
    });
  });

  // Platform tabs (social)
  document.querySelectorAll(".platform-tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      switchPlatform(tab.getAttribute("data-platform"));
    });
  });

  // Structured check/clear buttons
  document.querySelectorAll(".check-structured-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      runStructuredCheck(btn.getAttribute("data-mode"));
    });
  });

  document.querySelectorAll(".clear-structured-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      clearStructured(btn.getAttribute("data-mode"));
    });
  });

  // ── Init ─────────────────────────────────────────────────────

  loadRules();
  updateCharCount();
  initFieldCounters();
})();
