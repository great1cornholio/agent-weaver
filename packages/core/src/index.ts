/**
 * @composio/ao-core
 *
 * Core library for the Agent Orchestrator.
 * Exports all types, config loader, and service implementations.
 */

// Types — everything plugins and consumers need
export * from "./types.js";

// Config — YAML loader + validation
export {
  loadConfig,
  loadConfigWithPath,
  validateConfig,
  getDefaultConfig,
  findConfig,
  findConfigFile,
} from "./config.js";

// Plugin registry
export { createPluginRegistry } from "./plugin-registry.js";

// Metadata — flat-file session metadata read/write
export {
  readMetadata,
  readMetadataRaw,
  writeMetadata,
  updateMetadata,
  deleteMetadata,
  listMetadata,
} from "./metadata.js";

// tmux — command wrappers
export {
  isTmuxAvailable,
  listSessions as listTmuxSessions,
  hasSession as hasTmuxSession,
  newSession as newTmuxSession,
  sendKeys as tmuxSendKeys,
  capturePane as tmuxCapturePane,
  killSession as killTmuxSession,
  getPaneTTY as getTmuxPaneTTY,
} from "./tmux.js";

// Session manager — session CRUD
export { createSessionManager } from "./session-manager.js";
export type { SessionManagerDeps } from "./session-manager.js";

// Lifecycle manager — state machine + reaction engine
export { createLifecycleManager } from "./lifecycle-manager.js";
export type { LifecycleManagerDeps } from "./lifecycle-manager.js";

// Prompt builder — layered prompt composition
export { buildPrompt, BASE_AGENT_PROMPT } from "./prompt-builder.js";
export type { PromptBuildConfig } from "./prompt-builder.js";

// Orchestrator prompt — generates orchestrator context for `ao start`
export { generateOrchestratorPrompt } from "./orchestrator-prompt.js";
export type { OrchestratorPromptConfig } from "./orchestrator-prompt.js";

// Shared utilities
export { shellEscape, escapeAppleScript, validateUrl, readLastJsonlEntry } from "./utils.js";

// Path utilities — hash-based directory structure
export {
  generateConfigHash,
  generateProjectId,
  generateInstanceId,
  generateSessionPrefix,
  getProjectBaseDir,
  getSessionsDir,
  getWorktreesDir,
  getArchiveDir,
  getOriginFilePath,
  generateSessionName,
  generateTmuxName,
  parseTmuxName,
  expandHome,
  validateAndStoreOrigin,
} from "./paths.js";

// Structured event logging (Epic 1)
export { appendStructuredEvent, getEventLogPath } from "./event-log.js";
export type { StructuredEventLogEntry } from "./event-log.js";

// Epic 2 core pipeline primitives
export {
  validateSubtaskPlan,
  topologicalSortSubtasks,
  buildExecutionLayers,
} from "./pipeline-plan.js";
export type { Subtask, SubtaskPlan, PipelineAgentType } from "./pipeline-plan.js";
export { TaskPipelineManager } from "./pipeline-manager.js";
export type {
  TddMode,
  TddGuardResult,
  PipelineTddGuard,
  PipelineCheckpointState,
  PipelineCheckpointStore,
  TaskPipelineManagerOptions,
  PipelineExecutionResult,
} from "./pipeline-manager.js";
export { PipelineCheckpointManager, hashSubtaskPlan } from "./pipeline-checkpoint.js";
export type { PipelineCheckpoint, SubtaskCheckpointResult } from "./pipeline-checkpoint.js";

// Test command resolution (Epic 3)
export { resolveTestCommand } from "./test-command.js";
export type { ResolvedTestCommand, TestCommandSource } from "./test-command.js";
