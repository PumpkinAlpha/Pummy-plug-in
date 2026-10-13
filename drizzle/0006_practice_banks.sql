CREATE TABLE `practice_banks` (
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `course_id`, `id`)
);
