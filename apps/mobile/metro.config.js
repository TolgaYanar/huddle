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

// 2b. Explicitly map hoisted React Native subpackages.
// RN 0.81+ imports @react-native/virtualized-lists from inside react-native.
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  "@react-native/virtualized-lists": path.resolve(
    workspaceRoot,
    "node_modules/@react-native/virtualized-lists"
  ),
};

// 3. Force Metro to resolve (sub)dependencies from the `nodeModulesPaths`
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
