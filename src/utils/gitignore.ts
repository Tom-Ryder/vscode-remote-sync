import * as fs from 'fs/promises';
import { minimatch } from 'minimatch';
import * as path from 'path';

export class GitignoreParser {
  private patterns: string[] = [];
  private negativePatterns: string[] = [];

  static async load(workspacePath: string): Promise<GitignoreParser | null> {
    const gitignorePath = path.join(workspacePath, '.gitignore');
    try {
      const content = await fs.readFile(gitignorePath, 'utf8');
      return new GitignoreParser(content);
    } catch {
      return null;
    }
  }

  constructor(content: string) {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      if (trimmed.startsWith('!')) {
        this.negativePatterns.push(trimmed.slice(1));
      } else {
        this.patterns.push(trimmed);
      }
    }
  }

  isIgnored(relativePath: string): boolean {
    for (const pattern of this.negativePatterns) {
      if (this.matchesPattern(relativePath, pattern)) {
        return false;
      }
    }

    for (const pattern of this.patterns) {
      if (this.matchesPattern(relativePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  private matchesPattern(relativePath: string, pattern: string): boolean {
    if (pattern.endsWith('/')) {
      return relativePath.startsWith(pattern) || minimatch(relativePath + '/', pattern);
    }

    if (pattern.startsWith('/')) {
      return minimatch(relativePath, pattern.slice(1));
    }

    if (pattern.includes('/')) {
      return minimatch(relativePath, pattern) || minimatch(relativePath, '**/' + pattern);
    }

    return minimatch(relativePath, pattern) || minimatch(relativePath, '**/' + pattern);
  }
}
