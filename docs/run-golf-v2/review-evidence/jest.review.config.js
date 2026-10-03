const path = require('path');
const fs = require('fs');
const root = path.resolve(__dirname, '../../..');
const nested = path.join(root, '.claude/worktrees/run-golf-v2');
const target = fs.existsSync(path.join(nested, 'apps/mobile')) ? nested : root;
const mobile = path.join(target, 'apps/mobile');
module.exports = {
  ...require(path.join(mobile, 'jest.config.js')),
  rootDir: mobile,
  moduleNameMapper: {
    '^review-api$': path.join(mobile, 'src/lib/api.ts'),
    '^review-explore$': path.join(mobile, 'src/stores/explore.ts'),
    '^review-profile$': path.join(mobile, 'src/stores/profile.ts'),
  },
  roots: [path.join(mobile, 'src'), __dirname],
  testMatch: [path.join(__dirname, '*.acceptance.test.js')],
  moduleDirectories: [path.resolve(mobile, '../../node_modules'), 'node_modules'],
};
