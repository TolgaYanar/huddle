const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Find the project and workspace directories
const projectRoot = __dirname;
// This can be replaced with `find-yarn-workspace-root`
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages and that we want to use shared node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 2b. Explicitly map hoisted React Native subpackages and WebRTC dependencies
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "@react-native/virtualized-lists": path.resolve(
    workspaceRoot,
    "node_modules/@react-native/virtualized-lists"
  ),
  "event-target-shim": path.resolve(
    workspaceRoot,
    "node_modules/event-target-shim"
  ),
  "webidl-conversions": path.resolve(
    workspaceRoot,
    "node_modules/webidl-conversions"
  ),
  "base64-js": path.resolve(workspaceRoot, "node_modules/base64-js"),
};

// 3. Force Metro to resolve (sub)dependencies from the `nodeModulesPaths`
config.resolver.disableHierarchicalLookup = true;

// 4. Inject custom polyfills first, then React Native's defaults
config.serializer.getPolyfills = () => {
  const defaultPolyfills = require("react-native/rn-get-polyfills")();
  return [path.resolve(projectRoot, "shim.js"), ...defaultPolyfills];
};

module.exports = config;
