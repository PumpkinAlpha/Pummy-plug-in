import CFB from 'cfb';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const record=(type,body,version=0,instance=0)=>{const header=Buffer.alloc(8);header.writeUInt16LE((instance<<4)|version,0);header.writeUInt16LE(type,2);header.writeUInt32LE(body.length,4);return Buffer.concat([header,body]);};
const text=value=>record(4000,Buffer.from(value,'utf16le'));
const slide=value=>record(1006,record(0xf00d,text(value)),15);
const list=items=>record(4080,Buffer.concat(items.flatMap(([ref,id,value])=>[record(1011,Buffer.concat([u32(ref),u32(0),u32(1),u32(id),u32(0)])),text(value)])),15);
const document=items=>record(1000,list(items),15);
const persist=entries=>record(6002,Buffer.concat(entries.flatMap(([id,offset])=>[u32((1<<20)|id),u32(offset)])));
const edit=(previous,directory)=>record(4085,Buffer.concat([u32(256),u32(0x03000000),u32(previous),u32(directory),u32(1),u32(4),u32(0)]));
export function fixtureLegacyPPT({encrypted=false,macro=false,cycle=false,large=false}={}){
 const parts=[];let length=0;const append=bytes=>{const at=length;parts.push(bytes);length+=bytes.length;return at;};
 const oldDoc=append(document([[2,256,'Stale slide text'],[3,257,'Second slide – β文字é']])),oldFirst=append(slide('Stale shape text')),second=append(slide('Second slide – β文字é'));
 const oldDirectory=append(persist([[1,oldDoc],[2,oldFirst],[3,second]])),oldEdit=append(edit(0,oldDirectory));
 const latestText=large?'Latest professor text '.repeat(250):'Latest professor text';const latestFirst=append(slide(latestText)),latestDoc=append(document([[3,257,'Second slide – β文字é'],[2,256,latestText]]));
 const directory=append(persist([[1,latestDoc],[2,latestFirst]])),latestEdit=append(edit(cycle?length:oldEdit,directory));
 const current=record(4086,Buffer.concat([u32(20),u32(encrypted?0xf3d1c4df:0xe391c05f),u32(latestEdit),Buffer.alloc(12)]));
 const container=CFB.utils.cfb_new();CFB.utils.cfb_add(container,'PowerPoint Document',Buffer.concat(parts));CFB.utils.cfb_add(container,'Current User',current);if(macro)CFB.utils.cfb_add(container,macro==='storage'?'Macros':'VBA/Module1',Buffer.from('untrusted macro'));return new Uint8Array(CFB.write(container,{type:'buffer'}));
}
