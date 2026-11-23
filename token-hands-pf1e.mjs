/**
 * Руки на токене: PF1e (token-hands-pf1e) — предметный модуль для Pathfinder 1e.
 * Foundry VTT v13, система pf1.
 *
 * Вся отрисовка живёт в базовом модуле «Руки на токене» (token-hands).
 * Здесь только разбор того, что персонаж держит в руках:
 *   - оружие с system.equipped === true;
 *   - щиты (equipment с subType === "shield" и system.equipped === true);
 *   - system.held: "1h" — основная рука, "2h" — двуручное, "oh" — вторая рука.
 */

const MODULE_ID = "token-hands-pf1e";
const BASE_ID = "token-hands";
const SYSTEM_ID = "pf1";

/** Типы актёров, у которых есть руки. */
const HAND_ACTOR_TYPES = new Set(["character", "npc"]);

const WEAPON_FALLBACKS = ["icons/svg/sword.svg", "icons/svg/item-bag.svg"];
const SHIELD_FALLBACKS = ["icons/svg/shield.svg", "icons/svg/item-bag.svg"];

let connected = false;

/* -------------------------------------------------------------------------- */
/*  Подключение к базе                                                        */
/* -------------------------------------------------------------------------- */

Hooks.once("init", () => {
  if (game.system?.id !== SYSTEM_ID) {
    console.warn(`[${MODULE_ID}] Нужна система Pathfinder 1e (${SYSTEM_ID}) — модуль отключается.`);
    return;
  }

  const base = game.modules.get(BASE_ID);
  if (!base?.active) {
    console.warn(`[${MODULE_ID}] Не включён базовый модуль «Руки на токене» (${BASE_ID}) — слотов не будет.`);
    return;
  }

  connectToBase();
});

Hooks.once("ready", () => {
  if (game.system?.id !== SYSTEM_ID) return;
  if (!game.modules.get(BASE_ID)?.active) return;
  connectToBase();
  console.log(`[${MODULE_ID}] готов, версия ${game.modules.get(MODULE_ID)?.version}`);
});

function connectToBase() {
  if (connected) return true;

  const provider = {
    id: "pf1e",
    resolveHands,
    iconFallbacks: ["icons/svg/item-bag.svg"],
  };

  if (globalThis.tokenHands?.register?.(provider)) {
    connected = true;
    console.info(`[${MODULE_ID}] подключён к базе «${BASE_ID}»`);
    return true;
  }

  Hooks.call(`${BASE_ID}Register`, provider);
  const attached = globalThis.tokenHands?.providers?.().includes("pf1e") === true;
  if (attached) {
    connected = true;
    console.info(`[${MODULE_ID}] подключён к базе «${BASE_ID}» через хук`);
  } else {
    console.warn(`[${MODULE_ID}] база не приняла провайдера — проверь, что ${BASE_ID} включён и обновлён.`);
  }
  return connected;
}

/* -------------------------------------------------------------------------- */
/*  Разбор рук актёра                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Руки актёра для базы.
 * @param {Actor} actor
 * @returns {{left: object|null, right: object|null}|null}
 */
function resolveHands(actor) {
  if (!actor || !HAND_ACTOR_TYPES.has(actor.type)) return null;

  const held = collectHeldItems(actor);
  const weapons = held.filter((entry) => entry.kind === "weapon");
  const shields = held.filter((entry) => entry.kind === "shield");

  // Двуручное оружие: правая рука — активная, левая — затемнённая копия.
  const twoHanded = weapons.find((entry) => entry.twoHanded);
  if (twoHanded) {
    return {
      right: makeSlot(twoHanded.item, false),
      left: makeSlot(twoHanded.item, true),
    };
  }

  const mainWeapons = weapons.filter((entry) => !entry.offhand);
  const offhandWeapons = weapons.filter((entry) => entry.offhand);

  const main = mainWeapons[0] ?? null;
  const secondary = mainWeapons[1] ?? null;
  const offhand = offhandWeapons[0] ?? null;
  const shield = shields[0] ?? null;

  const rightItem = main?.item ?? null;
  const leftItem = offhand?.item ?? secondary?.item ?? shield?.item ?? null;

  if (!rightItem && !leftItem) return null;

  return {
    right: rightItem ? makeSlot(rightItem, false) : null,
    left: leftItem ? makeSlot(leftItem, false) : null,
  };
}

/**
 * Собранные предметы в руках. PF1e хранит оружие и щиты в разных типах,
 * но у обоих есть system.equipped.
 */
function collectHeldItems(actor) {
  const result = [];

  for (const item of actor.items ?? []) {
    if (!item?.system?.equipped) continue;

    if (item.type === "weapon") {
      const held = String(item.system.held ?? "").toLowerCase();
      const hands = Number(item.system.hands);
      result.push({
        item,
        kind: "weapon",
        offhand: held === "oh",
        twoHanded: held === "2h" || (Number.isFinite(hands) && hands >= 2),
      });
      continue;
    }

    if (item.type === "equipment" && item.system.subType === "shield") {
      result.push({ item, kind: "shield", offhand: true, twoHanded: false });
    }
  }

  return result.sort((a, b) => {
    const sortA = Number(a.item.sort) || 0;
    const sortB = Number(b.item.sort) || 0;
    return sortA - sortB || String(a.item.name ?? "").localeCompare(String(b.item.name ?? ""));
  });
}

function makeSlot(item, dim) {
  const isShield = item.type === "equipment" && item.system?.subType === "shield";
  return {
    img: item.img || (isShield ? SHIELD_FALLBACKS[0] : WEAPON_FALLBACKS[0]),
    name: item.name ?? "",
    item,
    dim: !!dim,
    fallbacks: [...(isShield ? SHIELD_FALLBACKS : WEAPON_FALLBACKS)],
  };
}

/* -------------------------------------------------------------------------- */
/*  Диагностика                                                               */
/* -------------------------------------------------------------------------- */

Hooks.once("ready", () => {
  if (game.system?.id !== SYSTEM_ID) return;
  globalThis.tokenHandsPf1e = {
    resolveHands,
    collectHeldItems,
  };
});
