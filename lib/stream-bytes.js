// Bound both declared and streamed sizes before allocating a contiguous buffer.
export async function boundedBytes(message,limit,label='File'){
 const tooLarge=()=>Object.assign(new Error(`${label} exceeds ${Math.floor(limit/1024/1024)} MB. Use a smaller file or an exported PDF.`),{status:413});
 if(Number(message.headers.get('content-length'))>limit){await message.body?.cancel().catch(()=>{});throw tooLarge();}
 const reader=message.body?.getReader();if(!reader)return new Uint8Array();
 const chunks=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel().catch(()=>{});throw tooLarge();}chunks.push(value);}}
 finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
