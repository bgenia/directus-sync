import { Inject, Service } from 'typedi';
import { MigrationClient } from '../migration-client';
import {schemaApply, schemaDiff, schemaSnapshot} from '@directus/sdk';
import path from 'path';
import type { SnapshotConfig } from '../../config';
import { Collection, Field, Relation, Snapshot } from './interfaces';
import {
  mkdirpSync,
  readJsonSync,
  removeSync,
  writeJsonSync,
} from 'fs-extra';
import { LOGGER, SNAPSHOT_CONFIG } from '../../constants';
import pino from 'pino';
import {getChildLogger, loadJsonFilesRecursively} from '../../helpers';

const SNAPSHOT_JSON = 'snapshot.json';
const INFO_JSON = 'info.json';
const COLLECTIONS_DIR = 'collections';
const FIELDS_DIR = 'fields';
const RELATIONS_DIR = 'relations';

@Service()
export class SnapshotClient {
  protected readonly dumpPath: string;

  protected readonly splitFiles: boolean;

  protected readonly logger: pino.Logger;

  constructor(
    @Inject(SNAPSHOT_CONFIG) config: SnapshotConfig,
    @Inject(LOGGER) baseLogger: pino.Logger,
    protected readonly migrationClient: MigrationClient,
  ) {
    this.logger = getChildLogger(baseLogger, 'snapshot');
    this.dumpPath = config.dumpPath;
    this.splitFiles = config.splitFiles;
  }

  /**
   * Save the snapshot to the dump file.
   */
  async dump() {
    const snapshot = await this.getSnapshot();
    const numberOfFiles = this.saveData(snapshot);
    this.logger.debug(
      `Saved ${numberOfFiles} file${numberOfFiles > 1 ? 's' : ''} to ${
        this.dumpPath
      }`,
    );
  }

  /**
   * Get the snapshot from the Directus instance.
   */
  protected async getSnapshot() {
    const directus = await this.migrationClient.getClient();
    return await directus.request<Snapshot>(schemaSnapshot()); // Get better types
  }

  /**
   * Save the data to the dump file. The data is passed through the data transformer.
   * Returns the number of saved items.
   */
  protected saveData(data: Snapshot): number {
    // Clean directory
    removeSync(this.dumpPath);
    mkdirpSync(this.dumpPath);
    // Save data
    if (this.splitFiles) {
      const files = this.decomposeData(data);
      for (const file of files) {
        const filePath = path.join(this.dumpPath, file.path);
        const dirPath = path.dirname(filePath);
        mkdirpSync(dirPath);
        writeJsonSync(filePath, file.content, { spaces: 2 });
      }
      return files.length;
    } else {
      const filePath = path.join(this.dumpPath, SNAPSHOT_JSON);
      writeJsonSync(filePath, data, { spaces: 2 });
      return 1;
    }
  }

  /**
   * Decompose the snapshot into a collection of files.
   */
  protected decomposeData(data: Snapshot): { path: string; content: any }[] {
    const { collections, fields, relations, ...info } = data;

    const files: { path: string; content: any }[] = [
      { path: INFO_JSON, content: info },
    ];

    // Split collections
    for (const collection of collections) {
      files.push({
        path: `${COLLECTIONS_DIR}/${collection.collection}.json`,
        content: collection,
      });
    }
    // Split fields
    for (const field of fields) {
      files.push({
        path: `${FIELDS_DIR}/${field.collection}/${field.field}.json`,
        content: field,
      });
    }
    // Split relations
    for (const relation of relations) {
      files.push({
        path: `${RELATIONS_DIR}/${relation.collection}/${relation.field}.json`,
        content: relation,
      });
    }

    return files;
  }

  /**
   * Restore the snapshot from the dump file.
   */
  async restore() {
    const diff = await this.diffSnapshot();
    if (typeof diff === 'undefined') {
      this.logger.info('No changes to apply');
    } else {
      const directus = await this.migrationClient.getClient();
      await directus.request(schemaApply(diff));
      this.logger.info('Changes applied');
    }
  }

  /**
   * Restore the snapshot from the dump file.
   */
  async plan() {
    const diff = await this.diffSnapshot();
    if (typeof diff === 'undefined') {
      this.logger.info('No changes to apply');
    } else {
      const { collections, fields, relations } = diff.diff;
        this.logger.info(
            `Found ${collections.length} change${collections.length > 1 ? 's' : ''} in collections`,
        );
        this.logger.info(
            `Found ${fields.length} change${fields.length > 1 ? 's' : ''} in fields`,
        );
        this.logger.info(
            `Found ${relations.length} change${relations.length > 1 ? 's' : ''} in relations`,
        );
        this.logger.debug(diff, 'Diff');
    }
  }

  /**
   * Restore the snapshot from the dump file.
   */
  protected async diffSnapshot() {
    const directus = await this.migrationClient.getClient();
    const snapshot = this.loadData();
    return await directus.request(schemaDiff(snapshot));
  }

  /**
   * Load the snapshot from the dump file of the decomposed files.
   */
  protected loadData(): Snapshot {
    if (this.splitFiles) {
      const collections = loadJsonFilesRecursively<Collection>(
        path.join(this.dumpPath, COLLECTIONS_DIR),
      );
      const fields = loadJsonFilesRecursively<Field>(
        path.join(this.dumpPath, FIELDS_DIR),
      );
      const relations = loadJsonFilesRecursively<Relation>(
        path.join(this.dumpPath, RELATIONS_DIR),
      );
      const info = readJsonSync(path.join(this.dumpPath, INFO_JSON)) as Omit<
        Snapshot,
        'collections' | 'fields' | 'relations'
      >;
      return { ...info, collections, fields, relations };
    } else {
      const filePath = path.join(this.dumpPath, SNAPSHOT_JSON);
      return readJsonSync(filePath, 'utf-8') as Snapshot;
    }
  }
}
