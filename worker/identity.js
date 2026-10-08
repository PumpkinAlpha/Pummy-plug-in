// These headers are provided by Sites dispatch, never by tool arguments.
export function connectedProfile(request){
 let name=request.headers.get('oai-authenticated-user-full-name')||'';
 if(request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8')try{name=decodeURIComponent(name);}catch{name='';}
 return {name:name.trim().slice(0,200)||'Connected ChatGPT account',email:(request.headers.get('oai-authenticated-user-email')||'').slice(0,320)};
}
