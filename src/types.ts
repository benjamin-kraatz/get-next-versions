export const nonScopeBehaviors = ["bump", "ignore"] as const;
export type NonScopeBehavior = (typeof nonScopeBehaviors)[number];

export interface Config {
  versionedPackages: Package[];
  /**
   * Determines the behavior when a commit message does not contain a scope.
   * It defaults to "bump", which means the commit will be treated as a version bump,
   * if it contains one of the conventional commit types.
   *
   * "ignore" will not treat this commit as a version bump for a package
   * that is not in the scope.
   * @default "bump"
   */
  nonScopeBehavior?: NonScopeBehavior;
}

export interface Package {
  name: string;
  tagPrefix: string;
  directory: string;
  dependsOn: string[];
}

export interface VersionChanges {
  major: boolean;
  minor: boolean;
  patch: boolean;
}

export interface VersionUpdate {
  tagPrefix: string;
  currentVersion: string;
  nextVersion: string;
  hasChanges: boolean;
  changes: CommitInfo[];
}

export interface CommitInfo {
  hash: string;
  message: string;
  type: string;
  breaking: boolean;
  reasons: string[];
}

export interface CommitMessage {
  hash: string;
  message: string;
}
