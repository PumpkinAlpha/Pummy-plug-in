import React,{useEffect,useRef,useState} from 'react';
import {PummyMark} from './dashboard.jsx';
import {Icon} from './icons.jsx';

export function AppHeader({state,courses=[],busy,onHome,onOpenCourse,onTab,onSettings,onToggleSidebar,sidebarOpen,exam,saveStatus,onBack,canBack,autoHide=false}){
 const [contextOpen,setContextOpen]=useState(false),[revealed,setRevealed]=useState(false),[hovered,setHovered]=useState(false),hideTimer=useRef(null);
 const show=()=>{clearTimeout(hideTimer.current);setHovered(true);};
 const hide=()=>{clearTimeout(hideTimer.current);hideTimer.current=setTimeout(()=>setHovered(false),400);};
 useEffect(()=>()=>clearTimeout(hideTimer.current),[]);
 useEffect(()=>setRevealed(false),[autoHide]);
 useEffect(()=>{if(!autoHide||!revealed)return;const esc=e=>{if(e.key==='Escape'){setRevealed(false);setHovered(false);}};document.addEventListener('keydown',esc);return()=>document.removeEventListener('keydown',esc);},[autoHide,revealed]);
 useEffect(()=>setContextOpen(false),[state?.courseId]);
 useEffect(()=>{if(!contextOpen)return;const close=event=>{if(event.key==='Escape'||(event.type==='pointerdown'&&!event.target.closest('[data-course-context]')))setContextOpen(false);};document.addEventListener('keydown',close);document.addEventListener('pointerdown',close);return()=>{document.removeEventListener('keydown',close);document.removeEventListener('pointerdown',close);};},[contextOpen]);
 return <header className={'topbar app-topbar'+(!state?' is-home':'')+(autoHide?' auto-hidden':'')+(revealed||contextOpen||hovered?' is-revealed':'')} onPointerEnter={show} onPointerLeave={hide} onFocusCapture={show} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))hide();}}>
  {autoHide&&<button className="header-peek" aria-label={revealed||hovered?'Hide navigation':'Show navigation'} aria-expanded={revealed||hovered} onClick={()=>{if(revealed||hovered){clearTimeout(hideTimer.current);setHovered(false);setRevealed(false);setContextOpen(false);}else setRevealed(true);}}><Icon name="chevronDown" size={14}/></button>}
  <div className="topbar-content">
  <div className="topbar-left">{state&&!exam&&<button className="shell-icon-btn" type="button" aria-label={sidebarOpen?'Close sidebar':'Open sidebar'} aria-expanded={sidebarOpen} onClick={onToggleSidebar}><Icon name="menu" size={22}/></button>}{canBack&&<button className="shell-icon-btn" aria-label="Back" title="Previous page" onClick={onBack}><Icon name="chevronLeft" size={20}/></button>}{state&&<>
   <button className="brand" onClick={onHome} aria-label="Pummy.Ai home"><PummyMark/><span>Pummy.Ai</span></button>
   <div className="context-menu" data-course-context><button className="course-crumb" type="button" aria-haspopup="menu" aria-expanded={contextOpen} onClick={()=>setContextOpen(!contextOpen)}><span>{state.name}</span>{exam&&<><span className="context-sep">/</span><span>Exam</span></>}<Icon name="chevronDown" size={17}/></button>
    {contextOpen&&<div className="context-pop" role="menu"><div className="context-heading">{state.name}</div><button role="menuitem" onClick={()=>{onTab('dashboard');setContextOpen(false);}}><Icon name="folder" size={17}/>Course overview</button><button role="menuitem" onClick={()=>{onTab('exam-setup');setContextOpen(false);}}><Icon name="exam" size={17}/>Adaptive exam</button><button role="menuitem" onClick={()=>{onTab('tutor');setContextOpen(false);}}><Icon name="powerpoint" size={17}/>Interactive Tutor</button><button role="menuitem" onClick={()=>{onTab('course');setContextOpen(false);}}><Icon name="library" size={17}/>Course & sources</button>{courses.filter(c=>c.id!==state.courseId).length>0&&<><hr/><div className="context-heading">Switch course</div>{courses.filter(c=>c.id!==state.courseId).map(c=><button key={c.id} role="menuitem" onClick={()=>{onOpenCourse(c.id);setContextOpen(false);}}><Icon name="folder" size={17}/>{c.name}</button>)}</>}</div>}
   </div>
  </>}</div>
  <div className="header-actions"><span className={"save-indicator"+(busy?" working":"")} role="status" title={saveStatus||(busy?'Working':'Saved')}><span className="save-label">{saveStatus||(busy?'Working':'Saved')}</span></span><button className="shell-icon-btn" aria-label="Display settings" onClick={onSettings}><Icon name="gear" size={21}/></button></div>
  </div>
 </header>;
}

export function AppSidebar({autoHide=false,courses=[],state,tab,folder,onOpenCourse,onTab,onNewCourse}){
 const tabs=[['tutor','powerpoint','Interactive Tutor'],['exam-setup','exam','Adaptive exam'],['custom','target','Custom tests'],['course','library','Course & sources'],['progress','reports','Progress'],['history','list','Exam history']];
 return <nav className={"app-sidebar"+(autoHide?" is-auto":"")} aria-label="Main navigation"><div className="nav-section">Courses</div><ul className="nav-list nav-courses">{courses.map(c=><li key={c.id}><button className={'nav-item'+(c.id===state?.courseId?' active':'')} aria-current={c.id===state?.courseId&&tab==='dashboard'?'page':undefined} onClick={()=>c.id===state?.courseId?onTab('dashboard'):onOpenCourse(c.id)}><Icon name="folder" size={20}/><span>{c.name}</span></button></li>)}{!courses.length&&state&&<li><button className="nav-item active" aria-current={tab==='dashboard'?'page':undefined} onClick={()=>onTab('dashboard')}><Icon name="folder" size={20}/><span>{state.name}</span></button></li>}<li><button className="nav-item" onClick={onNewCourse}><Icon name="plusCircle" size={20}/><span>New class</span></button></li></ul>{state&&<><div className="nav-section nav-current-location"><span>{state.name}</span>{folder&&<strong>{state.folderNames?.[`${folder.kind}:${folder.label}`]||folder.displayName||folder.label}</strong>}</div><ul className="nav-list">{tabs.map(([id,icon,label])=><li key={id}><button className={'nav-item'+(tab===id?' active':'')} aria-current={tab===id?'page':undefined} onClick={()=>onTab(id)}><Icon name={icon} size={20}/><span>{label}</span></button></li>)}</ul></>}</nav>;
}
