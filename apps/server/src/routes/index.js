const { registerHealthRoutes } = require("./health");
const { registerAuthRoutes } = require("./auth");
const { registerSavedRoomsRoutes } = require("./savedRooms");

function registerRoutes(app, deps) {
  registerHealthRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerSavedRoomsRoutes(app, deps);
}

module.exports = {
  registerRoutes,
};
