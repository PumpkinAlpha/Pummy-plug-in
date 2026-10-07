export const hasLoaded=data=>!!(data?.state||Array.isArray(data?.courses));

// Entrypoint launches may have no initial tool-result notification. Use only
// authorized read-only data tools, never a direct-network fallback from an app.
export function loadOnMount(read,getData,onError,{delay=1200,timeout=15000}={}){
 let active=true;
 const report=e=>{if(active&&!hasLoaded(getData()))onError(e.message||'Could not load your courses. Use Refresh to retry.');};
 const load=setTimeout(()=>{if(!hasLoaded(getData()))Promise.resolve().then(read).catch(report);},delay);
 const deadline=setTimeout(()=>report(new Error('Pummy could not finish loading. Use Refresh to retry, or close and reopen the panel. Your progress is saved.')),timeout);
 return()=>{active=false;clearTimeout(load);clearTimeout(deadline);};
}
