CREATE TABLE IF NOT EXISTS source_visuals (
 user_id TEXT NOT NULL,
 course_id TEXT NOT NULL,
 id TEXT NOT NULL,
 data_url TEXT NOT NULL,
 PRIMARY KEY (user_id, course_id, id)
);
