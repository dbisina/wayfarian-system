const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');

// Schedule task to run every day at 8:00 AM
// Format: second (optional) minute hour day-of-month month day-of-week
const SCHEDULE = '0 8 * * *';

console.log(`Starting scheduler. Migration will run daily at 8:00 AM (${SCHEDULE})`);

cron.schedule(SCHEDULE, () => {
  console.log('Running scheduled database migration...');
  
  const scriptPath = path.join(__dirname, 'migrate-db.js');
  const migration = spawn('node', [scriptPath], {
    stdio: 'inherit',
    env: process.env
  });

  migration.on('close', (code) => {
    if (code === 0) {
      console.log('Scheduled migration completed successfully.');
    } else {
      console.error(`Scheduled migration failed with code ${code}.`);
    }
  });
});
