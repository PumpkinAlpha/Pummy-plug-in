// Standard keyboard navigation for a tablist with one selected, tabbable tab.
export function navigateTabs(event){
 if(event.altKey||event.ctrlKey||event.metaKey)return;
 const tabs=[...event.currentTarget.querySelectorAll('[role=tab]:not(:disabled)')],index=tabs.indexOf(event.target);
 if(index<0)return;
 const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
 if(next===null)return;event.preventDefault();tabs[next].focus();tabs[next].click();
}
