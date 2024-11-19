import { jest } from "@jest/globals";

const mockConfig = {
  versionedPackages: [
    {
      name: "app",
      tagPrefix: "app-v",
      directory: "apps/web",
      dependsOn: ["packages/ui"],
    },
    {
      name: "docs",
      tagPrefix: "docs-v",
      directory: "apps/docs",
      dependsOn: ["packages/*"],
    },
  ],
};

// Mock child_process before imports
jest.unstable_mockModule("node:child_process", () => ({
  execSync: jest.fn(),
}));

jest.unstable_mockModule("fs", () => ({
  readFileSync: jest.fn(() => JSON.stringify(mockConfig)),
}));

// Import mocked modules
const { execSync } = await import("node:child_process");

// Import the functions after setting up mocks
const { getLastTag, getCurrentVersion, determineNextVersion, createVersion } =
  await import("../dist/index.js");

describe("Release Check", () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe("getLastTag", () => {
    it("should return the last tag when it exists", () => {
      execSync.mockReturnValueOnce("app-v1.0.0\n");

      const result = getLastTag("app-v");
      expect(result).toBe("app-v1.0.0");
      expect(execSync).toHaveBeenCalledWith(
        'git describe --tags --match "app-v*" --abbrev=0 2>/dev/null',
      );
    });

    it("should return undefined when no tag exists", () => {
      execSync.mockImplementationOnce(() => {
        throw new Error("No tags found");
      });

      const result = getLastTag("app-v");
      expect(result).toBeUndefined();
    });
  });

  describe("getCurrentVersion", () => {
    it("should return current version from tag", () => {
      execSync.mockReturnValueOnce(Buffer.from("app-v1.2.3\n"));

      const result = getCurrentVersion("app-v");
      expect(result).toBe("1.2.3");
    });

    it("should return 0.0.0 when no tag exists", () => {
      execSync.mockImplementationOnce(() => {
        throw new Error("No tags found");
      });

      const result = getCurrentVersion("app-v");
      expect(result).toBe("0.0.0");
    });
  });

  describe("determineNextVersion", () => {
    it("should detect major version bump for breaking changes", () => {
      const commits = [
        { message: "feat!: breaking change" },
        { message: "fix: minor fix" },
      ];

      const result = determineNextVersion(commits.map((c) => c.message));
      expect(result).toEqual({
        major: true,
        minor: false,
        patch: true,
      });
    });

    it("should detect minor version bump for new features", () => {
      const commits = [
        { message: "feat: new feature" },
        { message: "fix: minor fix" },
      ];

      const result = determineNextVersion(commits.map((c) => c.message));
      expect(result).toEqual({
        major: false,
        minor: true,
        patch: true,
      });
    });

    it("should detect patch version bump for fixes", () => {
      const commits = [
        { message: "fix: bug fix" },
        { message: "chore: update dependencies" },
      ];

      const result = determineNextVersion(commits.map((c) => c.message));
      expect(result).toEqual({
        major: false,
        minor: false,
        patch: true,
      });
    });
  });

  describe("createVersion", () => {
    it("should bump major version for breaking changes", () => {
      const result = createVersion("1.2.3", {
        major: true,
        minor: false,
        patch: false,
      });
      expect(result).toBe("2.0.0");
    });

    it("should bump minor version for new features", () => {
      const result = createVersion("1.2.3", {
        major: false,
        minor: true,
        patch: false,
      });
      expect(result).toBe("1.3.0");
    });

    it("should bump patch version for fixes", () => {
      const result = createVersion("1.2.3", {
        major: false,
        minor: false,
        patch: true,
      });
      expect(result).toBe("1.2.4");
    });

    it("should return the same version when no changes detected", () => {
      const result = createVersion("1.2.3", {
        major: false,
        minor: false,
        patch: false,
      });
      expect(result).toBe("1.2.3");
    });
  });
});
