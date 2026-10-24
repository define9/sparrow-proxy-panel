-- 扩展：citext 用于邮箱等大小写不敏感字段
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('user', 'agent', 'plugin', 'system');--> statement-breakpoint
CREATE TYPE "public"."agent_command" AS ENUM('reload_config', 'restart_core', 'upgrade_core', 'update_agent', 'set_log_level', 'sync_now');--> statement-breakpoint
CREATE TYPE "public"."agent_command_status" AS ENUM('pending', 'acked', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_event_level" AS ENUM('info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."announcement_scope" AS ENUM('global', 'user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."announcement_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."certificate_source" AS ENUM('acme', 'manual');--> statement-breakpoint
CREATE TYPE "public"."certificate_type" AS ENUM('generic', 'custom');--> statement-breakpoint
CREATE TYPE "public"."coupon_type" AS ENUM('fixed', 'percent');--> statement-breakpoint
CREATE TYPE "public"."node_health" AS ENUM('online', 'offline', 'degraded');--> statement-breakpoint
CREATE TYPE "public"."node_protocol" AS ENUM('vless', 'vmess', 'trojan', 'shadowsocks', 'hysteria2', 'tuic');--> statement-breakpoint
CREATE TYPE "public"."node_status" AS ENUM('online', 'offline', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."node_tls_mode" AS ENUM('none', 'tls', 'reality');--> statement-breakpoint
CREATE TYPE "public"."node_transport" AS ENUM('tcp', 'ws', 'grpc', 'http', 'kcp', 'quic');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'cancelled', 'expired', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('traffic', 'time', 'bandwidth');--> statement-breakpoint
CREATE TYPE "public"."plugin_hook_status" AS ENUM('success', 'error', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."plugin_runtime" AS ENUM('builtin', 'external');--> statement-breakpoint
CREATE TYPE "public"."plugin_source_type" AS ENUM('builtin', 'marketplace', 'url', 'upload');--> statement-breakpoint
CREATE TYPE "public"."plugin_status" AS ENUM('installed', 'disabled', 'error');--> statement-breakpoint
CREATE TYPE "public"."plugin_sync_status" AS ENUM('pending', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."plugin_type" AS ENUM('payment', 'node_source', 'subscription', 'notify', 'hook', 'ui');--> statement-breakpoint
CREATE TYPE "public"."subscription_format" AS ENUM('v2ray', 'clash', 'singbox');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'paused', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('running', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled', 'pending');--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(128) NOT NULL,
	"name" varchar(128) NOT NULL,
	"group_name" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(64) NOT NULL,
	"token_prefix" varchar(16) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"scopes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"username" varchar(64) NOT NULL,
	"password_hash" text NOT NULL,
	"role_id" uuid NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"balance" numeric(20, 8) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"traffic_limit" bigint DEFAULT 0 NOT NULL,
	"traffic_used" bigint DEFAULT 0 NOT NULL,
	"telegram_id" varchar(64),
	"email_verified_at" timestamp with time zone,
	"twofa_enabled" boolean DEFAULT false NOT NULL,
	"twofa_secret" text,
	"register_ip" "inet",
	"last_login_at" timestamp with time zone,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_node_groups" (
	"plan_id" uuid NOT NULL,
	"node_group_id" uuid NOT NULL,
	CONSTRAINT "plan_node_groups_plan_id_node_group_id_pk" PRIMARY KEY("plan_id","node_group_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"description" text,
	"type" "plan_type" DEFAULT 'traffic' NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"original_price" numeric(12, 2),
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"traffic_gb" bigint DEFAULT 0 NOT NULL,
	"duration_days" integer DEFAULT 30 NOT NULL,
	"device_limit" integer DEFAULT 3 NOT NULL,
	"speed_limit_mbps" integer DEFAULT 0 NOT NULL,
	"reset_day" integer,
	"renew_reset_ratio" numeric(4, 2) DEFAULT '1' NOT NULL,
	"stock" integer,
	"sold_count" integer DEFAULT 0 NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"is_hot" boolean DEFAULT false NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"type" "coupon_type" NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"quota" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"plan_ids" uuid[],
	"min_amount" numeric(12, 2),
	"expires_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_no" varchar(32) NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"coupon_id" uuid,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"payment_method" varchar(32),
	"trade_no" varchar(64),
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"remark" text,
	"admin_remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"gateway" varchar(32) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"trade_no" varchar(64),
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_node_groups" (
	"subscription_id" uuid NOT NULL,
	"node_group_id" uuid NOT NULL,
	CONSTRAINT "subscription_node_groups_subscription_id_node_group_id_pk" PRIMARY KEY("subscription_id","node_group_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"order_id" uuid,
	"token" uuid NOT NULL,
	"format" "subscription_format" DEFAULT 'v2ray' NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"device_limit" integer DEFAULT 3 NOT NULL,
	"speed_limit_mbps" integer DEFAULT 0 NOT NULL,
	"traffic_limit" bigint DEFAULT 0 NOT NULL,
	"traffic_used" bigint DEFAULT 0 NOT NULL,
	"upload" bigint DEFAULT 0 NOT NULL,
	"download" bigint DEFAULT 0 NOT NULL,
	"expire_at" timestamp with time zone,
	"reset_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"command" "agent_command" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "agent_command_status" DEFAULT 'pending' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acked_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"type" varchar(64) NOT NULL,
	"level" "agent_event_level" DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"type" "certificate_type" DEFAULT 'custom' NOT NULL,
	"source" "certificate_source" DEFAULT 'manual' NOT NULL,
	"cert" text NOT NULL,
	"key" text NOT NULL,
	"issuer" varchar(255),
	"not_before" timestamp with time zone,
	"not_after" timestamp with time zone,
	"acme_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_configs" (
	"node_id" uuid PRIMARY KEY NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rendered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"region" varchar(64),
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_heartbeats" (
	"node_id" uuid PRIMARY KEY NOT NULL,
	"status" "node_health" DEFAULT 'offline' NOT NULL,
	"cpu" numeric(5, 2),
	"memory" numeric(5, 2),
	"disk" numeric(5, 2),
	"net_rx" bigint DEFAULT 0 NOT NULL,
	"net_tx" bigint DEFAULT 0 NOT NULL,
	"online_users" integer,
	"agent_version" varchar(32),
	"core_version" varchar(32),
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_secrets" (
	"node_id" uuid PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"previous_secret" text,
	"previous_secret_expire_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"group_id" uuid NOT NULL,
	"protocol" "node_protocol" NOT NULL,
	"host" varchar(255) NOT NULL,
	"port" integer NOT NULL,
	"server_port" integer,
	"network" "node_transport" DEFAULT 'tcp' NOT NULL,
	"path" varchar(255),
	"host_header" varchar(255),
	"method" varchar(64),
	"flow" varchar(32),
	"password" text,
	"uuid" varchar(64),
	"security" varchar(32),
	"tls_mode" "node_tls_mode" DEFAULT 'none' NOT NULL,
	"sni" varchar(255),
	"alpn" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"allow_insecure" boolean DEFAULT false NOT NULL,
	"reality_public_key" varchar(255),
	"reality_short_id" varchar(64),
	"reality_spider_x" varchar(255),
	"fingerprint" varchar(32),
	"private_key" text,
	"public_key" varchar(255),
	"certificate_id" uuid,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"traffic_rate" numeric(5, 2) DEFAULT '1' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"weight" integer DEFAULT 100 NOT NULL,
	"status" "node_status" DEFAULT 'online' NOT NULL,
	"is_relay" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"remark" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_daily" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"upload" bigint DEFAULT 0 NOT NULL,
	"download" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"node_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "traffic_daily_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "traffic_daily_node" (
	"node_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"upload" bigint DEFAULT 0 NOT NULL,
	"download" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "traffic_daily_node_node_id_user_id_date_pk" PRIMARY KEY("node_id","user_id","date")
);
--> statement-breakpoint
CREATE TABLE "traffic_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "traffic_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"subscription_id" uuid,
	"upload" bigint DEFAULT 0 NOT NULL,
	"download" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plugin_id" uuid NOT NULL,
	"hook" varchar(64) NOT NULL,
	"status" "plugin_hook_status" NOT NULL,
	"duration_ms" integer,
	"error" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(128) NOT NULL,
	"type" "plugin_source_type" NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_status" "plugin_sync_status",
	"last_error" text,
	"checksum" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"version" varchar(32) NOT NULL,
	"type" "plugin_type" NOT NULL,
	"runtime" "plugin_runtime" DEFAULT 'external' NOT NULL,
	"source_type" "plugin_source_type" DEFAULT 'marketplace' NOT NULL,
	"source_url" text,
	"checksum" varchar(128),
	"signature" varchar(256),
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"permissions" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"hooks" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" "plugin_status" DEFAULT 'installed' NOT NULL,
	"error" text,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"scope" "announcement_scope" DEFAULT 'global' NOT NULL,
	"status" "announcement_status" DEFAULT 'draft' NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"actor_type" "actor_type" NOT NULL,
	"actor_id" varchar(64),
	"action" varchar(64) NOT NULL,
	"target_type" varchar(64),
	"target_id" varchar(64),
	"ip" "inet",
	"user_agent" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "login_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid,
	"email" varchar(320),
	"ip" "inet",
	"user_agent" text,
	"success" boolean NOT NULL,
	"reason" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"status" "task_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"secret" varchar(128) NOT NULL,
	"events" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "personal_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_node_groups" ADD CONSTRAINT "plan_node_groups_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_node_groups" ADD CONSTRAINT "subscription_node_groups_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_configs" ADD CONSTRAINT "node_configs_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_heartbeats" ADD CONSTRAINT "node_heartbeats_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_secrets" ADD CONSTRAINT "node_secrets_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_certificate_id_node_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."node_certificates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_code_uq" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "permissions_group_idx" ON "permissions" USING btree ("group_name");--> statement-breakpoint
CREATE UNIQUE INDEX "pat_token_hash_uq" ON "personal_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "pat_user_idx" ON "personal_access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_code_uq" ON "roles" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uq" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_id_uq" ON "users" USING btree ("telegram_id");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_slug_uq" ON "plans" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "plans_status_sort_idx" ON "plans" USING btree ("status","sort");--> statement-breakpoint
CREATE UNIQUE INDEX "coupons_code_uq" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "coupons_enabled_idx" ON "coupons" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_no_uq" ON "orders" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_trade_no_idx" ON "orders" USING btree ("trade_no");--> statement-breakpoint
CREATE INDEX "orders_expires_at_idx" ON "orders" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "payment_records_order_idx" ON "payment_records" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_records_gateway_trade_uq" ON "payment_records" USING btree ("gateway","trade_no");--> statement-breakpoint
CREATE INDEX "payment_records_created_at_idx" ON "payment_records" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_token_uq" ON "subscriptions" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_user_plan_active_uq" ON "subscriptions" USING btree ("user_id","plan_id") WHERE status in ('active', 'paused');--> statement-breakpoint
CREATE INDEX "subscriptions_user_status_idx" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_expire_at_idx" ON "subscriptions" USING btree ("expire_at");--> statement-breakpoint
CREATE INDEX "subscriptions_reset_at_idx" ON "subscriptions" USING btree ("reset_at");--> statement-breakpoint
CREATE INDEX "agent_commands_node_status_idx" ON "agent_commands" USING btree ("node_id","status");--> statement-breakpoint
CREATE INDEX "agent_commands_issued_at_idx" ON "agent_commands" USING btree ("issued_at");--> statement-breakpoint
CREATE INDEX "agent_events_node_created_idx" ON "agent_events" USING btree ("node_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_events_created_at_idx" ON "agent_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "node_certificates_not_after_idx" ON "node_certificates" USING btree ("not_after");--> statement-breakpoint
CREATE UNIQUE INDEX "node_groups_name_uq" ON "node_groups" USING btree ("name");--> statement-breakpoint
CREATE INDEX "node_groups_sort_idx" ON "node_groups" USING btree ("sort");--> statement-breakpoint
CREATE INDEX "nodes_group_idx" ON "nodes" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "nodes_status_sort_idx" ON "nodes" USING btree ("status","sort");--> statement-breakpoint
CREATE INDEX "nodes_host_port_idx" ON "nodes" USING btree ("host","port");--> statement-breakpoint
CREATE INDEX "traffic_daily_date_idx" ON "traffic_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "traffic_daily_node_node_date_idx" ON "traffic_daily_node" USING btree ("node_id","date");--> statement-breakpoint
CREATE INDEX "traffic_daily_node_user_date_idx" ON "traffic_daily_node" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "traffic_logs_user_created_idx" ON "traffic_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "traffic_logs_node_created_idx" ON "traffic_logs" USING btree ("node_id","created_at");--> statement-breakpoint
CREATE INDEX "traffic_logs_created_at_idx" ON "traffic_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "plugin_events_plugin_created_idx" ON "plugin_events" USING btree ("plugin_id","created_at");--> statement-breakpoint
CREATE INDEX "plugin_events_created_at_idx" ON "plugin_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "plugin_sources_enabled_idx" ON "plugin_sources" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "plugins_key_uq" ON "plugins" USING btree ("key");--> statement-breakpoint
CREATE INDEX "plugins_type_status_idx" ON "plugins" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "announcements_status_published_idx" ON "announcements" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_created_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "login_logs_user_idx" ON "login_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_logs_created_at_idx" ON "login_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "task_runs_name_started_idx" ON "task_runs" USING btree ("name","started_at");