CREATE TABLE IF NOT EXISTS `tutor_asset_chunks` (
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`user_id`, `course_id`, `asset_id`, `chunk_index`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tutor_assets` (
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`chunks` integer NOT NULL,
	`bytes` integer NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `course_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tutor_presentations` (
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`id` text NOT NULL,
	`metadata` text NOT NULL,
	`annotations` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_request` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `course_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tutor_requests` (
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`presentation_id` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `course_id`, `presentation_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tutor_revisions` (
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`presentation_id` text NOT NULL,
	`revision` integer NOT NULL,
	`request_id` text NOT NULL,
	`patch` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `course_id`, `presentation_id`, `revision`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `tutor_revisions_request_unique` ON `tutor_revisions` (`user_id`,`course_id`,`presentation_id`,`request_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tutor_slide_annotations` (
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`presentation_id` text NOT NULL,
	`slide_id` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`user_id`, `course_id`, `presentation_id`, `slide_id`)
);
