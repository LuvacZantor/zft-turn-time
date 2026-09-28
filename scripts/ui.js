import { MODULE_ID, SETTINGS } from "./constants.js";
import { averageMs, getCampaignStats, getCombatState } from "./store.js";
import { getActiveElapsedMs, isPrimaryGM, pauseTimer, resumeTimer } from "./timer.js";

const BADGE_CLASS = "zft-turn-time-badge";
const INFO_CLASS = "zft-turn-time-info";
const CONTROLS_CLASS = "zft-turn-time-controls";
const REPORT_BUTTON_CLASS = "zft-turn-time-report";
const PAUSE_BUTTON_CLASS = "zft-turn-time-pause";

let liveInterval = null;

function rootElement(element) {
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  return null;
}

export function formatDuration(ms, { compact = true } = {}) {
  if (!Number.isFinite(ms) || ms < 0) return "—";

  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  return compact ? `${seconds}s` : `0:${String(seconds).padStart(2, "0")}`;
}

function createBadge({ currentMs = null, average = null, count = 0, active = false, paused = false, mode = "both" }) {
  const badge = document.createElement("span");
  badge.className = BADGE_CLASS;
  if (active) badge.classList.add("is-active");
  if (paused) badge.classList.add("is-paused");

  const parts = [];
  if ((mode === "current" || mode === "both") && active) {
    parts.push(`<span class="zft-current">${formatDuration(currentMs)}</span>`);
  }

  if ((mode === "average" || mode === "both") && average !== null) {
    parts.push(`<span class="zft-average">avg ${formatDuration(average)}</span>`);
  }

  badge.innerHTML = parts.join(`<span class="zft-separator"> · </span>`);
  badge.dataset.tooltip = paused
    ? `Timer paused${count ? ` · ${count} recorded turn${count === 1 ? "" : "s"}` : ""}`
    : count
      ? `${count} recorded turn${count === 1 ? "" : "s"}`
      : "Current turn";

  return badge;
}

function decorateCombatTracker(root) {
  const mode = game.settings.get(MODULE_ID, SETTINGS.DISPLAY_MODE);
  if (mode === "off") return;

  const combat = game.combat;
  if (!combat) return;

  const state = getCombatState(combat);

  for (const row of root.querySelectorAll("[data-combatant-id]")) {
    row.querySelectorAll(`.${INFO_CLASS}`).forEach(node => node.remove());

    const combatantId = row.dataset.combatantId;
    if (!combatantId) continue;

    const combatant = combat.combatants?.get(combatantId);
    if (!combatant) continue;

    const encounterStat = state.combatants[combatantId];

    // Combat Tracker timing is strictly encounter/combatant scoped.
    // Campaign Actor/User aggregates are retained for analytics/API use only and
    // must never leak previous-combat averages or turn counts into a new encounter.
    const stat = encounterStat ?? null;
    const avg = averageMs(stat);

    const active = state.active?.combatantId === combatantId;
    const paused = active && Boolean(state.active?.paused);
    const currentMs = active ? getActiveElapsedMs(state.active) : null;

    const badge = createBadge({
      currentMs,
      average: avg,
      count: stat?.count ?? 0,
      active,
      paused,
      mode
    });

    if (!badge.textContent?.trim()) continue;

    const info = document.createElement("span");
    info.className = INFO_CLASS;
    info.append(badge);

    const nameHost = row.querySelector(".token-name");
    const nameLabel =
      nameHost?.querySelector(":scope > h4") ??
      nameHost?.querySelector(":scope > .combatant-name") ??
      nameHost?.querySelector(":scope > .name") ??
      row.querySelector(".combatant-name") ??
      row.querySelector("h4") ??
      row.querySelector(".name");

    if (nameLabel) {
      // Keep timing inside the name element itself. This prevents the timer
      // from becoming another horizontal child of Foundry's combatant row.
      nameLabel.append(info);
    } else {
      console.warn(
        `[ZFT] ⚠️ Combatant name element not found; turn-time display skipped | combatant=${combatantId}`
      );
    }
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function postCombatReport(combat = game.combat, { stateOverride = null, automatic = false } = {}) {
  if (!game.user?.isGM) {
    ui.notifications?.warn("ZFT Turn Time: GM permission required.");
    return;
  }

  if (!combat) {
    ui.notifications?.warn("ZFT Turn Time: No active combat.");
    return;
  }

  const state = stateOverride ?? getCombatState(combat);
  const rows = Object.entries(state.combatants)
    .map(([combatantId, stat]) => ({
      combatantId,
      name: stat.name || combat.combatants?.get(combatantId)?.name || "Unknown",
      count: stat.count,
      average: averageMs(stat),
      totalMs: stat.totalMs
    }))
    .filter(row => row.count > 0)
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));

  if (!rows.length) {
    ui.notifications?.info("ZFT Turn Time: No completed turns recorded for this combat.");
    return;
  }

  const body = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${formatDuration(row.average)}</td>
      <td>${row.count}</td>
      <td>${formatDuration(row.totalMs)}</td>
    </tr>
  `).join("");

  const content = `
    <section class="zft-turn-time-chat-report">
      <h3>⏱️ Turn Time Report</h3>
      <table>
        <thead>
          <tr><th>Combatant</th><th>Avg</th><th>Turns</th><th>Total</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </section>
  `;

  const speaker = {
    alias: game.user?.name ?? "GM"
  };

  await ChatMessage.create({
    speaker,
    content
  });

  console.log(
    `[ZFT] 📊 Combat timing report posted | combat=${combat.id} | rows=${rows.length} | automatic=${automatic} | speaker=${speaker.alias}`
  );
}

function updatePauseButton(button) {
  const state = getCombatState(game.combat);
  const active = state.active;
  const paused = Boolean(active?.paused);

  button.disabled = !active?.combatantId;
  button.dataset.tooltip = paused ? "Resume turn timer" : "Pause turn timer";
  button.setAttribute("aria-label", paused ? "Resume turn timer" : "Pause turn timer");
  button.innerHTML = paused
    ? `<i class="fa-solid fa-play"></i><span>Resume Timer</span>`
    : `<i class="fa-solid fa-pause"></i><span>Pause Timer</span>`;
  button.classList.toggle("is-paused", paused);
}

function createPauseButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = PAUSE_BUTTON_CLASS;
  updatePauseButton(button);

  button.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();

    const combat = game.combat;
    if (!combat) return;

    const state = getCombatState(combat);
    const paused = Boolean(state.active?.paused);

    button.disabled = true;
    try {
      if (paused) await resumeTimer(combat);
      else await pauseTimer(combat);
    } finally {
      updateLiveBadges();
    }
  });

  return button;
}

function createReportButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = REPORT_BUTTON_CLASS;
  button.dataset.tooltip = "Post turn time report";
  button.setAttribute("aria-label", "Post turn time report");
  button.innerHTML = `<i class="fa-solid fa-stopwatch"></i><span>Report</span>`;

  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    void postCombatReport();
  });

  return button;
}

function injectModuleControls(root) {
  root.querySelectorAll(`.${CONTROLS_CLASS}`).forEach(node => node.remove());

  if (!isPrimaryGM()) return;
  if (!game.combat) return;

  const controls = document.createElement("div");
  controls.className = CONTROLS_CLASS;
  controls.append(createPauseButton());

  if (game.settings.get(MODULE_ID, SETTINGS.SHOW_REPORT_BUTTON)) {
    controls.append(createReportButton());
  }

  const nativeControls = root.querySelector(".combat-controls");
  if (nativeControls) {
    // Keep ZFT controls as a sibling only. Do not alter Foundry's native
    // controls container or its parent; sidebar and popout layouts differ.
    nativeControls.insertAdjacentElement("afterend", controls);
    return;
  }

  const footer = root.querySelector("footer");
  if (footer) {
    footer.insertAdjacentElement("beforeend", controls);
    return;
  }

  root.append(controls);
}

function trackerRoots() {
  return new Set([
    ...document.querySelectorAll("#combat"),
    ...document.querySelectorAll("#combat-tracker"),
    ...document.querySelectorAll(".combat-tracker")
  ]);
}

function updateLiveBadges() {
  const trackers = trackerRoots();
  if (!trackers.size) return;

  for (const tracker of trackers) {
    decorateCombatTracker(tracker);
    for (const button of tracker.querySelectorAll(`.${PAUSE_BUTTON_CLASS}`)) {
      updatePauseButton(button);
    }
  }
}

export function refreshCombatTracker() {
  try {
    ui.combat?.render();
  } catch (error) {
    console.warn("[ZFT] ⚠️ Combat Tracker refresh failed", error);
  }
}

export function registerUIHooks() {
  Hooks.on("renderCombatTracker", (_app, element) => {
    const root = rootElement(element);
    if (!root) {
      console.warn("[ZFT] ⚠️ Combat Tracker render hook returned an unsupported element");
      return;
    }

    decorateCombatTracker(root);
    injectModuleControls(root);

    console.log(
      `[ZFT] 🪟 Combat Tracker rendered | id=${root.id || "none"} | classes=${root.className || "none"} | rows=${root.querySelectorAll("[data-combatant-id]").length}`
    );
  });

  Hooks.on("updateSetting", setting => {
    if (setting?.key === `${MODULE_ID}.${SETTINGS.CAMPAIGN_STATS}`) {
      refreshCombatTracker();
    }
  });

  Hooks.on(`${MODULE_ID}.timerStateChanged`, () => {
    updateLiveBadges();
  });

  Hooks.on(`${MODULE_ID}.combatFinalized`, (combat, state) => {
    if (!isPrimaryGM()) return;
    if (!game.settings.get(MODULE_ID, SETTINGS.AUTO_REPORT_END)) {
      console.log(`[ZFT] 📴 Automatic end-of-combat report disabled | combat=${combat?.id ?? "unknown"}`);
      return;
    }

    void postCombatReport(combat, {
      stateOverride: state,
      automatic: true
    }).catch(error => {
      console.error("[ZFT] ❌ Automatic combat report failed", error);
    });
  });

  if (!liveInterval) {
    liveInterval = window.setInterval(updateLiveBadges, 1000);
  }

  console.log("[ZFT] 🖥️ Combat Tracker UI hooks registered");
}
