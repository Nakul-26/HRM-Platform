import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @hrm/ui ships raw .tsx source (workspace convention, see
  // docs/architecture/09-folder-structure.md) — Next only transpiles
  // workspace packages it's explicitly told about.
  transpilePackages: ["@hrm/ui"],
  // Don't auto-generate AGENTS.md/CLAUDE.md — this repo doesn't use per-app agent files.
  agentRules: false,
};

export default nextConfig;
