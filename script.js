// Importa THREE de A-Frame si necesitas acceso directo a la librería
// const THREE = AFRAME.THREE;

const minTileIndex = -8;
const maxTileIndex = 8;
const tilesPerRow = maxTileIndex - minTileIndex + 1;
const tileSize = 4; // Reducido para VR, piensa en metros
const playerTileSize = 1; // Tamaño del jugador en VR

// Variables para el juego, ahora en un contexto VR
const metadata = []; // Misma lógica de metadata
const movesQueue = [];
const position = {
    currentRow: 0,
    currentTile: 0,
};

// Referencias a elementos de A-Frame
const playerEl = document.getElementById('player');
const rigEl = document.getElementById('rig'); // El rig contiene la cámara del jugador
const gameMapEl = document.getElementById('game-map');
const scoreDOM = document.getElementById("score");

// --- Componentes personalizados de A-Frame (Ejemplos) ---

// Componente para manejar el movimiento del jugador por tiles
AFRAME.registerComponent('player-mover', {
    init: function () {
        this.el.addEventListener('player-move', this.onPlayerMove.bind(this));
        this.moveClock = new THREE.Clock(false);
        this.stepTime = 0.3; // Tiempo para un paso en segundos
        this.isMoving = false;
        this.targetPosition = new THREE.Vector3();
        this.startPosition = new THREE.Vector3();
        this.startRotation = new THREE.Euler();
        this.targetRotation = new THREE.Euler();
    },

    onPlayerMove: function (evt) {
        const direction = evt.detail.direction;
        const isValidMove = endsUpInValidPosition(
            {
                rowIndex: position.currentRow,
                tileIndex: position.currentTile,
            },
            [...movesQueue, direction]
        );

        if (!isValidMove || this.isMoving) {
            console.log("Movimiento inválido o ya en movimiento:", direction);
            return;
        }

        movesQueue.push(direction);
        if (!this.isMoving) {
            this.startMove();
        }
    },

    startMove: function () {
        if (!movesQueue.length) return;

        this.isMoving = true;
        this.moveClock.start();

        // Guardar posiciones iniciales
        this.startPosition.copy(rigEl.object3D.position); // Mover el rig
        this.startRotation.copy(playerEl.object3D.rotation);

        // Calcular la posición final
        let endX = position.currentTile * tileSize;
        let endY = position.currentRow * tileSize; // En A-Frame, 'y' es el plano horizontal, 'z' la profundidad

        const nextMove = movesQueue[0];
        if (nextMove === "left") endX -= tileSize;
        if (nextMove === "right") endX += tileSize;
        if (nextMove === "forward") endY += tileSize;
        if (nextMove === "backward") endY -= tileSize;

        this.targetPosition.set(endX, this.startPosition.y, endY); // Asegúrate de que 'y' sea la altura y 'z' la profundidad en tu escena A-Frame

        // Calcular rotación final
        let endRotationZ = 0; // Rotación en Z para el eje vertical (arriba/abajo)
        if (nextMove === "forward") endRotationZ = 0;
        if (nextMove === "left") endRotationZ = Math.PI / 2; // 90 grados
        if (nextMove === "right") endRotationZ = -Math.PI / 2; // -90 grados
        if (nextMove === "backward") endRotationZ = Math.PI; // 180 grados

        this.targetRotation.set(0, endRotationZ, 0); // Rotación en Y para el jugador (mirando)
    },

    tick: function (time, deltaTime) {
        if (!this.isMoving) return;

        const progress = Math.min(1, this.moveClock.getElapsedTime() / this.stepTime);

        // Interpolación de posición del rig (para mover todo el sistema del jugador)
        rigEl.object3D.position.lerpVectors(this.startPosition, this.targetPosition, progress);

        // Interpolación de rotación del cuerpo del jugador (visual, no del rig)
        // Puedes usar slerp para rotaciones si es necesario, pero lerp de Euler es simple aquí
        playerEl.object3D.rotation.y = THREE.MathUtils.lerp(this.startRotation.y, this.targetRotation.y, progress);
        // Efecto de "salto" de la gallina
        playerEl.object3D.position.y = 0.25 + Math.sin(progress * Math.PI) * 0.2; // Altura del salto

        if (progress >= 1) {
            this.isMoving = false;
            this.moveClock.stop();
            this.moveClock.elapsedTime = 0; // Resetear para la próxima vez

            // Actualizar la posición lógica del juego
            const direction = movesQueue.shift();
            if (direction === "forward") position.currentRow += 1;
            if (direction === "backward") position.currentRow -= 1;
            if (direction === "left") position.currentTile -= 1;
            if (direction === "right") position.currentTile += 1;

            if (scoreDOM) scoreDOM.innerText = position.currentRow.toString();

            // Alinear la posición final del rig a la cuadrícula para evitar errores de flotante
            rigEl.object3D.position.x = position.currentTile * tileSize;
            rigEl.object3D.position.z = position.currentRow * tileSize;
            rigEl.object3D.position.y = 0; // Asegurarse de que esté en el suelo

            // Generar nuevas filas si es necesario
            if (position.currentRow > metadata.length - 10) addRows();
        }
    }
});

// Adjuntar el componente al rig del jugador
rigEl.setAttribute('player-mover', '');

// --- Funciones del juego (adaptadas para A-Frame) ---

function initializeGame() {
    initializePlayer();
    initializeMap();

    if (scoreDOM) scoreDOM.innerText = "0";
    // Si tuvieras un div de resultado para VR, lo ocultarías/mostrarías
    // const resultDOM = document.getElementById("result-container");
    // if (resultDOM) resultDOM.style.visibility = "hidden";
}

function initializePlayer() {
    position.currentRow = 0;
    position.currentTile = 0;
    movesQueue.length = 0;

    // Posicionar el rig y el jugador visualmente
    rigEl.object3D.position.set(0, 0, 0);
    playerEl.object3D.position.set(0, 0.25, 0); // La gallina en el centro del rig
    playerEl.object3D.rotation.set(0, 0, 0);
}

function initializeMap() {
    // Limpiar el mapa existente en A-Frame
    while (gameMapEl.firstChild) {
        gameMapEl.removeChild(gameMapEl.firstChild);
    }
    metadata.length = 0;

    // Añadir algunas filas iniciales de césped
    for (let rowIndex = 0; rowIndex > -10; rowIndex--) {
        const grassEl = createGrass(rowIndex);
        gameMapEl.appendChild(grassEl);
    }
    addRows();
}

function createGrass(rowIndex) {
    const grassGroup = document.createElement('a-entity');
    grassGroup.setAttribute('position', `0 0 ${rowIndex * tileSize}`); // Y es la altura, Z es la profundidad

    // Sección central del césped
    const middleGrass = document.createElement('a-box');
    middleGrass.setAttribute('color', '#baf455');
    middleGrass.setAttribute('width', `${tilesPerRow * tileSize}`);
    middleGrass.setAttribute('height', '0.1'); // Pequeño espesor
    middleGrass.setAttribute('depth', `${tileSize}`);
    middleGrass.setAttribute('position', `0 -0.05 0`); // Ligeramente debajo del plano
    middleGrass.setAttribute('shadow', 'receive: true');
    grassGroup.appendChild(middleGrass);

    // Secciones izquierda y derecha (para cuando el jugador se mueva lateralmente)
    const leftGrass = document.createElement('a-box');
    leftGrass.setAttribute('color', '#99c846');
    leftGrass.setAttribute('width', `${tilesPerRow * tileSize}`);
    leftGrass.setAttribute('height', '0.1');
    leftGrass.setAttribute('depth', `${tileSize}`);
    leftGrass.setAttribute('position', `${-tilesPerRow * tileSize} -0.05 0`);
    leftGrass.setAttribute('shadow', 'receive: true');
    grassGroup.appendChild(leftGrass);

    const rightGrass = document.createElement('a-box');
    rightGrass.setAttribute('color', '#99c846');
    rightGrass.setAttribute('width', `${tilesPerRow * tileSize}`);
    rightGrass.setAttribute('height', '0.1');
    rightGrass.setAttribute('depth', `${tileSize}`);
    rightGrass.setAttribute('position', `${tilesPerRow * tileSize} -0.05 0`);
    rightGrass.setAttribute('shadow', 'receive: true');
    grassGroup.appendChild(rightGrass);

    return grassGroup;
}


// Adaptar Texture, Car, Truck, Tree, Wheel para A-Frame:
// En A-Frame, estos se crearían como entidades <a-entity> con componentes de geometría y material.
// Las texturas de Canvas funcionarían, pero tendrías que aplicarlas a los componentes `material` de A-Frame.
// Ejemplo simplificado de Tree (deberías construirlo de forma similar a como lo haces en Three.js):
function createTree(tileIndex, height) {
    const treeGroup = document.createElement('a-entity');
    treeGroup.setAttribute('position', `${tileIndex * tileSize} 0.05 0`); // Posición en la fila

    const trunk = document.createElement('a-box');
    trunk.setAttribute('color', '#4d2926');
    trunk.setAttribute('width', '0.3');
    trunk.setAttribute('height', '0.6');
    trunk.setAttribute('depth', '0.3');
    trunk.setAttribute('position', `0 0.3 0`); // Altura del tronco
    treeGroup.appendChild(trunk);

    const crown = document.createElement('a-box');
    crown.setAttribute('color', '#7aa21d');
    crown.setAttribute('width', '0.8');
    crown.setAttribute('height', `${height / 50}`); // Ajustar escala para VR
    crown.setAttribute('depth', '0.8');
    crown.setAttribute('position', `0 ${height / 100 + 0.6} 0`); // Altura de la copa
    crown.setAttribute('shadow', 'receive: true; cast: true');
    treeGroup.appendChild(crown);

    return treeGroup;
}

function createRoad(rowIndex) {
    const roadGroup = document.createElement('a-entity');
    roadGroup.setAttribute('position', `0 0 ${rowIndex * tileSize}`);

    const middleRoad = document.createElement('a-plane'); // Usar plano para la carretera
    middleRoad.setAttribute('color', '#454a59');
    middleRoad.setAttribute('width', `${tilesPerRow * tileSize}`);
    middleRoad.setAttribute('height', `${tileSize}`);
    middleRoad.setAttribute('rotation', `-90 0 0`); // Rotar para que sea horizontal
    middleRoad.setAttribute('position', `0 0.01 0`); // Ligeramente por encima del césped
    middleRoad.setAttribute('shadow', 'receive: true');
    roadGroup.appendChild(middleRoad);

    // Podrías añadir las secciones izquierda y derecha de la carretera de forma similar
    const leftRoad = document.createElement('a-plane');
    leftRoad.setAttribute('color', '#393d49');
    leftRoad.setAttribute('width', `${tilesPerRow * tileSize}`);
    leftRoad.setAttribute('height', `${tileSize}`);
    leftRoad.setAttribute('rotation', `-90 0 0`);
    leftRoad.setAttribute('position', `${-tilesPerRow * tileSize} 0.01 0`);
    roadGroup.appendChild(leftRoad);

    const rightRoad = document.createElement('a-plane');
    rightRoad.setAttribute('color', '#393d49');
    rightRoad.setAttribute('width', `${tilesPerRow * tileSize}`);
    rightRoad.setAttribute('height', `${tileSize}`);
    rightRoad.setAttribute('rotation', `-90 0 0`);
    rightRoad.setAttribute('position', `${tilesPerRow * tileSize} 0.01 0`);
    roadGroup.appendChild(rightRoad);

    return roadGroup;
}

// Para Car y Truck, la complejidad es mayor debido a las texturas y la forma.
// Tendrías que crear los meshes como elementos de A-Frame o cargar modelos 3D.
// Aquí un concepto muy simplificado de un Car:
function createCar(initialTileIndex, direction, color) {
    const carGroup = document.createElement('a-entity');
    carGroup.setAttribute('position', `${initialTileIndex * tileSize} 0.5 0`); // Altura del auto
    if (!direction) carGroup.setAttribute('rotation', '0 180 0'); // Rotar 180 grados en Y

    const mainBody = document.createElement('a-box');
    mainBody.setAttribute('color', color);
    mainBody.setAttribute('width', '1.5'); // Adaptar tamaños
    mainBody.setAttribute('height', '0.4');
    mainBody.setAttribute('depth', '0.7');
    mainBody.setAttribute('position', '0 0.2 0');
    mainBody.setAttribute('shadow', 'cast: true; receive: true');
    carGroup.appendChild(mainBody);

    // La cabina y ruedas serían entidades separadas dentro de carGroup

    return carGroup;
}

function addRows() {
    const newMetadata = generateRows(20);

    const startIndex = metadata.length;
    metadata.push(...newMetadata);

    newMetadata.forEach((rowData, index) => {
        const rowIndex = startIndex + index + 1; // Ajustar para que las filas se generen hacia adelante

        let rowEl;
        if (rowData.type === "forest") {
            rowEl = createGrass(rowIndex);
            rowData.trees.forEach(({ tileIndex, height }) => {
                const treeEl = createTree(tileIndex, height);
                rowEl.appendChild(treeEl);
            });
            gameMapEl.appendChild(rowEl);
        } else if (rowData.type === "car") {
            rowEl = createRoad(rowIndex);
            rowData.vehicles.forEach((vehicle) => {
                const carEl = createCar(vehicle.initialTileIndex, rowData.direction, vehicle.color);
                vehicle.ref = carEl; // Guardar referencia al elemento Three.js del auto
                rowEl.appendChild(carEl);
            });
            gameMapEl.appendChild(rowEl);
        } else if (rowData.type === "truck") {
             rowEl = createRoad(rowIndex);
            rowData.vehicles.forEach((vehicle) => {
                // Aquí deberías crear el camión, similar al auto pero con más partes
                const truckEl = createCar(vehicle.initialTileIndex, rowData.direction, vehicle.color); // Usando car por simplicidad
                vehicle.ref = truckEl;
                rowEl.appendChild(truckEl);
            });
            gameMapEl.appendChild(rowEl);
        }
    });
}

// Las funciones de generación de metadata son reutilizables tal cual
function randomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
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

function generateForesMetadata() {
    const occupiedTiles = new Set();
    const trees = Array.from({ length: 4 }, () => {
        let tileIndex;
        do {
            tileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex);
        } while (occupiedTiles.has(tileIndex));
        occupiedTiles.add(tileIndex);

        const height = randomElement([20, 45, 60]); // Esto es en Three.js units, adaptar para A-Frame
        return { tileIndex, height };
    });
    return { type: "forest", trees };
}

function generateCarLaneMetadata() {
    const direction = randomElement([true, false]);
    const speed = randomElement([1, 1.25, 1.5]); // Velocidad en m/s (adaptada para VR)

    const occupiedTiles = new Set();
    const vehicles = Array.from({ length: 3 }, () => {
        let initialTileIndex;
        do {
            initialTileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex);
        } while (occupiedTiles.has(initialTileIndex) || occupiedTiles.has(initialTileIndex - 1) || occupiedTiles.has(initialTileIndex + 1));
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
    const speed = randomElement([0.8, 1, 1.2]); // Velocidad en m/s (adaptada para VR)

    const occupiedTiles = new Set();
    const vehicles = Array.from({ length: 2 }, () => {
        let initialTileIndex;
        do {
            initialTileIndex = THREE.MathUtils.randInt(minTileIndex, maxTileIndex);
        } while (occupiedTiles.has(initialTileIndex) || occupiedTiles.has(initialTileIndex - 1) || occupiedTiles.has(initialTileIndex + 1) || occupiedTiles.has(initialTileIndex - 2) || occupiedTiles.has(initialTileIndex + 2));
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
        finalPosition.rowIndex < 0 || // No permitir ir hacia atrás del punto de inicio
        finalPosition.tileIndex < minTileIndex ||
        finalPosition.tileIndex > maxTileIndex
    ) {
        return false;
    }

    const finalRow = metadata[finalPosition.rowIndex - 1]; // Ajuste por índice de metadata
    if (
        finalRow &&
        finalRow.type === "forest" &&
        finalRow.trees.some((tree) => tree.tileIndex === finalPosition.tileIndex)
    ) {
        return false;
    }
    return true;
}

// Animar vehículos (esto iría en el tick de A-Frame o en un componente)
AFRAME.registerComponent('vehicle-animator', {
    tick: function (time, deltaTime) {
        if (!this.lastTime) {
            this.lastTime = time;
            return;
        }
        const delta = (time - this.lastTime) / 1000; // Delta en segundos
        this.lastTime = time;

        metadata.forEach((rowData) => {
            if (rowData.type === "car" || rowData.type === "truck") {
                const beginningOfRow = (minTileIndex - 2) * tileSize;
                const endOfRow = (maxTileIndex + 2) * tileSize;

                rowData.vehicles.forEach(({ ref }) => {
                    if (!ref || !ref.object3D) return; // Asegurarse de que el elemento existe y tiene un objeto 3D

                    let currentX = ref.object3D.position.x;

                    if (rowData.direction) { // True = derecha
                        currentX += rowData.speed * delta;
                        if (currentX > endOfRow) {
                            currentX = beginningOfRow;
                        }
                    } else { // False = izquierda
                        currentX -= rowData.speed * delta;
                        if (currentX < beginningOfRow) {
                            currentX = endOfRow;
                        }
                    }
                    ref.object3D.position.x = currentX;
                });
            }
        });
    }
});

gameMapEl.setAttribute('vehicle-animator', ''); // Asignar el animador al mapa

// Hit Test (requiere un componente de detección de colisiones de A-Frame o manual)
AFRAME.registerComponent('hit-detector', {
    tick: function () {
        const playerBox = new THREE.Box3().setFromObject(playerEl.object3D);

        const row = metadata[position.currentRow - 1]; // Fila actual
        if (!row || (row.type !== 'car' && row.type !== 'truck')) return;

        row.vehicles.forEach(({ ref }) => {
            if (!ref || !ref.object3D) return;

            const vehicleBox = new THREE.Box3().setFromObject(ref.object3D);

            if (playerBox.intersectsBox(vehicleBox)) {
                console.log("¡Colisión!");
                // Aquí, en un juego real, activarías la pantalla de Game Over en VR
                // Por ahora, solo loguea y reinicia (o muestra un mensaje de texto 3D)
                // alert(`Game Over! Score: ${position.currentRow}`);
                // Si quieres un UI 3D:
                // const resultContainerEl = document.querySelector('#result-container-vr');
                // if (resultContainerEl) resultContainerEl.setAttribute('visible', 'true');
                // const finalScoreText = document.querySelector('#final-score-vr');
                // if (finalScoreText) finalScoreText.setAttribute('value', `Your score: ${position.currentRow}`);

                // Reiniciar el juego
                setTimeout(() => initializeGame(), 1000); // Pequeño retraso
            }
        });
    }
});

rigEl.setAttribute('hit-detector', ''); // Asignar el detector de colisiones al rig

// --- Event Listeners para el movimiento (adaptados para VR) ---

// Para el Meta Quest 3, la interacción principal vendría de los controladores o el hand tracking.
// Aquí te dejo una simulación con un "click" en el ratón que dispara el movimiento del jugador.
// En un entorno real de Quest, usarías eventos de 'triggerdown' de los `laser-controls` o `oculus-touch-controls`.

document.getElementById('player-camera').addEventListener('click', function (evt) {
    // Esto es muy simplificado: simula un click en el mundo para mover hacia adelante
    // En un juego real, tendrías botones 3D o input del controlador.
    const forwardBtn = document.querySelector('a-plane[position="0 1 -2"] a-box.collidable');
    if (evt.target === forwardBtn) {
        rigEl.emit('player-move', { direction: "forward" });
    }
    // Añade lógica para otros botones si los creas
});

// También puedes mapear teclas para pruebas en desktop, pero no para VR final
window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp") {
        event.preventDefault();
        rigEl.emit('player-move', { direction: "forward" });
    } else if (event.key === "ArrowDown") {
        event.preventDefault();
        rigEl.emit('player-move', { direction: "backward" });
    } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        rigEl.emit('player-move', { direction: "left" });
    } else if (event.key === "ArrowRight") {
        event.preventDefault();
        rigEl.emit('player-move', { direction: "right" });
    }
});

// Iniciar el juego
document.querySelector('a-scene').addEventListener('loaded', function () {
    initializeGame();
});

// Música de fondo (si el navegador lo permite sin interacción del usuario)
document.addEventListener('DOMContentLoaded', () => {
    const backgroundMusic = document.getElementById('backgroundMusic');
    if (backgroundMusic) {
        // La reproducción automática a menudo requiere una interacción del usuario primero
        // Podrías tener un botón "Start Game" en VR que también inicie la música.
        backgroundMusic.volume = 0.3; // Ajusta el volumen
        backgroundMusic.play().catch(e => console.log("Música no pudo reproducirse automáticamente:", e));
    }
});
