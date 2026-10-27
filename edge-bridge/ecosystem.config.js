module.exports = {
  apps: [
    {
      name: 'mosa-edge',
      script: 'src/index.js',
      cwd: '/Users/apple/Downloads/Mosaik-WMS/edge-bridge',
      // Load env dari .env file
      env_file: '.env',
      // Auto-restart saat crash
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      // Restart delay (ms) supaya reader punya waktu reconnect
      restart_delay: 3000,
      // Logging
      out_file: '/Users/apple/.pm2/logs/mosa-edge-out.log',
      error_file: '/Users/apple/.pm2/logs/mosa-edge-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
