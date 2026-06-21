// Defines first-wave PostgreSQL migrations for identity, project, run, and document records.
import type { Queryable } from "./transactions.js";

export const migrationTableName = "schema_migrations";

export const baseSchemaSql = `
create table if not exists users (
  id text primary key,
  email text not null unique,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  status text not null default 'active',
  email_verified boolean not null default false,
  mfa_enabled boolean not null default false,
  mfa_secret text,
  mfa_pending_secret text,
  mfa_pending_expires_at timestamptz,
  system_roles text[] not null default '{}',
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  revoked_at timestamptz
);

create table if not exists login_events (
  id text primary key,
  user_id text references users(id) on delete set null,
  email text,
  outcome text not null,
  ip_address text,
  user_agent text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists auth_tokens (
  id text primary key,
  type text not null,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (type, token_hash)
);

create table if not exists projects (
  id text primary key,
  name text not null,
  description text,
  visibility text not null default 'private',
  status text not null default 'active',
  owner_user_id text not null references users(id),
  organization_id text,
  course_id text,
  class_id text,
  team_id text,
  default_provider_config_id text,
  retention_policy text not null default 'manual',
  background_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organizations (
  id text primary key,
  name text not null,
  code text,
  type text not null default 'school',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists courses (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  code text,
  term text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists classes (
  id text primary key,
  course_id text not null references courses(id) on delete cascade,
  name text not null,
  code text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists teams (
  id text primary key,
  class_id text not null references classes(id) on delete cascade,
  name text not null,
  code text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_memberships (
  id text primary key,
  target_type text not null,
  target_id text not null,
  user_id text references users(id) on delete set null,
  email text,
  display_name text,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quotas (
  id text primary key,
  scope_type text not null,
  scope_id text not null,
  resource text not null,
  limit_count integer not null,
  used_count integer not null default 0,
  reset_period text not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_type, scope_id, resource)
);

create table if not exists project_members (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  user_id text references users(id) on delete set null,
  email text not null,
  display_name text,
  role text not null,
  status text not null default 'invited',
  invited_by_user_id text references users(id) on delete set null,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, email)
);

create table if not exists project_invitation_tokens (
  id text primary key,
  project_member_id text not null references project_members(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  created_by_user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id text primary key,
  actor_user_id text references users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  outcome text not null,
  message text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists risk_events (
  id text primary key,
  event_type text not null,
  severity text not null,
  actor_user_id text references users(id) on delete set null,
  project_id text references projects(id) on delete cascade,
  target_type text not null,
  target_id text,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists provider_configs (
  id text primary key,
  name text not null,
  provider text not null,
  base_url text not null,
  default_model text not null,
  allowed_models text[] not null default '{}',
  status text not null default 'active',
  allowlisted boolean not null default true,
  masked_key text not null default '',
  key_purpose text not null default 'admin-configured provider key',
  created_by text not null default 'unknown',
  risk_state text not null default 'medium',
  quota text not null default 'unlimited',
  last_used_at timestamptz,
  breaker_state text not null default 'closed',
  breaker_failure_count integer not null default 0,
  breaker_opened_at timestamptz,
  breaker_last_failure_at timestamptz,
  scope_type text not null default 'system',
  scope_id text,
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists provider_secrets (
  id text primary key,
  provider_config_id text not null references provider_configs(id) on delete cascade,
  secret_ciphertext text not null,
  secret_hash text not null default '',
  key_tail text not null,
  status text not null default 'active',
  created_by_user_id text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  revoked_at timestamptz
);

create table if not exists run_records (
  id text primary key,
  user_id text references users(id) on delete set null,
  project_id text references projects(id) on delete cascade,
  stage text not null,
  status text not null,
  model text,
  provider_config_id text references provider_configs(id) on delete set null,
  snapshot jsonb not null,
  error jsonb,
  error_code text,
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists run_events (
  id bigserial primary key,
  run_id text not null references run_records(id) on delete cascade,
  sequence integer not null,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, sequence)
);

create table if not exists project_workspace_states (
  project_id text primary key references projects(id) on delete cascade,
  version integer not null default 0,
  state jsonb not null default '{}'::jsonb,
  updated_by_user_id text references users(id) on delete set null,
  source_run_id text references run_records(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists document_records (
  id text primary key,
  workspace_id text,
  project_id text references projects(id) on delete cascade,
  run_id text references run_records(id) on delete set null,
  source_run_id text references run_records(id) on delete set null,
  created_by_user_id text references users(id) on delete set null,
  document_kind text not null,
  title text not null,
  storage_key text not null,
  file_name text,
  mime_type text not null,
  byte_length integer,
  version integer not null default 1,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_record_versions (
  id bigserial primary key,
  document_id text not null references document_records(id) on delete cascade,
  workspace_id text,
  project_id text references projects(id) on delete cascade,
  created_by_user_id text references users(id) on delete set null,
  version integer not null,
  file_name text,
  mime_type text not null,
  byte_length integer,
  source_run_id text references run_records(id) on delete set null,
  storage_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create table if not exists provider_usage_events (
  id text primary key,
  user_id text references users(id) on delete set null,
  project_id text references projects(id) on delete cascade,
  provider_config_id text not null references provider_configs(id) on delete cascade,
  task_type text not null,
  ip_address text,
  organization_id text,
  units integer not null default 1,
  outcome text not null default 'success',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists rate_limit_policies (
  id text primary key,
  scope_type text not null,
  scope_id text,
  provider_config_id text references provider_configs(id) on delete cascade,
  task_type text,
  limit_count integer not null,
  window_seconds integer not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists system_notices (
  id text primary key,
  title text not null,
  notice_type text not null,
  icon text,
  content_blocks jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (notice_type in ('model_update', 'feature_update', 'important', 'maintenance')),
  check (status in ('draft', 'published', 'archived'))
);

create table if not exists system_notice_reads (
  user_id text not null references users(id) on delete cascade,
  notice_id text not null references system_notices(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, notice_id)
);

create index if not exists sessions_user_id_idx on sessions(user_id);
create index if not exists login_events_user_id_created_at_idx on login_events(user_id, created_at desc);
create index if not exists auth_tokens_user_type_idx on auth_tokens(user_id, type, expires_at desc);
create index if not exists projects_owner_user_id_idx on projects(owner_user_id);
create index if not exists organizations_status_idx on organizations(status, updated_at desc);
create index if not exists courses_organization_id_idx on courses(organization_id, updated_at desc);
create index if not exists classes_course_id_idx on classes(course_id, updated_at desc);
create index if not exists teams_class_id_idx on teams(class_id, updated_at desc);
create index if not exists organization_memberships_user_idx on organization_memberships(user_id, status);
create index if not exists organization_memberships_target_idx on organization_memberships(target_type, target_id, status);
create index if not exists quotas_scope_idx on quotas(scope_type, scope_id, resource);
create index if not exists project_members_user_id_idx on project_members(user_id);
create index if not exists project_invitation_tokens_member_idx on project_invitation_tokens(project_member_id);
create index if not exists audit_logs_created_at_idx on audit_logs(created_at desc);
create index if not exists risk_events_created_at_idx on risk_events(created_at desc);
create index if not exists risk_events_project_created_at_idx on risk_events(project_id, created_at desc);
create index if not exists provider_configs_scope_idx on provider_configs(scope_type, scope_id);
create index if not exists provider_secrets_config_status_idx on provider_secrets(provider_config_id, status);
create index if not exists provider_usage_dimensions_idx on provider_usage_events(user_id, project_id, provider_config_id, task_type, created_at desc);
create index if not exists rate_limit_policies_lookup_idx on rate_limit_policies(scope_type, scope_id, provider_config_id, task_type, enabled);
create index if not exists system_notices_status_published_idx on system_notices(status, published_at desc, created_at desc);
create index if not exists system_notice_reads_user_idx on system_notice_reads(user_id, read_at desc);
create index if not exists run_records_project_created_at_idx on run_records(project_id, created_at desc);
create index if not exists run_records_user_created_at_idx on run_records(user_id, created_at desc);
create index if not exists run_events_run_id_sequence_idx on run_events(run_id, sequence);
create index if not exists project_workspace_states_updated_at_idx on project_workspace_states(updated_at desc);
create index if not exists document_records_workspace_updated_at_idx on document_records(workspace_id, updated_at desc);
create index if not exists document_records_project_updated_at_idx on document_records(project_id, updated_at desc);
create index if not exists document_record_versions_document_version_idx on document_record_versions(document_id, version desc);
`;

export const authSecuritySql = `
alter table users add column if not exists mfa_enabled boolean not null default false;
alter table users add column if not exists mfa_secret text;
alter table users add column if not exists mfa_pending_secret text;
alter table users add column if not exists mfa_pending_expires_at timestamptz;

create table if not exists auth_tokens (
  id text primary key,
  type text not null,
  user_id text not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (type, token_hash)
);

create index if not exists auth_tokens_user_type_idx on auth_tokens(user_id, type, expires_at desc);
`;

export const providerConfigStoreSql = `
alter table provider_configs add column if not exists allowlisted boolean not null default true;
alter table provider_configs add column if not exists masked_key text not null default '';
alter table provider_configs add column if not exists key_purpose text not null default 'admin-configured provider key';
alter table provider_configs add column if not exists created_by text not null default 'unknown';
alter table provider_configs add column if not exists risk_state text not null default 'medium';
alter table provider_configs add column if not exists quota text not null default 'unlimited';
alter table provider_configs add column if not exists last_used_at timestamptz;
alter table provider_configs add column if not exists allowed_models text[] not null default '{}';
alter table provider_configs add column if not exists breaker_state text not null default 'closed';
alter table provider_configs add column if not exists breaker_failure_count integer not null default 0;
alter table provider_configs add column if not exists breaker_opened_at timestamptz;
alter table provider_configs add column if not exists breaker_last_failure_at timestamptz;
alter table provider_secrets add column if not exists secret_hash text not null default '';

create table if not exists provider_usage_events (
  id text primary key,
  user_id text references users(id) on delete set null,
  project_id text references projects(id) on delete cascade,
  provider_config_id text not null references provider_configs(id) on delete cascade,
  task_type text not null,
  ip_address text,
  organization_id text,
  units integer not null default 1,
  outcome text not null default 'success',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists provider_usage_dimensions_idx on provider_usage_events(user_id, project_id, provider_config_id, task_type, created_at desc);
create index if not exists provider_usage_ip_idx on provider_usage_events(ip_address, provider_config_id, task_type, created_at desc);
create index if not exists provider_usage_organization_idx on provider_usage_events(organization_id, provider_config_id, task_type, created_at desc);
`;

export const projectAcademicBindingSql = `
alter table projects add column if not exists organization_id text;
alter table projects add column if not exists course_id text;
alter table projects add column if not exists class_id text;
alter table projects add column if not exists team_id text;
alter table projects add column if not exists default_provider_config_id text;

create index if not exists projects_academic_scope_idx on projects(organization_id, course_id, class_id, team_id, updated_at desc);
create index if not exists projects_default_provider_idx on projects(default_provider_config_id, updated_at desc);
`;

export const projectGovernanceSql = `
alter table projects add column if not exists retention_policy text not null default 'manual';
`;

export const projectBackgroundKeySql = `
alter table projects add column if not exists background_key text;
`;

export const providerRateLimitPolicySql = `
create table if not exists rate_limit_policies (
  id text primary key,
  scope_type text not null,
  scope_id text,
  provider_config_id text references provider_configs(id) on delete cascade,
  task_type text,
  limit_count integer not null,
  window_seconds integer not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_policies_lookup_idx on rate_limit_policies(scope_type, scope_id, provider_config_id, task_type, enabled);
`;

export const projectInvitationTokensSql = `
create table if not exists project_invitation_tokens (
  id text primary key,
  project_member_id text not null references project_members(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  created_by_user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists project_invitation_tokens_member_idx on project_invitation_tokens(project_member_id);
`;

export const organizationAcademicModelSql = `
create table if not exists organizations (
  id text primary key,
  name text not null,
  code text,
  type text not null default 'school',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists courses (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  code text,
  term text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists classes (
  id text primary key,
  course_id text not null references courses(id) on delete cascade,
  name text not null,
  code text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists teams (
  id text primary key,
  class_id text not null references classes(id) on delete cascade,
  name text not null,
  code text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists organization_memberships (
  id text primary key,
  target_type text not null,
  target_id text not null,
  user_id text references users(id) on delete set null,
  email text,
  display_name text,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quotas (
  id text primary key,
  scope_type text not null,
  scope_id text not null,
  resource text not null,
  limit_count integer not null,
  used_count integer not null default 0,
  reset_period text not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope_type, scope_id, resource)
);

create index if not exists organizations_status_idx on organizations(status, updated_at desc);
create index if not exists courses_organization_id_idx on courses(organization_id, updated_at desc);
create index if not exists classes_course_id_idx on classes(course_id, updated_at desc);
create index if not exists teams_class_id_idx on teams(class_id, updated_at desc);
create index if not exists organization_memberships_user_idx on organization_memberships(user_id, status);
create index if not exists organization_memberships_target_idx on organization_memberships(target_type, target_id, status);
create index if not exists quotas_scope_idx on quotas(scope_type, scope_id, resource);
`;

export const documentRepositoryMetadataSql = `
alter table document_records add column if not exists workspace_id text;
alter table document_records add column if not exists source_run_id text references run_records(id) on delete set null;
alter table document_records add column if not exists file_name text;
alter table document_records add column if not exists byte_length integer;

update document_records
set workspace_id = coalesce(workspace_id, metadata->>'workspaceId'),
    source_run_id = coalesce(source_run_id, run_id, metadata->>'sourceRunId'),
    file_name = coalesce(file_name, metadata->>'fileName'),
    byte_length = coalesce(
      byte_length,
      case
        when metadata->>'byteLength' ~ '^[0-9]+$' then (metadata->>'byteLength')::integer
        else null
      end
    )
where workspace_id is null
   or source_run_id is null
   or file_name is null
   or byte_length is null;

create table if not exists document_record_versions (
  id bigserial primary key,
  document_id text not null references document_records(id) on delete cascade,
  workspace_id text,
  project_id text references projects(id) on delete cascade,
  created_by_user_id text references users(id) on delete set null,
  version integer not null,
  file_name text,
  mime_type text not null,
  byte_length integer,
  source_run_id text references run_records(id) on delete set null,
  storage_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create index if not exists document_records_workspace_updated_at_idx on document_records(workspace_id, updated_at desc);
create index if not exists document_record_versions_document_version_idx on document_record_versions(document_id, version desc);
`;

export const projectWorkspaceStateSql = `
create table if not exists project_workspace_states (
  project_id text primary key references projects(id) on delete cascade,
  version integer not null default 0,
  state jsonb not null default '{}'::jsonb,
  updated_by_user_id text references users(id) on delete set null,
  source_run_id text references run_records(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists project_workspace_states_updated_at_idx on project_workspace_states(updated_at desc);
`;

export const billingAndPaymentsSql = `
create table if not exists billing_skus (
  id text primary key,
  code text not null unique,
  kind text not null,
  name text not null,
  description text not null,
  duration_days integer,
  credit_amount integer,
  amount_cents integer not null,
  currency text not null default 'CNY',
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind in ('time_pass', 'credit_pack')),
  check (currency = 'CNY'),
  check (amount_cents > 0),
  check (
    (kind = 'time_pass' and duration_days is not null and duration_days > 0 and credit_amount is null) or
    (kind = 'credit_pack' and credit_amount is not null and credit_amount > 0 and duration_days is null)
  )
);

create table if not exists payment_orders (
  id text primary key,
  merchant_order_no text not null unique,
  user_id text not null references users(id) on delete cascade,
  sku_id text not null references billing_skus(id),
  provider text not null,
  amount_cents integer not null,
  currency text not null default 'CNY',
  status text not null default 'pending',
  provider_transaction_id text,
  provider_payload_json jsonb not null default '{}'::jsonb,
  client_return_url text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider in ('wechat_native', 'alipay_page')),
  check (status in ('pending', 'paid', 'expired', 'closed', 'failed', 'refund_pending', 'refunded')),
  check (amount_cents > 0),
  check (currency = 'CNY')
);

create table if not exists payment_notifications (
  id text primary key,
  provider text not null,
  merchant_order_no text,
  provider_event_id text,
  provider_transaction_id text,
  notification_status text not null,
  verified boolean not null default false,
  sanitized_payload_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider in ('wechat_native', 'alipay_page')),
  check (notification_status in ('received', 'verified', 'rejected', 'duplicate', 'processed', 'ignored', 'failed'))
);

create table if not exists billing_entitlement_ledger (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  source_type text not null,
  source_id text,
  sku_id text references billing_skus(id),
  credit_delta integer not null default 0,
  valid_from timestamptz,
  valid_until timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_type in ('purchase', 'signup_bonus', 'usage', 'refund', 'admin_adjustment', 'reversal'))
);

create table if not exists billing_usage_reservations (
  id text primary key,
  run_id text not null unique,
  user_id text not null references users(id) on delete cascade,
  project_id text,
  task_type text not null,
  reservation_kind text not null,
  credit_delta integer not null default 0,
  status text not null default 'reserved',
  ledger_entry_id text references billing_entitlement_ledger(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  released_at timestamptz,
  check (reservation_kind in ('time_pass', 'credit')),
  check (status in ('reserved', 'confirmed', 'released'))
);

alter table payment_orders add column if not exists client_return_url text;
alter table payment_notifications add column if not exists error_message text;
alter table billing_usage_reservations add column if not exists project_id text;
alter table billing_usage_reservations add column if not exists credit_delta integer not null default 0;
alter table billing_usage_reservations add column if not exists metadata_json jsonb not null default '{}'::jsonb;

create unique index if not exists payment_orders_provider_transaction_id_unique
  on payment_orders(provider, provider_transaction_id)
  where provider_transaction_id is not null;
create unique index if not exists payment_notifications_event_unique
  on payment_notifications(provider, provider_event_id)
  where provider_event_id is not null;
create unique index if not exists billing_signup_bonus_unique
  on billing_entitlement_ledger(user_id, source_type, (metadata_json->>'bonusType'))
  where source_type = 'signup_bonus';
create unique index if not exists billing_purchase_ledger_unique
  on billing_entitlement_ledger(source_type, source_id)
  where source_type in ('purchase', 'refund') and source_id is not null;
create unique index if not exists billing_usage_ledger_unique
  on billing_entitlement_ledger(source_type, source_id)
  where source_type = 'usage' and source_id is not null;
create index if not exists payment_orders_user_created_idx on payment_orders(user_id, created_at desc);
create index if not exists payment_orders_status_expires_idx on payment_orders(status, expires_at);
create index if not exists billing_ledger_user_created_idx on billing_entitlement_ledger(user_id, created_at desc);
create index if not exists billing_ledger_validity_idx on billing_entitlement_ledger(user_id, valid_from, valid_until);
create index if not exists billing_reservations_user_status_idx on billing_usage_reservations(user_id, status, created_at desc);

insert into billing_skus (
  id, code, kind, name, description, duration_days, credit_amount, amount_cents, currency, active, sort_order, metadata_json
)
values
  ('sku_time_day', 'time_day', 'time_pass', '日卡', '1 天 AI 生成通行卡', 1, null, 990, 'CNY', true, 10, '{"default":true}'::jsonb),
  ('sku_time_week', 'time_week', 'time_pass', '周卡', '7 天 AI 生成通行卡', 7, null, 3900, 'CNY', true, 20, '{"default":true}'::jsonb),
  ('sku_time_month', 'time_month', 'time_pass', '月卡', '30 天 AI 生成通行卡', 30, null, 9900, 'CNY', true, 30, '{"default":true}'::jsonb),
  ('sku_time_year', 'time_year', 'time_pass', '年卡', '365 天 AI 生成通行卡', 365, null, 99900, 'CNY', true, 40, '{"default":true}'::jsonb),
  ('sku_credits_10', 'credits_10', 'credit_pack', '10 次包', '10 次 AI 生成次数包，默认不过期', null, 10, 990, 'CNY', true, 110, '{"default":true}'::jsonb),
  ('sku_credits_50', 'credits_50', 'credit_pack', '50 次包', '50 次 AI 生成次数包，默认不过期', null, 50, 3900, 'CNY', true, 120, '{"default":true}'::jsonb),
  ('sku_credits_100', 'credits_100', 'credit_pack', '100 次包', '100 次 AI 生成次数包，默认不过期', null, 100, 6900, 'CNY', true, 130, '{"default":true}'::jsonb),
  ('sku_credits_500', 'credits_500', 'credit_pack', '500 次包', '500 次 AI 生成次数包，默认不过期', null, 500, 29900, 'CNY', true, 140, '{"default":true}'::jsonb)
on conflict (code) do nothing;
`;

export const systemNoticesSql = `
create table if not exists system_notices (
  id text primary key,
  title text not null,
  notice_type text not null,
  icon text,
  content_blocks jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (notice_type in ('model_update', 'feature_update', 'important', 'maintenance')),
  check (status in ('draft', 'published', 'archived'))
);

create table if not exists system_notice_reads (
  user_id text not null references users(id) on delete cascade,
  notice_id text not null references system_notices(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, notice_id)
);

create index if not exists system_notices_status_published_idx on system_notices(status, published_at desc, created_at desc);
create index if not exists system_notice_reads_user_idx on system_notice_reads(user_id, read_at desc);
`;

export const billingCompatibilityColumnsSql = `
alter table payment_orders add column if not exists client_return_url text;
alter table payment_notifications add column if not exists error_message text;
alter table billing_usage_reservations add column if not exists project_id text;
alter table billing_usage_reservations add column if not exists credit_delta integer not null default 0;
alter table billing_usage_reservations add column if not exists metadata_json jsonb not null default '{}'::jsonb;
`;

export const runErrorObjectsSql = `
alter table run_records add column if not exists error jsonb;
alter table run_records add column if not exists error_code text;

update run_records
set error = jsonb_build_object(
    'code', 'RUN_LEGACY_FAILURE',
    'message', coalesce(nullif(error_message, ''), '历史运行失败。'),
    'category', 'internal',
    'retryable', false
  ),
  error_code = 'RUN_LEGACY_FAILURE'
where error is null
  and (
    error_message is not null
    or (snapshot ? 'errorMessage' and nullif(snapshot->>'errorMessage', '') is not null)
  );

update run_records
set snapshot =
  (snapshot - 'errorMessage') ||
  jsonb_build_object(
    'error',
    case
      when error is not null then error
      when nullif(snapshot->>'errorMessage', '') is not null then jsonb_build_object(
        'code', 'RUN_LEGACY_FAILURE',
        'message', snapshot->>'errorMessage',
        'category', 'internal',
        'retryable', false
      )
      else 'null'::jsonb
    end
  )
where snapshot ? 'errorMessage'
   or not (snapshot ? 'error');

update run_events
set payload =
  (payload - 'message') ||
  jsonb_build_object(
    'error',
    jsonb_build_object(
      'code', 'RUN_LEGACY_FAILURE',
      'message', coalesce(nullif(payload->>'message', ''), '历史运行失败。'),
      'category', 'internal',
      'retryable', false
    )
  )
where event_type = 'failed'
  and payload ? 'message'
  and not (payload ? 'error');

create index if not exists run_records_error_code_idx on run_records(error_code);
`;

export const usernamesSql = `
alter table users add column if not exists username text;

with normalized as (
  select
    id,
    case
      when length(trim(both '_' from left(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_]+', '_', 'g'), 32))) >= 3
        then trim(both '_' from left(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_]+', '_', 'g'), 32))
      else 'user'
    end as base_username
  from users
  where username is null or username = ''
),
ranked as (
  select
    id,
    base_username,
    count(*) over (partition by base_username) as duplicate_count
  from normalized
),
resolved as (
  select
    id,
    case
      when duplicate_count = 1 then base_username
      else left(base_username, 23) || '_' || left(regexp_replace(id, '[^a-z0-9]+', '', 'g'), 8)
    end as username
  from ranked
)
update users
set username = resolved.username
from resolved
where users.id = resolved.id;

alter table users alter column username set not null;
create unique index if not exists users_username_unique_idx on users(username);
`;

export const migrations = [
  {
    id: "001_user_admin_platform_base",
    sql: baseSchemaSql,
  },
  {
    id: "002_provider_config_store_and_usage",
    sql: providerConfigStoreSql,
  },
  {
    id: "003_auth_security_tokens_and_mfa",
    sql: authSecuritySql,
  },
  {
    id: "004_provider_rate_limit_policies",
    sql: providerRateLimitPolicySql,
  },
  {
    id: "005_project_invitation_tokens",
    sql: projectInvitationTokensSql,
  },
  {
    id: "006_document_repository_metadata",
    sql: documentRepositoryMetadataSql,
  },
  {
    id: "007_organization_course_class_team_quota",
    sql: organizationAcademicModelSql,
  },
  {
    id: "008_project_academic_binding",
    sql: projectAcademicBindingSql,
  },
  {
    id: "009_project_governance",
    sql: projectGovernanceSql,
  },
  {
    id: "010_project_workspace_state",
    sql: projectWorkspaceStateSql,
  },
  {
    id: "011_billing_and_payments",
    sql: billingAndPaymentsSql,
  },
  {
    id: "012_system_notices",
    sql: systemNoticesSql,
  },
  {
    id: "013_billing_compatibility_columns",
    sql: billingCompatibilityColumnsSql,
  },
  {
    id: "014_run_error_objects",
    sql: runErrorObjectsSql,
  },
  {
    id: "015_usernames",
    sql: usernamesSql,
  },
  {
    id: "016_project_background_key",
    sql: projectBackgroundKeySql,
  },
] as const;

export async function runMigrations(
  db: Queryable,
  migrationList: readonly { id: string; sql: string }[] = migrations,
) {
  await db.query(`
    create table if not exists ${migrationTableName} (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const appliedRows = await db.query<{ id: string }>(
    `select id from ${migrationTableName}`,
  );
  const applied = new Set(appliedRows.rows.map((row) => row.id));
  const newlyApplied: string[] = [];

  for (const migration of migrationList) {
    if (applied.has(migration.id)) continue;

    await db.query(migration.sql);
    // The ledger makes migration runs idempotent across API restarts/deploys.
    await db.query(`insert into ${migrationTableName} (id) values ($1)`, [
      migration.id,
    ]);
    newlyApplied.push(migration.id);
  }

  return newlyApplied;
}
