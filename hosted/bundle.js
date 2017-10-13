'use strict';

var socket = void 0;
var canvas = void 0;
var context = void 0;

var init = function init() {
  socket = io.connect();

  canvas = document.querySelector('#mainCanvas');
  context = canvas.getContext('2d');
};

window.onload = init;
