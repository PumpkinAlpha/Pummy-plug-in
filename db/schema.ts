import { sqliteTable, text, integer, primaryKey, unique } from 'drizzle-orm/sqlite-core';
export const courses = sqliteTable('courses', {
  userId: text('user_id').notNull(), id: text('id').notNull(), name: text('name').notNull(),
  data: text('data').notNull(), revision: integer('revision').notNull().default(1), updatedAt: integer('updated_at').notNull(),
}, t => [primaryKey({columns:[t.userId,t.id]})]);

// Source text/pages are independent of the bounded exam snapshot.
export const courseSourceContent = sqliteTable('course_source_content', {
 userId:text('user_id').notNull(),courseId:text('course_id').notNull(),sourceId:text('source_id').notNull(),text:text('text'),pages:text('pages'),visualPdf:text('visual_pdf'),position:integer('position').notNull(),
},t=>[primaryKey({columns:[t.userId,t.courseId,t.sourceId]})]);

// Retained until object storage cleanup succeeds; prevents course ID reuse mid-delete.
export const courseDeletions = sqliteTable('course_deletions', {
 userId:text('user_id').notNull(),courseId:text('course_id').notNull(),name:text('name').notNull(),revision:integer('revision').notNull(),updatedAt:integer('updated_at').notNull(),hasR2:integer('has_r2').notNull().default(0),
},t=>[primaryKey({columns:[t.userId,t.courseId]})]);

// Tutor storage is independent of course snapshots and exam revisions.
export const tutorConversions = sqliteTable('tutor_conversions', {
 userId:text('user_id').notNull(),courseId:text('course_id').notNull(),originalAssetId:text('original_asset_id').notNull(),pdfAssetId:text('pdf_asset_id').notNull(),
},t=>[primaryKey({columns:[t.userId,t.courseId,t.originalAssetId]})]);
export const tutorAssets = sqliteTable('tutor_assets', {
 userId:text('user_id').notNull(),courseId:text('course_id').notNull(),id:text('id').notNull(),kind:text('kind').notNull(),name:text('name').notNull(),chunks:integer('chunks').notNull(),bytes:integer('bytes').notNull(),ready:integer('ready').notNull().default(0),storage:text('storage').notNull().default('d1'),createdAt:integer('created_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.courseId,t.id]})]);
export const tutorAssetChunks = sqliteTable('tutor_asset_chunks', {
 userId:text('user_id').notNull(),courseId:text('course_id').notNull(),assetId:text('asset_id').notNull(),chunkIndex:integer('chunk_index').notNull(),data:text('data').notNull(),
},t=>[primaryKey({columns:[t.userId,t.courseId,t.assetId,t.chunkIndex]})]);
export const tutorPresentations = sqliteTable('tutor_presentations', {
 userId:text('user_id').notNull(),courseId:text('course_id').notNull(),id:text('id').notNull(),metadata:text('metadata').notNull(),annotations:text('annotations').notNull().default('{}'),revision:integer('revision').notNull().default(1),lastRequest:text('last_request'),updatedAt:integer('updated_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.courseId,t.id]})]);
export const tutorRevisions = sqliteTable('tutor_revisions', {
 userId:text('user_id').notNull(),courseId:text('course_id').notNull(),presentationId:text('presentation_id').notNull(),revision:integer('revision').notNull(),requestId:text('request_id').notNull(),patch:text('patch').notNull(),createdAt:integer('created_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.courseId,t.presentationId,t.revision]}),unique('tutor_revisions_request_unique').on(t.userId,t.courseId,t.presentationId,t.requestId)]);
export const tutorRequests = sqliteTable('tutor_requests', {
 userId:text('user_id').notNull(),courseId:text('course_id').notNull(),presentationId:text('presentation_id').notNull(),id:text('id').notNull(),data:text('data').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.courseId,t.presentationId,t.id]})]);
export const tutorSlideAnnotations = sqliteTable('tutor_slide_annotations', {
 userId:text('user_id').notNull(),courseId:text('course_id').notNull(),presentationId:text('presentation_id').notNull(),slideId:text('slide_id').notNull(),data:text('data').notNull(),
},t=>[primaryKey({columns:[t.userId,t.courseId,t.presentationId,t.slideId]})]);
export const practiceBanks = sqliteTable('practice_banks', {
 userId:text('user_id').notNull(),courseId:text('course_id').notNull(),id:text('id').notNull(),name:text('name').notNull(),data:text('data').notNull(),revision:integer('revision').notNull().default(1),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.courseId,t.id]})]);
