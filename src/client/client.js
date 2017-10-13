let socket;
let canvas;
let context;

const init = () => {
  socket = io.connect();

  canvas = document.querySelector('#mainCanvas');
  context = canvas.getContext('2d');
};

window.onload = init;
