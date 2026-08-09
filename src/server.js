'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const config = require('./config/env');
const { testConnection } = require('./config/db');
const routes = require('./routes');
const { uploadDir } = require('./services/upload.service');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');
const { startDispatchWorker } = require('./jobs/dispatch_worker');
const logger = require('./utils/logger');

const app = express();

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(uploadDir));

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap() {
  try {
    await testConnection();
  } catch (err) {
    logger.error('Server not started: database unavailable');
    process.exit(1);
  }

  startDispatchWorker();

  app.listen(config.port, () => {
    logger.info(`Velie Backend listening on port ${config.port} (${config.env})`);
  });
}

bootstrap();

module.exports = app;