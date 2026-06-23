import type { AITrainingMap, CategoryRule, ClassifyResult } from './types.js';
import { CATEGORY_RULES } from './categoryRules.js';

function applyTrain(rule: CategoryRule, train: AITrainingMap | undefined): ClassifyResult {
  const k = rule.cat;
  const dept = (train && train[k]) || rule.dept;
  return {
    category: rule.cat,
    dept,
    department: dept,
    issue: rule.issue,
    forwardDepartment: dept,
    responsibleTeam: dept,
    tags: rule.tags,
  };
}

/**
 * Classify a category string (or free text) into a department / issue.
 * 1) exact category match
 * 2) tag/substring match
 * 3) fallback Other → NCSS / General
 */
export function classify(
  category: string,
  freeText: string,
  train?: AITrainingMap,
): ClassifyResult {
  const cat = (category || '').toLowerCase();
  const text = (freeText || '').toLowerCase();

  for (const r of CATEGORY_RULES) {
    if (r.cat.toLowerCase() === cat) return applyTrain(r, train);
  }
  for (const r of CATEGORY_RULES) {
    if (r.tags && r.tags.some((t) => cat.includes(t) || text.includes(t))) {
      return applyTrain(r, train);
    }
  }
  return { category: category || 'Other', dept: 'NCSS', department: 'NCSS', issue: 'General', forwardDepartment: 'NCSS', responsibleTeam: 'NCSS', tags: [] };
}

export function learn(
  current: AITrainingMap | undefined,
  category: string,
  dept: string,
): AITrainingMap {
  if (!category || !dept) return current || {};
  const next: AITrainingMap = { ...(current || {}) };
  next[category] = dept;
  return next;
}
