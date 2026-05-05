// PM2 ecosystem for the natively-managed agent.
//
// Env vars are loaded from packages/agent/agent.env (gitignored, written by
// scripts/setup-agent-pm2.sh).

const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const envFile = join(__dirname, 'agent.env');
const env = { NODE_ENV: 'production' };

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) env[key] = value;
  }
}

module.exports = {
  apps: [
    {
      name: 'home-server-beacon',
      script: 'dist/index.js',
      cwd: __dirname,
      env,
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '500M',
      time: true, // include timestamps in logs
    },
  ],
};
