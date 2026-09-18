import { MODULE_ID, SETTINGS } from "./constants.js";

function refreshCombatTracker() {
  try {
    ui.combat?.render();
  } catch (error) {
    console.warn("[ZFT] ⚠️ Could not refresh Combat Tracker after setting change", error);
  }
}

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.CAMPAIGN_STATS, {
    name: "Campaign Turn Statistics",
    scope: "world",
    config: false,
    type: Object,
    default: {
      actors: {},
      users: {}
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.TRACK_NPCS, {
    name: "Track NPC Turns",
    hint: "Include NPC combatants in timing statistics.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.MAX_TURN_SECONDS, {
    name: "Maximum Turn Length (seconds)",
    hint: "Completed turns longer than this are discarded. Set to 0 to disable the limit.",
    scope: "world",
    config: true,
    type: Number,
    default: 600
  });

  game.settings.register(MODULE_ID, SETTINGS.DISPLAY_MODE, {
    name: "Combat Tracker Display",
    hint: "Choose what timing information is shown beside each combatant.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      both: "Current timer + average",
      current: "Current timer only",
      average: "Average only",
      off: "Hidden"
    },
    default: "both",
    onChange: refreshCombatTracker
  });

  game.settings.register(MODULE_ID, SETTINGS.RESET_ON_COMBAT, {
    name: "Reset Campaign Statistics Each Combat",
    hint: "If enabled, campaign actor/user aggregates are cleared when a new combat starts. Encounter statistics are always separate.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_REPORT_BUTTON, {
    name: "Show Combat Report Button",
    hint: "Show a stopwatch button in the Combat Tracker for posting encounter timing statistics to chat.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: refreshCombatTracker
  });


  game.settings.register(MODULE_ID, SETTINGS.AUTO_REPORT_END, {
    name: "Post Report When Combat Ends",
    hint: "Automatically post the encounter turn-time report to chat when combat is ended.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  console.log("[ZFT] ⚙️ Turn Time settings registered");
}
