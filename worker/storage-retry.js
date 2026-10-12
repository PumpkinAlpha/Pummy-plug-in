const delays=[250,750,1750];
export function temporaryStorageError(error){
 const status=Number(error?.status||error?.statusCode);
 return [429,500,502,503,504].includes(status)||Number(error?.code)===10001||/\b10001\b|\binternal (?:server )?error\b|\bservice unavailable\b|\btimed? ?out\b|\bconnection reset\b/i.test(error?.message||'');
}
export async function retryStorage(operation,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 for(let attempt=0;;attempt++)try{return await operation();}catch(error){
  if(!temporaryStorageError(error))throw error;
  if(attempt===delays.length)throw Object.assign(new Error('File storage is temporarily unavailable. Completed upload chunks are kept. Retry this upload shortly.',{cause:error}),{code:'storage_unavailable'});
  await wait(delays[attempt]);
 }
}
