import {renderSlide,originalPageEmphasis} from './tutor-files.js';
// Original bytes are rendered by the same viewer used for citations and tutoring.
// The model never supplies an invented diagram or guessed image coordinates.
export async function prepareSourceVisuals(call,state,sourceIds,onProgress=()=>{}){
 const failures=[];let current=state;
 const sources=state.sources.filter(s=>sourceIds.includes(s.id)&&s.originalFile&&['pdf','ppt','pptx'].includes(s.originalFile.kind));
 const listed=sources.length?(await call('list_presentations',{courseId:state.courseId})).presentations:[];
 for(const source of sources){
  try{
   let p=listed.find(p=>p.originalAssetId===source.originalFile.id);
   if(p)p=(await call('read_presentation',{courseId:state.courseId,presentationId:p.id})).presentation;
   else p=(await call('import_course_presentation',{courseId:state.courseId,sourceId:source.id,presentationId:crypto.randomUUID()})).presentation;
   for(const slide of p.slides){
    if(current.sourceVisuals?.some(v=>v.sourceId===source.id&&v.page===slide.page&&v.contentHash===source.contentHash))continue;
    onProgress(`Preparing source diagrams: ${source.name}, page ${slide.page} of ${p.slides.length}`);
    try{
     const png=await renderSlide(call,p,slide.page,1000),img=new Image();img.src=png;await img.decode();
     const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;canvas.getContext('2d').drawImage(img,0,0);
     const dataUrl=canvas.toDataURL('image/jpeg',.82);
     if(dataUrl.length>700000)throw Error('This page image exceeds the supported size.');
     const emphasis=await originalPageEmphasis(call,p,slide.page);
     current=(await call('save_source_visual',{courseId:state.courseId,revision:current.revision,sourceId:source.id,page:slide.page,assetId:source.originalFile.id,dataUrl,emphasis})).state;
    }catch(e){failures.push({sourceId:source.id,page:slide.page,reason:e.message});current=(await call('read_course_state',{courseId:state.courseId})).state;}
   }
  }catch(e){failures.push({sourceId:source.id,reason:e.message});}
 }
 return {state:(await call('read_course_state',{courseId:state.courseId})).state,failures};
}
