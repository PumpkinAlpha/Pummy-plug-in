CREATE TABLE `tutor_conversions` (
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`original_asset_id` text NOT NULL,
	`pdf_asset_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `course_id`, `original_asset_id`)
);
