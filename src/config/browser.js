const os = require('os');
const path = require('path');

const chromeUserDataDir = process.platform === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data')
  : process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome')
    : path.join(os.homedir(), '.config', 'google-chrome');

module.exports = {
  USER_DATA_DIR: process.env.CHROME_USER_DATA_DIR || chromeUserDataDir,
  PROFILE_DIR: process.env.CHROME_PROFILE_DIR || 'Profile 1',
};
