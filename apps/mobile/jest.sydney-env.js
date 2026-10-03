/**
 * Jest environment for test files that need a phone set to Sydney time
 * (docs/run-golf-v2/CONTRACTS.md §9). The zone belongs to the worker process,
 * so it is set here, before the file's code runs, and restored afterwards;
 * assigning process.env.TZ inside a test does not change it. Opt in with a
 * docblock at the very top of the test file:
 *
 *   /** @jest-environment ./jest.sydney-env.js *\/
 */

const ReactNativeEnv = require('react-native/jest/react-native-env.js');

module.exports = class SydneyEnv extends ReactNativeEnv {
  async setup() {
    this.previousTZ = process.env.TZ;
    process.env.TZ = 'Australia/Sydney';
    await super.setup();
  }

  async teardown() {
    if (this.previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = this.previousTZ;
    await super.teardown();
  }
};
