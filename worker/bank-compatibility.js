import {z} from 'zod/v4';
export const BANK_OPERATIONS=['begin_bank_repair','calibrate_bank_difficulty','read_bank_repair','map_bank_subtopic','stage_bank_questions','review_bank_question','finish_bank_repair','record_professor_emphasis','read_source_visual'];
export const BANK_COMPATIBILITY_RULES='If this chat has an older Pummy tool list without bank-review tools, use add_questions as a compatibility transport. Send exactly one questions item: {pummyBankOperation:{name:"describe",arguments:{tool:"begin_bank_repair"}}} to read that operation’s current JSON schema. Then send {pummyBankOperation:{name:"begin_bank_repair",arguments:{...}}} with its required fields. Outer courseId and revision always bind the operation; outer requestId binds begin/stage retries. This routes through the SAME source, difficulty, staging and independent-review validation. Never bypass review or relabel generated questions as professor practice. Native tool names are preferred when available. For original diagrams, prepare original figures in Course & sources, then read_source with an exact page returns its original image when available.';
export const bankWorkflow={nativeTools:BANK_OPERATIONS,compatibilityTool:'add_questions',instructions:BANK_COMPATIBILITY_RULES,example:{questions:[{pummyBankOperation:{name:'describe',arguments:{tool:'begin_bank_repair'}}}]}};
const envelope=z.object({courseId:z.string().min(1).max(180),revision:z.number().int().positive(),requestId:z.string().uuid(),questions:z.tuple([z.object({pummyBankOperation:z.object({name:z.enum(['describe',...BANK_OPERATIONS]),arguments:z.record(z.string(),z.unknown())}).strict()}).strict()])}).strict();
export function bankCompatibilityCall(name,raw,definitions){
 if(name!=='add_questions'||!raw?.questions?.some(q=>q&&Object.hasOwn(q,'pummyBankOperation')))return null;
 const outer=envelope.parse(raw),op=outer.questions[0].pummyBankOperation;
 if(op.name==='describe'){
  const {tool}=z.object({tool:z.enum(BANK_OPERATIONS)}).strict().parse(op.arguments);
  return {result:{context:{bankWorkflow,operation:tool,inputSchema:z.toJSONSchema(definitions.find(d=>d.name===tool).schema)}}};
 }
 if(['courseId','revision','requestId'].some(k=>Object.hasOwn(op.arguments,k)))throw Error('Keep courseId, revision and requestId on the outer add_questions call; nested overrides are not allowed.');
 return {name:op.name,args:{...op.arguments,courseId:outer.courseId,revision:outer.revision,...(['begin_bank_repair','stage_bank_questions'].includes(op.name)?{requestId:outer.requestId}:{})}};
}
