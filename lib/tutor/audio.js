import {unzipSync,strFromU8} from 'fflate';
import {parseXml} from './presentations.js';
const all=(node,name)=>Array.from(node?.getElementsByTagNameNS('*',name)||[]);
const types={mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',mp4:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg',oga:'audio/ogg',flac:'audio/flac',wma:'audio/x-ms-wma',aif:'audio/aiff',aiff:'audio/aiff',mid:'audio/midi',midi:'audio/midi'};
function unpack(bytes,include){let total=0;return unzipSync(bytes,{filter:e=>{if(!include(e.name))return false;total+=e.originalSize;if(total>100*1024*1024||(/\.xml$|\.rels$/.test(e.name)&&e.originalSize>8*1024*1024))throw new Error('Expanded presentation is too large.');return include(e.name);}});}
function target(base,path){if(/^[a-z]+:|^[/\\]/i.test(path))return null;const parts=base.split('/').slice(0,-1);for(const p of path.split('/')){if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p);}return parts.join('/');}
export function audioManifest(bytes){
 const files=unpack(bytes,name=>/\.xml$|\.rels$/.test(name)),read=path=>files[path]?parseXml(strFromU8(files[path])):null,p=read('ppt/presentation.xml');if(!p)throw new Error('Missing PowerPoint presentation.');
 const relationships=all(read('ppt/_rels/presentation.xml.rels'),'Relationship'),slides=new Map(relationships.filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),target('ppt/presentation.xml',r.getAttribute('Target'))]));
 return all(p,'sldId').map(s=>{
  const path=slides.get(s.getAttribute('r:id'));if(!path||!/^ppt\/slides\/slide\d+\.xml$/.test(path))throw new Error('Invalid slide relationship.');const doc=read(path),rels=read(path.replace(/([^/]+)$/,'_rels/$1.rels'));if(!doc||!rels)return [];
  const refs=new Map(all(rels,'Relationship').map(r=>[r.getAttribute('Id'),r])),audioIds=new Set([...all(doc,'audioFile'),...all(doc,'wavAudioFile'),...all(doc,'snd')].map(n=>n.getAttribute('r:embed')||n.getAttribute('r:link')).filter(Boolean)),ids=new Set([...audioIds,...all(doc,'media').map(n=>n.getAttribute('r:embed')||n.getAttribute('r:link')).filter(Boolean)]);
  const result=[],seen=new Set();for(const id of ids){const r=refs.get(id);if(!r)continue;if(r.getAttribute('TargetMode')==='External'){if(/\/audio$/.test(r.getAttribute('Type')))result.push({external:true,name:'Linked slide audio'});continue;}
   const file=target(path,r.getAttribute('Target')),ext=file?.split('.').pop().toLowerCase(),type=types[ext];if(!file?.startsWith('ppt/media/')||!type||seen.has(file)||ext==='mp4'&&!audioIds.has(id))continue;seen.add(file);result.push({path:file,type,name:file.split('/').pop().slice(0,120)});
  }return result;
 });
}
export function slideAudio(bytes,manifest,page){const tracks=manifest[page-1]||[],files=unpack(bytes,name=>tracks.some(t=>t.path===name));return tracks.map(t=>t.external?t:{...t,bytes:files[t.path]||null});}
