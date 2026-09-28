import { MODULE_ID, SETTINGS } from "./constants.js";
import {
  addSample,
  emptyCombatState,
  getCampaignStats,
  getCombatState,
  resetCampaignStats,
  setCampaignStats,
  setCombatState
} from "./store.js";

let transitionQueue = Promise.resolve();

export function isPrimaryGM() {
  if (!game.user?.isGM || !game.user.active) return false;

  const activeGMs = [...(game.users ?? [])]
    .filter(user => user.active && user.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return activeGMs[0]?.id === game.user.id;
}

function isNPC(combatant) {
  if (typeof combatant?.isNPC === "boolean") return combatant.isNPC;
  return combatant?.actor?.type === "npc";
}

function activeRecord(combat, combatant) {
  if (!combatant) return null;

  return {
    combatantId: combatant.id,
    actorId: combatant.actor?.id ?? null,
    startedAt: Date.now(),
    accumulatedMs: 0,
    paused: false,
    round: combat.round ?? null,
    turn: combat.turn ?? null
  };
}

export function getActiveElapsedMs(active, now = Date.now()) {
  if (!active?.combatantId) return null;

  const accumulatedMs = Number.isFinite(Number(active.accumulatedMs))
    ? Math.max(0, Number(active.accumulatedMs))
    : 0;

  if (active.paused) return accumulatedMs;
  if (!Number.isFinite(Number(active.startedAt))) return null;

  return accumulatedMs + Math.max(0, now - Number(active.startedAt));
}

function resolveTurnUsers(combatant) {
  const actor = combatant?.actor;
  if (!actor || !game.users) return [];

  const owners = [...game.users].filter(user =>
    !user.isGM &&
    actor.testUserPermission?.(user, "OWNER")
  );

  if (owners.length) return owners;

  // A deterministic single GM authority is credited for unowned/NPC turns.
  const primaryGM = [...game.users]
    .filter(user => user.active && user.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];

  return primaryGM ? [primaryGM] : [];
}

function sampleIsValid(elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return false;

  const maxSeconds = Number(game.settings.get(MODULE_ID, SETTINGS.MAX_TURN_SECONDS) ?? 600);
  if (maxSeconds <= 0) return true;

  return elapsedMs <= maxSeconds * 1000;
}

async function beginCombat(combat) {
  if (!isPrimaryGM()) return;

  if (game.settings.get(MODULE_ID, SETTINGS.RESET_ON_COMBAT)) {
    await resetCampaignStats();
  }

  const state = emptyCombatState();
  state.active = activeRecord(combat, combat.combatant);
  await setCombatState(combat, state);

  console.log(
    `[ZFT] ⏱️ Combat timing started | combat=${combat.id} | combatant=${state.active?.combatantId ?? "none"} | round=${combat.round ?? "?"} | turn=${combat.turn ?? "?"}`
  );

  if (!state.active) {
    console.log(
      `[ZFT] 🧭 No combatant available during combatStart; waiting for combatTurnChange to arm the initial timer | combat=${combat.id}`
    );
  }
}

async function recordCompletedTurn(combat, state, combatant, elapsedMs, { reason = "turn-change" } = {}) {
  if (!combatant) {
    console.warn(`[ZFT] ⚠️ Cannot record turn: combatant missing | reason=${reason}`);
    return false;
  }

  if (isNPC(combatant) && !game.settings.get(MODULE_ID, SETTINGS.TRACK_NPCS)) {
    console.log(`[ZFT] 💤 NPC timing disabled; sample skipped | combatant=${combatant.id} | reason=${reason}`);
    return false;
  }

  if (!sampleIsValid(elapsedMs)) {
    console.warn(
      `[ZFT] ⚠️ Turn sample rejected by duration validation | combatant=${combatant.id} | elapsedMs=${elapsedMs} | reason=${reason}`
    );
    return false;
  }

  const campaign = getCampaignStats();
  const actor = combatant.actor;

  addSample(state.combatants, combatant.id, {
    actorId: actor?.id ?? null,
    name: combatant.name ?? actor?.name ?? "Unknown",
    elapsedMs
  });

  if (actor?.id) {
    addSample(campaign.actors, actor.id, {
      name: actor.name ?? combatant.name ?? "Unknown",
      elapsedMs
    });
  }

  for (const user of resolveTurnUsers(combatant)) {
    addSample(campaign.users, user.id, {
      name: user.name ?? "Unknown",
      elapsedMs
    });
  }

  await setCampaignStats(campaign);

  console.log(
    `[ZFT] ✅ Turn recorded | actor=${actor?.name ?? combatant.name ?? "Unknown"} | combatant=${combatant.id} | elapsedMs=${elapsedMs} | reason=${reason}`
  );

  return true;
}

async function finalizeCombat(combat) {
  if (!isPrimaryGM()) return;

  const state = getCombatState(combat);
  const active = state.active;
  const elapsedMs = getActiveElapsedMs(active);

  if (active?.combatantId && Number.isFinite(elapsedMs)) {
    const combatant = combat.combatants?.get(active.combatantId);

    await recordCompletedTurn(combat, state, combatant, elapsedMs, {
      reason: "combat-end"
    });

    state.active = null;
  }

  console.log(
    `[ZFT] 🏁 Combat timing finalized | combat=${combat?.id ?? "unknown"} | combatants=${Object.keys(state.combatants ?? {}).length}`
  );

  Hooks.callAll(`${MODULE_ID}.combatFinalized`, combat, state);
}

async function processTurnChange(combat, prior, current) {
  if (!isPrimaryGM()) return;

  const state = getCombatState(combat);
  const previousId = prior?.combatantId ?? null;
  const currentId = current?.combatantId ?? combat.combatant?.id ?? null;

  const sameTurnState =
    previousId === currentId &&
    Number(prior?.round) === Number(current?.round) &&
    Number(prior?.turn) === Number(current?.turn);

  if (sameTurnState) {
    const activeMatchesCurrent =
      state.active?.combatantId &&
      currentId &&
      state.active.combatantId === currentId;

    if (activeMatchesCurrent) {
      console.log(
        `[ZFT] 🔀 Turn change ignored: combat state unchanged and timer already armed | combatant=${currentId} | round=${current?.round ?? "?"} | turn=${current?.turn ?? "?"}`
      );
      return;
    }

    const currentCombatant = currentId ? combat.combatants?.get(currentId) : combat.combatant;

    if (currentCombatant) {
      state.active = activeRecord(combat, currentCombatant);
      await setCombatState(combat, state);

      console.log(
        `[ZFT] 🩹 Initial turn timer recovered after combatStart ordering | combatant=${state.active?.combatantId ?? "none"} | round=${combat.round ?? "?"} | turn=${combat.turn ?? "?"}`
      );
      return;
    }

    console.warn(
      `[ZFT] ⚠️ Combat state unchanged but no current combatant could be resolved | combat=${combat.id} | round=${combat.round ?? "?"} | turn=${combat.turn ?? "?"}`
    );
    return;
  }

  const active = state.active;
  const elapsedMs = getActiveElapsedMs(active);
  const canComplete =
    active?.combatantId &&
    previousId &&
    active.combatantId === previousId &&
    Number.isFinite(elapsedMs);

  if (canComplete) {
    const combatant = combat.combatants?.get(previousId);

    if (!combatant) {
      console.warn(`[ZFT] ⚠️ Prior combatant missing; sample discarded | combatant=${previousId}`);
    } else {
      await recordCompletedTurn(combat, state, combatant, elapsedMs, {
        reason: "turn-change"
      });
    }
  } else if (previousId) {
    console.warn(
      `[ZFT] ⚠️ No matching active timer for prior combatant; sample discarded | expected=${active?.combatantId ?? "none"} | prior=${previousId}`
    );
  }

  const nextCombatant = currentId ? combat.combatants?.get(currentId) : null;
  state.active = activeRecord(combat, nextCombatant);
  await setCombatState(combat, state);

  console.log(
    `[ZFT] ▶️ Next turn timer armed | combatant=${state.active?.combatantId ?? "none"} | round=${combat.round ?? "?"} | turn=${combat.turn ?? "?"}`
  );
}

async function setTimerPaused(combat, paused) {
  if (!isPrimaryGM()) {
    ui.notifications?.warn("ZFT Turn Time: Only the primary active GM can control the timer.");
    return false;
  }

  if (!combat) {
    ui.notifications?.warn("ZFT Turn Time: No active combat.");
    return false;
  }

  const state = getCombatState(combat);
  const active = state.active;

  if (!active?.combatantId) {
    ui.notifications?.warn("ZFT Turn Time: No active turn timer.");
    return false;
  }

  if (paused) {
    if (active.paused) return true;

    const elapsedMs = getActiveElapsedMs(active);
    if (!Number.isFinite(elapsedMs)) {
      console.warn(`[ZFT] ⚠️ Cannot pause timer: active elapsed time is invalid | combat=${combat.id}`);
      return false;
    }

    active.accumulatedMs = elapsedMs;
    active.startedAt = null;
    active.paused = true;
  } else {
    if (!active.paused) return true;

    active.startedAt = Date.now();
    active.paused = false;
  }

  await setCombatState(combat, state);
  Hooks.callAll(`${MODULE_ID}.timerStateChanged`, combat, state);

  console.log(
    `[ZFT] ${paused ? "⏸️" : "▶️"} Turn timer ${paused ? "paused" : "resumed"} | combat=${combat.id} | combatant=${active.combatantId} | elapsedMs=${getActiveElapsedMs(active) ?? "invalid"}`
  );

  return true;
}

function enqueueTransition(task) {
  transitionQueue = transitionQueue
    .then(task)
    .catch(error => {
      console.error("[ZFT] ❌ Turn timing transition failed", error);
      return false;
    });

  return transitionQueue;
}

export function pauseTimer(combat = game.combat) {
  return enqueueTransition(() => setTimerPaused(combat, true));
}

export function resumeTimer(combat = game.combat) {
  return enqueueTransition(() => setTimerPaused(combat, false));
}

export function toggleTimer(combat = game.combat) {
  return enqueueTransition(async () => {
    const state = getCombatState(combat);
    return setTimerPaused(combat, !state.active?.paused);
  });
}

export function registerTimerHooks() {
  Hooks.on("combatStart", combat => {
    enqueueTransition(() => beginCombat(combat));
  });

  Hooks.on("combatTurnChange", (combat, prior, current) => {
    enqueueTransition(() => processTurnChange(combat, prior, current));
  });

  Hooks.on("deleteCombat", combat => {
    enqueueTransition(() => finalizeCombat(combat));
  });

  console.log("[ZFT] 🪝 Combat timing hooks registered");
}
