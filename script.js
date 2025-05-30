import * as THREE from "https://esm.sh/three";
import { VRButton } from "https://esm.sh/three/examples/jsm/webxr/VRButton.js";

const minTileIndex = -8;
const maxTileIndex = 8;
const tilesPerRow = maxTileIndex - minTileIndex + 1;
const tileSize = 42;

let camera, scene, renderer;
let player;
let map;
let scoreDOM, resultDOM, finalScoreDOM, gameControlsDOM;
let backgroundMusic;

// Game state
const metadata = [];
const position = {
    currentRow: 0,
    currentTile: 0,
};
const movesQueue = [];
const moveClock = new THREE.Clock(false);
const gameClock = new THREE.Clock();

function Camera() {
    const fov = 75;
    const aspect = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 1000;
    const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

    // Initial position of the camera (relative to the player in animate function)
    // This will be overridden by the animate function's camera positioning.
    return camera;
}

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

function Car(initialTileIndex, direction, color) {
    const car = new THREE.Group();
    // Adjusted initial position to align with the new scene orientation
    // Cars now move along the X-axis for "forward" across the lanes
    car.position.z = initialTileIndex * tileSize; // Car's depth (what was Y) is now Z
    if (!direction) car.rotation.y = Math.PI; // Rotate around Y for direction

    const main = new THREE.Mesh(
        new THREE.BoxGeometry(60, 30, 15),
        new THREE.MeshLambertMaterial({ color, flatShading: true })
    );
    main.position.y = 12; // Z-axis for height is now Y-axis
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
    cabin.position.y = 25.5; // Z-axis for height is now Y-axis
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    car.add(cabin);

    const frontWheel = Wheel(18);
    car.add(frontWheel);

    const backWheel = Wheel(-18);
    car.add(backWheel);

    return car;
}

function DirectionalLight() {
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    // Adjust light position to align with the new scene orientation
    dirLight.position.set(-100, 200, -100); // Y is now up
    dirLight.up.set(0, 1, 0); // Y-axis is the up vector for the light
    dirLight.castShadow = true;

    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;

    dirLight.shadow.camera.up.set(0, 1, 0); // Y-axis is the up vector for the shadow camera
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
    // Grass rows should extend along X, and stack along Z for depth
    grass.position.x = rowIndex * tileSize; // What was Y (rows) is now X
    grass.rotation.x = Math.PI / 2; // Rotate to lie flat on XZ plane

    const createSection = (color) =>
        new THREE.Mesh(
            new THREE.BoxGeometry(tilesPerRow * tileSize, tileSize, 3), // Width, depth, height
            new THREE.MeshLambertMaterial({ color })
        );

    const middle = createSection(0xbaf455);
    middle.receiveShadow = true;
    grass.add(middle);

    const left = createSection(0x99c846);
    left.position.z = -tilesPerRow * tileSize; // Adjusted for new orientation
    grass.add(left);

    const right = createSection(0x99c846);
    right.position.z = tilesPerRow * tileSize; // Adjusted for new orientation
    grass.add(right);

    return grass;
}

function initializeMap() {
    metadata.length = 0;
    map.remove(...map.children);

    for (let rowIndex = 0; rowIndex > -10; rowIndex--) {
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
        const rowIndex = startIndex + index + 1;

        if (rowData.type === "forest") {
            const row = Grass(rowIndex);
            rowData.trees.forEach(({ tileIndex, height }) => {
                const tree = Tree(tileIndex, height);
                row.add(tree);
            });
            map.add(row);
        }

        if (rowData.type === "car") {
            const row = Road(rowIndex);
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
            const row = Road(rowIndex);
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
    const player = new THREE.Group();

    // Rotate the player group so its "forward" (Y-axis in game logic) aligns with X-axis in Three.js world
    // and its "up" (Z-axis in game logic) aligns with Y-axis in Three.js world.
    player.rotation.x = Math.PI / 2; // Rotate to lie flat on XZ plane
    player.rotation.y = Math.PI / 2; // Rotate to point along X-axis (original Y-axis)

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(15, 15, 20), // Chicken body dimensions
        new THREE.MeshLambertMaterial({
            color: "white",
            flatShading: true,
        })
    );
    body.position.z = 10; // Z-axis for height (was original Z, now maps to Y after rotation)
    body.castShadow = true;
    body.receiveShadow = true;
    player.add(body);

    const cap = new THREE.Mesh(
        new THREE.BoxGeometry(2, 4, 2),
        new THREE.MeshLambertMaterial({
            color: 0xf0619a,
            flatShading: true,
        })
    );
    cap.position.z = 21; // Z-axis for height
    cap.castShadow = true;
    cap.receiveShadow = true;
    player.add(cap);

    return player; // player is already a group
}

function initializePlayer() {
    // Player's initial position should reflect the new coordinate system
    player.position.x = 0; // CurrentRow is now X
    player.position.z = 0; // CurrentTile is now Z
    player.children[0].position.y = 0; // Local Y position for body

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

    renderer.xr.enabled = true;

    return renderer;
}

function Road(rowIndex) {
    const road = new THREE.Group();
    // Road rows should extend along X, and stack along Z for depth
    road.position.x = rowIndex * tileSize; // What was Y (rows) is now X
    road.rotation.x = Math.PI / 2; // Rotate to lie flat on XZ plane

    const createSection = (color) =>
        new THREE.Mesh(
            new THREE.PlaneGeometry(tilesPerRow * tileSize, tileSize), // Width, depth
            new THREE.MeshLambertMaterial({ color })
        );

    const middle = createSection(0x454a59);
    middle.receiveShadow = true;
    road.add(middle);

    const left = createSection(0x393d49);
    left.position.z = -tilesPerRow * tileSize; // Adjusted for new orientation
    road.add(left);

    const right = createSection(0x393d49);
    right.position.z = tilesPerRow * tileSize; // Adjusted for new orientation
    road.add(right);

    return road;
}

function Tree(tileIndex, height) {
    const tree = new THREE.Group();
    // Tree position to align with the new scene orientation
    tree.position.z = tileIndex * tileSize; // TileIndex (original X) is now Z

    const trunk = new THREE.Mesh(
        new THREE.BoxGeometry(15, 15, 20),
        new THREE.MeshLambertMaterial({
            color: 0x4d2926,
            flatShading: true,
        })
    );
    trunk.position.y = 10; // Z-axis for height is now Y-axis
    tree.add(trunk);

    const crown = new THREE.Mesh(
        new THREE.BoxGeometry(30, 30, height),
        new THREE.MeshLambertMaterial({
            color: 0x7aa21d,
            flatShading: true,
        })
    );
    crown.position.y = height / 2 + 20; // Z-axis for height is now Y-axis
    crown.castShadow = true;
    crown.receiveShadow = true;
    tree.add(crown);

    return tree;
}

function Truck(initialTileIndex, direction, color) {
    const truck = new THREE.Group();
    // Adjusted initial position to align with the new scene orientation
    truck.position.z = initialTileIndex * tileSize; // Truck's depth is now Z
    if (!direction) truck.rotation.y = Math.PI; // Rotate around Y for direction

    const cargo = new THREE.Mesh(
        new THREE.BoxGeometry(70, 35, 35),
        new THREE.MeshLambertMaterial({
            color: 0xb4c6fc,
            flatShading: true,
        })
    );
    cargo.position.x = -15;
    cargo.position.y = 25; // Z-axis for height is now Y-axis
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
    cabin.position.y = 20; // Z-axis for height is now Y-axis
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
        new THREE.BoxGeometry(12, 33, 12),
        new THREE.MeshLambertMaterial({
            color: 0x333333,
            flatShading: true,
        })
    );
    wheel.position.x = x;
    wheel.position.y = 6; // Z-axis for height is now Y-axis
    return wheel;
}

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

function endsUpInValidPosition(currentPosition, moves) {
    const finalPosition = calculateFinalPosition(currentPosition, moves);

    if (
        finalPosition.rowIndex === -1 ||
        finalPosition.tileIndex === minTileIndex - 1 ||
        finalPosition.tileIndex === maxTileIndex + 1
    ) {
        return false;
    }

    const finalRow = metadata[finalPosition.rowIndex - 1];
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
        const rowData = generateRow();
        rows.push(rowData);
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
    const direction = randomElement([true, false]);
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
    if (!movesQueue.length) return;

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
    // CurrentRow is now X, CurrentTile is now Z
    const startX = position.currentRow * tileSize;
    const startZ = position.currentTile * tileSize; // Z for depth
    let endX = startX;
    let endZ = startZ;

    // Movement directions are now relative to the new axis system
    if (movesQueue[0] === "forward") endX += tileSize; // Forward is along X
    if (movesQueue[0] === "backward") endX -= tileSize;
    if (movesQueue[0] === "left") endZ -= tileSize; // Left is along Z
    if (movesQueue[0] === "right") endZ += tileSize;

    player.position.x = THREE.MathUtils.lerp(startX, endX, progress);
    player.position.z = THREE.MathUtils.lerp(startZ, endZ, progress);
    player.children[0].position.y = Math.sin(progress * Math.PI) * 8; // Y for jump/height
}

function setRotation(progress) {
    let endRotationY = Math.PI / 2; // Default for player (facing along X-axis initially)
    if (movesQueue[0] == "forward") endRotationY = Math.PI / 2; // Facing positive X
    if (movesQueue[0] == "left") endRotationY = Math.PI; // Facing negative Z
    if (movesQueue[0] == "right") endRotationY = 0; // Facing positive Z
    if (movesQueue[0] == "backward") endRotationY = -Math.PI / 2; // Facing negative X

    // Interpolate only the Y-rotation (which is now the "yaw" or horizontal rotation)
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
            // These are now moving along the Z-axis (original X-axis for horizontal movement)
            const beginningOfRow = (minTileIndex - 2) * tileSize;
            const endOfRow = (maxTileIndex + 2) * tileSize;

            rowData.vehicles.forEach(({ ref }) => {
                if (!ref) throw Error("Vehicle reference is missing");

                if (rowData.direction) { // Original direction was positive X
                    ref.position.z =
                        ref.position.z > endOfRow
                            ? beginningOfRow
                            : ref.position.z + rowData.speed * delta;
                } else { // Original direction was negative X
                    ref.position.z =
                        ref.position.z < beginningOfRow
                            ? endOfRow
                            : ref.position.z - rowData.speed * delta;
                }
            });
        }
    });
}

function hitTest() {
    const row = metadata[position.currentRow - 1];
    if (!row) return;

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
                renderer.setAnimationLoop(null);
                if (backgroundMusic) backgroundMusic.pause();
            }
        });
    }
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);

    // Initial rotation of the entire scene to align the game world
    // X-axis now represents the "forward" progression of the game.
    // Z-axis represents the "lane" or "side-to-side" movement.
    // Y-axis is "up".
    scene.rotation.x = -Math.PI / 2; // Rotate the whole scene so X is forward and Z is sideways, Y is up

    player = Player();
    scene.add(player);

    map = new THREE.Group();
    scene.add(map);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = DirectionalLight();
    dirLight.target = player; // Still target the player for lighting
    scene.add(dirLight);

    camera = Camera();
    // Camera is not added directly to the player. Its position will be set in animate()

    renderer = Renderer();
    document.getElementById("vr-button-container").appendChild(VRButton.createButton(renderer));

    scoreDOM = document.getElementById("score");
    resultDOM = document.getElementById("result-container");
    finalScoreDOM = document.getElementById("final-score");
    gameControlsDOM = document.getElementById("game-controls");
    backgroundMusic = document.getElementById("backgroundMusic");


    renderer.xr.addEventListener('sessionstart', function () {
        console.log('VR Session Started');
        gameControlsDOM.classList.add('active');
        if (backgroundMusic) backgroundMusic.play();
    });

    renderer.xr.addEventListener('sessionend', function () {
        console.log('VR Session Ended');
        gameControlsDOM.classList.remove('active');
        if (backgroundMusic) backgroundMusic.pause();
    });

    document.getElementById("forward")?.addEventListener("click", () => queueMove("forward"));
    document.getElementById("backward")?.addEventListener("click", () => queueMove("backward"));
    document.getElementById("left")?.addEventListener("click", () => queueMove("left"));
    document.getElementById("right")?.addEventListener("click", () => queueMove("right"));

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

    renderer.setAnimationLoop(animate);
}

function initializeGame() {
    initializePlayer();
    initializeMap();

    if (scoreDOM) scoreDOM.innerText = "0";
    if (resultDOM) resultDOM.style.visibility = "hidden";
    if (backgroundMusic) {
        backgroundMusic.currentTime = 0;
        if (renderer.xr.isPresenting) {
            backgroundMusic.play();
        }
    }

    renderer.setAnimationLoop(animate);
}

function animate() {
    animateVehicles();
    animatePlayer();
    hitTest();

    // Position the camera for a more distant, over-the-shoulder view
    const playerWorldPosition = new THREE.Vector3();
    player.getWorldPosition(playerWorldPosition); // Get the player's position in world space

    // Now, adjust the camera relative to this world position.
    // X is forward, Z is side-to-side, Y is up.
    // For a more distant view, increase the offsets.
    camera.position.set(
        playerWorldPosition.x - 150, // More behind the player (further in negative X)
        playerWorldPosition.y + 200, // Higher above the player
        playerWorldPosition.z       // Same Z as player for side-to-side alignment
    );

    // Make the camera look at the player's current position
    camera.lookAt(playerWorldPosition.x, playerWorldPosition.y + 50, playerWorldPosition.z); // Look slightly above the player

    renderer.render(scene, camera);
}

init();