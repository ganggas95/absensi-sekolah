const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const mobileNodeModules = path.resolve(projectRoot, 'node_modules');
const assetRegistryPath = require.resolve(
    '@react-native/assets-registry/registry',
    { paths: [projectRoot] }
);

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [mobileNodeModules];
config.resolver.disableHierarchicalLookup = false;
config.resolver.assetRegistryPath = assetRegistryPath;
config.resolver.extraNodeModules = {
    'react-native': path.join(mobileNodeModules, 'react-native'),
    '@react-native/assets-registry': path.join(
        mobileNodeModules,
        '@react-native/assets-registry'
    ),
};

module.exports = config;
