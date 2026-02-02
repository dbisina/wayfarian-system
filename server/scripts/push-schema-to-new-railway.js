// Push schema to new Railway database
// Does NOT load .env - sets DATABASE_URL directly
const { execSync } = require('child_process');

const TARGET_URL = "postgresql://postgres:bQyhkychxbMdvTmVEUJtuBHtKbEqZynG@mainline.proxy.rlwy.net:52999/railway";

console.log('🔧 Pushing schema to new Railway database...');
console.log('Target:', TARGET_URL.replace(/:[^:]*@/, ':****@'));

// Create a clean env without loading .env file
const cleanEnv = {
    PATH: process.env.PATH,
    DATABASE_URL: TARGET_URL,
    DIRECT_URL: TARGET_URL,
};

try {
    execSync(`npx prisma db push --accept-data-loss --skip-generate`, {
        env: cleanEnv,
        stdio: 'inherit',
        cwd: process.cwd()
    });
    console.log('✅ Schema pushed successfully!');
} catch (error) {
    console.error('❌ Failed to push schema:', error.message);
    process.exit(1);
}
