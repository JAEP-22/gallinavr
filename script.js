import * as THREE from "https://esm.sh/three";
import { VRButton } from "https://esm.sh/three/examples/jsm/webxr/VRButton.js";

const minTileIndex = -8;
const maxTileIndex = 8;
const tilesPerRow = maxTileIndex - minTileIndex + 1;
const tileSize = 42;

let camera, scene, renderer;
let player;
let map; // The group containing all roads, grass, and vehicles
let scoreDOM, resultDOM, finalScoreDOM, gameControlsDOM;
let backgroundMusic;

// Game state (logical position of the chicken)
const metadata = [];
const position = {
    currentRow: 0, // Represents progress forward (along game's conceptual X-axis)
    currentTile: 0, // Represents side-to-side lane (along game's conceptual Z-axis)
};
const movesQueue = [];
const moveClock = new THREE.Clock(false);
const gameClock = new THREE.Clock();

function Camera() {
    // For VR, a PerspectiveCamera is essential.
    // The VR system handles the user's head movement and perspective.
    const fov = 75;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 1000;
    const cam = new THREE.PerspectiveCamera(fov, aspect, near, far);
    return cam;
}

// --- Textures remain the same ---
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

// --- Object creation functions adjusted for Y-up and horizontal game play ---

function Car(initialTileIndex, direction, color) {
    const car = new THREE.Group();
    // Car moves along Z-axis (lanes) and is positioned along X-axis (rows)
    // Car's "forward" is along positive X or negative X depending on direction
    car.position.z = initialTileIndex * tileSize; // Position in a specific lane (Z-axis)
    // Rotate to face correct direction: 0 for facing positive X, Math.PI for negative X
    car.rotation.y = direction ? 0 : Math.PI; // Face positive X if direction is true, else negative X

    const main = new THREE.Mesh(
        new THREE.BoxGeometry(60, 30, 15), // Length, Width, Height
        new THREE.MeshLambertMaterial({ color, flatShading: true })
    );
    main.position.y = 12; // Height on Y-axis
    main.castShadow = true;
    main.receiveShadow = true;
    car.add(main);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(33, 24, 12), [
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carBackTexture }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carFrontTexture }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carRightSideTexture }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true, map: carLeftSideTexture }),
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }), // top
        new THREE.MeshPhongMaterial({ color: 0xcccccc, flatShading: true }), // bottom
    ]);
    cabin.position.x = -6; // Position along car's length
    cabin.position.y = 25.5; // Height on Y-axis
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    car.add(cabin);

    const frontWheel = Wheel(18); // Position along car's length
    car.add(frontWheel);

    const backWheel = Wheel(-18); // Position along car's length
    car.add(backWheel);

    return car;
}

function DirectionalLight() {
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    // Position light generally above and slightly in front/side of the game world
    dirLight.position.set(50, 200, 50); // X, Y (up), Z
    dirLight.target.position.set(0, 0, 0); // Pointing towards the center of the scene
    dirLight.castShadow = true;

    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;

    dirLight.shadow.camera.left = -400;
    dirLight.shadow.camera.right = 400;
    dirLight.shadow.camera.top = 400;
    dirLight.shadow.camera.bottom = -400;
    dirLight.shadow.camera.near = 50;
    dirLight.shadow.camera.far = 400;

    return dirLight;
}

function Grass(rowIndex) {
    const grass = new THREE.Group();
    // Grass rows extend along Z (side-to-side) and stack along X (forward)
    grass.position.x = rowIndex * tileSize; // Position of the row along X (forward)

    const createSection = (color) =>
        new THREE.Mesh(
            new THREE.BoxGeometry(tileSize, 3, tilesPerRow * tileSize), // Width (X), Height (Y), Depth (Z)
            new THREE.MeshLambertMaterial({ color })
        );

    const middle = createSection(0xbaf455);
    middle.receiveShadow = true;
    grass.add(middle);

    const left = createSection(0x99c846);
    left.position.z = -tilesPerRow * tileSize; // Extend to the left
    grass.add(left);

    const right = createSection(0x99c846);
    right.position.z = tilesPerRow * tileSize; // Extend to the right
    grass.add(right);

    return grass;
}

function initializeMap() {
    metadata.length = 0;
    map.remove(...map.children);

    // Initial rows (behind the player, for rendering purposes)
    for (let rowIndex = -10; rowIndex < 0; rowIndex++) { // Start from behind player
        const grass = Grass(rowIndex);
        map.add(grass);
    }
    addRows();
}

function addRows() {
    const newMetadata = generateRows(20);

    const startIndex = metadata.length;
    metadata.push(...newMetadata);

    newMetadata.forEach((rowData, index) => {
        const rowIndex = startIndex + index; // Relative to metadata array, not absolute world position
        const worldRowIndex = rowIndex + position.currentRow; // Translate to world coordinates

        if (rowData.type === "forest") {
            const row = Grass(worldRowIndex);
            rowData.trees.forEach(({ tileIndex, height }) => {
                const tree = Tree(tileIndex, height);
                row.add(tree);
            });
            map.add(row);
        }

        if (rowData.type === "car") {
            const row = Road(worldRowIndex);
            rowData.vehicles.forEach((vehicle) => {
                const car = Car(
                    vehicle.initialTileIndex,
                    rowData.direction,
                    vehicle.color
                );
                vehicle.ref = car;
                row.add(car);
            });
            map.add(row);
        }

        if (rowData.type === "truck") {
            const row = Road(worldRowIndex);
            rowData.vehicles.forEach((vehicle) => {
                const truck = Truck(
                    vehicle.initialTileIndex,
                    rowData.direction,
                    vehicle.color
                );
                vehicle.ref = truck;
                row.add(truck);
            });
            map.add(row);
        }
    });
}

function Player() {
    const playerGroup = new THREE.Group(); // This group will hold the chicken model

    // Chicken model (body and cap)
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(15, 15, 20), // Width (X), Depth (Z), Height (Y)
        new THREE.MeshLambertMaterial({
            color: "white",
            flatShading: true,
        })
    );
    body.position.y = 10; // Half of height, resting on the ground (Y is up)
    body.castShadow = true;
    body.receiveShadow = true;
    playerGroup.add(body);

    const cap = new THREE.Mesh(
        new THREE.BoxGeometry(2, 4, 2),
        new THREE.MeshLambertMaterial({
            color: 0xf0619a,
            flatShading: true,
        })
    );
    cap.position.y = 21; // Position above the body
    cap.castShadow = true;
    cap.receiveShadow = true;
    playerGroup.add(cap);

    // The player's initial rotation will be handled in setRotation
    return playerGroup;
}

function initializePlayer() {
    player.position.x = 0; // Starting at the beginning of the road (X-axis)
    player.position.y = 0; // On the ground
    player.position.z = 0; // Starting in the middle lane

    // Ensure player faces "forward" (positive X)
    player.rotation.y = -Math.PI / 2; // Initial rotation so chicken faces along positive X (game forward)

    position.currentRow = 0;
    position.currentTile = 0;

    movesQueue.length = 0;
}

function queueMove(direction) {
    const isValidMove = endsUpInValidPosition(
        {
            rowIndex: position.currentRow,
            tileIndex: position.currentTile,
        },
        [...movesQueue, direction]
    );

    if (!isValidMove) return;

    movesQueue.push(direction);
}

function stepCompleted() {
    const direction = movesQueue.shift();

    if (direction === "forward") position.currentRow += 1;
    if (direction === "backward") position.currentRow -= 1;
    if (direction === "left") position.currentTile -= 1;
    if (direction === "right") position.currentTile += 1;

    // Add new rows if the player is running out of them
    // This logic might need adjustment if current position changes map generation
    if (position.currentRow > metadata.length - 10) addRows();

    if (scoreDOM) scoreDOM.innerText = position.currentRow.toString();
}

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

    renderer.xr.enabled = true; // Enable WebXR

    return renderer;
}

function Road(rowIndex) {
    const road = new THREE.Group();
    // Road rows extend along Z (side-to-side) and stack along X (forward)
    road.position.x = rowIndex * tileSize; // Position of the row along X (forward)

    const createSection = (color) =>
        new THREE.Mesh(
            new THREE.PlaneGeometry(tileSize, tilesPerRow * tileSize), // Width (X), Depth (Z) - Note: PlaneGeometry is usually XY, but we'll rotate it
            new THREE.MeshLambertMaterial({ color })
        );

    const middle = createSection(0x454a59);
    // Rotate the plane to be on the XZ plane (Y-up)
    middle.rotation.x = -Math.PI / 2; // Rotate so plane's Y points downwards (towards Z)
    middle.receiveShadow = true;
    road.add(middle);

    const left = createSection(0x393d49);
    left.position.z = -tilesPerRow * tileSize;
    left.rotation.x = -Math.PI / 2;
    road.add(left);

    const right = createSection(0x393d49);
    right.position.z = tilesPerRow * tileSize;
    right.rotation.x = -Math.PI / 2;
    road.add(right);

    return road;
}

function Tree(tileIndex, height) {
    const tree = new THREE.Group();
    // Trees are on a specific tile (Z-axis) within a row (X-axis)
    tree.position.z = tileIndex * tileSize;

    const trunk = new THREE.Mesh(
        new THREE.BoxGeometry(15, 15, 20), // Width (X), Depth (Z), Height (Y)
        new THREE.MeshLambertMaterial({
            color: 0x4d2926,
            flatShading: true,
        })
    );
    trunk.position.y = 10; // Half of height, resting on the ground
    tree.add(trunk);

    const crown = new THREE.Mesh(
        new THREE.BoxGeometry(30, 30, height), // Width (X), Depth (Z), Height (Y)
        new THREE.MeshLambertMaterial({
            color: 0x7aa21d,
            flatShading: true,
        })
    );
    crown.position.y = height / 2 + 20; // Position above trunk
    crown.castShadow = true;
    crown.receiveShadow = true;
    tree.add(crown);

    return tree;
}

function Truck(initialTileIndex, direction, color) {
    const truck = new THREE.Group();
    // Truck's position is along a lane (Z-axis)
    truck.position.z = initialTileIndex * tileSize;
    truck.rotation.y = direction ? 0 : Math.PI; // Face positive X or negative X

    const cargo = new THREE.Mesh(
        new THREE.BoxGeometry(70, 35, 35), // Length, Width, Height
        new THREE.MeshLambertMaterial({
            color: 0xb4c6fc,
            flatShading: true,
        })
    );
    cargo.position.x = -15; // Position along truck's length
    cargo.position.y = 25; // Height
    cargo.castShadow = true;
    cargo.receiveShadow = true;
    truck.add(cargo);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), [
        new THREE.MeshLambertMaterial({ color, flatShading: true, map: truckFrontTexture }),
        new THREE.MeshLambertMaterial({ color, flatShading: true }),
        new THREE.MeshLambertMaterial({ color, flatShading: true, map: truckLeftSideTexture }),
        new THREE.MeshLambertMaterial({ color, flatShading: true, map: truckRightSideTexture }),
        new THREE.MeshPhongMaterial({ color, flatShading: true }), // top
        new THREE.MeshPhongMaterial({ color, flatShading: true }), // bottom
    ]);
    cabin.position.x = 35; // Position along truck's length
    cabin.position.y = 20; // Height
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

function Wheel(x) {
    const wheel = new THREE.Mesh(
        new THREE.BoxGeometry(12, 33, 12), // Width (X), Diameter (Z), Thickness (Y)
        new THREE.MeshLambertMaterial({
            color: 0x333333,
            flatShading: true,
        })
    );
    wheel.position.x = x; // Position along vehicle's length
    wheel.position.y = 6; // Height
    return wheel;
}

// --- Game Logic Functions (mostly unchanged, coordinates are conceptual) ---
function calculateFinalPosition(currentPosition, moves) {
    return moves.reduce((pos, direction) => {
        if (direction === "forward") return { rowIndex: pos.rowIndex + 1, tileIndex: pos.tileIndex };
        if (direction === "backward") return { rowIndex: pos.rowIndex - 1, tileIndex: pos.tileIndex };
        if (direction === "left") return { rowIndex: pos.rowIndex, tileIndex: pos.tileIndex - 1 };
        if (direction === "right") return { rowIndex: pos.rowIndex, tileIndex: pos.tileIndex + 1 };
        return pos;
    }, currentPosition);
}

function endsUpInValidPosition(currentPosition, moves) {
    const finalPosition = calculateFinalPosition(currentPosition, moves);
    if (
        finalPosition.rowIndex < -1 || // Prevent going too far back (initial -1 row, but current starts at 0)
        finalPosition.tileIndex < minTileIndex ||
        finalPosition.tileIndex > maxTileIndex
    ) {
        return false;
    }
    const finalRow = metadata[finalPosition.rowIndex]; // Use rowIndex directly on metadata
    if (
        finalRow &&
        finalRow.type === "forest" &&
        finalRow.trees.some((tree) => tree.tileIndex === finalPosition.tileIndex)
    ) {
        return false;
    }
    return true;
}

function generateRows(amount) {
    const rows = [];
    for (let i = 0; i < amount; i++) {
        rows.push(generateRow());
    }
    return rows;
}

function generateRow() {
    const type = randomElement(["car", "truck", "forest"]);
    if (type === "car") return generateCarLaneMetadata();
    if (type === "truck") return generateTruckLaneMetadata();
    return generateForesMetadata();
}

function randomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

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

function generateCarLaneMetadata() {
    const direction = randomElement([true, false]); // True for positive X, False for negative X
    const speed = randomElement([100, 125, 150]);
    const occupiedTiles = new Set();
    const vehicles = Array.from({ length: 3 }, () => {
        let initialTileIndex;
        do {
            initialTileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex);
        } while (occupiedTiles.has(initialTileIndex));
        occupiedTiles.add(initialTileIndex - 1);
        occupiedTiles.add(initialTileIndex);
        occupiedTiles.add(initialTileIndex + 1);
        const color = randomElement([0xa52523, 0xbdb638, 0x78b14b]);
        return { initialTileIndex, color };
    });
    return { type: "car", direction, speed, vehicles };
}

function generateTruckLaneMetadata() {
    const direction = randomElement([true, false]);
    const speed = randomElement([100, 125, 150]);
    const occupiedTiles = new Set();
    const vehicles = Array.from({ length: 2 }, () => {
        let initialTileIndex;
        do {
            initialTileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex);
        } while (occupiedTiles.has(initialTileIndex));
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

function animatePlayer() {
    if (!movesQueue.length) {
        moveClock.stop(); // Stop the clock when no moves are queued
        return;
    }

    if (!moveClock.running) moveClock.start();

    const stepTime = 0.2; // Seconds it takes to take a step
    const progress = Math.min(1, moveClock.getElapsedTime() / stepTime);

    setPosition(progress);
    setRotation(progress);

    if (progress >= 1) {
        stepCompleted();
        moveClock.stop();
    }
}

function setPosition(progress) {
    // Translate conceptual game position to Three.js world coordinates
    const startX = position.currentRow * tileSize;
    const startZ = position.currentTile * tileSize;
    let endX = startX;
    let endZ = startZ;

    if (movesQueue[0] === "forward") endX += tileSize;
    if (movesQueue[0] === "backward") endX -= tileSize;
    if (movesQueue[0] === "left") endZ -= tileSize;
    if (movesQueue[0] === "right") endZ += tileSize;

    player.position.x = THREE.MathUtils.lerp(startX, endX, progress);
    player.position.z = THREE.MathUtils.lerp(startZ, endZ, progress);
    player.children[0].position.y = Math.sin(progress * Math.PI) * 8; // Chicken's "jump"
}

function setRotation(progress) {
    let endRotationY = -Math.PI / 2; // Default: Facing positive X (game forward)
    if (movesQueue[0] === "forward") endRotationY = -Math.PI / 2; // Face positive X
    if (movesQueue[0] === "left") endRotationY = -Math.PI; // Face negative Z (left)
    if (movesQueue[0] === "right") endRotationY = 0; // Face positive Z (right)
    if (movesQueue[0] === "backward") endRotationY = Math.PI / 2; // Face negative X

    // Interpolate the player's Y-rotation (around the Y-axis)
    player.rotation.y = THREE.MathUtils.lerp(
        player.rotation.y,
        endRotationY,
        progress
    );
}

function animateVehicles() {
    const delta = gameClock.getDelta();

    metadata.forEach((rowData) => {
        if (rowData.type === "car" || rowData.type === "truck") {
            // Vehicles move along the X-axis within their lanes (Z-axis)
            const beginningOfRow = (minTileIndex - 2) * tileSize;
            const endOfRow = (maxTileIndex + 2) * tileSize;

            rowData.vehicles.forEach(({ ref }) => {
                if (!ref) throw Error("Vehicle reference is missing");

                // Vehicles move along the X-axis in the world
                if (rowData.direction) { // True means moving towards positive X
                    ref.position.x =
                        ref.position.x > endOfRow
                            ? beginningOfRow
                            : ref.position.x + rowData.speed * delta;
                } else { // False means moving towards negative X
                    ref.position.x =
                        ref.position.x < beginningOfRow
                            ? endOfRow
                            : ref.position.x - rowData.speed * delta;
                }
            });
        }
    });
}

function hitTest() {
    // We check collision based on the *logical* position (currentRow, currentTile)
    // and the *world* position of the vehicle models.
    const row = metadata[position.currentRow]; // Check the row the player is currently on
    if (!row) return; // Happens if player moves into non-existent rows

    if (row.type === "car" || row.type === "truck") {
        const playerBoundingBox = new THREE.Box3();
        playerBoundingBox.setFromObject(player);

        row.vehicles.forEach(({ ref }) => {
            if (!ref) throw Error("Vehicle reference is missing");

            const vehicleBoundingBox = new THREE.Box3();
            vehicleBoundingBox.setFromObject(ref);

            if (playerBoundingBox.intersectsBox(vehicleBoundingBox)) {
                if (!resultDOM || !finalScoreDOM) return;
                resultDOM.style.visibility = "visible";
                finalScoreDOM.innerText = position.currentRow.toString();
                renderer.setAnimationLoop(null); // Stop animation loop on game over
                if (backgroundMusic) backgroundMusic.pause();
            }
        });
    }
}

// --- Main Initialization ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // No initial rotation on the entire scene.
    // We will build the world correctly with Y-up from the start.

    player = Player();
    scene.add(player); // Player is added directly to the scene

    map = new THREE.Group();
    scene.add(map); // Map is added directly to the scene

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = DirectionalLight();
    scene.add(dirLight); // Light is added directly to the scene, not parented to player

    camera = Camera();
    // Camera's position and lookAt are set in the animate loop for dynamic following

    renderer = Renderer();
    document.getElementById("vr-button-container").appendChild(VRButton.createButton(renderer));

    // Get DOM elements
    scoreDOM = document.getElementById("score");
    resultDOM = document.getElementById("result-container");
    finalScoreDOM = document.getElementById("final-score");
    gameControlsDOM = document.getElementById("game-controls");
    backgroundMusic = document.getElementById("backgroundMusic");


    // VR Session Listeners
    renderer.xr.addEventListener('sessionstart', function () {
        console.log('VR Session Started');
        gameControlsDOM.classList.add('active'); // Show buttons in VR
        if (backgroundMusic) backgroundMusic.play();
    });

    renderer.xr.addEventListener('sessionend', function () {
        console.log('VR Session Ended');
        gameControlsDOM.classList.remove('active'); // Hide buttons outside VR
        if (backgroundMusic) backgroundMusic.pause();
    });

    // Control button event listeners
    document.getElementById("forward")?.addEventListener("click", () => queueMove("forward"));
    document.getElementById("backward")?.addEventListener("click", () => queueMove("backward"));
    document.getElementById("left")?.addEventListener("click", () => queueMove("left"));
    document.getElementById("right")?.addEventListener("click", () => queueMove("right"));

    // Keyboard controls (useful for development)
    window.addEventListener("keydown", (event) => {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            queueMove("forward");
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            queueMove("backward");
        } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            queueMove("left");
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            queueMove("right");
        }
    });

    document.querySelector("#retry")?.addEventListener("click", initializeGame);

    initializeGame();

    renderer.setAnimationLoop(animate); // Start the main animation loop
}

function initializeGame() {
    initializePlayer();
    initializeMap();

    if (scoreDOM) scoreDOM.innerText = "0";
    if (resultDOM) resultDOM.style.visibility = "hidden";
    if (backgroundMusic) {
        backgroundMusic.currentTime = 0;
        if (renderer.xr.isPresenting) { // Only attempt to play if in VR or if user initiated
            backgroundMusic.play();
        }
    }
    renderer.setAnimationLoop(animate); // Re-enable animation loop on retry
}

function animate() {
    animateVehicles();
    animatePlayer();
    hitTest();

    // Dynamically position the camera relative to the player
    const playerWorldPosition = new THREE.Vector3();
    player.getWorldPosition(playerWorldPosition);

    // Camera is positioned behind (negative X), above (positive Y), and centered on Z
    // Adjust these values for desired distance and height
    const cameraOffsetX = -200; // Distance behind player (more negative for further back)
    const cameraOffsetY = 250; // Height above player
    const cameraOffsetZ = 0;   // Centered horizontally with player

    camera.position.set(
        playerWorldPosition.x + cameraOffsetX,
        playerWorldPosition.y + cameraOffsetY,
        playerWorldPosition.z + cameraOffsetZ
    );

    // Make the camera look slightly in front of the player and a bit above them
    const lookAtOffsetZ = 0; // Look at player's Z position
    const lookAtOffsetY = 50; // Look slightly above player's height

    camera.lookAt(
        playerWorldPosition.x,
        playerWorldPosition.y + lookAtOffsetY,
        playerWorldPosition.z + lookAtOffsetZ
    );

    renderer.render(scene, camera);
}

// Start the game initialization
init();