import { FLAGS, MODULE_ID, SETTINGS } from "./constants.js";

export function emptyCampaignStats() {
  return { actors: {}, users: {} };
}

export function emptyCombatState() {
  return {
    schema: 1,
    active: null,
    combatants: {}
  };
}

function normalizeAggregate(value = {}) {
  const count = Number.isFinite(Number(value?.count)) ? Math.max(0, Number(value.count)) : 0;
  const totalMs = Number.isFinite(Number(value?.totalMs)) ? Math.max(0, Number(value.totalMs)) : 0;
  return { count, totalMs };
}

export function normalizeCampaignStats(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const stats = emptyCampaignStats();

  for (const [id, value] of Object.entries(source.actors ?? {})) {
    stats.actors[id] = {
      ...normalizeAggregate(value),
      name: String(value?.name ?? "")
    };
  }

  for (const [id, value] of Object.entries(source.users ?? {})) {
    stats.users[id] = {
      ...normalizeAggregate(value),
      name: String(value?.name ?? "")
    };
  }

  return stats;
}

export function normalizeCombatState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const state = emptyCombatState();

  const active = source.active;
  if (active?.combatantId && Number.isFinite(Number(active.startedAt))) {
    state.active = {
      combatantId: String(active.combatantId),
      actorId: active.actorId ? String(active.actorId) : null,
      startedAt: Number(active.startedAt),
      round: Number.isFinite(Number(active.round)) ? Number(active.round) : null,
      turn: Number.isFinite(Number(active.turn)) ? Number(active.turn) : null
    };
  }

  for (const [id, value] of Object.entries(source.combatants ?? {})) {
    state.combatants[id] = {
      ...normalizeAggregate(value),
      actorId: value?.actorId ? String(value.actorId) : null,
      name: String(value?.name ?? "")
    };
  }

  return state;
}

export function getCampaignStats() {
  return normalizeCampaignStats(game.settings.get(MODULE_ID, SETTINGS.CAMPAIGN_STATS));
}

export async function setCampaignStats(stats) {
  return game.settings.set(MODULE_ID, SETTINGS.CAMPAIGN_STATS, normalizeCampaignStats(stats));
}

export async function resetCampaignStats() {
  await game.settings.set(MODULE_ID, SETTINGS.CAMPAIGN_STATS, emptyCampaignStats());
  console.log("[ZFT] 🧹 Campaign turn statistics reset");
}

export function getCombatState(combat) {
  if (!combat) return emptyCombatState();
  return normalizeCombatState(combat.getFlag(MODULE_ID, FLAGS.COMBAT_STATE));
}

export async function setCombatState(combat, state) {
  if (!combat) return;
  await combat.setFlag(MODULE_ID, FLAGS.COMBAT_STATE, normalizeCombatState(state));
}

export function addSample(target, key, { name = "", actorId = null, elapsedMs }) {
  if (!key) return;

  const current = target[key] ?? {
    count: 0,
    totalMs: 0
  };

  target[key] = {
    ...current,
    count: current.count + 1,
    totalMs: current.totalMs + elapsedMs,
    ...(name ? { name } : {}),
    ...(actorId ? { actorId } : {})
  };
}

export function averageMs(stat) {
  if (!stat?.count) return null;
  return stat.totalMs / stat.count;
}
