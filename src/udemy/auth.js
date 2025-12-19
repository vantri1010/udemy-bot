const readline = require('readline');
const { FILES } = require('../config/paths');
const { writeJson, readJson } = require('../utils/fsUtils');

async function ensureUdemyLogin(browser) {
  const loginPage = await browser.newPage();

  try {
    const existingCookies = readJson(FILES.UDEMY_COOKIES);
    if (Array.isArray(existingCookies) && existingCookies.length) {
      console.log('🍪 Found existing Udemy cookies');
      await loginPage.setCookie(...existingCookies);
      console.log('🍪 Loaded Udemy cookies');
      return;
    }

    console.log('🍪 No existing Udemy cookies found');
    console.log('\n🔑 FIRST RUN - PLEASE LOGIN TO UDEMY');
    console.log('📱 Browser will open Udemy login page');
    console.log('⏳ Please login and press Enter to continue...\n');

    await loginPage.goto('https://www.udemy.com/', { waitUntil: 'networkidle2' });

    await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('Press Enter when login is complete: ', () => { rl.close(); resolve(); });
    });

    const cookies = await loginPage.cookies();
    writeJson(FILES.UDEMY_COOKIES, cookies );
    console.log('✅ Saved Udemy cookies\n');
  } finally {
    await loginPage.close();
  }
}

module.exports = { ensureUdemyLogin };
