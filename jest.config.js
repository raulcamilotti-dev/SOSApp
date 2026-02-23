/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/__tests__"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  // Only run plain .test.ts files (skip Expo/RN component tests)
  testMatch: ["**/__tests__/**/*.test.ts"],
};
