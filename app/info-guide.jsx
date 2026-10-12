import React from 'react';

const steps=[
 ['Create a course','Use Add course on the Courses tab, or import an existing question bank. Each course keeps its own sources, questions, exam settings, and progress.'],
 ['Organize the material','Open the course and its study folders, then use Course & sources to add references to the right folder. You can paste an excerpt, import a question file, or sync files available in your current ChatGPT Project conversation.'],
 ['Build a question bank','In Course & sources, choose Build questions from sources. Pick Full coverage, Based on your gaps, or Custom; select references and Quiz, Exam, or MCAT difficulty. You can request full explanations with the questions.'],
 ['Take an exam','Open Adaptive exam to set the question count, week, question types, sources, and objectives. Start with saved questions, or generate a bank and start when it is saved. You can resume an unfinished exam.'],
 ['Review and return','After each answer, read the feedback and source citations. Use Progress for due concepts and objective mastery; Exam history holds completed sessions.']
];

const sections=[
 {id:'courses',title:'Courses and study folders',items:[
  ['Courses','The home cards show questions, professor questions, retained concepts, and folders. Courses are sorted by the last change. Use the three-dot menu to rename or delete a course.'],
  ['Folders and tags','Open a folder to see only its sources and questions, then study that folder or manage its sources. Use the three-dot menu to rename or remove a folder. The plus button beside All assigns tags for filtering.']
 ]},
 {id:'sources',title:'Sources and question banks',items:[
  ['Add and organize sources','Course & sources shows one subfolder at a time. Add a source excerpt, import a question file into that subfolder, and edit each source’s type, priority, or folder. Professor slides, objectives, quizzes, and other materials can have different priorities.'],
  ['ChatGPT Project files','Linking a Project records its name and URL. To sync its files, open Pummy inside a chat in that Project and choose Sync Project Sources. A saved Project link by itself does not give Pummy access to those files.'],
  ['Create questions','Full coverage asks for questions across selected material; Based on your gaps uses missed or unmastered concepts; Custom uses your exact count. Difficulty changes the style of the request. Model and effort dropdowns are preferences sent to ChatGPT; set the actual model and effort in ChatGPT before generating.'],
  ['Interactive Tutor','Open original PDF, PPT or PPTX slides directly. Add editable annotations, export a project, or download the unchanged original. PowerPoint study views are static; an optional PDF exported by PowerPoint supplies exact visuals.'],
  ['Import a bank','You can import a Pummy JSON backup, TXT, Word (.docx), or text PDF question file. Review extracted questions before saving. Scanned PDFs need readable text or a separate text version.']
 ]},
 {id:'exams',title:'Exams and custom tests',items:[
  ['Adaptive exam','Choose All questions, Struggling questions, Professor questions, or a Custom count up to the available bank size. Filter by week or set, question types, sources, and objectives. Prioritize professor or flagged questions and include scheduled reviews if you want them. With ChatGPT connected, adaptive follow-ups can test a missing prerequisite and then return to the original concept.'],
  ['Custom tests','Type your own questions, paste or import a TXT file, or select questions already in the course bank. Review answer keys, name the test, and save it for reuse.'],
  ['Question formats','Pummy supports single choice, select all that apply, image identification, diagram labeling, ordering, and matching when those formats are present in the bank. Number keys select choices; Enter submits or continues where applicable.']
 ]},
 {id:'feedback',title:'Explanations and citations',items:[
  ['Understand each answer','Submitted answers show feedback. Explain more expands the reason for each choice, and Show the full explanation requests or reveals a longer course-grounded explanation. You can ask Pummy to generate full explanations when it builds new questions.'],
  ['Check the source','Open an inline citation to inspect its saved source and page. An attached original PDF shows the actual page image; otherwise Pummy shows the saved text excerpt. Page numbers appear only when the source includes them.'],
  ['Accessibility','Read aloud plays an available explanation. Display settings let you change theme, reading size, answer behavior, and feedback effects.']
 ]},
 {id:'progress',title:'Progress and saved work',items:[
  ['Spaced review','Progress groups concepts as New, Learning, Reviewing, or Retained. Learning concepts and due reviews return to practice; Retained means a 21-day or longer review interval. Objective mastery tracks the concepts linked to each objective.'],
  ['Checkpoints and history','A review checkpoint appears every ten completed questions. Exam history keeps completed sessions and their results. An unfinished exam can be resumed from the course.']
 ]}
];

export function InfoGuide({onAdd,onImport,onCourses}){
 return <div className="info-guide" role="tabpanel" id="library-info-panel" aria-labelledby="library-info-tab">
  <div className="info-intro"><span className="eyebrow">Your study guide</span><h1>Make the most of Pummy</h1><p>Pummy turns your course material and question banks into practice exams, explains answers with source citations, and schedules concepts for review.</p><div className="info-actions"><button className="primary" onClick={onAdd}>Add a course</button><button className="secondary" onClick={onImport}>Import a question bank</button></div></div>
  <nav className="info-jump" aria-label="Info sections">{sections.map(section=><a href={`#info-${section.id}`} key={section.id}>{section.title}</a>)}</nav>
  <section className="info-section" aria-labelledby="info-start-title"><div className="info-section-heading"><span className="eyebrow">Start here</span><h2 id="info-start-title">A good first session</h2></div><ol className="info-steps">{steps.map(([title,body])=><li key={title}><h3>{title}</h3><p>{body}</p></li>)}</ol></section>
  {sections.map(section=><section className="info-section" id={`info-${section.id}`} key={section.id} aria-labelledby={`info-${section.id}-title`}><div className="info-section-heading"><h2 id={`info-${section.id}-title`}>{section.title}</h2></div><div className="info-detail-grid">{section.items.map(([title,body])=><article key={title}><h3>{title}</h3><p>{body}</p></article>)}</div></section>)}
  <aside className="info-connection"><h2>When ChatGPT is needed</h2><p>Open Pummy inside a ChatGPT conversation to sync Project files, generate new questions, request new explanations, or use adaptive follow-ups. The standalone site can still show your saved material and practice existing bank questions.</p><button className="quiet" onClick={onCourses}>Back to courses →</button></aside>
 </div>;
}
