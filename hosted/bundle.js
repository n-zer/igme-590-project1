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
  }
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
  if (arr.length === 0) {
    arr.push(newItem);
    return 0;
  }
  for (var n = arr.length - 1; n >= 0; n--) {
    if (valueFunc(newItem) >= valueFunc(arr[n])) {
      arr.splice(n + 1, 0, newItem);
      return n + 1;
    }
  }
  arr.splice(0, 0, newItem);
  return 0;
};

var searchFromBack = function searchFromBack(arr, evalFunc) {
  for (var n = arr.length - 1; n >= 0; n--) {
    if (evalFunc(arr[n])) return n;
  }
  return undefined;
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
    this.x = -(-physicsState.medial * Math.cos(toRadians(this.rotation)) + physicsState.medial) / toRadians(physicsState.rotational);
    this.y = physicsState.medial * Math.sin(toRadians(this.rotation)) / toRadians(physicsState.rotational);
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

var Snapshot = function () {
  function Snapshot(worldState, inputState, time, color) {
    _classCallCheck(this, Snapshot);

    this.worldState = worldState;
    this.inputState = inputState;
    this.time = time;
    this.color = color;
  }

  _createClass(Snapshot, null, [{
    key: "createFromObject",
    value: function createFromObject(ssObject) {
      return new Snapshot(Object.assign(Object.create(WorldState.prototype), ssObject.worldState), Object.assign(Object.create(InputState.prototype), ssObject.inputState), ssObject.time, ssObject.color);
    }
  }]);

  return Snapshot;
}();

var CommandLog = function () {
  function CommandLog() {
    _classCallCheck(this, CommandLog);

    this.snapshots = [];
    this.indexOffsets = {};
    this.MAX_SNAPSHOTS = 20;
    this.MAX_SNAPSHOT_OVERFLOW = 5;
    for (var _type in commandsByType) {
      this[_type] = [];
      this.indexOffsets[_type] = 0;
    }
  }

  _createClass(CommandLog, [{
    key: "insertCommand",
    value: function insertCommand(commandInfo) {
      sortInsertionFromBack(this[commandInfo.type], commandInfo, function (ci) {
        return ci.time;
      });
    }
  }, {
    key: "insertSnapshot",
    value: function insertSnapshot(snapshot) {
      // Insert from back
      var index = sortInsertionFromBack(this.snapshots, snapshot, function (ss) {
        return ss.time;
      });
      snapshot.bucketIndices = {};

      // Find indices into command buckets
      if (index === 0) {
        // For the first snapshot
        for (var _type2 in commandsByType) {
          snapshot.bucketIndices[_type2] = 0;
        }
      } else {
        // For subsequent snapshots
        var previousSnapshot = this.snapshots[index - 1];
        for (var _type3 in previousSnapshot.bucketIndices) {
          var n = previousSnapshot.bucketIndices[_type3];

          // Find index of first command younger than the snapshot
          for (; n - this.indexOffsets[_type3] < this[_type3].length && this[_type3][n - this.indexOffsets[_type3]].time < snapshot.time; n++) {}

          // That index will be the first one we use when integrating
          snapshot.bucketIndices[_type3] = n;
        }
      }

      // Prune snapshots
      if (this.snapshots.length > this.MAX_SNAPSHOTS + this.MAX_SNAPSHOT_OVERFLOW) {
        this.snapshots.splice(0, this.snapshots.length - this.MAX_SNAPSHOTS);
        //console.log(`Pruned snapshots, ${this.snapshots.length} remain`);
        var oldestSSTime = this.snapshots[0].time;

        // Prune commands
        for (var _type4 in commandsByType) {
          var _n = 0;

          // Find index of first command younger than the oldest snapshot
          for (; _n < this[_type4].length && this[_type4][_n].time < oldestSSTime; _n++) {}

          // Remove all commands before that one
          this[_type4].splice(0, _n);
          //console.log(`Pruned ${n} commands of type ${type}, ${this[type].length} remain`);

          this.indexOffsets[_type4] += _n;
        }
      }
    }
  }]);

  return CommandLog;
}();

var socket = void 0;
var canvas = void 0;
var context = void 0;
var camera = void 0;
var starCamera = void 0;
var gridCamera = void 0;
var myCommandLog = void 0;
var commandLogsByAvatar = {};

// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/main.js
var stars = {
  objs: [],
  colors: ['white', 'yellow']
};

// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/main.js
var grid = {
  gridLines: 500, //number of grid lines
  gridSpacing: 20, //pixels per grid unit
  gridStart: [-5000, -5000], //corner anchor in world coordinates
  colors: [{
    color: '#1111FF',
    interval: 1000
  }, {
    color: 'blue',
    interval: 200
  }, {
    color: 'mediumblue',
    interval: 50,
    minimap: true
  }, {
    color: 'darkblue',
    interval: 10
  }, {
    color: 'navyblue',
    interval: 2
  }]
};

// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/ships.js
var shipVertices = [[-20, 17], [0, 7], [20, 17], [0, -23]];

// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/constructors.js
var generateStarField = function generateStarField(stars) {
  var lower = -50000;
  var upper = 50000;
  var maxRadius = 100;
  var minRadius = 50;
  for (var c = 0; c < 500; c++) {
    var group = Math.floor(Math.random() * stars.colors.length);
    stars.objs.push({
      x: Math.random() * (upper - lower) + lower,
      y: Math.random() * (upper - lower) + lower,
      radius: Math.random() * (maxRadius - minRadius) + minRadius,
      colorIndex: group
    });
  }
};

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

var COMMANDS_PER_SNAPSHOT = 10;
var shouldSendSnapshot = false;
var commandCounter = 0;
var keyHandler = function keyHandler(state, e) {
  var command = keyToCommand[e.key];
  if (command && e.repeat == false) {
    var commandInfo = new CommandInfo(command, state);
    myCommandLog.insertCommand(commandInfo);
    socket.emit('commandInfo', commandInfo);
    commandCounter++;
    if (commandCounter >= COMMANDS_PER_SNAPSHOT) {
      commandCounter = 0;
      shouldSendSnapshot = true;
    }
  }
};

var integrateCommandLogIntoSnapshot = function integrateCommandLogIntoSnapshot(desiredTime, commandLog) {
  var snapshotIndex = searchFromBack(commandLog.snapshots, function (ss) {
    return ss.time < desiredTime;
  });
  if (snapshotIndex === undefined) return undefined;
  var initialSnapshot = commandLog.snapshots[snapshotIndex];
  var bucket = commandLog.move;
  var bucketIndex = initialSnapshot.bucketIndices.move - commandLog.indexOffsets.move;
  var startTime = initialSnapshot.time;

  var initialInputState = initialSnapshot.inputState;
  var initialPhysicsState = new PhysicsState(initialInputState);
  var initialDT = (bucket[bucketIndex] ? bucket[bucketIndex].time - startTime : desiredTime - startTime) / 1000;
  var newWorldState = initialSnapshot.worldState.applyDeltaState(new LocalDeltaState(initialDT, initialPhysicsState));

  var previousInputState = initialInputState;

  for (var n = bucketIndex; n < bucket.length; n++) {
    var endTime = bucket[n + 1] && bucket[n + 1].time < desiredTime ? bucket[n + 1].time : desiredTime;
    var dT = (endTime - bucket[n].time) / 1000;
    var inputState = previousInputState.applyCommandInfo(bucket[n]);
    var physicsState = new PhysicsState(inputState);
    newWorldState = newWorldState.applyDeltaState(new LocalDeltaState(dT, physicsState));
    previousInputState = inputState;
  }

  return new Snapshot(newWorldState, previousInputState, desiredTime, initialSnapshot.color);
};

var drawAvatar = function drawAvatar(snapshot, camera) {
  var avatarPositionInCameraSpace = worldPointToCameraSpace(snapshot.worldState.x, snapshot.worldState.y, camera);
  var ctx = camera.ctx;

  ctx.save();
  ctx.translate(avatarPositionInCameraSpace[0], avatarPositionInCameraSpace[1]);
  ctx.rotate((snapshot.worldState.orientation - camera.rotation) * (Math.PI / 180));
  ctx.scale(camera.zoom, camera.zoom);

  ctx.beginPath();
  ctx.moveTo(shipVertices[0][0], shipVertices[0][1]);
  for (var c = 1; c < shipVertices.length; c++) {
    var vert = shipVertices[c];
    ctx.lineTo(vert[0], vert[1]);
  }
  ctx.closePath();
  ctx.fillStyle = snapshot.color;
  ctx.fill();
  ctx.restore();
};

var drawProjectionLines = function drawProjectionLines(snapshot, camera, gridCamera) {
  var ctx = camera.ctx;
  var positionInCameraSpace = worldPointToCameraSpace(snapshot.worldState.x, snapshot.worldState.y, camera); //get ship's position in camera space
  var positionInGridCameraSpace = worldPointToCameraSpace(snapshot.worldState.x, snapshot.worldState.y, gridCamera);

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
var drawStars = function drawStars(stars, camera) {
  var start = [0, 0];
  var end = [camera.width, camera.height];
  var ctx = camera.ctx;
  for (var group = 0; group < stars.colors.length; group++) {
    ctx.save();
    ctx.fillStyle = stars.colors[group];
    ctx.beginPath();
    for (var c = 0; c < stars.objs.length; c++) {
      var star = stars.objs[c];
      if (star.colorIndex != group) continue;

      var finalPosition = worldPointToCameraSpace(star.x, star.y, camera); //get star's position in camera space

      if (finalPosition[0] + star.radius * camera.zoom < start[0] || finalPosition[0] - star.radius * camera.zoom > end[0] || finalPosition[1] + star.radius * camera.zoom < start[1] || finalPosition[1] - star.radius * camera.zoom > end[1]) continue;
      ctx.moveTo(finalPosition[0], finalPosition[1]);
      ctx.arc(finalPosition[0], finalPosition[1], star.radius * camera.zoom, 0, Math.PI * 2);
    };
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
};

// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/drawing.js
var drawGrid = function drawGrid(grid, camera) {
  var ctx = camera.ctx;
  var gridLines = grid.gridLines;
  var gridSpacing = grid.gridSpacing;
  var gridStart = grid.gridStart;

  for (var c = 0; c < grid.colors.length; c++) {
    ctx.save();
    ctx.beginPath();
    for (var x = 0; x <= gridLines; x++) {
      if (x % grid.colors[c].interval != 0) continue;
      var correctInterval = true;
      for (var n = 0; n < c; n++) {
        if (x % grid.colors[n].interval == 0) {
          correctInterval = false;
          break;
        }
      }
      if (correctInterval != true) continue;
      //define start and end points for current line in world space
      var start = [gridStart[0] + x * gridSpacing, gridStart[1]];
      var end = [start[0], gridStart[1] + gridLines * gridSpacing];
      //convert to camera space
      start = worldPointToCameraSpace(start[0], start[1], camera);
      end = worldPointToCameraSpace(end[0], end[1], camera);
      ctx.moveTo(start[0], start[1]);
      ctx.lineTo(end[0], end[1]);
    }
    for (var y = 0; y <= gridLines; y++) {
      if (y % grid.colors[c].interval != 0) continue;
      var _correctInterval = true;
      for (var _n2 = 0; _n2 < c; _n2++) {
        if (y % grid.colors[_n2].interval == 0) {
          _correctInterval = false;
          break;
        }
      }
      if (_correctInterval != true) continue;
      //same as above, but perpendicular
      var _start = [gridStart[0], gridStart[0] + y * gridSpacing];
      var _end = [gridStart[0] + gridLines * gridSpacing, _start[1]];
      _start = worldPointToCameraSpace(_start[0], _start[1], camera);
      _end = worldPointToCameraSpace(_end[0], _end[1], camera);
      ctx.moveTo(_start[0], _start[1]);
      ctx.lineTo(_end[0], _end[1]);
    }
    //draw all lines, stroke last
    ctx.globalAlpha = .3;
    ctx.strokeWidth = 5;
    ctx.strokeStyle = grid.colors[c].color;
    ctx.stroke();
    ctx.restore();
  }
};

var linkCameraWithOffset = function linkCameraWithOffset(mainCamera, dependentCamera, offset) {
  dependentCamera.x = mainCamera.x;
  dependentCamera.y = mainCamera.y;
  dependentCamera.rotation = mainCamera.rotation;
  var cameraDistance = 1 / mainCamera.zoom;
  dependentCamera.zoom = 1 / (cameraDistance + offset);
};

var drawLoop = function drawLoop() {
  context.fillStyle = 'black';
  context.fillRect(0, 0, canvas.width, canvas.height);
  var currentTime = Date.now();

  linkCameraWithOffset(camera, starCamera, 100);
  linkCameraWithOffset(camera, gridCamera, 2);

  drawStars(stars, starCamera);
  drawGrid(grid, gridCamera);

  if (myCommandLog) {
    var snapshot = integrateCommandLogIntoSnapshot(currentTime, myCommandLog);
    camera.x = snapshot.worldState.x;
    camera.y = snapshot.worldState.y;
    camera.rotation = snapshot.worldState.orientation;

    var integratedSnapshots = [];
    for (var id in commandLogsByAvatar) {
      integratedSnapshots.push(integrateCommandLogIntoSnapshot(currentTime, commandLogsByAvatar[id]));
    }
    drawProjectionLines(snapshot, camera, gridCamera);
    for (var index in integratedSnapshots) {
      drawProjectionLines(integratedSnapshots[index], camera, gridCamera);
    }
    for (var _index in integratedSnapshots) {
      drawAvatar(integratedSnapshots[_index], camera);
    }
    drawAvatar(snapshot, camera);
    if (shouldSendSnapshot) {
      myCommandLog.insertSnapshot(snapshot);
      socket.emit('snapshot', snapshot);
      shouldSendSnapshot = false;
    }
  }

  window.requestAnimationFrame(drawLoop);
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

  starCamera = {
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

  gridCamera = {
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

  generateStarField(stars);

  socket.on('commandInfo', function (data) {
    //console.log(`Command ${data.command} ${data.state} from ${data.id}`);
    if (!commandLogsByAvatar[data.id]) commandLogsByAvatar[data.id] = new CommandLog();
    commandLogsByAvatar[data.id].insertCommand(data);
  });

  socket.on('snapshot', function (data) {
    //console.log(`Snapshot for ${data.id} (${data.x}, ${data.y})`);
    if (!commandLogsByAvatar[data.id]) commandLogsByAvatar[data.id] = new CommandLog();
    commandLogsByAvatar[data.id].insertSnapshot(Snapshot.createFromObject(data));
  });

  socket.on('initial', function (data) {
    if (data.id) {
      shouldSendSnapshot = true; // We need to send a snapshot when a new user connects so they can start rendering us
      commandLogsByAvatar[data.id] = new CommandLog();
      commandLogsByAvatar[data.id].insertSnapshot(new Snapshot(new WorldState(data.x, data.y, data.rotation), new InputState(false, false, false, false), data.time, data.color));
    } else {
      myCommandLog = new CommandLog();

      //console.log(`our initial (${data.x}, ${data.y})`);
      myCommandLog.insertSnapshot(new Snapshot(new WorldState(data.x, data.y, data.rotation), new InputState(false, false, false, false), data.time, data.color));
    }
  });

  socket.on('terminate', function (data) {
    delete commandLogsByAvatar[data.id];
  });

  var clearObject = function clearObject(obj) {
    Object.keys(obj).forEach(function (k) {
      return delete obj[k];
    });
  };

  socket.on('disconnect', function () {
    clearObject(commandLogsByAvatar);
  });

  socket.on('connect', function () {});

  window.addEventListener('keydown', keyHandler.bind(null, true));
  window.addEventListener('keyup', keyHandler.bind(null, false));

  window.requestAnimationFrame(drawLoop);
};

window.onload = init;
