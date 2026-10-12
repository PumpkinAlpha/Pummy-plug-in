// Shared by the setup preview and the server so a chosen scope cannot broaden
// between the displayed question count and starting the exam.
export function matchesStudySelection(question,source,settings,customTests=[],hasWeeks=false){
 const folder=settings.studyFolder;
 if(folder){
  if(folder.kind==='lecture'&&question.lecture!==folder.label&&source?.lecture!==folder.label)return false;
  if(folder.kind==='week'&&question.weekId!==folder.label&&source?.weekId!==folder.label)return false;
  if(folder.kind==='unassigned'&&(hasWeeks?(question.weekId||source?.weekId):(question.lecture||source?.lecture)))return false;
 }
 if(settings.practiceTestId&&!customTests.find(test=>test.id===settings.practiceTestId)?.questionIds.includes(question.id))return false;
 return true;
}
