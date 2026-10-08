export const DEFAULT_CUSTOM_THEME={background:'#070d1a',surface:'#0d1526',text:'#e8eefa',accent:'#3b82f6'};
const valid=(value,fallback)=>/^#[\da-f]{6}$/i.test(value||'')?value:fallback;
const rgb=color=>color.slice(1).match(/../g).map(v=>parseInt(v,16));
const hex=values=>'#'+values.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const mix=(a,b,ratio)=>hex(rgb(a).map((v,i)=>v*(1-ratio)+rgb(b)[i]*ratio));
const luminance=color=>rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
export const contrast=(a,b)=>{const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);};
export const onColor=color=>contrast(color,'#ffffff')>=contrast(color,'#101010')?'#ffffff':'#101010';
export function customTheme(value){
 const c=Object.fromEntries(Object.entries(DEFAULT_CUSTOM_THEME).map(([key,fallback])=>[key,valid(value?.[key],fallback)]));
 // Keep text readable even when the user chooses similar foreground and surface colors.
 const text=contrast(c.text,c.surface)>=4.5&&contrast(c.text,c.background)>=4.5?c.text:onColor(c.surface);
 let background=c.background;for(let i=0;i<30&&contrast(text,background)<4.5;i++)background=mix(background,c.surface,.2);
 const light=onColor(c.surface)==='#101010';
 let accent=c.accent;for(let i=0;i<20&&contrast(accent,c.surface)<4.5;i++)accent=mix(accent,onColor(c.surface),.12);
 return {colors:c,scheme:light?'light':'dark',variables:{'--bg':background,'--panel':c.surface,'--sunk':mix(c.surface,background,.5),'--raised':mix(c.surface,text,.07),'--ink':text,'--muted':mix(c.surface,text,.72),'--faint':mix(c.surface,text,.65),'--line':mix(c.surface,text,.18),'--line-2':mix(c.surface,text,.32),'--accent':accent,'--accent-soft':mix(c.surface,c.accent,.14),'--primary':c.accent,'--on-primary':onColor(c.accent),'--on-accent':onColor(accent),'--good':light?'#08753f':'#3dff9a','--bad':light?'#a43614':'#fb7185','--brand':accent,'--on-brand':onColor(accent),'--on-good':light?'#ffffff':'#07151b','--on-bad':light?'#ffffff':'#1a070b'}};
}
export function applyTheme(root,theme,value){
 const custom=customTheme(value);root.dataset.theme=['navy','warm','light','custom'].includes(theme)?theme:'navy';
 for(const name of Object.keys(custom.variables))root.style.removeProperty(name);
 root.style.removeProperty('color-scheme');
 if(theme==='custom'){for(const [name,color] of Object.entries(custom.variables))root.style.setProperty(name,color);root.style.setProperty('color-scheme',custom.scheme);}
}
