CREATE TABLE `course_source_content` (
 `user_id` text NOT NULL,
 `course_id` text NOT NULL,
 `source_id` text NOT NULL,
 `text` text,
 `pages` text,
 `visual_pdf` text,
 `position` integer NOT NULL,
 PRIMARY KEY (`user_id`, `course_id`, `source_id`)
);
