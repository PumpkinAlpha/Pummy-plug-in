CREATE TABLE `course_deletions` (
 `user_id` text NOT NULL,
 `course_id` text NOT NULL,
 `name` text NOT NULL,
 `revision` integer NOT NULL,
 `updated_at` integer NOT NULL,
 `has_r2` integer NOT NULL DEFAULT 0,
 PRIMARY KEY (`user_id`, `course_id`)
);
