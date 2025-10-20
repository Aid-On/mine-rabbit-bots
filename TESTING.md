# Testing Documentation

## Overview

This project now includes both unit tests and integration tests for the chest operations functionality.

## Architecture Changes

### Testable Code Structure

The chest operation logic has been refactored to separate business logic from I/O operations:

- **src/lib/chest-operations.js** - Pure business logic (testable without Minecraft server)
- **src/actions/chest.js** - Command handler that uses the business logic

This separation allows the core logic to be tested independently using mocks.

## Unit Tests

### Running Unit Tests

```bash
node test-chest-operations.test.js
```

Unit tests run **without** a Minecraft server and use mocked bot/chest objects.

### Test Coverage

The unit tests cover the following functions from `src/lib/chest-operations.js`:

1. **analyzeChest(chest)** - Analyzes chest state
   - ✓ Empty chest
   - ✓ Partially filled chest
   - ✓ Full stacks (no stackable space)

2. **getExcludedSlots(bot)** - Gets slots to exclude from deposits
   - ✓ With held item
   - ✓ With equipment

3. **sortItemsByPriority(items, stackableSpace)** - Prioritizes stackable items
   - ✓ Prioritizes items with existing stacks

4. **depositItem({ bot, chest, item, log })** - Deposits single item
   - ✓ Returns proper result object

### Current Test Results

```
=== Test Summary ===
Total: 7
Passed: 7
Failed: 0
Success Rate: 100.0%
```

## Integration Tests

Integration tests require a running Minecraft server and a bot connected to it.

### test-chest.js

Interactive test that requires user input in game.

```bash
node test-chest.js
```

1. Bot connects to server
2. Type "test" in Minecraft chat
3. Bot analyzes nearest chest and performs deposit test

### test-deposit-simple.js

Similar to test-chest.js but with simpler output.

```bash
node test-deposit-simple.js
```

1. Bot connects
2. Type "test" in chat
3. Bot tests deposit operation

### test-deposit-auto.js

Automatic test that runs 3 seconds after spawn (no chat command needed).

```bash
node test-deposit-auto.js
```

**Requirements for integration tests:**
- Minecraft server running on 127.0.0.1:25565
- Chest within 6 blocks of spawn point
- Bot has items in inventory to test with

## Key Implementation Details

### Slot Number Issue (Fixed)

The original implementation failed because:
- `bot.inventory.items()` returns inventory slot numbers (0-35)
- `chest.deposit()` expects window slot numbers (27-63)

**Solution:** Use `bot.clickWindow()` which accepts window slot numbers directly.

### Window Slot Layout

```
Slots 0-26:   Chest container
Slots 27-53:  Player inventory
Slots 54-62:  Hotbar
Slot 45:      Offhand
```

### Business Logic (chest-operations.js)

1. **analyzeChest()** - Determines empty slots and stackable space
2. **getExcludedSlots()** - Protects equipped items and held item
3. **sortItemsByPriority()** - Prioritizes items that can stack with existing chest items
4. **depositItem()** - Uses `bot.clickWindow()` to transfer items
5. **depositAllItems()** - Main loop that deposits all inventory items

### Deposit Algorithm

1. Analyze chest to find empty slots and stackable space
2. Get list of items from bot inventory (excluding equipment)
3. Sort items by priority (stackable items first)
4. For each item:
   - Check if space available (empty slot or stackable space)
   - Use bot.clickWindow() to pick up item from inventory
   - Find empty or stackable slot in chest
   - Click to place item
5. Repeat up to 5 rounds or until no more items can be deposited

## Syntax Verification

All JavaScript files have been verified for syntax errors:

```bash
# Check all action files
find src/actions -name "*.js" -exec node -c {} \;

# Check all library files
find src/lib -name "*.js" -exec node -c {} \;

# Check main bot file
node -c src/bot.js
```

All files pass syntax checks.

## Next Steps

To add more unit tests:

1. Create mock objects for bot and chest
2. Test expected behavior with various scenarios
3. Verify return values and state changes
4. Add tests to `test-chest-operations.test.js`

Example mock structure:

```javascript
const mockBot = {
  inventory: {
    slots: [/* array of items */],
    items: function() { /* return items with slot numbers */ }
  },
  clickWindow: async (slot, mouseButton, mode) => {
    // Simulate click behavior
  }
};

const mockChest = {
  window: {
    inventoryStart: 27,
    inventoryEnd: 54,
    slots: [/* array of 63 slots */]
  }
};
```
