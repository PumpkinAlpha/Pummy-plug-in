const tabs=new Set(['library','dashboard','course','tutor','progress','history','custom','exam-setup','exam']);
export function validView(view){return !!view&&tabs.has(view.tab)&&(view.courseId===null||typeof view.courseId==='string')&&(view.presentationId==null||typeof view.presentationId==='string');}
const signature=view=>JSON.stringify(view);
// Store only navigation, never answers, source text or editable objects, in browser history.
export function createViewHistory(win,{apply,guard=async()=>{},onError=()=>{},onChange=()=>{}}){
 let current=null,index=Number.isInteger(win.history.state?.pummyView?.index)?win.history.state.pummyView.index:0,restoring=null,skip=false,started=false,working=false;
 const write=(view,replace)=>win.history[replace?'replaceState':'pushState']({...win.history.state,pummyView:{view,index}},'');
 function record(view){if(!validView(view))return;if(restoring){if(signature(view)===signature(restoring)){current=view;restoring=null;}return;}if(current&&signature(current)===signature(view))return;
  // Selecting another slide updates this page, rather than adding another Back step.
  if(current){const {slide:oldSlide,...before}=current,{slide:newSlide,...after}=view;if(signature(before)===signature(after)){current=view;write(view,true);return;}}
  if(!started){started=true;current=view;write(view,true);}else{index++;current=view;write(view,false);}onChange(index>0);}
 async function pop(event){
  if(skip){skip=false;return;}const target=event.state?.pummyView;if(!target||!validView(target.view)||!Number.isInteger(target.index))return;
  const previous=index;if(working){skip=true;win.history.go(previous-target.index);return;}working=true;
  try{await guard();restoring=target.view;await apply(target.view);index=target.index;current=target.view;onChange(index>0);}
  catch(e){restoring=null;skip=true;win.history.go(previous-target.index);onError(e);}
  finally{working=false;}
 }
 win.addEventListener('popstate',pop);
 return {record,back(fallback){if(index>0)win.history.back();else fallback?.();},dispose:()=>win.removeEventListener('popstate',pop)};
}
