(function () {
  "use strict";

  // ---------------------------------------------------------
  // CONFIG — fill this in with your n8n PRODUCTION webhook URL
  // (Journal Viewer workflow → Webhook node → "Production URL")
  // ---------------------------------------------------------
  var API_ENDPOINT = "https://wsuzs1sr.rpcld.cc/webhook/viewjournal";
  var TOKEN_PARAM = "token"; // the query param this page reads, e.g. ?token=DJ-20260829-XXXXXX

  // ---------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------
  function escapeHTML(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (!value) return "";
    var date = new Date(value);
    if (isNaN(date.getTime())) return escapeHTML(value);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  // Used by the TOP SUMMARY.
  // This remains based on the actual numeric P&L.
  function moneyClass(n) {
    if (n > 0) return "profit";
    if (n < 0) return "loss";
    return "neutral";
  }

  // Used by the individual trade OUTCOME badge.
  function outcomeClass(outcome) {
    var o = (outcome || "").toLowerCase();
    if (o === "win") return "outcome-win";
    if (o === "loss") return "outcome-loss";
    return "outcome-breakeven";
  }

  // Used by the individual trade P&L.
  // The P&L colour now follows the selected trade outcome.
  function pnlOutcomeClass(outcome) {
    var o = (outcome || "").toLowerCase();

    if (o === "win") return "profit";
    if (o === "loss") return "loss";
    return "neutral";
  }

  function directionClass(direction) {
    return (direction || "").toLowerCase() === "buy" ? "buy" : "sell";
  }

  function directionArrow(direction) {
    return (direction || "").toLowerCase() === "buy" ? "&#8599;" : "&#8600;";
  }

  function getToken() {
    var params = new URLSearchParams(window.location.search);
    return params.get(TOKEN_PARAM) || "";
  }

  // ---------------------------------------------------------
  // STATE ELEMENTS
  // ---------------------------------------------------------
  var states = {
    loading: document.getElementById("loadingState"),
    noToken: document.getElementById("noTokenState"),
    notFound: document.getElementById("notFoundState"),
    error: document.getElementById("errorState"),
    emptyTrades: document.getElementById("emptyTradesState"),
    journal: document.getElementById("journal")
  };

  function showState(name) {
    Object.keys(states).forEach(function (key) {
      states[key].hidden = key !== name;
    });
  }

  // ---------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------
  function renderStats(data) {
    var pnlFormatted =
      data.total_pnl >= 0
        ? "+$" + data.total_pnl.toFixed(2)
        : "-$" + Math.abs(data.total_pnl).toFixed(2);

    var cells = [
      { label: "Trades", value: data.total_trades, cls: "" },
      { label: "Net P&amp;L", value: pnlFormatted, cls: moneyClass(data.total_pnl) },
      { label: "Win Rate", value: data.win_rate + "%", cls: "" },
      { label: "Wins", value: data.wins, cls: "profit" },
      { label: "Losses", value: data.losses, cls: "loss" },
      { label: "Breakeven", value: data.breakeven, cls: "neutral" }
    ];

    return cells.map(function (c) {
      return (
        '<div class="stat">' +
          '<span>' + c.label + '</span>' +
          '<strong class="' + c.cls + '">' + escapeHTML(c.value) + '</strong>' +
        '</div>'
      );
    }).join("");
  }

  function renderTradeCard(trade) {
    // Individual trade P&L colour now follows the trade outcome.
    var pnlClass = pnlOutcomeClass(trade.outcome);

    var oClass = outcomeClass(trade.outcome);
    var dClass = directionClass(trade.direction);
    var arrow = directionArrow(trade.direction);

    var notesHTML = trade.notes
      ? (
          '<div class="notes">' +
            '<div class="notes-title">NOTES / EMOTIONS</div>' +
            '<div class="notes-content">' + escapeHTML(trade.notes) + '</div>' +
          '</div>'
        )
      : "";

    var shots = [];

    if (trade.before_screenshot) {
      shots.push(
        '<a class="screenshot" href="' + trade.before_screenshot + '" target="_blank" rel="noopener">' +
          '<img src="' + trade.before_screenshot + '" alt="Before trade screenshot" loading="lazy">' +
          '<div class="image-label">BEFORE</div>' +
        '</a>'
      );
    }

    if (trade.after_screenshot) {
      shots.push(
        '<a class="screenshot" href="' + trade.after_screenshot + '" target="_blank" rel="noopener">' +
          '<img src="' + trade.after_screenshot + '" alt="After trade screenshot" loading="lazy">' +
          '<div class="image-label">AFTER</div>' +
        '</a>'
      );
    }

    var screenshotsHTML = shots.length
      ? (
          '<div class="screenshots-title">TRADE SCREENSHOTS</div>' +
          '<div class="screenshots">' + shots.join("") + '</div>'
        )
      : "";

    return (
      '<div class="trade-card">' +
        '<div class="card-head">' +
          '<span class="step-num">' + String(trade.number).padStart(2, "0") + '</span>' +
          '<div class="head-text">' +
            '<h2>' + escapeHTML(trade.symbol) + '</h2>' +
            (trade.date ? '<p class="card-date">' + formatDate(trade.date) + '</p>' : '') +
          '</div>' +
          '<div class="direction ' + dClass + '"><span>' + arrow + '</span>' + escapeHTML(trade.direction) + '</div>' +
        '</div>' +

        '<div class="pnl-section">' +
          '<div class="pnl-label">P&amp;L</div>' +
          '<div class="pnl ' + pnlClass + '">' + escapeHTML(trade.pnl_display) + '</div>' +
        '</div>' +

        '<div class="outcome-row">' +
          '<span class="outcome-label">Outcome</span>' +
          '<span class="outcome ' + oClass + '">' + escapeHTML(trade.outcome) + '</span>' +
        '</div>' +

        '<div class="details">' +
          '<div class="detail"><span>Risk</span><strong>' + escapeHTML(trade.risk) + '</strong></div>' +
          '<div class="detail"><span>Target RR</span><strong>' + escapeHTML(trade.target_rr) + '</strong></div>' +
          '<div class="detail"><span>Closed RR</span><strong>' + escapeHTML(trade.closed_rr) + '</strong></div>' +
        '</div>' +

        notesHTML +
        screenshotsHTML +
      '</div>'
    );
  }

  function renderJournal(data) {
    var traderLine = document.getElementById("traderLine");

    traderLine.textContent =
      data.first_name + (data.username ? " · @" + data.username : "");

    document.getElementById("statsGrid").innerHTML = renderStats(data);

    var list = document.getElementById("tradeList");
    list.innerHTML = data.trades.map(renderTradeCard).join("");

    document.title =
      (data.first_name || "Trader") + "'s Trade Journal · Darvix AI";

    showState("journal");
  }

  // ---------------------------------------------------------
  // FETCH
  // ---------------------------------------------------------
  function loadJournal() {
    var token = getToken();

    if (!token) {
      showState("noToken");
      return;
    }

    showState("loading");

    var url = API_ENDPOINT + "?token=" + encodeURIComponent(token);

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Request failed: " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.found === false) {
          showState("notFound");
          return;
        }

        if (!data.trades || data.trades.length === 0) {
          document.getElementById("emptyTraderName").textContent =
            data.first_name || "this trader";

          showState("emptyTrades");
          return;
        }

        renderJournal(data);
      })
      .catch(function () {
        showState("error");
      });
  }

  var retryBtn = document.getElementById("retryBtn");

  if (retryBtn) {
    retryBtn.addEventListener("click", loadJournal);
  }

  // ---------------------------------------------------------
  // SHARE BUTTON
  // ---------------------------------------------------------
  var shareBtn = document.getElementById("shareBtn");
  var toast = document.getElementById("shareToast");

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("visible");

    setTimeout(function () {
      toast.classList.remove("visible");
    }, 2200);
  }

  function fallbackCopy(url) {
    var temp = document.createElement("textarea");

    temp.value = url;
    temp.style.position = "fixed";
    temp.style.opacity = "0";

    document.body.appendChild(temp);

    temp.focus();
    temp.select();

    try {
      document.execCommand("copy");
      showToast("Link copied");
    } catch (e) {
      showToast("Couldn't copy link");
    }

    document.body.removeChild(temp);
  }

  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      var url = window.location.href;

      if (!getToken()) {
        showToast("Nothing to share yet");
        return;
      }

      if (navigator.share) {
        navigator
          .share({
            title: document.title,
            url: url
          })
          .catch(function () {
            /* cancelled */
          });

        return;
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(url)
          .then(function () {
            showToast("Link copied");
          })
          .catch(function () {
            fallbackCopy(url);
          });
      } else {
        fallbackCopy(url);
      }
    });
  }

  // ---------------------------------------------------------
  // INIT
  // ---------------------------------------------------------
  loadJournal();

})();
