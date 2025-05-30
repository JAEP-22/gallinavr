import * as THREE from "https://esm.sh/three";
import { VRButton } from 'https://esm.sh/three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'https://esm.sh/three/examples/jsm/webxr/XRControllerModelFactory.js';

// Constants for game world dimensions and tile properties
const minTileIndex = -8;
const maxTileIndex = 8;
const tilesPerRow = maxTileIndex - minTileIndex + 1;
const tileSize = 42; // Size of each tile in Three.js units

// Global Scene Elements
let scene, camera, renderer;
let player, map; // Three.js objects for the player and the game map
let scoreMesh, gameOverMesh, finalScoreMesh, retryButtonMesh; // 3D UI elements
let controller1, controllerGrip1, controller2, controllerGrip2; // VR controllers

// Game State Variables
const metadata = []; // Stores information about each generated row (forest, car lane, truck lane)
const position = {
    currentRow: 0, // Player's current row index
    currentTile: 0, // Player's current tile index within the row
};
const movesQueue = []; // Queue of player moves (e.g., 'forward', 'left')
const moveClock = new THREE.Clock(false); // Clock to animate player movement smoothly
const gameClock = new THREE.Clock(); // Clock to animate vehicles and overall game time

// --- Helper Functions ---

/**
 * Creates a Three.js PlaneGeometry with text rendered onto a CanvasTexture.
 * This is used for 3D UI elements like score and game over messages.
 * @param {string} text - The text string to display.
 * @param {string} color - The color of the text (e.g., 'white', 'red').
 * @param {number} fontSize - The font size in pixels for the canvas rendering.
 * @param {number} width - The width of the canvas used for the texture.
 * @param {number} height - The height of the canvas used for the texture.
 * @returns {THREE.Mesh} A Three.js Mesh representing the text plane.
 */
function createTextPlane(text, color = 'white', fontSize = 40, width = 300, height = 70) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgba(0,0,0,0.7)'; // Semi-transparent black background for readability
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = `${fontSize}px Inter, sans-serif`; // Use Inter font for consistency
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    // Use MeshBasicMaterial as UI elements don't need to react to scene lighting
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    // Scale down the plane geometry to fit well within the 3D world (e.g., 1 Three.js unit = 10 canvas pixels)
    const geometry = new THREE.PlaneGeometry(width / 10, height / 10);
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
}

/**
 * Configures and returns a Three.js PerspectiveCamera suitable for a VR experience.
 * The camera is positioned slightly behind and above the player for a third-person view.
 * @returns {THREE.PerspectiveCamera} The configured VR camera.
 */
function Camera() {
    // PerspectiveCamera is crucial for VR to provide a realistic sense of depth
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Position camera relative to the player for a third-person perspective.
    // These values can be tweaked for optimal VR comfort and visibility.
    camera.position.set(0, -50, 70);
    camera.lookAt(0, 0, 0); // Make the camera look at the player's origin
    return camera;
}

/**
 * Creates a CanvasTexture from a dynamically generated canvas, used for car/truck details.
 * @param {number} width - The width of the canvas.
 * @param {number} height - The height of the canvas.
 * @param {Array<Object>} rects - An array of objects defining rectangles to draw on the canvas.
 * @returns {THREE.CanvasTexture} The created Three.js CanvasTexture.
 */
function Texture(width, height, rects) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff"; // Base color for the texture
    context.fillRect(0, 0, width, height);
    context.fillStyle = "rgba(0,0,0,0.6)"; // Color for the "windows" or details
    rects.forEach((rect) => {
        context.fillRect(rect.x, rect.y, rect.w, rect.h);
    });
    return new THREE.CanvasTexture(canvas);
}

// Pre-generate textures for car and truck details
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
 * @param {number} initialTileIndex - The starting tile index for the car's position.
 * @param {boolean} direction - True for movement to the right, false for movement to the left.
 * @param {number} color - The hexadecimal color value for the car's body.
 * @returns {THREE.Group} A Three.js Group containing the car's meshes.
 */
function Car(initialTileIndex, direction, color) {
    const car = new THREE.Group();
    car.position.x = initialTileIndex * tileSize;
    if (!direction) car.rotation.z = Math.PI; // Rotate 180 degrees if moving left

    // Main body of the car
    const main = new THREE.Mesh(
        new THREE.BoxGeometry(60, 30, 15),
        new THREE.MeshLambertMaterial({ color, flatShading: true })
    );
    main.position.z = 12;
    main.castShadow = true; // Car casts shadow
    main.receiveShadow = true; // Car receives shadow
    car.add(main);

    // Cabin (passenger compartment) of the car
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(33, 24, 12), [
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carBackTexture }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carFrontTexture }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carRightSideTexture }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carLeftSideTexture }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }), // top
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }), // bottom
    ]);
    cabin.position.x = -6;
    cabin.position.z = 25.5;
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    car.add(cabin);

    // Add wheels to the car
    const frontWheel = Wheel(18);
    car.add(frontWheel);
    const backWheel = Wheel(-18);
    car.add(backWheel);

    return car;
}

/**
 * Creates a directional light source for the scene, mimicking sunlight.
 * It also configures shadow casting properties.
 * @returns {THREE.DirectionalLight} The configured directional light.
 */
function DirectionalLight() {
    const dirLight = new THREE.DirectionalLight(0xffffff, 1); // White light, full intensity
    dirLight.position.set(-100, -100, 200); // Position of the light source
    dirLight.up.set(0, 0, 1); // Light's "up" direction
    dirLight.castShadow = true; // Enable shadow casting for this light

    // Configure shadow map resolution for better quality shadows
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;

    // Configure the camera used for rendering shadows (orthographic for uniform shadows)
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
 * Creates a grass section for the game map.
 * @param {number} rowIndex - The row index where this grass section will be placed.
 * @returns {THREE.Group} A Three.js Group representing the grass section.
 */
function Grass(rowIndex) {
    const grass = new THREE.Group();
    grass.position.y = rowIndex * tileSize; // Position grass along the Y-axis based on row index

    // Helper to create a flat section of grass
    const createSection = (color) =>
        new THREE.Mesh(
            new THREE.BoxGeometry(tilesPerRow * tileSize, tileSize, 3), // Flat box geometry
            new THREE.MeshLambertMaterial({ color }) // Material for grass color
        );

    // Create middle, left, and right sections to extend the grass visually
    const middle = createSection(0xbaf455); // Lighter green for the main path
    middle.receiveShadow = true; // Grass receives shadows
    grass.add(middle);

    const left = createSection(0x99c846); // Darker green for side areas
    left.position.x = -tilesPerRow * tileSize;
    grass.add(left);

    const right = createSection(0x99c846); // Darker green for side areas
    right.position.x = tilesPerRow * tileSize;
    grass.add(right);

    return grass;
}

/**
 * Initializes the game map by clearing existing rows and adding new ones.
 * This function sets up the initial environment for the player.
 */
function initializeMap() {
    // Clear all existing row metadata and Three.js objects from the map group
    metadata.length = 0;
    map.remove(...map.children);

    // Add initial "safe" grass rows behind the player's starting position
    for (let rowIndex = 0; rowIndex > -10; rowIndex--) {
        const grass = Grass(rowIndex);
        map.add(grass);
    }
    addRows(); // Generate and add game rows (roads with vehicles, forests with trees)
}

/**
 * Generates and adds new rows (roads or forests) to the map as the player progresses.
 * This creates an infinitely scrolling environment.
 */
function addRows() {
    const newMetadata = generateRows(20); // Generate a batch of 20 new rows

    const startIndex = metadata.length;
    metadata.push(...newMetadata); // Add new row metadata to the global array

    newMetadata.forEach((rowData, index) => {
        const rowIndex = startIndex + index + 1; // Calculate the absolute row index

        if (rowData.type === "forest") {
            const row = Grass(rowIndex); // Forest rows are visually represented by grass
            rowData.trees.forEach(({ tileIndex, height }) => {
                const tree = Tree(tileIndex, height);
                row.add(tree); // Add trees to the forest row
            });
            map.add(row);
        }

        if (rowData.type === "car") {
            const row = Road(rowIndex); // Car lanes are roads
            rowData.vehicles.forEach((vehicle) => {
                const car = Car(
                    vehicle.initialTileIndex,
                    rowData.direction,
                    vehicle.color
                );
                vehicle.ref = car; // Store reference to the 3D car object for animation/collision
                row.add(car);
            });
            map.add(row);
        }

        if (rowData.type === "truck") {
            const row = Road(rowIndex); // Truck lanes are also roads
            rowData.vehicles.forEach((vehicle) => {
                const truck = Truck(
                    vehicle.initialTileIndex,
                    rowData.direction,
                    vehicle.color
                );
                vehicle.ref = truck; // Store reference to the 3D truck object
                row.add(truck);
            });
            map.add(row);
        }
    });
}

/**
 * Creates the 3D player character model (a simple chicken-like figure).
 * @returns {THREE.Group} A Three.js Group containing the player's meshes.
 */
function Player() {
    const player = new THREE.Group();

    // Main body of the player
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(15, 15, 20),
        new THREE.MeshLambertMaterial({
            color: "white", // White body for the chicken
            flatShading: true,
        })
    );
    body.position.z = 10; // Lift body slightly off the ground
    body.castShadow = true; // Player casts shadow
    body.receiveShadow = true; // Player receives shadow
    player.add(body);

    // A small "cap" or comb on top of the player's head
    const cap = new THREE.Mesh(
        new THREE.BoxGeometry(2, 4, 2),
        new THREE.MeshLambertMaterial({
            color: 0xf0619a, // Pink color for the cap
            flatShading: true,
        })
    );
    cap.position.z = 21; // Position above the body
    cap.castShadow = true;
    cap.receiveShadow = true;
    player.add(cap);

    const playerContainer = new THREE.Group();
    playerContainer.add(player); // Player model is nested inside a container for easier camera/light attachment

    return playerContainer;
}

/**
 * Resets the player's position and clears any pending moves.
 * Called at the start of a new game.
 */
function initializePlayer() {
    // Reset the Three.js player object's position
    player.position.x = 0;
    player.position.y = 0;
    player.children[0].position.z = 0; // Reset body Z position (undoes jump animation)

    // Reset player's logical position in game state
    position.currentRow = 0;
    position.currentTile = 0;

    // Clear any outstanding moves in the queue
    movesQueue.length = 0;
}

/**
 * Adds a player movement direction to the moves queue if the resulting position is valid.
 * @param {string} direction - The direction of the move ('forward', 'backward', 'left', or 'right').
 */
function queueMove(direction) {
    // Check if the proposed move (including any already queued moves) leads to a valid position
    const isValidMove = endsUpInValidPosition(
        {
            rowIndex: position.currentRow,
            tileIndex: position.currentTile,
        },
        [...movesQueue, direction] // Simulate the move by adding it to a temporary queue
    );

    if (!isValidMove) return; // If invalid, ignore the move command

    movesQueue.push(direction); // Add the valid move to the actual queue
}

/**
 * Completes a single step of player movement, updating the player's logical position
 * and the 3D score display.
 */
function stepCompleted() {
    const direction = movesQueue.shift(); // Remove the completed move from the queue

    // Update player's logical position based on the completed move
    if (direction === "forward") position.currentRow += 1;
    if (direction === "backward") position.currentRow -= 1;
    if (direction === "left") position.currentTile -= 1;
    if (direction === "right") position.currentTile += 1;

    // If the player is getting close to the end of the generated map, add more rows
    if (position.currentRow > metadata.length - 10) addRows();

    // Update the 3D score display
    if (scoreMesh) {
        scoreMesh.material.map.dispose(); // Dispose of the old texture to prevent memory leaks
        // Create a new texture with the updated score and apply it
        scoreMesh.material.map = createTextPlane(`Score: ${position.currentRow}`, 'white', 40, 300, 70).map;
    }
}

/**
 * Initializes and configures the Three.js WebGLRenderer, enabling WebXR for VR.
 * It also creates and appends the "Enter VR" button to the DOM.
 * @returns {THREE.WebGLRenderer} The configured Three.js WebGLRenderer instance.
 */
function Renderer() {
    const canvas = document.querySelector("canvas.game");
    if (!canvas) throw new Error("Canvas not found");

    const renderer = new THREE.WebGLRenderer({
        alpha: true, // Enable transparency for background
        antialias: true, // Smooth edges
        canvas: canvas, // Use the specified canvas element
    });
    renderer.setPixelRatio(window.devicePixelRatio); // Adjust for high-DPI screens
    renderer.setSize(window.innerWidth, window.innerHeight); // Set initial size
    renderer.shadowMap.enabled = true; // Enable shadow mapping
    renderer.xr.enabled = true; // Crucial: Enable WebXR for VR functionality

    // Create and append the VR button to allow users to enter VR mode
    const vrButtonContainer = document.getElementById('vr-button');
    if (vrButtonContainer) {
        vrButtonContainer.appendChild(VRButton.createButton(renderer));
    } else {
        console.error("VR button container not found. Make sure an element with id 'vr-button' exists in HTML.");
    }

    return renderer;
}

/**
 * Creates a road section for the game map.
 * @param {number} rowIndex - The row index where this road section will be placed.
 * @returns {THREE.Group} A Three.js Group representing the road section.
 */
function Road(rowIndex) {
    const road = new THREE.Group();
    road.position.y = rowIndex * tileSize; // Position road along the Y-axis

    // Helper to create a flat section of road
    const createSection = (color) =>
        new THREE.Mesh(
            new THREE.PlaneGeometry(tilesPerRow * tileSize, tileSize), // Flat plane geometry
            new THREE.MeshLambertMaterial({ color }) // Material for road color
        );

    // Create middle, left, and right sections to extend the road visually
    const middle = createSection(0x454a59); // Dark grey for the main road
    middle.receiveShadow = true;
    road.add(middle);

    const left = createSection(0x393d49); // Slightly darker grey for side areas
    left.position.x = -tilesPerRow * tileSize;
    road.add(left);

    const right = createSection(0x393d49); // Slightly darker grey for side areas
    right.position.x = tilesPerRow * tileSize;
    road.add(right);

    return road;
}

/**
 * Creates a 3D tree model.
 * @param {number} tileIndex - The tile index for the tree's X-position.
 * @param {number} height - The height of the tree's crown.
 * @returns {THREE.Group} A Three.js Group containing the tree's trunk and crown meshes.
 */
function Tree(tileIndex, height) {
    const tree = new THREE.Group();
    tree.position.x = tileIndex * tileSize; // Position tree along the X-axis

    // Tree trunk
    const trunk = new THREE.Mesh(
        new THREE.BoxGeometry(15, 15, 20),
        new THREE.MeshLambertMaterial({
            color: 0x4d2926, // Brown color for the trunk
            flatShading: true,
        })
    );
    trunk.position.z = 10; // Lift trunk off the ground
    tree.add(trunk);

    // Tree crown (foliage)
    const crown = new THREE.Mesh(
        new THREE.BoxGeometry(30, 30, height),
        new THREE.MeshLambertMaterial({
            color: 0x7aa21d, // Green color for the crown
            flatShading: true,
        })
    );
    crown.position.z = height / 2 + 20; // Position crown above the trunk
    crown.castShadow = true; // Crown casts shadow
    crown.receiveShadow = true; // Crown receives shadow
    tree.add(crown);

    return tree;
}

/**
 * Creates a 3D truck model.
 * @param {number} initialTileIndex - The starting tile index for the truck's position.
 * @param {boolean} direction - True for movement to the right, false for movement to the left.
 * @param {number} color - The hexadecimal color value for the truck's cabin.
 * @returns {THREE.Group} A Three.js Group containing the truck's meshes.
 */
function Truck(initialTileIndex, direction, color) {
    const truck = new THREE.Group();
    truck.position.x = initialTileIndex * tileSize;
    if (!direction) truck.rotation.z = Math.PI; // Rotate 180 degrees if moving left

    // Cargo bed of the truck
    const cargo = new THREE.Mesh(
        new THREE.BoxGeometry(70, 35, 35),
        new THREE.MeshLambertMaterial({
            color: 0xb4c6fc, // Light blue/grey for cargo
            flatShading: true,
        })
    );
    cargo.position.x = -15;
    cargo.position.z = 25;
    cargo.castShadow = true;
    cargo.receiveShadow = true;
    truck.add(cargo);

    // Cabin of the truck
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), [
        new THREE.MeshLambertMaterial({ color, flatShading: true, map: truckFrontTexture }), // front
        new THREE.MeshLambertMaterial({ color, flatShading: true }), // back
        new THREE.MeshLambertMaterial({ color, flatShading: true, map: truckLeftSideTexture }),
        new THREE.MeshLambertMaterial({ color, flatShading: true, map: truckRightSideTexture }),
        new THREE.MeshPhongMaterial({ color, flatShading: true }), // top
        new THREE.MeshPhongMaterial({ color, flatShading: true }), // bottom
    ]);
    cabin.position.x = 35;
    cabin.position.z = 20;
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    truck.add(cabin);

    // Add wheels to the truck (three sets for a truck)
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
 * @param {number} x - The X-position for the wheel relative to its parent object.
 * @returns {THREE.Mesh} A Three.js Mesh representing a wheel.
 */
function Wheel(x) {
    const wheel = new THREE.Mesh(
        new THREE.BoxGeometry(12, 33, 12), // Rectangular wheel for stylized look
        new THREE.MeshLambertMaterial({
            color: 0x333333, // Dark grey color
            flatShading: true,
        })
    );
    wheel.position.x = x;
    wheel.position.z = 6; // Lift wheels off the ground
    return wheel;
}

/**
 * Calculates the player's final logical position after a sequence of moves.
 * @param {Object} currentPosition - The player's starting logical position ({rowIndex, tileIndex}).
 * @param {Array<string>} moves - An array of move directions ('forward', 'backward', 'left', 'right').
 * @returns {Object} The calculated final logical position.
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
 * Checks if a proposed move (or sequence of moves) results in a valid player position.
 * A position is invalid if it's off the board boundaries or collides with a tree.
 * @param {Object} currentPosition - The player's current logical position.
 * @param {Array<string>} moves - The array of moves to check.
 * @returns {boolean} True if the final position is valid, false otherwise.
 */
function endsUpInValidPosition(currentPosition, moves) {
    // Calculate where the player would logically end up after the move(s)
    const finalPosition = calculateFinalPosition(currentPosition, moves);

    // 1. Detect if the player would move off the allowed board boundaries
    if (
        finalPosition.rowIndex === -1 || // Cannot move backward past the starting row
        finalPosition.tileIndex < minTileIndex || // Cannot move too far left
        finalPosition.tileIndex > maxTileIndex // Cannot move too far right
    ) {
        return false; // Invalid move
    }

    // 2. Detect if the player would collide with a tree
    // Note: `metadata[rowIndex - 1]` is used because `rowIndex 0` is the initial grass,
    // and game rows (which have metadata) start from `rowIndex 1` (corresponding to `metadata[0]`).
    const finalRow = metadata[finalPosition.rowIndex - 1];
    if (
        finalRow &&
        finalRow.type === "forest" && // Check only if it's a forest row
        finalRow.trees.some((tree) => tree.tileIndex === finalPosition.tileIndex) // Check if any tree is at the final tile
    ) {
        return false; // Invalid move (hit a tree)
    }

    return true; // The move is valid
}

/**
 * Generates a specified number of new game row metadata (forests, car lanes, truck lanes).
 * @param {number} amount - The number of rows to generate.
 * @returns {Array<Object>} An array of objects, each describing a row.
 */
function generateRows(amount) {
    const rows = [];
    for (let i = 0; i < amount; i++) {
        const rowData = generateRow(); // Generate data for a single row
        rows.push(rowData);
    }
    return rows;
}

/**
 * Randomly selects and generates metadata for a single game row.
 * @returns {Object} An object containing the type and specific data for the generated row.
 */
function generateRow() {
    const type = randomElement(["car", "truck", "forest"]); // Randomly choose row type
    if (type === "car") return generateCarLaneMetadata();
    if (type === "truck") return generateTruckLaneMetadata();
    return generateForesMetadata();
}

/**
 * Returns a random element from a given array.
 * @param {Array<any>} array - The array from which to pick a random element.
 * @returns {any} A randomly selected element from the array.
 */
function randomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generates metadata for a 'forest' type row, including positions and heights of trees.
 * @returns {Object} An object describing a forest row.
 */
function generateForesMetadata() {
    const occupiedTiles = new Set(); // To ensure trees don't overlap
    const trees = Array.from({ length: 4 }, () => { // Generate 4 trees per forest row
        let tileIndex;
        do {
            // Randomly pick a tile index until an unoccupied one is found
            tileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex);
        } while (occupiedTiles.has(tileIndex));
        occupiedTiles.add(tileIndex); // Mark the tile as occupied

        const height = randomElement([20, 45, 60]); // Random height for the tree

        return { tileIndex, height };
    });

    return { type: "forest", trees };
}

/**
 * Generates metadata for a 'car' type lane, including direction, speed, and car details.
 * @returns {Object} An object describing a car lane.
 */
function generateCarLaneMetadata() {
    const direction = randomElement([true, false]); // True for right-moving, false for left-moving
    const speed = randomElement([100, 125, 150]); // Random speed for cars

    const occupiedTiles = new Set(); // To prevent cars from spawning on top of each other

    const vehicles = Array.from({ length: 3 }, () => { // Generate 3 cars per lane
        let initialTileIndex;
        do {
            // Randomly pick an initial tile index for the car
            initialTileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex);
        } while (occupiedTiles.has(initialTileIndex));
        // Mark the car's tile and its immediate neighbors as occupied (cars are 3 tiles wide visually)
        occupiedTiles.add(initialTileIndex - 1);
        occupiedTiles.add(initialTileIndex);
        occupiedTiles.add(initialTileIndex + 1);

        const color = randomElement([0xa52523, 0xbdb638, 0x78b14b]); // Random color for the car

        return { initialTileIndex, color };
    });

    return { type: "car", direction, speed, vehicles };
}

/**
 * Generates metadata for a 'truck' type lane, similar to car lanes but with wider vehicles.
 * @returns {Object} An object describing a truck lane.
 */
function generateTruckLaneMetadata() {
    const direction = randomElement([true, false]);
    const speed = randomElement([100, 125, 150]);

    const occupiedTiles = new Set();

    const vehicles = Array.from({ length: 2 }, () => { // Generate 2 trucks per lane
        let initialTileIndex;
        do {
            initialTileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex);
        } while (occupiedTiles.has(initialTileIndex));
        // Trucks are wider (5 tiles visually), so mark more tiles as occupied
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

/**
 * Animates the player's movement, smoothly interpolating position and rotation.
 * This function is called every frame while the player is moving.
 */
function animatePlayer() {
    if (!movesQueue.length) {
        moveClock.stop(); // Stop the movement clock if no moves are pending
        return;
    }

    if (!moveClock.running) moveClock.start(); // Start the clock when a move begins

    const stepTime = 0.2; // Time in seconds it takes for one step
    const progress = Math.min(1, moveClock.getElapsedTime() / stepTime); // Calculate animation progress (0 to 1)

    setPosition(progress); // Update player's 3D position
    setRotation(progress); // Update player's 3D rotation

    // If the animation for the current step is complete
    if (progress >= 1) {
        stepCompleted(); // Finalize the step (update logical position, etc.)
        moveClock.stop(); // Stop the clock and reset for the next move
    }
}

/**
 * Interpolates the player's 3D position during a movement animation.
 * Also adds a subtle "jumping" effect.
 * @param {number} progress - The animation progress (0 to 1).
 */
function setPosition(progress) {
    // Calculate start and end X, Y coordinates in Three.js units
    const startX = position.currentTile * tileSize;
    const startY = position.currentRow * tileSize;
    let endX = startX;
    let endY = startY;

    // Determine the target end position based on the current move in the queue
    if (movesQueue[0] === "left") endX -= tileSize;
    if (movesQueue[0] === "right") endX += tileSize;
    if (movesQueue[0] === "forward") endY += tileSize;
    if (movesQueue[0] === "backward") endY -= tileSize;

    // Linearly interpolate player's X and Y position
    player.position.x = THREE.MathUtils.lerp(startX, endX, progress);
    player.position.y = THREE.MathUtils.lerp(startY, endY, progress);
    // Add a sine-wave based jumping animation for the player's body
    player.children[0].position.z = Math.sin(progress * Math.PI) * 8;
}

/**
 * Interpolates the player's 3D rotation during a movement animation to face the direction of travel.
 * @param {number} progress - The animation progress (0 to 1).
 */
function setRotation(progress) {
    let endRotation = 0; // Default rotation (facing forward)
    // Determine the target rotation based on the current move
    if (movesQueue[0] == "forward") endRotation = 0;
    if (movesQueue[0] == "left") endRotation = Math.PI / 2; // 90 degrees left
    if (movesQueue[0] == "right") endRotation = -Math.PI / 2; // -90 degrees right
    if (movesQueue[0] == "backward") endRotation = Math.PI; // 180 degrees backward

    // Smoothly interpolate the player's body rotation
    player.children[0].rotation.z = THREE.MathUtils.lerp(
        player.children[0].rotation.z,
        endRotation,
        progress
    );
}

/**
 * Animates the movement of cars and trucks across the road lanes.
 * Vehicles wrap around the map edges to create continuous traffic.
 */
function animateVehicles() {
    const delta = gameClock.getDelta(); // Time elapsed since the last frame

    metadata.forEach((rowData) => {
        if (rowData.type === "car" || rowData.type === "truck") {
            // Define the wrap-around points for vehicles (slightly beyond visible tiles)
            const beginningOfRow = (minTileIndex - 2) * tileSize;
            const endOfRow = (maxTileIndex + 2) * tileSize;

            rowData.vehicles.forEach(({ ref }) => {
                if (!ref) {
                    console.error("Vehicle reference is missing for rowData:", rowData);
                    return; // Skip if reference is missing
                }

                if (rowData.direction) { // If vehicle is moving right
                    ref.position.x =
                        ref.position.x > endOfRow // If vehicle has passed the end
                            ? beginningOfRow // Wrap it back to the beginning
                            : ref.position.x + rowData.speed * delta; // Move it forward
                } else { // If vehicle is moving left
                    ref.position.x =
                        ref.position.x < beginningOfRow // If vehicle has passed the beginning
                            ? endOfRow // Wrap it back to the end
                            : ref.position.x - rowData.speed * delta; // Move it backward
                }
            });
        }
    });
}

/**
 * Performs collision detection between the player and vehicles on the current row.
 * If a collision is detected, the game ends and the game over UI is displayed.
 */
function hitTest() {
    // Only check for collisions if the player is NOT currently in the middle of a move animation.
    // This prevents false positives during the "jump" animation.
    if (movesQueue.length > 0) return;

    const row = metadata[position.currentRow - 1]; // Get the metadata for the player's current row
    if (!row) return; // If player is on the initial grass or off-map, no vehicles to hit

    if (row.type === "car" || row.type === "truck") {
        // Create a bounding box for the player's main body (chicken)
        const playerBoundingBox = new THREE.Box3();
        playerBoundingBox.setFromObject(player.children[0]); // Player's actual body mesh

        row.vehicles.forEach(({ ref }) => {
            if (!ref) {
                console.error("Vehicle reference is missing during hit test for rowData:", rowData);
                return;
            }

            // Create a bounding box for the vehicle's main body (car/truck)
            const vehicleBoundingBox = new THREE.Box3();
            // Assuming the main body of the car/truck is its first child
            vehicleBoundingBox.setFromObject(ref.children[0]);

            // Check for intersection between player and vehicle bounding boxes
            if (playerBoundingBox.intersectsBox(vehicleBoundingBox)) {
                // Game Over state
                if (gameOverMesh) gameOverMesh.visible = true;
                if (finalScoreMesh) {
                    // Update final score text and make it visible
                    finalScoreMesh.material.map.dispose(); // Dispose old texture
                    finalScoreMesh.material.map = createTextPlane(`Final Score: ${position.currentRow}`, 'white', 40, 300, 70).map;
                    finalScoreMesh.visible = true;
                }
                if (retryButtonMesh) retryButtonMesh.visible = true; // Show the retry button

                // Stop the main animation loop, effectively pausing the game
                renderer.setAnimationLoop(null);
            }
        });
    }
}

/**
 * Sets up the VR controllers (e.g., Meta Quest 3 controllers) and their event listeners.
 * This allows the game to receive input from the physical VR controllers.
 */
function setupVRControllers() {
    // Controller 0 (typically the right hand controller)
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('selectstart', onSelectStart); // Listen for trigger press
    scene.add(controller1); // Add controller to the scene so it can be seen/tracked

    // Controller Grip 0 (for displaying the controller model)
    controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.add(new XRControllerModelFactory().createControllerModel(controllerGrip1));
    scene.add(controllerGrip1);

    // Controller 1 (typically the left hand controller)
    controller2 = renderer.xr.getController(1);
    // Currently, only controller1's trigger is used for input.
    // More complex input (e.g., thumbstick for left/right/backward) could be added here.
    scene.add(controller2);

    // Controller Grip 1
    controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(new XRControllerModelFactory().createControllerModel(controllerGrip2));
    scene.add(controllerGrip2);
}

/**
 * Event handler for the 'selectstart' event from VR controllers (e.g., trigger pull).
 * This function either moves the player forward or restarts the game if it's over.
 * @param {Event} event - The WebXR 'selectstart' event object.
 */
function onSelectStart(event) {
    // Check if the game is currently in a "Game Over" state
    if (gameOverMesh && gameOverMesh.visible) {
        // If game is over, a trigger press restarts the game
        initializeGame(); // Re-initialize all game elements
        renderer.setAnimationLoop(animate); // Restart the animation loop
    } else {
        // If game is active, a trigger press makes the player move forward
        queueMove("forward");
    }
}

/**
 * The main animation loop of the game. This function is called repeatedly by the renderer,
 * especially when in VR mode, to update the scene and render frames.
 */
function animate() {
    animateVehicles(); // Update positions of cars and trucks
    animatePlayer(); // Update player's position and animation
    hitTest(); // Check for collisions

    renderer.render(scene, camera); // Render the updated scene from the camera's perspective
}

/**
 * Initializes the entire game, setting up the scene, player, map, and UI elements.
 * This function is called once at the start and again when the game is restarted.
 */
function initializeGame() {
    // Reset core game state
    initializePlayer(); // Reset player's position and moves
    initializeMap(); // Reset and regenerate the game map

    // Dispose of and re-create 3D UI elements to ensure they are fresh
    // This is important to prevent memory leaks from old textures/geometries
    if (scoreMesh) {
        scoreMesh.removeFromParent();
        scoreMesh.geometry.dispose();
        scoreMesh.material.dispose();
    }
    if (gameOverMesh) {
        gameOverMesh.removeFromParent();
        gameOverMesh.geometry.dispose();
        gameOverMesh.material.dispose();
    }
    if (finalScoreMesh) {
        finalScoreMesh.removeFromParent();
        finalScoreMesh.geometry.dispose();
        finalScoreMesh.material.dispose();
    }
    if (retryButtonMesh) {
        retryButtonMesh.removeFromParent();
        retryButtonMesh.geometry.dispose();
        retryButtonMesh.material.dispose();
    }

    // Create and add new 3D UI elements to the player group (so they move with the player)
    scoreMesh = createTextPlane(`Score: ${position.currentRow}`, 'white', 40, 300, 70);
    scoreMesh.position.set(0, -150, 100); // Position in front of the player, slightly up
    player.add(scoreMesh);

    gameOverMesh = createTextPlane('GAME OVER!', 'red', 60, 400, 100);
    gameOverMesh.position.set(0, -150, 150); // Position above score
    gameOverMesh.visible = false; // Hidden initially
    player.add(gameOverMesh);

    finalScoreMesh = createTextPlane(`Final Score: ${position.currentRow}`, 'white', 40, 300, 70);
    finalScoreMesh.position.set(0, -150, 120); // Position between game over and retry
    finalScoreMesh.visible = false; // Hidden initially
    player.add(finalScoreMesh);

    retryButtonMesh = createTextPlane('RETRY', 'green', 50, 200, 70);
    retryButtonMesh.position.set(0, -150, 80); // Position below final score
    retryButtonMesh.visible = false; // Hidden initially
    player.add(retryButtonMesh);
}

// --- Main Initialization Block ---
// This block runs once the entire HTML document and its resources are loaded.
window.onload = function () {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Set a pleasant sky blue background color

    // 2. Player Setup
    player = Player();
    scene.add(player); // Add the player group to the scene

    // 3. Map Setup
    map = new THREE.Group();
    scene.add(map); // Add the map group to the scene

    // 4. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Soft ambient light for overall illumination
    scene.add(ambientLight);

    const dirLight = DirectionalLight(); // Create the directional light (sunlight)
    // Attach directional light to the player's main body. This ensures the light
    // and its shadows move with the player, illuminating the current area.
    dirLight.target = player.children[0]; // Target the player's body for accurate shadows
    player.add(dirLight);

    // 5. Camera Setup
    camera = Camera(); // Create the VR-ready perspective camera
    // Attach the camera to the player group. This makes the camera follow the player's movements.
    player.add(camera);

    // 6. Renderer Setup
    renderer = Renderer(); // Initialize the WebGLRenderer and enable WebXR. This also adds the VR button.
    document.body.appendChild(renderer.domElement); // Append the canvas to the document body

    // 7. VR Controller Setup
    setupVRControllers(); // Initialize VR controllers and their event listeners

    // 8. Start the Game
    initializeGame(); // Perform initial game setup (map, player state, UI)

    // 9. Set the Animation Loop
    // `renderer.setAnimationLoop` is the standard way to run animations with WebXR.
    // It automatically handles VR frame rates and rendering.
    renderer.setAnimationLoop(animate);

    // 10. Handle Window Resizing (for non-VR desktop preview)
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
};