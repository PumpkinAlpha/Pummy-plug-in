// Extraction only: these strings come from source paragraphs, never a model.
export const objectiveText=value=>String(value||'').normalize('NFKC').replace(/\s+/gu,' ').trim();
export const OBJECTIVE_RULES='Learning objectives must be copied verbatim from explicit objective sections in the student\'s PowerPoint or supplied objectives document. Use the exact sourceId and real slide/page when available. Never generate, infer, summarize, paraphrase or expand objectives from lecture topics. Read the complete objective section/document with read_source, following nextOffset. Reuse verified objective IDs from read_course_state; any new objective text is checked against the stored source. If none are provided, state that no explicit objectives were found and leave objectives and explanation.objective empty. Questions may still cover supported course facts without inventing official objectives.';
const heading=/^(?:(?:learning|lecture|session|course|educational|instructional|student|specific)\s+)*(?:objectives?|learning outcomes?|outcomes?|learning goals?)(?:\s*\((?:continued|cont\.?)\)|\s*[-–:]?\s*(?:continued|cont\.?))?\s*:?\s*$/i;
const introduction=/^(?:at|by) the end of (?:this|the).*(?:able to|students will|you will).*:?\s*$/i;
const action=/^(?:define|describe|discuss|explain|identify|list|compare|contrast|differentiate|distinguish|outline|understand|recognize|recognise|demonstrate|evaluate|analy[sz]e|apply|calculate|classify|correlate|interpret|name|state|summari[sz]e|relate|illustrate|label|trace|review|predict|know|enumerate|assess|locate)\b/i;
const marker=/^\s*(?:(\d+(?:\.\d+)*|[A-Za-z])[).:]\s+|[•●▪◦‣⁃\-*–]\s*)/u;
const stop=/^(?:references|bibliography|(?:recommended|assigned) reading|(?:Lecturio|Nova)(?:\s+assignments)?|assignments|practice questions|self[- ]assessment|answers|summary|thank you)\s*:?\s*$/i;
const documentSource=source=>source.sourceType==='objectives'||/(?:^|[\s_.-])(?:objectives?|learning[\s_.-]+outcomes?)(?:[\s_.-]|$)/i.test(source.name||source.metadata?.originalFileName||'');
const parsedSources=new WeakMap();
function pages(source,text){if(Array.isArray(source.pages)&&source.pages.length)return source.pages;const matches=[...String(text||'').matchAll(/--- (Page|Slide) (\d+) ---/g)];if(!matches.length)return [{text:String(text||'')}];return matches.map((m,i)=>({page:Number(m[2]),unit:m[1].toLowerCase(),text:text.slice(m.index+m[0].length,matches[i+1]?.index??text.length)}));}
function stableHash(text){let n=14695981039346656037n;for(const c of text){n^=BigInt(c.codePointAt(0));n=BigInt.asUintN(64,n*1099511628211n);}return n.toString(16);}
export function sourceObjectives(source,text=''){
 if(!source||source.deletedAt)return [];
 const signature=[text,source.pages,source.sourceType,source.name,source.metadata?.originalFileName,source.lecture,source.weekId],cached=parsedSources.get(source);if(cached&&signature.every((v,i)=>v===cached.signature[i]))return cached.objectives;
 const dedicated=documentSource(source),result=[];let current=null;
 function flush(){if(current){current.text=String(current.text).replace(/\s+/gu,' ').trim();if(current.text&&current.text.length<=4000)result.push(current);current=null;}}
 for(const page of pages(source,text)){
  flush();let reading=dedicated;
  for(const raw of String(page.text||'').split(/\r?\n/)){
   const line=raw.trim();if(!line){continue;}if(/^\d+\s*$/.test(line)||/^(?:page|slide)\s+\d+(?:\s+of\s+\d+)?$/i.test(line))continue;
   const inline=line.match(/^((?:(?:learning|lecture|session|course)\s+)?objectives?|learning outcomes?)\s*:\s*(.+)$/i);
   if(heading.test(line)||introduction.test(line)){flush();reading=true;continue;}
   if(inline){flush();reading=true;const content=inline[2],bullet=content.match(marker);current={text:content.replace(marker,''),...(bullet?.[1]?{num:bullet[1]}:{}),...(page.page?{page:page.page}:{}),sourceId:source.id,...(source.lecture?{lecture:source.lecture}:{}),...(source.weekId?{weekId:source.weekId}:{})};continue;}
   if(stop.test(line)){flush();reading=false;continue;}if(!reading)continue;
   const bullet=line.match(marker),body=line.replace(marker,'');
   if(bullet||action.test(body)){flush();current={text:body,...(bullet?.[1]?{num:bullet[1]}:{}),...(page.page?{page:page.page}:{}),sourceId:source.id,...(source.lecture?{lecture:source.lecture}:{}),...(source.weekId?{weekId:source.weekId}:{})};}
   else if(current)current.text+=' '+line;
  }
 }
 flush();const seen=new Set(),objectives=result.filter(o=>{const key=objectiveText(o.text);if(seen.has(key))return false;seen.add(key);return true;}).map(o=>({...o,id:'objective-'+stableHash(source.id+':'+o.text),verbatim:true}));parsedSources.set(source,{signature,objectives});return objectives;
}
export function matchSourceObjective(objective,sources,texts){
 const source=sources.get(objective.sourceId);if(!source||source.deletedAt)return null;
 return sourceObjectives(source,texts.get(source.id)||'').find(o=>objectiveText(o.text)===objectiveText(objective.text)&&(objective.page==null||objective.page===o.page))||null;
}
export function validateSourceObjectives(objectives,model){return objectives.map(o=>{if(!o.sourceId)throw new Error('Objectives require the sourceId of the supplied PowerPoint or objectives document. Copy its objective wording directly.');const source=model.sources.get(o.sourceId);if(!source)throw new Error(`Objective ${o.id} references a missing source. No changes were saved.`);const match=matchSourceObjective(o,model.sources,model.texts);if(!match)throw new Error(`Objective ${o.id} is not a verbatim objective in the selected file. Read the PowerPoint objective section or supplied objectives document; do not generate or paraphrase objectives.`);const next={...o,text:match.text,sourceId:match.sourceId,...(match.page?{page:match.page}:{}),lecture:match.lecture||'',weekId:match.weekId||null,verbatim:true};if(match.num)next.num=match.num;else delete next.num;return next;});}
export function verifiedObjectives(model){return model.objectives.flatMap(o=>{const match=matchSourceObjective(o,model.sources,model.texts);if(!match)return [];const {num,page,lecture,weekId,...rest}=o;return [{...rest,text:match.text,...(match.num?{num:match.num}:{}),...(match.page?{page:match.page}:{}),...(match.lecture?{lecture:match.lecture}:{}),...(match.weekId?{weekId:match.weekId}:{}),verbatim:true}];});}
export function sourceExplanation(explanation,model){if(!explanation)return explanation;const next={...explanation};if(next.objective&&!verifiedObjectives(model).some(o=>objectiveText(o.text)===objectiveText(next.objective)))delete next.objective;return next;}
export function pullSourceObjectives(model,sourceIds){
 const additions=[];for(const id of sourceIds){const source=model.sources.get(id);if(!source||source.deletedAt)continue;for(const o of sourceObjectives(source,model.texts.get(id)||''))if(!model.objectives.some(old=>old.sourceId===id&&objectiveText(old.text)===objectiveText(o.text)&&matchSourceObjective(old,model.sources,model.texts))){model.objectives.push(o);additions.push(o);}}
 if(model.objectives.length>200)throw new Error('Use up to 200 saved objectives per course. No changes were saved.');return additions;
}
