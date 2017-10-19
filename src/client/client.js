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
let starCamera;
let gridCamera;
let myCommandLog;
const commandLogsByAvatar = {};

// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/main.js
const stars = {
  objs:[],
  colors:[
    'white',
    'yellow'
  ]
};

// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/main.js
const grid = {
  gridLines: 500, //number of grid lines
  gridSpacing: 20, //pixels per grid unit
  gridStart: [-5000, -5000], //corner anchor in world coordinates
  colors:[
    {
      color:'#1111FF',
      interval:1000
    },
    {
      color:'blue',
      interval:200
    },
    {
      color:'mediumblue',
      interval:50,
      minimap: true
    },
    {
      color:'darkblue',
      interval:10
    },
    {
      color:'navyblue',
      interval:2
    }
  ]
};

// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/ships.js
const shipVertices = [
  [-20, 17],
  [0, 7],
  [20, 17],
  [0, -23]
];

// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/constructors.js
const generateStarField = (stars) => {
  const lower = -50000;
  const upper = 50000;
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

// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/utilities.js
const worldPointToCameraSpace = (xw,yw, camera) => {
  var cameraToPointVector = [(xw - camera.x) * camera.zoom, (yw - camera.y) * camera.zoom];
  var rotatedVector = rotate(0, 0, cameraToPointVector[0], cameraToPointVector[1], camera.rotation);
  return [camera.width / 2 + rotatedVector[0], camera.height / 2 + rotatedVector[1]];
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

const integrateCommandLogIntoSnapshot = (desiredTime, commandLog) => {
  const snapshotIndex = searchFromBack(commandLog.snapshots, (ss) => ss.time < desiredTime);
  if(snapshotIndex === undefined)
    return undefined;
  const initialSnapshot = commandLog.snapshots[snapshotIndex];
  const bucket = commandLog.move;
  const bucketIndex = initialSnapshot.bucketIndices.move - commandLog.indexOffsets.move;
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

// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/drawing.js
const drawStars = (stars,camera) => {
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

const linkCameraWithOffset = (mainCamera, dependentCamera, offset) => {
  dependentCamera.x = mainCamera.x;
  dependentCamera.y = mainCamera.y;
  dependentCamera.rotation = mainCamera.rotation;
  const cameraDistance = 1/mainCamera.zoom;
  dependentCamera.zoom = 1/(cameraDistance+offset);
};

const drawLoop = () => {
  context.fillStyle = 'black';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const currentTime = Date.now();

  linkCameraWithOffset(camera, starCamera, 100);
  linkCameraWithOffset(camera, gridCamera, 2);

  drawStars(stars, starCamera);
  drawGrid(grid, gridCamera);

  if(myCommandLog){
    const snapshot = integrateCommandLogIntoSnapshot(currentTime, myCommandLog);
    camera.x = snapshot.worldState.x;
    camera.y = snapshot.worldState.y;
    camera.rotation = snapshot.worldState.orientation;

    const integratedSnapshots = [];
    for(const id in commandLogsByAvatar){
      integratedSnapshots.push(integrateCommandLogIntoSnapshot(currentTime, commandLogsByAvatar[id]));
    }
    drawProjectionLines(snapshot, camera, gridCamera);
    for(const index in integratedSnapshots) {
      drawProjectionLines(integratedSnapshots[index], camera, gridCamera);
    }
    for(const index in integratedSnapshots) {
      drawAvatar(integratedSnapshots[index], camera);
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

  starCamera = {
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

  gridCamera = {
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

  generateStarField(stars);

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
