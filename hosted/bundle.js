"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var commandsByType = {
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

var commands = {};
var commandTypes = {};
for (var type in commandsByType) {
  for (var command in commandsByType[type]) {
    commandTypes[command] = type;
    commands[command] = commandsByType[type][command];
  }
}

var sortInsertionFromBack = function sortInsertionFromBack(arr, newItem, valueFunc) {
  if (arr.length === 0) arr.push(newItem);
  for (var n = arr.length - 1; n >= 0; n++) {
    if (valueFunc(newItem) >= valueFunc(arr[n])) {
      arr.splice(n + 1, 0, newItem);
      return;
    }
  }
  arr.splice(0, 0, newItem);
};

var CommandInfo = function CommandInfo(command, state) {
  _classCallCheck(this, CommandInfo);

  this.command = command;
  this.time = Date.now();
  this.type = commandTypes[command];
  this.state = state;
};

var MOVE_SPEED = 100;
var ROTATION_SPEED_DG = 90;

var toRadians = function toRadians(angle) {
  return angle * (Math.PI / 180);
};

// http://stackoverflow.com/questions/17410809/how-to-calculate-rotation-in-2d-in-javascript
var rotate = function rotate(cx, cy, x, y, angle) {
  var radians = toRadians(angle),
      cos = Math.cos(radians),
      sin = Math.sin(radians),
      nx = cos * (x - cx) + sin * (y - cy) + cx,
      ny = cos * (y - cy) - sin * (x - cx) + cy;
  return [nx, ny];
};

var LocalDeltaState = function LocalDeltaState(dT, physicsState) {
  _classCallCheck(this, LocalDeltaState);

  this.rotation = physicsState.rotational * dT;
  if (this.rotation != 0) {
    this.y = (-physicsState.medial * Math.cos(toRadians(this.rotation)) + physicsState.medial) / toRadians(physicsState.rotational);
    this.x = physicsState.medial * Math.sin(toRadians(this.rotation)) / toRadians(physicsState.rotational);
  } else {
    this.x = 0;
    this.y = physicsState.medial * dT;
  }
};

var PhysicsState = function PhysicsState(inputState) {
  _classCallCheck(this, PhysicsState);

  this.medial = inputState[commands.MOVE_FORWARD] * -MOVE_SPEED + inputState[commands.MOVE_BACKWARD] * MOVE_SPEED;
  this.lateral = 0;
  this.rotational = inputState[commands.ROTATE_CW] * ROTATION_SPEED_DG + inputState[commands.ROTATE_CCW] * -ROTATION_SPEED_DG;
};

var InputState = function () {
  function InputState(forward, backward, cw, ccw) {
    _classCallCheck(this, InputState);

    this[commands.MOVE_FORWARD] = forward;
    this[commands.MOVE_BACKWARD] = backward;
    this[commands.ROTATE_CW] = cw;
    this[commands.ROTATE_CCW] = ccw;
  }

  _createClass(InputState, [{
    key: "applyCommandInfo",
    value: function applyCommandInfo(commandInfo) {
      var newObj = InputState.copyConstruct(this);
      newObj[commandInfo.command] = commandInfo.state;
      return newObj;
    }
  }], [{
    key: "copyConstruct",
    value: function copyConstruct(other) {
      return Object.assign(Object.create(Object.getPrototypeOf(other)), other);
    }
  }]);

  return InputState;
}();

var WorldState = function () {
  function WorldState(x, y, orientation) {
    _classCallCheck(this, WorldState);

    this.x = x;
    this.y = y;
    this.orientation = orientation;
  }

  _createClass(WorldState, [{
    key: "applyDeltaState",
    value: function applyDeltaState(deltaState) {
      var rotatedDisplacement = rotate(0, 0, deltaState.x, deltaState.y, -this.orientation);
      return new WorldState(this.x + rotatedDisplacement[0], this.y + rotatedDisplacement[1], this.orientation + deltaState.rotation);
    }
  }]);

  return WorldState;
}();

var CommandLog = function () {
  function CommandLog() {
    _classCallCheck(this, CommandLog);

    for (var _type in commandsByType) {
      this[_type] = [];
    }
  }

  _createClass(CommandLog, [{
    key: "insert",
    value: function insert(commandInfo) {
      sortInsertionFromBack(this[commandInfo.type], commandInfo, function (ci) {
        return ci.time;
      });
    }
  }]);

  return CommandLog;
}();

var socket = void 0;
var canvas = void 0;
var context = void 0;
var camera = void 0;
var myAvatarSnapshot = void 0;
var snapshotSendInterval = void 0;
var myCommandLog = new CommandLog();
var otherAvatarSnapshots = {};
var commandLogsByAvatar = {};

// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/utilities.js
var worldPointToCameraSpace = function worldPointToCameraSpace(xw, yw, camera) {
  var cameraToPointVector = [(xw - camera.x) * camera.zoom, (yw - camera.y) * camera.zoom];
  var rotatedVector = rotate(0, 0, cameraToPointVector[0], cameraToPointVector[1], camera.rotation);
  return [camera.width / 2 + rotatedVector[0], camera.height / 2 + rotatedVector[1]];
};

var keyToCommand = {
  w: commands.MOVE_FORWARD,
  a: commands.ROTATE_CCW,
  s: commands.MOVE_BACKWARD,
  d: commands.ROTATE_CW
};

var keyHandler = function keyHandler(state, e) {
  console.log('input registered');
  var command = keyToCommand[e.key];
  if (command && e.repeat == false) {
    var commandInfo = new CommandInfo(command, state);
    myCommandLog.insert(commandInfo);
    console.log("valid command " + command);
    socket.emit('commandInfo', commandInfo);
  }
};

// Assumes bucket doesn't contain any commands dated before startTime
var integrateMoveCommandBucketIntoLocalDelta = function integrateMoveCommandBucketIntoLocalDelta(startTime, currentTime, bucket, worldState) {
  var initialInputState = new InputState(false, false, false, false);
  var initialPhysicsState = new PhysicsState(initialInputState);
  var initialDT = (bucket.length ? bucket[0].time - startTime : currentTime - startTime) / 1000;
  var newWorldState = worldState.applyDeltaState(new LocalDeltaState(initialDT, initialPhysicsState));

  var previousInputState = initialInputState;

  for (var n = 0; n < bucket.length; n++) {
    var endTime = bucket[n + 1] && bucket[n + 1].time < currentTime ? bucket[n + 1].time : currentTime;
    var dT = (endTime - bucket[n].time) / 1000;
    var inputState = previousInputState.applyCommandInfo(bucket[n]);
    var physicsState = new PhysicsState(inputState);
    newWorldState = newWorldState.applyDeltaState(new LocalDeltaState(dT, physicsState));
    previousInputState = inputState;
  }

  return newWorldState;
};

var integrateAvatar = function integrateAvatar(snapshot, commandLog) {
  var currentTime = Date.now();

  var initialWorldState = new WorldState(snapshot.x, snapshot.y, snapshot.rotation);

  var newWorldState = integrateMoveCommandBucketIntoLocalDelta(snapshot.time, currentTime, commandLog.move, initialWorldState);

  return { x: newWorldState.x, y: newWorldState.y, rotation: newWorldState.orientation, color: snapshot.color };
};

var drawAvatar = function drawAvatar(avatar, camera) {
  var avatarPositionInCameraSpace = worldPointToCameraSpace(avatar.x, avatar.y, camera);
  var ctx = camera.ctx;

  ctx.save();
  ctx.translate(avatarPositionInCameraSpace[0], avatarPositionInCameraSpace[1]);
  ctx.rotate((avatar.rotation - camera.rotation) * (Math.PI / 180));
  ctx.scale(camera.zoom, camera.zoom);
  ctx.fillStyle = avatar.color;
  ctx.fillRect(-20, -20, 40, 40);
  ctx.restore();
};

var drawLoop = function drawLoop() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (myAvatarSnapshot) {
    var myAvatar = integrateAvatar(myAvatarSnapshot, myCommandLog);
    camera.x = myAvatar.x;
    camera.y = myAvatar.y;
    camera.rotation = myAvatar.rotation;

    for (var id in otherAvatarSnapshots) {
      drawAvatar(integrateAvatar(otherAvatarSnapshots[id], commandLogsByAvatar[id]), camera);
    }
    drawAvatar(myAvatar, camera);
  }

  window.requestAnimationFrame(drawLoop);
};

var receiveSnapshot = function receiveSnapshot(data) {
  // Someone else's
  if (data.id) {
    console.log("Snapshot for " + data.id + " (" + data.x + ", " + data.y + ")");
    otherAvatarSnapshots[data.id] = data;
    if (!commandLogsByAvatar[data.id]) commandLogsByAvatar[data.id] = new CommandLog();
  }
  // Ours
  else {
      console.log("our snapshot (" + data.x + ", " + data.y + ")");
      myAvatarSnapshot = data;

      snapshotSendInterval = setInterval(function () {
        socket.emit('snapshot', myAvatarSnapshot);
      }, 3000);
    }
};

var init = function init() {
  socket = io.connect();

  canvas = document.querySelector('#mainCanvas');
  context = canvas.getContext('2d');

  camera = {
    //position/rotation
    x: 0,
    y: 0,
    rotation: 0,
    //scale value, basically
    zoom: 1,
    minZoom: .0001,
    maxZoom: 5,
    //screen dimensions
    width: canvas.width,
    height: canvas.height,
    ctx: context
  };

  socket.on('commandInfo', function (data) {
    console.log("Command " + data.command + " " + data.state + " from " + data.id);
    if (!commandLogsByAvatar[data.id]) commandLogsByAvatar[data.id] = new CommandLog();
    commandLogsByAvatar[data.id].insert(data);
  });

  socket.on('snapshot', receiveSnapshot);
  socket.on('initial', function (data) {
    myCommandLog = new CommandLog();
    receiveSnapshot(data);
  });

  socket.on('terminate', function (data) {
    delete otherAvatarSnapshots[data.id];
    delete commandLogsByAvatar[data.id];
  });

  var clearObject = function clearObject(obj) {
    Object.keys(obj).forEach(function (k) {
      return delete obj[k];
    });
  };

  socket.on('disconnect', function () {
    clearObject(otherAvatarSnapshots);
    clearObject(commandLogsByAvatar);
    if (snapshotSendInterval) clearInterval(snapshotSendInterval);
  });

  socket.on('connect', function () {});

  window.addEventListener('keydown', keyHandler.bind(null, true));
  window.addEventListener('keyup', keyHandler.bind(null, false));

  window.requestAnimationFrame(drawLoop);
};

window.onload = init;
