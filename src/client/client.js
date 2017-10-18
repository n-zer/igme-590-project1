const commandsByType = {
  move: {
    MOVE_FORWARD: "MOVE_FORWARD",
    MOVE_LEFT: "MOVE_LEFT",
    MOVE_BACKWARD: "MOVE_BACKWARD",
    MOVE_RIGHT: "MOVE_RIGHT",
    ROTATE_CW: "ROTATE_CW",
    ROTATE_CCW: "ROTATE_CCW"
  },
  oneShot: {}  
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
  if(arr.length === 0)
    arr.push(newItem);
  for(let n = arr.length - 1; n>=0; n++){
    if(valueFunc(newItem) >= valueFunc(arr[n])){
      arr.splice(n + 1, 0, newItem);
      return;
    }
  }
  arr.splice(0, 0, newItem);
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
      this.y = (-physicsState.medial*Math.cos(toRadians(this.rotation)) + physicsState.medial)/toRadians(physicsState.rotational);
      this.x = physicsState.medial*Math.sin(toRadians(this.rotation))/toRadians(physicsState.rotational);
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

class CommandLog {
  constructor() {
    for(const type in commandsByType){
      this[type] = [];
    }
  }

  insert(commandInfo){
    sortInsertionFromBack(this[commandInfo.type], commandInfo, (ci) => ci.time);
  }
}

let socket;
let canvas;
let context;
let camera;
let myAvatarSnapshot;
let snapshotSendInterval;
let myCommandLog = new CommandLog();
const otherAvatarSnapshots = {};
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

const keyHandler = (state, e) => {
  console.log('input registered');
  const command = keyToCommand[e.key];
  if(command && e.repeat == false) {
    const commandInfo = new CommandInfo(command, state)
    myCommandLog.insert(commandInfo);
    console.log(`valid command ${command}`);
    socket.emit('commandInfo', commandInfo);
  }
};

// Assumes bucket doesn't contain any commands dated before startTime
const integrateMoveCommandBucketIntoLocalDelta = (startTime, currentTime, bucket, worldState) => {
  const initialInputState = new InputState(false, false, false, false);
  const initialPhysicsState = new PhysicsState(initialInputState);
  const initialDT = ((bucket.length) ? bucket[0].time - startTime : currentTime - startTime) / 1000;
  let newWorldState = worldState.applyDeltaState(new LocalDeltaState(initialDT, initialPhysicsState));

  let previousInputState = initialInputState;

  for(let n = 0; n < bucket.length; n++) {
    const endTime = (bucket[n + 1] && bucket[n + 1].time < currentTime) ? bucket[n + 1].time : currentTime;
    const dT = (endTime - bucket[n].time) / 1000;
    const inputState = previousInputState.applyCommandInfo(bucket[n]);
    const physicsState = new PhysicsState(inputState);
    newWorldState = newWorldState.applyDeltaState(new LocalDeltaState(dT, physicsState));
    previousInputState = inputState;
  }

  return newWorldState;
}

const integrateAvatar = (snapshot, commandLog) => {
  const currentTime = Date.now();

  const initialWorldState = new WorldState(snapshot.x, snapshot.y, snapshot.rotation);

  const newWorldState = integrateMoveCommandBucketIntoLocalDelta(snapshot.time, currentTime, commandLog.move, initialWorldState);

  return { x: newWorldState.x, y: newWorldState.y, rotation: newWorldState.orientation, color: snapshot.color };
};

const drawAvatar = (avatar, camera) => {
  const avatarPositionInCameraSpace = worldPointToCameraSpace(avatar.x, avatar.y, camera);
  const ctx = camera.ctx;

  ctx.save();
  ctx.translate(avatarPositionInCameraSpace[0], avatarPositionInCameraSpace[1]);
  ctx.rotate((avatar.rotation - camera.rotation) * (Math.PI / 180));
  ctx.scale(camera.zoom, camera.zoom);
  ctx.fillStyle = avatar.color;
  ctx.fillRect(-20,-20,40,40);
  ctx.restore();
};

const drawLoop = () => {
  context.clearRect(0, 0, canvas.width, canvas.height);
  if(myAvatarSnapshot){
    const myAvatar = integrateAvatar(myAvatarSnapshot, myCommandLog);
    camera.x = myAvatar.x;
    camera.y = myAvatar.y;
    camera.rotation = myAvatar.rotation;

    for(const id in otherAvatarSnapshots){
      drawAvatar(integrateAvatar(otherAvatarSnapshots[id], commandLogsByAvatar[id]), camera);
    }
    drawAvatar(myAvatar, camera);
  }

  window.requestAnimationFrame(drawLoop);
};

const receiveSnapshot = (data) => {
  // Someone else's
  if(data.id) {
    console.log(`Snapshot for ${data.id} (${data.x}, ${data.y})`);
    otherAvatarSnapshots[data.id] = data;
    if(!commandLogsByAvatar[data.id])
      commandLogsByAvatar[data.id] = new CommandLog();
  }
  // Ours
  else {
    console.log(`our snapshot (${data.x}, ${data.y})`);
    myAvatarSnapshot = data;

    snapshotSendInterval = setInterval(() => {socket.emit('snapshot', myAvatarSnapshot)}, 3000);
  }
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
    console.log(`Command ${data.command} ${data.state} from ${data.id}`);
    if(!commandLogsByAvatar[data.id])
      commandLogsByAvatar[data.id] = new CommandLog();
    commandLogsByAvatar[data.id].insert(data);
  });

  socket.on('snapshot', receiveSnapshot);
  socket.on('initial', (data) => {
    myCommandLog = new CommandLog();
    receiveSnapshot(data);
  });

  socket.on('terminate', (data) => {
    delete otherAvatarSnapshots[data.id];
    delete commandLogsByAvatar[data.id];
  });

  const clearObject = (obj) => {
    Object.keys(obj).forEach(k => delete obj[k])
  };

  socket.on('disconnect', () => {
    clearObject(otherAvatarSnapshots);
    clearObject(commandLogsByAvatar);
    if(snapshotSendInterval)
      clearInterval(snapshotSendInterval);
  });

  socket.on('connect', () => {

  });

  window.addEventListener('keydown', keyHandler.bind(null, true));
  window.addEventListener('keyup', keyHandler.bind(null, false));

  window.requestAnimationFrame(drawLoop);
};

window.onload = init;
