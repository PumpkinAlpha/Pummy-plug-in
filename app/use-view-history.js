import {useEffect,useRef,useState} from 'react';
import {createViewHistory} from './view-history.js';
export function useViewHistory(view,{ready,apply,guard,onError}){
 const handlers=useRef({apply,guard,onError});handlers.current={apply,guard,onError};const controller=useRef(null),[canBack,setCanBack]=useState(false);
 useEffect(()=>{controller.current=createViewHistory(window,{apply:view=>handlers.current.apply(view),guard:()=>handlers.current.guard(),onError:e=>handlers.current.onError(e),onChange:setCanBack});return()=>controller.current.dispose();},[]);
 useEffect(()=>{if(ready)controller.current?.record(view);},[ready,JSON.stringify(view)]);
 return {canBack,back:fallback=>controller.current?.back(fallback)};
}
