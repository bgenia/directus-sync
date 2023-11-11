import 'reflect-metadata';
import {
  disposeContext,
  initContext,
  loadCollections,
  logEndAndClose,
  logErrorAndStop,
  SnapshotClient,
} from './lib';
import { Container } from 'typedi';
import pino from 'pino';

async function run() {
  const logger = Container.get('logger') as pino.Logger;

  // Snapshot
  logger.info(`---- Restore schema ----`);
  await Container.get(SnapshotClient).restore();

  // Collections
  const collections = loadCollections();

  // Clean up the collections (dangling id maps, etc.)
  logger.info(`---- Clean up collections ----`);
  for (const collection of collections) {
    await collection.cleanUp();
  }

  // Restore collections until there is nothing to restore
  let stop = false;
  let index = 1;
  while (!stop) {
    logger.info(`---- Restore: iteration ${index++} ----`);
    stop = true;
    for (const collection of collections) {
      const retry = await collection.restore();
      if (retry) {
        stop = false;
      }
    }
    index++;
  }
}

initContext()
  .then(run)
  .catch(logErrorAndStop)
  .then(disposeContext)
  .then(logEndAndClose);
