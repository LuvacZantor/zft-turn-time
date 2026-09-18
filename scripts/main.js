import { MODULE_ID, VERSION } from "./constants.js";
import { buildAPI } from "./api.js";
import { registerSettings } from "./settings.js";
import { registerTimerHooks } from "./timer.js";
import { registerUIHooks } from "./ui.js";

console.log(`[ZFT] 🛠️ v${VERSION} | Initializing ZFT Turn Time`);

Hooks.once("init", () => {
  registerSettings();
  registerTimerHooks();
  registerUIHooks();

  const module = game.modules.get(MODULE_ID);
  if (module) module.api = buildAPI();

  console.log(`[ZFT] ✅ v${VERSION} | ZFT Turn Time initialized`);
});

Hooks.once("ready", () => {
  console.log(
    `[ZFT] 🚦 v${VERSION} | Ready | user=${game.user?.name ?? "unknown"} | gm=${Boolean(game.user?.isGM)}`
  );
});
