

const schematic = {
    name: "Brick House 9x7",
    size: { x: 9, y: 10, z: 7 },
    blocks: []
};

const addBlock = (x, y, z, name) => {
    schematic.blocks.push({ x, y, z, block: name });
};

// 1. Foundation (y=0) - Stone Bricks
for (let x = 0; x < 9; x++) {
    for (let z = 0; z < 7; z++) {
        addBlock(x, 0, z, "stone_bricks");
    }
}

// 2. Walls (y=1 to 4) - Bricks
// Front is z=0, Back is z=6
for (let y = 1; y <= 4; y++) {
    for (let x = 0; x < 9; x++) {
        for (let z = 0; z < 7; z++) {
            // Outer walls only
            if (x === 0 || x === 8 || z === 0 || z === 6) {
                // Door gap
                if (z === 0 && x === 4 && (y === 1 || y === 2)) {
                    if (y === 1) addBlock(x, y, z, "spruce_door");
                    if (y === 2) addBlock(x, y, z, "spruce_door"); // Top half implied or placed
                    continue;
                }

                // Windows (Glass Pane) - Front
                if (z === 0 && y === 2 && (x === 1 || x === 2 || x === 6 || x === 7)) {
                    addBlock(x, y, z, "glass_pane");
                    continue;
                }

                // Windows - Sides
                if ((x === 0 || x === 8) && y === 2 && (z === 2 || z === 3 || z === 4)) {
                    addBlock(x, y, z, "glass_pane");
                    continue;
                }

                // Windows - Back
                if (z === 6 && y === 2 && (x === 2 || x === 6)) {
                    addBlock(x, y, z, "glass_pane");
                    continue;
                }

                addBlock(x, y, z, "bricks");
            }
        }
    }
}

// 3. Roof (Gable style) - Spruce Planks
// Slopes up along X axis
const roofHeight = [4, 5, 6, 7, 8, 7, 6, 5, 4]; // Height for each x
for (let x = 0; x < 9; x++) {
    const h = roofHeight[x];
    for (let y = 4; y <= h; y++) {
        for (let z = 0; z < 7; z++) {
            // Fill the gable triangle walls at front and back
            if (z === 0 || z === 6) {
                // If it's the top layer for this x, it's roof material
                if (y === h) {
                    addBlock(x, y, z, "spruce_planks");
                } else {
                    // Below roof, it's wall (bricks)
                    // But only if it's above the main wall height (4)
                    if (y > 4) addBlock(x, y, z, "bricks");
                }
            } else {
                // Inside, just the roof surface
                if (y === h) {
                    addBlock(x, y, z, "spruce_planks");
                }
            }
        }
    }
}

// 4. Chimney - Bricks
// Right side (x=7), somewhat back (z=4)
for (let y = 1; y < 10; y++) {
    // Override existing blocks
    // Remove existing block at this pos first (simple overwrite in list works if builder handles it, 
    // but cleaner to not add duplicates. Our builder iterates list, so duplicates might be bad.
    // However, this script just pushes. Let's just push, builder usually takes last or we rely on placement order.
    // Actually, let's just add it.
    addBlock(7, y, 4, "bricks");
}

// 5. Dormer (Small roof window) - Front (z=0..2) Center (x=4)
// Roof at x=4 is y=8. Dormer should stick out at y=6 or 7.
// Let's put a window at x=4, y=6, z=0 (sticking out from the slope?)
// The slope at x=4 is y=8. x=3 is y=7. x=2 is y=6.
// So at z=0, x=4 is high up.
// A dormer usually breaks the slope.
// Let's add a small extension at x=4.
addBlock(4, 6, 0, "glass_pane"); // Window
addBlock(4, 7, 0, "spruce_planks"); // Roof over window
addBlock(3, 6, 0, "spruce_planks"); // Side
addBlock(5, 6, 0, "spruce_planks"); // Side


// 6. Front Decor (Leaves/Flower pots)
// Ground level y=1 (on top of foundation extension?)
// Let's add some leaves at the corners
addBlock(0, 1, 1, "oak_leaves");
addBlock(8, 1, 1, "oak_leaves");


// Output
console.log(JSON.stringify(schematic, null, 2));
