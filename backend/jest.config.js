/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: { emitDecoratorMetadata: true, experimentalDecorators: true } }],
  },
  moduleFileExtensions: ["ts", "js", "json"],
  collectCoverageFrom: ["**/*.ts", "!**/*.spec.ts", "!**/*.module.ts"],
}
