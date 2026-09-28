/**
 * PM2 Ecosystem Configuration for MOSA IoT RFID Gate Bridge
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 stop ecosystem.config.js
 *   pm2 restart ecosystem.config.js
 *   pm2 logs mosa-edge-bridge
 */

module.exports = {
  apps: [
    {
      name: 'mosa-edge-bridge',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 2077,
        WS_PORT: 2078,
      },
      error_file: './logs/edge-bridge-error.log',
      out_file: './logs/edge-bridge-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      kill_timeout: 3000,
      restart_delay: 2000,
    },
  ],
};
