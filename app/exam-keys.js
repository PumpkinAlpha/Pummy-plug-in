export function feedbackAdvanceKey(event){
 return !event.repeat&&!event.defaultPrevented&&!event.isComposing&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&
  !['Tab','Escape','Shift','Control','Alt','Meta','CapsLock','NumLock','ScrollLock','Dead','Unidentified'].includes(event.key)&&!/^F\d+$/.test(event.key)&&
  !event.target?.isContentEditable&&!event.target?.closest?.('input,textarea,select,button,a,summary,dialog,[role=dialog],[role=button],[role=link],audio,video');
}
