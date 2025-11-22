const fs = require('fs');
const readline = require('readline');
const { FILES } = require('../config/paths');

async function ensureUdemyLogin(browser) {
  const loginPage = await browser.newPage();

  try {
    if (fs.existsSync(FILES.UDEMY_COOKIES)) {
      const cookies = JSON.parse(fs.readFileSync(FILES.UDEMY_COOKIES, 'utf-8'));
      await loginPage.setCookie(...cookies);
      console.log('🍪 Loaded Udemy cookies');
      return;
    }

    console.log('\n🔑 FIRST RUN - PLEASE LOGIN TO UDEMY');
    console.log('📱 Browser will open Udemy login page');
    console.log('⏳ Please login and press Enter to continue...\n');

    await loginPage.goto('https://www.udemy.com/', { waitUntil: 'networkidle2' });

    await new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('Press Enter when login is complete: ', () => { rl.close(); resolve(); });
    });

    const cookies = await loginPage.cookies();
    fs.writeFileSync(FILES.UDEMY_COOKIES, JSON.stringify(cookies, null, 2));
    console.log('✅ Saved Udemy cookies\n');
  } finally {
    await loginPage.close();
  }
}

module.exports = { ensureUdemyLogin };
