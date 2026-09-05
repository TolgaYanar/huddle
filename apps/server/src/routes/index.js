const { registerHealthRoutes } = require("./health");
const { registerAuthRoutes } = require("./auth");
const { registerSavedRoomsRoutes } = require("./savedRooms");
const { registerTelemetryRoutes } = require("./telemetry");
const { registerIceRoutes } = require("./ice");

function registerRoutes(app, deps) {
  registerHealthRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerSavedRoomsRoutes(app, deps);
  registerTelemetryRoutes(app, deps);
  registerIceRoutes(app, deps);
}

module.exports = {
  registerRoutes,
};
