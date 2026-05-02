const Redis = require('ioredis');

// Shared Redis connection logic
const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  lazyConnect: false,
  connectTimeout: 2000, 
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    const delay = Math.min(times * 500, 5000);
    return delay;
  },
};


const connection = new Redis(redisConfig);

connection.on('error', (err) => {
  // Silent error unless explicitly debugging to prevent terminal spam
  if (process.env.DEBUG_REDIS) {
    console.error('[REDIS] Connection Error:', err.message);
  }
});

connection.on('connect', () => {
  console.log('[REDIS] Connected successfully to Redis');
});

module.exports = {
  connection,
  redisConfig
};
