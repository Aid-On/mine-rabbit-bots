// Unit tests for chest-operations.js
// These tests use mocks and can run without a Minecraft server

import {
  analyzeChest,
  getExcludedSlots,
  sortItemsByPriority,
  depositItem,
  depositAllItems
} from './src/lib/chest-operations.js';

// Helper to create test results
function testResult(name, passed, message = '') {
  const status = passed ? '✓' : '✗';
  console.log(`${status} ${name}`);
  if (message) console.log(`  ${message}`);
  return passed;
}

// Mock objects
function createMockChest(containerItems = []) {
  const slots = new Array(63).fill(null);

  // Container slots: 0-26
  containerItems.forEach((item, idx) => {
    if (idx < 27) {
      slots[idx] = item;
    }
  });

  return {
    window: {
      inventoryStart: 27,
      inventoryEnd: 54,
      slots
    },
    containerItems: () => containerItems.filter(Boolean),
    items: () => containerItems.filter(Boolean)
  };
}

function createMockItem(type, count, name = 'test_item', stackSize = 64) {
  return { type, count, name, stackSize };
}

// Test suite
console.log('\n=== Unit Tests for chest-operations.js ===\n');

let totalTests = 0;
let passedTests = 0;

// Test 1: analyzeChest - empty chest
{
  totalTests++;
  const chest = createMockChest([]);
  const result = analyzeChest(chest);

  const passed =
    result.totalSlots === 27 &&
    result.emptySlots === 27 &&
    result.chestSlots.length === 0 &&
    result.stackableSpace.size === 0;

  if (testResult('analyzeChest - empty chest', passed)) {
    passedTests++;
  } else {
    console.log(`  Expected: totalSlots=27, emptySlots=27, chestSlots=[], stackableSpace=Map(0)`);
    console.log(`  Got: totalSlots=${result.totalSlots}, emptySlots=${result.emptySlots}, chestSlots.length=${result.chestSlots.length}, stackableSpace.size=${result.stackableSpace.size}`);
  }
}

// Test 2: analyzeChest - partially filled chest
{
  totalTests++;
  const items = [
    createMockItem(1, 32, 'stone', 64),
    createMockItem(2, 16, 'dirt', 64)
  ];
  const chest = createMockChest(items);
  const result = analyzeChest(chest);

  const passed =
    result.totalSlots === 27 &&
    result.emptySlots === 25 &&
    result.chestSlots.length === 2 &&
    result.stackableSpace.get(1) === 32 &&
    result.stackableSpace.get(2) === 48;

  if (testResult('analyzeChest - partially filled chest', passed)) {
    passedTests++;
  } else {
    console.log(`  Expected: emptySlots=25, chestSlots=2, stackable[1]=32, stackable[2]=48`);
    console.log(`  Got: emptySlots=${result.emptySlots}, chestSlots=${result.chestSlots.length}, stackable[1]=${result.stackableSpace.get(1)}, stackable[2]=${result.stackableSpace.get(2)}`);
  }
}

// Test 3: analyzeChest - full stacks (no stackable space)
{
  totalTests++;
  const items = [
    createMockItem(1, 64, 'stone', 64),
    createMockItem(2, 64, 'dirt', 64)
  ];
  const chest = createMockChest(items);
  const result = analyzeChest(chest);

  const passed =
    result.emptySlots === 25 &&
    result.stackableSpace.size === 0;

  if (testResult('analyzeChest - full stacks', passed)) {
    passedTests++;
  } else {
    console.log(`  Expected: emptySlots=25, stackableSpace=0`);
    console.log(`  Got: emptySlots=${result.emptySlots}, stackableSpace=${result.stackableSpace.size}`);
  }
}

// Test 4: getExcludedSlots - with held item
{
  totalTests++;
  const slots = new Array(46).fill(null);
  slots[45] = { type: 1, count: 1 }; // offhand item

  const mockBot = {
    heldItem: { slot: 36 },
    inventory: { slots },
    getEquipmentDestSlot: () => null
  };

  const result = getExcludedSlots(mockBot);

  const passed =
    result.has(36) &&
    result.has(45) &&
    result.size === 2; // held item + offhand

  if (testResult('getExcludedSlots - with held item', passed)) {
    passedTests++;
  } else {
    console.log(`  Expected: Set with slot 36 and 45 (offhand)`);
    console.log(`  Got: Set(${Array.from(result).join(', ')})`);
  }
}

// Test 5: getExcludedSlots - with equipment
{
  totalTests++;
  const mockBot = {
    heldItem: null,
    inventory: {
      slots: (() => {
        const slots = new Array(46).fill(null);
        slots[45] = { type: 1, count: 1 }; // offhand
        return slots;
      })()
    },
    getEquipmentDestSlot: (slot) => {
      const map = { head: 5, torso: 6, legs: 7, feet: 8 };
      return map[slot] || null;
    }
  };

  const result = getExcludedSlots(mockBot);

  const passed =
    result.has(5) && result.has(6) && result.has(7) && result.has(8) && result.has(45) &&
    result.size === 5;

  if (testResult('getExcludedSlots - with equipment', passed)) {
    passedTests++;
  } else {
    console.log(`  Expected: Set with slots 5,6,7,8,45`);
    console.log(`  Got: Set(${Array.from(result).join(', ')})`);
  }
}

// Test 6: sortItemsByPriority - prioritizes stackable items
{
  totalTests++;
  const items = [
    { type: 1, count: 10, name: 'stone' },
    { type: 2, count: 5, name: 'dirt' },
    { type: 3, count: 20, name: 'wood' }
  ];

  const stackableSpace = new Map([
    [1, 0],   // stone - no stackable space
    [2, 32],  // dirt - 32 stackable space
    [3, 10]   // wood - 10 stackable space
  ]);

  const result = sortItemsByPriority([...items], stackableSpace);

  // Should be sorted: dirt (32), wood (10), stone (0)
  const passed =
    result[0].type === 2 &&
    result[1].type === 3 &&
    result[2].type === 1;

  if (testResult('sortItemsByPriority - prioritizes stackable', passed)) {
    passedTests++;
  } else {
    console.log(`  Expected order: dirt(2), wood(3), stone(1)`);
    console.log(`  Got order: ${result.map(i => `${i.name}(${i.type})`).join(', ')}`);
  }
}

// Test 7: depositItem - returns result object
{
  totalTests++;

  const mockBot = {
    inventory: {
      slots: (() => {
        const slots = new Array(46).fill(null);
        slots[10] = { type: 1, count: 32, name: 'stone' };
        return slots;
      })(),
      items: function() {
        return this.slots.filter(Boolean).map((item, idx) => ({ ...item, slot: idx }));
      }
    },
    clickWindow: async (slot, mouseButton, mode) => {
      // Simulate successful click
    },
    currentWindow: null
  };

  const mockChest = {
    window: {
      inventoryStart: 27,
      inventoryEnd: 54,
      slots: new Array(63).fill(null)
    }
  };

  const item = { type: 1, count: 32, slot: 10, name: 'stone' };

  // Run async test and wait for it
  (async () => {
    try {
      const result = await depositItem({ bot: mockBot, chest: mockChest, item, log: () => {} });

      // Note: This is a simplified test - actual behavior depends on bot state changes
      const passed = result.success !== undefined && result.moved !== undefined;

      if (testResult('depositItem - returns result object', passed)) {
        passedTests++;
      } else {
        console.log(`  Expected: { success, moved, ... }`);
        console.log(`  Got: ${JSON.stringify(result)}`);
      }
    } catch (err) {
      console.log(`✗ depositItem - returns result object`);
      console.log(`  Error: ${err.message}`);
    }

    // Test 8: depositItem - should validate chest.window BEFORE attempting deposit (BUG!)
    totalTests++;
    try {
      const mockBotNoWindow = {
        inventory: {
          slots: (() => {
            const slots = new Array(46).fill(null);
            slots[10] = { type: 1, count: 32, name: 'stone' };
            return slots;
          })(),
          items: function() {
            return this.slots.filter(Boolean).map((item, idx) => ({ ...item, slot: idx }));
          }
        }
      };

      // chest.window が undefined のケース（実際のバグ状況）
      const mockChestNoWindow = {
        window: undefined  // ← バグ再現
      };

      const itemNoWindow = { type: 1, count: 32, slot: 10, name: 'stone' };
      const result = await depositItem({
        bot: mockBotNoWindow,
        chest: mockChestNoWindow,
        item: itemNoWindow,
        log: (msg) => console.log(`  [LOG] ${msg}`)
      });

      // 期待: chest.windowが無効な場合、適切なエラーメッセージを返すべき
      // 現状: try-catchで一般的なエラーをキャッチしているが、それでは不十分
      // 正しくは: chest.windowをチェックしてから処理すべき
      const hasProperValidation =
        result.success === false &&
        result.error !== undefined &&
        !result.error.includes('Cannot read properties of undefined') && // ← ランタイムエラーではなく
        (result.error.includes('No window open') || result.error.includes('chest is closed') || result.error.includes('invalid chest')); // ← 適切なメッセージ

      if (testResult('depositItem - validates chest.window properly', hasProperValidation)) {
        passedTests++;
      } else {
        console.log(`  Expected: Proper validation with message like "chest is closed" or "invalid chest"`);
        console.log(`  Got: ${JSON.stringify(result)}`);
        console.log(`  ⚠️  Current implementation catches runtime error instead of validating upfront`);
      }
    } catch (err) {
      // エラーがキャッチされずに投げられた場合は失敗
      console.log(`✗ depositItem - validates chest.window properly`);
      console.log(`  Uncaught Error: ${err.message}`);
      console.log(`  This indicates the function doesn't handle the error properly`);
    }

    // Print summary after async tests complete
    console.log(`\n=== Test Summary ===`);
    console.log(`Total: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${totalTests - passedTests}`);
    console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);

    if (totalTests !== passedTests) {
      console.log('⚠️  FAILED TESTS DETECTED - This is expected (RED state)');
      console.log('The test reveals a bug in the implementation:');
      console.log('- chest.window can be undefined');
      console.log('- The code needs to check chest.window existence before accessing it\n');
    }

    process.exit(totalTests === passedTests ? 0 : 1);
  })();
}
