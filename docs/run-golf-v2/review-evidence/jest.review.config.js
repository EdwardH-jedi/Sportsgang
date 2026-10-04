const path = require('path');
const mobile = path.resolve(__dirname, '../../../.claude/worktrees/run-golf-v2/apps/mobile');
module.exports = {
  ...require(path.join(mobile, 'jest.config.js')),
  rootDir: mobile,
  roots: [path.join(mobile, 'src'), __dirname],
  testMatch: [path.join(__dirname, '*.acceptance.test.js')],
  moduleDirectories: [path.resolve(mobile, '../../node_modules'), 'node_modules'],
};
