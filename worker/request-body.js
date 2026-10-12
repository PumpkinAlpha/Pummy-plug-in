export const MAX_REQUEST_BYTES=1500000;
const tooLarge=()=>Object.assign(new Error('The request is too large. Import fewer questions or references at a time.'),{status:413,rpcCode:-32600});

// Check streamed bytes before decoding or parsing, including requests without
// Content-Length. Reading a clone would retain an unbounded tee of the body.
export async function readJsonRequest(request){
 if(Number(request.headers.get('content-length'))>MAX_REQUEST_BYTES){await request.body?.cancel();throw tooLarge();}
 const reader=request.body?.getReader(),parts=[];let size=0;
 if(reader)try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_REQUEST_BYTES){await reader.cancel();throw tooLarge();}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
 let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(new Error('The request must contain valid JSON.'),{status:400,rpcCode:-32700});}
 return {body,request:new Request(request,{body:bytes})};
}
