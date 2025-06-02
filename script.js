import * as THREE from "https://esm.sh/three";
// Importa VRButton para el botón "Enter VR"
import { VRButton } from 'https://esm.sh/three/addons/webxr/VRButton.js';

const minTileIndex = -8;
const maxTileIndex = 8;
const tilesPerRow = maxTileIndex - minTileIndex + 1;
const tileSize = 42;

// Modificación importante: La cámara para VR debe ser PerspectiveCamera
function Camera() {
  const fov = 75; // Campo de visión
  const aspect = window.innerWidth / window.innerHeight; // Aspect ratio
  const near = 0.1; // Plano cercano
  const far = 1000; // Plano lejano
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

  // La posición inicial de la cámara es donde estará el "jugador"
  // En VR, la posición real de la cámara se ajustará por el sistema XR
  camera.position.set(0, 0, 0); // Inicialmente en el centro del jugador
  // La cámara no mira a un punto fijo, sino que sigue la orientación del dispositivo VR
  // camera.lookAt(0, 0, 0); // Esta línea ya no es necesaria con VR

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

export const truckFrontTexture = Texture(30, 30, [
  { x: 5, y: 0, w: 10, h: 30 },
]);
export const truckRightSideTexture = Texture(25, 30, [
  { x: 15, y: 5, w: 10, h: 10 },
]);
export const truckLeftSideTexture = Texture(25, 30, [
  { x: 15, y: 15, w: 10, h: 10 },
]);


function Car(initialTileIndex, direction, color) {
  const car = new THREE.Group();
  car.position.x = initialTileIndex * tileSize;
  if (!direction) car.rotation.z = Math.PI;

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

const metadata = [];

const map = new THREE.Group();

function initializeMap() {
  // Remove all rows
  metadata.length = 0;
  map.remove(...map.children);

  // Add new rows
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
        const three = Tree(tileIndex, height);
        row.add(three);
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

const player = Player();

function Player() {
  const player = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(15, 15, 20),
    new THREE.MeshLambertMaterial({
      color: "white",
      flatShading: true,
    })
  );
  body.position.z = 10;
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
  cap.position.z = 21;
  cap.castShadow = true;
  cap.receiveShadow = true;
  player.add(cap);

  const playerContainer = new THREE.Group();
  playerContainer.add(player);

  return playerContainer;
}

const position = {
  currentRow: 0,
  currentTile: 0,
};

const movesQueue = [];

function initializePlayer() {
  // Initialize the Three.js player object
  player.position.x = 0;
  player.position.y = 0;
  player.children[0].position.z = 0; // Para el efecto de "salto"

  // Initialize metadata
  position.currentRow = 0;
  position.currentTile = 0;

  // Clear the moves queue
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
  if (position.currentRow > metadata.length - 10) addRows();

  const scoreDOM = document.getElementById("score");
  if (scoreDOM) scoreDOM.innerText = position.currentRow.toString();
}

// Modificación importante: Habilitar WebXR en el renderer
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

  renderer.xr.enabled = true; // ¡Habilitar WebXR!

  return renderer;
}

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

function Truck(initialTileIndex, direction, color) {
  const truck = new THREE.Group();
  truck.position.x = initialTileIndex * tileSize;
  if (!direction) truck.rotation.z = Math.PI;

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

const moveClock = new THREE.Clock(false);

// Modificación importante: Animar al jugador con teletransporte para VR
function animatePlayer() {
  if (!movesQueue.length) return;

  const direction = movesQueue.shift(); // Tomar directamente el siguiente movimiento

  const startX = position.currentTile * tileSize;
  const startY = position.currentRow * tileSize;
  let endX = startX;
  let endY = startY;

  if (direction === "left") endX -= tileSize;
  if (direction === "right") endX += tileSize;
  if (direction === "forward") endY += tileSize;
  if (direction === "backward") endY -= tileSize;

  // Teletransporte del jugador a la nueva posición
  player.position.x = endX;
  player.position.y = endY;
  player.children[0].position.z = 0; // Reiniciar la posición Z (efecto de "salto" si lo hubiera)

  // Actualizar la rotación del jugador instantáneamente para VR
  let endRotation = 0;
  if (direction === "forward") endRotation = 0;
  if (direction === "left") endRotation = Math.PI / 2;
  if (direction === "right") endRotation = -Math.PI / 2;
  if (direction === "backward") endRotation = Math.PI;
  player.children[0].rotation.z = endRotation;

  stepCompleted();
}

// La función setRotation ya no es necesaria con teletransporte
// function setRotation(progress) { ... }

const clock = new THREE.Clock();

function animateVehicles() {
  const delta = clock.getDelta();

  // Animate cars and trucks
  metadata.forEach((rowData) => {
    if (rowData.type === "car" || rowData.type === "truck") {
      const beginningOfRow = (minTileIndex - 2) * tileSize;
      const endOfRow = (maxTileIndex + 2) * tileSize;

      rowData.vehicles.forEach(({ ref }) => {
        if (!ref) throw Error("Vehicle reference is missing");

        if (rowData.direction) {
          ref.position.x =
            ref.position.x > endOfRow
              ? beginningOfRow
              : ref.position.x + rowData.speed * delta;
        } else {
          ref.position.x =
            ref.position.x < beginningOfRow
              ? endOfRow
              : ref.position.x - rowData.speed * delta;
        }
      });
    }
  });
}

// Estos listeners de eventos ya no son relevantes para el control en VR
// document.getElementById("forward")?.addEventListener("click", () => queueMove("forward"));
// document.getElementById("backward")?.addEventListener("click", () => queueMove("backward"));
// document.getElementById("left")?.addEventListener("click", () => queueMove("left"));
// document.getElementById("right")?.addEventListener("click", () => queueMove("right"));
// window.addEventListener("keydown", (event) => { ... });

function hitTest() {
  const row = metadata[position.currentRow - 1];
  if (!row) return;

  if (row.type === "car" || row.type === "truck") {
    // Ajuste del tamaño del bounding box del jugador para ser más preciso
    // El tamaño del bounding box del jugador puede necesitar ajustarse para VR,
    // dependiendo de cómo se posicione la cámara en relación con el modelo del jugador.
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
        // Detener la animación o reiniciar el juego
        renderer.setAnimationLoop(null); // Detener el bucle de animación
      }
    });
  }
}

const scene = new THREE.Scene();
scene.add(player);
scene.add(map);

const ambientLight = new THREE.AmbientLight();
scene.add(ambientLight);

const dirLight = DirectionalLight();
// En VR, la luz direccional debería seguir la cámara o estar fija en el mundo
// Si quieres que siga al jugador, añádela a la escena y apunta al jugador.
dirLight.target = player;
scene.add(dirLight); // Añadir a la escena, no al jugador

const camera = Camera();
// La cámara principal se añade directamente a la escena, Three.js XR la manejará
scene.add(camera);

// Referencias a los controladores de VR
let controller1, controller2;

const scoreDOM = document.getElementById("score");
const resultDOM = document.getElementById("result-container");
const finalScoreDOM = document.getElementById("final-score");

initializeGame();

document.querySelector("#retry")?.addEventListener("click", initializeGame);

function initializeGame() {
  initializePlayer();
  initializeMap();

  // Initialize UI
  if (scoreDOM) scoreDOM.innerText = "0";
  if (resultDOM) resultDOM.style.visibility = "hidden";

  // Añadir el botón "Enter VR" que maneja la sesión WebXR
  // Asegúrate de tener un div con id="vr-button" en tu HTML
  const vrButtonContainer = document.getElementById("vr-button-container");
  if (vrButtonContainer) {
    vrButtonContainer.innerHTML = ''; // Limpiar si ya existe
    vrButtonContainer.appendChild(VRButton.createButton(renderer));
  } else {
    // Si no hay un contenedor específico, añadirlo al body (menos ideal para UI)
    document.body.appendChild(VRButton.createButton(renderer));
  }

  // Si ya hay una sesión XR activa, es posible que necesitemos reiniciar la configuración del controlador
  if (renderer.xr.isPresenting) {
    setupXRInput();
  }
}

const renderer = Renderer();
// Usa setAnimationLoop del renderer.xr para el bucle de animación en VR
renderer.setAnimationLoop(animate);

// Configuración de los controladores de VR
function setupXRInput() {
  // Controlador 1
  controller1 = renderer.xr.getController(0);
  controller1.addEventListener('selectstart', onSelectStart);
  controller1.addEventListener('squeezestart', onSqueezeStart); // Ejemplo para otro botón (agarre)
  scene.add(controller1);

  // Añadir un "raycaster" visual para el controlador para apuntar
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const line = new THREE.Line(geometry);
  line.scale.z = 5; // Longitud del rayo visual
  controller1.add(line.clone());
  controller2.add(line.clone()); // Si quieres rayo en ambos

  // Controlador 2
  controller2 = renderer.xr.getController(1);
  controller2.addEventListener('selectstart', onSelectStart);
  controller2.addEventListener('squeezestart', onSqueezeStart);
  scene.add(controller2);
}

// Evento de inicio de la sesión XR (cuando se entra a VR)
renderer.xr.addEventListener('sessionstart', function () {
  console.log('Sesión XR iniciada');
  setupXRInput(); // Configurar los controladores cuando la sesión inicie
});

// Evento de fin de la sesión XR (cuando se sale de VR)
renderer.xr.addEventListener('sessionend', function () {
  console.log('Sesión XR terminada');
  // Limpiar controladores si es necesario
  if (controller1) scene.remove(controller1);
  if (controller2) scene.remove(controller2);
  // También puedes limpiar los listeners para evitar errores
  if (controller1) {
    controller1.removeEventListener('selectstart', onSelectStart);
    controller1.removeEventListener('squeezestart', onSqueezeStart);
  }
  if (controller2) {
    controller2.removeEventListener('selectstart', onSelectStart);
    controller2.removeEventListener('squeezestart', onSqueezeStart);
  }
});

// Función para manejar el evento "selectstart" (gatillo del controlador)
function onSelectStart(event) {
  const controller = event.target;
  // Obtener la dirección del controlador en el espacio del mundo
  const directionVector = new THREE.Vector3();
  controller.getWorldDirection(directionVector);

  // Normalizar el vector para comparar direcciones
  directionVector.normalize();

  // Para un control simple con los Meta Quest 3, puedes mapear los botones
  // del joystick/trackpad o la orientación del controlador.
  // Aquí un ejemplo básico:

  // Usar la orientación para decidir el movimiento
  // Puedes refinar esto para usar el joystick del controlador
  // El "grip" o "squeeze" también es un buen candidato para movimiento.

  // Supongamos que el botón principal del controlador (gatillo) activa el movimiento.
  // Podemos asignar el movimiento según la orientación del controlador, o simplemente
  // usar un mapeo de botones directo si el juego es solo "adelante/atrás/izquierda/derecha".

  // Para simular el "joystick" o "d-pad" de un controlador de VR,
  // tendrías que acceder a las propiedades `gamepad` del controlador
  // (event.data.gamepad para un evento de WebXR, o directamente del objeto Gamepad de la API Gamepad).
  // Los Meta Quest 3 tienen un joystick en el controlador derecho.

  // Ejemplo de cómo podrías mapear un movimiento con el joystick del controlador
  const gamepad = controller.gamepad;
  if (gamepad && gamepad.axes) {
    // Eje X del joystick (izquierda/derecha)
    const x = gamepad.axes[2]; // Comúnmente el eje X para el joystick derecho
    // Eje Y del joystick (adelante/atrás)
    const y = gamepad.axes[3]; // Comúnmente el eje Y para el joystick derecho

    const threshold = 0.5; // Umbral para detectar un movimiento significativo

    if (Math.abs(x) > Math.abs(y)) { // Movimiento horizontal predominante
      if (x > threshold) {
        queueMove("right");
      } else if (x < -threshold) {
        queueMove("left");
      }
    } else { // Movimiento vertical predominante
      if (y < -threshold) { // Hacia adelante (eje Y negativo es usualmente adelante en Three.js/VR)
        queueMove("forward");
      } else if (y > threshold) { // Hacia atrás
        queueMove("backward");
      }
    }
  } else {
      // Fallback si no se detecta el gamepad o se usa un botón para teletransporte simple
      // Por ejemplo, si simplemente se presiona el gatillo, ir hacia adelante
      queueMove("forward");
  }

  // Ejemplo de vibración háptica al mover
  if (gamepad && gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
    gamepad.hapticActuators[0].pulse(0.5, 100); // Intensidad 0.5, duración 100ms
  }
}

// Ejemplo de otro botón (Agarre/Squeeze) para reiniciar el juego
function onSqueezeStart(event) {
  // Puedes usar este botón para reiniciar el juego o alguna otra acción
  console.log('Botón de agarre presionado. Reiniciando juego...');
  initializeGame();
}


function animate() {
  // La cámara del jugador ya no se mueve manualmente con player.position.z
  // Es manejada por la API WebXR.
  // La posición del modelo del jugador (player) debe reflejar la posición del mundo.
  // Para que la cámara esté "dentro" del jugador, el player.position debería coincidir
  // con la posición de la cámara del sistema XR.
  // Esto es más complejo y a menudo implica poner el modelo del jugador en la misma posición
  // que el espacio de referencia de la sesión XR.

  // Por ahora, el jugador (player Three.js object) se moverá como antes,
  // y la cámara de WebXR se moverá con él.
  // Esto simula que el jugador es el "centro" de la experiencia VR.
  animateVehicles();
  animatePlayer(); // Ahora es teleportación
  hitTest();

  // El renderizado lo maneja setAnimationLoop del renderer.xr
  // renderer.render(scene, camera); // Esta línea se ejecuta automáticamente
}