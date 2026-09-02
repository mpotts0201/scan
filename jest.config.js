// Jest config for Expo SDK 54. Kept deliberately minimal:
// - `jest-expo` supplies transform, transformIgnorePatterns, the RN test
//   environment, and the Expo/RN native-module mocks.
// - No setup file: RNTL >= 12.4 registers its matchers and auto-cleanup itself.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.expo/'],
};
