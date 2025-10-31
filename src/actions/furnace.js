export function register(bot, commandHandlers, ctx) {
  // smeltauto / smelt <outputName> [count]
  commandHandlers.set('smeltauto', ({ args, sender }) => {
    const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ'].includes(String(a||'').toLowerCase()));
    if (!args || args.length === 0 || hasHelp(args)) { bot.chat('自動製錬: 必要なら燃料も確保して精錬します。'); bot.chat('使用: smeltauto <itemName> [count]'); bot.chat('例: smeltauto glass 8'); return; }
    const a0 = String(args[0]).toLowerCase(); const a1 = args[1] !== undefined ? String(args[1]).toLowerCase() : undefined;
    const a0num = Number(a0); const a1num = a1 !== undefined ? Number(a1) : NaN;
    let itemName = isNaN(a0num) ? a0 : (a1 ?? ''); let count = !isNaN(a0num) ? a0num : (!isNaN(a1num) ? a1num : 1);
    itemName = itemName.replace(/^minecraft:/, '').replace(/\s+/g, '_'); count = Math.max(1, Math.min(64, Number(count)));
    (async () => { try { if (sender) bot.chat(`@${sender} 自動製錬: ${itemName} x${count}`); const ok = await ctx.smeltAuto(itemName, count, sender); if (ok) { if (sender) bot.chat(`@${sender} 製錬完了: ${itemName} x${count}`); } else { if (sender) bot.chat(`@${sender} 製錬できませんでした: ${itemName}`); } } catch(e){ if (sender) bot.chat(`@${sender} 失敗: ${e.message}`);} })();
  });
  commandHandlers.set('smelt', (ctx2) => commandHandlers.get('smeltauto')(ctx2));

  // furnace <input|fuel|take|load>
  commandHandlers.set('furnace', ({ args, sender }) => {
    const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ','/?','?'].includes(String(a||'').toLowerCase()));
    if (!args || args.length === 0 || hasHelp(args)) {
      bot.chat('かまど操作:');
      bot.chat('使用: furnace <input|fuel|take|load> ...');
      bot.chat('例: furnace input raw_iron 8 / furnace take output');
      bot.chat('詳細: input|fuel|put で投入、take <input|fuel|output>、load で入力+燃料まとめて');
      return; }
    const sub = args[0].toLowerCase(); const rest = args.slice(1);
    const parseNameCount = (arr) => { const a0 = arr[0]; const a1 = arr[1]; const isNum0 = a0 !== undefined && !isNaN(Number(a0)); const isNum1 = a1 !== undefined && !isNaN(Number(a1)); const name = (isNum0 ? a1 : a0) || ''; const count = Math.max(1, Math.min(64, Number(isNum0 ? a0 : (isNum1 ? a1 : 1)))); return { name, count, consumed: (a0!==undefined?1:0)+(a1!==undefined?1:0) }; };
    (async () => {
      try {
        const furnace = await ctx.openOrApproachFurnace();
        const pickInventoryItemByName = (name) => { name = String(name || '').replace(/^minecraft:/, '').toLowerCase(); return bot.inventory.items().find((i) => i.name === name) || null; };
        const putCommon = async (slotKind, a) => { const a0=a[0]; const a1=a[1]; const isNum0=!isNaN(Number(a0)); const isNum1=!isNaN(Number(a1)); const name=(isNum0?a1:a0)||''; const count=Math.max(1,Math.min(64,Number(isNum0?a0:(isNum1?a1:1)))); const item=pickInventoryItemByName(name); if(!item){ bot.chat(sender?`@${sender} 所持していません: ${name}`:`所持していません: ${name}`); furnace.close(); return;} const fn=slotKind==='input'?furnace.putInput:furnace.putFuel; await fn.call(furnace,item.type,null,count); bot.chat(sender?`@${sender} かまどに ${ctx.getJaItemName(item.name)} x${count} を投入(${slotKind})`:'ok'); furnace.close(); };
        const takeCommon = async (what) => { const map={ input:furnace.takeInput, fuel:furnace.takeFuel, output:furnace.takeOutput }; const fn=map[what]; if(!fn){ bot.chat(sender?`@${sender} take は input|fuel|output`:'take: input|fuel|output'); furnace.close(); return;} try{ const it=await fn.call(furnace); if (it) bot.chat(sender?`@${sender} 回収: ${ctx.getJaItemName(it.name)} x${it.count}`:'took'); else bot.chat(sender?`@${sender} 取り出せるアイテムがありません`:'empty'); } finally{ furnace.close(); } };
        if (sub === 'input' || sub === 'in') { await putCommon('input', rest); }
        else if (sub === 'fuel') { await putCommon('fuel', rest); }
        else if (sub === 'put') { const kind=(rest[0]||'').toLowerCase(); if(kind!=='input'&&kind!=='fuel'){ bot.chat(sender?`@${sender} put は input|fuel を指定`:'put: input|fuel'); furnace.close(); return; } await putCommon(kind, rest.slice(1)); }
        else if (sub === 'take') { const what=(rest[0]||'output').toLowerCase(); await takeCommon(what); }
        else if (sub === 'load') {
          if (!rest || rest.length === 0) { bot.chat(sender?`@${sender} 使用: furnace load <inputName> [count] [fuelName] [fuelCount]`:'usage: furnace load <inputName> [count] [fuelName] [fuelCount]'); furnace.close(); return; }
          const pIn=parseNameCount(rest); const inItem=pickInventoryItemByName(pIn.name); if(!inItem){ bot.chat(sender?`@${sender} 所持していません: ${pIn.name}`:`所持していません: ${pIn.name}`); furnace.close(); return; } await furnace.putInput(inItem.type,null,pIn.count);
          const rest2 = rest.slice(Math.max(1,pIn.consumed));
          if (rest2.length > 0){ const pFuel=parseNameCount(rest2); const fuelItem=pickInventoryItemByName(pFuel.name); if(!fuelItem){ bot.chat(sender?`@${sender} 燃料を所持していません: ${pFuel.name}`:`燃料を所持していません: ${pFuel.name}`); furnace.close(); return;} await furnace.putFuel(fuelItem.type,null,pFuel.count); bot.chat(sender?`@${sender} かまどに投入: 入力 ${ctx.getJaItemName(inItem.name)} x${pIn.count}, 燃料 ${ctx.getJaItemName(fuelItem.name)} x${pFuel.count}`:'loaded'); furnace.close(); }
          else { try { await ctx.ensureFuelInFurnace(furnace,pIn.count,sender); bot.chat(sender?`@${sender} かまどに投入: 入力 ${ctx.getJaItemName(inItem.name)} x${pIn.count}（燃料は自動投入）`:'loaded'); } finally { furnace.close(); } }
        }
        else { bot.chat(sender?`@${sender} 使用: furnace <input|fuel|take|load>`:'usage: furnace <input|fuel|take|load>'); furnace.close(); }
      } catch (e) { bot.chat(sender?`@${sender} 失敗: ${e.message}`:`失敗: ${e.message}`); }
    })();
  });
}
