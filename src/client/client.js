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

const commands = {};
const commandTypes = {};
for(const type in commandsByType){
  for(const command in commandsByType[type]){
    commandTypes[command] = type;
    commands[command] = commandsByType[type][command];
  }
}

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

const searchFromBack = (arr, evalFunc) => {
  for(let n = arr.length - 1; n >= 0; n--) {
    if(evalFunc(arr[n]))
      return n;
  }
  return undefined;
};

class CommandInfo {
  constructor(command, state) {
    this.command = command;
    this.time = Date.now();
    this.type = commandTypes[command];
    this.state = state;
  }
}

const MOVE_SPEED = 100;
const ROTATION_SPEED_DG = 90;

const toRadians = (angle) => {
  return angle * (Math.PI / 180);
}

// http://stackoverflow.com/questions/17410809/how-to-calculate-rotation-in-2d-in-javascript
const rotate = (cx, cy, x, y, angle) => {
  var radians = toRadians(angle),
    cos = Math.cos(radians),
    sin = Math.sin(radians),
    nx = (cos * (x - cx)) + (sin * (y - cy)) + cx,
    ny = (cos * (y - cy)) - (sin * (x - cx)) + cy;
  return [nx, ny];
};

class LocalDeltaState {
  constructor(dT, physicsState) {
    this.rotation = physicsState.rotational * dT;
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

class PhysicsState {
  constructor(inputState){
    this.medial = inputState[commands.MOVE_FORWARD] * -MOVE_SPEED + inputState[commands.MOVE_BACKWARD] * MOVE_SPEED;
    this.lateral = 0;
    this.rotational = inputState[commands.ROTATE_CW] * ROTATION_SPEED_DG + inputState[commands.ROTATE_CCW] * -ROTATION_SPEED_DG;
  }
}

class InputState {
  constructor(forward, backward, cw, ccw) {
    this[commands.MOVE_FORWARD] = forward;
    this[commands.MOVE_BACKWARD] = backward;
    this[commands.ROTATE_CW] = cw;
    this[commands.ROTATE_CCW] = ccw;
  }

  applyCommandInfo(commandInfo) {
    const newObj = InputState.copyConstruct(this);
    newObj[commandInfo.command] = commandInfo.state;
    return newObj;
  }

  static copyConstruct(other) {
    return Object.assign(Object.create(Object.getPrototypeOf(other)), other);
  }
}

class WorldState {
  constructor(x, y, orientation) {
    this.x = x;
    this.y = y;
    this.orientation = orientation;
  }

  applyDeltaState(deltaState) {
    let rotatedDisplacement = rotate(0, 0, deltaState.x, deltaState.y, -this.orientation);
    return new WorldState(this.x + rotatedDisplacement[0], this.y + rotatedDisplacement[1], this.orientation + deltaState.rotation);
  }
}

class Snapshot {
  constructor(worldState, inputState, time, color) {
    this.worldState = worldState;
    this.inputState = inputState;
    this.time = time;
    this.color = color;
  }

  static createFromObject(ssObject) {
    return new Snapshot(
      Object.assign(Object.create(WorldState.prototype), ssObject.worldState), 
      Object.assign(Object.create(InputState.prototype), ssObject.inputState), 
      ssObject.time, 
      ssObject.color
    );
  }
}

class CommandLog {
  constructor() {
    this.snapshots = [];
    this.indexOffsets = {};
    this.MAX_SNAPSHOTS = 20;
    this.MAX_SNAPSHOT_OVERFLOW = 5;
    for(const type in commandsByType){
      this[type] = [];
      this.indexOffsets[type] = 0;
    }
  }

  insertCommand(commandInfo){
    sortInsertionFromBack(this[commandInfo.type], commandInfo, (ci) => ci.time);
  }

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
      //console.log(`Pruned snapshots, ${this.snapshots.length} remain`);
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
}

let socket;
let canvas;
let context;
let camera;
let myCommandLog;
const commandLogsByAvatar = {};

// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/utilities.js
const worldPointToCameraSpace = (xw,yw, camera) => {
  var cameraToPointVector = [(xw-camera.x)*camera.zoom,(yw-camera.y)*camera.zoom];
  var rotatedVector = rotate(0,0,cameraToPointVector[0],cameraToPointVector[1],camera.rotation);
  return [camera.width/2+rotatedVector[0],camera.height/2+rotatedVector[1]];
};

const keyToCommand = {
  w: commands.MOVE_FORWARD,
  a: commands.ROTATE_CCW,
  s: commands.MOVE_BACKWARD,
  d: commands.ROTATE_CW
};

const COMMANDS_PER_SNAPSHOT = 10;
let shouldSendSnapshot = false;
let commandCounter = 0;
const keyHandler = (state, e) => {
  const command = keyToCommand[e.key];
  if(command && e.repeat == false) {
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

const integrateCommandLogIntoSnapshot = (currentTime, commandLog) => {
  const snapshotIndex = searchFromBack(commandLog.snapshots, (ss) => ss.time < currentTime);
  if(snapshotIndex === undefined)
    return undefined;
  const initialSnapshot = commandLog.snapshots[snapshotIndex];
  const bucket = commandLog.move;
  const bucketIndex = initialSnapshot.bucketIndices.move - commandLog.indexOffsets.move;
  const startTime = initialSnapshot.time;

  const initialInputState = initialSnapshot.inputState;
  const initialPhysicsState = new PhysicsState(initialInputState);
  const initialDT = ((bucket[bucketIndex]) ? bucket[bucketIndex].time - startTime : currentTime - startTime) / 1000;
  let newWorldState = initialSnapshot.worldState.applyDeltaState(new LocalDeltaState(initialDT, initialPhysicsState));

  let previousInputState = initialInputState;

  for(let n = bucketIndex; n < bucket.length; n++) {
    const endTime = (bucket[n + 1] && bucket[n + 1].time < currentTime) ? bucket[n + 1].time : currentTime;
    const dT = (endTime - bucket[n].time) / 1000;
    const inputState = previousInputState.applyCommandInfo(bucket[n]);
    const physicsState = new PhysicsState(inputState);
    newWorldState = newWorldState.applyDeltaState(new LocalDeltaState(dT, physicsState));
    previousInputState = inputState;
  }

  return new Snapshot(newWorldState, previousInputState, currentTime, initialSnapshot.color);
}

const drawAvatar = (snapshot, camera) => {
  const avatarPositionInCameraSpace = worldPointToCameraSpace(snapshot.worldState.x, snapshot.worldState.y, camera);
  const ctx = camera.ctx;

  ctx.save();
  ctx.translate(avatarPositionInCameraSpace[0], avatarPositionInCameraSpace[1]);
  ctx.rotate((snapshot.worldState.orientation - camera.rotation) * (Math.PI / 180));
  ctx.scale(camera.zoom, camera.zoom);
  ctx.fillStyle = snapshot.color;
  ctx.fillRect(-20,-20,40,40);
  ctx.restore();
};

const drawLoop = () => {
  context.clearRect(0, 0, canvas.width, canvas.height);
  const currentTime = Date.now();
  if(myCommandLog){
    const snapshot = integrateCommandLogIntoSnapshot(currentTime, myCommandLog);
    camera.x = snapshot.worldState.x;
    camera.y = snapshot.worldState.y;
    camera.rotation = snapshot.worldState.orientation;

    for(const id in commandLogsByAvatar){
      drawAvatar(integrateCommandLogIntoSnapshot(currentTime, commandLogsByAvatar[id]), camera);
    }
    drawAvatar(snapshot, camera);
    if(shouldSendSnapshot) {
      myCommandLog.insertSnapshot(snapshot);
      socket.emit('snapshot', snapshot);
      shouldSendSnapshot = false;
    }
  }

  window.requestAnimationFrame(drawLoop);
};

const init = () => {
  socket = io.connect();

  canvas = document.querySelector('#mainCanvas');
  context = canvas.getContext('2d');

  camera = {
    //position/rotation
    x:0,
    y:0,
    rotation:0,
    //scale value, basically
    zoom:1,
    minZoom:.0001,
    maxZoom:5,
    //screen dimensions
    width:canvas.width,
    height:canvas.height,
    ctx: context
  };

  socket.on('commandInfo', (data) => {
    //console.log(`Command ${data.command} ${data.state} from ${data.id}`);
    if(!commandLogsByAvatar[data.id])
      commandLogsByAvatar[data.id] = new CommandLog();
    commandLogsByAvatar[data.id].insertCommand(data);
  });

  socket.on('snapshot', (data) => {
    //console.log(`Snapshot for ${data.id} (${data.x}, ${data.y})`);
    if(!commandLogsByAvatar[data.id])
      commandLogsByAvatar[data.id] = new CommandLog();
    commandLogsByAvatar[data.id].insertSnapshot(Snapshot.createFromObject(data));
  });

  socket.on('initial', (data) => {
    if(data.id){
      shouldSendSnapshot = true; // We need to send a snapshot when a new user connects so they can start rendering us
      commandLogsByAvatar[data.id] = new CommandLog();
      commandLogsByAvatar[data.id].insertSnapshot(new Snapshot(new WorldState(data.x, data.y, data.rotation), new InputState(false, false, false, false), data.time, data.color));
    }
    else {
      myCommandLog = new CommandLog();

      //console.log(`our initial (${data.x}, ${data.y})`);
      myCommandLog.insertSnapshot(new Snapshot(new WorldState(data.x, data.y, data.rotation), new InputState(false, false, false, false), data.time, data.color));
    }
  });

  socket.on('terminate', (data) => {
    delete commandLogsByAvatar[data.id];
  });

  const clearObject = (obj) => {
    Object.keys(obj).forEach(k => delete obj[k])
  };

  socket.on('disconnect', () => {
    clearObject(commandLogsByAvatar);
  });

  socket.on('connect', () => {

  });

  window.addEventListener('keydown', keyHandler.bind(null, true));
  window.addEventListener('keyup', keyHandler.bind(null, false));

  window.requestAnimationFrame(drawLoop);
};

window.onload = init;
