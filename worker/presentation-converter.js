import {MAX_ASSET} from '../lib/tutor/presentations.js';
export const presentationMime={ppt:'application/vnd.ms-powerpoint',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',pdf:'application/pdf'};
export function configuredConverter(env){
 if(env.PRESENTATION_CONVERTER)return env.PRESENTATION_CONVERTER;
 if(!env.PRESENTATION_CONVERTER_URL||!env.PRESENTATION_CONVERTER_TOKEN)return null;
 // A conversion configuration error must never block unrelated course or exam operations.
 return {fetch:async request=>{const url=new URL(env.PRESENTATION_CONVERTER_URL);if(url.protocol!=='https:')throw new Error('The slide converter must use HTTPS.');return fetch(url,{method:'POST',body:request.body,headers:{'Content-Type':request.headers.get('content-type'),Authorization:'Bearer '+env.PRESENTATION_CONVERTER_TOKEN},signal:AbortSignal.timeout(120000),redirect:'error'});}};
}
export async function convertBytes(converter,kind,bytes){
 if(!converter)throw new Error('Automatic PDF conversion is not configured on this server. Use an exported PDF or ask the administrator to enable the slide converter.');
 const response=await converter.fetch(new Request('https://presentation-converter/convert',{method:'POST',headers:{'Content-Type':presentationMime[kind]},body:bytes}));
 if(!response.ok)throw new Error(response.status===503?'The slide converter is busy. Try again shortly.':'Could not generate the slide PDF. Try again or use a PDF exported from PowerPoint.');
 const reader=response.body?.getReader(),chunks=[];let size=0;if(!reader)throw new Error('The slide converter returned an empty PDF.');
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX_ASSET){await reader.cancel();throw new Error('Generated PDF is too large. Split the presentation.');}chunks.push(value);}
 const result=new Uint8Array(size);let offset=0;for(const c of chunks){result.set(c,offset);offset+=c.length;}return result;
}
