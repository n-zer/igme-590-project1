"use strict";

var socket = void 0;
var canvas = void 0;
var context = void 0;

var keyToCommand = {
  down: {
    w: "MOVE_FORWARD_START",
    a: "MOVE_LEFT_START",
    s: "MOVE_BACKWARD_START",
    d: "MOVE_RIGHT_START"
  },
  up: {
    w: "MOVE_FORWARD_STOP",
    a: "MOVE_LEFT_STOP",
    s: "MOVE_BACKWARD_STOP",
    d: "MOVE_RIGHT_STOP"
  }
};

var keyHandler = function keyHandler(direction, e) {
  console.log('input registered');
  var command = keyToCommand[direction][e.key];
  if (command && e.repeat == false) {
    console.log("valid command " + command);
    socket.emit('commandServer', { command: command });
  }
};

var init = function init() {
  socket = io.connect();

  canvas = document.querySelector('#mainCanvas');
  context = canvas.getContext('2d');

  socket.on('commandClient', function (data) {
    console.log("Command " + data.command + " from " + data.id);
  });

  window.addEventListener('keydown', keyHandler.bind(null, 'down'));
  window.addEventListener('keyup', keyHandler.bind(null, 'up'));
};

window.onload = init;
