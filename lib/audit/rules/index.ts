import type { AuditRule } from '../types';
import { colorRules } from './color';
import { docStructureRules } from './doc-structure';
import { formRules } from './forms';
import { headingRules } from './headings';
import { imageRules } from './images';
import { linkRules } from './links';
import { listRules } from './lists';
import { metadataRules } from './metadata';
import { tableRules } from './tables';

export const allRules: AuditRule[] = [
  ...docStructureRules,
  ...headingRules,
  ...imageRules,
  ...tableRules,
  ...listRules,
  ...linkRules,
  ...colorRules,
  ...formRules,
  ...metadataRules
];
