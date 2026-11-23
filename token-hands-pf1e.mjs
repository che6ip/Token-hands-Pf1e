/**
 * Руки на токене: PF1e (token-hands-pf1e) — предметный модуль для Pathfinder 1e.
 * Foundry VTT v13, система pf1.
 *
 * Вся отрисовка живёт в базовом модуле «Руки на токене» (token-hands).
 * Здесь разбор того, что персонаж держит в руках:
 *   - оружие с system.equipped === true;
 *   - щиты (equipment с subType === "shield" и system.equipped === true);
 *   - system.held: "1h" — основная рука, "2h" — двуручное, "oh" — вторая рука.
 *
 * Дополнительно:
 *   - пустая рука показывается ладонью, если вторая рука занята;
 *   - ПКМ по слоту открывает меню выбора предмета из инвентаря для этой руки.
 */

const MODULE_ID = "token-hands-pf1e";
const BASE_ID = "token-hands";
const SYSTEM_ID = "pf1";
const FLAG_KEY = "held";

/** Типы актёров, у которых есть руки. */
const HAND_ACTOR_TYPES = new Set(["character", "npc"]);

const PALM_ICON = "systems/pf1/icons/actions/hand.svg";
const PALM_FALLBACKS = [PALM_ICON, "icons/svg/combat.svg"];
const WEAPON_FALLBACKS = ["icons/svg/sword.svg", "icons/svg/item-bag.svg"];
const SHIELD_FALLBACKS = ["icons/svg/shield.svg", "icons/svg/item-bag.svg"];

const MENU_CSS = `
.token-hands-pf1e-menu {
  position: fixed; z-index: 100000; min-width: 260px; max-width: 380px;
  max-height: 60vh; overflow-y: auto; padding: 4px;
  background: var(--color-bg, #1a1a1a); color: var(--color-text-primary, #eee);
  border: 1px solid var(--color-border-light-tertiary, #777);
  border-radius: 6px; box-shadow: 0 6px 18px rgba(0, 0, 0, .55);
  font-size: 13px;
}
.token-hands-pf1e-menu .thpf1e-title {
  padding: 4px 8px 6px; font-weight: 600; opacity: .85;
  border-bottom: 1px solid var(--color-border-light-tertiary, #555);
  margin-bottom: 4px;
}
.token-hands-pf1e-menu .thpf1e-search {
  width: 100%; box-sizing: border-box; margin: 0 0 5px; padding: 5px 7px;
  color: inherit; background: rgba(0, 0, 0, .25);
  border: 1px solid var(--color-border-light-tertiary, #555); border-radius: 4px;
}
.token-hands-pf1e-menu .thpf1e-section {
  padding: 6px 8px 2px; font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .03em; opacity: .6;
}
.token-hands-pf1e-menu .thpf1e-entry {
  display: flex; align-items: center; gap: 7px; width: 100%;
  padding: 5px 8px; border: 0; border-radius: 4px; background: transparent;
  color: inherit; text-align: left; cursor: pointer;
}
.token-hands-pf1e-menu .thpf1e-entry:hover {
  background: var(--color-hover-bg, rgba(255, 255, 255, .12));
}
.token-hands-pf1e-menu .thpf1e-entry.active {
  background: var(--color-active-bg, rgba(255, 255, 255, .18));
  outline: 1px solid var(--color-border-highlight, #c9a227);
}
.token-hands-pf1e-menu .thpf1e-entry img {
  width: 20px; height: 20px; object-fit: contain; flex: none;
}
.token-hands-pf1e-menu .thpf1e-entry span {
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.token-hands-pf1e-menu .thpf1e-entry .thpf1e-qty {
  margin-left: auto; opacity: .65; font-size: 11px; flex: none;
}
.token-hands-pf1e-menu .thpf1e-divider {
  height: 1px; margin: 4px 6px; background: var(--color-border-light-tertiary, #555);
}
`;

/** Подтипы добычи, которые PF1e раскладывает по разным вкладкам инвентаря. */
const GEAR_SUBTYPES = new Set([
  "gear", "adventuring", "tool", "reagent", "remedy", "herb", "animal", "animalGear",
]);
const MISC_SUBTYPES = new Set(["misc", "food", "entertainment", "vehicle"]);
const TRADE_SUBTYPES = new Set(["tradeGoods", "treasure"]);

const INVENTORY_SECTIONS = [
  {
    id: "weapon",
    labelKey: "PF1.InventoryWeapons",
    fallbackKey: "SectionWeapons",
    match: (item) => item.type === "weapon",
  },
  {
    id: "armor",
    labelKey: "PF1.ArmorOrShield",
    fallbackKey: "SectionArmor",
    match: (item) => item.type === "equipment"
      && ["armor", "shield"].includes(item.system?.subType),
  },
  {
    id: "equipment",
    labelKey: "PF1.InventoryEquipment",
    fallbackKey: "SectionEquipment",
    match: (item) => item.type === "equipment",
  },
  {
    id: "implant",
    labelKey: "PF1.InventoryImplants",
    fallbackKey: "SectionImplants",
    match: (item) => item.type === "implant",
  },
  {
    id: "consumable",
    labelKey: "PF1.InventoryConsumables",
    fallbackKey: "SectionConsumables",
    match: (item) => item.type === "consumable",
  },
  {
    id: "gear",
    labelKey: "PF1.Subtypes.Item.loot.gear.Plural",
    fallbackKey: "SectionGear",
    match: (item) => item.type === "loot" && GEAR_SUBTYPES.has(item.system?.subType),
  },
  {
    id: "ammo",
    labelKey: "PF1.Subtypes.Item.loot.ammo.Plural",
    fallbackKey: "SectionAmmo",
    match: (item) => item.type === "loot" && item.system?.subType === "ammo",
  },
  {
    id: "misc",
    labelKey: "PF1.Subtypes.Item.loot.misc.Plural",
    fallbackKey: "SectionMisc",
    match: (item) => item.type === "loot" && MISC_SUBTYPES.has(item.system?.subType),
  },
  {
    id: "tradeGoods",
    labelKey: "PF1.Subtypes.Item.loot.tradeGoods.Plural",
    fallbackKey: "SectionTradeGoods",
    match: (item) => item.type === "loot" && TRADE_SUBTYPES.has(item.system?.subType),
  },
  {
    id: "container",
    labelKey: "PF1.InventoryContainers",
    fallbackKey: "SectionContainers",
    match: (item) => item.type === "container",
  },
  {
    id: "other",
    labelKey: "TOKEN-HANDS-PF1E.SectionOther",
    fallbackKey: "SectionOther",
    match: () => true,
  },
];

let connected = false;
let activeMenu = null;
let menuCleanup = null;

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
  injectStyles();
  console.log(`[${MODULE_ID}] готов, версия ${game.modules.get(MODULE_ID)?.version}`);
});

function connectToBase() {
  if (connected) return true;

  const provider = {
    id: "pf1e",
    resolveHands,
    onSlotContextMenu,
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
 * @param {Token|null} token
 * @returns {{left: object|null, right: object|null}|null}
 */
function resolveHands(actor, token = null) {
  if (!actor || !HAND_ACTOR_TYPES.has(actor.type)) return null;

  const held = collectHeldItems(actor);
  const weapons = held.filter((entry) => entry.kind === "weapon");
  const shields = held.filter((entry) => entry.kind === "shield");

  let rightItem = null;
  let leftItem = null;
  let leftDim = false;

  const twoHanded = weapons.find((entry) => entry.twoHanded);
  if (twoHanded) {
    rightItem = twoHanded.item;
    leftItem = twoHanded.item;
    leftDim = true;
  } else {
    const mainWeapons = weapons.filter((entry) => !entry.offhand);
    const offhandWeapons = weapons.filter((entry) => entry.offhand);
    rightItem = mainWeapons[0]?.item ?? null;
    leftItem = offhandWeapons[0]?.item ?? mainWeapons[1]?.item ?? shields[0]?.item ?? null;
  }

  // Ручной выбор предмета для руки перекрывает автоматику.
  const overrides = getOverrides(token);
  const hasRight = Object.prototype.hasOwnProperty.call(overrides, "right");
  const hasLeft = Object.prototype.hasOwnProperty.call(overrides, "left");

  if (twoHanded && (hasRight || hasLeft)) {
    // Ручной выбор ломает автоматическую пару двуручного оружия.
    rightItem = null;
    leftItem = null;
    leftDim = false;
  }

  if (hasRight) rightItem = resolveOverrideItem(actor, overrides.right, rightItem);
  if (hasLeft) {
    leftItem = resolveOverrideItem(actor, overrides.left, leftItem);
    leftDim = false;
  }

  const hasOverrides = hasRight || hasLeft;
  if (!rightItem && !leftItem && !hasOverrides) return null;

  return {
    right: rightItem ? makeItemSlot(rightItem, false) : makePalmSlot(),
    left: leftItem ? makeItemSlot(leftItem, leftDim) : makePalmSlot(),
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

function makeItemSlot(item, dim) {
  const isShield = item.type === "equipment" && item.system?.subType === "shield";
  return {
    img: item.img || (isShield ? SHIELD_FALLBACKS[0] : WEAPON_FALLBACKS[0]),
    name: item.name ?? "",
    item,
    dim: !!dim,
    fallbacks: [...(isShield ? SHIELD_FALLBACKS : WEAPON_FALLBACKS)],
  };
}

function makePalmSlot() {
  return {
    img: PALM_ICON,
    name: game.i18n.localize("TOKEN-HANDS-PF1E.EmptyHand"),
    item: null,
    dim: false,
    empty: true,
    fallbacks: [...PALM_FALLBACKS],
  };
}

/* -------------------------------------------------------------------------- */
/*  Ручной выбор предмета для руки                                             */
/* -------------------------------------------------------------------------- */

/** Флаги токена: { right?: itemId|null, left?: itemId|null } */
function getOverrides(token) {
  try {
    const value = token?.document?.getFlag?.(MODULE_ID, FLAG_KEY)
      ?? token?.document?.flags?.[MODULE_ID]?.[FLAG_KEY];
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function resolveOverrideItem(actor, value, fallback) {
  if (value === null) return null;
  if (typeof value === "string") return actor.items.get(value) ?? fallback;
  return fallback;
}

async function setOverride(token, hand, value) {
  if (hand !== "left" && hand !== "right") return;
  if (!game.user.isGM && !token?.document?.isOwner) {
    ui.notifications.warn(game.i18n.localize("TOKEN-HANDS-PF1E.NoPermission"));
    return;
  }

  const next = { ...getOverrides(token) };
  if (value === undefined) delete next[hand];
  else next[hand] = value;

  try {
    // Сначала полностью снимаем флаг: setFlag/update сливают вложенные объекты,
    // поэтому иначе удалённые руки остаются в старом значении.
    await token.document.unsetFlag(MODULE_ID, FLAG_KEY);
    if (Object.keys(next).length > 0) {
      await token.document.setFlag(MODULE_ID, FLAG_KEY, next);
    }
    globalThis.tokenHands?.renderTokenHands?.(token);
  } catch (err) {
    console.error(`[${MODULE_ID}] не удалось сохранить выбор предмета для руки`, err);
  }
}

function onSlotContextMenu(event, slot, token) {
  if (!token?.actor) return false;
  if (!game.user.isGM && !token.document?.isOwner) return false;

  const hand = slot?.key === "left" ? "left" : slot?.key === "right" ? "right" : null;
  if (!hand) return false;

  openHandMenu(event, hand, token);
  return true;
}

function openHandMenu(event, hand, token) {
  closeHandMenu();
  injectStyles();

  const actor = token.actor;
  const overrides = getOverrides(token);
  const current = Object.prototype.hasOwnProperty.call(overrides, hand) ? overrides[hand] : undefined;

  const menu = document.createElement("div");
  menu.className = "token-hands-pf1e-menu";

  const title = document.createElement("div");
  title.className = "thpf1e-title";
  title.textContent = game.i18n.localize(
    hand === "right" ? "TOKEN-HANDS-PF1E.RightHand" : "TOKEN-HANDS-PF1E.LeftHand"
  );
  menu.append(title);

  const addEntry = (parent, label, value, img, active, item = null, qty = 1) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `thpf1e-entry${active ? " active" : ""}`;
    if (item) {
      button.dataset.item = "1";
      button.dataset.name = String(item.name ?? "").toLowerCase();
    }
    if (img) {
      const image = document.createElement("img");
      image.src = img;
      image.alt = "";
      button.append(image);
    }
    const text = document.createElement("span");
    text.textContent = label;
    button.append(text);
    if (qty > 1) {
      const quantity = document.createElement("span");
      quantity.className = "thpf1e-qty";
      quantity.textContent = `×${qty}`;
      button.append(quantity);
    }
    button.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      closeHandMenu();
      await setOverride(token, hand, value);
    });
    parent.append(button);
  };

  addEntry(menu, game.i18n.localize("TOKEN-HANDS-PF1E.Auto"), undefined, null, current === undefined);
  addEntry(menu, game.i18n.localize("TOKEN-HANDS-PF1E.EmptyHand"), null, PALM_ICON, current === null);

  const divider = document.createElement("div");
  divider.className = "thpf1e-divider";
  menu.append(divider);

  const items = [...(actor.items ?? [])]
    .filter((item) => item.isPhysical !== false)
    .filter((item) => Number(item.system?.quantity ?? 1) !== 0)
    .sort((a, b) => {
      const sortA = Number(a.sort) || 0;
      const sortB = Number(b.sort) || 0;
      return sortA - sortB || String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });

  let search = null;
  if (items.length > 5) {
    search = document.createElement("input");
    search.type = "search";
    search.className = "thpf1e-search";
    search.placeholder = game.i18n.localize("TOKEN-HANDS-PF1E.SearchPlaceholder");
    menu.append(search);
  }

  const groups = new Map(INVENTORY_SECTIONS.map((section) => [section.id, []]));
  for (const item of items) {
    const section = INVENTORY_SECTIONS.find((entry) => entry.match(item))
      ?? INVENTORY_SECTIONS[INVENTORY_SECTIONS.length - 1];
    groups.get(section.id).push(item);
  }

  for (const section of INVENTORY_SECTIONS) {
    const list = groups.get(section.id);
    if (!list?.length) continue;

    const group = document.createElement("div");
    group.className = "thpf1e-group";
    group.dataset.section = section.id;

    const header = document.createElement("div");
    header.className = "thpf1e-section";
    header.textContent = sectionLabel(section);
    group.append(header);

    for (const item of list) {
      const qty = Number(item.system?.quantity ?? 1);
      addEntry(group, item.name ?? "", item.id, item.img, current === item.id, item, qty);
    }
    menu.append(group);
  }

  if (search) {
    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      for (const group of menu.querySelectorAll(".thpf1e-group")) {
        let visible = 0;
        for (const entry of group.querySelectorAll(".thpf1e-entry[data-item]")) {
          const match = !query || String(entry.dataset.name ?? "").includes(query);
          entry.hidden = !match;
          if (match) visible += 1;
        }
        group.hidden = visible === 0;
      }
    });
  }

  document.body.append(menu);

  const native = event?.nativeEvent ?? event;
  const x = Number(native?.clientX ?? native?.pageX ?? 0);
  const y = Number(native?.clientY ?? native?.pageY ?? 0);
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;

  activeMenu = menu;

  const onPointerDown = (ev) => {
    if (!menu.contains(ev.target)) closeHandMenu();
  };
  const onKeyDown = (ev) => {
    if (ev.key === "Escape") closeHandMenu();
  };
  const onContextMenu = (ev) => ev.preventDefault();

  // Перехватываем contextmenu сразу, чтобы браузер не открыл своё меню.
  document.addEventListener("contextmenu", onContextMenu, true);

  setTimeout(() => {
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    search?.focus();
  }, 0);

  menuCleanup = () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("contextmenu", onContextMenu, true);
  };
}

/** Название вкладки инвентаря: системная локализация или запасной ключ модуля. */
function sectionLabel(section) {
  const value = game.i18n.localize(section.labelKey);
  if (value !== section.labelKey) return value;
  return game.i18n.localize(`TOKEN-HANDS-PF1E.${section.fallbackKey}`);
}

function closeHandMenu() {
  if (activeMenu) activeMenu.remove();
  activeMenu = null;
  menuCleanup?.();
  menuCleanup = null;
}

function injectStyles() {
  if (document.getElementById(`${MODULE_ID}-styles`) || !document.head) return;
  const style = document.createElement("style");
  style.id = `${MODULE_ID}-styles`;
  style.textContent = MENU_CSS;
  document.head.append(style);
}

/* -------------------------------------------------------------------------- */
/*  Диагностика                                                               */
/* -------------------------------------------------------------------------- */

Hooks.once("ready", () => {
  if (game.system?.id !== SYSTEM_ID) return;
  globalThis.tokenHandsPf1e = {
    resolveHands,
    collectHeldItems,
    getOverrides,
    setOverride,
    onSlotContextMenu,
    openHandMenu,
    closeHandMenu,
  };
});
