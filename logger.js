// logger.js
const { createLogger, transports, format } = require('winston');
const path = require('path');

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ level, message, timestamp }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
  ),
  transports: [
    new transports.File({ filename: path.join(__dirname, 'logs/server.log'), level: 'info' }),
    new transports.File({ filename: path.join(__dirname, 'logs/error.log'), level: 'error' })
  ]
});

module.exports = logger;
