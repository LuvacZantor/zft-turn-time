import { getCampaignStats, getCombatState, resetCampaignStats } from "./store.js";
import { formatDuration, postCombatReport, refreshCombatTracker } from "./ui.js";
import {
  isPrimaryGM,
  pauseTimer,
  resetTimer,
  resumeTimer,
  setTimerElapsed,
  toggleTimer
} from "./timer.js";

export function buildAPI() {
  return Object.freeze({
    get campaignStats() {
      return getCampaignStats();
    },

    get combatState() {
      return getCombatState(game.combat);
    },

    get isPaused() {
      return Boolean(getCombatState(game.combat).active?.paused);
    },

    getActorStats(actorOrId) {
      const actorId = typeof actorOrId === "string" ? actorOrId : actorOrId?.id;
      return actorId ? getCampaignStats().actors[actorId] ?? null : null;
    },

    getUserStats(userOrId) {
      const userId = typeof userOrId === "string" ? userOrId : userOrId?.id;
      return userId ? getCampaignStats().users[userId] ?? null : null;
    },

    async resetCampaignStats() {
      if (!isPrimaryGM()) {
        ui.notifications?.warn("ZFT Turn Time: Only the primary active GM can reset statistics.");
        return false;
      }

      await resetCampaignStats();
      refreshCombatTracker();
      return true;
    },

    pauseTimer,
    resumeTimer,
    toggleTimer,
    resetTimer,
    setTimerElapsed,
    postCombatReport,
    formatDuration,
    isPrimaryGM
  });
}
