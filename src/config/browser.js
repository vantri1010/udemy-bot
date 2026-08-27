const os = require('os');
const path = require('path');

const botUserDataDir = process.platform === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Local', 'udemy-bot-chrome')
  : process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'udemy-bot-chrome')
    : path.join(os.homedir(), '.config', 'udemy-bot-chrome');

module.exports = {
  USER_DATA_DIR: process.env.CHROME_USER_DATA_DIR || botUserDataDir,
  PROFILE_DIR: process.env.CHROME_PROFILE_DIR || 'Default',
};
