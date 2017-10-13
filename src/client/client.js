const commandsByType = {
  toggle: {
    MOVE_FORWARD: "MOVE_FORWARD",
    MOVE_LEFT: "MOVE_LEFT",
    MOVE_BACKWARD: "MOVE_BACKWARD",
    MOVE_RIGHT: "MOVE_RIGHT"
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

const sortInsertionFromBack = (arr, newVal) => {
  if(arr.length === 0)
    arr.push(newVal);
  for(let n = arr.length - 1; n>=0; n++){
    if(newVal >= arr[n]){
      arr.splice(n + 1, 0, newVal);
      return;
    }
  }
  arr.splice(0, 0, newVal);
};

class CommandInfo {
  constructor(command, state) {
    this.command = command;
    this.time = Date.now();
    this.type = commandTypes[command];
    this.state = state;
  }
}

class CommandLog {
  constructor() {
    for(const key in commandsByType.toggle){
      this[key] = {start:[], stop:[]};
    }
    for(const key in commandsByType.oneShot){
      this[key] = [];
    }
  }

  insert(commandInfo){
    if(commandInfo.type === "toggle")
      sortInsertionFromBack(this[commandInfo.command][commandInfo.state], commandInfo.time);
    else if(commandInfo.type === "oneShot" && commandInfo.state === "start")
      sortInsertionFromBack(this[commandInfo.command], commandInfo.time);
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

// http://stackoverflow.com/questions/17410809/how-to-calculate-rotation-in-2d-in-javascript
const rotate = (cx, cy, x, y, angle) => {
  var radians = (Math.PI / 180) * angle,
    cos = Math.cos(radians),
    sin = Math.sin(radians),
    nx = (cos * (x - cx)) + (sin * (y - cy)) + cx,
    ny = (cos * (y - cy)) - (sin * (x - cx)) + cy;
  return [nx, ny];
};

// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/utilities.js
const worldPointToCameraSpace = (xw,yw, camera) => {
  var cameraToPointVector = [(xw-camera.x)*camera.zoom,(yw-camera.y)*camera.zoom];
  var rotatedVector = rotate(0,0,cameraToPointVector[0],cameraToPointVector[1],camera.rotation);
  return [camera.width/2+rotatedVector[0],camera.height/2+rotatedVector[1]];
};

const keyToCommand = {
  w: commands.MOVE_FORWARD,
  a: commands.MOVE_LEFT,
  s: commands.MOVE_BACKWARD,
  d: commands.MOVE_RIGHT
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

const getLinearDisplacementForDuration = (durationInMS) => {
  return 20 * durationInMS/1000;
}

const integrateToggleLogIntoDisplacement = (currentTime, toggleLog) => {
  let displacement = 0;
  let stopIndex = -1;
  for(const index in toggleLog.start){
    const startTime = toggleLog.start[index];
    let matchingStop = toggleLog.stop[stopIndex];
    let isLast = false;

    do {
      matchingStop = toggleLog.stop[++stopIndex];

      if(matchingStop === undefined){
        isLast = true;
        break;
      }
    } while(matchingStop < startTime);

    if(isLast){      
      displacement += getLinearDisplacementForDuration(currentTime - startTime);
      break;
    }
    else {
      displacement += getLinearDisplacementForDuration(matchingStop - startTime);
    }
  }
  return displacement;
}

const integrateAvatar = (snapshot, commandLog) => {
  const currentTime = Date.now();

  let xDisplacement = 0;
  let yDisplacement = 0;

  yDisplacement -= integrateToggleLogIntoDisplacement(currentTime, commandLog[commands.MOVE_FORWARD]);
  yDisplacement += integrateToggleLogIntoDisplacement(currentTime, commandLog[commands.MOVE_BACKWARD]);
  xDisplacement -= integrateToggleLogIntoDisplacement(currentTime, commandLog[commands.MOVE_LEFT]);
  xDisplacement += integrateToggleLogIntoDisplacement(currentTime, commandLog[commands.MOVE_RIGHT]);

  return { x: snapshot.x + xDisplacement, y: snapshot.y + yDisplacement, rotation: 0, color: snapshot.color };
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

  /*socket.on('initial', (data) => {
    // Someone else's initial
    if(data.id) {
      console.log(`Initial for ${data.id} (${data.position[0]}, ${data.position[1]})`);
      otherAvatarSnapshots[data.id] = {
        x: data.position[0],
        y: data.position[1],
        time: data.time
      };
      //commandLogsByAvatar[data.id] = new CommandLog();
    }
    // Our initial
    else {
      console.log(`our initial (${data.position[0]}, ${data.position[1]})`);
      myAvatarSnapshot = {
        x: data.position[0],
        y: data.position[1],
        time: data.time
      };

      snapshotSendInterval = setInterval(() => {socket.emit('snapshot', myAvatarSnapshot)}, 3000);
    }
  });*/

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

  window.addEventListener('keydown', keyHandler.bind(null, 'start'));
  window.addEventListener('keyup', keyHandler.bind(null, 'stop'));

  window.requestAnimationFrame(drawLoop);
};

window.onload = init;
