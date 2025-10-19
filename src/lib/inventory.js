// Inventory-related helpers

export function invCountById(bot, id, meta = null) {
  return bot.inventory.count(id, meta);
}

export function itemNameById(mcData, id) {
  return mcData?.items?.[id]?.name || String(id);
}

export function invCountByName(bot, mcData, name) {
  const def = mcData?.itemsByName?.[name];
  return def ? invCountById(bot, def.id, null) : 0;
}

