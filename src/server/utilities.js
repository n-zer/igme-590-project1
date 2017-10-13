const getRandomInt = (min, max) => Math.floor(Math.random() * ((max - min) + 1)) + min;

const getRandomBrightColor = () => {
	return `hsl(${getRandomInt(0,359)}, 100%, 50%)`;
};

module.exports = {
  getRandomInt,
  getRandomBrightColor
};
