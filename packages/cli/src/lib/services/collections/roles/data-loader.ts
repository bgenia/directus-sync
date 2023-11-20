import { DataLoader } from '../base';
import { Inject, Service } from 'typedi';
import { ROLES_COLLECTION } from './constants';
import path from 'path';
import type { CollectionsConfig } from '../../../config';
import { COLLECTIONS_CONFIG } from '../../../constants';
import { DirectusRole } from './interfaces';

@Service()
export class RolesDataLoader extends DataLoader<DirectusRole> {
  constructor(@Inject(COLLECTIONS_CONFIG) config: CollectionsConfig) {
    const filePath = path.join(config.dumpPath, `${ROLES_COLLECTION}.json`);
    super(filePath);
  }
}