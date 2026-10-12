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
 if(!response.ok){
  const detail=(await response.text()).slice(0,500);
  if(response.status===503)throw new Error('The slide converter is busy. Try again shortly.');
  if(detail.startsWith('Slide conversion is unavailable.'))throw new Error('PowerPoint files must be rendered to PDF before their slides can open. This preview server does not have LibreOffice installed, so it cannot convert this file automatically. Choose an exported slide PDF to continue.');
  if(detail.startsWith('Slide conversion timed out.'))throw new Error(detail);
  throw new Error('Could not generate the slide PDF. The file may be unsupported or damaged. Try an exported PDF from PowerPoint.');
 }
 const reader=response.body?.getReader(),chunks=[];let size=0;if(!reader)throw new Error('The slide converter returned an empty PDF.');
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;chunks.push(value);}
 const result=new Uint8Array(size);let offset=0;for(const c of chunks){result.set(c,offset);offset+=c.length;}return result;
}
