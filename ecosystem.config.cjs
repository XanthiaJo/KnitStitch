/**
 * PM2 ecosystem config for the KnitStitch webhook server.
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup   # follow the printed instructions to enable boot-time startup
 */
module.exports = {
  apps: [
    {
      name: 'knitstitch-webhook',
      script: 'scripts/webhook-server.mjs',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '100M',
      env: {
        WEBHOOK_PORT: 3001,
      },
    },
  ],
};
