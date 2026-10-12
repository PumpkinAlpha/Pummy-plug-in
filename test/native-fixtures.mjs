import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {fixturePPTX} from './tutor-fixtures.mjs';
import {readFileSync} from 'node:fs';
// Valid positioned DrawingML with text, a diagram, and an embedded raster image.
export function nativePPTX(){
 const files=unzipSync(fixturePPTX());
 for(const page of [7,2]){
  const path=`ppt/slides/slide${page}.xml`;
  let slide=strFromU8(files[path]).replace('</p:nvSpPr><p:txBody>','</p:nvSpPr><p:spPr><a:xfrm><a:off x="380000" y="300000"/><a:ext cx="7200000" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>').replace('<a:r><a:t>','<a:r><a:rPr sz="2200"/><a:t>');
  const diagram='<p:sp><p:nvSpPr><p:cNvPr id="3" name="Diagram"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="1400000" y="1800000"/><a:ext cx="1800000" cy="1800000"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="3366CC"/></a:solidFill></p:spPr></p:sp>';
  const picture='<p:pic><p:nvPicPr><p:cNvPr id="4" name="Embedded logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="image1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="5000000" y="1800000"/><a:ext cx="1800000" cy="1800000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
  slide=slide.replace('xmlns:a=','xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a=').replace('</p:spTree>',diagram+picture+'</p:spTree>');files[path]=strToU8(slide);
  const relPath=`ppt/slides/_rels/slide${page}.xml.rels`,rels=files[relPath]?strFromU8(files[relPath]):'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  files[relPath]=strToU8(rels.replace('</Relationships>','<Relationship Id="image1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/></Relationships>'));
 }
 files['ppt/media/logo.png']=new Uint8Array(readFileSync(new URL('../app/pummy-logo.png',import.meta.url)));
 return zipSync(files);
}
