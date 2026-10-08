const OPTION_LINE=/^([A-L])[.)]\s+(.+)$/i;
const ANSWER_LINE=/^(?:correct\s+)?answers?\s*[:：]\s*(.+)$/i;
const EXPLANATION_LINE=/^explanation\s*[:：]\s*(.*)$/i;
export const blankQuestion=()=>({id:crypto.randomUUID(),stem:'',options:['',''],answer:[0],explanation:''});

function parsePairs(lines){
 const pairs=lines.map((line,index)=>{const parts=line.split('\t').map(part=>part.trim());if(parts.length<2||!parts[0]||!parts[1])throw new Error(`Line ${index+1} needs a question, a tab, and an answer.`);return {stem:parts[0],answer:parts.slice(1).join(' ').trim()};});
 const unique=[...new Set(pairs.map(pair=>pair.answer))];
 return pairs.map((pair,index)=>{
  const distractors=unique.filter(answer=>answer!==pair.answer);
  const options=[pair.answer,...distractors.slice(index%distractors.length||0).concat(distractors.slice(0,index%distractors.length||0)).slice(0,3)];
  return {...blankQuestion(),stem:pair.stem,options:options.length>1?options:[pair.answer,''],answer:[0]};
 });
}

function parseBlock(block,index){
 const lines=block.split('\n').map(line=>line.trim()).filter(Boolean);
 const options=[];let stem=[],answerLine='',explanation='',mode='stem';
 for(const line of lines){
  const option=line.match(OPTION_LINE);
  const key=line.match(ANSWER_LINE);
  const why=line.match(EXPLANATION_LINE);
  if(option){mode='options';options.push({letter:option[1].toUpperCase(),text:option[2].trim()});}
  else if(key){if(answerLine)throw new Error(`Question ${index+1} has more than one Answer line. Separate the questions before importing.`);answerLine=key[1].trim();mode='answer';}
  else if(why){explanation=why[1].trim();mode='explanation';}
  else if(mode==='stem')stem.push(line);
  else if(mode==='explanation')explanation+=' '+line;
  else if(mode==='options'&&options.length)options.at(-1).text+=' '+line;
 }
 const question=stem.join(' ').replace(/^\d+[.)]\s*/, '').trim();
 if(!question||options.length<2||options.length>12||!answerLine)throw new Error(`Question ${index+1} needs a stem, at least two lettered choices, and an Answer line.`);
 if(new Set(options.map(option=>option.letter)).size!==options.length)throw new Error(`Question ${index+1} has duplicate choice letters.`);
 const letters=answerLine.toUpperCase().split(/\s*(?:,|;|\/|&|\bAND\b)\s*|\s+/).map(value=>value.replace(/[().]/g,'')).filter(Boolean);
 const answer=letters.map(letter=>options.findIndex(option=>option.letter===letter));
 if(!answer.length||answer.some(choice=>choice<0)||new Set(answer).size!==answer.length)throw new Error(`Question ${index+1} has an invalid Answer line.`);
 return {...blankQuestion(),stem:question,options:options.map(option=>option.text),answer,explanation:explanation.trim()};
}

function questionBlocks(text){
 const lines=text.split('\n'),blocks=[];let block=[],hasAnswer=false,blank=false;
 for(let index=0;index<lines.length;index++){
  const line=lines[index].trim();if(!line){blank=true;continue;}
  const control=OPTION_LINE.test(line)||ANSWER_LINE.test(line)||EXPLANATION_LINE.test(line);
  // A completed question can be followed by a numbered question without a blank line.
  // Blank lines before its choices, key, or explanation still belong to that question.
  let next=index+1;while(next<lines.length&&!lines[next].trim())next++;
  const numbered=/^\d+[.)]\s+/.test(line)&&OPTION_LINE.test(lines[next]?.trim()||'');
  if(hasAnswer&&((blank&&!control)||numbered)){blocks.push(block.join('\n'));block=[];hasAnswer=false;}
  block.push(line);if(ANSWER_LINE.test(line))hasAnswer=true;blank=false;
 }
 if(block.length)blocks.push(block.join('\n'));
 return blocks;
}

export function parseCustomTestText(raw){
 const text=String(raw||'').replace(/\r\n?/g,'\n').trim();
 if(!text)throw new Error('Paste questions or choose a TXT file first.');
 if(text.length>100000)throw new Error('Use a TXT file smaller than 100,000 characters.');
 const lines=text.split('\n').map(line=>line.trim()).filter(Boolean);
 const questions=lines.every(line=>line.includes('\t'))?parsePairs(lines):questionBlocks(text).map(parseBlock);
 if(questions.length>100)throw new Error('Import up to 100 questions per custom test.');
 return questions;
}

export function validateCustomQuestion(question,index){
 const stem=question.stem.trim(),options=question.options.map(option=>option.trim());
 if(!stem)throw new Error(`Question ${index+1} needs question text.`);
 if(options.length<2||options.length>12||options.some(option=>!option))throw new Error(`Question ${index+1} needs 2–12 filled choices.`);
 if(!Array.isArray(question.answer)||!question.answer.length||question.answer.some(answer=>!Number.isInteger(answer)||answer<0||answer>=options.length)||new Set(question.answer).size!==question.answer.length)throw new Error(`Question ${index+1} needs valid, distinct correct choices.`);
 return {stem,options,answer:question.answer,multi:question.answer.length>1,definition:question.explanation.trim()||`Correct answer: ${question.answer.map(choice=>options[choice]).join('; ')}`, ...(question.explanation.trim()?{explanation:{body:[question.explanation.trim()]}}:{})};
}
