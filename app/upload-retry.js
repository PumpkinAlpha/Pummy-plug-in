export const isUploadConnectionError=error=>/\bconnection\b.*\b(failed|closed|lost|reset)\b|\bdisconnected\b|\bECONNRESET\b/i.test(error?.message||'');
const isTransient=error=>isUploadConnectionError(error)||/timeout|timed out|network|fetch|temporar|storage|interrupted|unavailable|502|503|504|10001/i.test(error?.message||'');

// Use only for reads or writes with immutable IDs/durable retry receipts.
// A lost response must repeat the exact request, including its revision and IDs.
export async function retryUploadOperation(operation,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 for(let attempt=0;;attempt++){
  try{return await operation();}
  catch(error){if(attempt>=2||!isTransient(error))throw error;await wait(250*(attempt+1));}
 }
}
