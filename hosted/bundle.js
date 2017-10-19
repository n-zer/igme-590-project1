"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// ---------- Commands ---------- //

// Organized by type
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

// Dictionary of all commands, populated at run-time
var commands = {};

// Dictionary with commands as keys and types as values, populated at run-time
var commandTypes = {};

// Population
for (var type in commandsByType) {
  for (var command in commandsByType[type]) {
    commandTypes[command] = type;
    commands[command] = commandsByType[type][command];
  }
}

// Translates keyboard keys to commands
var keyToCommand = {
  w: commands.MOVE_FORWARD,
  a: commands.ROTATE_CCW,
  s: commands.MOVE_BACKWARD,
  d: commands.ROTATE_CW
};

// ---------- Utilities ---------- //

// Insertion sort in ascending order, checks from back to front
// valueFunc is used to fetch the value to be compared, in case the item is an object
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

// Same as above, but only finds the index at which the new item would be inserted
// evalFunc must return the value directly from a closure
var searchFromBack = function searchFromBack(arr, evalFunc) {
  for (var n = arr.length - 1; n >= 0; n--) {
    if (evalFunc(arr[n])) return n;
  }
  return undefined;
};

var lerp = function lerp(from, to, percent) {
  return from * (1.0 - percent) + to * percent;
};

// Translates an arbitrary orientation into the range of -180 to 180
var correctOrientation = function correctOrientation(orientation) {
  while (orientation > 180) {
    orientation -= 360;
  }while (orientation < -180) {
    orientation += 360;
  }return orientation;
};

var toRadians = function toRadians(angle) {
  return angle * (Math.PI / 180);
};

// Rotates (x, y) angle degrees around (cx, cy)
// http://stackoverflow.com/questions/17410809/how-to-calculate-rotation-in-2d-in-javascript
var rotate = function rotate(cx, cy, x, y, angle) {
  var radians = toRadians(angle),
      cos = Math.cos(radians),
      sin = Math.sin(radians),
      nx = cos * (x - cx) + sin * (y - cy) + cx,
      ny = cos * (y - cy) - sin * (x - cx) + cy;
  return [nx, ny];
};

// Multi-line text helper for canvas
// https://stackoverflow.com/questions/5026961/html5-canvas-ctx-filltext-wont-do-line-breaks/21574562#21574562
var fillTextMultiLine = function fillTextMultiLine(ctx, text, x, y) {
  var lineHeight = ctx.measureText("M").width * 1.2;
  var lines = text.split("\n");
  for (var i = lines.length - 1; i >= 0; --i) {
    ctx.fillText(lines[i], x, y);
    y -= lineHeight;
  }
};

// Converts the point (xw, yw) in world coordinates to camera space for the given camera
// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/utilities.js
var worldPointToCameraSpace = function worldPointToCameraSpace(xw, yw, camera) {
  var cameraToPointVector = [(xw - camera.x) * camera.zoom, (yw - camera.y) * camera.zoom];
  var rotatedVector = rotate(0, 0, cameraToPointVector[0], cameraToPointVector[1], camera.rotation);
  return [camera.width / 2 + rotatedVector[0], camera.height / 2 + rotatedVector[1]];
};

var clearObject = function clearObject(obj) {
  Object.keys(obj).forEach(function (k) {
    return delete obj[k];
  });
};

// ---------- Constants ---------- //

var MOVE_SPEED = 1000; // Forward/backward movespeed in pixels per second
var ROTATION_SPEED_DG = 180; // Rotation speed in degrees per second
var MESSAGE_DURATION_MS = 5000; // Duration after which messages will fade, in milliseconds
var COMMANDS_PER_SNAPSHOT = 10; // A new snapshot will be generated after this number of commands


// ---------- Classes ----------//

// Zoomable camera attached to a canvas

var Camera = function () {
  function Camera(canvas) {
    _classCallCheck(this, Camera);

    this.x = 0;
    this.y = 0;
    this.rotation = 0;
    this.zoom = 1;
    this.minZoom = .0001;
    this.maxZoom = 5;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  _createClass(Camera, [{
    key: "width",
    get: function get() {
      return this.canvas.width;
    }
  }, {
    key: "height",
    get: function get() {
      return this.canvas.height;
    }
  }]);

  return Camera;
}();

// Information about a single command


var CommandInfo = function CommandInfo(command, state) {
  _classCallCheck(this, CommandInfo);

  this.command = command; // A member of the commands object
  this.time = Date.now(); // Time at which the command was given
  this.type = commandTypes[command]; // A member of the commandsByType object
  this.state = state; // True for the start of the command (press), false for the end (release)
};

// A delta that can be applied to a WorldState, created by integrating a PhysicsState over a period of time (dT)


var LocalDeltaState = function LocalDeltaState(dT, physicsState) {
  _classCallCheck(this, LocalDeltaState);

  this.rotation = correctOrientation(physicsState.rotational * dT);
  if (this.rotation != 0) {
    this.x = -(-physicsState.medial * Math.cos(toRadians(this.rotation)) + physicsState.medial) / toRadians(physicsState.rotational);
    this.y = physicsState.medial * Math.sin(toRadians(this.rotation)) / toRadians(physicsState.rotational);
  } else {
    this.x = 0;
    this.y = physicsState.medial * dT;
  }
};

// Describes an object's instantaneous (i.e. velocities) motion in its local coordinate system
// Inferred from an InputState


var PhysicsState = function PhysicsState(inputState) {
  _classCallCheck(this, PhysicsState);

  this.medial = inputState[commands.MOVE_FORWARD] * -MOVE_SPEED + inputState[commands.MOVE_BACKWARD] * MOVE_SPEED; // Forward/backward
  this.lateral = 0; // Left/right (I'm ignoring this because I haven't figured out the math for it yet)
  this.rotational = inputState[commands.ROTATE_CW] * ROTATION_SPEED_DG + inputState[commands.ROTATE_CCW] * -ROTATION_SPEED_DG;
};

// Describes the state of any commands that may be acting on the object


var InputState = function () {
  function InputState(forward, backward, cw, ccw) {
    _classCallCheck(this, InputState);

    this[commands.MOVE_FORWARD] = forward;
    this[commands.MOVE_BACKWARD] = backward;
    this[commands.ROTATE_CW] = cw;
    this[commands.ROTATE_CCW] = ccw;
  }

  // Returns a copy of this InputState with the given command applied to it


  _createClass(InputState, [{
    key: "applyCommandInfo",
    value: function applyCommandInfo(commandInfo) {
      var newObj = InputState.copyConstruct(this);
      newObj[commandInfo.command] = commandInfo.state;
      return newObj;
    }

    // Returns a shallow copy of the given object

  }], [{
    key: "copyConstruct",
    value: function copyConstruct(other) {
      return Object.assign(Object.create(Object.getPrototypeOf(other)), other);
    }
  }]);

  return InputState;
}();

// Represents an object's positional data in the world coordinate space


var WorldState = function () {
  function WorldState(x, y, orientation) {
    _classCallCheck(this, WorldState);

    this.x = x;
    this.y = y;
    this.orientation = orientation;
  }

  // Returns a copy of this WorldState with the given LocalDeltaState applied to it


  _createClass(WorldState, [{
    key: "applyDeltaState",
    value: function applyDeltaState(deltaState) {
      var rotatedDisplacement = rotate(0, 0, deltaState.x, deltaState.y, -this.orientation);
      var newOrientation = correctOrientation(this.orientation + deltaState.rotation);
      return new WorldState(this.x + rotatedDisplacement[0], this.y + rotatedDisplacement[1], newOrientation);
    }
  }]);

  return WorldState;
}();

// A collection of all the state data needed to render an object at or beyond a particular point in time


var Snapshot = function () {
  function Snapshot(worldState, inputState, time, color) {
    _classCallCheck(this, Snapshot);

    this.worldState = worldState;
    this.inputState = inputState;
    this.time = time;
    this.color = color;
  }

  // Creates a snapshot from a shallow copy of a snapshot without the correct prototype information
  // This is necessary because socket.io strips prototype data when sending things across the network,
  // and we need to send snapshots across the network


  _createClass(Snapshot, null, [{
    key: "createFromObject",
    value: function createFromObject(ssObject) {
      return new Snapshot(Object.assign(Object.create(WorldState.prototype), ssObject.worldState), Object.assign(Object.create(InputState.prototype), ssObject.inputState), ssObject.time, ssObject.color);
    }
  }]);

  return Snapshot;
}();

// A running log of snapshots and commands for a particular object that can be used to render the object at any point in time


var CommandLog = function () {
  function CommandLog() {
    _classCallCheck(this, CommandLog);

    this.snapshots = [];
    this.indexOffsets = {};
    this.MAX_SNAPSHOTS = 20;
    this.MAX_SNAPSHOT_OVERFLOW = 5;

    // Create a command bucket for each type of command
    for (var _type in commandsByType) {
      this[_type] = [];
      this.indexOffsets[_type] = 0;
    }
  }

  // Inserts a command into the command log


  _createClass(CommandLog, [{
    key: "insertCommand",
    value: function insertCommand(commandInfo) {
      sortInsertionFromBack(this[commandInfo.type], commandInfo, function (ci) {
        return ci.time;
      });
    }

    // Inserts a snapshot into the command log

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

    // Uses the command log to generate a snapshot of the object at the given time

  }, {
    key: "integrateIntoSnapshot",
    value: function integrateIntoSnapshot(desiredTime) {
      var snapshotIndex = searchFromBack(this.snapshots, function (ss) {
        return ss.time < desiredTime;
      });
      if (snapshotIndex === undefined) return undefined;
      var initialSnapshot = this.snapshots[snapshotIndex];
      var bucket = this.move;
      var bucketIndex = initialSnapshot.bucketIndices.move - this.indexOffsets.move;
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
    }
  }]);

  return CommandLog;
}();

// A running log of messages sent from a particular player


var MessageLog = function () {
  function MessageLog() {
    _classCallCheck(this, MessageLog);

    this.messages = [];
  }

  // Reduces the log to a newline-delimited string, pruning any messages that have expired


  _createClass(MessageLog, [{
    key: "getString",
    value: function getString(time) {
      var resultString = "";
      var pruneCount = 0;
      for (var n = 0; n < this.messages.length; n++) {
        if (this.messages[n].time + MESSAGE_DURATION_MS < time) {
          pruneCount = n + 1;
          continue;
        }
        resultString += this.messages[n].message + "\n";
      }
      this.messages.splice(0, pruneCount);
      return resultString;
    }

    // Inserts a message into the log

  }, {
    key: "insertMessage",
    value: function insertMessage(message) {
      sortInsertionFromBack(this.messages, message, function (m) {
        return m.time;
      });
    }
  }]);

  return MessageLog;
}();

// ---------- Fields ---------- //

var startTime = 0;
var socket = void 0;
var canvas = void 0;
var context = void 0;
var inputBox = void 0; // For chat input
var camera = void 0; // We'll use separate cameras for the starfield background and the grid so we can simulate depth
var starCamera = void 0;
var gridCamera = void 0;
var myCommandLog = void 0;
var myMessageLog = new MessageLog();
var commandLogsByAvatar = {};
var messageLogsByAvatar = {};
var stars = { // Container for the starfield background objects. Populated at run-time
  objs: [], // From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/main.js
  colors: ['white', 'yellow']
};
// Rendering information for the grid graphic
var grid = { // From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/main.js
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
// The verts for the ship polygon the players are represented by
var shipVertices = [// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/ships.js
[-20, 17], [0, 7], [20, 17], [0, -23]];
// Global state (eww)
var shouldSendSnapshot = false; // When true a snapshot will be sent through the socket on the next available frame
var commandCounter = 0; // Number of commands entered since the last snapshot was generated
var enteringText = false; // Whether the chat input is active

// ---------- Misc ---------- //

// Populates the starfield background container
// From an old project of mine - https://github.com/narrill/Space-Battle/blob/master/js/constructors.js
var generateStarField = function generateStarField(stars) {
  var lower = -100000; // Lower x/y bound for stars
  var upper = 100000; // Upper x/y bound for stars
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

// Handler for keyboard input
var keyHandler = function keyHandler(state, e) {
  // If the given key was a non-repeat press on Enter
  if (state === true && e.repeat === false && e.key === "Enter") {
    // Toggle the chat input
    if (!enteringText) {
      enteringText = true;
      inputBox.value = "";
      inputBox.style.display = 'inline-block';
      inputBox.focus();
    } else {
      enteringText = false;
      inputBox.blur();
      inputBox.style.display = 'none';
      var message = inputBox.value;
      if (message) {
        socket.emit('message', message);
        myMessageLog.insertMessage({ message: message, time: Date.now() });
      }
      inputBox.value = "";
    }
    return;
  }

  // If it wasn't enter, is a valid command, and isn't a repeat
  var command = keyToCommand[e.key];
  if (!enteringText && command && e.repeat === false) {
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

// ---------- Drawing ---------- //

// Renders a player avatar from the given snapshot in the given camera
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

// Draw a line from the snapshot's location in camera space to the snapshot's location on the grid
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

// Draws the starfield background. A bit weirdly structured for performance reasons 
// (rendering a couple hundred circles every frame is surprisingly expensive)
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

// Draws the grid graphic. This could use some improving, but whatever
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

// Draws message text of the given message log at the given snapshot location in the given camera
var drawMessages = function drawMessages(snapshot, messageLog, camera) {
  var snapshotPositionInCameraSpace = worldPointToCameraSpace(snapshot.worldState.x, snapshot.worldState.y, camera);
  var messageString = messageLog.getString(snapshot.time);

  if (messageString) {
    var ctx = camera.ctx;

    ctx.save();
    ctx.font = "20px Arial";
    ctx.fillStyle = snapshot.color;
    ctx.textAlign = "center";
    fillTextMultiLine(camera.ctx, messageString, snapshotPositionInCameraSpace[0], snapshotPositionInCameraSpace[1] - 50);
    ctx.restore();
  }
};

// Draws the tutorial text to the given camera
var drawTutorial = function drawTutorial(camera) {
  var ctx = camera.ctx;

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
var linkCameraWithOffset = function linkCameraWithOffset(mainCamera, dependentCamera, offset) {
  dependentCamera.x = mainCamera.x;
  dependentCamera.y = mainCamera.y;
  dependentCamera.rotation = mainCamera.rotation;
  var cameraDistance = 1 / mainCamera.zoom;
  dependentCamera.zoom = 1 / (cameraDistance + offset);
};

// Renders a frame at the current time
var frameLoop = function frameLoop() {
  context.fillStyle = 'black';
  context.fillRect(0, 0, canvas.width, canvas.height);
  var currentTime = Date.now();

  drawStars(stars, starCamera);
  drawGrid(grid, gridCamera);

  if (myCommandLog) {
    var snapshot = myCommandLog.integrateIntoSnapshot(currentTime);
    camera.x = lerp(camera.x, snapshot.worldState.x, MOVE_SPEED / 10000);
    camera.y = lerp(camera.y, snapshot.worldState.y, MOVE_SPEED / 10000);
    var rotDiff = correctOrientation(snapshot.worldState.orientation - camera.rotation);
    camera.rotation = correctOrientation(camera.rotation + lerp(0, rotDiff, ROTATION_SPEED_DG / 5000));

    linkCameraWithOffset(camera, starCamera, 100);
    linkCameraWithOffset(camera, gridCamera, 1);

    var integratedSnapshots = [];
    var messageLogs = [];
    for (var id in commandLogsByAvatar) {
      integratedSnapshots.push(commandLogsByAvatar[id].integrateIntoSnapshot(currentTime));
      messageLogs.push(messageLogsByAvatar[id]);
    }
    drawProjectionLines(snapshot, camera, gridCamera);
    for (var index in integratedSnapshots) {
      drawProjectionLines(integratedSnapshots[index], camera, gridCamera);
    }
    for (var _index in integratedSnapshots) {
      drawAvatar(integratedSnapshots[_index], camera);
    }
    drawAvatar(snapshot, camera);
    for (var _index2 in messageLogs) {
      if (messageLogs[_index2]) drawMessages(integratedSnapshots[_index2], messageLogs[_index2], camera);
    }
    drawMessages(snapshot, myMessageLog, camera);

    if (currentTime - startTime < 20000) drawTutorial(camera);

    if (shouldSendSnapshot) {
      myCommandLog.insertSnapshot(snapshot);
      socket.emit('snapshot', snapshot);
      shouldSendSnapshot = false;
    }
  }

  window.requestAnimationFrame(frameLoop);
};

// ---------- Init ---------- //

// Called on window load
var init = function init() {
  socket = io.connect();

  canvas = document.querySelector('#mainCanvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  window.addEventListener('resize', function () {
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
  socket.on('commandInfo', function (data) {
    if (!commandLogsByAvatar[data.id]) commandLogsByAvatar[data.id] = new CommandLog();
    commandLogsByAvatar[data.id].insertCommand(data);
  });

  // On receiving a snapshot from another player
  socket.on('snapshot', function (data) {
    if (!commandLogsByAvatar[data.id]) commandLogsByAvatar[data.id] = new CommandLog();
    commandLogsByAvatar[data.id].insertSnapshot(Snapshot.createFromObject(data));
  });

  // On receiving initial positioning data from the server, either for us or another player
  socket.on('initial', function (data) {
    if (data.id) {
      // If it has ID it's not ours
      shouldSendSnapshot = true; // We need to send a snapshot when a new user connects so they can start rendering us
      commandLogsByAvatar[data.id] = new CommandLog();
      commandLogsByAvatar[data.id].insertSnapshot(new Snapshot(new WorldState(data.x, data.y, data.rotation), new InputState(false, false, false, false), data.time, data.color));
    } else {
      myCommandLog = new CommandLog();
      myCommandLog.insertSnapshot(new Snapshot(new WorldState(data.x, data.y, data.rotation), new InputState(false, false, false, false), data.time, data.color));
      startTime = Date.now();
    }
  });

  // On receiving a chat message from another player
  socket.on('message', function (data) {
    if (!messageLogsByAvatar[data.id]) messageLogsByAvatar[data.id] = new MessageLog();
    data.time = Date.now();
    messageLogsByAvatar[data.id].insertMessage(data);
  });

  // On another player disconnecting
  socket.on('terminate', function (data) {
    delete commandLogsByAvatar[data.id];
    delete messageLogsByAvatar[data.id];
  });

  // On us disconnecting
  socket.on('disconnect', function () {
    clearObject(commandLogsByAvatar);
    clearObject(messageLogsByAvatar);
  });

  window.addEventListener('keydown', keyHandler.bind(null, true));
  window.addEventListener('keyup', keyHandler.bind(null, false));

  window.requestAnimationFrame(frameLoop);
};

window.onload = init;
