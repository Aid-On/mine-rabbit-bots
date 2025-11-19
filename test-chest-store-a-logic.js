
import { strict as assert } from 'assert';

// Mock bot and chest
const mockItems = [
    { type: 1, count: 64, metadata: 0, name: 'stone' },
    { type: 1, count: 32, metadata: 0, name: 'stone' }, // Duplicate type
    { type: 2, count: 16, metadata: 0, name: 'dirt' }
];

const bot = {
    inventory: {
        items: () => mockItems
    }
};

const chest = {
    deposit: async (type, metadata, count) => {
        console.log(`Deposited: type=${type}, count=${count}`);
        depositedItems.push({ type, count });
    },
    close: () => console.log('Chest closed')
};

const depositedItems = [];
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Logic from the modified chest.js
async function runStoreA() {
    console.log('Running store -a logic...');

    const items = bot.inventory.items();
    const itemIds = [...new Set(items.map(i => i.type))];
    let totalMoved = 0;

    console.log('Unique Item IDs:', itemIds);

    for (const id of itemIds) {
        const itemsOfType = items.filter(i => i.type === id);
        for (const item of itemsOfType) {
            try {
                await chest.deposit(item.type, item.metadata, item.count);
                totalMoved += item.count;
                await sleep(10); // Reduced sleep for test
            } catch (e) {
                console.error(e);
            }
        }
    }

    console.log(`Total moved: ${totalMoved}`);
    return totalMoved;
}

// Run test
(async () => {
    try {
        await runStoreA();

        // Verify results
        assert.equal(depositedItems.length, 3, 'Should deposit 3 times');
        assert.equal(depositedItems[0].type, 1, 'First deposit should be type 1');
        assert.equal(depositedItems[0].count, 64, 'First deposit should be 64');
        assert.equal(depositedItems[1].type, 1, 'Second deposit should be type 1');
        assert.equal(depositedItems[1].count, 32, 'Second deposit should be 32');
        assert.equal(depositedItems[2].type, 2, 'Third deposit should be type 2');
        assert.equal(depositedItems[2].count, 16, 'Third deposit should be 16');

        console.log('Test Passed!');
    } catch (err) {
        console.error('Test Failed:', err);
        process.exit(1);
    }
})();
