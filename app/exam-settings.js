import {studyFolders} from './folders.js';
import {matchesStudySelection} from '../lib/exam-filters.js';
export const CUSTOM_SELECTION_LIMIT=500;
export const EXAM_MODES={
 all:{label:'All questions',description:'Use every question matching your filters.'},
 struggling:{label:'Struggling questions',description:'Focus on concepts you are learning or have missed.'},
 professor:{label:'Professor questions',description:'Use only imported professor questions.'},
 custom:{label:'Custom',description:'Choose the number of questions.'}
};

export function matchingExamQuestions(state,settings){
 const sources=new Map((state.sources||[]).map(source=>[source.id,source]));
 const hasWeeks=studyFolders(state).some(folder=>folder.kind==='week');
 return (state.questionIndex||[]).filter(question=>
  matchesStudySelection(question,sources.get(question.sourceId),settings,state.customTests,hasWeeks)&&
  (settings.sourceIds==null||settings.sourceIds.includes(question.sourceId))&&
  (settings.types==null||settings.types.includes(question.type))&&
  (!settings.weekId||settings.weekId==='all'||question.weekId===settings.weekId||sources.get(question.sourceId)?.weekId===settings.weekId)&&
  (settings.setId==null||question.setId===settings.setId)&&
  (settings.objectiveIds==null||settings.objectiveIds.includes(question.objectiveId||'__untagged__'))&&
  (settings.examMode!=='professor'||question.origin==='practice')&&
  (settings.examMode!=='struggling'||question.struggling)
);
}

export function examFolderOptions(state){return studyFolders(state).filter(folder=>folder.kind!=='all');}
export function examPracticeOptions(state){
 return [
  ...(state.customTests||[]).map(test=>({value:'test:'+test.id,label:test.name,practiceTestId:test.id,setId:null})),
  ...[...new Set((state.questionIndex||[]).map(q=>q.setId).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(id=>({value:'set:'+id,label:id,practiceTestId:null,setId:id}))
 ];
}

export function dashboardExamSettings(state,scope,connected){
 const preferences=state.preferences||{};
 const requested=Number(preferences.size);
 const size=preferences.size==='all'?'all':Number.isFinite(requested)?Math.min(500,Math.max(1,Math.floor(requested))):20;
 return {...preferences,size,examMode:size==='all'?'all':'custom',adaptive:!!connected&&!!preferences.adaptive,generateExplanations:!!connected&&!!preferences.generateExplanations,
  weekId:'all',setId:null,studyFolder:null,practiceTestId:null,sourceIds:null,objectiveIds:null,types:null,
  ...(typeof scope==='string'?{weekId:scope}:scope)};
}

export function customExamSize(questionIds){return questionIds.length;}

export function customSelectionSettings(state,testId,questionIds){
 const saved=state.customTests?.find(test=>test.id===testId)?.preferences;
 return {adaptive:false,generateExplanations:false,practiceFirst:false,includeReviews:false,types:null,sourceIds:null,objectiveIds:null,weekId:'all',setId:null,
  ...saved,size:saved?.size==='all'?'all':Math.min(customExamSize(questionIds),saved?.size||questionIds.length)};
}

export function generatedExamSettings(settings={},questionIds){
 return {...settings,examMode:settings.size==='all'?'all':'custom',questionIds:questionIds.slice(0,500),size:settings.size==='all'?'all':Math.min(questionIds.length,Number(settings.size)||questionIds.length),weekId:'all',setId:null,studyFolder:null,practiceTestId:null,sourceIds:null,objectiveIds:null,types:null};
}
