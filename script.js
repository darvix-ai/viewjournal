(function () {
  "use strict";

  // ---------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------
  var API_ENDPOINT = "https://wsuzs1sr.rpcld.cc/webhook/viewjournal";
  var TOKEN_PARAM = "token";

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

    if (isNaN(date.getTime())) {
      return escapeHTML(value);
    }

    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function moneyClass(n) {
    if (n > 0) return "profit";
    if (n < 0) return "loss";
    return "neutral";
  }

  function outcomeClass(outcome) {
    var o = (outcome || "").toLowerCase().trim();

    if (o === "win") return "outcome-win";
    if (o === "loss") return "outcome-loss";

    return "outcome-breakeven";
  }

  function directionClass(direction) {
    return (direction || "").toLowerCase() === "buy"
      ? "buy"
      : "sell";
  }

  function directionArrow(direction) {
    return (direction || "").toLowerCase() === "buy"
      ? "↗"
      : "↘";
  }

  function getToken() {
    var params = new URLSearchParams(window.location.search);
    return params.get(TOKEN_PARAM) || "";
  }

  // ---------------------------------------------------------
  // GET CALCULATED P&L
  //
  // Calculated PNL is the numerical source.
  // Outcome is used as a safety net so the displayed sign
  // always agrees with the recorded outcome.
  // ---------------------------------------------------------
  function getCalculatedPnl(trade) {
    var raw;

    if (
      trade.calculated_pnl !== undefined &&
      trade.calculated_pnl !== null &&
      trade.calculated_pnl !== ""
    ) {
      raw = trade.calculated_pnl;

    } else if (
      trade.calculatedPnl !== undefined &&
      trade.calculatedPnl !== null &&
      trade.calculatedPnl !== ""
    ) {
      raw = trade.calculatedPnl;

    } else if (
      trade.pnl_calculated !== undefined &&
      trade.pnl_calculated !== null &&
      trade.pnl_calculated !== ""
    ) {
      raw = trade.pnl_calculated;

    } else {
      raw = trade.pnl;
    }

    if (typeof raw === "string") {
      raw = raw.replace(/[$,\s]/g, "");
    }

    var amount = parseFloat(raw);

    if (isNaN(amount)) {
      amount = 0;
    }

    var outcome = (trade.outcome || "")
      .toLowerCase()
      .trim();

    var absoluteAmount = Math.abs(amount);

    // Outcome is the safety net for the sign.
    if (outcome === "loss") {
      return -absoluteAmount;
    }

    if (outcome === "win") {
      return absoluteAmount;
    }

    if (outcome === "breakeven") {
      return 0;
    }

    return amount;
  }

  function formatMoney(amount) {
    if (amount > 0) {
      return "+$" + amount.toFixed(2);
    }

    if (amount < 0) {
      return "-$" + Math.abs(amount).toFixed(2);
    }

    return "$0.00";
  }

  // ---------------------------------------------------------
  // PERFORMANCE CALCULATIONS
  // ---------------------------------------------------------
  function calculatePerformance(trades) {
    var grossProfit = 0;
    var grossLoss = 0;
    var cumulative = 0;
    var points = [];

    trades.forEach(function (trade, index) {
      var pnl = getCalculatedPnl(trade);

      if (pnl > 0) {
        grossProfit += pnl;
      }

      if (pnl < 0) {
        grossLoss += Math.abs(pnl);
      }

      cumulative += pnl;

      points.push({
        trade: index + 1,
        pnl: pnl,
        cumulative: cumulative
      });
    });

    var profitFactor = 0;

    if (grossLoss > 0) {
      profitFactor = grossProfit / grossLoss;
    } else if (grossProfit > 0) {
      profitFactor = Infinity;
    }

    return {
      grossProfit: grossProfit,
      grossLoss: grossLoss,
      profitFactor: profitFactor,
      points: points,
      totalPnl: cumulative
    };
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
  // STATS
  // ---------------------------------------------------------
  function renderStats(data, performance) {
    var totalPnl = performance.totalPnl;

    var cells = [
      {
        label: "Trades",
        value: performance.points.length,
        cls: ""
      },
      {
        label: "Net P&amp;L",
        value: formatMoney(totalPnl),
        cls: moneyClass(totalPnl)
      },
      {
        label: "Win Rate",
        value: data.win_rate + "%",
        cls: ""
      },
      {
        label: "Wins",
        value: data.wins,
        cls: "profit"
      },
      {
        label: "Losses",
        value: data.losses,
        cls: "loss"
      },
      {
        label: "Breakeven",
        value: data.breakeven,
        cls: "neutral"
      }
    ];

    return cells.map(function (c) {
      return (
        '<div class="stat">' +
          '<span>' + c.label + '</span>' +
          '<strong class="' + c.cls + '">' +
            escapeHTML(c.value) +
          '</strong>' +
        '</div>'
      );
    }).join("");
  }

  // ---------------------------------------------------------
  // TRADE CARD
  // ---------------------------------------------------------
  function renderTradeCard(trade) {
    var actualPnl = getCalculatedPnl(trade);

    // PNL color follows the normalized calculated PNL.
    var pnlClass = moneyClass(actualPnl);

    var oClass = outcomeClass(trade.outcome);
    var dClass = directionClass(trade.direction);
    var arrow = directionArrow(trade.direction);

    var pnlDisplay = formatMoney(actualPnl);

    var notesHTML = trade.notes
      ? (
          '<div class="notes">' +
            '<div class="notes-title">NOTES / EMOTIONS</div>' +
            '<div class="notes-content">' +
              escapeHTML(trade.notes) +
            '</div>' +
          '</div>'
        )
      : "";

    var shots = [];

    if (trade.before_screenshot) {
      shots.push(
        '<a class="screenshot" href="' +
          escapeHTML(trade.before_screenshot) +
          '" target="_blank" rel="noopener">' +

          '<img src="' +
            escapeHTML(trade.before_screenshot) +
            '" alt="Before trade screenshot" loading="lazy">' +

          '<div class="image-label">BEFORE</div>' +

        '</a>'
      );
    }

    if (trade.after_screenshot) {
      shots.push(
        '<a class="screenshot" href="' +
          escapeHTML(trade.after_screenshot) +
          '" target="_blank" rel="noopener">' +

          '<img src="' +
            escapeHTML(trade.after_screenshot) +
            '" alt="After trade screenshot" loading="lazy">' +

          '<div class="image-label">AFTER</div>' +

        '</a>'
      );
    }

    var screenshotsHTML = shots.length
      ? (
          '<div class="screenshots-title">TRADE SCREENSHOTS</div>' +
          '<div class="screenshots">' +
            shots.join("") +
          '</div>'
        )
      : "";

    return (
      '<div class="trade-card">' +

        '<div class="card-head">' +

          '<span class="step-num">' +
            String(trade.number || "").padStart(2, "0") +
          '</span>' +

          '<div class="head-text">' +

            '<h2>' +
              escapeHTML(trade.symbol) +
            '</h2>' +

            (
              trade.date
                ? '<p class="card-date">' +
                    formatDate(trade.date) +
                  '</p>'
                : ''
            ) +

          '</div>' +

          '<div class="direction ' +
            dClass +
            '">' +

            '<span>' +
              arrow +
            '</span>' +

            escapeHTML(trade.direction) +

          '</div>' +

        '</div>' +

        '<div class="pnl-section">' +

          '<div class="pnl-label">P&amp;L</div>' +

          '<div class="pnl ' +
            pnlClass +
            '">' +

            escapeHTML(pnlDisplay) +

          '</div>' +

        '</div>' +

        '<div class="outcome-row">' +

          '<span class="outcome-label">Outcome</span>' +

          '<span class="outcome ' +
            oClass +
            '">' +

            escapeHTML(trade.outcome) +

          '</span>' +

        '</div>' +

        '<div class="details">' +

          '<div class="detail">' +
            '<span>Risk</span>' +
            '<strong>' +
              escapeHTML(trade.risk) +
            '</strong>' +
          '</div>' +

          '<div class="detail">' +
            '<span>Target RR</span>' +
            '<strong>' +
              escapeHTML(trade.target_rr) +
            '</strong>' +
          '</div>' +

          '<div class="detail">' +
            '<span>Closed RR</span>' +
            '<strong>' +
              escapeHTML(trade.closed_rr) +
            '</strong>' +
          '</div>' +

        '</div>' +

        notesHTML +

        screenshotsHTML +

      '</div>'
    );
  }

  // ---------------------------------------------------------
  // PROFIT FACTOR
  // ---------------------------------------------------------
  function renderProfitFactor(performance) {
    var pfElement =
      document.getElementById("profitFactorValue");

    var gpElement =
      document.getElementById("grossProfitValue");

    var glElement =
      document.getElementById("grossLossValue");

    var description =
      document.getElementById("profitFactorDescription");

    gpElement.textContent =
      "+$" + performance.grossProfit.toFixed(2);

    glElement.textContent =
      "-$" + performance.grossLoss.toFixed(2);

    if (performance.profitFactor === Infinity) {
      pfElement.textContent = "∞";

      description.textContent =
        "No losing trades recorded";

      return;
    }

    pfElement.textContent =
      performance.profitFactor.toFixed(2);

    if (performance.profitFactor > 1) {
      description.textContent =
        "Gross profit ÷ gross loss";

    } else if (performance.profitFactor === 1) {
      description.textContent =
        "Gross profit equals gross loss";

    } else if (performance.profitFactor > 0) {
      description.textContent =
        "Gross loss is currently higher";

    } else {
      description.textContent =
        "No winning trades recorded";
    }
  }

  // ---------------------------------------------------------
  // GROWTH CHART
  // ---------------------------------------------------------
  function renderGrowthChart(performance) {
    var svg =
      document.getElementById("growthChart");

    var empty =
      document.getElementById("chartEmpty");

    var growthValue =
      document.getElementById("growthValue");

    var points = performance.points;

    if (!points || points.length < 1) {
      svg.innerHTML = "";
      empty.hidden = false;
      growthValue.textContent = "$0.00";
      return;
    }

    empty.hidden = true;

    var width = 500;
    var height = 210;

    var paddingLeft = 18;
    var paddingRight = 18;
    var paddingTop = 18;
    var paddingBottom = 28;

    var chartWidth =
      width -
      paddingLeft -
      paddingRight;

    var chartHeight =
      height -
      paddingTop -
      paddingBottom;

    var values = points.map(function (p) {
      return p.cumulative;
    });

    values.push(0);

    var minValue =
      Math.min.apply(null, values);

    var maxValue =
      Math.max.apply(null, values);

    if (minValue === maxValue) {
      var padding =
        Math.max(
          Math.abs(minValue) * 0.25,
          1
        );

      minValue -= padding;
      maxValue += padding;
    }

    var range =
      maxValue -
      minValue;

    minValue -= range * 0.08;
    maxValue += range * 0.08;

    function x(index) {
      if (points.length === 1) {
        return paddingLeft +
          chartWidth / 2;
      }

      return (
        paddingLeft +
        (index / (points.length - 1)) *
          chartWidth
      );
    }

    function y(value) {
      return (
        paddingTop +
        (
          (maxValue - value) /
          (maxValue - minValue)
        ) *
        chartHeight
      );
    }

    var linePoints =
      points.map(function (point, index) {
        return (
          x(index).toFixed(2) +
          "," +
          y(point.cumulative).toFixed(2)
        );
      }).join(" ");

    var zeroY = y(0);

    var firstX = x(0);
    var lastX = x(points.length - 1);

    var areaPoints =
      firstX.toFixed(2) +
      "," +
      zeroY.toFixed(2) +
      " " +
      linePoints +
      " " +
      lastX.toFixed(2) +
      "," +
      zeroY.toFixed(2);

    var finalValue =
      performance.totalPnl;

    var lineClass =
      finalValue > 0
        ? "chart-profit"
        : finalValue < 0
          ? "chart-loss"
          : "chart-profit";

    svg.innerHTML =

      '<defs>' +

        '<linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">' +

          '<stop offset="0%" class="' +
            (
              finalValue >= 0
                ? "fill-profit-top"
                : "fill-loss-top"
            ) +
          '" />' +

          '<stop offset="100%" class="' +
            (
              finalValue >= 0
                ? "fill-profit-bottom"
                : "fill-loss-bottom"
            ) +
          '" />' +

        '</linearGradient>' +

      '</defs>' +

      '<line ' +
        'x1="' + paddingLeft + '" ' +
        'y1="' + zeroY + '" ' +
        'x2="' + (width - paddingRight) + '" ' +
        'y2="' + zeroY + '" ' +
        'class="zero-line" />' +

      '<polygon ' +
        'points="' + areaPoints + '" ' +
        'class="growth-area" />' +

      '<polyline ' +
        'points="' + linePoints + '" ' +
        'class="growth-line ' + lineClass + '" ' +
        'fill="none" ' +
        'stroke-linecap="round" ' +
        'stroke-linejoin="round" />' +

      '<circle ' +
        'cx="' + lastX + '" ' +
        'cy="' + y(finalValue) + '" ' +
        'r="4" ' +
        'class="growth-dot ' + lineClass + '" />';

    growthValue.textContent =
      formatMoney(finalValue);
  }

  // ---------------------------------------------------------
  // JOURNAL
  // ---------------------------------------------------------
  function renderJournal(data) {
    var traderLine =
      document.getElementById("traderLine");

    traderLine.textContent =
      data.first_name +
      (
        data.username
          ? " · @" + data.username
          : ""
      );

    var trades =
      data.trades || [];

    var performance =
      calculatePerformance(trades);

    document.getElementById("statsGrid").innerHTML =
      renderStats(data, performance);

    renderProfitFactor(performance);

    renderGrowthChart(performance);

    var list =
      document.getElementById("tradeList");

    list.innerHTML =
      trades.map(renderTradeCard).join("");

    document.title =
      (data.first_name || "Trader") +
      "'s Trade Journal · Darvix AI";

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

    var url =
      API_ENDPOINT +
      "?token=" +
      encodeURIComponent(token);

    fetch(url)
      .then(function (res) {
        if (!res.ok) {
          throw new Error(
            "Request failed: " +
            res.status
          );
        }

        return res.json();
      })

      .then(function (data) {
        if (!data || data.found === false) {
          showState("notFound");
          return;
        }

        if (
          !data.trades ||
          data.trades.length === 0
        ) {
          document.getElementById(
            "emptyTraderName"
          ).textContent =
            data.first_name ||
            "this trader";

          showState("emptyTrades");
          return;
        }

        renderJournal(data);
      })

      .catch(function (error) {
        console.error(
          "Journal loading error:",
          error
        );

        showState("error");
      });
  }

  // ---------------------------------------------------------
  // RETRY
  // ---------------------------------------------------------
  var retryBtn =
    document.getElementById("retryBtn");

  if (retryBtn) {
    retryBtn.addEventListener(
      "click",
      loadJournal
    );
  }

  // ---------------------------------------------------------
  // SHARE BUTTON
  // ---------------------------------------------------------
  var shareBtn =
    document.getElementById("shareBtn");

  var toast =
    document.getElementById("shareToast");

  function showToast(msg) {
    toast.textContent = msg;

    toast.classList.add("visible");

    setTimeout(function () {
      toast.classList.remove("visible");
    }, 2200);
  }

  function fallbackCopy(url) {
    var temp =
      document.createElement("textarea");

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
    shareBtn.addEventListener(
      "click",
      function () {
        var url =
          window.location.href;

        if (!getToken()) {
          showToast(
            "Nothing to share yet"
          );

          return;
        }

        if (navigator.share) {
          navigator.share({
            title: document.title,
            url: url
          }).catch(function () {
            // cancelled
          });

          return;
        }

        if (
          navigator.clipboard &&
          navigator.clipboard.writeText
        ) {
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
      }
    );
  }

  // ---------------------------------------------------------
  // INIT
  // ---------------------------------------------------------
  loadJournal();

})();
