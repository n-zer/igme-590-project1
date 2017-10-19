// ---------- Commands ---------- //

// Organized by type
const commandsByType = {
  move: {
    MOVE_FORWARD: "MOVE_FORWARD",
    MOVE_LEFT: "MOVE_LEFT",
    MOVE_BACKWARD: "MOVE_BACKWARD",
    MOVE_RIGHT: "MOVE_RIGHT",
    ROTATE_CW: "ROTATE_CW",
    ROTATE_CCW: "ROTATE_CCW"
  } 
};

// Dictionary of all commands, populated at run-time
const commands = {};

// Dictionary with commands as keys and types as values, populated at run-time
const commandTypes = {};

// Population
for(const type in commandsByType){
  for(const command in commandsByType[type]){
    commandTypes[command] = type;
    commands[command] = commandsByType[type][command];
  }
}

// Translates keyboard keys to commands
const keyToCommand = {
  w: commands.MOVE_FORWARD,
  a: commands.ROTATE_CCW,
  s: commands.MOVE_BACKWARD,
  d: commands.ROTATE_CW
};

// ---------- Utilities ---------- //

// Insertion sort in ascending order, checks from back to front
// valueFunc is used to fetch the value to be compared, in case the item is an object
const sortInsertionFromBack = (arr, newItem, valueFunc) => {
  if(arr.length === 0) {
    arr.push(newItem);
    return 0;
  }
  for(let n = arr.length - 1; n>=0; n--){
    if(valueFunc(newItem) >= valueFunc(arr[n])){
      arr.splice(n + 1, 0, newItem);
      return n + 1;
    }
  }
  arr.splice(0, 0, newItem);
  return 0;
};

// Same as above, but only finds the index at which the new item would be inserted
// evalFunc must return the value directly from a closure
const searchFromBack = (arr, evalFunc) => {
  for(let n = arr.length - 1; n >= 0; n--) {
    if(evalFunc(arr[n]))
      return n;
  }
  return undefined;
};

const lerp = (from, to, percent) => {
  return (from * (1.0 - percent)) + (to * percent);
};

// Translates an arbitrary orientation into the range of -180 to 180
const correctOrientation = (orientation) => {
  while (orientation > 180)
    orientation -= 360;
  while (orientation < -180)
    orientation += 360;

  return orientation;
};

const toRadians = (angle) => {
  return angle * (Math.PI / 180);
}

// Rotates (x, y) angle degrees around (cx, cy)
// http://stackoverflow.com/questions/17410809/how-to-calculate-rotation-in-2d-in-javascript
const rotate = (cx, cy, x, y, angle) => {
  var radians = toRadians(angle),
    cos = Math.cos(radians),
    sin = Math.sin(radians),
    nx = (cos * (x - cx)) + (sin * (y - cy)) + cx,
    ny = (cos * (y - cy)) - (sin * (x - cx)) + cy;
  return [nx, ny];
};

// Multi-line text helper for canvas
// https://stackoverflow.com/questions/5026961/html5-canvas-ctx-filltext-wont-do-line-breaks/21574562#21574562
const fillTextMultiLine = (ctx, text, x, y) => {
  var lineHeight = ctx.measureText("M").width * 1.2;
  var lines = text.split("\n");
  for (var i = lines.length - 1; i >= 0; --i) {
    ctx.fillText(lines[i], x, y);
    y -= lineHeight;
  }
};

// Converts the point (xw, yw) in world coordinates to camera space for the given camera
// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/utilities.js
const worldPointToCameraSpace = (xw,yw, camera) => {
  var cameraToPointVector = [(xw - camera.x) * camera.zoom, (yw - camera.y) * camera.zoom];
  var rotatedVector = rotate(0, 0, cameraToPointVector[0], cameraToPointVector[1], camera.rotation);
  return [camera.width / 2 + rotatedVector[0], camera.height / 2 + rotatedVector[1]];
};

const clearObject = (obj) => {
  Object.keys(obj).forEach(k => delete obj[k])
};

// ---------- Constants ---------- //

const MOVE_SPEED = 1000; // Forward/backward movespeed in pixels per second
const ROTATION_SPEED_DG = 180; // Rotation speed in degrees per second
const MESSAGE_DURATION_MS = 5000; // Duration after which messages will fade, in milliseconds
const COMMANDS_PER_SNAPSHOT = 10; // A new snapshot will be generated after this number of commands


// ---------- Classes ----------//

// Zoomable camera attached to a canvas
class Camera {
  constructor(canvas) {
    this.x = 0;
    this.y = 0;
    this.rotation = 0;
    this.zoom = 1;
    this.minZoom = .0001;
    this.maxZoom = 5;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  get width() {
    return this.canvas.width;
  }

  get height() {
    return this.canvas.height;
  }
}

// Information about a single command
class CommandInfo {
  constructor(command, state) {
    this.command = command; // A member of the commands object
    this.time = Date.now(); // Time at which the command was given
    this.type = commandTypes[command]; // A member of the commandsByType object
    this.state = state; // True for the start of the command (press), false for the end (release)
  }
}

// A delta that can be applied to a WorldState, created by integrating a PhysicsState over a period of time (dT)
class LocalDeltaState {
  constructor(dT, physicsState) {
    this.rotation = correctOrientation(physicsState.rotational * dT);
    if(this.rotation != 0) {
      this.x = -(-physicsState.medial*Math.cos(toRadians(this.rotation)) + physicsState.medial)/toRadians(physicsState.rotational);
      this.y = physicsState.medial*Math.sin(toRadians(this.rotation))/toRadians(physicsState.rotational);
    }
    else {
      this.x = 0;
      this.y = physicsState.medial * dT;
    }
  }
}

// Describes an object's instantaneous (i.e. velocities) motion in its local coordinate system
// Inferred from an InputState
class PhysicsState {
  constructor(inputState){
    this.medial = inputState[commands.MOVE_FORWARD] * -MOVE_SPEED + inputState[commands.MOVE_BACKWARD] * MOVE_SPEED; // Forward/backward
    this.lateral = 0; // Left/right (I'm ignoring this because I haven't figured out the math for it yet)
    this.rotational = inputState[commands.ROTATE_CW] * ROTATION_SPEED_DG + inputState[commands.ROTATE_CCW] * -ROTATION_SPEED_DG;
  }
}

// Describes the state of any commands that may be acting on the object
class InputState {
  constructor(forward, backward, cw, ccw) {
    this[commands.MOVE_FORWARD] = forward;
    this[commands.MOVE_BACKWARD] = backward;
    this[commands.ROTATE_CW] = cw;
    this[commands.ROTATE_CCW] = ccw;
  }

  // Returns a copy of this InputState with the given command applied to it
  applyCommandInfo(commandInfo) {
    const newObj = InputState.copyConstruct(this);
    newObj[commandInfo.command] = commandInfo.state;
    return newObj;
  }

  // Returns a shallow copy of the given object
  static copyConstruct(other) {
    return Object.assign(Object.create(Object.getPrototypeOf(other)), other);
  }
}

// Represents an object's positional data in the world coordinate space
class WorldState {
  constructor(x, y, orientation) {
    this.x = x;
    this.y = y;
    this.orientation = orientation;
  }

  // Returns a copy of this WorldState with the given LocalDeltaState applied to it
  applyDeltaState(deltaState) {
    let rotatedDisplacement = rotate(0, 0, deltaState.x, deltaState.y, -this.orientation);
    let newOrientation = correctOrientation(this.orientation + deltaState.rotation);
    return new WorldState(this.x + rotatedDisplacement[0], this.y + rotatedDisplacement[1], newOrientation);
  }
}

// A collection of all the state data needed to render an object at or beyond a particular point in time
class Snapshot {
  constructor(worldState, inputState, time, color) {
    this.worldState = worldState;
    this.inputState = inputState;
    this.time = time;
    this.color = color;
  }

  // Creates a snapshot from a shallow copy of a snapshot without the correct prototype information
  // This is necessary because socket.io strips prototype data when sending things across the network,
  // and we need to send snapshots across the network
  static createFromObject(ssObject) {
    return new Snapshot(
      Object.assign(Object.create(WorldState.prototype), ssObject.worldState), 
      Object.assign(Object.create(InputState.prototype), ssObject.inputState), 
      ssObject.time, 
      ssObject.color
    );
  }
}

// A running log of snapshots and commands for a particular object that can be used to render the object at any point in time
class CommandLog {
  constructor() {
    this.snapshots = [];
    this.indexOffsets = {};
    this.MAX_SNAPSHOTS = 20;
    this.MAX_SNAPSHOT_OVERFLOW = 5;

    // Create a command bucket for each type of command
    for(const type in commandsByType){
      this[type] = [];
      this.indexOffsets[type] = 0;
    }
  }

  // Inserts a command into the command log
  insertCommand(commandInfo){
    sortInsertionFromBack(this[commandInfo.type], commandInfo, (ci) => ci.time);
  }

  // Inserts a snapshot into the command log
  insertSnapshot(snapshot) {
    // Insert from back
    const index = sortInsertionFromBack(this.snapshots, snapshot, (ss) => ss.time);

    snapshot.bucketIndices = {};

    // Find indices into command buckets
    if(index === 0) { // For the first snapshot
      for(const type in commandsByType)
        snapshot.bucketIndices[type] = 0;
    }
    else { // For subsequent snapshots
      const previousSnapshot = this.snapshots[index - 1];
      for(const type in previousSnapshot.bucketIndices) {
        let n = previousSnapshot.bucketIndices[type];

        // Find index of first command younger than the snapshot
        for(; n - this.indexOffsets[type] < this[type].length && this[type][n - this.indexOffsets[type]].time < snapshot.time; n++) ;

        // That index will be the first one we use when integrating
        snapshot.bucketIndices[type] = n;
      }
    }

    // Prune snapshots
    if(this.snapshots.length > this.MAX_SNAPSHOTS + this.MAX_SNAPSHOT_OVERFLOW) {
      this.snapshots.splice(0, this.snapshots.length - this.MAX_SNAPSHOTS);

      const oldestSSTime = this.snapshots[0].time;

      // Prune commands
      for(const type in commandsByType) {
        let n = 0;

        // Find index of first command younger than the oldest snapshot
        for(; n < this[type].length && this[type][n].time < oldestSSTime; n++) ;

        // Remove all commands before that one
        this[type].splice(0, n);
        //console.log(`Pruned ${n} commands of type ${type}, ${this[type].length} remain`);

        this.indexOffsets[type] += n;
      }
    }
  }

  // Uses the command log to generate a snapshot of the object at the given time
  integrateIntoSnapshot(desiredTime) {
    const snapshotIndex = searchFromBack(this.snapshots, (ss) => ss.time < desiredTime);
    if(snapshotIndex === undefined)
      return undefined;
    const initialSnapshot = this.snapshots[snapshotIndex];
    const bucket = this.move;
    const bucketIndex = initialSnapshot.bucketIndices.move - this.indexOffsets.move;
    const startTime = initialSnapshot.time;

    const initialInputState = initialSnapshot.inputState;
    const initialPhysicsState = new PhysicsState(initialInputState);
    const initialDT = ((bucket[bucketIndex]) ? bucket[bucketIndex].time - startTime : desiredTime - startTime) / 1000;
    let newWorldState = initialSnapshot.worldState.applyDeltaState(new LocalDeltaState(initialDT, initialPhysicsState));

    let previousInputState = initialInputState;

    for(let n = bucketIndex; n < bucket.length; n++) {
      const endTime = (bucket[n + 1] && bucket[n + 1].time < desiredTime) ? bucket[n + 1].time : desiredTime;
      const dT = (endTime - bucket[n].time) / 1000;
      const inputState = previousInputState.applyCommandInfo(bucket[n]);
      const physicsState = new PhysicsState(inputState);
      newWorldState = newWorldState.applyDeltaState(new LocalDeltaState(dT, physicsState));
      previousInputState = inputState;
    }

    return new Snapshot(newWorldState, previousInputState, desiredTime, initialSnapshot.color);
  }
}

// A running log of messages sent from a particular player
class MessageLog {
  constructor() {
    this.messages = [];
  }

  // Reduces the log to a newline-delimited string, pruning any messages that have expired
  getString(time) {
    let resultString = "";
    let pruneCount = 0;
    for(let n = 0; n < this.messages.length; n++) {
      if(this.messages[n].time + MESSAGE_DURATION_MS < time) {
        pruneCount = n + 1;
        continue;
      }
      resultString += `${this.messages[n].message}\n`;
    }
    this.messages.splice(0, pruneCount);
    return resultString;
  }

  // Inserts a message into the log
  insertMessage(message) {
    sortInsertionFromBack(this.messages, message, (m) => m.time);
  }
}

// ---------- Fields ---------- //

let startTime = 0;
let socket;
let canvas;
let context;
let inputBox; // For chat input
let camera; // We'll use separate cameras for the starfield background and the grid so we can simulate depth
let starCamera;
let gridCamera;
let myCommandLog;
let myMessageLog = new MessageLog();
const commandLogsByAvatar = {};
const messageLogsByAvatar = {};
const stars = { // Container for the starfield background objects. Populated at run-time
  objs:[], // From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/main.js
  colors:[
    'white',
    'yellow'
  ]
};
// Rendering information for the grid graphic
const grid = { // From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/main.js
  gridLines: 500, //number of grid lines
  gridSpacing: 20, //pixels per grid unit
  gridStart: [-5000, -5000], //corner anchor in world coordinates
  colors:[
    {
      color: '#1111FF',
      interval: 1000
    },
    {
      color: 'blue',
      interval: 200
    },
    {
      color: 'mediumblue',
      interval: 50,
      minimap: true
    },
    {
      color: 'darkblue',
      interval: 10
    },
    {
      color: 'navyblue',
      interval: 2
    }
  ]
};
// The verts for the ship polygon the players are represented by
const shipVertices = [ // From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/ships.js
  [-20, 17],
  [0, 7],
  [20, 17],
  [0, -23]
];
// Global state (eww)
let shouldSendSnapshot = false; // When true a snapshot will be sent through the socket on the next available frame
let commandCounter = 0; // Number of commands entered since the last snapshot was generated
let enteringText = false; // Whether the chat input is active

// ---------- Misc ---------- //

// Populates the starfield background container
// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/constructors.js
const generateStarField = (stars) => {
  const lower = -100000; // Lower x/y bound for stars
  const upper = 100000; // Upper x/y bound for stars
  const maxRadius = 100;
  const minRadius = 50;
  for(let c = 0; c < 500; c++){
    const group = Math.floor(Math.random() * stars.colors.length);
    stars.objs.push({
      x: Math.random() * (upper - lower) + lower,
      y: Math.random() * (upper - lower) + lower,
      radius: Math.random() * (maxRadius - minRadius) + minRadius,
      colorIndex: group
    });
  }
};

// Handler for keyboard input
const keyHandler = (state, e) => {
  // If the given key was a non-repeat press on Enter
  if(state === true && e.repeat === false && e.key === "Enter") {
    // Toggle the chat input
    if(!enteringText) {
      enteringText = true;
      inputBox.value = "";
      inputBox.style.display = 'inline-block';
      inputBox.focus();
    }
    else {
      enteringText = false;
      inputBox.blur();
      inputBox.style.display = 'none';
      const message = inputBox.value;
      if(message) {
        socket.emit('message', message);
        myMessageLog.insertMessage({message: message, time: Date.now()});
      }
      inputBox.value = "";
    }
    return;
  }

  // If it wasn't enter, is a valid command, and isn't a repeat
  const command = keyToCommand[e.key];
  if(!enteringText && command && e.repeat === false) {
    const commandInfo = new CommandInfo(command, state)
    myCommandLog.insertCommand(commandInfo);
    socket.emit('commandInfo', commandInfo);
    commandCounter++;
    if(commandCounter >= COMMANDS_PER_SNAPSHOT) {
      commandCounter = 0;
      shouldSendSnapshot = true;
    }
  }
};

// ---------- Drawing ---------- //

// Renders a player avatar from the given snapshot in the given camera
const drawAvatar = (snapshot, camera) => {
  const avatarPositionInCameraSpace = worldPointToCameraSpace(snapshot.worldState.x, snapshot.worldState.y, camera);
  const ctx = camera.ctx;

  ctx.save();
  ctx.translate(avatarPositionInCameraSpace[0], avatarPositionInCameraSpace[1]);
  ctx.rotate((snapshot.worldState.orientation - camera.rotation) * (Math.PI / 180));
  ctx.scale(camera.zoom, camera.zoom);

  ctx.beginPath();
  ctx.moveTo(shipVertices[0][0], shipVertices[0][1]);
  for(let c = 1; c < shipVertices.length; c++)
  {
    const vert = shipVertices[c];
    ctx.lineTo(vert[0], vert[1]);
  }
  ctx.closePath();
  ctx.fillStyle = snapshot.color;
  ctx.fill();
  ctx.restore();
};

// Draw a line from the snapshot's location in camera space to the snapshot's location on the grid
const drawProjectionLines = (snapshot, camera, gridCamera) => {
  const ctx = camera.ctx;    
  const positionInCameraSpace = worldPointToCameraSpace(snapshot.worldState.x, snapshot.worldState.y, camera); //get ship's position in camera space
  const positionInGridCameraSpace = worldPointToCameraSpace(snapshot.worldState.x, snapshot.worldState.y, gridCamera);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(positionInCameraSpace[0], positionInCameraSpace[1]);
  ctx.lineTo(positionInGridCameraSpace[0], positionInGridCameraSpace[1]);
  ctx.arc(positionInGridCameraSpace[0], positionInGridCameraSpace[1], 15 * gridCamera.zoom, 0, Math.PI * 2);
  ctx.strokeStyle = 'grey';
  ctx.lineWidth = .5;
  ctx.globalAlpha = .5;
  ctx.stroke();
  ctx.restore();  
};

// Draws the starfield background. A bit weirdly structured for performance reasons 
// (rendering a couple hundred circles every frame is surprisingly expensive)
// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/drawing.js
const drawStars = (stars, camera) => {
  const start = [0, 0];
  const end = [camera.width, camera.height];
  const ctx = camera.ctx;
  for(var group = 0; group < stars.colors.length; group++){
    ctx.save()
    ctx.fillStyle = stars.colors[group];
    ctx.beginPath();
    for(let c = 0; c < stars.objs.length; c++){
      const star = stars.objs[c];
      if(star.colorIndex != group)
        continue;

      const finalPosition = worldPointToCameraSpace(star.x, star.y, camera); //get star's position in camera space
      
      if(finalPosition[0] + star.radius * camera.zoom < start[0] 
        || finalPosition[0] - star.radius * camera.zoom > end[0] 
        || finalPosition[1] + star.radius * camera.zoom < start[1] 
        || finalPosition[1] - star.radius * camera.zoom > end[1])
        continue;
      ctx.moveTo(finalPosition[0], finalPosition[1]);
      ctx.arc(finalPosition[0], finalPosition[1], star.radius * camera.zoom, 0, Math.PI * 2);
    };
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
};

// Draws the grid graphic. This could use some improving, but whatever
// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/drawing.js
const drawGrid = (grid, camera) => {
  const ctx = camera.ctx;
  const gridLines = grid.gridLines;
  const gridSpacing = grid.gridSpacing;
  const gridStart = grid.gridStart;

  for(let c = 0; c < grid.colors.length; c++){ 
    ctx.save();
    ctx.beginPath();
    for(let x = 0; x <= gridLines; x++){
      if(x % grid.colors[c].interval != 0)
          continue;
      let correctInterval = true;
      for(let n = 0; n < c; n++)
      {
        if(x % grid.colors[n].interval == 0)
        {
          correctInterval = false;
          break;
        }
      }
      if(correctInterval != true)
        continue;

      //define start and end points for current line in world space
      let start = [gridStart[0] + x * gridSpacing, gridStart[1]];
      let end = [start[0], gridStart[1] + gridLines * gridSpacing];

      //convert to camera space
      start = worldPointToCameraSpace(start[0], start[1], camera);
      end = worldPointToCameraSpace(end[0], end[1], camera);      
      ctx.moveTo(start[0], start[1]);
      ctx.lineTo(end[0], end[1]);
    }
    for(let y = 0; y <= gridLines; y++){
      if(y % grid.colors[c].interval != 0)
          continue;
      let correctInterval = true;
      for(let n = 0; n < c; n++)
      {
        if(y % grid.colors[n].interval == 0)
        {
          correctInterval = false;
          break;
        }
      }
      if(correctInterval!=true)
        continue;

      //same as above, but perpendicular
      let start = [gridStart[0], gridStart[0] + y * gridSpacing];
      let end = [gridStart[0] + gridLines * gridSpacing, start[1]];
      start = worldPointToCameraSpace(start[0], start[1], camera);
      end = worldPointToCameraSpace(end[0], end[1], camera);
      ctx.moveTo(start[0], start[1]);
      ctx.lineTo(end[0], end[1]);
    }

    //draw all lines, stroke last
    ctx.globalAlpha = .3;
    ctx.strokeWidth = 5;
    ctx.strokeStyle = grid.colors[c].color;
    ctx.stroke();
    ctx.restore();
  }
};

// Draws message text of the given message log at the given snapshot location in the given camera
const drawMessages = (snapshot, messageLog, camera) => {
  const snapshotPositionInCameraSpace = worldPointToCameraSpace(snapshot.worldState.x, snapshot.worldState.y, camera);
  const messageString = messageLog.getString(snapshot.time);

  if(messageString) {
    const ctx = camera.ctx;

    ctx.save()
    ctx.font = "20px Arial";
    ctx.fillStyle = snapshot.color;
    ctx.textAlign = "center";
    fillTextMultiLine(camera.ctx, messageString, snapshotPositionInCameraSpace[0], snapshotPositionInCameraSpace[1] - 50);
    ctx.restore();
  }
};

// Draws the tutorial text to the given camera
const drawTutorial = (camera) => {
  const ctx = camera.ctx;

  ctx.save();
  ctx.fillStyle = "white";
  ctx.font = "30px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Use WASD to move around", camera.width * 0.1, camera.height * .25);
  ctx.fillText("Press Enter to chat", camera.width * 0.1, camera.height * .35);
  ctx.restore();
};

// Moves the dependent camera to the location and orientation of the main 
// camera, but with the given Z-offset to simulate depth
const linkCameraWithOffset = (mainCamera, dependentCamera, offset) => {
  dependentCamera.x = mainCamera.x;
  dependentCamera.y = mainCamera.y;
  dependentCamera.rotation = mainCamera.rotation;
  const cameraDistance = 1/mainCamera.zoom;
  dependentCamera.zoom = 1/(cameraDistance+offset);
};

// Renders a frame at the current time
const frameLoop = () => {
  context.fillStyle = 'black';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const currentTime = Date.now();

  drawStars(stars, starCamera);
  drawGrid(grid, gridCamera);

  if(myCommandLog){
    const snapshot = myCommandLog.integrateIntoSnapshot(currentTime);
    camera.x = lerp(camera.x, snapshot.worldState.x, MOVE_SPEED / 10000);
    camera.y = lerp(camera.y, snapshot.worldState.y, MOVE_SPEED / 10000);
    var rotDiff = correctOrientation(snapshot.worldState.orientation - camera.rotation);
    camera.rotation = correctOrientation(camera.rotation + lerp(0, rotDiff, ROTATION_SPEED_DG / 5000));

    linkCameraWithOffset(camera, starCamera, 100);
    linkCameraWithOffset(camera, gridCamera, 1);

    const integratedSnapshots = [];
    const messageLogs = [];
    for(const id in commandLogsByAvatar){
      integratedSnapshots.push(commandLogsByAvatar[id].integrateIntoSnapshot(currentTime));
      messageLogs.push(messageLogsByAvatar[id]);
    }
    drawProjectionLines(snapshot, camera, gridCamera);
    for(const index in integratedSnapshots) {
      drawProjectionLines(integratedSnapshots[index], camera, gridCamera);
    }
    for(const index in integratedSnapshots) {
      drawAvatar(integratedSnapshots[index], camera);
    }
    drawAvatar(snapshot, camera);
    for(const index in messageLogs) {
      if(messageLogs[index])
        drawMessages(integratedSnapshots[index], messageLogs[index], camera);
    }
    drawMessages(snapshot, myMessageLog, camera);

    if(currentTime - startTime < 20000)
      drawTutorial(camera);

    if(shouldSendSnapshot) {
      myCommandLog.insertSnapshot(snapshot);
      socket.emit('snapshot', snapshot);
      shouldSendSnapshot = false;
    }
  }

  window.requestAnimationFrame(frameLoop);
};

// ---------- Init ---------- //

// Called on window load
const init = () => {
  socket = io.connect();

  canvas = document.querySelector('#mainCanvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
  context = canvas.getContext('2d');

  inputBox = document.querySelector("#inputBox");

  camera = new Camera(canvas);
  starCamera = new Camera(canvas);
  gridCamera = new Camera(canvas);

  generateStarField(stars);

  // ---------- Network protocol ---------- //

  // On receiving a command from another player
  socket.on('commandInfo', (data) => {
    if(!commandLogsByAvatar[data.id])
      commandLogsByAvatar[data.id] = new CommandLog();
    commandLogsByAvatar[data.id].insertCommand(data);
  });

  // On receiving a snapshot from another player
  socket.on('snapshot', (data) => {
    if(!commandLogsByAvatar[data.id])
      commandLogsByAvatar[data.id] = new CommandLog();
    commandLogsByAvatar[data.id].insertSnapshot(Snapshot.createFromObject(data));
  });

  // On receiving initial positioning data from the server, either for us or another player
  socket.on('initial', (data) => {
    if(data.id){ // If it has ID it's not ours
      shouldSendSnapshot = true; // We need to send a snapshot when a new user connects so they can start rendering us
      commandLogsByAvatar[data.id] = new CommandLog();
      commandLogsByAvatar[data.id].insertSnapshot(new Snapshot(new WorldState(data.x, data.y, data.rotation), new InputState(false, false, false, false), data.time, data.color));
    }
    else {
      myCommandLog = new CommandLog();
      myCommandLog.insertSnapshot(new Snapshot(new WorldState(data.x, data.y, data.rotation), new InputState(false, false, false, false), data.time, data.color));
      startTime = Date.now();
    }
  });

  // On receiving a chat message from another player
  socket.on('message', (data) => {
    if(!messageLogsByAvatar[data.id])
      messageLogsByAvatar[data.id] = new MessageLog();
    data.time = Date.now();
    messageLogsByAvatar[data.id].insertMessage(data);
  });

  // On another player disconnecting
  socket.on('terminate', (data) => {
    delete commandLogsByAvatar[data.id];
    delete messageLogsByAvatar[data.id];
  });

  // On us disconnecting
  socket.on('disconnect', () => {
    clearObject(commandLogsByAvatar);
    clearObject(messageLogsByAvatar);
  });

  window.addEventListener('keydown', keyHandler.bind(null, true));
  window.addEventListener('keyup', keyHandler.bind(null, false));

  window.requestAnimationFrame(frameLoop);
};

window.onload = init;
