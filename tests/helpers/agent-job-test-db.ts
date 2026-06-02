import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import * as schema from "../../src/main/lib/db/schema"

export function createAgentJobTestDb() {
  const sqlite = new Database(":memory:")
  sqlite.exec("PRAGMA journal_mode = WAL")
  sqlite.exec("PRAGMA busy_timeout = 5000")
  sqlite.exec("PRAGMA foreign_keys = ON")
  sqlite.exec(`
    CREATE TABLE projects (
      id text PRIMARY KEY NOT NULL,
      name text DEFAULT 'Project' NOT NULL,
      path text DEFAULT '/tmp/project' NOT NULL,
      created_at integer,
      updated_at integer,
      git_remote_url text,
      git_provider text,
      git_owner text,
      git_repo text,
      icon_path text
    );
    CREATE TABLE chats (
      id text PRIMARY KEY NOT NULL,
      name text,
      project_id text DEFAULT 'project-1' NOT NULL,
      worktree_path text,
      created_at integer,
      updated_at integer,
      archived_at integer,
      branch text,
      base_branch text,
      pr_url text,
      pr_number integer,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE cascade
    );
    CREATE TABLE sub_chats (
      id text PRIMARY KEY NOT NULL,
      name text,
      chat_id text DEFAULT 'chat-1' NOT NULL,
      session_id text,
      stream_id text,
      mode text DEFAULT 'agent' NOT NULL,
      messages text DEFAULT '[]' NOT NULL,
      created_at integer,
      updated_at integer,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE cascade
    );
    CREATE TABLE agent_jobs (
      id text PRIMARY KEY NOT NULL,
      retry_of_job_id text,
      attempt integer DEFAULT 1 NOT NULL,
      source text NOT NULL,
      runtime text NOT NULL,
      status text DEFAULT 'queued' NOT NULL,
      mode text DEFAULT 'agent' NOT NULL,
      cwd text NOT NULL,
      project_id text,
      chat_id text,
      sub_chat_id text,
      prompt_preview text,
      input_json text,
      created_at integer,
      started_at integer,
      finished_at integer,
      exit_code integer,
      error_code text,
      error_message text,
      result_json text,
      created_by_version text,
      worker_id text,
      worker_pid integer,
      worker_started_at integer,
      heartbeat_at integer,
      cancel_requested_at integer,
      cancel_requested_by text,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE set null,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE set null,
      FOREIGN KEY (sub_chat_id) REFERENCES sub_chats(id) ON DELETE set null
    );
    CREATE INDEX agent_jobs_status_idx ON agent_jobs (status);
    CREATE INDEX agent_jobs_source_idx ON agent_jobs (source);
    CREATE INDEX agent_jobs_runtime_idx ON agent_jobs (runtime);
    CREATE INDEX agent_jobs_cwd_idx ON agent_jobs (cwd);
    CREATE INDEX agent_jobs_created_at_idx ON agent_jobs (created_at);
    CREATE INDEX agent_jobs_heartbeat_at_idx ON agent_jobs (heartbeat_at);
    CREATE TABLE agent_job_events (
      id text PRIMARY KEY NOT NULL,
      job_id text NOT NULL,
      sequence integer NOT NULL,
      type text NOT NULL,
      payload_json text DEFAULT '{}' NOT NULL,
      created_at integer,
      FOREIGN KEY (job_id) REFERENCES agent_jobs(id) ON DELETE cascade
    );
    CREATE UNIQUE INDEX agent_job_events_job_sequence_idx
      ON agent_job_events (job_id, sequence);
    CREATE INDEX agent_job_events_job_created_at_idx
      ON agent_job_events (job_id, created_at);
  `)
  return drizzle(sqlite, { schema })
}
