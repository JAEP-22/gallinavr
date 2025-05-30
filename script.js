import * as THREE from "https://esm.sh/three";
import { VRButton } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/webxr/VRButton.js';

const minTileIndex = -8;
const maxTileIndex = 8;
const tilesPerRow = maxTileIndex - minTileIndex + 1;
const tileSize = 42;

// Global variables for 3D UI elements
let score3D;
let gameOver3D;
let finalScore3D;
let retryButton3D;

/**
 * Creates a canvas with text rendered on it, suitable for use as a Three.js texture.
 * @param {string} text - The text to render.
 * @param {number} fontSize - The font size in pixels.
 * @param {string} color - The text color (e.g., '#FFFFFF').
 * @param {string} backgroundColor - The background color (e.g., 'rgba(0, 0, 0, 0.5)').
 * @returns {HTMLCanvasElement} The created canvas element.
 */
function createTextCanvas(text, fontSize = 48, color = '#FFFFFF', backgroundColor = 'rgba(0, 0, 0, 0.5)') {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `${fontSize}px Inter, sans-serif`;
    const metrics = context.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;

    canvas.width = textWidth + 20; // Add padding
    canvas.height = textHeight + 20; // Add padding

    context.font = `${fontSize}px Inter, sans-serif`;
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    context.fillText(text, 10, fontSize + 5); // Position text with padding

    return canvas;
}

/**
 * Creates a 3D text mesh using a CanvasTexture.
 * @param {string} text - The text content.
 * @param {THREE.Vector3} position - The position of the mesh.
 * @param {THREE.Vector3} scale - The scale of the mesh.
 * @param {string} color - The text color.
 * @param {string} backgroundColor - The background color of the text plane.
 * @returns {THREE.Mesh} The 3D text mesh.
 */
function create3DText(text, position, scale, color, backgroundColor) {
    const canvas = createTextCanvas(text, 48, color, backgroundColor);
    const texture = new THREE.CanvasTexture(canvas);
    // Use MeshBasicMaterial for UI elements that don't need lighting
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    // Adjust geometry size based on canvas dimensions for consistent scaling
    const geometry = new THREE.PlaneGeometry(canvas.width / 10, canvas.height / 10);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);
    mesh.scale.set(scale.x, scale.y, scale.z);
    return mesh;
}

/**
 * Creates a 3D button mesh using a CanvasTexture.
 * @param {string} text - The button text.
 * @param {THREE.Vector3} position - The position of the button.
 * @param {THREE.Vector3} scale - The scale of the button.
 * @param {Function} onClick - The function to call when the button is "clicked".
 * @returns {THREE.Mesh} The 3D button mesh.
 */
function create3DButton(text, position, scale, onClick) {
    const canvas = createTextCanvas(text, 48, '#FFFFFF', '#10b981'); // Emerald 500
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    const geometry = new THREE.PlaneGeometry(canvas.width / 10, canvas.height / 10);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position.x, position.y, position.z);
    mesh.scale.set(scale.x, scale.y, scale.z);

    // Store the click handler in userData for potential raycasting interaction
    mesh.userData.onClick = onClick;

    return mesh;
}

/**
 * Initializes and returns a PerspectiveCamera suitable for VR.
 * @returns {THREE.PerspectiveCamera} The camera object.
 */
function Camera() {
    // For VR, we use a PerspectiveCamera
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 0); // Camera will be at the player's logical position in the scene
    return camera;
}

/**
 * Creates a CanvasTexture from a given width, height, and array of rectangles.
 * Used for car and truck textures.
 * @param {number} width - The width of the canvas.
 * @param {number} height - The height of the canvas.
 * @param {Array<Object>} rects - An array of rectangle objects {x, y, w, h}.
 * @returns {THREE.CanvasTexture} The created CanvasTexture.
 */
function Texture(width, height, rects) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "rgba(0,0,0,0.6)";
    rects.forEach((rect) => {
        context.fillRect(rect.x, rect.y, rect.w, rect.h);
    });
    return new THREE.CanvasTexture(canvas);
}

// Pre-generate textures for cars and trucks
const carFrontTexture = new Texture(40, 80, [{ x: 0, y: 10, w: 30, h: 60 }]);
const carBackTexture = new Texture(40, 80, [{ x: 10, y: 10, w: 30, h: 60 }]);
const carRightSideTexture = new Texture(110, 40, [
    { x: 10, y: 0, w: 50, h: 30 },
    { x: 70, y: 0, w: 30, h: 30 },
]);
const carLeftSideTexture = new Texture(110, 40, [
    { x: 10, y: 10, w: 50, h: 30 },
    { x: 70, y: 10, w: 30, h: 30 },
]);

const truckFrontTexture = Texture(30, 30, [
    { x: 5, y: 0, w: 10, h: 30 },
]);
const truckRightSideTexture = Texture(25, 30, [
    { x: 15, y: 5, w: 10, h: 10 },
]);
const truckLeftSideTexture = Texture(25, 30, [
    { x: 15, y: 15, w: 10, h: 10 },
]);

/**
 * Creates a 3D car model.
 * @param {number} initialTileIndex - The starting tile index for the car.
 * @param {boolean} direction - True for positive X direction, false for negative.
 * @param {number} color - The color of the car.
 * @returns {THREE.Group} The car group.
 */
function Car(initialTileIndex, direction, color) {
    const car = new THREE.Group();
    car.position.x = initialTileIndex * tileSize;
    if (!direction) car.rotation.z = Math.PI; // Rotate 180 degrees if moving left

    const main = new THREE.Mesh(
        new THREE.BoxGeometry(60, 30, 15),
        new THREE.MeshLambertMaterial({ color, flatShading: true })
    );
    main.position.z = 12;
    main.castShadow = true;
    main.receiveShadow = true;
    car.add(main);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(33, 24, 12), [
        new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            flatShading: true,
            map: carBackTexture,
        }),
        new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            flatShading: true,
            map: carFrontTexture,
        }),
        new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            flatShading: true,
            map: carRightSideTexture,
        }),
        new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            flatShading: true,
            map: carLeftSideTexture,
        }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }), // top
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }), // bottom
    ]);
    cabin.position.x = -6;
    cabin.position.z = 25.5;
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    car.add(cabin);

    const frontWheel = Wheel(18);
    car.add(frontWheel);

    const backWheel = Wheel(-18);
    car.add(backWheel);

    return car;
}

/**
 * Creates a directional light for the scene.
 * @returns {THREE.DirectionalLight} The directional light.
 */
function DirectionalLight() {
    const dirLight = new THREE.DirectionalLight();
    dirLight.position.set(-100, -100, 200);
    dirLight.up.set(0, 0, 1);
    dirLight.castShadow = true;

    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;

    dirLight.shadow.camera.up.set(0, 0, 1);
    dirLight.shadow.camera.left = -400;
    dirLight.shadow.camera.right = 400;
    dirLight.shadow.camera.top = 400;
    dirLight.shadow.camera.bottom = -400;
    dirLight.shadow.camera.near = 50;
    dirLight.shadow.camera.far = 400;

    return dirLight;
}

/**
 * Creates a grass row for the game map.
 * @param {number} rowIndex - The row index for positioning.
 * @returns {THREE.Group} The grass group.
 */
function Grass(rowIndex) {
    const grass = new THREE.Group();
    grass.position.y = rowIndex * tileSize;

    const createSection = (color) =>
        new THREE.Mesh(
            new THREE.BoxGeometry(tilesPerRow * tileSize, tileSize, 3),
            new THREE.MeshLambertMaterial({ color })
        );

    const middle = createSection(0xbaf455);
    middle.receiveShadow = true;
    grass.add(middle);

    const left = createSection(0x99c846);
    left.position.x = -tilesPerRow * tileSize;
    grass.add(left);

    const right = createSection(0x99c846);
    right.position.x = tilesPerRow * tileSize;
    grass.add(right);

    return grass;
}

const metadata = []; // Stores data about each row (e.g., type, vehicles, trees)
const map = new THREE.Group(); // The main group holding all map elements

/**
 * Initializes the game map, clearing existing rows and adding initial ones.
 */
function initializeMap() {
    // Remove all rows
    metadata.length = 0;
    map.remove(...map.children);

    // Add initial grass rows (negative indices to start behind player)
    for (let rowIndex = 0; rowIndex > -10; rowIndex--) {
        const grass = Grass(rowIndex);
        map.add(grass);
    }
    addRows(); // Add more dynamic rows
}

/**
 * Generates and adds new rows to the map based on metadata.
 */
function addRows() {
    const newMetadata = generateRows(20); // Generate 20 new rows

    const startIndex = metadata.length;
    metadata.push(...newMetadata); // Add new metadata to the global array

    newMetadata.forEach((rowData, index) => {
        const rowIndex = startIndex + index + 1; // Calculate global row index

        if (rowData.type === "forest") {
            const row = Grass(rowIndex); // Create a grass row
            rowData.trees.forEach(({ tileIndex, height }) => {
                const tree = Tree(tileIndex, height);
                row.add(tree); // Add trees to the forest row
            });
            map.add(row);
        }

        if (rowData.type === "car") {
            const row = Road(rowIndex); // Create a road row
            rowData.vehicles.forEach((vehicle) => {
                const car = Car(
                    vehicle.initialTileIndex,
                    rowData.direction,
                    vehicle.color
                );
                vehicle.ref = car; // Store reference to the 3D object in metadata
                row.add(car); // Add cars to the road row
            });
            map.add(row);
        }

        if (rowData.type === "truck") {
            const row = Road(rowIndex); // Create a road row
            rowData.vehicles.forEach((vehicle) => {
                const truck = Truck(
                    vehicle.initialTileIndex,
                    rowData.direction,
                    vehicle.color
                );
                vehicle.ref = truck; // Store reference to the 3D object in metadata
                row.add(truck); // Add trucks to the road row
            });
            map.add(row);
        }
    });
}

// The player group now represents the logical position of the player in the game world.
// The actual camera will follow this logical position.
const player = new THREE.Group();

const position = {
    currentRow: 0,
    currentTile: 0,
};

const movesQueue = []; // Stores pending player moves

/**
 * Initializes the player's logical position and clears any pending moves.
 */
function initializePlayer() {
    // Set the logical player position
    player.position.x = 0;
    player.position.y = 0;
    player.position.z = 0;

    // Initialize metadata
    position.currentRow = 0;
    position.currentTile = 0;

    // Clear the moves queue
    movesQueue.length = 0;
}

/**
 * Adds a move to the queue if it results in a valid position.
 * @param {string} direction - The direction of the move ("forward", "backward", "left", "right").
 */
function queueMove(direction) {
    const isValidMove = endsUpInValidPosition(
        {
            rowIndex: position.currentRow,
            tileIndex: position.currentTile,
        },
        [...movesQueue, direction] // Check with current pending moves
    );

    if (!isValidMove) return;

    movesQueue.push(direction);
}

/**
 * Completes the current step, updates player position, and score.
 */
function stepCompleted() {
    const direction = movesQueue.shift(); // Get the next move from the queue

    if (direction === "forward") position.currentRow += 1;
    if (direction === "backward") position.currentRow -= 1;
    if (direction === "left") position.currentTile -= 1;
    if (direction === "right") position.currentTile += 1;

    // Add new rows if the player is running out of them (approaching the end of the generated map)
    if (position.currentRow > metadata.length - 10) addRows();

    // Update 3D score display
    updateScore3D();
}

/**
 * Initializes and returns the WebGLRenderer.
 * @returns {THREE.WebGLRenderer} The renderer object.
 */
function Renderer() {
    const canvas = document.querySelector("canvas.game");
    if (!canvas) throw new Error("Canvas not found");

    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas: canvas,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.xr.enabled = true; // Enable WebXR for VR functionality

    return renderer;
}

/**
 * Creates a road row for the game map.
 * @param {number} rowIndex - The row index for positioning.
 * @returns {THREE.Group} The road group.
 */
function Road(rowIndex) {
    const road = new THREE.Group();
    road.position.y = rowIndex * tileSize;

    const createSection = (color) =>
        new THREE.Mesh(
            new THREE.PlaneGeometry(tilesPerRow * tileSize, tileSize),
            new THREE.MeshLambertMaterial({ color })
        );

    const middle = createSection(0x454a59);
    middle.receiveShadow = true;
    road.add(middle);

    const left = createSection(0x393d49);
    left.position.x = -tilesPerRow * tileSize;
    road.add(left);

    const right = createSection(0x393d49);
    right.position.x = tilesPerRow * tileSize;
    road.add(right);

    return road;
}

/**
 * Creates a 3D tree model.
 * @param {number} tileIndex - The tile index for positioning.
 * @param {number} height - The height of the tree crown.
 * @returns {THREE.Group} The tree group.
 */
function Tree(tileIndex, height) {
    const tree = new THREE.Group();
    tree.position.x = tileIndex * tileSize;

    const trunk = new THREE.Mesh(
        new THREE.BoxGeometry(15, 15, 20),
        new THREE.MeshLambertMaterial({
            color: 0x4d2926,
            flatShading: true,
        })
    );
    trunk.position.z = 10;
    tree.add(trunk);

    const crown = new THREE.Mesh(
        new THREE.BoxGeometry(30, 30, height),
        new THREE.MeshLambertMaterial({
            color: 0x7aa21d,
            flatShading: true,
        })
    );
    crown.position.z = height / 2 + 20;
    crown.castShadow = true;
    crown.receiveShadow = true;
    tree.add(crown);

    return tree;
}

/**
 * Creates a 3D truck model.
 * @param {number} initialTileIndex - The starting tile index for the truck.
 * @param {boolean} direction - True for positive X direction, false for negative.
 * @param {number} color - The color of the truck.
 * @returns {THREE.Group} The truck group.
 */
function Truck(initialTileIndex, direction, color) {
    const truck = new THREE.Group();
    truck.position.x = initialTileIndex * tileSize;
    if (!direction) truck.rotation.z = Math.PI; // Rotate 180 degrees if moving left

    const cargo = new THREE.Mesh(
        new THREE.BoxGeometry(70, 35, 35),
        new THREE.MeshLambertMaterial({
            color: 0xb4c6fc,
            flatShading: true,
        })
    );
    cargo.position.x = -15;
    cargo.position.z = 25;
    cargo.castShadow = true;
    cargo.receiveShadow = true;
    truck.add(cargo);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), [
        new THREE.MeshLambertMaterial({
            color,
            flatShading: true,
            map: truckFrontTexture,
        }), // front
        new THREE.MeshLambertMaterial({
            color,
            flatShading: true,
        }), // back
        new THREE.MeshLambertMaterial({
            color,
            flatShading: true,
            map: truckLeftSideTexture,
        }),
        new THREE.MeshLambertMaterial({
            color,
            flatShading: true,
            map: truckRightSideTexture,
        }),
        new THREE.MeshPhongMaterial({ color, flatShading: true }), // top
        new THREE.MeshPhongMaterial({ color, flatShading: true }), // bottom
    ]);
    cabin.position.x = 35;
    cabin.position.z = 20;
    cabin.castShadow = true;
    cabin.receiveShadow = true;

    truck.add(cabin);

    const frontWheel = Wheel(37);
    truck.add(frontWheel);

    const middleWheel = Wheel(5);
    truck.add(middleWheel);

    const backWheel = Wheel(-35);
    truck.add(backWheel);

    return truck;
}

/**
 * Creates a 3D wheel model.
 * @param {number} x - The x-position of the wheel relative to its parent.
 * @returns {THREE.Mesh} The wheel mesh.
 */
function Wheel(x) {
    const wheel = new THREE.Mesh(
        new THREE.BoxGeometry(12, 33, 12),
        new THREE.MeshLambertMaterial({
            color: 0x333333,
            flatShading: true,
        })
    );
    wheel.position.x = x;
    wheel.position.z = 6;
    return wheel;
}

/**
 * Calculates the final position of the player after a series of moves.
 * @param {Object} currentPosition - The starting position {rowIndex, tileIndex}.
 * @param {Array<string>} moves - An array of move directions.
 * @returns {Object} The final position {rowIndex, tileIndex}.
 */
function calculateFinalPosition(currentPosition, moves) {
    return moves.reduce((position, direction) => {
        if (direction === "forward")
            return {
                rowIndex: position.rowIndex + 1,
                tileIndex: position.tileIndex,
            };
        if (direction === "backward")
            return {
                rowIndex: position.rowIndex - 1,
                tileIndex: position.tileIndex,
            };
        if (direction === "left")
            return {
                rowIndex: position.rowIndex,
                tileIndex: position.tileIndex - 1,
            };
        if (direction === "right")
            return {
                rowIndex: position.rowIndex,
                tileIndex: position.tileIndex + 1,
            };
        return position;
    }, currentPosition);
}

/**
 * Checks if a series of moves results in a valid position (not hitting obstacles or boundaries).
 * @param {Object} currentPosition - The starting position {rowIndex, tileIndex}.
 * @param {Array<string>} moves - An array of move directions.
 * @returns {boolean} True if the final position is valid, false otherwise.
 */
function endsUpInValidPosition(currentPosition, moves) {
    // Calculate where the player would end up after the move
    const finalPosition = calculateFinalPosition(currentPosition, moves);

    // Detect if we hit the edge of the board
    if (
        finalPosition.rowIndex === -1 ||
        finalPosition.tileIndex === minTileIndex - 1 ||
        finalPosition.tileIndex === maxTileIndex + 1
    ) {
        // Invalid move, ignore move command
        return false;
    }

    // Detect if we hit a tree
    const finalRow = metadata[finalPosition.rowIndex - 1];
    if (
        finalRow &&
        finalRow.type === "forest" &&
        finalRow.trees.some((tree) => tree.tileIndex === finalPosition.tileIndex)
    ) {
        // Invalid move, ignore move command
        return false;
    }

    return true;
}

/**
 * Generates an array of row metadata.
 * @param {number} amount - The number of rows to generate.
 * @returns {Array<Object>} An array of row metadata objects.
 */
function generateRows(amount) {
    const rows = [];
    for (let i = 0; i < amount; i++) {
        const rowData = generateRow();
        rows.push(rowData);
    }
    return rows;
}

/**
 * Generates metadata for a single random row (car, truck, or forest).
 * @returns {Object} The row metadata.
 */
function generateRow() {
    const type = randomElement(["car", "truck", "forest"]);
    if (type === "car") return generateCarLaneMetadata();
    if (type === "truck") return generateTruckLaneMetadata();
    return generateForesMetadata();
}

/**
 * Returns a random element from an array.
 * @param {Array} array - The array to pick from.
 * @returns {*} A random element from the array.
 */
function randomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generates metadata for a forest row, including random tree positions and heights.
 * @returns {Object} Forest row metadata.
 */
function generateForesMetadata() {
    const occupiedTiles = new Set();
    const trees = Array.from({ length: 4 }, () => {
        let tileIndex;
        do {
            tileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex);
        } while (occupiedTiles.has(tileIndex));
        occupiedTiles.add(tileIndex);

        const height = randomElement([20, 45, 60]);

        return { tileIndex, height };
    });

    return { type: "forest", trees };
}

/**
 * Generates metadata for a car lane, including car positions, direction, and speed.
 * @returns {Object} Car lane metadata.
 */
function generateCarLaneMetadata() {
    const direction = randomElement([true, false]); // true for right, false for left
    const speed = randomElement([100, 125, 150]);

    const occupiedTiles = new Set();

    const vehicles = Array.from({ length: 3 }, () => {
        let initialTileIndex;
        do {
            initialTileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex);
        } while (occupiedTiles.has(initialTileIndex));
        // Mark adjacent tiles as occupied to prevent vehicles from spawning too close
        occupiedTiles.add(initialTileIndex - 1);
        occupiedTiles.add(initialTileIndex);
        occupiedTiles.add(initialTileIndex + 1);

        const color = randomElement([0xa52523, 0xbdb638, 0x78b14b]);

        return { initialTileIndex, color };
    });

    return { type: "car", direction, speed, vehicles };
}

/**
 * Generates metadata for a truck lane, including truck positions, direction, and speed.
 * @returns {Object} Truck lane metadata.
 */
function generateTruckLaneMetadata() {
    const direction = randomElement([true, false]);
    const speed = randomElement([100, 125, 150]);

    const occupiedTiles = new Set();

    const vehicles = Array.from({ length: 2 }, () => {
        let initialTileIndex;
        do {
            initialTileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex);
        } while (occupiedTiles.has(initialTileIndex));
        // Mark more adjacent tiles as occupied for trucks
        occupiedTiles.add(initialTileIndex - 2);
        occupiedTiles.add(initialTileIndex - 1);
        occupiedTiles.add(initialTileIndex);
        occupiedTiles.add(initialTileIndex + 1);
        occupiedTiles.add(initialTileIndex + 2);

        const color = randomElement([0xa52523, 0xbdb638, 0x78b14b]);

        return { initialTileIndex, color };
    });

    return { type: "truck", direction, speed, vehicles };
}

const moveClock = new THREE.Clock(false); // Clock to track player movement animation

/**
 * Animates the player's movement based on the moves queue.
 */
function animatePlayer() {
    if (!movesQueue.length) return; // No moves pending

    if (!moveClock.running) moveClock.start(); // Start clock if not running

    const stepTime = 0.2; // Seconds it takes to take a step
    const progress = Math.min(1, moveClock.getElapsedTime() / stepTime);

    setPosition(progress);
    // setRotation(progress); // Rotation is handled by VR headset in VR, so this is removed

    // Once a step has ended
    if (progress >= 1) {
        stepCompleted(); // Process the completed step
        moveClock.stop(); // Stop the clock
    }
}

/**
 * Sets the player's (and camera's) position during a movement animation.
 * @param {number} progress - The animation progress (0 to 1).
 */
function setPosition(progress) {
    const startX = position.currentTile * tileSize;
    const startY = position.currentRow * tileSize;
    let endX = startX;
    let endY = startY;

    // Calculate target position based on the next move in the queue
    if (movesQueue[0] === "left") endX -= tileSize;
    if (movesQueue[0] === "right") endX += tileSize;
    if (movesQueue[0] === "forward") endY += tileSize;
    if (movesQueue[0] === "backward") endY -= tileSize;

    // Linearly interpolate player's logical position
    player.position.x = THREE.MathUtils.lerp(startX, endX, progress);
    player.position.y = THREE.MathUtils.lerp(startY, endY, progress);
    // player.children[0].position.z = Math.sin(progress * Math.PI) * 8; // Removed player hop for VR, as it can be jarring
}

// `setRotation` function is removed as player rotation in VR is typically handled by the headset's orientation.

const clock = new THREE.Clock(); // Clock for general animation timing

/**
 * Animates the movement of vehicles on the map.
 */
function animateVehicles() {
    const delta = clock.getDelta(); // Time elapsed since last frame

    // Animate cars and trucks
    metadata.forEach((rowData) => {
        if (rowData.type === "car" || rowData.type === "truck") {
            // Define boundaries for vehicle movement
            const beginningOfRow = (minTileIndex - 2) * tileSize;
            const endOfRow = (maxTileIndex + 2) * tileSize;

            rowData.vehicles.forEach(({ ref }) => {
                if (!ref) throw Error("Vehicle reference is missing");

                // Move vehicle based on its direction and speed
                if (rowData.direction) { // Moving right
                    ref.position.x =
                        ref.position.x > endOfRow
                            ? beginningOfRow // Wrap around if it goes off screen
                            : ref.position.x + rowData.speed * delta;
                } else { // Moving left
                    ref.position.x =
                        ref.position.x < beginningOfRow
                            ? endOfRow // Wrap around if it goes off screen
                            : ref.position.x - rowData.speed * delta;
                }
            });
        }
    });
}

/**
 * Performs collision detection between the player and vehicles.
 */
function hitTest() {
    const row = metadata[position.currentRow - 1]; // Get metadata for the current row
    if (!row) return;

    if (row.type === "car" || row.type === "truck") {
        // Create a bounding box for the player's current logical position.
        // In VR, the camera is the player, so its position is player.position.
        // We add a small offset for height and size for the collision detection.
        const playerBoundingBox = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(player.position.x, player.position.y, player.position.z + 10), // Approximate player height
            new THREE.Vector3(tileSize * 0.5, tileSize * 0.5, 20) // Approximate player size
        );

        row.vehicles.forEach(({ ref }) => {
            if (!ref) throw Error("Vehicle reference is missing");

            const vehicleBoundingBox = new THREE.Box3();
            vehicleBoundingBox.setFromObject(ref); // Get bounding box of the vehicle

            if (playerBoundingBox.intersectsBox(vehicleBoundingBox)) {
                showGameOver(); // If collision, show game over
            }
        });
    }
}

// Scene setup
const scene = new THREE.Scene();
// The camera is now added directly to the scene, and its position will be updated by the player group's position
const camera = Camera();
scene.add(camera);
scene.add(map); // Add the game map to the scene

const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
scene.add(ambientLight);

const dirLight = DirectionalLight();
// Create a dummy target for the directional light to follow the player's logical position
dirLight.target = new THREE.Object3D();
dirLight.target.position.set(0, 0, 0); // Initial target position
scene.add(dirLight.target);
scene.add(dirLight);

const renderer = Renderer();
// Add the VR button to the HTML document
document.getElementById('vr-button-container').appendChild(VRButton.createButton(renderer));


/**
 * Sets up the 3D UI elements for score, game over, and retry.
 */
function setup3DUI() {
    // Score display
    score3D = create3DText(
        `Score: ${position.currentRow}`,
        new THREE.Vector3(0, -tileSize * 5, -100), // Position relative to camera (in front, slightly down)
        new THREE.Vector3(1, 1, 1),
        '#fca311', // Amber color for score
        'rgba(0, 0, 0, 0.5)'
    );
    camera.add(score3D); // Add score to camera so it moves with the player's view
    score3D.visible = false; // Initially hidden, only shown in VR

    // Game Over screen (initially hidden)
    gameOver3D = new THREE.Group();
    gameOver3D.visible = false;
    camera.add(gameOver3D); // Add game over group to camera

    const gameOverText = create3DText(
        'Game Over',
        new THREE.Vector3(0, -20, -100), // Position in front of camera
        new THREE.Vector3(1.5, 1.5, 1.5),
        '#fca311', // Amber color
        'rgba(0, 0, 0, 0.7)'
    );
    gameOver3D.add(gameOverText);

    finalScore3D = create3DText(
        `Your score: ${position.currentRow}`,
        new THREE.Vector3(0, -40, -100), // Below game over text
        new THREE.Vector3(1, 1, 1),
        '#FFFFFF',
        'rgba(0, 0, 0, 0.7)'
    );
    gameOver3D.add(finalScore3D);

    retryButton3D = create3DButton(
        'Retry',
        new THREE.Vector3(0, -60, -100), // Below final score
        new THREE.Vector3(1, 1, 1),
        initializeGame // Pass the function to be called on click
    );
    gameOver3D.add(retryButton3D);

    // Event listeners for VR session start/end
    renderer.xr.addEventListener('sessionstart', function () {
        // Hide HTML controls and result container when in VR
        document.getElementById('game-controls').style.display = 'none';
        document.getElementById('result-container').style.display = 'none';
        score3D.visible = true; // Show 3D score in VR
    });

    renderer.xr.addEventListener('sessionend', function () {
        // Show HTML controls when exiting VR
        document.getElementById('game-controls').style.display = 'flex';
        // HTML result container might be visible if game over happened in non-VR
        if (gameOver3D.visible) {
            document.getElementById('result-container').style.display = 'block';
        }
        score3D.visible = false; // Hide 3D score in non-VR
    });

    // Set up the main animation loop for the renderer
    renderer.setAnimationLoop(function () {
        // Update camera position to follow the logical player position
        camera.position.x = player.position.x;
        camera.position.y = player.position.y;
        camera.position.z = player.position.z + 50; // Offset camera slightly above the ground for a better view

        // Update light target to follow player
        dirLight.target.position.copy(player.position);
        dirLight.target.position.z += 50; // Keep target above player

        // Run game logic animations
        animateVehicles();
        animatePlayer();
        hitTest();

        renderer.render(scene, camera);
    });
}

/**
 * Updates the 3D score display.
 */
function updateScore3D() {
    if (score3D) {
        const canvas = createTextCanvas(`Score: ${position.currentRow}`, 48, '#fca311', 'rgba(0, 0, 0, 0.5)');
        score3D.material.map.dispose(); // Dispose old texture to prevent memory leaks
        score3D.material.map = new THREE.CanvasTexture(canvas);
        score3D.material.map.needsUpdate = true; // Mark texture for update
        score3D.geometry.dispose(); // Dispose old geometry
        score3D.geometry = new THREE.PlaneGeometry(canvas.width / 10, canvas.height / 10); // Update geometry size
    }
}

/**
 * Shows the game over screen (both HTML and 3D).
 */
function showGameOver() {
    // Hide HTML result container (it's primarily for non-VR)
    document.getElementById('result-container').style.visibility = 'visible';
    document.getElementById('final-score').innerText = position.currentRow.toString();


    // Update 3D game over text
    if (finalScore3D) {
        const canvas = createTextCanvas(`Your score: ${position.currentRow}`, 48, '#FFFFFF', 'rgba(0, 0, 0, 0.7)');
        finalScore3D.material.map.dispose();
        finalScore3D.material.map = new THREE.CanvasTexture(canvas);
        finalScore3D.material.map.needsUpdate = true;
        finalScore3D.geometry.dispose();
        finalScore3D.geometry = new THREE.PlaneGeometry(canvas.width / 10, canvas.height / 10);
    }

    if (gameOver3D) {
        gameOver3D.visible = true; // Show 3D game over group
    }
    renderer.setAnimationLoop(null); // Stop the game loop
}

/**
 * Hides the game over screen (both HTML and 3D) and restarts the game loop.
 */
function hideGameOver() {
    if (gameOver3D) {
        gameOver3D.visible = false; // Hide 3D game over group
    }
    document.getElementById('result-container').style.visibility = 'hidden'; // Ensure HTML is hidden too
    renderer.setAnimationLoop(animate); // Restart the game loop
}


// Event Listeners for HTML buttons (still useful outside VR)
document.getElementById("forward")?.addEventListener("click", () => queueMove("forward"));
document.getElementById("backward")?.addEventListener("click", () => queueMove("backward"));
document.getElementById("left")?.addEventListener("click", () => queueMove("left"));
document.getElementById("right")?.addEventListener("click", () => queueMove("right"));

// Keyboard event listeners
window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
        event.preventDefault(); // Avoid scrolling the page
        queueMove("forward");
    } else if (event.key === "ArrowDown") {
        event.preventDefault(); // Avoid scrolling the page
        queueMove("backward");
    } else if (event.key === "ArrowLeft") {
        event.preventDefault(); // Avoid scrolling the page
        queueMove("left");
    } else if (event.key === "ArrowRight") {
        event.preventDefault(); // Avoid scrolling the page
        queueMove("right");
    }
});

// HTML retry button listener
document.querySelector("#retry")?.addEventListener("click", () => {
    hideGameOver(); // Hide HTML and 3D game over
    initializeGame(); // Restart game
});

// Initialize the game and 3D UI
initializeGame();
setup3DUI();

/**
 * Resets the game to its initial state.
 */
function initializeGame() {
    initializePlayer(); // Reset player position
    initializeMap(); // Regenerate map
    updateScore3D(); // Reset 3D score display
    hideGameOver(); // Ensure game over screen is hidden
}

// Initial render loop setup. This is overridden by renderer.setAnimationLoop in setup3DUI
// but kept here for clarity of the original structure.
// The actual animation loop is managed by `renderer.setAnimationLoop` in `setup3DUI`.
// renderer.setAnimationLoop(animate); // This line is effectively replaced by the one in setup3DUI

/**
 * The main animation loop function.
 * This function is called repeatedly by `renderer.setAnimationLoop`.
 */
function animate() {
    animateVehicles(); // Animate vehicles
    animatePlayer(); // Animate player movement
    hitTest(); // Check for collisions

    renderer.render(scene, camera); // Render the scene
}

// Handle window resize for non-VR mode
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});