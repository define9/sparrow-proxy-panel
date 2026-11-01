CREATE TYPE "public"."actor_type" AS ENUM('user', 'agent', 'plugin', 'system');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('ok', 'failed', 'timeout', 'skipped', 'running');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."node_network" AS ENUM('tcp', 'ws', 'grpc', 'http', 'kcp', 'quic');--> statement-breakpoint
CREATE TYPE "public"."node_protocol" AS ENUM('vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic');--> statement-breakpoint
CREATE TYPE "public"."node_status" AS ENUM('online', 'offline', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'cancelled', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('traffic', 'time', 'bandwidth');--> statement-breakpoint
CREATE TYPE "public"."plugin_health" AS ENUM('healthy', 'unhealthy', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."plugin_status" AS ENUM('installed', 'disabled', 'error', 'installing');--> statement-breakpoint
CREATE TYPE "public"."plugin_type" AS ENUM('payment', 'node_source', 'subscription', 'notify', 'hook', 'ui');--> statement-breakpoint
CREATE TYPE "public"."subscription_format" AS ENUM('v2ray', 'clash', 'singbox');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'paused', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."tls_mode" AS ENUM('none', 'tls', 'reality');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled', 'pending');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"level" "log_level" DEFAULT 'info' NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "actor_type" DEFAULT 'user' NOT NULL,
	"actor_id" uuid,
	"actor_label" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"ip" text,
	"meta" text,
	"level" "log_level" DEFAULT 'info' NOT NULL,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" text,
	"ip" text,
	"user_agent" text,
	"success" boolean NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"meta" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role_code" text DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"balance" numeric(20, 2) DEFAULT '0.00' NOT NULL,
	"traffic_limit" numeric(20, 0) DEFAULT '0' NOT NULL,
	"traffic_used" numeric(20, 0) DEFAULT '0' NOT NULL,
	"twofa_enabled" boolean DEFAULT false NOT NULL,
	"twofa_secret" text,
	"telegram_id" text,
	"last_login_at" timestamp with time zone,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" text DEFAULT 'fixed' NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"quota" integer DEFAULT 0 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"min_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_no" text NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"trade_no" text,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"meta" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_no_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE "payment_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"gateway" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"trade_no" text,
	"raw" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_node_groups" (
	"plan_id" uuid NOT NULL,
	"node_group_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" "plan_type" DEFAULT 'traffic' NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"original_price" numeric(12, 2),
	"currency" text DEFAULT 'CNY' NOT NULL,
	"traffic_gb" integer DEFAULT 0 NOT NULL,
	"duration_days" integer NOT NULL,
	"device_limit" integer DEFAULT 1 NOT NULL,
	"speed_limit_mbps" integer DEFAULT 0 NOT NULL,
	"stock" integer,
	"sold_count" integer DEFAULT 0 NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"is_hot" boolean DEFAULT false NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscription_node_groups" (
	"subscription_id" uuid NOT NULL,
	"node_group_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"order_id" uuid,
	"token" text NOT NULL,
	"format" "subscription_format" DEFAULT 'clash' NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"device_limit" integer DEFAULT 1 NOT NULL,
	"speed_limit_mbps" integer DEFAULT 0 NOT NULL,
	"traffic_limit" numeric(20, 0) DEFAULT '0' NOT NULL,
	"traffic_used" numeric(20, 0) DEFAULT '0' NOT NULL,
	"upload" numeric(20, 0) DEFAULT '0' NOT NULL,
	"download" numeric(20, 0) DEFAULT '0' NOT NULL,
	"expire_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "traffic_daily" (
	"user_id" uuid NOT NULL,
	"date" text NOT NULL,
	"upload" numeric(20, 0) DEFAULT '0' NOT NULL,
	"download" numeric(20, 0) DEFAULT '0' NOT NULL,
	"total" numeric(20, 0) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_daily_node" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" text NOT NULL,
	"upload" numeric(20, 0) DEFAULT '0' NOT NULL,
	"download" numeric(20, 0) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"upload" numeric(20, 0) DEFAULT '0' NOT NULL,
	"download" numeric(20, 0) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"command" text NOT NULL,
	"payload" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acked_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"result" text
);
--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"type" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text,
	"payload" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'generic' NOT NULL,
	"cert" text NOT NULL,
	"key" text NOT NULL,
	"issuer" text,
	"not_before" timestamp with time zone,
	"not_after" timestamp with time zone,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"region" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_heartbeats" (
	"node_id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'online' NOT NULL,
	"cpu" numeric(5, 2) DEFAULT '0' NOT NULL,
	"memory" numeric(5, 2) DEFAULT '0' NOT NULL,
	"disk" numeric(5, 2) DEFAULT '0' NOT NULL,
	"net_rx" numeric(20, 0) DEFAULT '0' NOT NULL,
	"net_tx" numeric(20, 0) DEFAULT '0' NOT NULL,
	"online_users" integer DEFAULT 0 NOT NULL,
	"agent_version" text,
	"core_version" text,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"group_id" uuid NOT NULL,
	"protocol" "node_protocol" NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"server_port" integer,
	"network" "node_network" DEFAULT 'tcp' NOT NULL,
	"path" text,
	"host_header" text,
	"method" text,
	"flow" text,
	"security" text,
	"tls_mode" "tls_mode" DEFAULT 'tls' NOT NULL,
	"sni" text,
	"alpn" text[] DEFAULT '{}'::text[] NOT NULL,
	"allow_insecure" boolean DEFAULT false NOT NULL,
	"reality_public_key" text,
	"reality_short_id" text,
	"fingerprint" text,
	"certificate_id" uuid,
	"extra" text,
	"traffic_rate" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"status" "node_status" DEFAULT 'offline' NOT NULL,
	"is_relay" boolean DEFAULT false NOT NULL,
	"agent_secret_hash" text,
	"agent_version" text,
	"core" text DEFAULT 'sing-box' NOT NULL,
	"config_version" integer DEFAULT 0 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"remark" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plugin_id" uuid NOT NULL,
	"hook" text NOT NULL,
	"status" "job_status" DEFAULT 'ok' NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"level" "log_level" DEFAULT 'info' NOT NULL,
	"error" text,
	"payload" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"run_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"status" "job_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"error" text,
	"result" text,
	CONSTRAINT "plugin_job_runs_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "plugin_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plugin_key" text NOT NULL,
	"job_key" text NOT NULL,
	"cron" text NOT NULL,
	"handler" text NOT NULL,
	"payload" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_status" "job_status"
);
--> statement-breakpoint
CREATE TABLE "plugin_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'url' NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"type" "plugin_type" NOT NULL,
	"source_type" text DEFAULT 'git' NOT NULL,
	"repo_url" text NOT NULL,
	"git_ref" text,
	"commit_sha" text NOT NULL,
	"runtime" text DEFAULT 'process' NOT NULL,
	"entry" text DEFAULT 'dist/index.js' NOT NULL,
	"build" text DEFAULT 'none' NOT NULL,
	"ui_mode" text DEFAULT 'schema' NOT NULL,
	"checksum" text,
	"manifest" text,
	"config" text,
	"permissions" text[] DEFAULT '{}'::text[] NOT NULL,
	"granted_scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"egress" text[] DEFAULT '{}'::text[] NOT NULL,
	"active_version" text,
	"previous_version" text,
	"health" "plugin_health" DEFAULT 'unknown' NOT NULL,
	"last_health_at" timestamp with time zone,
	"status" "plugin_status" DEFAULT 'installed' NOT NULL,
	"last_error" text,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugins_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "login_logs" ADD CONSTRAINT "login_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "personal_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_node_groups" ADD CONSTRAINT "plan_node_groups_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_node_groups" ADD CONSTRAINT "subscription_node_groups_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_daily" ADD CONSTRAINT "traffic_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_commands" ADD CONSTRAINT "agent_commands_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_heartbeats" ADD CONSTRAINT "node_heartbeats_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_group_id_node_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."node_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_certificate_id_node_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."node_certificates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_events" ADD CONSTRAINT "plugin_events_plugin_id_plugins_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_job_runs" ADD CONSTRAINT "plugin_job_runs_job_id_plugin_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."plugin_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "login_logs_created_idx" ON "login_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pat_user_idx" ON "personal_access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_trade_no_idx" ON "orders" USING btree ("trade_no");--> statement-breakpoint
CREATE INDEX "payment_records_gateway_trade_idx" ON "payment_records" USING btree ("gateway","trade_no");--> statement-breakpoint
CREATE INDEX "plan_node_groups_plan_idx" ON "plan_node_groups" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plans_status_sort_idx" ON "plans" USING btree ("status","sort");--> statement-breakpoint
CREATE INDEX "subscription_node_groups_sub_idx" ON "subscription_node_groups" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_status_idx" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_expire_idx" ON "subscriptions" USING btree ("expire_at");--> statement-breakpoint
CREATE INDEX "traffic_daily_user_date_idx" ON "traffic_daily" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "traffic_daily_node_date_idx" ON "traffic_daily_node" USING btree ("date","node_id");--> statement-breakpoint
CREATE INDEX "traffic_logs_created_idx" ON "traffic_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_commands_node_status_idx" ON "agent_commands" USING btree ("node_id","status");--> statement-breakpoint
CREATE INDEX "agent_events_created_idx" ON "agent_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "nodes_group_idx" ON "nodes" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "nodes_status_sort_idx" ON "nodes" USING btree ("status","sort");--> statement-breakpoint
CREATE INDEX "plugin_events_created_idx" ON "plugin_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "plugin_job_runs_job_idx" ON "plugin_job_runs" USING btree ("job_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_jobs_key_idx" ON "plugin_jobs" USING btree ("plugin_key","job_key");--> statement-breakpoint
CREATE INDEX "plugin_jobs_due_idx" ON "plugin_jobs" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plugins_repo_commit_idx" ON "plugins" USING btree ("repo_url","commit_sha");--> statement-breakpoint
CREATE INDEX "plugins_status_idx" ON "plugins" USING btree ("status");